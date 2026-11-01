import { test, expect } from 'vitest';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, KITTYPET_NAMES, isKittypetName, isStrayName } from '../src/straynames.js';

test('the kittypets are the spec list plus Duchess, all existing stray names', () => {
  expect([...KITTYPET_NAMES].sort()).toEqual(['Baron von Fluff', 'Biscuit', 'Butterscotch', 'Clementine', 'Custard',
    'Duchess', 'Marmalade', 'Mochi', 'Peaches', 'Petunia', 'Sir Pounce', 'Truffle', 'Waffles'].sort());
  for (const n of KITTYPET_NAMES) expect(isStrayName(n)).toBe(true);
  expect(Object.isFrozen(KITTYPET_NAMES)).toBe(true);
});
test('no kit is a kittypet, and CAT_NAMES is untouched', () => {
  for (const n of KIT_NAMES) expect(isKittypetName(n)).toBe(false);
  expect(CAT_NAMES).toHaveLength(48);
  expect([CAT_NAMES[0], CAT_NAMES[47]]).toEqual(['Pickles', 'Comet']);
  expect(LEGENDARY_NAMES.filter(isKittypetName)).toEqual(['Duchess']);
});
test('isKittypetName is total', () => {
  for (const v of [null, undefined, 3, {}, '__proto__', 'marmalade', '']) expect(isKittypetName(v)).toBe(false);
});

import { collarFor, KITTYPET_COLLAR, KITTYPET_COLLARS, WANDER_AREAS, WANDER_ODDS, WANDER_NAMES, wandererFor, walkWanderer, wanderStart, WANDER_STEP, territoryCastExcludes, wanderSpotFor, WANDER_CAMP_GAP } from '../src/housecats.js';
import { KITTYPET_NAMES } from '../src/straynames.js';
import { TERRITORY_AREAS } from '../src/colony.js';
import { castFor } from '../src/clancast.js';
import { CATALOG } from '../src/progression.js';

const S = (extra = {}) => ({ edition: 'canon', colony: { cats: [] }, ...extra });
test('kittypets wear a collar in Clan Edition only, and only outside the colony', () => {
  expect(collarFor(S(), 'Marmalade')).toBe(KITTYPET_COLLAR);
  expect(collarFor(S(), 'Duchess')).toBe('heart');
  expect(collarFor(S(), 'Pickles')).toBeNull();
  expect(collarFor(S({ edition: 'legacy' }), 'Marmalade')).toBeNull();
  expect(collarFor(S({ colony: { cats: [{ name: 'Marmalade' }] } }), 'Marmalade')).toBeNull();
  expect(collarFor(null, 'Marmalade')).toBe(KITTYPET_COLLAR); // no state reads as Clan Edition
  expect(collarFor(S(), '__proto__')).toBeNull();
});
test('every collar is a shop collar', () => {
  for (const id of [KITTYPET_COLLAR, ...Object.values(KITTYPET_COLLARS)]) {
    expect(CATALOG.accessories[id].slot).toBe('collar');
  }
});

