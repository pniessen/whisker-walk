// A small record of what went wrong, for a grown-up to read.
//
// On a child's iPad a console.warn goes nowhere, so the failures that matter
// (a frame that throws, the graphics lost, a save or a room that failed) are
// also noted here, and the perf readout (ui/perfhud.js) shows the last few.
//
// It stays on this device, in memory. (The crash log, src/crashlog.js, may
// keep a sanitised copy of the last few on this device, and sends one only
// if a grown-up has switched "Send crash reports" on: see docs/PRIVACY.md.)
// An entry keeps only the kind, a short message and where it came from (the
// script's file name and line, never a full URL), so no pet name, room code
// or query string can end up in it. Repeats of the same failure collapse
// into one entry with a count, so a throw every frame cannot push everything
// else out. Every call is wrapped: noting a failure must never be a second
// failure.
//
// Beside the failures it keeps the renderer's memory counts read at each walk
// end (geometries, textures, shader programs: numbers only), in a small ring
// of their own so a reading can never push a failure out. They stay in
// memory like everything else here: never stored, never sent.

export const DIAG_CAPACITY = 30;
export const DIAG_MESSAGE_MAX = 140;
export const DIAG_MEMORY_CAPACITY = 5;
export const CRUMB_CAPACITY = 8;

const count = (n) => (Number.isFinite(n) ? n : 0);

// A one-line, bounded description of anything that can be thrown. Never
// throws itself: an object with a throwing getter or a circular object still
// gets a line.
export function describeError(err) {
  let text;
  try {
    if (err === null) text = 'null';
    else if (err === undefined) text = 'undefined';
    else if (typeof err === 'string') text = err;
    else if (typeof err === 'object' && typeof err.message === 'string') {
      const name = typeof err.name === 'string' && err.name ? err.name : 'Error';
      text = err.message ? `${name}: ${err.message}` : name;
    } else if (typeof err === 'object') {
      try { text = JSON.stringify(err); } catch { text = undefined; }
      if (typeof text !== 'string') text = Object.prototype.toString.call(err);
    } else text = String(err);
  } catch {
    text = 'unreadable error';
  }
  return clip(text);
}

// URLs lose their query and fragment (they could carry a room code), then
// whitespace collapses and the line is cut to DIAG_MESSAGE_MAX.
function clip(text) {
  const flat = String(text)
    .replace(/(\bhttps?:\/\/[^\s?#]*)[?#]\S*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > DIAG_MESSAGE_MAX ? `${flat.slice(0, DIAG_MESSAGE_MAX - 1)}…` : flat;
}

// "https://host/whisker-walk/assets/main-abc.js?v=1" → "main-abc.js".
function fileOf(source) {
  if (typeof source !== 'string' || !source) return '';
  const path = source.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf('/') + 1).slice(0, 60);
}

export function createDiagnostics({ capacity = DIAG_CAPACITY, now = () => Date.now() } = {}) {
  const entries = []; // oldest first; the newest (or newest repeat) is last
  const readings = []; // memory counts, oldest first
  let total = 0;
  // Breadcrumbs: the last few step names (a place id, a ride, a mission step),
  // never free text, kept so a crash can say what led up to it.
  const crumbs = [];
  // The crash log (src/crashlog.js, a lazy chunk) listens here once it has
  // loaded; entries from earlier loads of the page are kept in `earlier`.
  let sink = null;
  let earlier = [];
  // Bumped on every note and every reading, so a reader can skip a redraw
  // when nothing changed.
  let version = 0;

  function tell(entry) {
    if (!sink) return;
    try { sink(entry); } catch { /* the log is never a second failure */ }
  }

  // A step name: lower-case letters, digits and . _ : - only, 24 at most.
  function crumb(name) {
    try {
      const c = String(name).toLowerCase().replace(/[^a-z0-9._:-]/g, '').slice(0, 24);
      if (!c) return;
      crumbs.push(c);
      if (crumbs.length > CRUMB_CAPACITY) crumbs.splice(0, crumbs.length - CRUMB_CAPACITY);
    } catch { /* a crumb that cannot be dropped is simply not dropped */ }
  }

  // kind: a short word ('frame', 'error', 'rejection', 'gl', 'save', 'room',
  // 'cloud', 'resume'); err: anything; where: optional { source, line }.
  // Returns the entry, or null if even that failed.
  function note(kind, err, where) {
    try {
      const k = typeof kind === 'string' && kind ? kind.slice(0, 16) : 'error';
      const message = describeError(err);
      const source = fileOf(where?.source);
      const line = Number.isInteger(where?.line) && where.line > 0 ? where.line : 0;
      const time = now();
      total += 1;
      version += 1;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.kind === k && e.message === message && e.source === source && e.line === line) {
          e.count += 1;
          e.time = time;
          // the repeat is the latest thing that happened: it moves to the end
          if (i !== entries.length - 1) { entries.splice(i, 1); entries.push(e); }
          tell(e);
          return e;
        }
      }
      const entry = { time, kind: k, message, source, line, count: 1 };
      entries.push(entry);
      if (entries.length > capacity) entries.splice(0, entries.length - capacity);
      tell(entry);
      return entry;
    } catch {
      return null;
    }
  }

  // info: a renderer's `info` ({ memory: { geometries, textures }, programs }).
  // A reading is not a failure: it moves the version, never the total.
  function noteMemory(info) {
    try {
      const time = now();
      const programs = info?.programs?.length ?? 0;
      readings.push({
        time,
        geometries: count(info?.memory?.geometries),
        textures: count(info?.memory?.textures),
        programs: count(programs),
      });
      if (readings.length > DIAG_MEMORY_CAPACITY) readings.splice(0, readings.length - DIAG_MEMORY_CAPACITY);
      version += 1;
    } catch {
      // a reading that cannot be taken is simply not kept
    }
  }

  return {
    note,
    noteMemory,
    crumb,
    crumbs: () => crumbs.slice(),
    // The crash log's hook: sink(entry) on every note; returns nothing.
    setSink(fn) { sink = typeof fn === 'function' ? fn : null; },
    // Failures kept from earlier loads of the page (a copy), shown as 'earlier'.
    setEarlier(list) { earlier = Array.isArray(list) ? list.slice() : []; version += 1; },
    earlier: () => earlier.slice(),
    // A copy, newest last.
    entries: () => entries.slice(),
    // The memory readings: a copy, newest last.
    memory: () => readings.slice(),
    // Every failure noted, repeats included.
    get total() { return total; },
    get version() { return version; },
    clear() { entries.length = 0; readings.length = 0; crumbs.length = 0; total = 0; version += 1; },
  };
}

// The game's one record. Modules note into it with note() below.
export const diagnostics = createDiagnostics();

export function note(kind, err, where) {
  return diagnostics.note(kind, err, where);
}

export function crumb(name) {
  diagnostics.crumb(name);
}

export function noteMemory(info) {
  diagnostics.noteMemory(info);
}

// window 'error' and 'unhandledrejection', recorded but not swallowed: no
// preventDefault, so the browser still logs them to the console as before.
// `target` is anything with addEventListener (window in the game).
export function listenForErrors(target, diag = diagnostics) {
  if (!target || typeof target.addEventListener !== 'function') return;
  target.addEventListener('error', (e) => {
    // A resource that failed to load (an <img>) has no error and no message;
    // those are not this record's business.
    if (!e || (e.error === undefined && !e.message)) return;
    diag.note('error', e.error ?? e.message, { source: e.filename, line: e.lineno });
  });
  target.addEventListener('unhandledrejection', (e) => {
    diag.note('rejection', e ? e.reason : undefined);
  });
}
