import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as R from '../src/world/roofsplan.js';
import { validateGround, STEP_MAX } from '../src/ground.js';
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
    expect(a.perches).toEqual([]);
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

  it('the plan is pure: no THREE, no randomness, no clock', () => {
    const src = readFileSync(new URL('../src/world/roofsplan.js', import.meta.url), 'utf8');
    expect(/from 'three'|Math\.random|Date\.now|performance\.now/.test(src)).toBe(false);
  });
});
