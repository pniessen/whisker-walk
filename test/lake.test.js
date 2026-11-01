import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

// The same headless canvas stub every world test uses (see test/park.test.js
// for why getImageData and the gradients need real answers).
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

const {
  FRAMES, fromWoods, fromWoodsDisc, ISLAND_WOODS, ISLAND_BRIDGE_WOODS, BRIDGE_PLANK, bridgeEnds,
} = await import('../src/world/lake.js');
const { BRIDGE } = await import('../src/territories.js');
const { inWater } = await import('../src/world/builder.js');
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildRiver, RIVER_ISLAND } = await import('../src/world/river.js');
const { build: buildMoor, MOOR_ISLAND } = await import('../src/world/moor.js');
const { build: buildPines, PINES_ISLAND } = await import('../src/world/pines.js');
const { assignShadowCasters } = await import('../src/render/rig.js');

const BUILDERS = { woods: buildWoods, river: buildRiver, moor: buildMoor, pines: buildPines };

describe('the lake: one island and one bridge', () => {
  it('holds every frame, the island and the bridge frozen', () => {
    expect(FRAMES).toEqual({ woods: [0, 0], river: [100, 0], moor: [0, 100], pines: [100, 100] });
    for (const v of [FRAMES, ISLAND_WOODS, ISLAND_BRIDGE_WOODS, ...ISLAND_BRIDGE_WOODS, BRIDGE_PLANK]) {
      expect(Object.isFrozen(v)).toBe(true);
    }
    expect(ISLAND_WOODS).toEqual({ x: -72, z: -72, r: 13, rise: 1.4, treeScale: 2.6 });
    expect(BRIDGE_PLANK).toEqual({ w: 2, thick: 0.12, y: 0.06, landRun: 1.0 });
  });

  it('the bridge runs from 0.6 m onto the island to the Pines shore, and its plank 1 m on onto land', () => {
    const [[ix, iz], [fx, fz]] = ISLAND_BRIDGE_WOODS;
    const I = ISLAND_WOODS;
    expect(Math.hypot(ix - I.x, iz - I.z)).toBeCloseTo(I.r - 0.6, 6);
    const foot = fromWoods('pines', fx, fz);
    expect(foot.x).toBeCloseTo(10.6, 9);
    expect(foot.z).toBeCloseTo(4.8, 9);
    const [, land] = bridgeEnds('pines');
    expect(land.x).toBeCloseTo(10.0, 9);
    expect(land.z).toBeCloseTo(4.0, 9);
    // the bridge points the same way on her map as in the world
    const [[bx0, by0], [bx1, by1]] = BRIDGE; // src/territories.js: shore -> island, board y is south
    const board = Math.atan2(bx1 - bx0, by1 - by0), world = Math.atan2(ix - fx, iz - fz);
    expect(Math.abs(board - world)).toBeLessThan(Math.PI / 180);
  });

  for (const [id, build] of Object.entries(BUILDERS)) {
    it(`${id} draws the one bridge`, () => {
      const scene = new THREE.Scene();
      build(scene);
      const plank = scene.getObjectByName('islandBridge');
      const [a, b] = bridgeEnds(id);
      expect(plank.position.x).toBeCloseTo((a.x + b.x) / 2, 6);
      expect(plank.position.z).toBeCloseTo((a.z + b.z) / 2, 6);
      expect(plank.position.y).toBeCloseTo(BRIDGE_PLANK.y, 6);
      expect(plank.geometry.parameters.depth).toBeCloseTo(Math.hypot(a.x - b.x, a.z - b.z), 6);
      expect(plank.geometry.parameters.width).toBe(BRIDGE_PLANK.w);
      expect(plank.rotation.y).toBeCloseTo(Math.atan2(a.x - b.x, a.z - b.z), 6);
    });
  }

  // The plank is 0.12 m thick, right on rig.js's CAST_FLAT_HEIGHT, so whether
  // the sweep made it cast came down to float rounding in its bounding box.
  // It is marked noCast, like the reed beds and the stepping stones.
  it('the bridge never casts a shadow, in any of the four maps', () => {
    for (const [id, build] of Object.entries(BUILDERS)) {
      const scene = new THREE.Scene();
      build(scene);
      scene.updateMatrixWorld(true);
      assignShadowCasters(scene);
      const plank = scene.getObjectByName('islandBridge');
      expect(plank.userData.noCast, id).toBe(true);
      expect(plank.castShadow, id).toBe(false);
    }
  });

  it('the Woods, the River and the Moor paint the one island out of reach', () => {
    for (const id of ['woods', 'river', 'moor']) {
      const scene = new THREE.Scene();
      const area = BUILDERS[id](scene);
      const I = fromWoodsDisc(id);
      const { bounds } = area;
      // the tree on the island's crown, at the island's own scale
      const tree = scene.children.find((o) => o.isGroup
        && Math.hypot(o.position.x - I.x, o.position.z - I.z) < 0.01);
      expect(tree, `${id} tree`).toBeTruthy();
      expect(tree.scale.x, `${id} tree scale`).toBe(ISLAND_WOODS.treeScale);
      // out of bounds, and wholly in that map's lake
      const outside = I.x < bounds.minX || I.x > bounds.maxX || I.z < bounds.minZ || I.z > bounds.maxZ;
      expect(outside, `${id} centre`).toBe(true);
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * Math.PI * 2;
        const x = I.x + Math.cos(t) * I.r, z = I.z + Math.sin(t) * I.r;
        expect(inWater(area.waters, x, z), `${id} rim ${k}`).toBe(true);
      }
      for (const c of area.colliders) expect(Math.hypot(c.x - I.x, c.z - I.z), `${id} collider`).toBeGreaterThan(I.r + 2);
      for (const p of area.perches) expect(Math.hypot(p.x - I.x, p.z - I.z), `${id} perch`).toBeGreaterThan(I.r + 2);
      // and the plank never comes into reach
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene.getObjectByName('islandBridge'));
      const touches = box.min.x <= bounds.maxX && box.max.x >= bounds.minX
        && box.min.z <= bounds.maxZ && box.max.z >= bounds.minZ;
      expect(touches, `${id} plank`).toBe(false);
    }
  });

  it("the neighbours' island records are derived, not typed", () => {
    expect(RIVER_ISLAND).toEqual(fromWoodsDisc('river'));
    expect(MOOR_ISLAND).toEqual(fromWoodsDisc('moor'));
    expect(PINES_ISLAND).toEqual(fromWoodsDisc('pines'));
  });

  it('nothing in lake.js reads the edition', () => {
    const src = readFileSync(new URL('../src/world/lake.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/edition/i);
  });
});
