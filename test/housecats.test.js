import { test, expect } from 'vitest';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, KITTYPET_NAMES, isKittypetName, isStrayName } from '../src/straynames.js';

test('the kittypets are the spec list plus Duchess, all existing stray names', () => {
  expect([...KITTYPET_NAMES].sort()).toEqual(['Baron von Fluff', 'Biscuit', 'Butterscotch', 'Clementine', 'Custard',
    'Duchess', 'Marmalade', 'Mochi', 'Peaches', 'Petunia', 'Sir Pounce', 'Truffle', 'Waffles'].sort());
  for (const n of KITTYPET_NAMES) expect(isStrayName(n)).toBe(true);
  expect(Object.isFrozen(KITTYPET_NAMES)).toBe(true);
});
test('KITTYPET_NAMES keeps its order: twelve CAT_NAMES in CAT_NAMES order, then Duchess', () => {
  // The day's wanderer is picked by index (WANDER_NAMES), so a reorder would
  // change who visits on a given day for every device at once.
  expect(KITTYPET_NAMES).toEqual(['Marmalade', 'Baron von Fluff', 'Mochi', 'Biscuit', 'Clementine', 'Waffles',
    'Petunia', 'Sir Pounce', 'Butterscotch', 'Truffle', 'Custard', 'Peaches', 'Duchess']);
  const cats = KITTYPET_NAMES.filter((n) => CAT_NAMES.includes(n));
  expect(cats.map((n) => CAT_NAMES.indexOf(n))).toEqual([...cats.map((n) => CAT_NAMES.indexOf(n))].sort((a, b) => a - b));
  expect(KITTYPET_NAMES.at(-1)).toBe('Duchess');
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
  // Final review, finding 3: a missing or malformed colony list is no colony.
  const d = days.find((x) => wandererFor('woods', x));
  for (const bad of [null, undefined, 'Marmalade', 5, {}]) {
    expect(() => wandererFor('woods', d, bad)).not.toThrow();
    expect(wandererFor('woods', d, bad)).toBe(wandererFor('woods', d));
  }
});
// Final review, finding 4: the order picks the day's cat, so a reorder would
// split co-walkers on different builds. Pinned.
test('WANDER_NAMES keeps its order', () => {
  expect(WANDER_NAMES).toEqual(['Marmalade', 'Baron von Fluff', 'Mochi', 'Biscuit', 'Clementine', 'Waffles',
    'Petunia', 'Sir Pounce', 'Butterscotch', 'Truffle', 'Custard', 'Peaches']);
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
test('wanderStart stops at the middle rather than overshooting it', () => {
  for (const [x, z] of [[3, 4], [0.5, 0], [-2, 1], [0, -5.9]]) {
    const p = wanderStart({ x, z });
    expect(p.x, `${x},${z}`).toBeCloseTo(0, 9);
    expect(p.z, `${x},${z}`).toBeCloseTo(0, 9);
  }
  // exactly WANDER_STEP away lands on the middle too, and further is unchanged
  const q = wanderStart({ x: 0, z: WANDER_STEP });
  expect(q.x).toBeCloseTo(0, 9);
  expect(q.z).toBeCloseTo(0, 9);
  const r = wanderStart({ x: 0, z: 10 });
  expect(r).toEqual({ x: 0, z: 10 - WANDER_STEP });
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

import { wanderArrivalLine, wanderStayLine, kittypetTamedLine } from '../src/housecats.js';
import { OUTSIDE_WORDS, PLACE_WORDS } from '../src/clanwords.js';

test('the arrival line', () => {
  expect(wanderArrivalLine('Marmalade')).toBe(`Marmalade the ${OUTSIDE_WORDS.house} has wandered in from ${PLACE_WORDS.town} 🔔`);
});

test('the bring-home lines', () => {
  expect(wanderStayLine('Marmalade', 'The Woods')).toBe('Marmalade will wait for you here in The Woods 🐾');
  expect(kittypetTamedLine('Marmalade')).toBe(`Marmalade left ${PLACE_WORDS.town} to join you! She'll be waiting in the den 🏠`);
});

// Final review, finding 2: the arrival line waits on the session for the walk to start.
import { takeArrivalLine, shedKittypetCollar } from '../src/housecats.js';
import * as THREE from 'three';
test('takeArrivalLine gives the line once, then nothing', () => {
  const session = { arrivalLine: 'hello' };
  expect(takeArrivalLine(session)).toBe('hello');
  expect(session.arrivalLine).toBeNull();
  expect(takeArrivalLine(session)).toBeNull();
  expect(takeArrivalLine({ arrivalLine: null })).toBeNull();
  expect(takeArrivalLine({})).toBeNull();
  expect(takeArrivalLine(null)).toBeNull();
});

// Final review, finding 7: a fed kittypet's collar comes off for the rest of the walk.
test('shedKittypetCollar takes the collar off a non-colony kittypet only, and disposes nothing', () => {
  const strayWith = (name, colony) => {
    const group = new THREE.Group();
    const collar = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    collar.name = 'collar';
    group.add(collar);
    return { stray: { name, colony, group }, collar };
  };
  const k = strayWith('Marmalade', false);
  let disposed = false;
  k.collar.geometry.addEventListener('dispose', () => { disposed = true; });
  expect(shedKittypetCollar(k.stray)).toBe(true);
  expect(k.stray.group.getObjectByName('collar')).toBeUndefined();
  expect(k.collar.parent).toBeNull();
  expect(disposed).toBe(false);
  expect(shedKittypetCollar(k.stray)).toBe(false);          // nothing left to take off
  const colonyCat = strayWith('Marmalade', true);             // a colony cat's own wear stays
  expect(shedKittypetCollar(colonyCat.stray)).toBe(false);
  expect(colonyCat.stray.group.getObjectByName('collar')).toBe(colonyCat.collar);
  const plain = strayWith(CAT_NAMES.find((n) => !isKittypetName(n)), false);
  expect(shedKittypetCollar(plain.stray)).toBe(false);
  expect(plain.stray.group.getObjectByName('collar')).toBe(plain.collar);
  expect(shedKittypetCollar({ name: 'Marmalade', colony: false, group: new THREE.Group() })).toBe(false);
  for (const bad of [null, undefined, {}, { name: 'Marmalade' }]) expect(shedKittypetCollar(bad)).toBe(false);
});
