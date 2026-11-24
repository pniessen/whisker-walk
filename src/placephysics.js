// Per-place movement numbers (suit kit M0, the Moon's M0): a frozen table of the places that move differently.
// A place with no row (every place today but the Moon) is read as `null` and every helper below hands its input
// back by identity, so the rest of the game is byte-for-byte what it was. The Reef (float) adds its row later.
// This file is the ONE reading site: game/interactions.js, game/tips.js and game/walk.js call these and nothing else
// reads the table.
import { climbBudget } from './climbing.js';

export const PLACE_PHYSICS = Object.freeze({
  moon: Object.freeze({ medium: 'vacuum', pace: 0.9, hopHeightMul: 4, hopTimeMul: 3.6, climbMul: 2, reachMul: 1.5, skip: 0.1 }),
});

export const physicsFor = (place) => (typeof place === 'string' && Object.hasOwn(PLACE_PHYSICS, place) ? PLACE_PHYSICS[place] : null);

// The pounce arc of a place: taller and longer on the Moon (the pose window and the landing thump follow `.time`).
export function placeArc(arc, place) {
  const p = physicsFor(place);
  return p ? Object.freeze({ height: arc.height * p.hopHeightMul, time: arc.time * p.hopTimeMul }) : arc;
}

// The climb budget of a place for one save: climb x climbMul, both reaches x reachMul.
export function placeBudget(state, place) {
  const b = climbBudget(state);
  const p = physicsFor(place);
  return p ? Object.freeze({ ...b, climb: b.climb * p.climbMul, reachHigh: b.reachHigh * p.reachMul, reachLow: b.reachLow * p.reachMul }) : b;
}

export const placePace = (pace, place) => pace * (physicsFor(place)?.pace ?? 1);
