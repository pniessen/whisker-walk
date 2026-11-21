// Her 11th birthday (2026-11-21): the clans' birthday Gathering on the island
// in the Pines' lake. This is the start-up half, kept small and pure: when the
// event is on, which walk the home line's Explore starts, whose birthday it
// is and whether she has blown the candles out today. The Gathering itself
// (the cats, the cake, the candles) is world/birthdaygathering.js, which only
// the Pines' download carries (world/areas.js, F6).
//
// The event is switched on by a gift code (the birthday-ui branch adds
// progression.hasEvent; until it is merged, hasEvent is simply missing and
// the event is off) or, for pictures and tests, by ?bday=1 in the address,
// read at call time like grow.js and roofsflag.js. Either way it ends at the
// end of 2026-11-22, local time.
//
// The Gathering is solo only: a walk in a room never has one (walk.js), so a
// co-walker's screen never has to agree with hers.
import { isClanId, pickableClans } from './clanhomes.js';
import { castFor } from './clancast.js';
import { activeCat } from './customcats.js';
import { validPetName } from './net.js';
import { CATALOG } from './progression.js';
import { RANK_KEYS } from './wordset.js';

export const BDAY_EVENT = 'bday-2026-11-21';
// Where the birthday walk goes: the Pines, for the island in its lake.
export const BDAY_AREA = 'pines';
// The end of the event: midnight at the start of 2026-11-23, local time.
export const bdayEndsAt = () => new Date(2026, 10, 23, 0, 0, 0, 0).getTime();

// The birthday walk starts on the Pines' shore at the foot of the island
// bridge, facing along it. The bridge's ends are lake.js bridgeEnds('pines'):
// the shore foot (10, 4) and the island end (20.56, 18.08); she starts 1.5 m
// back from the foot, on land (test/birthday.test.js checks these against
// lake.js, which this start-up file must not import).
export const BRIDGE_FOOT = Object.freeze({ x: 10, z: 4 });
export const BRIDGE_ISLAND_END = Object.freeze({ x: 20.56, z: 18.08 });
export const BDAY_START = Object.freeze({ x: 9.1, z: 2.8 });

let forced = null;

// The dev switch: ?bday=1 turns the event on without the gift code.
export function bdaySwitchOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('bday') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setBdaySwitch(value) {
  forced = value === null || value === undefined ? null : !!value;
}

// Is the birthday on? The code redeemed (or the dev switch), and not past the
// end of 2026-11-22 local time.
export function birthdayActive(progression, now = Date.now()) {
  if (!(Number.isFinite(now) && now < bdayEndsAt())) return false;
  if (bdaySwitchOn()) return true;
  try {
    return progression?.hasEvent?.(BDAY_EVENT) === true;
  } catch {
    return false;
  }
}

// ---- the candles, once a day ---------------------------------------------------
// Kept on this device (the Gathering only ever shows on her own device), under
// her local date.
export const CANDLES_KEY = 'whisker-walk-bday-candles';
export function localDay(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const defaultStore = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function candlesBlownToday({ store = defaultStore(), now = Date.now() } = {}) {
  try {
    return store?.getItem?.(CANDLES_KEY) === localDay(now);
  } catch {
    return false;
  }
}

export function noteCandlesBlown({ store = defaultStore(), now = Date.now() } = {}) {
  try {
    store?.setItem?.(CANDLES_KEY, localDay(now));
  } catch { /* a private window: this walk only */ }
}

// The birthday is on and today's candles are still lit: the home line shows,
// Explore goes to the bridge, and a solo Pines walk has the Gathering.
export function birthdayDue(progression, { store = defaultStore(), now = Date.now() } = {}) {
  return birthdayActive(progression, now) && !candlesBlownToday({ store, now });
}

// ---- who ---------------------------------------------------------------------
// The clan whose leader speaks from the rock: hers, else the first clan.
export function speakerClan(state) {
  const mine = state?.clanPick?.mine;
  return isClanId(mine) ? mine : pickableClans()[0];
}

// The leader of that clan, as clancast.js has it.
export function speakerFor(state) {
  const clan = speakerClan(state);
  return castFor(clan).find((m) => m.rank === RANK_KEYS.leader) ?? null;
}

// The name of the cat she is playing as: her own cat's name, else the name
// her cat goes by (the friend name), else the ready-made cat's own name.
// Never anything else.
export function birthdayCatName(state) {
  const a = activeCat(state);
  if (a.custom && typeof a.name === 'string' && validPetName(a.name)) return a.name.slice(0, 16);
  if (typeof state?.petName === 'string' && validPetName(state.petName)) return state.petName.slice(0, 16);
  return CATALOG.cats[a.breed]?.name ?? CATALOG.cats.tabby.name;
}

// Whether the birthday walk counts as a Pines walk: only when the Pines are
// already hers. A birthday visit to a place she has not opened leaves her
// progress as it was (no walk counted there, nothing unlocked).
export function bdayCountsWalk(state, areaId) {
  return Array.isArray(state?.unlocked?.areas) && state.unlocked.areas.includes(areaId);
}
