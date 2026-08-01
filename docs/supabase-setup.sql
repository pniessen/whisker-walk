-- Whisker Walk v7 "Always Online" — one-time database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).

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

-- ── Row-level security: no direct writes; reads only where public ─────

alter table public.saves enable row level security;
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
  for select using (true);

drop policy if exists friendships_public_read on public.friendships;
create policy friendships_public_read on public.friendships
  for select using (true);
-- (saves: no select policy — payload is reachable only via load_save RPC)

-- Hide profile secrets from the public read path
revoke all on public.profiles from anon;
grant select (player_id, pet_name, breed, accessories, rank_title, last_seen)
  on public.profiles to anon;
grant select on public.friendships to anon;

-- ── RPCs (SECURITY DEFINER; the secret/code is the capability) ────────

create or replace function public.upsert_save(
  p_code text, p_secret text, p_payload jsonb, p_lifetime integer
) returns text language plpgsql security definer set search_path = public as $$
declare existing record;
begin
  select * into existing from saves where code = p_code;
  if existing is null then
    insert into saves (code, secret, payload, lifetime)
      values (p_code, p_secret, p_payload, p_lifetime);
    return 'created';
  end if;
  if existing.secret <> p_secret then return 'denied'; end if;
  if p_lifetime < existing.lifetime then return 'stale'; end if;
  update saves set payload = p_payload, lifetime = p_lifetime, updated_at = now()
    where code = p_code;
  return 'updated';
end $$;

create or replace function public.load_save(p_code text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing record;
begin
  select * into existing from saves where code = p_code;
  if existing is null then return null; end if;
  -- loading on a NEW device: the code alone grants read; the stored
  -- secret is returned so the new device can write future syncs
  return jsonb_build_object('payload', existing.payload,
                            'secret', existing.secret,
                            'lifetime', existing.lifetime);
end $$;

create or replace function public.upsert_profile(
  p_player_id text, p_secret text, p_pet_name text, p_breed text,
  p_accessories jsonb, p_rank_title text
) returns text language plpgsql security definer set search_path = public as $$
declare existing record;
begin
  select * into existing from profiles where player_id = p_player_id;
  if existing is not null and existing.secret <> p_secret then
    return 'denied';
  end if;
  insert into profiles (player_id, secret, pet_name, breed, accessories, rank_title, last_seen)
    values (p_player_id, p_secret, p_pet_name, p_breed, p_accessories, p_rank_title, now())
  on conflict (player_id) do update
    set pet_name = excluded.pet_name, breed = excluded.breed,
        accessories = excluded.accessories, rank_title = excluded.rank_title,
        last_seen = now();
  return 'ok';
end $$;

create or replace function public.record_friend_greet(
  p_my_id text, p_my_secret text, p_other_id text, p_walk text
) returns integer language plpgsql security definer set search_path = public as $$
declare me record; pr text; existing record; result integer;
begin
  select * into me from profiles where player_id = p_my_id;
  if me is null or me.secret <> p_my_secret then return -1; end if;
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

grant execute on function public.upsert_save to anon;
grant execute on function public.load_save to anon;
grant execute on function public.upsert_profile to anon;
grant execute on function public.record_friend_greet to anon;
