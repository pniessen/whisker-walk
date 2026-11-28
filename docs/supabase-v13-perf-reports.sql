-- Whisker Walk v13: opt-in performance numbers (rides the same switch as crash reports).
--
-- NOT RUN. The owner runs this by hand in the Supabase SQL editor; nothing in
-- the game or its tests touches the live database. Until it is run, a device
-- with "Send crash reports and performance numbers" switched on just has its
-- insert refused, silently (the game drops a failed send and never retries).
--
-- Adds one table, perf_reports, that the public (anon) key can INSERT into and
-- nothing else. No select, update or delete for anon or authenticated: the
-- maintainer reads rows with the service key, exports them to a JSON file and
-- runs  node scripts/perfreport.mjs --json rows.json. It changes no existing
-- table or function.
--
-- A row is what src/perfupload.js sends: kind ('summary' once a day per install,
-- 'rung' when the graphics setting changes, at most 10 a session), the time to
-- the minute, the device model id, memory, an app flag, the build stamp, the
-- place id, graphics rung and tier word, median and p95 frame ms, slow-frame
-- share, thermal state, low-power flag, draws, triangles, first-paint and
-- first-walk seconds, and a random per-install token (made on the device, not
-- derived from the cat, a name, a save code or any device id). No name, cat
-- data, save code or IP address is sent or stored by the game.
--
-- Not covered here, on purpose: a server-side rate limit. The game sends at most
-- 1 summary a day plus 10 rung rows a session per install; the checks below
-- bound each row. If the table is ever flooded, stop it at once with:
--   drop policy perf_reports_insert on public.perf_reports;
-- To remove old rows:  delete from public.perf_reports where created_at < now() - interval '180 days';

create table if not exists public.perf_reports (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in ('summary', 'rung')),
  time          text not null default '' check (char_length(time) <= 20),
  device        text not null default '' check (char_length(device) <= 32 and device ~ '^[A-Za-z0-9,_-]*$'),
  memory_gb     numeric check (memory_gb is null or memory_gb between 0.1 and 4095),
  app           boolean not null default false,
  build         text not null default '' check (char_length(build) <= 40),
  place         text not null default '' check (char_length(place) <= 24),
  rung          smallint check (rung is null or rung between 0 and 7),
  tier          text not null default '' check (char_length(tier) <= 16),
  median_ms     numeric check (median_ms is null or median_ms between 0 and 1000),
  p95_ms        numeric check (p95_ms is null or p95_ms between 0 and 1000),
  slow_share    numeric check (slow_share is null or slow_share between 0 and 1),
  thermal       text not null default 'nominal' check (thermal in ('nominal', 'fair', 'serious', 'critical')),
  low_power     boolean not null default false,
  draws         integer check (draws is null or draws between 0 and 1000000),
  triangles     bigint check (triangles is null or triangles between 0 and 1000000000),
  first_frame_s numeric check (first_frame_s is null or first_frame_s between 0 and 3600),
  first_walk_s  numeric check (first_walk_s is null or first_walk_s between 0 and 86400),
  token         text not null default '' check (token ~ '^([0-9a-f]{32})?$')
);

create index if not exists perf_reports_device_day on public.perf_reports (device, created_at desc);
create index if not exists perf_reports_day on public.perf_reports (created_at desc);

alter table public.perf_reports enable row level security;

-- Nothing for anon or signed-in users except adding a row.
revoke all on public.perf_reports from anon, authenticated;
grant insert on public.perf_reports to anon;

drop policy if exists perf_reports_insert on public.perf_reports;
create policy perf_reports_insert on public.perf_reports
  for insert to anon
  with check (true);  -- the column checks above bound every row; there is no select policy at all
