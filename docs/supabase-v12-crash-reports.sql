-- Whisker Walk v12: opt-in crash reports.
--
-- NOT RUN. The owner runs this by hand in the Supabase SQL editor; nothing in
-- the game or its tests touches the live database. Until it is run, a device
-- with "Send crash reports to the game maker" switched on just has its
-- insert refused, silently (the game drops a failed send and never retries).
--
-- What it does: adds one table, crash_reports, that the public (anon) key can
-- INSERT into and nothing else. No select, update or delete for anon or
-- authenticated: the maintainer reads rows with the service key
-- (scripts/crashreports.mjs). It changes no existing table or function.
--
-- A row is what src/crashlog.js sends: a hash id of the failure, its kind, a
-- trimmed message (quotes, links, codes and numbers already taken out on the
-- device), the script file name and line, the place id, the build stamp, a
-- coarse device/quality word, two booleans, up to 8 step names and a count.
-- No name, room code, save or user id. The id is the primary key, so the same
-- failure from the same build is stored once ("insert ... conflict" from the
-- second device is refused harmlessly).
--
-- Not covered here, on purpose: a per-visitor rate limit on the server. The
-- game sends at most 5 per session; the size checks below bound each row. If
-- the table is ever flooded, drop the insert policy to stop it at once:
--   drop policy crash_reports_insert on public.crash_reports;
-- To remove old rows:  delete from public.crash_reports where created_at < now() - interval '90 days';

create table if not exists public.crash_reports (
  id         text primary key check (id ~ '^[0-9a-f]{8,16}$'),
  created_at timestamptz not null default now(),
  kind       text not null check (char_length(kind) between 1 and 16),
  message    text not null check (char_length(message) <= 160),
  file       text not null default '' check (char_length(file) <= 60),
  line       integer not null default 0 check (line between 0 and 10000000),
  place      text not null default '' check (char_length(place) <= 24),
  build      text not null default '' check (char_length(build) <= 24),
  tier       text not null default '' check (char_length(tier) <= 24),
  couch      boolean not null default false,
  room       boolean not null default false,
  crumbs     jsonb not null default '[]'::jsonb
             check (jsonb_typeof(crumbs) = 'array' and jsonb_array_length(crumbs) <= 8 and pg_column_size(crumbs) <= 400),
  count      integer not null default 1 check (count between 1 and 1000000)
);

alter table public.crash_reports enable row level security;

-- Nothing for anon or signed-in users except adding a row.
revoke all on public.crash_reports from anon, authenticated;
grant insert on public.crash_reports to anon;

drop policy if exists crash_reports_insert on public.crash_reports;
create policy crash_reports_insert on public.crash_reports
  for insert to anon
  with check (true);  -- the column checks above bound every row; there is no select policy at all
