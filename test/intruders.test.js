import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  intruderAt, visitAt, routePoint, routeLength, INTRUDER_ROUTES,
  INTRUDER_PERIOD, ENTER_AT, INTRUDER_SPEED, ROUTE_MAX, FLEE_SPEED, CATCH_UP_SPEED,
  NOTICE_RANGE, CHALLENGE_RANGE, CHALLENGE_KEEP, RECHALLENGE_DELAY, HOLD_MAX,
  createIntruders, isHostile, NO_INTRUDERS, INTRUDER_DECAL_RADIUS,
} from '../src/intruders.js';
import * as THREE from 'three';
import { animateCat } from '../src/cat/animator.js';
import { HOMES } from '../src/clanhomes.js';
import { RAIDER_SLOTS, clanCast, CLAN_COATS } from '../src/clancast.js';

// The animator, spied on so a test can read the pose the intruder was given.
vi.mock('../src/cat/animator.js', async (orig) => {
  const real = await orig();
  return { ...real, animateCat: vi.fn(real.animateCat) };
});

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

// ---------------------------------------------------------------------------
// Task 2: the intruder in the world. Headless THREE (no document, so no tag
// unless a test stubs one) and a fake clock.
// ---------------------------------------------------------------------------

function fakeScene() {
  const objects = new Set();
  return { objects, add: (o) => objects.add(o), remove: (o) => objects.delete(o) };
}

