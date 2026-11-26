// Per-place movement numbers (suit kit M0, the Moon's M0): a frozen table of the places that move differently.
// A place with no row (every place today but the Moon) is read as `null` and every helper below hands its input
// back by identity, so the rest of the game is byte-for-byte what it was. The Reef (float: milestone R0 adds the row, R1 the float) has the
// neutral multipliers 1, and a helper defaults any multiplier a row leaves out to 1 (`?? 1`), so a row can never make a NaN.
// This file is the ONE reading site: game/interactions.js, game/tips.js and game/walk.js call these and nothing else
// reads the table.
import { climbBudget } from './climbing.js';

export const PLACE_PHYSICS = Object.freeze({
  moon: Object.freeze({ medium: 'vacuum', pace: 0.9, hopHeightMul: 4, hopTimeMul: 3.6, climbMul: 2, reachMul: 1.5, skip: 0.1 }),
  // The Reef: water, a slower pace, and the float numbers (floatMax metres, rise and sink in m/s; the player's float height, milestone R1).
  reef: Object.freeze({ medium: 'water', pace: 0.7, floatMax: 2.2, rise: 1.2, sink: 0.6, hopHeightMul: 1, hopTimeMul: 1, climbMul: 1, reachMul: 1 }),
});

export const physicsFor = (place) => (typeof place === 'string' && Object.hasOwn(PLACE_PHYSICS, place) ? PLACE_PHYSICS[place] : null);

// The pounce arc of a place: taller and longer on the Moon (the pose window and the landing thump follow `.time`).
export function placeArc(arc, place) {
  const p = physicsFor(place);
  return p ? Object.freeze({ height: arc.height * (p.hopHeightMul ?? 1), time: arc.time * (p.hopTimeMul ?? 1) }) : arc;
}

// The climb budget of a place for one save: climb x climbMul, both reaches x reachMul.
export function placeBudget(state, place) {
  const b = climbBudget(state);
  const p = physicsFor(place);
  return p ? Object.freeze({ ...b, climb: b.climb * (p.climbMul ?? 1), reachHigh: b.reachHigh * (p.reachMul ?? 1), reachLow: b.reachLow * (p.reachMul ?? 1) }) : b;
}

export const placePace = (pace, place) => pace * (physicsFor(place)?.pace ?? 1);
