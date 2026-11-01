// Kittypet rules: pure functions, no THREE, nothing written to the save.
// A kittypet is a stray whose name is in KITTYPET_NAMES; everything here is
// derived from the stored name and the edition.

import { isClanEdition } from './edition.js';
import { isKittypetName, KITTYPET_NAMES, CAT_NAMES } from './straynames.js';
import { seedFromCode, mulberry32 } from './rng.js';
import { TERRITORY_AREAS } from './colony.js';

// The wander roll is per UTC day and territory (spec section 3 builder note):
// the same day boundary as the daily race and the streak in game/walk.js
// (around lines 1432 and 1671). It never draws from walkRng or the strays'
// stream, and adds nothing on the wire.

export const KITTYPET_COLLAR = 'bell';
export const KITTYPET_COLLARS = Object.freeze({ Duchess: 'heart' });

function inColony(state, name) {
  const cats = state?.colony?.cats;
  return Array.isArray(cats) && cats.some((c) => c?.name === name);
}

// collarFor(state, name) → a shop collar id, or null. Clan Edition only, and
// the collar comes off once the cat is in the colony (tamed or not).
export function collarFor(state, name) {
  if (!isClanEdition(state) || !isKittypetName(name) || inColony(state, name)) return null;
  return Object.prototype.hasOwnProperty.call(KITTYPET_COLLARS, name) ? KITTYPET_COLLARS[name] : KITTYPET_COLLAR;
}

export const WANDER_AREAS = Object.freeze(['woods', 'river', 'moor']);
export const WANDER_ODDS = 1 / 5;
// The twelve kittypets that are ordinary stray names (Duchess is legendary).
export const WANDER_NAMES = Object.freeze(KITTYPET_NAMES.filter((n) => CAT_NAMES.includes(n)));

// wandererFor(areaId, ymd, colonyNames) -> a name or null. One visitor per
// territory per UTC day; if that cat is already in the colony the day is
// empty (no re-pick, so partners agree).
export function wandererFor(areaId, ymd, colonyNames = []) {
  if (typeof areaId !== 'string' || !WANDER_AREAS.includes(areaId)) return null;
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const r = mulberry32(seedFromCode(`${ymd}-wander-${areaId}`));
  const u = r();
  const pick = r();
  if (u >= WANDER_ODDS) return null;
  const name = WANDER_NAMES[Math.floor(pick * WANDER_NAMES.length)];
  return colonyNames.includes(name) ? null : name;
}

// A colony walk is partner-only, so the colony is shared; off one the roll
// reads only the date and the area, so every co-walker agrees.
export function walkWanderer(state, areaId, { ymd, colonyWalk, isDen } = {}) {
  if (isDen) return null;
  const cats = state?.colony?.cats;
  const names = colonyWalk && Array.isArray(cats) ? cats.map((c) => c?.name) : [];
  return wandererFor(areaId, ymd, names);
}

// Kittypets stay out of a territory's ordinary cast.
export function territoryCastExcludes(areaId) {
  return typeof areaId === 'string' && TERRITORY_AREAS.includes(areaId) ? KITTYPET_NAMES : [];
}

export const WANDER_STEP = 6;
export const WANDER_CAMP_GAP = 6;

// A point WANDER_STEP m from spawn toward the middle (0, 0); the caller passes
// it through clearSpot.
export function wanderStart(spawn) {
  const d = Math.hypot(spawn.x, spawn.z);
  if (d === 0) return { x: spawn.x - WANDER_STEP, z: spawn.z };
  return { x: spawn.x - (spawn.x / d) * WANDER_STEP, z: spawn.z - (spawn.z / d) * WANDER_STEP };
}

// wanderSpotFor(start, isWalkable, camp) -> {x, z} or null. start if it is
// walkable and at least camp.r + WANDER_CAMP_GAP from the camp centre; else the
// first passing point on rings 0.5..6 m (16 angles each); else null.
export function wanderSpotFor(start, isWalkable, camp) {
  const ok = (x, z) => isWalkable(x, z)
    && (!camp || Math.hypot(x - camp.cx, z - camp.cz) >= camp.r + WANDER_CAMP_GAP);
  if (ok(start.x, start.z)) return { x: start.x, z: start.z };
  for (let ring = 1; ring <= 12; ring++) {
    const rad = ring * 0.5;
    for (let k = 0; k < 16; k++) {
      const a = (k * 2 * Math.PI) / 16;
      const x = start.x + Math.cos(a) * rad, z = start.z + Math.sin(a) * rad;
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}
