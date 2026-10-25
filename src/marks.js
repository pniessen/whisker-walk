// =============================================================================
// Private per-area marks — the rules half (v21 Stream 3b). Pure, no THREE, no
// DOM, no storage; the only import is propsets.js (itself zero-import), so the
// save sanitizer can read this without pulling in a world builder. All writes
// happen in progression.js, which calls these, saves, and reports whether the
// save changed.
//
// A mark is a trace this player left in an area: a post scratched, a hole dug,
// a stick carried and dropped, a border claimed, a keepsake brought home.
//
//   { kind, id, x, z, at, contested, item }
//
// MARKS ARE PRIVATE (v21 spec, Stream 3). They live in state.marks and nowhere
// else: never on the colony wire (colonysync.js), never on the co-walk wire
// (netevents.js). The whole save rides in the player's OWN cloud row, which is
// the player's backup, not sharing.
//
// THE CAP IS THE ONLY REMOVAL. Each area keeps its newest MARKS_PER_AREA marks;
// when a new one arrives the oldest falls off, and that is the only way a mark
// ever leaves the save. Contesting a mark (a rival, the dog, the rain) only
// sets `contested: true`; it never deletes (v21 spec section 10.1, clan spec
// section 6.7). A re-mark of the same scratch or border refreshes it in place.
//
// `id` is a propsets.js prop id for scratch / drop / border / den (border ids
// are `<area>-border-<ring index>`), and null for a dig. A well-formed id this
// build does not recognise is KEPT: the prop may have been retired since, and
// the renderer simply skips what it cannot place. `item` is a CARRY_KINDS entry
// for a drop or a den keepsake, and null for everything else.
// =============================================================================

import { isPropId, CARRY_KINDS } from './propsets.js';

export const MARK_KINDS = Object.freeze(['scratch', 'dig', 'drop', 'border', 'den']);
export const MARKS_PER_AREA = 8;
export const MARK_AREAS = Object.freeze(['neighborhood', 'park', 'seaside', 'docks', 'den']);

const COORD_LIMIT = 200;
// Ranks 0-5 (newest first) are full strength; the two oldest fade.
const FADE = Object.freeze([1, 1, 1, 1, 1, 1, 0.55, 0.3]);

export function emptyMarks() {
  return { neighborhood: [], park: [], seaside: [], docks: [], den: [] };
}

function isCoord(n) {
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT;
}

// cleanMark(m) → a fresh, plain mark, or null. Only reads own fields it names,
// and the output is built from literals, so nothing from the payload is ever a
// key or a prototype.
function cleanMark(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const { kind, id, x, z, at, contested, item } = m;
  if (typeof kind !== 'string' || !MARK_KINDS.includes(kind)) return null;
  if (!isCoord(x) || !isCoord(z)) return null;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  let cleanId = null;
  let cleanItem = null;
  if (kind === 'dig') {
    if (id != null) return null;
    if (item != null) return null;
  } else {
    if (!isPropId(id)) return null;
    cleanId = id;
    if (kind === 'drop' || kind === 'den') {
      if (typeof item !== 'string' || !CARRY_KINDS.includes(item)) return null;
      cleanItem = item;
    } else if (item != null) {
      return null;
    }
  }
  return { kind, id: cleanId, x, z, at, contested: contested === true, item: cleanItem };
}

// markKey(m) → the identity of a mark within its area. A scratch or border is
// the same mark each time it is made; a carried drop is a new one each time
// (the same stick can go home twice); a dig is the spot, to the metre.
export function markKey(m) {
  switch (m?.kind) {
    case 'scratch':
    case 'border':
      return `${m.kind}:${m.id}`;
    case 'drop':
    case 'den':
      return `${m.kind}:${m.id}:${m.at}`;
    case 'dig':
      return `dig:${Math.round(m.x)},${Math.round(m.z)}`;
    default:
      return `${m?.kind}:${m?.id}`;
  }
}

// settle(list) → clean marks deduped on key (newest `at` wins, a tie goes to
// the later one), sorted oldest to newest, trimmed to the newest MARKS_PER_AREA.
function settle(list) {
  const byKey = new Map();
  for (const m of list) {
    const k = markKey(m);
    const prior = byKey.get(k);
    if (!prior || m.at >= prior.at) byKey.set(k, m);
  }
  // Map keeps first-insertion order for ties, so the sort is stable on input order.
  return [...byKey.values()].sort((a, b) => a.at - b.at).slice(-MARKS_PER_AREA);
}

// sanitizeMarks(v) → marks. Total: never throws, always returns all five areas
// as fresh arrays of fresh objects. Areas are read as OWN properties of a plain
// object, by the fixed MARK_AREAS list, so a '__proto__' or inherited key in the
// payload can neither be read nor written.
export function sanitizeMarks(v) {
  const out = emptyMarks();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const area of MARK_AREAS) {
    if (!Object.hasOwn(v, area)) continue;
    const list = v[area];
    if (!Array.isArray(list)) continue;
    const clean = [];
    for (const m of list) {
      const c = cleanMark(m);
      if (c) clean.push(c);
    }
    out[area] = settle(clean);
  }
  return out;
}

function sameList(a, b) {
  return a.length === b.length && a.every((m, i) => JSON.stringify(m) === JSON.stringify(b[i]));
}

function isArea(area) {
  return typeof area === 'string' && MARK_AREAS.includes(area);
}

// addMark(marks, area, mark) → { marks, changed }. Pure: `marks` is never
// mutated and a new object comes back. A mark with the key of one already
// there REPLACES it — for a scratch or border that is the re-mark (newest `at`,
// contested cleared); a dig on the same metre is the same spot, and keeping one
// entry per key is what a reload would do anyway. Everything else appends. The
// oldest beyond the cap then fall off. A bad area or a bad mark changes nothing.
export function addMark(marks, area, mark) {
  const base = sanitizeMarks(marks);
  const m = cleanMark(mark);
  if (!isArea(area) || !m) return { marks: base, changed: false };
  const next = settle([...base[area], { ...m, contested: false }]);
  const changed = !sameList(base[area], next);
  return { marks: { ...base, [area]: next }, changed };
}

// contestMark(marks, area, key) → { marks, changed }. Sets contested: true on
// the mark with that key. Never removes. A border or den mark is never
// contestable, and one already contested, or not there, changes nothing.
export function contestMark(marks, area, key) {
  const base = sanitizeMarks(marks);
  if (!isArea(area) || typeof key !== 'string') return { marks: base, changed: false };
  const i = base[area].findIndex((m) => markKey(m) === key);
  if (i < 0) return { marks: base, changed: false };
  const m = base[area][i];
  if (m.kind === 'border' || m.kind === 'den' || m.contested) return { marks: base, changed: false };
  const list = base[area].map((x, j) => (j === i ? { ...x, contested: true } : x));
  return { marks: { ...base, [area]: list }, changed: true };
}

// markOpacity(rankFromNewest) → 0..1. Six to eight per area, oldest fading.
export function markOpacity(rankFromNewest) {
  const r = Number.isInteger(rankFromNewest) ? rankFromNewest : 0;
  return r <= 5 ? 1 : (FADE[r] ?? FADE[FADE.length - 1]);
}