const days = Array.from({ length: 730 }, (_, d) => new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10));
test('wanderers come only to territories a Twolegplace path reaches', () => {
  for (const a of WANDER_AREAS) expect(TERRITORY_AREAS).toContain(a);
  for (const a of ['woods', 'river', 'moor']) expect(WANDER_AREAS).toContain(a);
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'pines', 'island', 'gorge', '__proto__']) {
    expect(days.some((d) => wandererFor(a, d))).toBe(false);
  }
});
test('about one day in five, per territory', () => {
  for (const a of WANDER_AREAS) {
    const rate = days.filter((d) => wandererFor(a, d)).length / days.length;
    expect(rate).toBeGreaterThan(WANDER_ODDS - 0.05);
    expect(rate).toBeLessThan(WANDER_ODDS + 0.05);
  }
});
test('the same day and territory give the same wanderer, and every one is a kittypet stray', () => {
  const seen = new Set();
  for (const d of days) {
    const w = wandererFor('woods', d);
    expect(wandererFor('woods', d)).toBe(w);
    if (w) { expect(WANDER_NAMES).toContain(w); seen.add(w); }
  }
  expect(WANDER_NAMES).not.toContain('Duchess');
  expect(seen.size).toBeGreaterThan(6);
});
test('a kittypet already in the colony means no wanderer that day on a colony walk, never a second pick', () => {
  const d = days.find((x) => wandererFor('woods', x));
  const w = wandererFor('woods', d);
  const state = { colony: { cats: [{ name: w }] } };
  expect(walkWanderer(state, 'woods', { ymd: d, colonyWalk: true, isDen: false })).toBeNull();
  expect(walkWanderer(state, 'woods', { ymd: d, colonyWalk: false, isDen: false })).toBe(w);
  expect(walkWanderer(state, 'woods', { ymd: d, colonyWalk: true, isDen: true })).toBeNull();
  const other = { colony: { cats: [{ name: WANDER_NAMES.find((n) => n !== w) }] } };
  expect(walkWanderer(other, 'woods', { ymd: d, colonyWalk: true, isDen: false })).toBe(w);
});
test('bad input shows nobody and never throws', () => {
  for (const ymd of [undefined, null, 5, '', '2026-1-1', 'today']) expect(wandererFor('woods', ymd)).toBeNull();
  expect(walkWanderer(null, 'woods', { ymd: days[0], colonyWalk: true })).toBe(wandererFor('woods', days[0]));
});
test('kittypets stay out of every territory cast, and only there', () => {
  for (const a of TERRITORY_AREAS) expect([...territoryCastExcludes(a)].sort()).toEqual([...KITTYPET_NAMES].sort());
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', '__proto__', undefined]) {
    expect(territoryCastExcludes(a)).toEqual([]);
  }
});
test('wanderStart steps WANDER_STEP metres toward the middle', () => {
  const p = wanderStart({ x: 44, z: 12 });
  expect(Math.hypot(p.x - 44, p.z - 12)).toBeCloseTo(WANDER_STEP, 5);
  expect(Math.hypot(p.x, p.z)).toBeLessThan(Math.hypot(44, 12));
  expect(wanderStart({ x: 0, z: 0 })).toEqual({ x: -WANDER_STEP, z: 0 });
});
test('no territory clan cat is named like a stray or a kittypet', () => {
  for (const id of TERRITORY_AREAS) {
    for (const m of castFor(id)) {
      expect(CAT_NAMES, `${id} ${m.name}`).not.toContain(m.name);
      expect(KITTYPET_NAMES, `${id} ${m.name}`).not.toContain(m.name);
    }
  }
});
test('wanderSpotFor: keeps a good start, moves off a bad one, null when nothing passes, deterministic', () => {
  const camp = { cx: 0, cz: 0, r: 5 };
  const ok = () => true;
  expect(wanderSpotFor({ x: 20, z: 0 }, ok, camp)).toEqual({ x: 20, z: 0 });
  expect(wanderSpotFor({ x: 1, z: 1 }, ok, undefined)).toEqual({ x: 1, z: 1 });
  const near = wanderSpotFor({ x: 8, z: 0 }, ok, camp);
  expect(near).not.toBeNull();
  expect(near).not.toEqual({ x: 8, z: 0 });
  expect(Math.hypot(near.x, near.z)).toBeGreaterThanOrEqual(camp.r + WANDER_CAMP_GAP);
  const noWest = (x) => x >= 0;
  const moved = wanderSpotFor({ x: -1, z: 0 }, noWest, null);
  expect(moved).not.toBeNull();
  expect(moved.x).toBeGreaterThanOrEqual(0);
  expect(wanderSpotFor({ x: 8, z: 0 }, () => false, camp)).toBeNull();
  expect(wanderSpotFor({ x: 8, z: 0 }, ok, camp)).toEqual(near);
  expect(wanderSpotFor({ x: 8, z: 0 }, (x, z) => Math.hypot(x - 8, z) > 6.2, null)).toBeNull();
});

import { wanderArrivalLine } from '../src/housecats.js';
import { OUTSIDE_WORDS, PLACE_WORDS } from '../src/clanwords.js';

test('the arrival line', () => {
  expect(wanderArrivalLine('Marmalade')).toBe(`Marmalade the ${OUTSIDE_WORDS.house} has wandered in from ${PLACE_WORDS.town} 🔔`);
});
