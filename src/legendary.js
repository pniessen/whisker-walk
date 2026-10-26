// The four legendary cats: which grand old cat lives in which walk area, and
// whether one walks there this time.
//
// A leaf module of pure logic (no THREE, no save writes). The names themselves
// are straynames.js's LEGENDARY_NAMES (a block of their own, so CAT_NAMES and
// walkRng are untouched); this file says where each one lives and when it
// shows up. A legendary cat is an ordinary stray name in every other respect:
// it passes isStrayName, the feed RPC's name regex and the D2 family-pet gate,
// and it joins the colony only through the ordinary feed path.
//
// Read with Object.hasOwn: an inherited key ('__proto__') is not an area.
import { LEGENDARY_NAMES } from './straynames.js';
import { mulberry32 } from './rng.js';

export const LEGENDARY_BY_AREA = Object.freeze({
  neighborhood: 'Duchess',
  park: 'Professor Whiskers',
  seaside: 'Captain Barnacle',
  docks: 'Lord Lantern',
});

// A Set, so '__proto__' and other inherited keys read as strangers, and
// anything that is not a string is rejected rather than coerced.
const LEGENDARY_SET = new Set(LEGENDARY_NAMES);
export function isLegendaryName(v) {
  return typeof v === 'string' && LEGENDARY_SET.has(v);
}

// ---------------------------------------------------------------------------
// v21 3b Task 18 — finding one.
//
// A legendary cat is rare until a couple of them have been found, then rarer:
// one walk in five, then one in twenty. "Found" is read off what the save
// already holds — my own greets of it (state.friends) or its being one of the
// shared colony's cats — so nothing new is stored and SAVE_VERSION stays 4.
//
// The roll has its own stream and never touches walkRng (game/walk.js's
// WARNING at startWalk): Math.random solo, where nobody shares the walk and
// draw order means nothing, and a mulberry32 off the room seed in a room walk,
// so two partners roll the same number.
// ---------------------------------------------------------------------------
export const ODDS_EARLY = 1 / 5;
export const ODDS_LATE = 1 / 20;
export const A_COUPLE = 2;
export const LEGEND_SALT = 0x1e6e7d00;

// Any colony cat by this name, tamed or not. Total over garbage.
function inColony(state, name) {
  const cats = state?.colony?.cats;
  return Array.isArray(cats) && cats.some((c) => c?.name === name);
}

// isFound(state, name) → bool. I have greeted it at least once, or it is a
// colony cat (fed by me or by my partner). Own-property read on friends: the
// save round-trips through a cloud payload, and '__proto__' is nobody.
export function isFound(state, name) {
  if (typeof name !== 'string') return false;
  const friends = state?.friends;
  const f = friends && typeof friends === 'object' && Object.hasOwn(friends, name) ? friends[name] : null;
  const g = f?.greets;
  if (typeof g === 'number' && Number.isFinite(g) && g >= 1) return true;
  return inColony(state, name);
}

// foundCount(state) → how many of the four are found.
export function foundCount(state) {
  return LEGENDARY_NAMES.filter((n) => isFound(state, n)).length;
}

export function legendaryOdds(found) {
  return found < A_COUPLE ? ODDS_EARLY : ODDS_LATE;
}

// legendaryFor(state, areaId, u) → the name of the legendary cat that walks
// this area this time, or null.
//
// Never one that is in the colony, tamed or not. An untamed colony cat is
// already cast as a colony cat at its fixed spot (createStrayCats'
// colonyCats), and a tamed one lives in the den; either way a second copy
// must not wander in here. Otherwise a found cat always comes back (you met it
// and have not fed it yet, so it waits for you), and an unfound one comes on a
// lucky roll. The den, an unknown area and a roll that is not a finite number
// show nobody.
export function legendaryFor(state, areaId, u) {
  if (typeof areaId !== 'string' || !Object.hasOwn(LEGENDARY_BY_AREA, areaId)) return null;
  if (!Number.isFinite(u)) return null;
  const name = LEGENDARY_BY_AREA[areaId];
  if (inColony(state, name)) return null;
  return isFound(state, name) || u < legendaryOdds(foundCount(state)) ? name : null;
}

// legendaryRoll(roomSeed) → a number in [0, 1). Solo (roomSeed undefined, the
// same test game/walk.js seeds walkRng by) it is Math.random; in a room walk a
// fresh mulberry32 off the salted room seed, so partners roll the same number
// and no shared stream is drawn from.
export function legendaryRoll(roomSeed) {
  return roomSeed === undefined ? Math.random() : mulberry32((roomSeed ^ LEGEND_SALT) >>> 0)();
}
