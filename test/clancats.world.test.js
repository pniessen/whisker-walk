import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Clan Life Part 1, Task 3: the clan's wander on the BUILT maps, with the
// predicate walk.js hands it (clanWalkableFor on the frozen map). Review focus
// 4: no clan cat ever stands in water, a wade band, the island's keep-out or
// on the Pines' truce path. Same headless canvas stub as test/rivalworld.test.js.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const WORLDS = {
  woods: await import('../src/world/woods.js'),
  river: await import('../src/world/river.js'),
  moor: await import('../src/world/moor.js'),
  pines: await import('../src/world/pines.js'),
};
const { createClanCats } = await import('../src/clancats.js');
const { castFor, roamHomes } = await import('../src/clancast.js');
const { campLayout } = await import('../src/world/camp.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { RANK_KEYS: K } = await import('../src/clanwords.js');

const CAMP = new Set([K.leader, K.deputy, K.elder, K.kit]);

describe('the clan on the built maps', () => {
  for (const [areaId, world] of Object.entries(WORLDS)) {
    it(`${areaId}: all sixteen spawn, and two minutes of wander stays on clan ground`, () => {
      const scene = new THREE.Scene();
      const area = world.build(scene, {});
      const clanArea = { ...area, colliders: Object.freeze(area.colliders.map((c) => ({ ...c }))) };
      const ok = clanWalkableFor(clanArea, areaId);
      const cats = createClanCats(scene, area, castFor(areaId), {
        campLayout: campLayout(areaId), roamHomes: roamHomes(areaId, clanArea, ok), isWalkable: ok,
        roomSeed: 7, showNames: true,
      });
      expect(cats.list).toHaveLength(16);
      for (const c of cats.list) {
        if (c.rank === K.leader) continue; // on the rock, itself a collider
        if (!CAMP.has(c.rank)) expect(ok(c.home.x, c.home.z), c.id).toBe(true);
      }
      const dt = 1 / 30;
      const far = new THREE.Vector3(999, 0, 999);
      for (let i = 0; i < 120 * 30; i++) {
        cats.update(dt, i * dt, far);
        if (i % 15) continue;
        for (const c of cats.list) {
          if (CAMP.has(c.rank)) continue;
          const p = c.group.position;
          expect(ok(p.x, p.z), `${c.id} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
        }
      }
    });
  }
});
