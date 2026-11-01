import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  intruderAt, visitAt, routePoint, routeLength, INTRUDER_ROUTES,
  INTRUDER_PERIOD, ENTER_AT, INTRUDER_SPEED, ROUTE_MAX, FLEE_SPEED, CATCH_UP_SPEED,
  NOTICE_RANGE, CHALLENGE_RANGE, CHALLENGE_KEEP, RECHALLENGE_DELAY, HOLD_MAX,
} from '../src/intruders.js';
import { HOMES } from '../src/clanhomes.js';
import { RAIDER_SLOTS, clanCast } from '../src/clancast.js';

const TERRITORIES = ['woods', 'river', 'moor', 'pines'];

test('the numbers the plan fixes', () => {
  expect([INTRUDER_PERIOD, ENTER_AT, INTRUDER_SPEED, ROUTE_MAX]).toEqual([120, 10, 0.9, 90]);
  expect([FLEE_SPEED, CATCH_UP_SPEED, NOTICE_RANGE, CHALLENGE_RANGE]).toEqual([4.5, 2.5, 6, 3.5]);
  expect([CHALLENGE_KEEP, RECHALLENGE_DELAY, HOLD_MAX]).toEqual([10, 20, 40]);
});

test('eight routes: one per neighbouring clan in each of the four territories, the Pines included', () => {
  expect(Object.keys(INTRUDER_ROUTES).sort()).toEqual([...TERRITORIES].sort());
  let n = 0;
  for (const a of TERRITORIES) {
    expect(Object.keys(INTRUDER_ROUTES[a]).sort(), a).toEqual([...HOMES[a].neighbours].sort());
    for (const route of Object.values(INTRUDER_ROUTES[a])) {
      expect(route.length).toBeGreaterThanOrEqual(2);
      expect(Object.isFrozen(route)).toBe(true);
      n++;
    }
  }
  expect(n).toBe(8);
  expect(Object.isFrozen(INTRUDER_ROUTES)).toBe(true);
});

test('the same intruder in the same place on every device at the same moment', () => {
  for (const t of [1e9, 1e9 + 33.3, 1e9 + 500]) expect(intruderAt('woods', t)).toEqual(intruderAt('woods', t));
});

test('an intruder is always a warrior of a neighbouring clan, never the land\'s own clan', () => {
  for (const a of TERRITORIES) {
    const seen = new Set();
    for (let k = 0; k < 400; k++) {
      const v = visitAt(a, k * INTRUDER_PERIOD + 30);
      if (!v) continue;
      expect(v.visit).toBe(k);
      expect(HOMES[a].neighbours).toContain(v.clan);
      expect(v.clan).not.toBe(a);
      expect(RAIDER_SLOTS).toContain(v.member.slot);
      expect(v.member.clan).toBe(v.clan);
      expect(v.member).toBe(clanCast(v.clan)[v.member.slot]);
      seen.add(v.clan);
    }
    // both neighbours come visiting, sooner or later
    expect([...seen].sort(), a).toEqual([...HOMES[a].neighbours].sort());
  }
});

test('about three slots in four have one, and at most one at a time', () => {
  for (const a of TERRITORIES) {
    let have = 0;
    for (let k = 0; k < 400; k++) if (visitAt(a, k * INTRUDER_PERIOD + 30)) have++;
    expect(have / 400, a).toBeGreaterThan(0.65);
    expect(have / 400, a).toBeLessThan(0.85);
  }
  // one answer per moment, and only ever the visit of the slot that moment is in
  for (let t = 1e9; t < 1e9 + 20 * INTRUDER_PERIOD; t += 1.7) {
    const r = intruderAt('woods', t);
    if (!r) continue;
    expect(Array.isArray(r)).toBe(false);
    expect(r.visit).toBe(Math.floor(t / INTRUDER_PERIOD));
  }
});

