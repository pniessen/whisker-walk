// =============================================================================
// THE ECHO DEEP: THE PURE STORY RULES (second story, milestone C1). No THREE, no clock, no random number, no save write: it takes the `state.crystal` record (its `step`, `songs`, `album`
// and `deep` keys) and an event and answers the next record; the live files (C3, C4) carry it out on a walk and write it back. Copied in shape from crystalforgejob.js (not shared, so
// that tested file stays as it is).
//
// WHAT IS SAVED (state.crystal.deep, 4 bits): bit 0 the wall is open, bit 1 the prisms are set, bit 2 Tink is found, bit 3 Tink is home and the charm is given. Each bit implies the ones before it.
// OPEN once the story of Lumi is told (step 7), all three tunes are learned (songs 7) and two rubbings from Lumi are in the album (two paid errands). Something carried or followed is never saved.
// A step done by ANYONE in the room is credited the same way (credit()). Nothing here can fail her: no failure event exists.
// =============================================================================
export const WALL = 1;
export const PRISMS = 2;
export const FOUND = 4;
export const HOME = 8;
export const KINDS = Object.freeze(['wall', 'prism', 'found', 'home']); // the four steps, in order: step i sets bit i
export const NEED_RUBBINGS = 2;

const int = (v, hi) => (Number.isInteger(v) && v > 0 ? Math.min(hi, v) : 0);
const pop = (v) => { let n = 0; for (let b = int(v, 4095); b; b &= b - 1) n++; return n; };

// the deep bits, repaired: each bit implies the ones before it (progression.js rule of crystalDeep)
export const deepBits = (rec) => { const b = int(rec && typeof rec === 'object' ? rec.deep : 0, 15); return b & HOME ? 15 : b & FOUND ? 7 : b & PRISMS ? 3 : b & WALL; };
/** The unlock rule: the first story told, all three tunes, and at least two of Lumi's rubbings. */
export const isOpen = (rec) => { const r = rec && typeof rec === 'object' ? rec : {}; return int(r.step, 7) >= 7 && int(r.songs, 7) === 7 && pop(r.album) >= NEED_RUBBINGS; };
/** Open now, or begun before (a merged save keeps what it has). */
export const unlocked = (rec) => deepBits(rec) > 0 || isOpen(rec);
export const hasStep = (rec, i) => (deepBits(rec) & (1 << i)) !== 0;
export const told = (rec) => (deepBits(rec) & HOME) !== 0; // Tink is home: the errands begin from the next walk
export const stepsDone = (rec) => KINDS.filter((_, i) => hasStep(rec, i)).length;

// events: { kind: "wall" | "prism" | "found" | "home" }. effect: the same word, or null. `rec` itself is never touched and the record"s other keys come back as they were.
export function apply(rec, ev) {
  const base = rec && typeof rec === 'object' ? rec : {};
  const bits = deepBits(rec);
  const none = { crystal: { ...base, deep: bits }, changed: false, effect: null };
  const i = ev && typeof ev === 'object' ? KINDS.indexOf(ev.kind) : -1;
  if (i < 0 || !unlocked(rec) || bits & (1 << i) || bits !== (1 << i) - 1) return none; // not open, done already, or a step before it is missing
  return { crystal: { ...base, deep: bits | (1 << i) }, changed: true, effect: KINDS[i] };
}

// A step done by someone else in the room: every step before it is taken first, in order.
export function credit(rec, ev) {
  const first = apply(rec, ev);
  const i = ev && typeof ev === 'object' ? KINDS.indexOf(ev.kind) : -1;
  if (first.changed || i < 0 || !unlocked(rec)) return first;
  let cur = rec;
  let any = false;
  for (let k = 0; k <= i; k++) { const r = apply(cur, { kind: KINDS[k] }); if (r.changed) { cur = r.crystal; any = true; } }
  return any ? { crystal: cur, changed: true, effect: KINDS[i] } : first;
}

// The wire form (the one place that reads a event from a partner): { kind: "wd-wall" } and so on; anything else is nothing. "wd-errand" is the errand"s (crystaldeeperrand.js).
export const toStep = (ev) => { const k = ev && typeof ev === 'object' && typeof ev.kind === 'string' && ev.kind.startsWith('wd-') ? ev.kind.slice(3) : ''; return KINDS.includes(k) ? { kind: k } : null; };
export const wire = (step) => ({ kind: `wd-${step.kind}` });

// The one thing to do next, for the guide: { kind: "hum" | "prisms" | "find" | "walk" | "rest" }. `following`: Tink is walking with her.
export function nextGoal(rec, following = false) {
  if (!unlocked(rec) || told(rec)) return { kind: 'rest' };
  const b = deepBits(rec);
  if (!(b & WALL)) return { kind: 'hum' };
  if (!(b & PRISMS)) return { kind: 'prisms' };
  if (!(b & FOUND)) return { kind: 'find' };
  return { kind: following ? 'walk' : 'find' };
}
