// The crash log: a small, sanitised, bounded copy of the last failures that
// stays on this device so a grown-up can read what happened after the fact
// (the perf readout shows it as 'earlier', Settings can copy it), and, only
// when a grown-up has switched "Send crash reports to the game maker" on,
// sends each NEW failure once. Loaded lazily (main.js), never on the start-up
// path.
//
// What is kept, per failure: its kind, a short message with every quoted
// string, URL, code-like word, email and number run taken out, the script
// file's name and line (never a URL or query), the place id, the build stamp,
// a coarse device/quality word, two yes/no flags (couch mode, an online
// room), a time, a count and the last few breadcrumbs (step names). Never: a
// pet name, a room code, a save, a user id, free text.
//
// Everything is wrapped: nothing in here may throw into the game, a full or
// disabled localStorage just means nothing is kept, and a failed upload is
// silent and is not retried.

import { getSupabaseClient } from './net.js';
import { IS_FAMILY } from './familyflag.js';

export const CRASH_KEY = 'whisker-walk-crash-log';
export const CRASH_CAPACITY = 20;
export const CRASH_MESSAGE_MAX = 140;
export const CRASH_UPLOADS_PER_SESSION = 5;
const CRUMB_SHOWN = 8;
export const WRITE_GAP_MS = 2000;

// ---- sanitising ---------------------------------------------------------

// A message with anything that could carry a name or a code removed. Quoted
// text goes (a pet name is nearly always quoted or follows name=), URLs go
// whole, key=value pairs for the sensitive keys go, and so do emails, long
// numbers, ids and words that look like a room code (4 to 8 capitals/digits).
export function sanitizeMessage(text) {
  let s;
  try { s = String(text ?? ''); } catch { return ''; }
  s = s
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '<url>')
    .replace(/(['"`])(?:(?!\1).)*\1/g, "'…'")
    .replace(/\b(name|pet|cat|player|room|code|secret|id|token|key|email|user|owner|from|to)\s*[:=]\s*\S+/gi, '$1=…')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[A-Z0-9]{3,}-[A-Z0-9]{3,}(?:-[A-Z0-9]{3,})*\b/g, '<code>')
    .replace(/\b[A-Z0-9]{4,8}\b/g, '<code>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<id>')
    .replace(/\d{6,}/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > CRASH_MESSAGE_MAX ? `${s.slice(0, CRASH_MESSAGE_MAX - 1)}…` : s;
}

const word = (v, max) => (typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9._:/-]/g, '').slice(0, max) : '');

// The file name only ("main-abc.js"), from a name or a URL.
function fileName(v) {
  if (typeof v !== 'string') return '';
  const path = v.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf('/') + 1).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60);
}

