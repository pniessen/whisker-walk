import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/park.test.js).
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

const { forestFloorMesh, canopyShade, woodsFloorTint } = await import('../src/world/forestfloor.js');
const woods = await import('../src/world/woods.js');
const { waterGap } = await import('../src/world/builder.js');
const { build, SPAWN, WOODS_WATERS, WOODS_PATHS, woodsTreeSpots, woodsFloor } = woods;

const CLEARING = { x: 4, z: 12, r: 9 };
const PATH_W = 3;

function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}
const waterDist = (x, z) => Math.min(...WOODS_WATERS.map((w) => waterGap(w, x, z)));
const trianglesOf = (g) => (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
function maxY(mesh) {
  const p = mesh.geometry.attributes.position;
  let m = -Infinity;
  for (let i = 0; i < p.count; i++) m = Math.max(m, p.getY(i));
  return m;
}

describe('forestFloorMesh', () => {
  it('is one non-casting vertex-coloured mesh, empty for no parts', () => {
    const m = forestFloorMesh({});
    expect(m.isMesh).toBe(true);
    expect(m.name).toBe('forestFloor');
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(m.material.vertexColors).toBe(true);
    expect(trianglesOf(m.geometry)).toBe(0);
    expect(forestFloorMesh({}, { name: 'x' }).name).toBe('x');
  });

  const CAPS = { leaves: 0.035, moss: 0.12, mushrooms: 0.2, bluebells: 0.3, foxgloves: 0.6 };
  const spots = [];
  for (let i = 0; i < 40; i++) spots.push({ x: i * 1.37 - 20, z: (i * 7.31) % 23 - 11, s: 0.8 + (i % 5) * 0.1, a: i * 0.7 });
  for (const [kind, cap] of Object.entries(CAPS)) {
    it(`keeps ${kind} under ${cap} m, with triangles and colours`, () => {
      const m = forestFloorMesh({ [kind]: spots });
      expect(trianglesOf(m.geometry)).toBeGreaterThan(0);
      expect(m.geometry.attributes.color.count).toBe(m.geometry.attributes.position.count);
      expect(maxY(m)).toBeLessThanOrEqual(cap);
      expect(maxY(m)).toBeGreaterThan(0);
    });
  }
});

describe('the Woods floor tint', () => {
  const trees = woodsTreeSpots();
  const tint = woodsFloorTint(trees, CLEARING);

  it('shades 1 at a trunk and 0 far from every tree', () => {
    const t = trees[0];
    expect(canopyShade(trees, t.x, t.z)).toBe(1);
    expect(canopyShade([{ x: 0, z: 0, scale: 1 }], 3.3, 0)).toBe(0);
    expect(canopyShade([{ x: 0, z: 0, scale: 1 }], 1.1, 0)).toBe(1);
  });

  it('keeps every channel within [0.5, 1.5], and the clearing untouched', () => {
    for (let x = -60; x <= 60; x++) {
      for (let z = -60; z <= 60; z++) {
        for (const c of tint(x, z)) {
          expect(c).toBeGreaterThanOrEqual(0.5);
          expect(c).toBeLessThanOrEqual(1.5);
        }
      }
    }
    expect(tint(CLEARING.x, CLEARING.z)).toEqual([1, 1, 1]);
  });

  it('is darker in the shade of the trees than in the open', () => {
    const lum = ([r, g, bl]) => r + g + bl;
    const shade = [];
    const open = [];
    for (let x = -50; x <= 50; x += 0.5) {
      for (let z = -50; z <= 50; z += 0.5) {
        if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r) continue;
        const near = Math.min(...trees.map((t) => Math.hypot(x - t.x, z - t.z)));
        if (near < 1) shade.push(lum(tint(x, z)));
        else if (near > 5) open.push(lum(tint(x, z)));
      }
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(shade.length).toBeGreaterThan(20);
    expect(open.length).toBeGreaterThan(20);
    expect(mean(shade)).toBeLessThan(mean(open) - 0.15);
  });
});

describe('the Woods floor', () => {
  const floor = woodsFloor();
  const keep = (a) => [...a.pois, ...a.collectibles, ...a.scenics, a.spawn];

  it('is seeded: the same floor every time, with every kind on it', () => {
    expect(woodsFloor()).toEqual(floor);
    expect(floor.leaves.length).toBeGreaterThan(500);
    expect(floor.moss.length).toBeGreaterThanOrEqual(15);
    expect(floor.mushrooms.length).toBeGreaterThanOrEqual(8);
    expect(floor.bluebells.length).toBeGreaterThanOrEqual(20);
    expect(floor.foxgloves.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps every leaf off the paths and out of the water', () => {
    for (const p of floor.leaves) {
      const at = `leaf (${p.x}, ${p.z})`;
      for (const seg of WOODS_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(PATH_W / 2 + 0.15);
      expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('builds one forestFloor mesh out of the shadow pass, inside the triangle budget', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const meshes = [];
    let tris = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'forestFloor') meshes.push(o);
      tris += trianglesOf(o.geometry);
    });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.noCast).toBe(true);
    expect(meshes[0].castShadow).toBe(false);
    expect(tris).toBeLessThanOrEqual(58_500);

    const places = keep(area);
    expect(places.some((p) => p.x === SPAWN.x && p.z === SPAWN.z)).toBe(true);
    for (const kind of ['moss', 'mushrooms', 'bluebells', 'foxgloves']) {
      for (const p of floor[kind]) {
        const at = `${kind} (${p.x}, ${p.z})`;
        for (const q of places) expect(Math.hypot(p.x - q.x, p.z - q.z), at).toBeGreaterThanOrEqual(3);
        for (const seg of WOODS_PATHS) expect(segDist(p.x, p.z, seg), at).toBeGreaterThanOrEqual(2.3);
      }
    }
  }, 120_000);
});
