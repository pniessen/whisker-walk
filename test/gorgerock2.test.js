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
const { WALK_SHAPES, GORGE_CAVES, GORGE_DENS, CAMP_DEN } = await import('../src/world/gorgeshape.js');

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

  it('the box shortcut and the cache drop exactly what the full lattice drops', async () => {
    const { trimHiddenGround } = await import('../src/world/gorge.js');
    const { MASSES, CEILINGS } = await import('../src/world/gorgeshape.js');
    const b = await import('../src/world/builder.js');
    // the reference: the lattice test alone, on every triangle
    const tall = MASSES.filter((m) => m.y1 >= 0.5);
    const buried = (x, z) => tall.some((m) => x > m.minX && x < m.maxX && z > m.minZ && z < m.maxZ)
      && !CEILINGS.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
    const fresh = () => { const p = b.ground(120, 0x9a8a6a, { surface: 'grass' }); p.updateMatrixWorld(); return p; };
    const ref = fresh();
    const pos = ref.geometry.attributes.position, idx = ref.geometry.index;
    const keepRef = [];
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t < idx.count; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx.getX(t + k)).applyMatrix4(ref.matrixWorld);
      const [a, bb, c] = v;
      const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(bb), bb.distanceTo(c), c.distanceTo(a)) / 0.25));
      let hidden = true;
      for (let i = 0; i <= n && hidden; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, w = j / n, s = 1 - u - w;
        if (!buried(a.x * s + bb.x * u + c.x * w, a.z * s + bb.z * u + c.z * w)) { hidden = false; break; }
      }
      if (!hidden) keepRef.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
    }
    const masses = [...MASSES]; // a new array: nothing cached for it yet
    const first = fresh();
    const dropped = trimHiddenGround(first, masses);
    expect(Array.from(first.geometry.index.array)).toEqual(keepRef);
    expect(dropped).toBe((idx.count - keepRef.length) / 3);
    // a second build of the same plane takes the remembered index (a copy, not shared)
    const second = fresh();
    expect(trimHiddenGround(second, masses)).toBe(dropped);
    expect(Array.from(second.geometry.index.array)).toEqual(keepRef);
    expect(second.geometry.index.array).not.toBe(first.geometry.index.array);
    // a plane of another size is never served from the cache
    const other = b.ground(60, 0x9a8a6a, { surface: 'grass' });
    other.updateMatrixWorld();
    const before = other.geometry.index.count;
    trimHiddenGround(other, masses);
    expect(other.geometry.index.count).toBeLessThanOrEqual(before);
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
  it('rockFaces, lips and ledgeTops wear the rock patch', () => {
    for (const name of ['rockFaces', 'lips', 'ledgeTops']) {
      const mat = scene.getObjectByName(name).material;
      // ledgeTops wears the fluted patch too
      expect(mat.customProgramCacheKey(), name).toBe('gorge-rock-v3');
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
  it('a talus apron runs along the floor walls', async () => {
    const { FLOOR_WALLS, gorgeMeadow, MEADOW_TALUS, MEADOW_PATH_CLEAR, GORGE_PATHS, GORGE_WATERS } = await import('../src/world/gorge.js');
    const { GORGE_CAVES, GORGE_DENS } = await import('../src/world/gorgeshape.js');
    const { talus } = gorgeMeadow();
    expect(MEADOW_TALUS).toBe(0xa59b89);
    const seg = (x, z, ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    };
    const mouths = [...GORGE_CAVES.map((c) => c.mouth), ...GORGE_DENS.map((d) => d.mouth)];
    for (const [x1, z1, x2, z2, nx, nz] of FLOOR_WALLS) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const mine = talus.filter((c) => {
        const wx = c.x - nx * c.d / 2, wz = c.z - nz * c.d / 2; // the cell's foot on the wall line
        return c.nx === nx && c.nz === nz && seg(wx, wz, x1, z1, x2, z2) < 0.01;
      });
      expect(mine.length * 1, `wall ${x1},${z1}`).toBeGreaterThanOrEqual(len * 0.6);
    }
    for (const c of talus) {
      expect(c.d).toBeGreaterThanOrEqual(0.8);
      expect(c.d).toBeLessThanOrEqual(1.4);
      for (const f of [0.5, 1]) {
        const x = c.x - c.nx * c.d * (1 - f), z = c.z - c.nz * c.d * (1 - f);
        for (const s of GORGE_PATHS) expect(seg(x, z, ...s)).toBeGreaterThanOrEqual(MEADOW_PATH_CLEAR);
        for (const m of mouths) expect(Math.hypot(x - m.x, z - m.z)).toBeGreaterThanOrEqual(1.5);
        for (const w of GORGE_WATERS) expect(x < w.minX - 0.1 || x > w.maxX + 0.1).toBe(true);
      }
    }
    const meadow = scene.getObjectByName('gorgeMeadow');
    expect(triCount(meadow) - 3136).toBeLessThanOrEqual(700);
    expect(triCount(meadow)).toBeGreaterThan(3136);
  });

  it('the drawn rock agrees with the ground the cat walks on', () => {
    const { ground, colliders } = area;
    // Every drawn rock triangle in world space, bucketed on a 2 m xz grid.
    const B = 2;
    const buckets = new Map();
    const tris = [];
    const sources = [];
    const rockGroup = scene.getObjectByName('gorgeRock');
    for (const n of ['rockFaces', 'ledgeTops', 'lips']) sources.push(rockGroup.getObjectByName(n));
    scene.getObjectByName('tors').traverse((o) => { if (o.isMesh) sources.push(o); });
    sources.push(scene.getObjectByName('summitRock'), scene.getObjectByName('summitRockBoulder'));
    const v = [0, 1, 2].map(() => new THREE.Vector3());
    // The camp den's lining (polish-gorge5) is appended to rockFaces: a wall
    // liner whose cove leans in over the den floor's edge under the roof, as
    // the chambers' liners do (in their caveRoom meshes, not read here).
    // gorge5.test.js holds it to the den's own rules; it is no floor. Only
    // its triangles wholly above the den's low band are exempt: the low
    // lining must pass the ground-agreement check like everything else.
    const lr = rockGroup.userData.mouthArchRanges.campDenLining;
    const lowY = CAMP_DEN.y0 + 1.0;
    for (const mesh of sources) {
      expect(mesh, 'a rock source mesh').toBeTruthy();
      mesh.updateWorldMatrix(true, false);
      const g = mesh.geometry;
      const pos = g.attributes.position;
      const n = g.index ? g.index.count : pos.count;
      for (let t = 0; t < n; t += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, g.index ? g.index.getX(t + k) : t + k).applyMatrix4(mesh.matrixWorld);
        if (mesh.name === 'rockFaces' && !g.index && t / 3 >= lr.from && t / 3 < lr.to && v.every((q) => q.y > lowY)) continue;
        const tri = [v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z];
        const id = tris.length;
        tris.push(tri);
        const x0 = Math.floor(Math.min(tri[0], tri[3], tri[6]) / B), x1 = Math.floor(Math.max(tri[0], tri[3], tri[6]) / B);
        const z0 = Math.floor(Math.min(tri[2], tri[5], tri[8]) / B), z1 = Math.floor(Math.max(tri[2], tri[5], tri[8]) / B);
        for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
          const key = i * 100003 + j;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(id);
        }
      }
    }
    const near = (x, z) => buckets.get(Math.floor(x / B) * 100003 + Math.floor(z / B)) || [];
    // Heights of every triangle over (x, z) (a vertical line), exact barycentric.
    const heightsAt = (x, z) => {
      const out = [];
      for (const id of near(x, z)) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris[id];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        out.push(l1 * ay + l2 * by + l3 * cy);
      }
      return out;
    };
    const inDisc = (x, z) => colliders.some((c) => Math.hypot(x - c.x, z - c.z) <= c.r);
    const shapeY = (s, z) => (s.along === 'z' ? s.y0 + (s.y1 - s.y0) * (z - s.minZ) / (s.maxZ - s.minZ) : s.y0);

    // The floor check starts 0.45 m from a wall: walls are colliders, so the
    // cat's centre never stands nearer, and lip stones/boulders are <= 0.12 proud.
    const INSET = 0.45;
    const shapes = [...WALK_SHAPES, ...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS, CAMP_DEN];
    let samples = 0, skippedDisc = 0, skippedOverlap = 0, worst = 0, worstAt = null;
    const bad = [];
    for (const s of shapes) {
      for (let x = s.minX + INSET; x <= s.maxX - INSET + 1e-9; x += 0.5) {
        for (let z = s.minZ + INSET; z <= s.maxZ - INSET + 1e-9; z += 0.5) {
          const y = shapeY(s, z);
          if (inDisc(x, z)) { skippedDisc++; continue; }
          if (Math.abs(ground.y(x, z) - y) > 0.02) { skippedOverlap++; continue; } // another shape's surface is here
          const roof = ground.ceil(x, z);
          const top = roof !== Infinity ? roof - 0.05 : y + 3;
          const hs = heightsAt(x, z).filter((h) => h <= top);
          const first = hs.length ? Math.max(...hs) : null;
          samples++;
          // A floor at y 0 has no drawn surface of its own (the ground plane is not rock).
          const dev = first === null ? (Math.abs(y) < 1e-9 ? 0 : Infinity) : (Math.abs(y) < 1e-9 && first < 0.02 ? 0 : Math.abs(first - y));
          if (dev > worst || dev === Infinity) { worst = dev; worstAt = `${s.tag} (${x.toFixed(2)}, ${z.toFixed(2)}) shapeY ${y.toFixed(3)} first ${first}`; }
          if (dev > 0.02) bad.push(`${s.tag} (${x.toFixed(2)}, ${z.toFixed(2)}) shapeY ${y.toFixed(3)} first ${first}`);
        }
      }
    }
    console.log(`gorge tolerance: ${samples} surface samples, ${skippedDisc} in colliders, ${skippedOverlap} on overlapping shapes, worst ${worst} at ${worstAt}`);
    expect(bad.slice(0, 20)).toEqual([]);
    expect(samples).toBeGreaterThan(1000);
    expect(skippedOverlap).toBe(0);
    expect(skippedDisc).toBeLessThan(150);

    // Floor points near a wall: nothing the paw could sink into.
    const dist2 = (px, pz, t) => {
      // distance from (px, pz) to the triangle's xz shadow
      const P = [[t[0], t[2]], [t[3], t[5]], [t[6], t[8]]];
      const sgn = (a, b) => (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (pz - b[1]);
      const d1 = sgn(P[0], P[1]), d2 = sgn(P[1], P[2]), d3 = sgn(P[2], P[0]);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) && (d1 !== 0 || d2 !== 0 || d3 !== 0)) return 0; // inside (a degenerate, edge-on triangle falls through to its edges)
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const a = P[i], b = P[(i + 1) % 3];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const L = dx * dx + dz * dz;
        const u = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L)) : 0;
        best = Math.min(best, Math.hypot(px - a[0] - dx * u, pz - a[1] - dz * u));
      }
      return best;
    };
    let floorSamples = 0, floorBad = [], closest = Infinity, closestAt = null;
    for (let x = -50; x <= 50; x += 0.25) {
      for (let z = -50; z <= 50; z += 0.25) {
        if (ground.y(x, z) !== 0 || ground.ceil(x, z) !== Infinity || inDisc(x, z)) continue;
        // distance to the nearest wall by probing outward
        let wall = Infinity;
        for (let r = 0.05; r <= 1.2 && wall === Infinity; r += 0.05) {
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
            if (ground.y(px, pz) > 0.05 || ground.ceil(px, pz) !== Infinity) { wall = r; break; }
          }
        }
        if (wall === Infinity || wall < INSET) continue; // no wall within 1.2 m, or too close to stand in
        floorSamples++;
        for (const id of near(x, z).concat(near(x + 0.3, z), near(x - 0.3, z), near(x, z + 0.3), near(x, z - 0.3))) {
          const t = tris[id];
          if (Math.min(t[1], t[4], t[7]) > 0.6 || Math.max(t[1], t[4], t[7]) < 0.05) continue;
          // The part of the triangle between y 0.05 and 0.6 (Sutherland-Hodgman against both planes).
          let poly = [[t[0], t[1], t[2]], [t[3], t[4], t[5]], [t[6], t[7], t[8]]];
          for (const [lo, bound] of [[true, 0.05], [false, 0.6]]) {
            const outp = [];
            for (let i = 0; i < poly.length; i++) {
              const a = poly[i], b = poly[(i + 1) % poly.length];
              const ina = lo ? a[1] >= bound : a[1] <= bound, inb = lo ? b[1] >= bound : b[1] <= bound;
              if (ina) outp.push(a);
              if (ina !== inb) { const u = (bound - a[1]) / (b[1] - a[1]); outp.push([a[0] + (b[0] - a[0]) * u, bound, a[2] + (b[2] - a[2]) * u]); }
            }
            poly = outp;
          }
          if (poly.length < 3) continue;
          let d = Infinity;
          for (let i = 1; i + 1 < poly.length; i++) {
            const a = poly[0], b = poly[i], c = poly[i + 1];
            d = Math.min(d, dist2(x, z, [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]]));
          }
          if (d < closest) { closest = d; closestAt = `(${x}, ${z}) wall ${wall.toFixed(2)}`; }
          if (d < 0.3) floorBad.push(`(${x}, ${z}) wall ${wall.toFixed(2)} tri y ${t[1].toFixed(2)},${t[4].toFixed(2)},${t[7].toFixed(2)}`);
        }
      }
    }
    console.log(`gorge floor check: ${floorSamples} floor samples, closest rock ${closest} at ${closestAt}`);
    expect(floorBad.slice(0, 20)).toEqual([]);
    expect(floorSamples).toBeGreaterThan(500);
  }, 180_000);
});
