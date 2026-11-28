// The device performance log, pure part (no DOM, no three): the frame-gap tally, the sanitised row, the capped
// ring in localStorage, the summary and the CSV. src/perflog.js is the sampler that feeds it; the For grown-ups
// settings read it back. It never sends anything anywhere: the owner copies it out by hand.
//
// What a row holds: numbers and short ids only (when to the minute, place id, rung, frame times, heat, draws,
// memory, device model, build). No names, no cat data, no save code.

export const PERF_KEY = 'whisker-walk-perf-log';
export const PERF_CAPACITY = 300;
export const SAMPLE_MS = 30000;
export const MIN_FRAMES = 100;     // a window with fewer frames than this is not worth a row
export const SLOW_MS = 40;         // a frame slower than this (under 25 fps) counts as slow
export const LOW_RUNG_FROM = 3;    // rung 3 (LOW) and anything below it
const BINS = 101;                  // 1 ms bins from 0 to 99, then one for 100 ms and more

/** The frame-gap tally: one add per frame, a typed array and two numbers, nothing allocated. */
export function createGapTally() {
  const bins = new Uint32Array(BINS);
  let n = 0;
  let slow = 0;
  function add(dt) {
    const b = dt >= BINS - 1 ? BINS - 1 : dt < 0 ? 0 : dt | 0;
    bins[b]++;
    n++;
    if (dt > SLOW_MS) slow++;
  }
  function percentile(q) {
    if (n === 0) return 0;
    const target = Math.max(1, Math.ceil(q * n));
    let seen = 0;
    for (let i = 0; i < BINS; i++) {
      seen += bins[i];
      if (seen >= target) return i + 0.5;
    }
    return BINS - 1;
  }
  return {
    add,
    percentile,
    get count() { return n; },
    slowShare() { return n ? slow / n : 0; },
    reset() { bins.fill(0); n = 0; slow = 0; },
  };
}

const ID = /^[a-z0-9][a-z0-9-]{0,23}$/;
const TIER = /^[a-z0-9][a-z0-9 -]{0,15}$/i;
const MODEL = /^[A-Za-z0-9,_-]{1,32}$/;
const BUILD = /^[A-Za-z0-9._+-]{1,40}$/;
const THERMAL = ['nominal', 'fair', 'serious', 'critical'];

const num = (v, lo, hi, digits = 1) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
  ? Math.round(v * 10 ** digits) / 10 ** digits : null);
const txt = (v, re) => (typeof v === 'string' && re.test(v) ? v : '');

/** ISO time rounded down to the minute ('2026-11-28T10:31Z'). */
export function minuteStamp(ms) {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16) + 'Z' : '';
}

/** Whatever is given becomes a plain row with only the known fields, or null. Unknown fields are dropped. */
export function cleanRow(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = raw.kind === 'start' ? 'start' : raw.kind === 'walk' ? 'walk' : null;
  if (!kind) return null;
  const row = {
    kind,
    time: txt(raw.time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/),
    device: txt(raw.device, MODEL),
    build: txt(raw.build, BUILD),
    memoryGB: num(raw.memoryGB, 0.1, 4095, 1),
  };
  if (kind === 'start') {
    row.app = raw.app === true;
    row.firstFrameS = num(raw.firstFrameS, 0, 3600, 1);
    row.firstWalkS = num(raw.firstWalkS, 0, 86400, 1);
    row.launch = num(raw.launch, 0, 1e12, 0);
    return row;
  }
  row.place = txt(raw.place, ID);
  row.rung = num(raw.rung, 0, 7, 0);
  row.tier = txt(raw.tier, TIER);
  row.medianMs = num(raw.medianMs, 0, 1000, 1);
  row.p95Ms = num(raw.p95Ms, 0, 1000, 1);
  row.slowShare = num(raw.slowShare, 0, 1, 3);
  row.frames = num(raw.frames, 0, 1e7, 0);
  row.thermal = THERMAL.includes(raw.thermal) ? raw.thermal : 'nominal';
  row.lowPower = raw.lowPower === true;
  row.draws = num(raw.draws, 0, 1e6, 0);
  row.triangles = num(raw.triangles, 0, 1e9, 0);
  return row;
}

/** Append one row and keep the newest `cap`. Returns a new array. */
export function addRow(rows, row, cap = PERF_CAPACITY) {
  const clean = cleanRow(row);
  const list = Array.isArray(rows) ? rows : [];
  if (!clean) return list.slice(-cap);
  return [...list, clean].slice(-cap);
}

export function loadRows(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(PERF_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanRow).filter(Boolean).slice(-PERF_CAPACITY);
  } catch { return []; }
}

export function saveRows(storage, rows) {
  try { storage.setItem(PERF_KEY, JSON.stringify(rows.slice(-PERF_CAPACITY))); return true; } catch { return false; }
}

export function clearRows(storage) {
  try { storage.removeItem(PERF_KEY); } catch { /* nothing to clear */ }
}

export const CSV_COLUMNS = Object.freeze([
  'time', 'kind', 'device', 'place', 'rung', 'tier', 'medianMs', 'p95Ms', 'slowShare', 'frames',
  'thermal', 'lowPower', 'draws', 'triangles', 'memoryGB', 'app', 'firstFrameS', 'firstWalkS', 'build',
]);

export function toCsv(rows) {
  // a model id such as iPad7,11 holds a comma, so a cell with one is quoted
  const cell = (v) => {
    const t = v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
    return t.includes(',') ? `"${t}"` : t;
  };
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => cell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** One entry per place from the walk rows: windows, median of the medians and of the p95s, usual rung, slow share, share of frames on LOW or lower. */
export function summarize(rows) {
  const by = new Map();
  for (const r of rows) {
    if (r.kind !== 'walk' || !r.place) continue;
    if (!by.has(r.place)) by.set(r.place, []);
    by.get(r.place).push(r);
  }
  const out = [];
  for (const [place, list] of by) {
    const w = (r) => r.frames || 1;
    const total = list.reduce((n, r) => n + w(r), 0);
    const rungs = new Map();
    for (const r of list) rungs.set(r.rung, (rungs.get(r.rung) ?? 0) + w(r));
    const rung = [...rungs.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      place,
      windows: list.length,
      medianMs: Math.round(median(list.map((r) => r.medianMs ?? 0)) * 10) / 10,
      p95Ms: Math.round(median(list.map((r) => r.p95Ms ?? 0)) * 10) / 10,
      slowShare: Math.round(list.reduce((n, r) => n + (r.slowShare ?? 0) * w(r), 0) / total * 1000) / 1000,
      lowShare: Math.round(list.filter((r) => (r.rung ?? 0) >= LOW_RUNG_FROM).reduce((n, r) => n + w(r), 0) / total * 1000) / 1000,
      rung,
    });
  }
  return out.sort((a, b) => a.place.localeCompare(b.place));
}

/** Plain lines for the settings box. */
export function summaryLines(rows, wordFor = (s) => s) {
  const list = summarize(rows);
  if (!list.length) return [wordFor('Nothing recorded yet. Play a walk and look again.')];
  return list.map((s) => `${s.place}: ${s.medianMs} ms usual, ${s.p95Ms} ms at its worst, setting ${s.rung}, ${Math.round(s.slowShare * 100)}% slow`);
}
