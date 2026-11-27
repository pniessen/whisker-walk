// =============================================================================
// THE REEF, THE GALLEON'S HUNT: THE PURE STEP MACHINE (milestone R17: the torn map, the clue trail, the Captain's Chest). No THREE, no clock, no random number,
// no save write: it takes the `state.reef` record and an event and answers the next record; world/reefhuntlive.js carries it out on a walk and writes it back.
// Copied from src/reefmission.js (normalize, apply, credit, nextGoal), not refactored out of it.
//
// WHAT IS SAVED (state.reef.wreck, five bits; src/progression.js reefWreck() fills every bit below the highest one set):
//   bit 0  the torn map, found on the cabin floor
//   bit 1  the anchor clue (the Old Anchor matches the map)
//   bit 2  the boat clue (the Sunken Boat's open stern)
//   bit 3  the lantern clue (the third lantern coral); the X then shows on the sand
//   bit 4  the Captain's Chest, dug up: the pirate bandana and the paws are paid on this one step, once ever
// The steps go in order, so a merge of two devices (OR, then the fill) never leaves a clue without its map. A step done by ANYONE in the room is credited the
// same way (credit(): every step before it is taken in order). normalize() repairs whatever an old build, a merge or a hostile save leaves, so there is always a
// next goal and nothing here can fail her.
// =============================================================================

import { MAP_SPOT, CLUE_REACH, CHEST_SPOT, WRECK_CLUES } from './reefwreckplan.js';

export const BIT = Object.freeze({ map: 1, clue: Object.freeze([2, 4, 8]), chest: 16, all: 31 });
export const CLUE_COUNT = 3;
export const BANDANA_ID = 'piratebandana';

// A whole number 0 to 31 from anything; every bit below the highest one set is set (the same rule src/progression.js reefWreck() keeps).
export function fill(v) {
  const b = Number.isInteger(v) && v > 0 ? Math.min(BIT.all, v) : 0;
  return b ? (1 << (32 - Math.clz32(b))) - 1 : 0;
}
export const normalize = (reef) => fill(reef && typeof reef === 'object' ? reef.wreck : 0);

export const hasMap = (reef) => (normalize(reef) & BIT.map) !== 0;
export const cluesFound = (reef) => { const w = normalize(reef); return (w & 8 ? 3 : w & 4 ? 2 : w & 2 ? 1 : 0); };
export const xShown = (reef) => { const w = normalize(reef); return (w & 8) !== 0 && (w & BIT.chest) === 0; };
export const chestFound = (reef) => (normalize(reef) & BIT.chest) !== 0;

// The events, in the order the hunt takes them (credit() walks this ladder). The bit each one sets (every one below it is already set).
const LADDER = Object.freeze([
  Object.freeze({ kind: 'map', bit: 1 }), Object.freeze({ kind: 'clue', clue: 0, bit: 2 }), Object.freeze({ kind: 'clue', clue: 1, bit: 4 }),
  Object.freeze({ kind: 'clue', clue: 2, bit: 8 }), Object.freeze({ kind: 'chest', bit: 16 }),
]);
const rungOf = (ev) => (ev && typeof ev === 'object' ? LADDER.findIndex((e) => e.kind === ev.kind && e.clue === ev.clue) : -1);

// The next record after an event; `reef` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'map' }, { kind: 'clue', clue: 0 | 1 | 2 } (in order), { kind: 'chest' } (after the third clue). Anything else, a step out of order, a step that
// is already done: no change. effect: 'map' | 'clue' | 'chest' | null; `clue` is the clue's number for 'clue'.
export function apply(reef, ev) {
  const cur = normalize(reef);
  const base = reef && typeof reef === 'object' ? reef : {};
  const none = { reef: { ...base, wreck: cur }, changed: false, effect: null, clue: -1 };
  const rung = rungOf(ev);
  if (rung < 0) return none;
  const step = LADDER[rung];
  if (cur !== step.bit - 1) return none; // exactly the steps before it are done: not earlier, not later
  return { reef: { ...base, wreck: cur | step.bit }, changed: true, effect: step.kind, clue: step.kind === 'clue' ? step.clue : -1 };
}

// A step done by someone else in the room: a step she is past changes nothing; one she has not reached is taken in order after every step before it.
export function credit(reef, ev) {
  const first = apply(reef, ev);
  if (first.changed) return first;
  const rung = rungOf(ev);
  if (rung < 0) return first;
  let cur = reef;
  let last = null;
  for (let i = 0; i <= rung; i++) {
    const r = apply(cur, LADDER[i]);
    if (r.changed) { cur = r.reef; last = r; }
  }
  return last ?? first;
}

// The one thing to do next: { kind, clue?, x, z, icon }: 'map' (the cabin), 'clue' (clue `clue`'s place), 'chest' (dig at the X), 'rest' (done).
export function nextGoal(reef) {
  const w = normalize(reef);
  if (!(w & BIT.map)) return { kind: 'map', x: MAP_SPOT.x, z: MAP_SPOT.z, icon: 'question' };
  if (w & BIT.chest) return { kind: 'rest', icon: 'heart' };
  const n = cluesFound(reef);
  if (n < CLUE_COUNT) { const c = WRECK_CLUES[n]; return { kind: 'clue', clue: n, x: c.x, z: c.z, icon: 'question' }; }
  return { kind: 'chest', x: CHEST_SPOT.x, z: CHEST_SPOT.z, icon: 'heart' };
}

// The step she takes by standing at (x, z): the event for the next goal when she is within its reach, else null. Horizontal distance only.
export function eventAt(reef, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const g = nextGoal(reef);
  if (g.kind === 'rest') return null;
  const reach = g.kind === 'map' ? MAP_SPOT.reach : g.kind === 'chest' ? CHEST_SPOT.reach : CLUE_REACH;
  if (Math.hypot(x - g.x, z - g.z) > reach) return null;
  return g.kind === 'clue' ? { kind: 'clue', clue: g.clue } : { kind: g.kind };
}
