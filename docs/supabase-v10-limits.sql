-- Whisker Walk v10 — limits per visitor, and a clean-up of old online data.
--
-- Today's limits (v8, v9) are counted across the whole world, so one person
-- sending wrong codes can switch off "Load from cloud", friend codes and
-- "Delete my online data" for everybody. This file counts per visitor
-- instead (by a salted hash of the network address), keeps a generous
-- world-wide ceiling behind that, makes a delete with the RIGHT secret
-- impossible to block, and adds a clean-up of data not touched for 12 months
-- (switched OFF until you turn it on).
--
-- Running the file changes and deletes NO row of player data. It adds four
-- private tables and replaces six functions; every function keeps its name,
-- arguments and answers, so devices on today's build keep working, and there
-- is no client change.
--
-- ════════════════════════════════ RUNBOOK ═══════════════════════════════
--
-- A. BEFORE YOU START — read-only queries, one at a time in the SQL editor.
--    None shows a save code, a secret or a cat name.
--
--  A1. Which earlier files have run. Expect has_v8 and has_v9 true (this file
--      refuses to run otherwise) and has_v10 false the first time:
--   select to_regprocedure('public.ww_rate_hit(text,integer,integer)') is not null as has_v8,
--          to_regprocedure('public.delete_save(text,text)') is not null as has_v9,
--          to_regprocedure('public.ww_hit(text)') is not null as has_v10;
--
--  A2. Has v8's STEP B run? No rows = yes, it has. Rows = not yet. This file
--      is correct either way (it never touches those policies or grants);
--      the answer is only for your notes:
--   select tablename as table_name, policyname as policy_name from pg_policies
--    where schemaname = 'public' and tablename in ('profiles','friendships');
--
--  A3. The Postgres version. This file needs 13 or newer (for sha256 and
--      gen_random_uuid without an extension; pgcrypto is NOT used):
--   select current_setting('server_version') as postgres_version;
--
--  A4. How big the tables are:
--   select c.relname as table_name, c.reltuples::bigint as rough_rows,
--          pg_size_pretty(pg_total_relation_size(c.oid)) as size
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
--    order by pg_total_relation_size(c.oid) desc;
--
--  A5. How old the rows are, and how many the 12-month rule would remove if
--      it ran today (expect 0 and 0 on a database this young):
--   select (select count(*) from public.saves) as saves,
--          (select min(updated_at) from public.saves) as oldest_save,
--          (select count(*) from public.saves where updated_at < now() - interval '12 months') as saves_over_12_months,
--          (select count(*) from public.profiles) as profiles,
--          (select min(last_seen) from public.profiles) as oldest_profile,
--          (select count(*) from public.profiles where last_seen < now() - interval '12 months') as profiles_over_12_months;
--
--  A6. Which headers arrive (THE ONE THING THAT COULD NOT BE CHECKED when
--      this was written). The SQL editor does not go through the API, so it
--      cannot show them; use the temporary probe in "STEP 0" at the end of
--      this file. You can skip A6 and still run steps 1 to 4 safely: if the
--      header this file looks for (cf-connecting-ip) never arrives, every
--      visitor is counted in one shared group with exactly today's v8/v9
--      numbers, i.e. nothing gets worse. B5 below shows which case you are in.
--
-- B. ORDER OF STEPS. "Run" on the whole file does steps 1 to 4 in order and
--    is safe to repeat. Or select one step's text and run it alone; each
--    step checks that the one before it is in place.
--      STEP 0 (in a comment, optional, by hand): the header probe
--      STEP 1  private tables                  adds only; no behaviour change
--      STEP 2  counting helpers                adds only; no behaviour change
--      STEP 3  the switch-over                 replaces six functions (THE change)
--      STEP 4  clean-up functions              adds only; clean-up stays OFF
--      STEP 5 (in a comment, by hand, later): dry run, then turn clean-up on
--    Steps 1, 2 and 4 are safe at any time. Step 3 is the moment the limits
--    change; it takes effect at once, on every device, with no new build.
--
-- C. HOW TO VERIFY — one at a time, after the step named.
--
--  B1 (after step 1). Four private tables, none readable with the public key
--      (four rows, anon_can_read false on each), and ten limit rows:
--   select c.relname as table_name, c.relrowsecurity as rls_on,
--          has_table_privilege('anon', c.oid, 'select') as anon_can_read
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relname in ('ww_salt','ww_limits','ww_counts','ww_cleanup_state')
--    order by c.relname;
--   select l.name as limit_name, l.window_secs as window_seconds, l.per_visitor as per_visitor,
--          l.unknown as shared_when_unknown, l.world as world_ceiling
--     from public.ww_limits l order by l.name, l.window_secs;
--
--  B2 (after step 2). The helpers are NOT callable by players (all false):
--   select has_function_privilege('anon', 'public.ww_visitor()', 'execute') as visitor,
--          has_function_privilege('anon', 'public.ww_over(text)', 'execute') as over,
--          has_function_privilege('anon', 'public.ww_hit(text)', 'execute') as hit;
--
--  B3 (after step 3). All six functions use the new counters (six rows, all
--      true). If one says false, an older file was run after this one: run
--      this file again.
--   select p.proname as function_name, p.prosrc like '%ww_hit(%' as uses_v10
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('upsert_save','load_save','upsert_profile','find_by_friend_code','delete_save','delete_player')
--    order by p.proname;
--
--  B4 (after step 3). A wrong delete is refused and nothing is deleted
--      (expect 'none' and 'none'). This counts one wrong attempt:
--   select public.delete_save('NO-SUCH-CODE', null) as save_answer,
--          public.delete_player('00000000-0000-0000-0000-000000000000', null) as player_answer;
--
--  B5 (after step 3, once the game has been used a little: type a wrong code
--      into "Load from cloud" on a phone). Are visitors being told apart?
--      known_visitor true = yes, per-visitor limits are live. Only
--      known_visitor false rows (after real use from a device) = the header
--      is not arriving, the shared v8/v9 numbers are in force; do STEP 0.
--      (B4, run from the SQL editor, always counts as unknown.)
--   select c.name as limit_name, c.visitor not in ('', '?') as known_visitor,
--          count(*) as counter_rows, sum(c.hits) as events
--     from public.ww_counts c where c.visitor <> ''
--    group by c.name, c.visitor not in ('', '?') order by c.name;
--
--  B6 (any time). No raw address is stored: every visitor value is '' (the
--      world counter), '?' (unknown) or 32 hex characters (expect true):
--   select coalesce(bool_and(c.visitor in ('', '?') or c.visitor ~ '^[0-9a-f]{32}$'), true) as only_hashes
--     from public.ww_counts c;
--
--  B7 (after step 4). The clean-up is installed and OFF; only the daily
--      "tick" is callable with the public key (expect false, true, false):
--   select s.enabled as cleanup_on,
--          has_function_privilege('anon', 'public.ww_cleanup_tick()', 'execute') as tick_callable,
--          has_function_privilege('anon', 'public.ww_cleanup(boolean,integer,integer)', 'execute') as cleanup_callable
--     from public.ww_cleanup_state s;
--
-- D. AFTER THIS FILE: do not re-run docs/supabase-setup.sql,
--    docs/supabase-colony.sql, the v8 file or the v9 file on this database
--    without running this file again straight after. Each of them puts back
--    its own world-wide version of the functions (that is also the rollback
--    of step 3). A brand-new database: setup, colony, then this file.
--
-- ═════════════════════════════ HOW IT WORKS ═════════════════════════════
--
-- WHO IS A "VISITOR". Supabase's API (PostgREST) hands each request's
-- headers to SQL as current_setting('request.headers'). The address is read
-- from ONE header, chosen in ww_salt.source:
--   'cf-connecting-ip' (the default)  set by Cloudflare, which sits in front
--        of every Supabase project. Cloudflare overwrites whatever the
--        caller sends under that name, so a caller cannot choose it.
--   'x-real-ip', 'xff-first', 'xff-last'  alternatives, for after STEP 0
--        shows what really arrives. NOT the default: x-forwarded-for is a
--        list that each hop adds to, and its FIRST entry is whatever the
--        caller typed, so trusting it would let one person pretend to be a
--        new visitor on every request.
--   'off'  nobody is told apart; the shared numbers below apply.
-- NOT VERIFIED: which of these the live project actually sends, and whether
-- cf-connecting-ip really cannot be forged there. STEP 0 checks both.
--
-- WHEN THE HEADER IS MISSING, unreadable, or not an address: the caller is
-- counted in one shared group, '?', with the "unknown" numbers, which are
-- exactly today's v8/v9 world-wide numbers. Missing never means "no limit".
--
-- NO RAW ADDRESS IS STORED. What is stored is the first 32 hex characters of
-- sha256(salt + address). The salt is a random value in ww_salt, a table no
-- public role can read. It is replaced at the first request after midnight
-- UTC each day and the old counter rows are deleted with it, so yesterday's
-- hashes cannot be matched to an address even by the owner. Counter rows are
-- also deleted as their window passes (see ww_hit) and by the sweep in
-- step 4. An IPv6 address is cut to its /64 (one home's whole range) first.
--
-- THREE NUMBERS PER LIMIT (table ww_limits; change one with an UPDATE, no
-- function to re-create):
--   per_visitor  for one known visitor
--   unknown      for everyone whose address is unknown, together (= v8/v9)
--   world        for everybody together: the backstop for an attacker with
--                many addresses. A visitor already over their own limit adds
--                nothing to it, so one address cannot use it up.
-- Each limit has a short window and a whole-day window; both must pass.
--
--   limit         window   per visitor   unknown (as today)   world
--   new-save      1 hour        10             30               600
--   new-save      1 day         20            720             14400
--   new-profile   1 hour        20             60              1200
--   new-profile   1 day         40           1440             28800
--   load-miss     10 min        10            100               500
--   load-miss     1 day         50          14400             72000
--   friend-miss   10 min        10            100               500
--   friend-miss   1 day         60          14400             72000
--   delete-miss   10 min        10             50               500
--   delete-miss   1 day         30           7200             72000
-- (The day row's "unknown" and "world" are just the short window times the
-- number of windows in a day: they add nothing. The day row exists for its
-- per-visitor number.)
--
-- Save-code guessing (a code is about 1.7 billion choices): one address now
-- gets 50 wrong codes a day instead of the world's 14,400. An attacker with
-- hundreds of addresses is held by the world ceiling, 72,000 a day, which is
-- FIVE TIMES LOOSER than today's. That is the price of honest players not
-- being blocked by one busy day; lower ww_limits.world to trade it back, or
-- make new save codes longer in the game (the real fix).
--
-- A missing ww_limits row means REFUSED ('busy'), never "no limit".
--
-- DELETING CANNOT BE BLOCKED. delete_save and delete_player now look at the
-- secret FIRST: the right secret always deletes, whatever the counters say.
-- Only wrong answers are counted and limited. This is safe because the
-- secret is two random UUIDs (far beyond guessing at any rate); the limit
-- was only ever there so wrong answers cannot be used to learn which save
-- codes exist, and it still does that.
--
-- PER-DEVICE RULES that already exist are untouched: every colony function
-- and record_friend_greet still checks the device's own id and secret, one
-- feed per player per cat per walk, one greet per pair per walk. None of
-- the six functions replaced here had a per-device limit to keep: they are
-- the ones a caller can reach with no valid device id at all.
--
-- v8's STEP B: this file is correct whether or not it has run. It never
-- creates, drops or reads a policy or a table grant on profiles or
-- friendships; the functions run as their owner and need neither. The new
-- tables are private from the start.

-- ── Guard: v7, the colony, v8 and v9 must already be in place ─────────
do $$
begin
  if to_regclass('public.saves') is null or to_regclass('public.profiles') is null
     or to_regclass('public.friendships') is null then
    raise exception 'Whisker Walk: the v7 tables are missing. Run docs/supabase-setup.sql first, then run this file again.';
  end if;
  if to_regclass('public.colony_members') is null or to_regclass('public.colony_invites') is null
     or to_regclass('public.colony_trades') is null or to_regclass('public.colonies') is null then
    raise exception 'Whisker Walk: the colony tables are missing. Run docs/supabase-colony.sql first, then run this file again.';
  end if;
  if to_regprocedure('public.ww_rate_hit(text,integer,integer)') is null then
    raise exception 'Whisker Walk: the v8 hardening is missing. Run docs/supabase-v8-hardening.sql first, then run this file again.';
  end if;
  if to_regprocedure('public.delete_save(text,text)') is null
     or to_regprocedure('public.delete_player(text,text)') is null then
    raise exception 'Whisker Walk: the v9 delete functions are missing. Run docs/supabase-v9-delete.sql first, then run this file again.';
  end if;
end $$;

-- ══ STEP 1 — private tables ═══════════════════════════════════════════
-- What: four tables nobody can reach with the public key (row-level
-- security on, no policy, grants removed, exactly like ww_rate):
--   ww_salt           one row: the salt, the day it was made, which header
--   ww_limits         the numbers in the table above
--   ww_counts         the counters: (limit, window, window start, visitor)
--   ww_cleanup_state  one row: is the clean-up on, and when it last ran
-- Changes for players: none. Nothing uses these until step 3.
-- Safe to re-run: yes. It never overwrites the salt, a limit you changed,
-- or the clean-up switch.
-- Rollback (only after undoing steps 4, 3 and 2):
--   drop table if exists public.ww_counts, public.ww_limits, public.ww_salt, public.ww_cleanup_state;
create table if not exists public.ww_salt (
  id boolean primary key default true check (id),
  salt text not null,
  salt_day date not null,
  source text not null default 'cf-connecting-ip'
    check (source in ('cf-connecting-ip', 'x-real-ip', 'xff-first', 'xff-last', 'off'))
);

create table if not exists public.ww_limits (
  name text not null,
  window_secs integer not null check (window_secs > 0),
  per_visitor integer not null check (per_visitor > 0),
  unknown integer not null check (unknown > 0),
  world integer not null check (world > 0),
  primary key (name, window_secs)
);

-- visitor: '' = the world counter, '?' = address unknown, else a salted hash.
create table if not exists public.ww_counts (
  name text not null,
  window_secs integer not null,
  bucket timestamptz not null,
  visitor text not null,
  hits integer not null default 0,
  primary key (name, window_secs, bucket, visitor)
);

create table if not exists public.ww_cleanup_state (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  months integer not null default 12 check (months >= 6),
  max_rows integer not null default 200 check (max_rows between 1 and 5000),
  last_sweep timestamptz,
  last_cleanup timestamptz,
  last_result jsonb
);

alter table public.ww_salt enable row level security;
alter table public.ww_limits enable row level security;
alter table public.ww_counts enable row level security;
alter table public.ww_cleanup_state enable row level security;
revoke all on public.ww_salt from public, anon, authenticated;
revoke all on public.ww_limits from public, anon, authenticated;
revoke all on public.ww_counts from public, anon, authenticated;
revoke all on public.ww_cleanup_state from public, anon, authenticated;

insert into public.ww_salt (id, salt, salt_day)
  values (true, gen_random_uuid()::text || gen_random_uuid()::text, (now() at time zone 'utc')::date)
  on conflict (id) do nothing;

insert into public.ww_cleanup_state (id) values (true) on conflict (id) do nothing;

insert into public.ww_limits (name, window_secs, per_visitor, unknown, world) values
  ('new-save',     3600, 10,    30,   600),
  ('new-save',    86400, 20,   720, 14400),
  ('new-profile',  3600, 20,    60,  1200),
  ('new-profile', 86400, 40,  1440, 28800),
  ('load-miss',     600, 10,   100,   500),
  ('load-miss',   86400, 50, 14400, 72000),
  ('friend-miss',   600, 10,   100,   500),
  ('friend-miss', 86400, 60, 14400, 72000),
  ('delete-miss',   600, 10,    50,   500),
  ('delete-miss', 86400, 30,  7200, 72000)
  on conflict (name, window_secs) do nothing;

-- ══ STEP 2 — counting helpers ═════════════════════════════════════════
-- What: three internal functions, not callable by players:
--   ww_visitor()   this request's visitor (a salted hash), or NULL = unknown
--   ww_over(name)  true when this visitor, or the world, has used up `name`
--                  (counts nothing)
--   ww_hit(name)   counts one event; true while it is still allowed
-- Changes for players: none. Nothing calls these until step 3.
-- Safe to re-run: yes.
-- Rollback (only after undoing steps 4 and 3):
--   drop function if exists public.ww_hit(text);
--   drop function if exists public.ww_over(text);
--   drop function if exists public.ww_visitor();
do $$
begin
  if to_regclass('public.ww_salt') is null or to_regclass('public.ww_limits') is null
     or to_regclass('public.ww_counts') is null then
    raise exception 'Whisker Walk v10: step 1 (the private tables) has not been run. Run step 1 first.';
  end if;
end $$;

-- NULL whenever the address isn't known for certain: the source is 'off',
-- there are no headers (the SQL editor, a direct connection), the header is
-- missing, or its value is not an address. The caller treats NULL as the
-- shared "unknown" group. The first call of a new UTC day replaces the salt
-- and deletes every per-visitor counter (all windows start afresh at
-- midnight UTC anyway, so no count is lost by it).
create or replace function public.ww_visitor()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_source text; v_salt text; v_day date;
  v_today date := (now() at time zone 'utc')::date;
  v_headers json; v_raw text; v_ip inet;
begin
  select s.source, s.salt, s.salt_day into v_source, v_salt, v_day from ww_salt s;
  if not found or v_source = 'off' then return null; end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_raw := case v_source
      when 'cf-connecting-ip' then v_headers ->> 'cf-connecting-ip'
      when 'x-real-ip' then v_headers ->> 'x-real-ip'
      when 'xff-first' then split_part(v_headers ->> 'x-forwarded-for', ',', 1)
      when 'xff-last' then regexp_replace(v_headers ->> 'x-forwarded-for', '^.*,', '')
    end;
    v_ip := nullif(btrim(left(v_raw, 64)), '')::inet;
  exception when others then
    return null;
  end;
  if v_ip is null then return null; end if;
  if v_day < v_today then
    update ww_salt s
       set salt = gen_random_uuid()::text || gen_random_uuid()::text, salt_day = v_today
     where s.salt_day < v_today;
    delete from ww_counts c where c.visitor not in ('', '?');
    select s.salt into v_salt from ww_salt s;
  end if;
  if family(v_ip) = 6 then v_ip := network(set_masklen(v_ip, 64)); end if;
  return substr(encode(sha256(convert_to(v_salt || host(v_ip), 'UTF8')), 'hex'), 1, 32);
end $$;

create or replace function public.ww_over(p_name text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_visitor text := ww_visitor();
  v_key text := coalesce(v_visitor, '?');
  v_seen boolean := false;
  v_bucket timestamptz;
  l record;
begin
  for l in select * from ww_limits x where x.name = p_name loop
    v_seen := true;
    v_bucket := to_timestamp(floor(extract(epoch from now()) / l.window_secs) * l.window_secs);
    if exists (select 1 from ww_counts c
                where c.name = p_name and c.window_secs = l.window_secs and c.bucket = v_bucket
                  and ((c.visitor = v_key
                        and c.hits >= case when v_visitor is null then l.unknown else l.per_visitor end)
                    or (c.visitor = '' and c.hits >= l.world))) then
      return true;
    end if;
  end loop;
  return not v_seen;  -- no limit row: refused, never "no limit"
end $$;

-- Counts one event against this visitor and, when the visitor is within
-- their own limit, against the world. A caller already over a limit is
-- refused without counting anything more, so one address can add at most
-- its own allowance to the world counter, and the counter table cannot be
-- grown past (world ceiling) rows per window. The first event of a new
-- window deletes that limit's older windows.
create or replace function public.ww_hit(p_name text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_visitor text;
  v_key text;
  v_ok boolean := true;
  v_bucket timestamptz;
  v_hits integer;
  l record;
begin
  if ww_over(p_name) then return false; end if;
  v_visitor := ww_visitor();
  v_key := coalesce(v_visitor, '?');
  for l in select * from ww_limits x where x.name = p_name order by x.window_secs loop
    v_bucket := to_timestamp(floor(extract(epoch from now()) / l.window_secs) * l.window_secs);
    insert into ww_counts as c (name, window_secs, bucket, visitor, hits)
      values (p_name, l.window_secs, v_bucket, v_key, 1)
    on conflict (name, window_secs, bucket, visitor) do update set hits = c.hits + 1
    returning c.hits into v_hits;
    if v_hits = 1 then
      delete from ww_counts c
       where c.name = p_name and c.window_secs = l.window_secs and c.bucket < v_bucket;
    end if;
    if v_hits > (case when v_visitor is null then l.unknown else l.per_visitor end) then v_ok := false; end if;
  end loop;
  if not v_ok then return false; end if;
  for l in select * from ww_limits x where x.name = p_name order by x.window_secs loop
    v_bucket := to_timestamp(floor(extract(epoch from now()) / l.window_secs) * l.window_secs);
    insert into ww_counts as c (name, window_secs, bucket, visitor, hits)
      values (p_name, l.window_secs, v_bucket, '', 1)
    on conflict (name, window_secs, bucket, visitor) do update set hits = c.hits + 1
    returning c.hits into v_hits;
    if v_hits > l.world then v_ok := false; end if;
  end loop;
  return v_ok;
end $$;

revoke execute on function public.ww_visitor() from public, anon, authenticated;
revoke execute on function public.ww_over(text) from public, anon, authenticated;
revoke execute on function public.ww_hit(text) from public, anon, authenticated;

-- ══ STEP 3 — the switch-over ══════════════════════════════════════════
-- What: six functions are replaced. Names, arguments and answers are the
-- same as v8/v9; only where the counting happens changes:
--   upsert_save          'new-save' per visitor (was 30 an hour, world)
--   load_save            'load-miss' per visitor (was 100 per 10 min, world)
--   upsert_profile       'new-profile' per visitor (was 60 an hour, world)
--   find_by_friend_code  'friend-miss' per visitor (was 100 per 10 min, world)
--   delete_save          the right secret ALWAYS deletes; wrong answers are
--   delete_player        counted per visitor (was 50 per 10 min, world, and
--                        blocked right answers too)
-- plus one internal helper, ww_purge_player, which holds the part of
-- delete_player that removes one player's rows (unchanged from v9), so the
-- clean-up in step 4 removes a player in exactly the same way.
-- Everything else in each function is word for word the v8/v9 text.
-- Changes for players: takes effect at once, no new build. The table-size
-- cap on new saves (300 MB) stays. v8's ww_rate table and helpers stay in
-- place, unused, so the rollback works.
-- Safe to re-run: yes.
-- Rollback: run docs/supabase-v8-hardening.sql, then docs/supabase-v9-delete.sql
--   (both safe to re-run; v8's STEP B is in a comment and is not touched),
--   then: drop function if exists public.ww_purge_player(text);
--   That puts back the world-wide limits exactly as they were. No data moves.
do $$
begin
  if to_regprocedure('public.ww_hit(text)') is null or to_regprocedure('public.ww_over(text)') is null then
    raise exception 'Whisker Walk v10: step 2 (the counting helpers) has not been run. Run step 2 first.';
  end if;
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
  if ww_over('load-miss') then return null; end if;
  select * into existing from saves where code = p_code;
  if not found then
    perform ww_hit('load-miss');
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
    if not ww_hit('new-profile') then return 'busy'; end if;
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

create or replace function public.find_by_friend_code(p_code text)
returns table (player_id text, pet_name text, breed text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text := lower(btrim(left(coalesce(p_code, ''), 64)));
begin
  if v_code !~ '^[0-9a-f]{8}$' then return; end if;
  if ww_over('friend-miss') then return; end if;
  return query
    select pr.player_id, pr.pet_name, pr.breed from profiles pr
     where left(pr.player_id, 8) = v_code
     limit 5;
  if not found then
    perform ww_hit('friend-miss');
  end if;
end $$;

-- The right secret deletes, always. Anything else ('none' for a code with
-- no save, 'denied' for a wrong or missing secret) is one 'delete-miss';
-- a visitor (or a world) over that limit gets 'busy' for every WRONG call,
-- without being told whether the code exists.
create or replace function public.delete_save(p_code text, p_secret text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secret text; v_found boolean;
begin
  if p_code is null or length(p_code) > 64 then return 'none'; end if;
  select s.secret into v_secret from saves s where s.code = p_code for update;
  v_found := found;
  if v_found and not (v_secret is distinct from p_secret) then
    delete from saves s where s.code = p_code;
    return 'ok';
  end if;
  if ww_over('delete-miss') then return 'busy'; end if;
  perform ww_hit('delete-miss');
  if v_found then return 'denied'; end if;
  return 'none';
end $$;

-- Removes one player's online rows: the body of v9's delete_player from
-- "select m.colony_id" to the end, unchanged (see that file for why each
-- line is there and what is left alone on purpose). Internal: the caller
-- has already checked the secret (delete_player) or the row's age (ww_cleanup).
create or replace function public.ww_purge_player(p_player_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_colony text;
begin
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  -- serialise with the partner's trade and feed calls, which lock this row too
  if v_colony is not null then
    perform 1 from colonies co where co.id = v_colony for update;
  end if;
  delete from colony_invites ci where ci.inviter_id = p_player_id;
  update colony_invites ci set joiner_id = null where ci.joiner_id = p_player_id;
  update colony_trades t set status = 'cancelled', decided_at = now()
   where t.status = 'offered' and (t.from_id = p_player_id or t.to_id = p_player_id);
  delete from colony_members m where m.player_id = p_player_id;
  if v_colony is not null
     and not exists (select 1 from colony_members m where m.colony_id = v_colony) then
    delete from colonies co where co.id = v_colony;
  end if;
  delete from friendships f where f.a_id = p_player_id or f.b_id = p_player_id;
  delete from profiles pr where pr.player_id = p_player_id;
end $$;

revoke execute on function public.ww_purge_player(text) from public, anon, authenticated;

-- 'none' (no such profile) is never counted or refused, as in v9. The right
-- secret deletes, always. A wrong or missing secret is one 'delete-miss'.
create or replace function public.delete_player(p_player_id text, p_secret text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secret text;
begin
  if p_player_id is null or length(p_player_id) > 64 then return 'none'; end if;
  select pr.secret into v_secret from profiles pr where pr.player_id = p_player_id for update;
  if not found then return 'none'; end if;
  if v_secret is distinct from p_secret then
    if ww_over('delete-miss') then return 'busy'; end if;
    perform ww_hit('delete-miss');
    return 'denied';
  end if;
  perform ww_purge_player(p_player_id);
  return 'ok';
end $$;

grant execute on function public.upsert_save to anon;
grant execute on function public.load_save to anon;
grant execute on function public.upsert_profile to anon;
grant execute on function public.find_by_friend_code to anon;
grant execute on function public.delete_save to anon;
grant execute on function public.delete_player to anon;

notify pgrst, 'reload schema';

-- ══ STEP 4 — clean-up functions (installed OFF) ═══════════════════════
-- What:
--   ww_cleanup(dry_run, max_rows, months)  removes cloud saves and cat
--       profiles not touched for `months` months (never fewer than 6), with
--       everything that hangs off a removed profile. Owner only. dry_run
--       defaults to TRUE: it then returns the counts and deletes nothing.
--   ww_counts_sweep()   deletes counter rows whose window has passed, and
--       replaces a salt from an earlier day. Owner only.
--   ww_cleanup_tick()   the ONE thing the public key may call: at most every
--       5 minutes it runs the sweep, and at most every 20 hours, ONLY IF
--       ww_cleanup_state.enabled is true, it runs the real clean-up with the
--       settings in that table. It takes no arguments and always answers
--       'ok', so a stranger calling it learns nothing and can change
--       nothing: the worst they can do is make the scheduled run happen a
--       little earlier in the day.
--
-- WHAT COUNTS AS "TOUCHED" (checked against the functions and the game):
--   a cloud save    saves.updated_at: set by every upload. A linked device
--                   uploads after every walk and after some changes at home.
--                   NOT set by "Load from cloud" alone (a device that loads
--                   then uploads after its next walk).
--   a cat profile   profiles.last_seen: set by every upsert_profile. The
--                   game sends one after every walk, when a room is joined
--                   and when the cat changes, while a walking name is saved.
--   Both columns already exist and are kept up to date; none is added. Two
--   plain indexes on them are added so the clean-up never scans the tables.
--   friendships, colony rows: they have no life of their own. They are
--   removed with the profile they belong to (below), not by their own age.
--
-- WHAT IS REMOVED WITH A PROFILE: exactly what "Delete my online data"
-- removes (ww_purge_player): its friend links on both sides, its colony
-- invites, its waiting trade offers (marked cancelled), its colony
-- membership, and the colony with its cats, feeds and trades IF nobody else
-- is left in it. A partner who still plays keeps the colony and every cat.
-- ALSO REMOVED, as housekeeping (each counted separately in the answer):
--   friend links older than the cut-off where one side has no profile at all
--   colonies older than the cut-off with no member left
--   colony invites that expired more than a day ago
--
-- THE CAP: at most max_rows saves AND at most max_rows profiles per run,
-- oldest first. "more": true in the answer means another run has work left.
--
-- A removed player who comes back: the game still has everything on the
-- device. Its next walk makes a new profile and (if linked) uploads the
-- save again under the same code. Friend links and colony sharing are gone.
--
-- Changes for players: none until step 5. Safe to re-run: yes (it never
-- turns the clean-up on or off).
-- Rollback:
--   drop function if exists public.ww_cleanup_tick();
--   drop function if exists public.ww_cleanup(boolean, integer, integer);
--   drop function if exists public.ww_counts_sweep();
--   drop index if exists public.saves_updated_at_idx;
--   drop index if exists public.profiles_last_seen_idx;
--   (rows the clean-up has already deleted cannot be brought back)
do $$
begin
  if to_regprocedure('public.ww_purge_player(text)') is null or to_regclass('public.ww_cleanup_state') is null then
    raise exception 'Whisker Walk v10: steps 1 and 3 must be run before step 4.';
  end if;
end $$;

create index if not exists saves_updated_at_idx on public.saves (updated_at);
create index if not exists profiles_last_seen_idx on public.profiles (last_seen);

create or replace function public.ww_counts_sweep()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_today date := (now() at time zone 'utc')::date; v_rows integer; v_more integer;
begin
  delete from ww_counts c where c.bucket + make_interval(secs => c.window_secs) <= now();
  get diagnostics v_rows = row_count;
  update ww_salt s
     set salt = gen_random_uuid()::text || gen_random_uuid()::text, salt_day = v_today
   where s.salt_day < v_today;
  if found then
    delete from ww_counts c where c.visitor not in ('', '?');
    get diagnostics v_more = row_count;
    v_rows := v_rows + v_more;
  end if;
  return v_rows;
end $$;

create or replace function public.ww_cleanup(
  p_dry_run boolean default true, p_max_rows integer default 200, p_months integer default 12
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cutoff timestamptz;
  v_saves text[]; v_players text[];
  v_saves_total integer; v_players_total integer;
  v_friendships integer; v_members integer; v_colonies integer;
  v_orphans integer; v_empty integer; v_invites integer;
  v_saves_done integer := 0; v_players_done integer := 0;
  v_id text;
begin
  if p_dry_run is null or p_max_rows is null or p_months is null then
    raise exception 'Whisker Walk: ww_cleanup needs all three values (or none, for a dry run).';
  end if;
  if p_months < 6 then
    raise exception 'Whisker Walk: ww_cleanup refuses a cut-off under 6 months (asked for %).', p_months;
  end if;
  if p_max_rows < 1 or p_max_rows > 5000 then
    raise exception 'Whisker Walk: ww_cleanup takes between 1 and 5000 rows per run (asked for %).', p_max_rows;
  end if;
  v_cutoff := now() - make_interval(months => p_months);

  select count(*) into v_saves_total from saves s where s.updated_at < v_cutoff;
  select count(*) into v_players_total from profiles pr where pr.last_seen < v_cutoff;
  select coalesce(array_agg(t.code), '{}') into v_saves
    from (select s.code from saves s where s.updated_at < v_cutoff
           order by s.updated_at, s.code limit p_max_rows) t;
  select coalesce(array_agg(t.player_id), '{}') into v_players
    from (select pr.player_id from profiles pr where pr.last_seen < v_cutoff
           order by pr.last_seen, pr.player_id limit p_max_rows) t;

  select count(*) into v_friendships from friendships f
   where f.a_id = any (v_players) or f.b_id = any (v_players);
  select count(*) into v_members from colony_members m where m.player_id = any (v_players);
  select count(*) into v_colonies from colonies co
   where exists (select 1 from colony_members m where m.colony_id = co.id and m.player_id = any (v_players))
     and not exists (select 1 from colony_members m where m.colony_id = co.id and not (m.player_id = any (v_players)));
  select count(*) into v_orphans from friendships f
   where f.updated_at < v_cutoff
     and not (f.a_id = any (v_players) or f.b_id = any (v_players))
     and (not exists (select 1 from profiles pr where pr.player_id = f.a_id)
          or not exists (select 1 from profiles pr where pr.player_id = f.b_id));
  select count(*) into v_empty from colonies co
   where co.created_at < v_cutoff
     and not exists (select 1 from colony_members m where m.colony_id = co.id);
  select count(*) into v_invites from colony_invites ci where ci.expires_at < now() - interval '1 day';

  if not p_dry_run then
    -- the age is checked again on each row, so one touched a moment ago survives
    delete from saves s where s.code = any (v_saves) and s.updated_at < v_cutoff;
    get diagnostics v_saves_done = row_count;
    foreach v_id in array v_players loop
      perform 1 from profiles pr where pr.player_id = v_id and pr.last_seen < v_cutoff for update;
      if found then
        perform ww_purge_player(v_id);
        v_players_done := v_players_done + 1;
      end if;
    end loop;
    delete from friendships f
     where f.updated_at < v_cutoff
       and (not exists (select 1 from profiles pr where pr.player_id = f.a_id)
            or not exists (select 1 from profiles pr where pr.player_id = f.b_id));
    delete from colonies co
     where co.created_at < v_cutoff
       and not exists (select 1 from colony_members m where m.colony_id = co.id);
    delete from colony_invites ci where ci.expires_at < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'cutoff', v_cutoff,
    'saves', case when p_dry_run then cardinality(v_saves) else v_saves_done end,
    'profiles', case when p_dry_run then cardinality(v_players) else v_players_done end,
    'friendships', v_friendships,
    'colony_members', v_members,
    'colonies', v_colonies,
    'orphan_friendships', v_orphans,
    'empty_colonies', v_empty,
    'expired_invites', v_invites,
    'more', v_saves_total > cardinality(v_saves) or v_players_total > cardinality(v_players));
end $$;

create or replace function public.ww_cleanup_tick()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare st record; v_result jsonb;
begin
  select * into st from ww_cleanup_state s for update skip locked;
  if not found then return 'ok'; end if;
  if st.last_sweep is null or st.last_sweep < now() - interval '5 minutes' then
    perform ww_counts_sweep();
    update ww_cleanup_state s set last_sweep = now();
  end if;
  if st.enabled and (st.last_cleanup is null or st.last_cleanup < now() - interval '20 hours') then
    v_result := ww_cleanup(false, st.max_rows, st.months);
    update ww_cleanup_state s set last_cleanup = now(), last_result = v_result;
  end if;
  return 'ok';
end $$;

revoke execute on function public.ww_counts_sweep() from public, anon, authenticated;
revoke execute on function public.ww_cleanup(boolean, integer, integer) from public, anon, authenticated;
revoke execute on function public.ww_cleanup_tick() from public, authenticated;
grant execute on function public.ww_cleanup_tick() to anon;

notify pgrst, 'reload schema';

/* ══ STEP 0 — the header probe (optional, by hand, temporary) ═══════════
What: a throw-away function that tells you which request headers reach the
database and whether the address header can be forged. It returns header
NAMES and true/false answers only, never a value. Remove it when done.

1. Copy the lines between the markers into a NEW query and Run.

-- >>> STEP 0 start
create or replace function public.ww_header_probe(p_claim text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h json; x text; cf text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return jsonb_build_object('headers_readable', false);
  end;
  if h is null then return jsonb_build_object('headers_readable', false); end if;
  x := h ->> 'x-forwarded-for';
  cf := h ->> 'cf-connecting-ip';
  return jsonb_build_object(
    'headers_readable', true,
    'header_names', (select jsonb_agg(k order by k) from json_object_keys(h) k),
    'cf_present', cf is not null,
    'cf_is_claim', coalesce(cf = p_claim, false),
    'real_ip_present', (h ->> 'x-real-ip') is not null,
    'real_ip_is_claim', coalesce((h ->> 'x-real-ip') = p_claim, false),
    'real_ip_equals_cf', coalesce((h ->> 'x-real-ip') = cf, false),
    'xff_entries', coalesce(cardinality(string_to_array(x, ',')), 0),
    'xff_first_is_claim', coalesce(btrim(split_part(x, ',', 1)) = p_claim, false),
    'xff_last_is_claim', coalesce(btrim(regexp_replace(x, '^.*,', '')) = p_claim, false),
    'xff_first_equals_cf', coalesce(btrim(split_part(x, ',', 1)) = cf, false),
    'xff_last_equals_cf', coalesce(btrim(regexp_replace(x, '^.*,', '')) = cf, false),
    'visitor_known_now', public.ww_visitor() is not null);
end $$;
revoke execute on function public.ww_header_probe(text) from public, authenticated;
grant execute on function public.ww_header_probe(text) to anon;
notify pgrst, 'reload schema';
-- <<< STEP 0 end

2. From a terminal, with the project's URL and public (anon) key, ask twice.
   First honestly:
     curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/ww_header_probe" \
       -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
       -d '{"p_claim": "203.0.113.9"}'
   Then pretending to be the made-up address 203.0.113.9:
     curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/ww_header_probe" \
       -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
       -H "cf-connecting-ip: 203.0.113.9" -H "x-real-ip: 203.0.113.9" \
       -H "x-forwarded-for: 203.0.113.9" \
       -d '{"p_claim": "203.0.113.9"}'

3. Read the answers:
   - cf_present true in both, and cf_is_claim FALSE in the second: the
     default is right. Nothing to change. visitor_known_now should be true.
   - cf_present false: look at header_names for the address header that IS
     there, and at which *_is_claim stays false in the second call (that one
     cannot be forged). Then, for example:
       update public.ww_salt set source = 'x-real-ip';
     ('xff-last' when the last x-forwarded-for entry is the one that stays
     honest; 'xff-first' only if xff_first_is_claim is FALSE when forged.)
   - every candidate's *_is_claim is true in the second call: no header can
     be trusted. Run:  update public.ww_salt set source = 'off';
     The shared v8/v9 numbers then apply to everyone (today's behaviour,
     except that a right delete still cannot be blocked).

4. Remove the probe:
     drop function if exists public.ww_header_probe(text);
     notify pgrst, 'reload schema';
─────────────────────────────────────────────────────────────────────── */

/* ══ STEP 5 — turn the clean-up on (by hand, later) ═════════════════════
THIS IS THE ONLY DESTRUCTIVE PART OF THE FILE, and it stays off until you do
this. Deleted rows cannot be brought back (except from Supabase's own
backups, if the plan has them).

1. Dry run. Deletes nothing; shows what a real run would remove:
     select public.ww_cleanup() as would_remove;
   On today's database every count should be 0.

2. Optional: one real run by hand, small, to see it work:
     select public.ww_cleanup(false, 20, 12) as removed;

3. Turn the scheduled clean-up on (off again: set enabled = false):
     update public.ww_cleanup_state set enabled = true;
   Change the rule: set months = 12 (6 or more), max_rows = 200 (per run).

4. Schedule the tick. pg_cron is NOT installed on the live project, so the
   proposal is the existing GitHub keep-alive job: add a second request to
   .github/workflows/keepalive.yml, beside the ping,
     POST $SUPABASE_URL/rest/v1/rpc/ww_cleanup_tick   with the body {}
   using the same public key. It runs Monday and Thursday; each run removes
   at most max_rows saves and max_rows profiles. THE WORKFLOW HAS NOT BEEN
   EDITED: adding that request is what makes the job delete data, so it is
   your call. Keep the ping as it is (the tick writes; the ping must not).
   Alternative, if you enable pg_cron (Dashboard, Database, Extensions):
     select cron.schedule('ww-cleanup', '23 4 * * *', 'select public.ww_cleanup_tick()');
   Both can run together; the tick does the real clean-up at most once every
   20 hours whoever calls it.

5. What the last scheduled run removed (counts only):
     select s.enabled as cleanup_on, s.last_sweep as last_sweep,
            s.last_cleanup as last_cleanup, s.last_result as last_result
       from public.ww_cleanup_state s;
─────────────────────────────────────────────────────────────────────── */
