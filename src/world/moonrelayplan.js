// =============================================================================
// THE MOON'S RELAY ARC (wing E, milestone M3): THE PLAN AND THE RULES. Pure data and pure functions (no THREE, no clock, no random number, no save write): the live
// (world/moonrelaylive.js) carries them out. The arc opens when the first story is told (moon step 8, "Earth answered"; never before). Saved as state.moon.relay (bitmask,
// src/progression.js moonRelay): bits 0-2 are three relay parts found in ANY order (the far end of the sled lane, inside the station, the foot of Earthrise Rock); bit 3 the
// station awake (the console, once all three are in; implies the parts); bit 4 the far station answered (listen at Earthrise Rock once the station is awake; implies all) and the
// Signal Tag is hers. A part is picked up and fitted at once (nothing is carried, so nothing can be left behind); each step is never undone and nothing here can fail or time out.
// A step done by anyone in the room is credited the same way on both saves (credit()): the partner's events are 'relay-part' (with the part), 'relay-wake' and 'relay-answer'.
// =============================================================================
import { MOON_BOUNDS } from './moonplan.js';
import { CONSOLE } from './moonstationplan.js';

export const OPEN_STEP = 8; // the signal is heard once Earth has answered (moonmission.js STEP.replied; not imported here, so the stage shares no chunk with the mission's file)
export const PART_BITS = 7;
export const AWAKE_BIT = 8;
export const ANSWER_BIT = 16;
export const PARTS = Object.freeze([
  Object.freeze({ id: 0, x: 51.4, z: 41.6, reach: 2.4, key: 'lane' }), // the sled lane's far (east) end, just north of the out leg
  Object.freeze({ id: 1, x: 40.4, z: 34.2, reach: 2.4, key: 'station' }), // inside the station, by the solar panels
  Object.freeze({ id: 2, x: -9.8, z: -41.2, reach: 2.4, key: 'rock' }), // the foot of Earthrise Rock
]);
export const POST = Object.freeze({ x: -4.2, z: -41.8, r: 0.25, reach: 2.6 }); // the listening post at Earthrise Rock's foot (a small dish on a post)
export const WAKE = Object.freeze({ x: CONSOLE.x, z: CONSOLE.z, reach: CONSOLE.reach }); // the station's console
export const PRIZE_ID = 'signaltag';
export const EVENTS = Object.freeze(['relay-part', 'relay-wake', 'relay-answer']);
export const POST_COLLIDER = Object.freeze({ x: POST.x, z: POST.z, r: POST.r });

const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
/** The relay bits the save implies (wake implies the parts, the answer implies all). */
export const bitsOf = (moon) => { const b = int(moon?.relay) & 31; return b & 16 ? 31 : b & 8 ? 15 : b & 7; };
export const isOpen = (moon) => Number.isInteger(moon?.step) && moon.step >= OPEN_STEP; // (the saved step: a step 8 or more is never implied by anything else)
export const partsIn = (moon) => { const b = bitsOf(moon); return (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1); };
export const hasPart = (moon, id) => (bitsOf(moon) & (1 << id)) !== 0;
export const allParts = (moon) => (bitsOf(moon) & PART_BITS) === PART_BITS;
export const awake = (moon) => (bitsOf(moon) & AWAKE_BIT) !== 0;
export const answered = (moon) => (bitsOf(moon) & ANSWER_BIT) !== 0;
export const hasTag = answered;

const partId = (ev) => (Number.isInteger(ev?.part) && ev.part >= 0 && ev.part <= 2 ? ev.part : -1);
/** The step an event names: { kind: 'part', part } | { kind: 'wake' } | { kind: 'answer' } or null. (the partner's wire kinds are 'relay-' + this) */
export const stepOf = (ev) => {
  const k = ev && typeof ev === 'object' ? ev.kind : null;
  if (k === 'part' || k === 'relay-part') { const p = partId(ev); return p >= 0 ? { kind: 'part', part: p } : null; }
  if (k === 'wake' || k === 'relay-wake') return { kind: 'wake' };
  if (k === 'answer' || k === 'relay-answer') return { kind: 'answer' };
  return null;
};

/** The next relay bits after her own step: { relay, changed, effect } (effect: 'part', 'ready' (the third part), 'wake', 'answer' or null). Closed before step 8; a step out of order is no change. */
export function apply(moon, ev) {
  const r = bitsOf(moon);
  const none = { relay: r, changed: false, effect: null };
  const s = stepOf(ev);
  if (!s || !isOpen(moon)) return none;
  if (s.kind === 'part') {
    if (r & (1 << s.part)) return none;
    const next = r | (1 << s.part);
    return { relay: next, changed: true, effect: (next & PART_BITS) === PART_BITS ? 'ready' : 'part' };
  }
  if (s.kind === 'wake') return (r & PART_BITS) === PART_BITS && !(r & AWAKE_BIT) ? { relay: r | AWAKE_BIT, changed: true, effect: 'wake' } : none;
  return r & AWAKE_BIT && !(r & ANSWER_BIT) ? { relay: 31, changed: true, effect: 'answer' } : none;
}

/** The next bits after a step done by someone else in the room: the same rules, but a step that implies the earlier ones brings them (her own save may be behind). */
export function credit(moon, ev) {
  const r = bitsOf(moon);
  const s = stepOf(ev);
  if (!s || !isOpen(moon)) return { relay: r, changed: false, effect: null };
  if (s.kind === 'part') return apply(moon, ev);
  const want = s.kind === 'wake' ? 15 : 31;
  const next = bitsOf({ relay: r | want });
  const had = s.kind === 'wake' ? r & AWAKE_BIT : r & ANSWER_BIT;
  return had ? { relay: r, changed: false, effect: null } : { relay: next, changed: true, effect: s.kind };
}

/** Is (x, z) inside the Moon's bounds (every spot of the arc is)? */
export const inBounds = (x, z) => x > MOON_BOUNDS.minX && x < MOON_BOUNDS.maxX && z > MOON_BOUNDS.minZ && z < MOON_BOUNDS.maxZ;
