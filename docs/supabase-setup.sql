-- Whisker Walk — one-time database setup for a NEW Supabase project.
-- Paste this whole file into Supabase → SQL Editor → New query → Run, then
-- run docs/supabase-colony.sql. Safe to re-run (idempotent).
--
-- This is the v7 "Always Online" schema with the v7 secret fix and the v8
-- hardening already in it: the functions below are the same, word for word,
-- as docs/supabase-v8-hardening.sql's, and profiles/friendships are NOT
-- readable with the public key (v8's STEP B). A fresh setup is therefore
-- safe on its own; docs/supabase-v7-secret-fix.sql is not needed.
--
-- THE LIVE DATABASE: don't re-run this file there to upgrade it. Run
-- docs/supabase-v8-hardening.sql instead — it keeps the old public reads
-- until every device has the new game (STEP B), and this file doesn't.

-- ── Tables ────────────────────────────────────────────────────────────

create table if not exists public.saves (
  code text primary key,
  secret text not null,
  payload jsonb not null,
  lifetime integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  player_id text primary key,
  secret text not null,
  pet_name text not null,
  breed text not null,
  accessories jsonb not null default '{}'::jsonb,
  rank_title text not null default 'House Cat',
  last_seen timestamptz not null default now()
);

create table if not exists public.friendships (
  pair text primary key,          -- least(a,b) || ':' || greatest(a,b)
  a_id text not null,
  b_id text not null,
  greets integer not null default 0,
  last_walk text,
  updated_at timestamptz not null default now()
);

create index if not exists friendships_a_idx on public.friendships (a_id);
create index if not exists friendships_b_idx on public.friendships (b_id);

-- Event counts per time window, for the global limits in the functions
-- below (see docs/supabase-v8-hardening.sql, section 1, for why global).
create table if not exists public.ww_rate (
  name text not null,
  bucket timestamptz not null,
  hits integer not null default 0,
  primary key (name, bucket)
);

-- ── Row-level security: no direct reads or writes at all ──────────────
-- RLS on with NO policies means the public key sees zero rows; the revokes
-- remove the table grants Supabase gives new tables by default. Everything
-- goes through the SECURITY DEFINER functions below. (v7 had public read
-- policies on profiles and friendships; v8 removed them.)

alter table public.saves enable row level security;
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.ww_rate enable row level security;

drop policy if exists profiles_public_read on public.profiles;
drop policy if exists friendships_public_read on public.friendships;

revoke all on public.saves from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
revoke all on public.ww_rate from anon, authenticated;

-- ── Internal helpers (not callable by clients) ────────────────────────

create or replace function public.ww_rate_hit(p_name text, p_window_secs integer, p_max integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);
  v_hits integer;
begin
  insert into ww_rate as r (name, bucket, hits) values (p_name, v_bucket, 1)
  on conflict (name, bucket) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  if v_hits = 1 then
    delete from ww_rate r where r.name = p_name and r.bucket < v_bucket;
  end if;
  return v_hits <= p_max;
end $$;

create or replace function public.ww_rate_over(p_name text, p_window_secs integer, p_max integer)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select r.hits >= p_max from ww_rate r
                    where r.name = p_name
                      and r.bucket = to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs)),
                  false);
$$;

revoke execute on function public.ww_rate_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.ww_rate_over(text, integer, integer) from public, anon, authenticated;

-- ── RPCs (SECURITY DEFINER; the secret/code is the capability) ────────
-- Why each check is there, and the save size arithmetic: see the matching
-- section of docs/supabase-v8-hardening.sql.

