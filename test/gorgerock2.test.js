import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/builder.test.js).
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

const { build } = await import('../src/world/gorge.js');

// One Gorge build for the whole file; later tasks add to it.
const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);

const triCount = (mesh) => {
  const g = mesh.geometry;
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
};

// The ground plane's triangles in world space.
function planeTris(plane) {
  plane.updateMatrixWorld();
  const g = plane.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const v = [0, 1, 2].map(() => new THREE.Vector3());
  const out = [];
  for (let t = 0; t < idx.count; t += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx.getX(t + k)).applyMatrix4(plane.matrixWorld);
    out.push(v.map((p) => p.clone()));
  }
  return out;
}

describe('Gorge rock, beauty pass 2: triangle headroom', () => {
  it('scree pebbles: 8 triangles a stone, smooth, no taller than before', () => {
    const scree = scene.getObjectByName('scree');
    const tris = triCount(scree);
    expect(tris).toBeLessThanOrEqual(5000);
    expect(tris / 8).toBe(12260 / 20);
    
    const g = scree.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      maxY = Math.max(maxY, y);
      const len = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
      expect(Math.abs(len - 1)).toBeLessThan(1e-3);
      if (y > 0.02) expect(nor.getY(i)).toBeGreaterThan(-0.2);
    }
    // the old icosahedron stones topped out at 0.179 m
    expect(maxY).toBeLessThanOrEqual(0.18);
  });

  it('no ground-plane triangle lies wholly under rock', async () => {
    const { trimHiddenGround } = await import('../src/world/gorge.js');
    const { MASSES, CEILINGS } = await import('../src/world/gorgeshape.js');
    const plane = scene.getObjectByName('groundPlane');
    const tris = planeTris(plane);
    const full = (plane.geometry.parameters.widthSegments) ** 2 * 2;
    expect(full - tris.length).toBeGreaterThan(1500);
    // trimming an already trimmed plane drops nothing more
    expect(trimHiddenGround(plane, MASSES)).toBe(0);
    const inside = (r, x, z) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
    const clear = (x, z) => !CEILINGS.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
    // A rect is convex, so a triangle with all three corners strictly inside
    // one tall mass (and no corner under a ceiling) lies wholly under it.
    for (const tri of tris) {
      const wholly = MASSES.some((m) => m.y1 >= 0.5 && tri.every((p) => inside(m, p.x, p.z) && clear(p.x, p.z)));
      expect(wholly).toBe(false);
    }
  });

  it('every walkable or cave-floor point still has ground plane under it', () => {
    const plane = scene.getObjectByName('groundPlane');
    const tris = planeTris(plane);
    const { ground } = area;
    const covered = (x, z) => tris.some(([a, b, c]) => {
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      const e = -1e-6;
      return l1 >= e && l2 >= e && 1 - l1 - l2 >= e;
    });
    let n = 0;
    for (let x = -60; x <= 60; x += 0.5) {
      for (let z = -60; z <= 60; z += 0.5) {
        if (ground.y(x, z) !== 0) continue;
        n++;
        if (!covered(x, z)) throw new Error(`no ground plane under floor point ${x}, ${z}`);
      }
    }
    expect(n).toBeGreaterThan(1000);
  }, 120_000);
});
