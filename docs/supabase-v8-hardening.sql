-- Whisker Walk v8 — cloud save hardening.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent), and safe to run BEFORE the new game client is
-- on every device: running the whole file never removes anything an older
-- client uses. The one step that does (STEP B, at the very end) is inside a
-- comment block, so "Run" skips it; you copy it into its own query later.
--
-- Run it after docs/supabase-setup.sql (v7) and docs/supabase-colony.sql on a
-- database that already has them. It already contains the v7 secret fix
-- (docs/supabase-v7-secret-fix.sql), so that file is no longer needed and
-- must NOT be run after this one: it would put back the weaker v7 functions.
-- A brand-new database only needs docs/supabase-setup.sql (which now matches
-- this file, STEP B included) and then docs/supabase-colony.sql.
--
-- What changes, in order (each section below says why and how to undo it):
--   1. a tiny private table + helper that counts events per time window
--   2. upsert_save: NULL secrets refused, a 2 MiB size cap, sane new rows,
--      a cap on new saves per hour and on the saves table's total size
--   3. load_save: a flood of wrong codes pauses lookups for a few minutes
--   4. upsert_profile: names and fields checked like the game checks them,
--      a cap on new profiles per hour
--   5. record_friend_greet: the other player must exist and not be you
--   6. three new read functions, so the game can stop reading the profiles
--      and friendships tables directly
--   7. the saves table loses the direct table grants it never needed
--   STEP B (commented out, run later by hand): profiles and friendships stop
--      being readable by anyone holding the public key.
--
-- Nothing here changes or deletes a row of player data.

-- ── Guard: the v7 setup must already be in place ──────────────────────
-- PL/pgSQL bodies aren't checked when they are created, so without this a
-- missing table would only show up later, as failing saves.
do $$
begin
  if to_regclass('public.saves') is null or to_regclass('public.profiles') is null
     or to_regclass('public.friendships') is null then
    raise exception 'Whisker Walk: the v7 tables are missing. Run docs/supabase-setup.sql first, then run this file again.';
  end if;
end $$;

-- ── 1. Event counter (internal) ───────────────────────────────────────
-- What: a private table of (name, time window, count) and two helpers that
-- the functions below use to say "at most N of these per window".
-- Why: Supabase's free tier gives a database function no trustworthy caller
-- identity (every player uses the same public key, and there is no login),
-- so a per-player limit isn't possible here. These are GLOBAL limits: they
-- can't stop one person from using up the allowance (then everyone waits
-- for the window to pass), but they put a hard ceiling on how fast anyone
-- can guess codes or fill the database. The family's own use is far below
-- every limit.
-- If skipped: sections 2–6 fail when called (they use these helpers).
-- Before the new client? Yes, safe.
-- Rollback: drop function public.ww_rate_hit(text, integer, integer);
--           drop function public.ww_rate_over(text, integer, integer);
--           drop table public.ww_rate;   (only after undoing 2–6)
create table if not exists public.ww_rate (
  name text not null,
  bucket timestamptz not null,
  hits integer not null default 0,
  primary key (name, bucket)
);
alter table public.ww_rate enable row level security;
revoke all on public.ww_rate from anon, authenticated;

-- Counts one event; true while the window is still within p_max. The first
-- event of a new window clears that name's older windows, so the table
-- stays a handful of rows.
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

-- True when this window has already seen p_max events (counts nothing).
create or replace function public.ww_rate_over(p_name text, p_window_secs integer, p_max integer)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select r.hits >= p_max from ww_rate r
                    where r.name = p_name
                      and r.bucket = to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs)),
                  false);
$$;

revoke execute on function public.ww_rate_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.ww_rate_over(text, integer, integer) from public, anon, authenticated;