create or replace function public.upsert_save(
  p_code text, p_secret text, p_payload jsonb, p_lifetime integer
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_lifetime is null then
    return 'bad';
  end if;
  if octet_length(p_payload::text) > 2097152 then return 'too-big'; end if;
  select * into existing from saves where code = p_code;
  if not found then
    if p_code is null or p_code !~ '^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-[0-9]{2}$'
       or p_secret is null or length(p_secret) < 16 or length(p_secret) > 128
       or p_lifetime < 0 then
      return 'bad';
    end if;
    if pg_total_relation_size('public.saves') > 300 * 1024 * 1024 then return 'busy'; end if;
    if not ww_rate_hit('new-save', 3600, 30) then return 'busy'; end if;
    insert into saves (code, secret, payload, lifetime)
      values (p_code, p_secret, p_payload, p_lifetime);
    return 'created';
  end if;
  if existing.secret is distinct from p_secret then return 'denied'; end if;
  if p_lifetime < existing.lifetime then return 'stale'; end if;
  update saves set payload = p_payload, lifetime = p_lifetime, updated_at = now()
    where code = p_code;
  return 'updated';
end $$;

create or replace function public.load_save(p_code text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record;
begin
  if p_code is null or length(p_code) > 64 then return null; end if;
  if ww_rate_over('load-miss', 600, 100) then return null; end if;
  select * into existing from saves where code = p_code;
  if not found then
    perform ww_rate_hit('load-miss', 600, 100);
    return null;
  end if;
  -- loading on a NEW device: the code alone grants read; the stored
  -- secret is returned so the new device can write future syncs
  return jsonb_build_object('payload', existing.payload,
                            'secret', existing.secret,
                            'lifetime', existing.lifetime);
end $$;

create or replace function public.upsert_profile(
  p_player_id text, p_secret text, p_pet_name text, p_breed text,
  p_accessories jsonb, p_rank_title text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record; v_new boolean;
begin
  select * into existing from profiles where player_id = p_player_id;
  v_new := not found;
  if not v_new and existing.secret is distinct from p_secret then
    return 'denied';
  end if;
  -- every "is null" comes first in its line, so a NULL can't slip through
  if p_pet_name is null or p_pet_name !~ '^[A-Za-z][A-Za-z -]{1,15}$'
     or p_breed is null or p_breed !~ '^[a-z][a-z0-9]{0,23}$'
     or p_rank_title is null or p_rank_title !~ '^[A-Za-z][A-Za-z ]{0,31}$'
     or p_accessories is null or jsonb_typeof(p_accessories) <> 'object'
     or octet_length(p_accessories::text) > 4096 then
    return 'bad';
  end if;
  if v_new then
    if p_player_id is null
       or p_player_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or p_secret is null or length(p_secret) < 16 or length(p_secret) > 128 then
      return 'bad';
    end if;
    if not ww_rate_hit('new-profile', 3600, 60) then return 'busy'; end if;
  end if;
  insert into profiles (player_id, secret, pet_name, breed, accessories, rank_title, last_seen)
    values (p_player_id, p_secret, p_pet_name, p_breed, p_accessories, p_rank_title, now())
  on conflict (player_id) do update
    set pet_name = excluded.pet_name, breed = excluded.breed,
        accessories = excluded.accessories, rank_title = excluded.rank_title,
        last_seen = now()
    where profiles.secret = excluded.secret;
  return 'ok';
end $$;

create or replace function public.record_friend_greet(
  p_my_id text, p_my_secret text, p_other_id text, p_walk text
) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; pr text; existing record; result integer;
begin
  select * into me from profiles where player_id = p_my_id;
  if not found or me.secret is distinct from p_my_secret then return -1; end if;
  if p_other_id is null or p_other_id = p_my_id
     or not exists (select 1 from profiles o where o.player_id = p_other_id)
     or p_walk is null or length(p_walk) > 64 then
    return -1;
  end if;
  pr := least(p_my_id, p_other_id) || ':' || greatest(p_my_id, p_other_id);
  select * into existing from friendships where pair = pr;
  if existing is not null and existing.last_walk = p_walk then
    return existing.greets;  -- one greet per pair per walk
  end if;
  insert into friendships (pair, a_id, b_id, greets, last_walk)
    values (pr, least(p_my_id, p_other_id), greatest(p_my_id, p_other_id), 1, p_walk)
  on conflict (pair) do update
    set greets = friendships.greets + 1, last_walk = p_walk, updated_at = now();
  select greets into result from friendships where pair = pr;
  return result;
end $$;

-- The only read paths for profiles and friendships.

create or replace function public.profiles_by_ids(p_ids text[])
returns table (player_id text, pet_name text, breed text, accessories jsonb, rank_title text, last_seen timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select pr.player_id, pr.pet_name, pr.breed, pr.accessories, pr.rank_title, pr.last_seen
    from profiles pr
   where cardinality(p_ids) <= 100 and pr.player_id = any (p_ids);
$$;

create or replace function public.find_by_friend_code(p_code text)
returns table (player_id text, pet_name text, breed text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text := lower(btrim(left(coalesce(p_code, ''), 64)));
begin
  if v_code !~ '^[0-9a-f]{8}$' then return; end if;
  if ww_rate_over('friend-miss', 600, 100) then return; end if;
  return query
    select pr.player_id, pr.pet_name, pr.breed from profiles pr
     where left(pr.player_id, 8) = v_code
     limit 5;
  if not found then
    perform ww_rate_hit('friend-miss', 600, 100);
  end if;
end $$;

create or replace function public.friendships_of(p_player_id text, p_secret text)
returns table (pair text, a_id text, b_id text, greets integer, last_walk text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  -- NULL-safe: a NULL secret makes the comparison NULL, so not exists is true
  if not exists (select 1 from profiles pr where pr.player_id = p_player_id and pr.secret = p_secret) then
    return;
  end if;
  return query
    select f.pair, f.a_id, f.b_id, f.greets, f.last_walk, f.updated_at from friendships f
     where f.a_id = p_player_id or f.b_id = p_player_id;
end $$;

grant execute on function public.upsert_save to anon;
grant execute on function public.load_save to anon;
grant execute on function public.upsert_profile to anon;
grant execute on function public.record_friend_greet to anon;
grant execute on function public.profiles_by_ids to anon;
grant execute on function public.find_by_friend_code to anon;
grant execute on function public.friendships_of to anon;

-- Ask the Supabase API to pick up the new functions straight away.
notify pgrst, 'reload schema';
