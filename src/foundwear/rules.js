// Found outfits: the rules a find follows, shared by the spots, the walk and
// the tests. Nothing here is random or reads the clock: the find comes from
// its own salted stream off the walk's seed (the room seed on a co-walk, the
// solo seed otherwise), never the walk's shared stream, so two players agree
// and a find never shifts the walk's other draws.
import { mulberry32 } from '../rng.js';
import { FIND_SPOTS, FIND_KEY } from './spots/index.js';

// XORed into the walk's seed for the find's own stream.
export const FIND_SALT = 0x5eedf1d0;
// The walk-log key a find is noted under.
export const FIND_LOG_KEY = 'wear-find';

// The pick-up window, the same as a golden mouse's (goldmice.js checkFind):
// under `r` metres sideways and `dy` metres up or down.
export const PICKUP = Object.freeze({ r: 1.0, dy: 0.9 });

// Spec: "twinkles from about 20 m"; "a soft chime when she is within about
// 6 m". The chime re-arms only once she is past CHIME_REARM, so walking about
// at the edge does not ring it over and over. Standing still within
// NOSE_RANGE draws the buried-treasure paw prints to it.
export const TWINKLE_RANGE = 20;
export const CHIME_RANGE = 6;
export const CHIME_REARM = 10;
export const NOSE_RANGE = 20;

// A find never sits within this many metres of the spawn (spec: "A find never
// sits within 15 m of the spawn").
export const SPAWN_CLEAR = 15;

// Everything in the place already owned: a small coin pouch instead (spec,
// "Claude's call: 5 coins"; the coins are 🐾 points).
export const POUCH_COINS = 5;

// Spec: "Hagrid the hen wears only the head, face, neck and collar ones; a
// find of another slot still counts as found for him".
export const HEN_SLOTS = Object.freeze(['head', 'face', 'neck', 'collar']);

// findsAgreed(roster, key) -> true when the room lists at least one member and
// every member's profile carries the same finds key (spec: "finds are off for
// the whole walk unless every member has it"). An older build sends no key.
export function findsAgreed(roster, key = FIND_KEY) {
  if (!Array.isArray(roster) || roster.length === 0) return false;
  for (const m of roster) if (!m || m.finds !== key) return false;
  return true;
}

// planFind(...) -> { areaId, spot, roll } for this walk, or null when it has
// no find: in the den, on the guided first walk, in an area with no spots,
// without a usable seed, or on a room walk whose members do not agree. A walk
// that began with a border crossing is an ordinary walk (lessonKind is not
// 'first'). Two draws, in this order: the spot, then the roll pickFindItem
// uses. `roster` is null on a solo walk.
export function planFind({ areaId, isDen = false, lessonKind = null, seed, roster = null, key = FIND_KEY, spots = FIND_SPOTS } = {}) {
  if (isDen || lessonKind === 'first') return null;
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return null;
  if (roster !== null && roster !== undefined && !findsAgreed(roster, key)) return null;
  const list = typeof areaId === 'string' && spots && Object.hasOwn(spots, areaId) ? spots[areaId] : null;
  if (!Array.isArray(list) || list.length === 0) return null;
  const r = mulberry32((seed ^ FIND_SALT) >>> 0);
  const spot = list[Math.floor(r() * list.length)];
  const roll = r();
  return { areaId, spot, roll };
}

// pickFindItem(records, owned, roll) -> the outfit this find is, or the pouch.
// Walk the place's records as a ring from the roll's start; the first one not
// owned is it. `owned` is an array or a Set of ids.
export function pickFindItem(records, owned, roll) {
  const n = Array.isArray(records) ? records.length : 0;
  if (n === 0) return { kind: 'pouch' };
  const has = owned instanceof Set ? (id) => owned.has(id) : (id) => Array.isArray(owned) && owned.includes(id);
  // A roll outside [0, 1) (never from planFind) still lands on the ring.
  const raw = Math.floor(roll * n) % n;
  const start = Number.isFinite(raw) ? (raw + n) % n : 0;
  for (let i = 0; i < n; i++) {
    const rec = records[(start + i) % n];
    if (rec && !has(rec.id)) return { kind: 'wear', id: rec.id };
  }
  return { kind: 'pouch' };
}

// catReaches(spot, spotWorldY, x, z, pawsY) -> she picks it up: the golden
// mouse's window, sideways and up or down.
export function catReaches(spot, spotWorldY, x, z, pawsY) {
  return Math.hypot(x - spot.x, z - spot.z) < PICKUP.r && Math.abs(pawsY - spotWorldY) < PICKUP.dy;
}

// partnerReaches(spot, x, z) -> a partner's cat picks it up. Flat: the co-walk
// state message carries no height (spec, "Playing together").
export function partnerReaches(spot, x, z) {
  return Math.hypot(x - spot.x, z - spot.z) < PICKUP.r;
}

// createChime() -> { step(dist) }: true once, when an armed chime comes
// within CHIME_RANGE; it re-arms once she is past CHIME_REARM. Armed at first.
export function createChime() {
  let armed = true;
  return {
    step(dist) {
      if (armed && dist < CHIME_RANGE) { armed = false; return true; }
      if (!armed && dist > CHIME_REARM) armed = true;
      return false;
    },
  };
}

// canWearNow(breed, slot) -> whether this cat shows an outfit of this slot.
// Every cat wears everything; Hagrid only HEN_SLOTS.
export function canWearNow(breed, slot) {
  return breed !== 'hagrid' || HEN_SLOTS.includes(slot);
}