-- ── 2. upsert_save ────────────────────────────────────────────────────
-- What: the v7 secret fix (a missing secret is refused like a wrong one),
-- plus four new refusals:
--   'too-big' — the save is over 2 MiB. The arithmetic, from what the game
--     really uploads ({save: progression state, album: photos}, see
--     composeCloudPayload in src/game/cloudsync.js):
--       album: at most 24 photos (createAlbum's cap), each a 160×120 JPEG at
--         quality 0.6 as base64 (src/game/photo.js). A typical one is 4–8 KB;
--         pure random noise, the worst a JPEG can be, measured 13 KB. Call it
--         16 KB with its label/key/date: 24 × 16 KB ≈ 384 KB.
--       save state: about 1.3 KB fresh; the growing parts are capped
--         (colony feeds ≤ 320, redeemed codes ≤ 500, grudges ≤ 96, custom
--         cats ≤ 3, …) and come to well under 100 KB even all full.
--       Largest real save ≈ 500 KB, so 2 MiB is 4× that. It even holds the
--       impossible case of 24 uncompressed-PNG photos (24 × 77 KB ≈ 1.85 MB).
--     The game itself stops at 1.75 MiB (src/cloud.js), so it never sends
--     one this refuses, and says so kindly: "too big for the cloud, still
--     safe on this device".
--   'bad' — the payload isn't a JSON object, or a NEW row's code doesn't
--     look like the game's codes (three 4–6 letter words and two digits),
--     or its secret is missing or an odd length (the game's is 72 chars).
--     Existing rows aren't re-checked, so every code ever made keeps working.
--   'busy' — more than 30 new saves in the last hour, or the saves table
--     is over 300 MB (the free tier has 500 MB). Updates to existing saves
--     are never 'busy'; each is capped at 2 MiB and the number of rows is
--     capped by the hourly limit, so they can't fill the database.
-- Why: anyone with the public key can call this; before, one call could
-- store any amount of anything, as often as they liked.
-- If skipped: no size cap, and (if the v7 fix was never run) a NULL secret
-- can overwrite any save whose code is known.
-- Before the new client? Yes. Old clients only ever see 'too-big'/'busy' if
-- a save really is too big or the hourly limit is hit; they then show
-- "Unexpected sync result" instead of the kind message, and nothing is lost.
-- Rollback: re-run docs/supabase-v7-secret-fix.sql (v7 + secret fix).
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

-- ── 3. load_save ──────────────────────────────────────────────────────
-- What: unchanged for a right code, including returning the save's secret
-- (a device that loads a save must be able to keep saving it, and every
-- client today gets that secret from here). New: after 100 wrong codes in
-- 10 minutes (counted across everyone), every lookup answers "no save
-- found" until the 10 minutes are up.
-- Why: a save code is ~1.7 billion possibilities. With no limit a script
-- could try millions a day; with this one it gets ~14,400 a day, so finding
-- even one of a few dozen saves would take decades.
-- Trade-off: someone flooding wrong codes also stops a real "Load from
-- cloud" for up to 10 minutes. Saving is never affected.
-- If skipped: unlimited guessing.
-- Before the new client? Yes; the client already treats null as "No save
-- found for that code".
-- Rollback: run this same function without its first two "if" lines and
-- the "perform ww_rate_hit" line (that is exactly the v7 version).
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

-- ── 4. upsert_profile ─────────────────────────────────────────────────
-- What: the v7 secret fix, plus every field checked the way the game makes
-- it, so a stranger can't put arbitrary text on a child's Friends sheet:
--   pet_name   ^[A-Za-z][A-Za-z -]{1,15}$  — exactly the game's validPetName
--              (src/net.js; its short word blocklist stays in the game)
--   breed      ^[a-z][a-z0-9]{0,23}$       — the game sends a cat id
--              (tabby, d2, mainecoon, …; custom cats send their preset's id)
--   rank_title ^[A-Za-z][A-Za-z ]{0,31}$   — the game's rank titles
--              ("House Cat" … "Neighborhood Legend")
--   accessories a JSON object of at most 4 KB (the game's is ~0.4 KB:
--              seven slot ids, the look, up to two scars, the clan pick)
-- A NEW profile must also have a real player id (a lowercase UUID, which is
-- what crypto.randomUUID makes) and a secret of a sane length, and at most
-- 60 new profiles are made per hour. A wrong field answers 'bad' and stores
-- nothing; the hourly limit answers 'busy'. Two first pushes racing for the
-- same id can no longer let the loser's fields overwrite the winner's.
-- Why: before, any text of any size went straight into a table the other
-- child's game shows.
-- If skipped: profiles accept anything.
-- Before the new client? Yes; the game already only sends values that pass.
-- Check first with the "would fail" query at the end of this file — a
-- profile that fails stops updating (it isn't deleted).
-- Rollback: re-run docs/supabase-v7-secret-fix.sql.
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

-- ── 5. record_friend_greet ────────────────────────────────────────────
-- What: the v7 secret fix, plus: the other player must be a different
-- player who really has a profile, and the walk stamp a short label (the
-- game sends 'walk-<number>' or 'friendcode'). Otherwise -1, which the game
-- already treats as "nothing recorded" (no toast).
-- Why: before, any id at all — made up, or your own — could be greeted,
-- leaving friendship rows pointing at nobody.
-- Note: this doesn't add a consent step. A real player who knows another
-- real player's id can still greet them; the per-device hide list
-- (src/blocklist.js) is still the answer to an unwanted visitor.
-- If skipped: unvalidated greets, as before.
-- Before the new client? Yes. The only change for a real greet: a greet to a
-- co-walk friend whose profile never reached the server (its push failed)
-- is no longer recorded; before, it made a row no screen could show anyway.
-- Rollback: re-run docs/supabase-v7-secret-fix.sql.
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

-- ── 6. Read functions (new) ───────────────────────────────────────────
-- What: three functions that answer exactly what the game asks, so the
-- profiles and friendships tables can stop being readable directly:
--   profiles_by_ids(ids)        public fields of up to 100 given players
--   find_by_friend_code(code)   the player whose friend code is exactly this
--                               8-character code (no prefix search); 100
--                               misses in 10 minutes pause it like load_save
--   friendships_of(id, secret)  my own friendship rows, only with my secret
-- Why: today anyone with the public key can list every profile (cat names
-- children typed) and the whole friendship graph. The new game client uses
-- these and falls back to the old direct reads only while they're missing.
-- If skipped: STEP B can't be run (the game would lose its friends list).
-- Before the new client? Yes; nothing uses them until the client does.
-- Rollback: drop function public.profiles_by_ids(text[]);
--           drop function public.find_by_friend_code(text);
--           drop function public.friendships_of(text, text);
--   (only while STEP B has not been run; the client then falls back)
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

create index if not exists friendships_a_idx on public.friendships (a_id);
create index if not exists friendships_b_idx on public.friendships (b_id);

grant execute on function public.upsert_save to anon;
grant execute on function public.load_save to anon;
grant execute on function public.upsert_profile to anon;
grant execute on function public.record_friend_greet to anon;
grant execute on function public.profiles_by_ids to anon;
grant execute on function public.find_by_friend_code to anon;
grant execute on function public.friendships_of to anon;

-- ── 7. saves: no direct table access ──────────────────────────────────
-- What: removes the table grants Supabase gives every new table by default.
-- Why: belt and braces. Row-level security with no policy already hides
-- every save; this also removes the permission underneath it.
-- If skipped: nothing changes today (RLS still protects it).
-- Before the new client? Yes; no client has ever read saves directly.
-- Rollback: grant select, insert, update, delete on public.saves to anon, authenticated;
revoke all on public.saves from anon, authenticated;

-- Ask the Supabase API to pick up the new functions straight away.
notify pgrst, 'reload schema';

/* ── STEP B — RUN LATER, BY HAND ────────────────────────────────────────
What: profiles and friendships stop being readable with the public key.
After this, the only way to see a cat name is the three functions in
section 6 (and the colony functions, which already check the secret).

WAIT until the new game client is on EVERY device: the web game reloaded
(the service worker can keep an old copy until the page is opened twice),
and the iPhone/iPad apps refreshed. An older client reads these tables
directly, so on an old device the Friends list, friend codes, ghost visits
and the partner's clan pick would quietly come up empty.

To run it: copy the five lines between the markers into a NEW query and Run.
Safe to re-run.

-- >>> STEP B start
drop policy if exists profiles_public_read on public.profiles;
drop policy if exists friendships_public_read on public.friendships;
revoke all on public.profiles from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
notify pgrst, 'reload schema';
-- <<< STEP B end

Rollback (puts back the v7 public reads):
  create policy profiles_public_read on public.profiles for select using (true);
  create policy friendships_public_read on public.friendships for select using (true);
  grant select (player_id, pet_name, breed, accessories, rank_title, last_seen) on public.profiles to anon;
  grant select on public.friendships to anon;
─────────────────────────────────────────────────────────────────────── */

/* ── How to check it worked ─────────────────────────────────────────────
Run these one at a time in a new query. None of them shows a save code, a
secret or a cat name.

1. The secret fix is live (every row should say true):
   select proname, prosrc like '%is distinct from%' from pg_proc
    where proname in ('upsert_save','upsert_profile','record_friend_greet');

2. Every Whisker Walk function runs as its owner with a pinned search_path
   (prosecdef true, proconfig {search_path=public, pg_temp}):
   select proname, prosecdef, proconfig from pg_proc
    where pronamespace = 'public'::regnamespace
      and (proname in ('upsert_save','load_save','upsert_profile','record_friend_greet',
                       'profiles_by_ids','find_by_friend_code','friendships_of',
                       'ww_rate_hit','ww_rate_over') or proname like 'colony%')
    order by proname;

3. The counter helpers are NOT callable by players (both false). The two
   columns are named, because Supabase's SQL editor shows only one of two
   columns that share a name:
   select has_function_privilege('anon', 'public.ww_rate_hit(text,integer,integer)', 'execute') as hit,
          has_function_privilege('anon', 'public.ww_rate_over(text,integer,integer)', 'execute') as over;

4. Before running this file — how big is the biggest save, and how many are
   there? (max_bytes should be far below 2097152):
   select count(*), max(octet_length(payload::text)) as max_bytes from public.saves;

5. Profiles whose fields the new checks would refuse (should be 0; a
   non-zero count means those players' profiles stop updating until their
   game sends good values, nothing is deleted):
   select count(*) from public.profiles
    where pet_name !~ '^[A-Za-z][A-Za-z -]{1,15}$'
       or breed !~ '^[a-z][a-z0-9]{0,23}$'
       or rank_title !~ '^[A-Za-z][A-Za-z ]{0,31}$'
       or jsonb_typeof(accessories) <> 'object'
       or octet_length(accessories::text) > 4096;

6. The limits are counting (rows appear once something has been counted):
   select name, bucket, hits from public.ww_rate order by bucket desc;

7. After STEP B — no public read policy left (should return no rows), and
   anon has no table privilege on profiles/friendships/saves (no rows):
   select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('profiles','friendships');
   select table_name, privilege_type from information_schema.role_table_grants
    where grantee = 'anon' and table_name in ('profiles','friendships','saves');
   select table_name, column_name from information_schema.column_privileges
    where grantee = 'anon' and table_name = 'profiles';

8. The database's size (the free tier allows 500 MB):
   select pg_size_pretty(pg_database_size(current_database())),
          pg_size_pretty(pg_total_relation_size('public.saves'));
─────────────────────────────────────────────────────────────────────── */
