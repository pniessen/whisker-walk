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

// Task 3: smooth shading and rounded loose rocks.
const deg = (a, b) => {
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI;
};
// The face normal of triangle t (non-indexed), as three computes it.
const faceNormal = (p, t) => {
  const A = new THREE.Vector3().fromArray(p, 9 * t);
  const B = new THREE.Vector3().fromArray(p, 9 * t + 3);
  const C = new THREE.Vector3().fromArray(p, 9 * t + 6);
  const n = C.sub(B).cross(A.sub(B));
  return n.lengthSq() > 0 ? n.normalize().toArray() : null;
};

describe('Gorge rock, beauty pass 2: smooth shading', () => {
  const rockGroup = scene.getObjectByName('gorgeRock');

  it('walk tops stay flat-shaded', async () => {
    const { ROCK_WALKS } = await import('../src/world/gorge.js');
    rockGroup.updateMatrixWorld(true);
    const tops = scene.getObjectByName('ledgeTops');
    expect(tops.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
    const p = tops.geometry.attributes.position.array;
    const n = tops.geometry.attributes.normal.array;
    const e = 1e-6;
    let checked = 0;
    for (const w of ROCK_WALKS) {
      if (w.kind !== 'walk') continue;
      // the walk's own plane: flat, or a ramp along z
      const slope = w.along === 'z' ? (w.y1 - w.y0) / (w.maxZ - w.minZ) : 0;
      const want = new THREE.Vector3(0, 1, -slope).normalize();
      const yAt = (z) => (w.along === 'z' ? w.y0 + slope * (z - w.minZ) : w.y0);
      for (let i = 0; i < p.length; i += 3) {
        const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
        if (!(x > w.minX + e && x < w.maxX - e && z > w.minZ + e && z < w.maxZ - e)) continue;
        if (Math.abs(y - yAt(z)) >= 1e-4) continue;
        checked++;
        expect(Math.abs(n[i] - want.x)).toBeLessThan(1e-6);
        expect(Math.abs(n[i + 1] - want.y)).toBeLessThan(1e-6);
        expect(Math.abs(n[i + 2] - want.z)).toBeLessThan(1e-6);
      }
    }
    expect(checked).toBeGreaterThan(100);
  }, 120_000);

  it('the rock walls are smooth-shaded', () => {
    const faces = scene.getObjectByName('rockFaces');
    const p = faces.geometry.attributes.position.array;
    const n = faces.geometry.attributes.normal.array;
    const shell = rockGroup.userData.shellTris.rockFaces;
    let walls = 0;
    let smooth = 0;
    for (let t = 0; t < shell; t++) {
      const f = faceNormal(p, t);
      if (!f || Math.abs(f[1]) >= 0.5) continue;
      for (let k = 0; k < 3; k++) {
        const i = 9 * t + 3 * k;
        walls++;
        if (deg(f, [n[i], n[i + 1], n[i + 2]]) > 2) smooth++;
      }
    }
    expect(walls).toBeGreaterThan(10000);
    expect(smooth / walls).toBeGreaterThanOrEqual(0.6);
  }, 120_000);

  it('foot boulders and lip stones have rounded normals', () => {
    for (const name of ['rockFaces', 'lips']) {
      const mesh = scene.getObjectByName(name);
      const p = mesh.geometry.attributes.position.array;
      const n = mesh.geometry.attributes.normal.array;
      const from = rockGroup.userData.shellTris[name];
      const to = p.length / 9;
      expect(to - from).toBeGreaterThan(100);
      let sum = 0;
      let count = 0;
      for (let t = from; t < to; t++) {
        const f = faceNormal(p, t);
        if (!f) continue;
        for (let k = 0; k < 3; k++) {
          const i = 9 * t + 3 * k;
          const v = [n[i], n[i + 1], n[i + 2]];
          expect(Math.abs(Math.hypot(...v) - 1)).toBeLessThan(1e-3);
          sum += deg(f, v);
          count++;
        }
      }
      expect(sum / count).toBeGreaterThan(10);
    }
  });

  it('tors are round, the size of their colliders, as high as their perch', async () => {
    const { gorgeTors } = await import('../src/world/gorge.js');
    const tors = gorgeTors();
    expect(tors.length).toBe(11);
    tors.forEach(({ x, z, r, h }, i) => {
      const mesh = scene.getObjectByName(`tor-${i}`);
      mesh.updateMatrixWorld(true);
      expect(triCount(mesh)).toBeGreaterThanOrEqual(200);
      const g = mesh.geometry;
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      expect(nor.count).toBe(pos.count);
      if (g.attributes.uv) expect(g.attributes.uv.count).toBe(pos.count);
      const ground = area.ground.y(x, z);
      const v = new THREE.Vector3();
      let maxY = -Infinity;
      let reach = 0;
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
        maxY = Math.max(maxY, v.y);
        reach = Math.max(reach, Math.hypot(v.x - x, v.z - z));
        expect(Math.abs(Math.hypot(nor.getX(k), nor.getY(k), nor.getZ(k)) - 1)).toBeLessThan(1e-3);
      }
      expect(maxY - ground).toBeLessThanOrEqual(h + 0.05);
      expect(maxY - ground).toBeGreaterThanOrEqual(h - 0.1);
      expect(reach).toBeGreaterThanOrEqual(0.85 * r);
      expect(reach).toBeLessThanOrEqual(r + 0.05);
    });
  });
});

