-- Whisker Walk v7 security fix — a NULL secret must never pass the check.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent). Run it after docs/supabase-setup.sql, and run
-- it again if you ever re-run docs/supabase-setup.sql, because that file puts
-- back the old versions of these three functions.
--
-- What was wrong. upsert_save, upsert_profile and record_friend_greet check
-- the caller's secret with `stored_secret <> p_secret`. When the caller sends
-- no secret (NULL), that comparison is NULL rather than true, so the "denied"
-- branch is skipped:
--   * upsert_save: anyone who knows a save code could overwrite that save.
--   * record_friend_greet: anyone could record greets as any player.
--   * upsert_profile: the same hole, though today the profiles table's
--     NOT NULL secret column happens to stop the write with an error.
--
-- What this file does. It recreates exactly those three functions, unchanged
-- except for two things:
--   1. the secret check is `is distinct from`, which is true when either side
--      is NULL, so a missing secret is refused like a wrong one;
--   2. `set search_path = public, pg_temp`, the Supabase linter's advice for
--      SECURITY DEFINER functions (pg_temp last, so a temporary object can
--      never shadow a real table).
-- It changes no table, no data and no other function. The grants are the
-- same as docs/supabase-setup.sql's (repeated so that this file is complete
-- on its own).

-- ── Guard: the v7 setup must already be in place ──────────────────────
do $$
begin
  if to_regclass('public.saves') is null or to_regclass('public.profiles') is null
     or to_regclass('public.friendships') is null then
    raise exception 'Whisker Walk: the v7 tables are missing. Run docs/supabase-setup.sql first, then run this file again.';
  end if;
end $$;

-- ── The three RPCs, with the NULL-safe secret check ───────────────────

create or replace function public.upsert_save(
  p_code text, p_secret text, p_payload jsonb, p_lifetime integer
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record;
begin
  select * into existing from saves where code = p_code;
  if existing is null then
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

create or replace function public.upsert_profile(
  p_player_id text, p_secret text, p_pet_name text, p_breed text,
  p_accessories jsonb, p_rank_title text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record;
begin
  select * into existing from profiles where player_id = p_player_id;
  if existing is not null and existing.secret is distinct from p_secret then
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
) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; pr text; existing record; result integer;
begin
  select * into me from profiles where player_id = p_my_id;
  if me is null or me.secret is distinct from p_my_secret then return -1; end if;
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
grant execute on function public.upsert_profile to anon;
grant execute on function public.record_friend_greet to anon;
