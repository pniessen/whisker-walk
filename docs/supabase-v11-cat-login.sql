-- Whisker Walk v11 — "log in to my cat": revisions, the cheap question, four-word codes
-- and changing a code.
--
-- A cat played on two devices needs the two to catch up with each other
-- without one overwriting the other. STEP 1 gives each saved cat a
-- revision number, a one-line question ("what revision are you at?") and a
-- write that says which revision it was built on. The game on the devices
-- does the merging; the database only keeps the count honest.
-- STEP 2 lets a cat code be four words (stronger) and lets a grown-up change a cat
-- code that someone else saw.
-- STEP 3 adds hop codes: six characters, good for ten minutes, used once, that bring a cat to a
-- new device when the device that has the cat taps Allow.
--
-- Design: docs/superpowers/specs/2026-11-22-cat-login-design.md (section 6).
-- Plan:   docs/superpowers/plans/2026-11-22-cat-login.md.
--
-- RUN BY THE OWNER, ONE STEP AT A TIME. Agents stay off the database. This
-- file is text: nothing has run it, and no test has contacted a database.
-- Milestone 2 wrote STEP 1, milestone 3 wrote STEP 2, milestone 4 wrote STEP 3 (hop codes).
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
-- B. ORDER OF STEPS. Run ONE step at a time: select from its "══ STEP" line down to the
--    line before the next "══ STEP", then Run. Each step is safe to repeat.
--      STEP 1  revisions and the cheap question   adds columns, two functions, two limit rows
--                                                 and replaces upsert_save (one added line)
--      STEP 2  four-word codes and changing a code replaces upsert_save again (its code check takes
--                                                 both shapes), adds rotate_cat_code, one limit row
--      STEP 3  hop codes                          adds one private table (hops), four functions, two limit names
--    Each step takes effect at once, on every device, with no new build; the game works before
--    and after each (a build that does not find a function carries on as it did).
--    Run step 2 only after step 1 has run and both iPads and the Mac have the build with the
--    My cat sheet (an older build can still type and use old-shape codes, and never sees the new
--    ones). Run step 3 last, after step 1 (it needs step 1's checks and nothing else): until it has run,
--    Add a device says "not ready yet" and the cat code way works as before. If you ever re-run step 1 by itself afterwards, run step 2 again straight after: step 1
--    puts back upsert_save with the old code check, which refuses new four-word codes (the game
--    then falls back to old-shape codes, nothing breaks).
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
--  After STEP 2 (one at a time):
--
--  V6. rotate_cat_code exists, and the public key can run it (one row, anon_can_run true):
--   select p.proname as function_name, has_function_privilege('anon', p.oid, 'execute') as anon_can_run
--     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'rotate_cat_code';
--
--  V7. upsert_save now takes the four-word shape (expect true):
--   select p.prosrc like '%[A-Z]{3,6}(-[A-Z]{3,6}){3}%' as upsert_save_takes_four_words
--     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'upsert_save';
--
--  V8. The limit for changing a code (one row: a day, 5 per visitor):
--   select name as limit_name, window_secs as window_seconds, per_visitor as per_visitor, unknown as unknown_visitor, world as whole_world
--     from public.ww_limits where name = 'rotate';
--
--  V9. Running step 2 changed no save: none is emptied (expect 0 until the first time a cat code is changed):
--   select count(*) as saves, count(*) filter (where payload = '{}'::jsonb) as emptied_after_a_change from public.saves;
--
--  V10. Still no policy on saves (expect 0): the only way in is the functions:
--   select count(*) as policies_on_saves from pg_policies where schemaname = 'public' and tablename = 'saves';
--
--  After STEP 3 (one at a time):
--
--  V11. The four hop functions exist, and the public key can run them (four rows, anon_can_run true):
--   select p.proname as function_name, has_function_privilege('anon', p.oid, 'execute') as anon_can_run
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace and p.proname in ('hop_open', 'hop_join', 'hop_answer', 'hop_poll')
--    order by p.proname;
--
--  V12. The hops table is private: row-level security on, no policy (expect true, then 0):
--   select relrowsecurity as rls_on from pg_class where oid = 'public.hops'::regclass;
--   select count(*) as policies_on_hops from pg_policies where schemaname = 'public' and tablename = 'hops';
--
--  V13. The limits for hops (three rows: hop-miss a day, hop-open an hour, hop-miss ten minutes):
--   select name as limit_name, window_secs as window_seconds, per_visitor as per_visitor, unknown as unknown_visitor, world as whole_world
--     from public.ww_limits where name in ('hop-open', 'hop-miss') order by name, window_secs;
--
--  V14. Nothing is waiting there (expect 0 when nobody is adding a device; this shows no code and no secret):
--   select count(*) as open_hops from public.hops where expires_at > now();
--
-- D. ROLLBACK: each step's text has its own "Rollback" lines. For step 1 it is
--    a few statements and moves no data.
--
-- ═════════════════════════════ HOW IT WORKS ═════════════════════════════
--
--   rotate_cat_code(code, secret, new_code, new_secret)   (step 2)
--      one function = one transaction: the cat moves to the new code with the new secret (rev + 1), the
--      profile's secret follows (only for the cat the save names, only from the old secret), and the
--      OLD code stays as an empty row with a secret nobody has. A device still on the old code is then
--      answered 'denied' (it shows "this cat moved to a new cat code"), and nobody can claim the old
--      code for a new save, because a stranger holding the old code gets an empty row, not the cat.
--      answers: ok, denied, busy, bad. Needs the right secret; a wrong one counts as a load miss.
--
--   hop_open(code, secret)  -> {status:'ok', hop, waiting}     (step 3)
--      the device that has the cat asks for a hop code (needs the cat's own secret). Asking again while a hop is
--      open gives the same hop and says whether a device has typed it (waiting): that is the first device's poll,
--      and only a NEW hop counts against hop-open. One open hop per cat. status: ok, denied, busy, bad.
--   hop_join(hop)           -> {status:'ok', ticket}            the new device types the six characters. This only
--      ASKS: it stores a random ticket and nothing else. A wrong, expired or already-used hop answers 'none' and counts
--      as hop-miss; too many misses answer 'busy'. status: ok, none, busy.
--   hop_answer(code, secret, accept) -> 'ok' | 'none' | 'denied' | 'busy' | 'bad'
--      the first device taps Yes (accept) or No / Cancel. Only the right secret can answer. Yes writes the cat code and
--      secret into the row for that ticket and shortens the row's life to two minutes; No (or Cancel) says no to the
--      ticket, or closes a hop nobody has typed.
--   hop_poll(ticket)        -> {status:'wait'} | {status:'ok', code, secret} | {status:'denied'} | {status:'none'}
--      the new device asks every three seconds. The cat code and secret come back ONCE, to the matching ticket, and the
--      row is deleted in the same call (a second poll answers 'none'). Expired rows are deleted at every hop call.
--   (Only hop_poll ever returns a cat code or a secret. ww_cleanup is not changed; an unpolled row is gone ten minutes
--    after it was made, or two minutes after a Yes, at the next hop call by anyone.)
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

-- ══ STEP 2 — four-word codes and changing a code ══════════════════════
-- What: upsert_save is replaced by step 1's text with ONE line changed (a new code may be the old shape,
--   WORD-WORD-WORD-00, or four words of 3 to 6 letters), rotate_cat_code is added, and one limit row.
--   sync_save needs no change: it only looks a row up, it never makes one.
-- Changes for players: new cat codes can be four words (40 bits instead of 30). Old codes keep working
--   forever. "Change my cat code" starts to work (before this it says "not ready yet" and changes nothing).
-- Safe to re-run: yes (functions are "create or replace", the limit row is "do nothing" on conflict).
-- Rollback: put step 1's upsert_save back (run the STEP 1 part of this file again), then:
--   drop function if exists public.rotate_cat_code(text, text, text, text);
--   delete from public.ww_limits where name = 'rotate';
--   (a cat code that was already changed stays changed: the new row is a normal save, and the old code
--   stays as an empty row. Nothing is moved back by this rollback. The four-word codes already made
--   keep working for loads and syncs; only making a NEW four-word code stops.)
do $$
begin
  if to_regprocedure('public.peek_save(text,text)') is null or to_regprocedure('public.sync_save(text,text,integer,jsonb,integer)') is null then
    raise exception 'Whisker Walk v11 step 2: step 1 of docs/supabase-v11-cat-login.sql has not been run. Run step 1 first.';
  end if;
end $$;

insert into public.ww_limits (name, window_secs, per_visitor, unknown, world) values
  ('rotate', 86400, 5, 20, 200)
  on conflict (name, window_secs) do nothing;

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
    if p_code is null or (p_code !~ '^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-[0-9]{2}$' and p_code !~ '^[A-Z]{3,6}(-[A-Z]{3,6}){3}$')
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

create or replace function public.rotate_cat_code(
  p_code text, p_secret text, p_new_code text, p_new_secret text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare existing record; v_cat text;
begin
  if p_code is null or length(p_code) > 64 or p_secret is null or length(p_secret) > 128
     or p_new_code is null or p_new_code = p_code
     or (p_new_code !~ '^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-[0-9]{2}$' and p_new_code !~ '^[A-Z]{3,6}(-[A-Z]{3,6}){3}$')
     or p_new_secret is null or length(p_new_secret) < 16 or length(p_new_secret) > 128 or p_new_secret = p_secret then
    return 'bad';
  end if;
  if ww_over('load-miss') then return 'busy'; end if;
  select * into existing from saves where code = p_code for update;
  if not found then
    perform ww_hit('load-miss');
    return 'denied';
  end if;
  if existing.secret is distinct from p_secret then
    perform ww_hit('load-miss');
    return 'denied';
  end if;
  if not ww_hit('rotate') then return 'busy'; end if;
  if exists (select 1 from saves where code = p_new_code) then return 'busy'; end if;
  -- the cat the save names: only a real player id (a cat with no profile rotates the save alone)
  v_cat := existing.payload -> 'cat' ->> 'id';
  if v_cat is not null and v_cat !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return 'bad';
  end if;
  insert into saves (code, secret, payload, lifetime, rev, v, last_seen)
    values (p_new_code, p_new_secret, existing.payload, existing.lifetime, existing.rev + 1, 2, now());
  update saves
     set secret = 'moved-' || md5(random()::text || clock_timestamp()::text), payload = '{}'::jsonb,
         rev = existing.rev + 1, v = 2, updated_at = now()
   where code = p_code;
  if v_cat is not null then
    update profiles set secret = p_new_secret where player_id = v_cat and secret = p_secret;
  end if;
  return 'ok';
end $$;

revoke execute on function public.rotate_cat_code(text, text, text, text) from public, anon, authenticated;
grant execute on function public.rotate_cat_code(text, text, text, text) to anon;
grant execute on function public.upsert_save to anon;

notify pgrst, 'reload schema';


-- ══ STEP 3 — hop codes ════════════════════════════════════════════════
-- What: one private table (hops), four functions (hop_open, hop_join, hop_answer, hop_poll) and two limit names
--   (hop-open, hop-miss). Nothing else is touched: no save, no profile, no function of steps 1 or 2.
-- Changes for players: "Add a device" and "I have a hop code" start to work (before this they say "not ready yet"
--   and change nothing). Needs step 1 (it uses v10's counters and the same load-miss rule). Not step 2.
-- Safe to re-run: yes (the table is "if not exists", the functions are "create or replace", the limit rows are
--   "do nothing" on conflict, so it never overwrites a limit you changed).
-- Rollback: nothing is moved or kept. Run these, in this order:
--   drop function if exists public.hop_poll(text);
--   drop function if exists public.hop_answer(text, text, boolean);
--   drop function if exists public.hop_join(text);
--   drop function if exists public.hop_open(text, text);
--   drop table if exists public.hops;
--   delete from public.ww_limits where name in ('hop-open', 'hop-miss');
--   (a hop that was open at that moment is simply gone; a device that was adding a cat is told "that code didn't work")
do $$
begin
  if to_regprocedure('public.peek_save(text,text)') is null or to_regprocedure('public.sync_save(text,text,integer,jsonb,integer)') is null then
    raise exception 'Whisker Walk v11 step 3: step 1 of docs/supabase-v11-cat-login.sql has not been run. Run step 1 first.';
  end if;
end $$;

insert into public.ww_limits (name, window_secs, per_visitor, unknown, world) values
  ('hop-open',  3600,  12,    60,    600),
  ('hop-miss',   600,  10,    50,    300),
  ('hop-miss', 86400,  40,  3600,  36000)
  on conflict (name, window_secs) do nothing;

create table if not exists public.hops(
  hop text primary key,
  code text not null unique,
  expires_at timestamptz not null,
  joiner_ticket text,
  answer text check (answer in ('yes', 'no')),
  handoff jsonb
);
alter table public.hops enable row level security;
revoke all on public.hops from public, anon, authenticated;

-- The device that has the cat asks for a hop code (and, asking again, whether anyone has typed it).
create or replace function public.hop_open(p_code text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing record;
  cur record;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_hop text;
  v_bytes bytea;
  v_n integer;
begin
  if p_code is null or length(p_code) > 64 or p_secret is null or length(p_secret) > 128 then
    return jsonb_build_object('status', 'bad');
  end if;
  if ww_over('load-miss') then return jsonb_build_object('status', 'busy'); end if;
  select * into existing from saves where code = p_code for update;
  if not found then
    perform ww_hit('load-miss');
    return jsonb_build_object('status', 'denied');
  end if;
  if existing.secret is distinct from p_secret then
    perform ww_hit('load-miss');
    return jsonb_build_object('status', 'denied');
  end if;
  delete from hops where expires_at <= now();
  -- a hop the cat said No to is over (a new one may be asked for); a Yes not yet fetched is kept
  delete from hops where code = p_code and answer = 'no';
  select x.hop, x.joiner_ticket, x.answer into cur from hops x where x.code = p_code;
  if found then
    return jsonb_build_object('status', 'ok', 'hop', cur.hop, 'waiting', cur.joiner_ticket is not null and cur.answer is null);
  end if;
  if not ww_hit('hop-open') then return jsonb_build_object('status', 'busy'); end if;
  loop
    v_hop := '';
    v_bytes := decode(md5(gen_random_uuid()::text), 'hex');
    for v_n in 0..5 loop
      v_hop := v_hop || substr(v_alpha, 1 + ((get_byte(v_bytes, 2 * v_n) * 256 + get_byte(v_bytes, 2 * v_n + 1)) % length(v_alpha)), 1);
    end loop;
    exit when not exists (select 1 from hops x where x.hop = v_hop);
  end loop;
  insert into hops (hop, code, expires_at) values (v_hop, p_code, now() + interval '10 minutes');
  return jsonb_build_object('status', 'ok', 'hop', v_hop, 'waiting', false);
end $$;

-- The new device types the six characters. This only asks: the first device still has to tap Yes.
create or replace function public.hop_join(p_hop text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hop text := upper(btrim(coalesce(p_hop, '')));
  v_ticket text;
  r record;
begin
  if ww_over('hop-miss') then return jsonb_build_object('status', 'busy'); end if;
  if v_hop !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
    perform ww_hit('hop-miss');
    return jsonb_build_object('status', 'none');
  end if;
  delete from hops where expires_at <= now();
  select * into r from hops where hop = v_hop for update;
  if not found or r.joiner_ticket is not null then
    perform ww_hit('hop-miss');
    return jsonb_build_object('status', 'none');
  end if;
  v_ticket := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update hops set joiner_ticket = v_ticket where hop = v_hop;
  return jsonb_build_object('status', 'ok', 'ticket', v_ticket);
end $$;

-- The first device taps Yes (p_accept) or No / Cancel. Only the cat's own secret can answer.
create or replace function public.hop_answer(p_code text, p_secret text, p_accept boolean)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing record;
  v_ticket text;
  v_hop text;
begin
  if p_code is null or length(p_code) > 64 or p_secret is null or length(p_secret) > 128 then
    return 'bad';
  end if;
  if ww_over('load-miss') then return 'busy'; end if;
  select * into existing from saves where code = p_code;
  if not found then
    perform ww_hit('load-miss');
    return 'denied';
  end if;
  if existing.secret is distinct from p_secret then
    perform ww_hit('load-miss');
    return 'denied';
  end if;
  delete from hops where expires_at <= now();
  select h.hop, h.joiner_ticket into v_hop, v_ticket from hops h where h.code = p_code for update;
  if v_hop is null then return 'none'; end if;
  if not coalesce(p_accept, false) then
    if v_ticket is null then
      delete from hops where hop = v_hop;
    else
      update hops set answer = 'no', handoff = null, expires_at = least(expires_at, now() + interval '2 minutes') where hop = v_hop;
    end if;
    return 'ok';
  end if;
  if v_ticket is null then return 'none'; end if;
  update hops
     set answer = 'yes', handoff = jsonb_build_object('code', p_code, 'secret', p_secret),
         expires_at = least(expires_at, now() + interval '2 minutes')
   where hop = v_hop;
  return 'ok';
end $$;

-- The new device asks every three seconds. The cat code and secret come back once, to this ticket only.
create or replace function public.hop_poll(p_ticket text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_code text;
  v_secret text;
begin
  if p_ticket is null or p_ticket !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'none');
  end if;
  delete from hops where expires_at <= now();
  select * into r from hops where joiner_ticket = p_ticket for update;
  if not found then return jsonb_build_object('status', 'none'); end if;
  if r.answer = 'yes' then
    v_code := r.handoff ->> 'code';
    v_secret := r.handoff ->> 'secret';
    delete from hops where hop = r.hop;
    return jsonb_build_object('status', 'ok', 'code', v_code, 'secret', v_secret);
  end if;
  if r.answer = 'no' then
    delete from hops where hop = r.hop;
    return jsonb_build_object('status', 'denied');
  end if;
  return jsonb_build_object('status', 'wait');
end $$;

revoke execute on function public.hop_open(text, text) from public, anon, authenticated;
revoke execute on function public.hop_join(text) from public, anon, authenticated;
revoke execute on function public.hop_answer(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.hop_poll(text) from public, anon, authenticated;
grant execute on function public.hop_open(text, text) to anon;
grant execute on function public.hop_join(text) to anon;
grant execute on function public.hop_answer(text, text, boolean) to anon;
grant execute on function public.hop_poll(text) to anon;

notify pgrst, 'reload schema';