// Task 5: the rock shader and the talus at the wall feet.
describe('Gorge rock, beauty pass 2: rock shader and talus', () => {
  it('rockFaces, lips and ledgeTops wear the rock patch', async () => {
    const { TALUS_TINT } = await import('../src/world/rockshade.js');
    expect(TALUS_TINT).toBe(0x9d9384);
    for (const name of ['rockFaces', 'lips', 'ledgeTops']) {
      const mat = scene.getObjectByName(name).material;
      expect(typeof mat.onBeforeCompile, name).toBe('function');
      expect(mat.customProgramCacheKey(), name).toMatch(/^gorge-rock-v1/);
      // ledgeTops wears the fluted patch too
      expect(mat.customProgramCacheKey(), name).toBe('gorge-rock-v1');
    }
  });

  it('wall feet take the talus tint', async () => {
    const { TALUS_TINT } = await import('../src/world/rockshade.js');
    const { createRockRelief } = await import('../src/world/rockrelief.js');
    const { ROCK_WALKS, GORGE_ROCK_KEEP } = await import('../src/world/gorge.js');
    const { MASSES, CEILINGS } = await import('../src/world/gorgeshape.js');
    const { seedFromCode } = await import('../src/rng.js');
    const field = createRockRelief({
      walks: ROCK_WALKS, masses: MASSES, ceilings: CEILINGS, seed: seedFromCode('gorge-rock'), keep: GORGE_ROCK_KEEP,
    });
    const talus = new THREE.Color(TALUS_TINT);
    const faces = scene.getObjectByName('rockFaces');
    const p = faces.geometry.attributes.position.array;
    const c = faces.geometry.attributes.color.array;
    const shell = scene.getObjectByName('gorgeRock').userData.shellTris.rockFaces * 9;
    const near = { low: [0, 0], mid: [0, 0] };
    // Walls only (relief moves walls sideways, never up, so the foot is the same after it).
    for (let i = 0; i < shell; i += 3) {
      const t = Math.floor(i / 9);
      const f = faceNormal(p, t);
      if (!f || Math.abs(f[1]) >= 0.5) continue;
      const { foot } = field.at(p[i], p[i + 1], p[i + 2]);
      const bin = foot < 0.3 ? near.low : foot >= 2 && foot <= 4 ? near.mid : null;
      if (!bin) continue;
      bin[0] += Math.hypot(c[i] - talus.r, c[i + 1] - talus.g, c[i + 2] - talus.b);
      bin[1]++;
    }
    expect(near.low[1]).toBeGreaterThan(500);
    expect(near.mid[1]).toBeGreaterThan(500);
    expect(near.low[0] / near.low[1]).toBeLessThan(near.mid[0] / near.mid[1]);
  }, 120_000);
});