// cyrb53-style hash of kind + message + file:line, as 14 hex characters.
export function crashId(kind, message, file, line) {
  const str = `${kind}|${message}|${file}:${line}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return (hex(h2) + hex(h1)).slice(0, 14);
}

// A diagnostics entry plus the context → the one shape that is stored,
// copied and sent. Nothing else from the entry gets through.
export function toRecord(entry, ctx = {}, crumbs = []) {
  const kind = word(entry?.kind, 16) || 'error';
  const message = sanitizeMessage(entry?.message);
  const file = fileName(entry?.source);
  const line = Number.isInteger(entry?.line) && entry.line > 0 && entry.line < 10_000_000 ? entry.line : 0;
  const count = Number.isInteger(entry?.count) && entry.count > 0 ? Math.min(entry.count, 1_000_000) : 1;
  const t = Number.isFinite(entry?.time) ? Math.floor(entry.time) : 0;
  return {
    id: crashId(kind, message, file, line),
    t,
    kind,
    msg: message,
    file,
    line,
    place: word(ctx.place, 24),
    build: word(ctx.build, 24),
    tier: word(ctx.tier, 24),
    couch: ctx.couch === true,
    room: ctx.room === true,
    count,
    crumbs: (Array.isArray(crumbs) ? crumbs : []).map((c) => word(c, 24)).filter(Boolean).slice(-CRUMB_SHOWN),
  };
}

// A record read back from storage (which could hold anything) → a clean one, or null.
function cleanStored(r) {
  if (!r || typeof r !== 'object') return null;
  const rec = toRecord(
    { kind: r.kind, message: r.msg, source: r.file, line: r.line, count: r.count, time: r.t },
    { place: r.place, build: r.build, tier: r.tier, couch: r.couch, room: r.room },
    r.crumbs,
  );
  return rec.msg || rec.kind ? rec : null;
}

// ---- storage ------------------------------------------------------------

export function loadRecords(storage) {
  try {
    const raw = storage?.getItem(CRASH_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map(cleanStored).filter(Boolean).slice(-CRASH_CAPACITY);
  } catch {
    return [];
  }
}

// Adds (or, for the same failure, updates) one record and writes the list
// back, newest last, at most CRASH_CAPACITY. Returns true if it was written.
export function saveRecord(storage, rec) {
  try {
    const list = loadRecords(storage);
    const at = list.findIndex((r) => r.id === rec.id);
    if (at >= 0) list.splice(at, 1);
    list.push(rec);
    if (list.length > CRASH_CAPACITY) list.splice(0, list.length - CRASH_CAPACITY);
    storage.setItem(CRASH_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ---- the report ---------------------------------------------------------

function stamp(t) {
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : '?';
}

export function formatReport(records, build = '') {
  const list = (Array.isArray(records) ? records : []).slice(-CRASH_CAPACITY);
  const head = `Whisker Walk crash report · build ${word(build, 24) || '?'} · ${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
  if (!list.length) return `${head}\nNothing has gone wrong on this device.`;
  const body = list.slice().reverse().map((r) => {
    const where = r.file ? ` (${r.file}${r.line ? `:${r.line}` : ''})` : '';
    const times = r.count > 1 ? ` x${r.count}` : '';
    const lines = [
      `${stamp(r.t)} ${r.kind}${times} · ${r.msg}${where}`,
      `  place ${r.place || '?'} · build ${r.build || '?'} · ${r.tier || '?'} · couch ${r.couch ? 'yes' : 'no'} · room ${r.room ? 'yes' : 'no'}`,
    ];
    if (r.crumbs?.length) lines.push(`  steps: ${r.crumbs.join(' > ')}`);
    return lines.join('\n');
  });
  return `${head}\n${body.join('\n')}`;
}

// ---- upload -------------------------------------------------------------

// The row the table takes (docs/supabase-v12-crash-reports.sql): the record
// without its time (the table stamps created_at itself).
export function toRow(rec) {
  return {
    id: rec.id, kind: rec.kind, message: rec.msg, file: rec.file, line: rec.line,
    place: rec.place, build: rec.build, tier: rec.tier, couch: rec.couch, room: rec.room,
    crumbs: rec.crumbs, count: rec.count,
  };
}

// send(row) → Promise (rejections are swallowed). enabled() is read at the
// moment of each crash, so switching the setting off stops everything at once.
export function createUploader({ enabled, send, limit = CRASH_UPLOADS_PER_SESSION }) {
  const seen = new Set();
  let sentCount = 0;
  return {
    offer(rec) {
      try {
        if (!enabled() || typeof send !== 'function') return false;
        if (seen.has(rec.id) || sentCount >= limit) return false;
        seen.add(rec.id);
        sentCount += 1;
        Promise.resolve().then(() => send(toRow(rec))).catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
    get sent() { return sentCount; },
  };
}

// The real send: the shared client (net.js), an insert and nothing read back
// (the table allows insert only). Not on the family build, not without the
// project's keys, not while the browser says it is offline.
export function liveSender({ url, key, nav = globalThis.navigator }) {
  return async (row) => {
    if (IS_FAMILY || !url || !key || nav?.onLine === false) return;
    const client = await getSupabaseClient(url, key);
    if (!client) return;
    await client.from('crash_reports').insert(row);
  };
}

// ---- wiring -------------------------------------------------------------

// diag: the diagnostics record. context() → { place, build, tier, couch, room }.
// settings: has get('crashUpload'). send: see liveSender (a fake in tests).
export function startCrashLog({ diag, storage, settings, context, send, limit, now = () => Date.now() }) {
  try {
    diag.setEarlier(loadRecords(storage));
    const uploader = createUploader({ enabled: () => settings?.get?.('crashUpload') === true, send, limit });
    // A throw on every frame is the same failure again and again: it is
    // written at most once per WRITE_GAP_MS (its count catches up then).
    const lastWrite = new Map();
    const keep = (entry) => {
      try {
        const rec = toRecord(entry, safeContext(context), diag.crumbs());
        const at = now();
        const prev = lastWrite.get(rec.id);
        if (prev !== undefined && at - prev < WRITE_GAP_MS) return;
        lastWrite.set(rec.id, at);
        if (lastWrite.size > 100) lastWrite.clear();
        saveRecord(storage, rec);
        uploader.offer(rec);
      } catch { /* never a second failure */ }
    };
    diag.setSink(keep);
    // Anything that failed before this chunk arrived.
    for (const e of diag.entries()) keep(e);
    return { uploader };
  } catch {
    return null;
  }
}

function safeContext(context) {
  try { return context?.() ?? {}; } catch { return {}; }
}

// What Settings' Copy report uses.
export function reportText(storage, build) {
  return formatReport(loadRecords(storage), build);
}
