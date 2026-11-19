import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/wanderspot.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { isWalkableAt, isWadeableAt } = await import('../src/player.js');
const { DISCS } = await import('../src/rivalclans.js');
const { floodFrom } = await import('./helpers/flood.js');
const { perchHops } = await import('./helpers/findreach.js');
const { SPAWN_CLEAR, PICKUP } = await import('../src/foundwear/rules.js');
const { FIND_LOOKS, SPOT_ID, FIND_SPOTS, spotsIn, findSpotsKey, FIND_KEY } = await import('../src/foundwear/spots/index.js');
const { yarnSpotsFor } = await import('../src/propsets.js');
const { GOLD_MICE } = await import('../src/goldmice.js');

const YARN_CLEAR = 3;
const THING_CLEAR = 2;

const BUILDERS = { park: '../src/world/park.js', woods: '../src/world/woods.js' };
describe.each(Object.keys(BUILDERS))('%s find spots', (areaId) => {
  let area, flood;
  beforeAll(async () => {
    area = (await import(BUILDERS[areaId])).build(new THREE.Scene());
    const stand = (x, z) => isWalkableAt(area, x, z) || isWadeableAt(area, x, z);
    flood = floodFrom(area, area.spawn, stand);
  });
  const spots = () => spotsIn(areaId);
  it('10 to 15 spots, ids fw-<area>-<n>, unique, each with a known look', () => {
    expect(spots().length).toBeGreaterThanOrEqual(10); expect(spots().length).toBeLessThanOrEqual(15);
    for (const s of spots()) { expect(s.id).toMatch(SPOT_ID); expect(s.id.startsWith(`fw-${areaId}-`)).toBe(true); expect(FIND_LOOKS).toContain(s.look); }
    expect(new Set(spots().map((s) => s.id)).size).toBe(spots().length);
  });
  it('none within 15 m of the spawn', () => {
    for (const s of spots()) expect(Math.hypot(s.x - area.spawn.x, s.z - area.spawn.z), s.id).toBeGreaterThanOrEqual(SPAWN_CLEAR);
  });
  it('inside the shared core of the map, 1.5 m in', () => {
    const b = area.core ?? area.bounds;
    for (const s of spots()) { expect(s.x).toBeGreaterThanOrEqual(b.minX + 1.5); expect(s.x).toBeLessThanOrEqual(b.maxX - 1.5); expect(s.z).toBeGreaterThanOrEqual(b.minZ + 1.5); expect(s.z).toBeLessThanOrEqual(b.maxZ - 1.5); }
  });
  it('every ground spot stands on open or wading ground and is reached on foot from the spawn', () => {
    for (const s of spots().filter((t) => t.y === 0)) {
      expect(isWalkableAt(area, s.x, s.z) || isWadeableAt(area, s.x, s.z), s.id).toBe(true);
      expect(flood.reachesWithin(s.x, s.z, PICKUP.r), s.id).toBe(true);
    }
  });
  it('every raised spot is at most 3 hops up a chain that starts on reached ground, with no skills', () => {
    for (const s of spots().filter((t) => t.y > 0)) {
      const hops = perchHops(area.perches, s, { groundOk: (x, z) => flood.reachesWithin(x, z, 1.5) });
      expect(hops, s.id).toBeGreaterThanOrEqual(1); expect(hops, s.id).toBeLessThanOrEqual(3);
    }
  });
  it('at least a third need no climbing', () => {
    expect(spots().filter((s) => s.y === 0).length).toBeGreaterThanOrEqual(Math.ceil(spots().length / 3));
  });
  // Two things in one pick-up window would be taken at once: two chimes, two
  // cards, two nose targets. So no find within 2 m of a golden mouse (at any
  // height) or of a collectible at its own height.
  it('never beside a golden mouse or a collectible: 2 m clear', () => {
    const mice = GOLD_MICE[areaId] ?? [];
    expect(mice.length).toBeGreaterThan(0);
    for (const s of spots()) {
      for (const m of mice) expect(Math.hypot(s.x - m.x, s.z - m.z), `${s.id} by ${m.id}`).toBeGreaterThanOrEqual(THING_CLEAR);
      for (const c of area.collectibles) {
        if (Math.abs((c.y ?? 0) - s.y) >= PICKUP.dy) continue;
        expect(Math.hypot(s.x - c.x, s.z - c.z), `${s.id} by ${c.id}`).toBeGreaterThanOrEqual(THING_CLEAR);
      }
    }
  });
  it('never beside the yarn ball: 3 m from both its spots', () => {
    const yarn = yarnSpotsFor(areaId);
    expect(yarn.length).toBe(2);
    for (const s of spots()) {
      for (const y of yarn) expect(Math.hypot(s.x - y.x, s.z - y.z), s.id).toBeGreaterThanOrEqual(YARN_CLEAR);
    }
  });
});
it('the Woods spots sit in the open: no trunk within 2 m, no fern or bramble within 1.2 m, none in the camp', async () => {
  const { woodsTreeSpots, woodsUndergrowth } = await import('../src/world/woods.js');
  const trees = woodsTreeSpots(); const { ferns, brambles } = woodsUndergrowth(); const camp = DISCS.woods;
  for (const s of spotsIn('woods')) {
    for (const t of trees) expect(Math.hypot(s.x - t.x, s.z - t.z), s.id).toBeGreaterThanOrEqual(2);
    for (const f of [...ferns, ...brambles]) expect(Math.hypot(s.x - f.x, s.z - f.z), s.id).toBeGreaterThanOrEqual(1.2);
    expect(Math.hypot(s.x - camp.cx, s.z - camp.cz), s.id).toBeGreaterThan(camp.r);
  }
});
it('spotsIn reads own keys only', () => {
  expect(spotsIn('park')).toBe(FIND_SPOTS.park);
  expect(spotsIn('den')).toEqual([]);
  expect(spotsIn('toString')).toEqual([]);
  expect(spotsIn(undefined)).toEqual([]);
  expect(Object.isFrozen(FIND_SPOTS)).toBe(true);
});
it('the spot key is a uint32 that moves when any spot moves, and not when a look changes', () => {
  expect(Number.isInteger(FIND_KEY) && FIND_KEY >= 0 && FIND_KEY < 2 ** 32).toBe(true);
  const moved = { ...FIND_SPOTS, park: FIND_SPOTS.park.map((s, i) => (i ? s : { ...s, x: s.x + 0.5 })) };
  const relooked = { ...FIND_SPOTS, park: FIND_SPOTS.park.map((s, i) => (i ? s : { ...s, look: 'grass' })) };
  expect(findSpotsKey(moved)).not.toBe(FIND_KEY);
  expect(findSpotsKey(relooked)).toBe(FIND_KEY);
  expect(findSpotsKey(FIND_SPOTS, 2)).not.toBe(FIND_KEY);
});
it('perchHops: 0 on the ground, Infinity out of reach, and counts a two-step chain', () => {
  const chain = [{ x: 0, z: 0, y: 0.72 }, { x: 1.2, z: 0, y: 1.9 }];
  expect(perchHops(chain, { x: 5, z: 5, y: 0 })).toBe(0);
  expect(perchHops(chain, { x: 1.2, z: 0, y: 1.9 })).toBe(2);
  expect(perchHops(chain, { x: 30, z: 0, y: 4 })).toBe(Infinity);
});
it('perchHops: a perch a skill opens is no step', () => {
  const chain = [{ x: 0, z: 0, y: 0.72, requires: 'sure-claws' }, { x: 1.2, z: 0, y: 1.9 }];
  expect(perchHops(chain, { x: 1.2, z: 0, y: 1.9 })).toBe(Infinity);
  expect(perchHops(chain, { x: 1.2, z: 0, y: 1.9 }, { groundOk: () => false })).toBe(Infinity);
});
