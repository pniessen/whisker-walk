import { describe, it, expect, vi, afterEach } from 'vitest';
import * as R from '../src/world/roofsplan.js';
import { validateGround, STEP_MAX } from '../src/ground.js';
import { CAT_RADIUS } from '../src/player.js';
import { validateTraversal, LONG_LEAP_ID, BASE_ABILITIES } from '../src/traversal.js';
import { floodTraversal, TRAVERSAL_FLOOD_STEP } from './helpers/traversalflood.js';

// The plan of the Rooftops (step 2), pure: its ground and moves pass their
// rules, a child can never be stuck high up, and the street below and the
// pitched roofs are never stood on.

const BASE = BASE_ABILITIES;
const LL = { ...BASE, longLeap: true };
const ALL = { longLeap: true, steady: true, climb: 2.2 };

const a = R.roofsArea();
const floods = new Map();
const flood = (ab) => {
  if (!floods.has(ab)) floods.set(ab, floodTraversal(a, { abilities: ab }));
  return floods.get(ab);
};
const spawnOf = (f) => f.regionAt(R.ROOFS_SPAWN.x, R.ROOFS_SPAWN.z);
const kinds = (kind) => a.traversal.hops.filter((h) => h.kind === kind);
const EPS = 1e-9;

describe('the plan of the Rooftops', () => {
  it('the levels are the spec’s, frozen', () => {
    expect(R.LEVELS).toEqual({
      STREET: -4, GROUND: 0, BIN: 0.9, BUNKER: 1.2, SHED: 2.0, GARAGE: 2.8, EXTENSION: 3.6, OUTRIGGER: 5.1, VOID: 6.0,
      FLAT: 6.6, RIDGE: 8.1, SHOP: 9.6, WAREHOUSE: 11.1, TANK: 12.6, BELFRY: 14.1, LANTERN: 15.6, TOP: 17.1,
    });
    expect(Object.isFrozen(R.LEVELS)).toBe(true);
    expect(Object.isFrozen(R.BLOCKS)).toBe(true);
    expect(R.VANE_TIP).toBe(20.0);
  });

  it('the ground and the moves pass their rules', () => {
    expect(validateGround(R.ROOFS_GROUND)).toEqual([]);
    expect(validateTraversal(R.ROOFS_TRAVERSAL, { ground: a.ground, bounds: R.ROOFS_BOUNDS, colliders: R.ROOFS_COLLIDERS })).toEqual([]);
  });

  it('is an area record like the yard’s', () => {
    expect(a.name).toBe('The Rooftops');
    expect(a.bounds).toBe(R.ROOFS_BOUNDS);
    expect(a.spawn).toBe(R.ROOFS_SPAWN);
    expect(a.colliders).toBe(R.ROOFS_COLLIDERS);
    expect(a.waters).toEqual([]);
    expect(a.perches).toBe(R.ROOFS_PERCHES);
    expect(a.pois).toBe(R.ROOFS_POIS);
    expect(a.traversal.crossings.length).toBe(R.ROOFS_TRAVERSAL.crossings.length);
    expect(a.ground.y(R.ROOFS_SPAWN.x, R.ROOFS_SPAWN.z)).toBe(R.LEVELS.GROUND);
  });

  it('is about the Farm’s size', () => {
    const { minX, maxX, minZ, maxZ } = R.ROOFS_BOUNDS;
    expect(maxX - minX).toBeGreaterThanOrEqual(90);
    expect(maxX - minX).toBeLessThanOrEqual(110);
    expect(maxZ - minZ).toBeGreaterThanOrEqual(90);
    expect(maxZ - minZ).toBeLessThanOrEqual(110);
  });

  it('every block stands at its level: the street at STREET, a pitched roof at VOID', () => {
    for (const b of R.BLOCKS) {
      if (b.kind === 'disc') expect([b.id, a.ground.y(b.x, b.z)]).toEqual([b.id, b.y]);
      else if (b.kind !== 'stair') expect([b.id, Object.values(R.LEVELS)]).toEqual([b.id, expect.arrayContaining([b.y])]);
    }
    for (const s of R.STREETS) expect(a.ground.y((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)).toBe(R.LEVELS.STREET);
    for (const p of R.PITCHED) expect(a.ground.y(p.x0 + 2.5, p.z0 + 2)).toBe(R.LEVELS.VOID);
  });

  it('never stuck, with every ability: from anywhere she can get to, the alley without Long Leap', () => {
    const spawnR = spawnOf(flood(BASE));
    for (const ab of [BASE, LL, ALL]) {
      const f = flood(ab);
      const stuck = [...f.reachable(spawnOf(f))].filter((r) => !flood(BASE).reachable(r).has(spawnR)).map((r) => f.levelOf(r));
      expect(stuck).toEqual([]);
    }
  });

  it('every named roof is reached without Long Leap; the lantern only with it', () => {
    const base = flood(BASE);
    const got = base.reachable(spawnOf(base));
    for (const [id, p] of Object.entries(R.ROOFS_PLACES)) {
      const r = base.regionAt(...p);
      expect([id, r >= 0]).toEqual([id, true]);
      expect([id, a.ground.y(p.x, p.z)]).toEqual([id, p.y]); // the spot is on its roof
      expect([id, got.has(r)]).toEqual([id, id !== 'lantern']);
    }
    const ll = flood(LL);
    expect(ll.reachable(spawnOf(ll)).has(ll.regionAt(...R.ROOFS_PLACES.lantern))).toBe(true);
  });

  it('no cell of the street or under a pitched roof can be reached', () => {
    const f = flood(ALL);
    const got = f.reachable(spawnOf(f));
    const { minX, minZ } = R.ROOFS_BOUNDS;
    const step = TRAVERSAL_FLOOD_STEP;
    let checked = 0;
    const reached = [];
    for (const rect of [...R.STREETS, ...R.PITCHED]) {
      for (let i = Math.ceil((rect.x0 - minX) / step - EPS); minX + i * step <= rect.x1 + EPS; i++) {
        for (let j = Math.ceil((rect.z0 - minZ) / step - EPS); minZ + j * step <= rect.z1 + EPS; j++) {
          const x = minX + i * step;
          const z = minZ + j * step;
          if (Math.abs(a.ground.y(x, z) - rect.y) > EPS) continue; // a disc or a flat block over it
          checked++;
          if (got.has(f.regionAt(x, z))) reached.push([x, z]);
        }
      }
    }
    expect(checked).toBeGreaterThan(20000);
    expect(reached.slice(0, 5)).toEqual([]);
  });

  it('the fire escapes are stairs: the garage roof and the warehouse roof are walked to from the alley', () => {
    const base = flood(BASE);
    const spawnR = spawnOf(base);
    expect(base.regionAt(...R.ROOFS_PLACES.warehouse)).toBe(spawnR);
    expect(base.regionAt(...R.ROOFS_PLACES.garages)).toBe(spawnR);
  });

  it('the first roof is soon: a climb within 16 m of the spawn, the shed two hops up', () => {
    const base = flood(BASE);
    const spawnR = spawnOf(base);
    const near = kinds('climb').filter((h) => base.regionAt(h.x0, h.z0, h.y0) === spawnR
      && Math.hypot(h.x0 - R.ROOFS_SPAWN.x, h.z0 - R.ROOFS_SPAWN.z) <= 16);
    expect(near.length).toBeGreaterThan(0);
    // Hop count: a breadth-first walk over the flood's edges (each move is one).
    const hops = new Map([[spawnR, 0]]);
    const queue = [spawnR];
    while (queue.length) {
      const r = queue.shift();
      for (const n of base.edges.get(r)) if (!hops.has(n)) { hops.set(n, hops.get(r) + 1); queue.push(n); }
    }
    expect(hops.get(base.regionAt(...R.ROOFS_PLACES.shed))).toBe(2);
  });

  it('has the crossings, gaps and marks the plan names', () => {
    const count = (k) => a.traversal.crossings.filter((c) => c.kind === k).length;
    expect(count('plank')).toBeGreaterThanOrEqual(3);
    expect(count('ridge')).toBeGreaterThanOrEqual(6);
    expect(count('gutter')).toBeGreaterThanOrEqual(2);
    expect(count('line')).toBeGreaterThanOrEqual(2);
    expect(count('pipe')).toBeGreaterThanOrEqual(1);
    const leaps = kinds('leap');
    expect(leaps.filter((h) => h.requires == null).length).toBeGreaterThanOrEqual(6);
    const long = leaps.filter((h) => h.requires === LONG_LEAP_ID);
    expect(long).toHaveLength(3);
    expect(leaps.filter((h) => h.requires != null && h.requires !== LONG_LEAP_ID)).toEqual([]);
    for (const h of long) expect([h.id, h.dist >= 3.6 - EPS && h.dist <= 4.5 + EPS]).toEqual([h.id, true]);
    for (const h of a.traversal.hops) expect([h.id, R.HOP_MARKS[h.kind]]).toEqual([h.id, expect.arrayContaining([h.mark])]);
    for (const h of kinds('climb')) expect([h.id, h.dy >= 0.8 - EPS && h.dy <= 1.5 + EPS]).toEqual([h.id, true]);
    for (const h of kinds('drop')) expect([h.id, -h.dy >= 0.9 - EPS && -h.dy <= 3.0 + EPS]).toEqual([h.id, true]);
  });

  it('every ridge rail lies over slates or its own stacks, never in the air over a flat roof', () => {
    // sampled every 0.25 m along each ridge: the ground under the rail is the
    // void under the slates, or a chimney stack's disc at the ridge
    const stacks = R.BLOCKS.filter((b) => b.kind === 'disc' && b.id.startsWith('stack-'));
    const ridges = R.ROOFS_TRAVERSAL.crossings.filter((c) => c.kind === 'ridge');
    expect(ridges.length).toBeGreaterThanOrEqual(6);
    const bad = [];
    let sampled = 0;
    for (const c of ridges) {
      const p = c.points[0];
      const q = c.points[c.points.length - 1];
      const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.25);
      for (let k = 0; k <= n; k++) {
        const x = p.x + ((q.x - p.x) * k) / n;
        const z = p.z + ((q.z - p.z) * k) / n;
        const y = a.ground.y(x, z);
        const onStack = Math.abs(y - R.LEVELS.RIDGE) < EPS && stacks.some((s) => Math.hypot(x - s.x, z - s.z) <= s.r + EPS);
        sampled++;
        if (!(Math.abs(y - R.LEVELS.VOID) < EPS || onStack)) bad.push([c.id, +x.toFixed(2), z, y]);
      }
    }
    expect(sampled).toBeGreaterThan(200);
    expect(bad.slice(0, 4)).toEqual([]);
  });

  it('the tower is on the skyline from the alley', () => {
    const from = { x: R.ROOFS_SPAWN.x, y: 2.5, z: R.ROOFS_SPAWN.z };
    const to = { x: 26, y: 18.5, z: -17.9 };
    const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / 0.25);
    const under = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      if (y <= R.skylineY(x, z)) under.push([x, z]);
    }
    expect(under).toEqual([]);
  });

  it('the skyline is the ground, the ridge over a pitched roof and the vane at the top', () => {
    expect(R.skylineY(-15, 5)).toBe(R.LEVELS.RIDGE); // over the terrace's slates
    expect(R.skylineY(2, 5)).toBe(R.LEVELS.FLAT); // the flat-roofed house
    expect(R.skylineY(0, -5)).toBe(R.LEVELS.STREET);
    expect(R.skylineY(R.VANE.x, R.VANE.z)).toBe(R.VANE_TIP);
    expect(R.skylineY(R.VANE.x + 0.5, R.VANE.z)).toBe(R.LEVELS.TOP);
    expect(R.skylineY(R.ROOFS_SPAWN.x, R.ROOFS_SPAWN.z)).toBe(R.LEVELS.GROUND);
  });

  it('the back yards’ walls are ground she cannot walk through, and every yard opens to the alley at a gateway', () => {
    const base = flood(BASE);
    const spawnR = spawnOf(base);
    expect(R.YARD_WALLS).toHaveLength(22);
    for (const w of R.YARD_WALLS) {
      const zm = (w.z0 + w.z1) / 2;
      expect([w.x, zm, a.ground.y(w.x, zm)]).toEqual([w.x, zm, R.YARD.h]);
      // straight across the wall is no step, at both ends and the middle
      for (const z of [w.z0 + 0.05, zm, w.z1 - 0.05]) expect([w.x, z, a.ground.canStep(w.x - 0.4, z, w.x + 0.4, z)]).toEqual([w.x, z, false]);
    }
    for (const x of R.YARD_WALL_XS) {
      const zg = (R.YARD.gate0 + R.YARD.gate1) / 2;
      expect([x, a.ground.canStep(x - 0.4, zg, x + 0.4, zg)]).toEqual([x, true]); // the gateway
    }
    // every yard, between its walls, is walked to from the alley
    for (let k = 1; k <= 12; k++) {
      for (const z of [21.5, 26.5]) {
        const x = -30 + 5 * (k - 1) + 2.5;
        expect([k, z, base.regionAt(x, z, R.LEVELS.GROUND)]).toEqual([k, z, spawnR]);
      }
    }
  });

  it('every collider stands on one level', () => {
    for (const c of R.ROOFS_COLLIDERS) {
      const ys = [a.ground.y(c.x, c.z)];
      for (let k = 0; k < 8; k++) ys.push(a.ground.y(c.x + Math.cos((k * Math.PI) / 4) * c.r, c.z + Math.sin((k * Math.PI) / 4) * c.r));
      expect([c.x, c.z, Math.max(...ys) - Math.min(...ys) <= STEP_MAX]).toEqual([c.x, c.z, true]);
    }
  });

  it('PITCHED and STREETS are the pitched and street blocks’ rects', () => {
    const rects = (kind) => R.BLOCKS.filter((b) => b.kind === kind).map(({ x0, x1, z0, z1, y }) => ({ x0, x1, z0, z1, y }));
    expect(R.PITCHED).toEqual(rects('pitched'));
    expect(R.STREETS).toEqual(rects('street'));
  });

  it('no dead-end slot narrower than the cat: no strip of ground under 0.7 m wide, walled higher on both sides, for more than 1 m', () => {
    // Scanned along x and along z every 0.1 m: a run of ground she can walk
    // (no step over STEP_MAX inside it), narrower than her (2 x CAT_RADIUS),
    // with ground higher than a step at both of its ends. The street and the
    // pitched roofs' VOID are never reached (above), so they are left out.
    // A pinch shorter than 1 m (between the shed and its bin) is a gap she
    // walks round, not a slot she walks into.
    const g = a.ground;
    const B = R.ROOFS_BOUNDS;
    const d = 0.05;
    const narrow = [];
    const scan = (dir, fixed, lo, hi, at) => {
      let start = lo, prev = at(lo), before = null;
      for (let t = lo + d; t <= hi + EPS; t += d) {
        const y = at(t);
        if (Math.abs(y - prev) > STEP_MAX) {
          const open = prev !== R.LEVELS.STREET && prev !== R.LEVELS.VOID;
          if (open && before !== null && t - start < 2 * CAT_RADIUS && before > prev + STEP_MAX && y > prev + STEP_MAX) narrow.push({ dir, fixed, start, y: prev });
          before = prev;
          start = t;
        }
        prev = y;
      }
    };
    for (let z = B.minZ; z <= B.maxZ + EPS; z += 0.1) scan('x', z, B.minX, B.maxX, (x) => g.y(x, z));
    for (let x = B.minX; x <= B.maxX + EPS; x += 0.1) scan('z', x, B.minZ, B.maxZ, (z) => g.y(x, z));
    const slots = narrow.filter((p) => narrow.filter((q) => q.dir === p.dir && q.y === p.y && Math.abs(q.fixed - p.fixed) <= 1 && Math.abs(q.start - p.start) < 0.3).length > 10);
    expect(slots.map((p) => `along ${p.dir} at ${p.fixed.toFixed(1)}, from ${p.start.toFixed(2)}, ground ${p.y}`)).toEqual([]);
  });

  it('the alley stair runs up against the garages', () => {
    const F = R.BLOCKS.find((b) => b.id === 'alleyStair').flights[0];
    const garages = R.BLOCKS.find((b) => b.id === 'garages');
    expect(F.x1).toBe(garages.x0);
    // just west of the garages, between the stair's foot and its top, she is on the stair
    for (const z of [30, 32, 33.9]) expect([z, a.ground.y(garages.x0 - 0.2, z) > R.LEVELS.GROUND]).toEqual([z, true]);
  });
});

// The plan is pure data (no THREE, no randomness, no clock): imported afresh,
// with three.js refused and Math.random, Date.now and performance.now
// counted, building and reading the whole plan touches none of them.
describe('the plan is pure', () => {
  afterEach(() => {
    vi.doUnmock('three');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('imports no three.js, and draws no random number and reads no clock, at import or in roofsArea()', async () => {
    vi.resetModules();
    vi.doMock('three', () => { throw new Error('the Rooftops plan imported three.js'); });
    const random = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now');
    const perf = vi.spyOn(performance, 'now');
    const plan = await import('../src/world/roofsplan.js');
    const area = plan.roofsArea();
    // read every part of it: the ground everywhere, the skyline, the moves
    for (let x = -46; x <= 46; x += 2) for (let z = -50; z <= 46; z += 2) { area.ground.y(x, z); plan.skylineY(x, z); }
    expect(area.traversal.hops.length).toBeGreaterThan(0);
    expect(JSON.stringify(plan.ROOFS_TOURS)).toBe(JSON.stringify(R.ROOFS_TOURS));
    expect([random.mock.calls.length, now.mock.calls.length, perf.mock.calls.length]).toEqual([0, 0, 0]);
  });
});
