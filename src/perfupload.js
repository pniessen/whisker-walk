// The upload half of the performance log (lazy chunk; main.js loads it only when "Send crash reports and performance
// numbers" is on). Same switch ('crashUpload'), same sender pattern and same silence as src/crashlog.js: a failed send
// is dropped, never retried, and nothing here may throw into the game.
//
// Two kinds of row go out, built from scratch by toPerfRow (a strict allow-list: a field not named there cannot be sent):
//   'summary': at most one per day per install: the place walked most in the last day, from the device's own log.
//   'rung':    when the graphics setting changes during a walk; at most RUNG_ROWS_PER_SESSION per session.
// Plus a random per-install token (made here, kept in its own storage key, never derived from the cat, a name, a save
// code or a device id) so rows from one install can be told apart. No names, no cat data, no save code, no IP.
import { getSupabaseClient } from './net.js';
import { IS_FAMILY } from './familyflag.js';
import { loadRows, minuteStamp } from './perflogcore.js';

export const UPLOAD_KEY = 'whisker-walk-perf-upload';
export const RUNG_ROWS_PER_SESSION = 10;
const DAY_MS = 86400000;

const THERMAL = ['nominal', 'fair', 'serious', 'critical'];
const num = (v, lo, hi, digits = 1) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
  ? Math.round(v * 10 ** digits) / 10 ** digits : null);
const txt = (v, re) => (typeof v === 'string' && re.test(v) ? v : '');

/** A random 32-hex-character token. Nothing about the player or device goes in. */
export function makeToken(rand = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  if (rand?.getRandomValues) rand.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readState(storage) {
  try {
    const s = JSON.parse(storage.getItem(UPLOAD_KEY) ?? '{}');
    return {
      token: txt(s?.token, /^[0-9a-f]{32}$/),
      day: txt(s?.day, /^\d{4}-\d{2}-\d{2}$/),
    };
  } catch { return { token: '', day: '' }; }
}

function writeState(storage, st) {
  try { storage.setItem(UPLOAD_KEY, JSON.stringify({ token: st.token, day: st.day })); } catch { /* nothing kept: a new token next time */ }
}

/** The one row the table takes (docs/supabase-v13-perf-reports.sql). Every field is rebuilt and clamped; anything else is dropped. */
export function toPerfRow(raw, token) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    kind: r.kind === 'summary' ? 'summary' : 'rung',
    time: txt(r.time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/),
    device: txt(r.device, /^[A-Za-z0-9,_-]{1,32}$/),
    memory_gb: num(r.memoryGB, 0.1, 4095, 1),
    app: r.app === true,
    build: txt(r.build, /^[A-Za-z0-9._+-]{1,40}$/),
    place: txt(r.place, /^[a-z0-9][a-z0-9-]{0,23}$/),
    rung: num(r.rung, 0, 7, 0),
    tier: txt(r.tier, /^[a-z0-9][a-z0-9 -]{0,15}$/i),
    median_ms: num(r.medianMs, 0, 1000, 1),
    p95_ms: num(r.p95Ms, 0, 1000, 1),
    slow_share: num(r.slowShare, 0, 1, 3),
    thermal: THERMAL.includes(r.thermal) ? r.thermal : 'nominal',
    low_power: r.lowPower === true,
    draws: num(r.draws, 0, 1e6, 0),
    triangles: num(r.triangles, 0, 1e9, 0),
    first_frame_s: num(r.firstFrameS, 0, 3600, 1),
    first_walk_s: num(r.firstWalkS, 0, 86400, 1),
    token: txt(token, /^[0-9a-f]{32}$/),
  };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The device's log rows from the last day → one summary (the place with most windows), or null if there are none. */
export function dailySummary(rows, nowMs) {
  const since = minuteStamp(nowMs - DAY_MS);
  const walks = rows.filter((r) => r.kind === 'walk' && r.place && r.time >= since);
  if (!walks.length) return null;
  const counts = new Map();
  for (const r of walks) counts.set(r.place, (counts.get(r.place) ?? 0) + 1);
  const place = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const mine = walks.filter((r) => r.place === place);
  const last = mine[mine.length - 1];
  const start = [...rows].reverse().find((r) => r.kind === 'start' && r.firstWalkS !== null && r.firstWalkS !== undefined);
  const slowW = mine.reduce((n, r) => n + (r.frames || 1), 0);
  return {
    kind: 'summary', time: minuteStamp(nowMs), device: last.device, build: last.build, memoryGB: last.memoryGB,
    app: start?.app === true, place, rung: last.rung, tier: last.tier,
    medianMs: median(mine.map((r) => r.medianMs ?? 0)), p95Ms: median(mine.map((r) => r.p95Ms ?? 0)),
    slowShare: mine.reduce((n, r) => n + (r.slowShare ?? 0) * (r.frames || 1), 0) / slowW,
    thermal: last.thermal, lowPower: last.lowPower, draws: last.draws, triangles: last.triangles,
    firstFrameS: start?.firstFrameS ?? null, firstWalkS: start?.firstWalkS ?? null,
  };
}

/**
 * enabled(): the 'crashUpload' switch, read at every offer. send(row) → Promise (rejections swallowed).
 * offer(walkRow) is called with each finished walk row from the sampler.
 */
export function createPerfUploader({ enabled, send, storage, now = () => Date.now(), isApp = false, limit = RUNG_ROWS_PER_SESSION, random = globalThis.crypto }) {
  let rungRows = 0;
  let lastRung = null;
  const push = (row) => { Promise.resolve().then(() => send(row)).catch(() => {}); };
  return {
    offer(walk) {
      try {
        if (IS_FAMILY || !enabled() || typeof send !== 'function' || !walk || walk.kind !== 'walk') return false;
        const st = readState(storage);
        let sent = false;
        // the daily summary, once per calendar day (UTC) per install
        const today = minuteStamp(now()).slice(0, 10);
        if (today && st.day !== today) {
          const sum = dailySummary(loadRows(storage), now());
          if (sum) {
            if (!st.token) st.token = makeToken(random);
            st.day = today;
            writeState(storage, st);
            push(toPerfRow({ ...sum, app: isApp || sum.app }, st.token));
            sent = true;
          }
        }
        // a setting change: the first window only sets the baseline
        const rung = num(walk.rung, 0, 7, 0);
        const changed = lastRung !== null && rung !== null && rung !== lastRung;
        if (rung !== null) lastRung = rung;
        if (changed && rungRows < limit) {
          rungRows += 1;
          if (!st.token) { st.token = makeToken(random); writeState(storage, st); }
          push(toPerfRow({ ...walk, kind: 'rung', app: isApp }, st.token));
          sent = true;
        }
        return sent;
      } catch { return false; }
    },
    get rungRows() { return rungRows; },
  };
}

/** The real send: the shared client (net.js), insert only. Not on the family build, not without keys, not offline. */
export function livePerfSender({ url, key, nav = globalThis.navigator }) {
  return async (row) => {
    if (IS_FAMILY || !url || !key || nav?.onLine === false) return;
    const client = await getSupabaseClient(url, key);
    if (!client) return;
    await client.from('perf_reports').insert(row);
  };
}

export function startPerfUpload({ settings, storage, send, isApp, now }) {
  return createPerfUploader({ enabled: () => settings?.get?.('crashUpload') === true, send, storage, isApp, now });
}
