-- Whisker Walk v11 — "log in to my cat": revisions, and the cheap question.
--
-- A cat played on two devices needs the two to catch up with each other
-- without one overwriting the other. This file gives each saved cat a
-- revision number, a one-line question ("what revision are you at?") and a
-- write that says which revision it was built on. The game on the devices
-- does the merging; the database only keeps the count honest.
--
-- Design: docs/superpowers/specs/2026-11-22-cat-login-design.md (section 6).
-- Plan:   docs/superpowers/plans/2026-11-22-cat-login.md.
--
-- RUN BY THE OWNER, ONE STEP AT A TIME. Agents stay off the database. This
-- file is text: nothing has run it, and no test has contacted a database.
-- This milestone (M2) writes STEP 1 only. Steps 2 and 3 (stronger codes and
-- changing a code; hop codes) come with milestones 3 and 4 and are added to
-- this file then.
--
-- Running STEP 1 changes and deletes NO row of player data. It adds three
-- columns to saves (every existing row gets rev 0, v 1), two functions and
-- two limit rows, and replaces upsert_save with v10's own text plus ONE line.
-- Every device on today's build keeps working, and the game works before and
-- after: a build that finds peek_save and sync_save missing carries on as it
-- did before this file.
--
-- ════════════════════════════════ RUNBOOK ═══════════════════════════════
--
-- A. BEFORE YOU START — read-only queries, one at a time in the SQL editor.
--    None shows a save code, a secret or a cat name.
--
--  A1. v10 must have run (this file refuses to run otherwise). Expect has_v10
--      true, and has_v11 false the first time:
--   select to_regprocedure('public.ww_hit(text)') is not null as has_v10,
--          to_regprocedure('public.sync_save(text,text,integer,jsonb,integer)') is not null as has_v11;
--
--  A2. How many saves there are, and their sizes (expect a handful):
--   select count(*) as saves, max(octet_length(payload::text)) as biggest_payload_bytes
--     from public.saves;
--
--  A3. Both iPads and every other device are on a build that has the catch-up
--      (the owner's two-device check in ios/README.md). Until then an old build
--      can still write a save with the old call. After step 1 it gets
--      'stale' for a save that has been revised, and the kid gets the update
--      at the next refresh. Nothing is lost either way.
--
-- B. ORDER OF STEPS. "Run" on the whole file does step 1 and is safe to repeat.
--      STEP 1  revisions and the cheap question   adds columns, two functions, two limit rows
--                                                 and replaces upsert_save (one added line)
--    Step 1 takes effect at once, on every device, with no new build.
--
-- C. HOW TO VERIFY — one at a time, after step 1.
--
--  V1. Three new columns on saves, nothing else changed (three rows):
--   select column_name as column_name, data_type as data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'saves' and column_name in ('rev', 'last_seen', 'v')
--    order by column_name;
--
--  V2. The two new functions exist, and the public key can run them (two rows, anon_can_run true):
--   select p.proname as function_name, has_function_privilege('anon', p.oid, 'execute') as anon_can_run
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace and p.proname in ('peek_save', 'sync_save')
--    order by p.proname;
--
--  V3. The limits for the two functions (two rows: an hour and a day):
--   select name as limit_name, window_secs as window_seconds, per_visitor as per_visitor, unknown as unknown_visitor, world as whole_world
--     from public.ww_limits where name = 'sync-ok' order by window_secs;
--
--  V4. upsert_save now refuses a revised save (expect true):
--   select p.prosrc like '%existing.v >= 2%' as upsert_save_has_the_v11_line
--     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'upsert_save';
--
--  V5. Every existing save is untouched: all at revision 0, version 1:
--   select count(*) as saves, count(*) filter (where rev = 0 and v = 1) as untouched from public.saves;
--
-- D. ROLLBACK: each step's text has its own "Rollback" lines. For step 1 it is
--    a few statements and moves no data.
--
-- ═════════════════════════════ HOW IT WORKS ═════════════════════════════
--
--   saves.rev        counts the writes made through sync_save; 0 until the first one
--   saves.v          1 for a row only the old calls have written, 2 once sync_save has
--   saves.last_seen  the last time a device asked or wrote (for a later, kinder clean-up
--                    than "not pushed to for a year": a tablet that only reads is not idle)
--
--   peek_save(code, secret)
--      -> {status:'ok', rev, updated_at, lifetime}   needs the right secret; a few bytes
--   sync_save(code, secret, base_rev, payload, lifetime)
--      base_rev = the revision this payload was built on (-1: this device has never synced)
--      if base_rev = saves.rev: write it, rev + 1, v = 2        -> {status:'ok', rev}
--      otherwise nothing is written                              -> {status:'merge', rev, payload}
--      The payload that comes back leaves out the photo album (a catch-up never carries
--      photos), and a write that leaves the album out keeps the one already stored.
--   Answers are always one object with a short `status`: ok, merge, denied, busy, none,
--   bad, too-big. The game never mistakes a failure for a success.
--
--   Limits (v10's counters): a wrong code or a wrong secret counts as 'load-miss', the same
--   as a wrong code in load_save, so these two cannot be used to find out which codes exist.
--   A right secret counts as 'sync-ok' (rows below): a phone asking at every open and after
--   every walk is far below them; a script is not.
--
--   v10's counters need ww_limits to have a row for each name (no row means refused).
--
-- ══ STEP 1 — revisions and the cheap question ═════════════════════════
-- What: three columns on saves, two limit rows, peek_save, sync_save, and upsert_save
--   replaced by v10's own text plus one line (a row with v = 2 answers 'stale').
-- Changes for players: none you can see. The catch-up in the game starts using the new
--   functions at once; devices that have not got it keep working as they did.
-- Safe to re-run: yes (columns and rows are "if not exists"/"do nothing", functions are
--   "create or replace"; it never overwrites a limit you changed).
-- Rollback: put v10's upsert_save back by running the "STEP 3" part of
--   docs/supabase-v10-limits.sql (safe to re-run), then:
--   drop function if exists public.sync_save(text, text, integer, jsonb, integer);
--   drop function if exists public.peek_save(text, text);
--   delete from public.ww_limits where name = 'sync-ok';
--   alter table public.saves drop column if exists v, drop column if exists last_seen, drop column if exists rev;
--   (dropping the columns forgets the revisions; the saves themselves are not touched)
do $$
begin
  if to_regprocedure('public.ww_hit(text)') is null or to_regprocedure('public.ww_over(text)') is null then
    raise exception 'Whisker Walk v11: v10 (docs/supabase-v10-limits.sql) has not been run. Run it first.';
  end if;
end $$;

alter table public.saves add column if not exists rev integer not null default 0;
alter table public.saves add column if not exists last_seen timestamptz not null default now();
alter table public.saves add column if not exists v smallint not null default 1;

insert into public.ww_limits (name, window_secs, per_visitor, unknown, world) values
  ('sync-ok',  3600,  120,   600,  20000),
  ('sync-ok', 86400, 1000,  5000, 200000)
  on conflict (name, window_secs) do nothing;

create or replace function public.peek_save(p_code text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record;
begin
  if p_code is null or length(p_code) > 64 or p_secret is null or length(p_secret) > 128 then
    return jsonb_build_object('status', 'bad');
  end if;
  if ww_over('load-miss') then return jsonb_build_object('status', 'busy'); end if;
  select * into existing from saves where code = p_code;
  if not found then
    perform ww_hit('load-miss');
    return jsonb_build_object('status', 'none');
  end if;
  if existing.secret is distinct from p_secret then
    perform ww_hit('load-miss');
    return jsonb_build_object('status', 'denied');
  end if;
  if not ww_hit('sync-ok') then return jsonb_build_object('status', 'busy'); end if;
  update saves set last_seen = now() where code = p_code;
  return jsonb_build_object('status', 'ok', 'rev', existing.rev, 'updated_at', existing.updated_at,
                            'lifetime', existing.lifetime);
end $$;

create or replace function public.sync_save(
  p_code text, p_secret text, p_base_rev integer, p_payload jsonb, p_lifetime integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record; v_album jsonb;
begin
  if p_code is null or length(p_code) > 64 or p_secret is null or length(p_secret) > 128
     or p_base_rev is null or p_base_rev < -1 or p_lifetime is null or p_lifetime < 0
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('status', 'bad');
  end if;
  if octet_length(p_payload::text) > 2097152 then return jsonb_build_object('status', 'too-big'); end if;
  if ww_over('load-miss') then return jsonb_build_object('status', 'busy'); end if;
  select * into existing from saves where code = p_code for update;
  if not found then
    perform ww_hit('load-miss');
    return jsonb_build_object('status', 'none');
  end if;
  if existing.secret is distinct from p_secret then
    perform ww_hit('load-miss');
    return jsonb_build_object('status', 'denied');
  end if;
  if not ww_hit('sync-ok') then return jsonb_build_object('status', 'busy'); end if;
  if p_base_rev <> existing.rev then
    update saves set last_seen = now() where code = p_code;
    return jsonb_build_object('status', 'merge', 'rev', existing.rev, 'payload', existing.payload - 'album');
  end if;
  -- a catch-up leaves the photo album out: the one already stored stays
  v_album := existing.payload -> 'album';
  update saves
     set payload = case when p_payload ? 'album' or v_album is null then p_payload
                        else p_payload || jsonb_build_object('album', v_album) end,
         lifetime = p_lifetime, rev = existing.rev + 1, v = 2, updated_at = now(), last_seen = now()
   where code = p_code;
  return jsonb_build_object('status', 'ok', 'rev', existing.rev + 1);
end $$;

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
    if not ww_hit('new-save') then return 'busy'; end if;
    insert into saves (code, secret, payload, lifetime)
      values (p_code, p_secret, p_payload, p_lifetime);
    return 'created';
  end if;
  if existing.secret is distinct from p_secret then return 'denied'; end if;
  -- v11: a row a new build has revised (sync_save) is never written by this old call, so an
  -- old build cannot overwrite a merged save; it shows today's "cloud has newer progress" line.
  if existing.v >= 2 then return 'stale'; end if;
  if p_lifetime < existing.lifetime then return 'stale'; end if;
  update saves set payload = p_payload, lifetime = p_lifetime, updated_at = now()
    where code = p_code;
  return 'updated';
end $$;

revoke execute on function public.peek_save(text, text) from public, anon, authenticated;
revoke execute on function public.sync_save(text, text, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.peek_save(text, text) to anon;
grant execute on function public.sync_save(text, text, integer, jsonb, integer) to anon;
grant execute on function public.upsert_save to anon;

notify pgrst, 'reload schema';