test('every visit leaves the map before the next slot begins', () => {
  for (const area of Object.keys(INTRUDER_ROUTES)) for (const route of Object.values(INTRUDER_ROUTES[area])) {
    expect(ENTER_AT + routeLength(route) / INTRUDER_SPEED).toBeLessThan(INTRUDER_PERIOD);
  }
});

test('an intruder walks its route at its speed, on the map only while it is on the route', () => {
  // find a slot with a visit
  let k = Math.floor(1e9 / INTRUDER_PERIOD);
  while (!visitAt('river', k * INTRUDER_PERIOD)) k++;
  const v = visitAt('river', k * INTRUDER_PERIOD);
  const route = INTRUDER_ROUTES.river[v.clan];
  const t0 = k * INTRUDER_PERIOD + ENTER_AT;
  const len = routeLength(route);
  expect(intruderAt('river', t0 - 0.5)).toBeNull();
  const start = intruderAt('river', t0);
  expect(start).toMatchObject({ visit: k, clan: v.clan, member: v.member, s: 0 });
  expect(start.x).toBeCloseTo(route[0].x, 6);
  expect(start.z).toBeCloseTo(route[0].z, 6);
  const mid = intruderAt('river', t0 + 20);
  expect(mid.s).toBeCloseTo(20 * INTRUDER_SPEED, 6);
  expect(Math.hypot(mid.dx, mid.dz)).toBeCloseTo(1, 6);
  expect(intruderAt('river', t0 + len / INTRUDER_SPEED - 0.01)).not.toBeNull();
  expect(intruderAt('river', t0 + len / INTRUDER_SPEED + 0.5)).toBeNull();
});

test('routePoint and routeLength', () => {
  const r = [{ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 3, z: 10 }];
  expect(routeLength(r)).toBe(11);
  expect(routePoint(r, 0)).toEqual({ x: 0, z: 0, dx: 0.6, dz: 0.8 });
  const p = routePoint(r, 2.5);
  expect(p.x).toBeCloseTo(1.5, 9);
  expect(p.z).toBeCloseTo(2, 9);
  expect(routePoint(r, 8)).toEqual({ x: 3, z: 7, dx: 0, dz: 1 });
  expect(routePoint(r, 11)).toEqual({ x: 3, z: 10, dx: 0, dz: 1 });
  // clamped to the route's two ends
  expect(routePoint(r, -5)).toEqual(routePoint(r, 0));
  expect(routePoint(r, 50)).toEqual(routePoint(r, 11));
});

test('no intruders outside the territories with camps', () => {
  for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', 'gorge', '__proto__', 'constructor', undefined, null, 7]) {
    expect(intruderAt(a, 1e9 + 40)).toBeNull();
    for (let k = 0; k < 40; k++) expect(visitAt(a, k * INTRUDER_PERIOD + 30)).toBeNull();
  }
});

test('the Pines gets intruders from the River and the Moor', () => {
  const seen = new Set();
  for (let k = 0; k < 200; k++) {
    const v = visitAt('pines', k * INTRUDER_PERIOD + 30);
    if (v) seen.add(v.clan);
  }
  expect([...seen].sort()).toEqual(['moor', 'river']);
});

test('bad clocks give no intruder and never throw', () => {
  for (const t of [NaN, Infinity, -Infinity, '5', null, undefined, {}]) {
    expect(intruderAt('woods', t)).toBeNull();
    expect(visitAt('woods', t)).toBeNull();
  }
});

test('intruders.js stays free of anything that stores progress', () => {
  const src = readFileSync(new URL('../src/intruders.js', import.meta.url), 'utf8');
  const specs = [
    ...[...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/^\s*import\s+'([^']+)'/gm)].map((m) => m[1]),
  ];
  expect(specs.length).toBeGreaterThan(0);
  expect(src).not.toMatch(/import\s*\(/);
  const allowed = ['three', './cat/model.js', './cat/animator.js', './nametag.js', './rng.js', './clanhomes.js', './clancast.js', './rivalclans.js'];
  for (const s of specs) expect(allowed, s).toContain(s);
});