function withFakeDocument(fn) {
  const prev = globalThis.document;
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

const FAR = { x: 999, y: 0, z: 999 };
const DT = 1 / 30;

// A walk's worth of intruders on a fake clock: T is the wall clock in seconds.
function spawnIntruders({ areaId = 'woods', hostile = () => true, reducedMotion = false, showNames = false, onNotice, onBuild } = {}) {
  const scene = fakeScene();
  const clock = { T: 0 };
  const intr = createIntruders(scene, areaId, {
    now: () => clock.T, reducedMotion, showNames, hostile, onNotice, onBuild,
  });
  const step = (secs, catPos = () => FAR, each = () => {}) => {
    for (let i = 0; i < Math.round(secs / DT); i++) {
      clock.T += DT;
      const cp = catPos();
      intr.update(DT, cp);
      each();
    }
  };
  const meshes = () => [...scene.objects].filter((o) => o.userData?.intruder);
  return { scene, clock, intr, step, meshes };
}

// The first slot at or after 1e9 s whose visit passes `ok`.
function slotWith(areaId, ok = () => true, from = Math.floor(1e9 / INTRUDER_PERIOD)) {
  let k = from;
  while (!(visitAt(areaId, k * INTRUDER_PERIOD) && ok(k))) k++;
  return k;
}
const enterOf = (k) => k * INTRUDER_PERIOD + ENTER_AT;
const flat = (p) => ({ x: p.x, z: p.z });
const lastPoseOf = (group) => {
  const calls = animateCat.mock.calls.filter((c) => c[0] === group);
  return calls.length ? calls[calls.length - 1][1] : null;
};

describe('the intruder in the world (Task 2)', () => {
  test('an ally clan\'s cat is never hostile', () => {
    expect(isHostile({ clan: 'moor' }, { clanHome: true, picks: ['woods', 'moor'] })).toBe(false);
    expect(isHostile({ clan: 'moor' }, { clanHome: false, picks: ['woods'] })).toBe(false);
    expect(isHostile({ clan: 'moor' }, { clanHome: true, picks: ['woods'] })).toBe(true);
    expect(isHostile({ clan: 'moor' }, { clanHome: true, picks: undefined })).toBe(false);
    expect(isHostile(null, { clanHome: true, picks: ['woods'] })).toBe(false);
  });

  test('the mesh follows the clock', () => {
    const { clock, intr, step, meshes } = spawnIntruders();
    const k = slotWith('woods');
    clock.T = enterOf(k) + 5;
    step(DT);
    for (const later of [0, 17.3]) {
      step(later);
      const want = intruderAt('woods', clock.T);
      expect(meshes()).toHaveLength(1);
      const g = meshes()[0];
      expect(g.position.x).toBeCloseTo(want.x, 6);
      expect(g.position.z).toBeCloseTo(want.z, 6);
      expect(g.position.y).toBe(0);
      expect(intr.current()).toMatchObject({ visit: k, clan: want.clan, member: want.member, state: 'walking' });
      expect(intr.current().pos.x).toBeCloseTo(want.x, 6);
      // nose (-z) along the route
      expect(g.rotation.y).toBeCloseTo(Math.atan2(want.dx, want.dz) + Math.PI, 6);
      expect(g.scale.x).toBeCloseTo(0.85, 6);
    }
  });

  test('one mesh at a time: a new visit replaces the old one, and an empty slot has none in the scene', () => {
    const { clock, intr, step, meshes } = spawnIntruders();
    const k = slotWith('woods', (j) => !!visitAt('woods', (j + 1) * INTRUDER_PERIOD));
    clock.T = enterOf(k) + 3;
    step(DT);
    const first = meshes()[0];
    expect(meshes()).toHaveLength(1);
    // before the next visit comes on, the slot is empty: no mesh
    clock.T = (k + 1) * INTRUDER_PERIOD + 1;
    step(DT);
    expect(meshes()).toHaveLength(0);
    expect(intr.current()).toBeNull();
    clock.T = enterOf(k + 1) + 3;
    step(DT);
    expect(meshes()).toHaveLength(1);
    expect(meshes()[0]).not.toBe(first);
    expect(intr.current().visit).toBe(k + 1);
    // an empty slot: nobody, all slot long
    let empty = k + 2;
    while (visitAt('woods', empty * INTRUDER_PERIOD)) empty++;
    clock.T = empty * INTRUDER_PERIOD;
    step(INTRUDER_PERIOD - 1, () => FAR, () => expect(meshes()).toHaveLength(0));
    expect(intr.current()).toBeNull();
    // and it walks off the far end of its route by itself
    clock.T = enterOf(k);
    step(DT);
    expect(meshes()).toHaveLength(1);
    clock.T = enterOf(k) + routeLength(INTRUDER_ROUTES.woods[visitAt('woods', clock.T).clan]) / INTRUDER_SPEED + 1;
    step(DT);
    expect(meshes()).toHaveLength(0);
    intr.dispose();
    expect(meshes()).toHaveLength(0);
  });

  test('hostile and near: cross pose and one notice per visit', () => {
    const notices = [];
    const { clock, intr, step, meshes } = spawnIntruders({ onNotice: (c) => notices.push(c) });
    const k = slotWith('woods');
    clock.T = enterOf(k) + 5;
    step(DT);
    const g = meshes()[0];
    expect(lastPoseOf(g)).toBe('follow');
    expect(notices).toHaveLength(0);
    const near = () => ({ x: g.position.x + NOTICE_RANGE - 1, y: 0, z: g.position.z });
    step(1, near);
    expect(lastPoseOf(g)).toBe('cross');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ visit: k, state: 'walking' });
    step(2, () => FAR);
    expect(lastPoseOf(g)).toBe('follow');
    step(2, near);
    expect(notices).toHaveLength(1);
    expect(intr.current().state).toBe('walking');
  });

  test('not hostile: it just walks past', () => {
    const notices = [];
    const { clock, step, meshes } = spawnIntruders({ hostile: () => false, onNotice: (c) => notices.push(c) });
    clock.T = enterOf(slotWith('woods')) + 5;
    step(DT);
    const g = meshes()[0];
    step(3, () => ({ x: g.position.x + 1, y: 0, z: g.position.z }));
    expect(notices).toHaveLength(0);
    expect(lastPoseOf(g)).toBe('follow');
  });

  test('hold, release and flee', () => {
    const { clock, intr, step, meshes } = spawnIntruders();
    const k = slotWith('woods', (j) => !!visitAt('woods', (j + 1) * INTRUDER_PERIOD));
    const route = INTRUDER_ROUTES.woods[visitAt('woods', enterOf(k)).clan];
    clock.T = enterOf(k) + 10;
    step(DT);
    const g = meshes()[0];
    const held = flat(g.position);
    const face = { x: held.x + 2, z: held.z - 1 };
    intr.hold(k, 'me', face, { local: true });
    expect(intr.current().state).toBe('held');
    step(20);
    expect(flat(g.position)).toEqual(held);
    expect(g.rotation.y).toBeCloseTo(Math.atan2(face.x - held.x, face.z - held.z) + Math.PI, 6);
    expect(lastPoseOf(g)).toBe('cross');
    // ~18 m behind its clock
    const behind = intruderAt('woods', clock.T).s - (intruderAt('woods', enterOf(k) + 10).s);
    expect(behind).toBeGreaterThan(17.5);
    expect(behind).toBeLessThan(18.5);
    intr.release(k, 'me');
    expect(intr.current().state).toBe('walking');
    let prev = flat(g.position);
    let caught = null;
    step(14, () => FAR, () => {
      const p = flat(g.position);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThanOrEqual(CATCH_UP_SPEED * DT + 1e-6);
      prev = p;
      const want = intruderAt('woods', clock.T);
      if (caught === null && Math.hypot(p.x - want.x, p.z - want.z) < 1e-6) caught = clock.T;
    });
    expect(caught).not.toBeNull();
    expect(caught - (clock.T - 14)).toBeLessThan(12);
    expect(caught - (clock.T - 14)).toBeGreaterThan(10);
    // flee: to the nearer end of its route, then gone
    const s = intruderAt('woods', clock.T).s;
    const len = routeLength(route);
    const end = s < len - s ? route[0] : route[route.length - 1];
    const dist = Math.min(s, len - s);
    intr.flee(k);
    expect(intr.current().state).toBe('fleeing');
    expect(intr.isFled(k)).toBe(true);
    step(dist / FLEE_SPEED * 0.9);
    expect(intr.current().state).toBe('fleeing');
    step(dist / FLEE_SPEED * 0.1 + 0.2);
    expect(intr.current().state).toBe('gone');
    expect(intr.current().pos.x).toBeCloseTo(end.x, 6);
    expect(intr.current().pos.z).toBeCloseTo(end.z, 6);
    expect(meshes()).toHaveLength(0);
    // a release or a hold after a flee changes nothing, and it stays gone
    intr.release(k, 'me');
    intr.hold(k, 'sis', face);
    expect(intr.holders(k)).toEqual([]);
    step(5);
    expect(intr.current().state).toBe('gone');
    expect(meshes()).toHaveLength(0);
    // until the next visit
    clock.T = enterOf(k + 1) + 1;
    step(DT);
    expect(intr.current()).toMatchObject({ visit: k + 1, state: 'walking' });
    expect(intr.isFled(k + 1)).toBe(false);
    expect(meshes()).toHaveLength(1);
  });

  test('a call for another visit is ignored', () => {
    const { clock, intr, step } = spawnIntruders();
    const k = slotWith('woods');
    clock.T = enterOf(k) + 10;
    step(DT);
    intr.hold(k + 1, 'me', { x: 0, z: 0 });
    expect(intr.current().state).toBe('walking');
    intr.flee(k - 1);
    expect(intr.current().state).toBe('walking');
    expect(intr.isFled(k - 1)).toBe(false);
  });

  test('holds are counted', () => {
    const { clock, intr, step } = spawnIntruders();
    const k = slotWith('woods');
    clock.T = enterOf(k) + 10;
    step(DT);
    intr.hold(k, 'me', { x: 0, z: 0 }, { local: true });
    intr.hold(k, 'sis', { x: 1, z: 0 });
    expect(intr.holders(k).sort()).toEqual(['me', 'sis']);
    intr.release(k, 'sis');
    expect(intr.current().state).toBe('held');
    step(1);
    expect(intr.current().state).toBe('held');
    intr.release(k, 'me');
    expect(intr.holders(k)).toEqual([]);
    expect(intr.current().state).toBe('walking');
  });

  test('HOLD_MAX drops only a remote holder', () => {
    const { clock, intr, step } = spawnIntruders();
    const k = slotWith('woods');
    clock.T = enterOf(k) + 5;
    step(DT);
    intr.hold(k, 'sis', { x: 0, z: 0 });
    step(HOLD_MAX - 1);
    expect(intr.current().state).toBe('held');
    step(2);
    expect(intr.holders(k)).toEqual([]);
    expect(intr.current().state).toBe('walking');
    intr.hold(k, 'me', { x: 0, z: 0 }, { local: true });
    step(60);
    expect(intr.current().state).toBe('held');
    expect(intr.holders(k)).toEqual(['me']);
  });

  test('the intruder is swept for shadows on every visit', () => {
    const built = [];
    const { clock, step, meshes } = spawnIntruders({ onBuild: (g) => built.push(g) });
    const k = slotWith('woods', (j) => !!visitAt('woods', (j + 1) * INTRUDER_PERIOD));
    clock.T = enterOf(k) + 1;
    step(3);
    expect(built).toHaveLength(1);
    expect(built[0]).toBe(meshes()[0]);
    clock.T = enterOf(k + 1) + 1;
    step(3);
    expect(built).toHaveLength(2);
    expect(built[1]).toBe(meshes()[0]);
  });

  test('one anchor for the contact shadow, all walk long: where the cat is, hidden when there is none', () => {
    const { scene, clock, intr, step, meshes } = spawnIntruders();
    const a = intr.anchor;
    expect(a).toBeInstanceOf(THREE.Group);
    expect(scene.objects.has(a)).toBe(true);
    expect(a.visible).toBe(false);
    expect(INTRUDER_DECAL_RADIUS).toBeGreaterThan(0.6);
    expect(INTRUDER_DECAL_RADIUS).toBeLessThan(0.8);
    const k = slotWith('woods', (j) => !!visitAt('woods', (j + 1) * INTRUDER_PERIOD));
    for (const visit of [k, k + 1]) {
      clock.T = enterOf(visit) + 4;
      step(2);
      expect(a.visible).toBe(true);
      expect(a.position.x).toBeCloseTo(meshes()[0].position.x, 9);
      expect(a.position.z).toBeCloseTo(meshes()[0].position.z, 9);
      expect(intr.anchor).toBe(a);
    }
    intr.flee(k + 1);
    step(40);
    expect(intr.current().state).toBe('gone');
    expect(a.visible).toBe(false);
    clock.T = (k + 2) * INTRUDER_PERIOD + 1;
    step(DT);
    expect(a.visible).toBe(false);
    intr.dispose();
    expect(scene.objects.size).toBe(0);
    expect(NO_INTRUDERS.anchor).toBeNull();
  });

  test('a held visit outlives its slot, and the next one waits for it (R9)', () => {
    const { clock, intr, step, meshes } = spawnIntruders();
    const k = slotWith('woods', (j) => !!visitAt('woods', (j + 1) * INTRUDER_PERIOD));
    const route = INTRUDER_ROUTES.woods[visitAt('woods', enterOf(k)).clan];
    const len = routeLength(route);
    // held 30 m from its route's end, just before its clock walks off
    const tHold = enterOf(k) + (len - 30) / INTRUDER_SPEED;
    clock.T = tHold;
    step(DT);
    const g = meshes()[0];
    const at = flat(g.position);
    intr.hold(k, 'me', { x: 0, z: 0 }, { local: true });
    const one = () => expect(meshes().length).toBeLessThanOrEqual(1);
    // across the slot boundary and well into the next visit's walk
    step(enterOf(k + 1) + 15 - clock.T, () => FAR, one);
    expect(Math.floor(clock.T / INTRUDER_PERIOD)).toBe(k + 1);
    expect(intr.current()).toMatchObject({ visit: k, state: 'held' });
    expect(meshes()).toEqual([g]);
    expect(flat(g.position)).toEqual(at);
    // holds still count for the lingering visit, and the next one is ignored
    intr.hold(k, 'sis', { x: 1, z: 1 });
    expect(intr.holders(k).sort()).toEqual(['me', 'sis']);
    intr.hold(k + 1, 'sis', { x: 1, z: 1 });
    expect(intr.holders(k + 1)).toEqual([]);
    intr.release(k, 'sis');
    intr.release(k, 'me');
    expect(intr.current()).toMatchObject({ visit: k, state: 'walking' });
    // it walks on to its route's end, never faster than CATCH_UP_SPEED
    let prev = flat(g.position);
    let off = null;
    const t0 = clock.T;
    step(20, () => FAR, () => {
      one();
      if (off === null && intr.current()?.visit !== k) off = clock.T;
      if (off === null) {
        const p = flat(g.position);
        expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThanOrEqual(CATCH_UP_SPEED * DT + 1e-6);
        prev = p;
      }
    });
    expect(off).not.toBeNull();
    expect(off - t0).toBeGreaterThanOrEqual(30 / CATCH_UP_SPEED - 0.1);
    expect(off - t0).toBeLessThan(30 / CATCH_UP_SPEED + 0.5);
    // then the next visit, at its clock position
    expect(intr.current()).toMatchObject({ visit: k + 1, state: 'walking' });
    expect(meshes()).toHaveLength(1);
    expect(meshes()[0]).not.toBe(g);
    const want = intruderAt('woods', clock.T);
    expect(meshes()[0].position.x).toBeCloseTo(want.x, 6);
    expect(meshes()[0].position.z).toBeCloseTo(want.z, 6);
    // the old visit is truly gone: calls for it are ignored
    intr.hold(k, 'me', { x: 0, z: 0 });
    intr.flee(k);
    expect(intr.current()).toMatchObject({ visit: k + 1, state: 'walking' });
  });

  test('a fleeing visit runs on past its slot\'s end', () => {
    const { clock, intr, step, meshes } = spawnIntruders();
    const k = slotWith('woods', (j) => !!visitAt('woods', (j + 1) * INTRUDER_PERIOD));
    const route = INTRUDER_ROUTES.woods[visitAt('woods', enterOf(k)).clan];
    const mid = routeLength(route) / 2;
    clock.T = enterOf(k) + mid / INTRUDER_SPEED;
    step(DT);
    intr.hold(k, 'me', { x: 0, z: 0 }, { local: true });
    clock.T = (k + 1) * INTRUDER_PERIOD - 1;
    step(DT);
    intr.flee(k);
    step(3, () => FAR, () => expect(meshes().length).toBeLessThanOrEqual(1));
    expect(Math.floor(clock.T / INTRUDER_PERIOD)).toBe(k + 1);
    expect(intr.current()).toMatchObject({ visit: k, state: 'fleeing' });
    step(10);
    expect(intr.current()?.visit).not.toBe(k);
  });

  test('reduced motion: flee is a puff, not a run', () => {
    const { clock, intr, step, meshes, scene } = spawnIntruders({ reducedMotion: true });
    const k = slotWith('woods');
    clock.T = enterOf(k) + 10;
    step(DT);
    const g = meshes()[0];
    intr.flee(k);
    expect(intr.current().state).toBe('gone');
    expect(scene.objects.has(g)).toBe(false);
    // the puff is in the scene for a moment, then it too is gone
    const others = () => [...scene.objects].filter((o) => o !== intr.anchor);
    expect(others()).toHaveLength(1);
    step(2);
    expect(others()).toHaveLength(0);
    expect(intr.anchor.visible).toBe(false);
  });

  test('Legacy: no tag, but the same coat', () => {
    const k = slotWith('woods');
    const at = (showNames) => withFakeDocument(() => {
      const { clock, step, meshes } = spawnIntruders({ showNames });
      clock.T = enterOf(k) + 3;
      step(DT);
      return meshes()[0];
    });
    const legacy = at(false);
    const clan = at(true);
    const sprites = (g) => g.children.filter((c) => c.isSprite);
    expect(sprites(legacy)).toHaveLength(0);
    expect(sprites(clan)).toHaveLength(1);
    const ear = (g) => g.userData.parts.earL.material.color.getHex();
    expect(ear(legacy)).toBe(ear(clan));
  });

  test('an intruder wears its own clan\'s colours', () => {
    for (const area of TERRITORIES) {
      const { clock, intr, step, meshes } = spawnIntruders({ areaId: area });
      clock.T = enterOf(slotWith(area)) + 3;
      step(DT);
      const { member } = intr.current();
      expect(CLAN_COATS[member.clan]).toContain(member.style);
      expect(member.clan).not.toBe(area);
      const ear = meshes()[0].userData.parts.earL.material.color.getHex();
      expect(ear).toBe(new THREE.Color(member.style.base).getHex());
    }
  });

  test('no intruders outside the territories, and an inert stub for them', () => {
    const { clock, intr, step, meshes } = spawnIntruders({ areaId: 'park' });
    clock.T = 1e9;
    step(INTRUDER_PERIOD * 2);
    expect(meshes()).toHaveLength(0);
    expect(intr.current()).toBeNull();
    expect(NO_INTRUDERS.current()).toBeNull();
    expect(NO_INTRUDERS.isFled(1)).toBe(false);
    expect(NO_INTRUDERS.holders(1)).toEqual([]);
    for (const f of ['update', 'hold', 'release', 'flee', 'dispose']) expect(() => NO_INTRUDERS[f]()).not.toThrow();
  });
});
