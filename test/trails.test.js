import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless stub every world test uses (see test/water.test.js).
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
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const { inWater, onDeck, path } = await import('../src/world/builder.js');
const { trailField, quadRadius } = await import('../src/world/pathribbon.js');
const { build: buildWoods, WOODS_PATHS } = await import('../src/world/woods.js');
const { build: buildRiver, RIVER_PATHS } = await import('../src/world/river.js');
const { build: buildMoor, MOOR_PATHS, MOOR_TRAIL, MOOR_GORGE_TRAIL } = await import('../src/world/moor.js');
const { build: buildPines, PINES_PATHS, PINES_TRAIL } = await import('../src/world/pines.js');
const { build: buildGorge, GORGE_PATHS } = await import('../src/world/gorge.js');

const AREAS = {
  woods: { build: buildWoods },
  river: { build: buildRiver },
  moor: { build: buildMoor },
  pines: { build: buildPines },
  gorge: { build: buildGorge },
};

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const meshTris = (scene, pred) => scene.children.filter(pred)
  .reduce((n, m) => n + tris(m.geometry), 0);

const built = {};
function get(name) {
  if (!built[name]) {
    const scene = new THREE.Scene();
    const area = AREAS[name].build(scene);
    built[name] = { scene, area };
  }
  return built[name];
}

describe('wild-map trails', () => {
  for (const name of Object.keys(AREAS)) {
    it(`${name}: one visible pathTrail, N hidden path strips, none in open water`, () => {
      const { scene, area } = get(name);
      const trails = scene.children.filter((c) => c.name === 'pathTrail');
      expect(trails.length).toBe(1);
      const segs = trails[0].userData.trail;
      const strips = scene.children.filter((c) => c.name === 'path');
      expect(strips.length).toBe(segs.length);
      expect(strips.every((s) => s.visible === false)).toBe(true);
      expect(trails[0].visible).toBe(true);
      // Draws: exactly one visible path-ish mesh.
      const visiblePathish = scene.children.filter((c) => (c.name === 'path' || c.name === 'pathTrail') && c.visible);
      expect(visiblePathish.length).toBe(1);
      expect(visiblePathish[0]).toBe(trails[0]);

      const waters = area.waters ?? [];
      const bad = [];
      for (const s of segs) {
        const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
        const ux = len > 1e-9 ? (s.x2 - s.x1) / len : 1;
        const uz = len > 1e-9 ? (s.z2 - s.z1) / len : 0;
        const R = quadRadius(s.h);
        for (let a = -R; a <= len + R; a += 0.25) {
          for (let c = -R; c <= R; c += 0.25) {
            const x = s.x1 + ux * a - uz * c;
            const z = s.z1 + uz * a + ux * c;
            if (!inWater(waters, x, z)) continue;
            if (waters.some((w) => onDeck(w, x, z))) continue;
            if (trailField(segs, x, z).alpha > 0.02) bad.push([+x.toFixed(2), +z.toFixed(2)]);
          }
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    }, 120_000);
  }

  it('triangles: new (hidden strips + trail) <= old (visible strips); report', () => {
    const lists = {
      woods: [WOODS_PATHS],
      river: [RIVER_PATHS],
      moor: [MOOR_PATHS, MOOR_TRAIL, MOOR_GORGE_TRAIL],
      pines: [PINES_PATHS, PINES_TRAIL],
      gorge: [GORGE_PATHS],
    };
    for (const name of Object.keys(AREAS)) {
      const { scene } = get(name);
      const segs = scene.children.find((c) => c.name === 'pathTrail').userData.trail;
      // The old visible strips: path() per segment with the area's own style
      // (sand; the colour does not change the geometry) at the trail's width.
      const throwaway = new THREE.Scene();
      let i = 0;
      for (const list of lists[name]) {
        for (const sg of list) throwaway.add(path(...sg, segs[i++].h * 2, { surface: 'sand', color: 0x9c7c58 }));
      }
      expect(i).toBe(segs.length);
      const oldTris = meshTris(throwaway, () => true);
      const hidden = meshTris(scene, (c) => c.name === 'path');
      const trail = meshTris(scene, (c) => c.name === 'pathTrail');
      console.log(`TRIANGLES ${name}: old=${oldTris} new=${hidden + trail} (hidden strips=${hidden}, trail=${trail}); path meshes old visible=${segs.length}, new visible=1 + ${segs.length} hidden`);
      expect(hidden + trail).toBeLessThanOrEqual(oldTris);
    }
  }, 120_000);
});
