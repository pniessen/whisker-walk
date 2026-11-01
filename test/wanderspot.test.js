import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/woods.test.js).
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

const { isWalkableAt } = await import('../src/player.js');
const { clearSpot } = await import('../src/world/spots.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { DISCS } = await import('../src/rivalclans.js');
const { wanderStart, wanderSpotFor, WANDER_AREAS, WANDER_CAMP_GAP } = await import('../src/housecats.js');
const { floodFrom } = await import('./helpers/flood.js');

const BUILDERS = {
  woods: '../src/world/woods.js',
  river: '../src/world/river.js',
  moor: '../src/world/moor.js',
};

describe('the wanderer spot', () => {
  it('every builder is a wander area', () => {
    for (const id of Object.keys(BUILDERS)) expect(WANDER_AREAS).toContain(id);
  });
  for (const [id, path] of Object.entries(BUILDERS)) {
    it(`${id}: a walkable, reachable spot clear of the camp, 3-12 m from the spawn`, async () => {
      const area = (await import(path)).build(new THREE.Scene());
      const start = clearSpot(wanderStart(area.spawn), area.colliders ?? [], area.bounds, area.waters ?? []);
      const walkable = clanWalkableFor(area, id);
      const spot = wanderSpotFor(start, walkable, DISCS[id]);
      expect(spot, 'a spot was found').not.toBeNull();
      const { minX, maxX, minZ, maxZ } = area.bounds;
      expect(spot.x >= minX && spot.x <= maxX && spot.z >= minZ && spot.z <= maxZ).toBe(true);
      expect(floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z)).reachesWithin(spot.x, spot.z, 0.75)).toBe(true);
      const dSpawn = Math.hypot(spot.x - area.spawn.x, spot.z - area.spawn.z);
      expect(dSpawn).toBeGreaterThanOrEqual(3);
      expect(dSpawn).toBeLessThanOrEqual(12);
      expect(walkable(spot.x, spot.z)).toBe(true);
      const camp = DISCS[id];
      const dCamp = Math.hypot(spot.x - camp.cx, spot.z - camp.cz);
      expect(dCamp).toBeGreaterThanOrEqual(camp.r + WANDER_CAMP_GAP);
    });
  }
});
