import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish-water Task 3: the water dressing (src/render/waterdress.js) — a soft
// wet-earth band and foam line along the REAL shore, a few half-sunk stones.
// Each case builds the real area into a fresh scene, exactly as walk.js does,
// then dresses it.

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

const { createWaterDressing, FILL_LIFT, bankWobble, DRESSED_AREAS, BANK_FILLETS, isStream, bankBite, BITE_CIRCLES, BITE_MAX, BITE_MIN } = await import('../src/render/waterdress.js');
const { fishSpots } = await import('../src/render/fishjump.js');
const { tintDuskLawn, duskLook } = await import('../src/render/dusk.js');
const { resolveQuality } = await import('../src/render/quality.js');
const HIGH = resolveQuality({ override: 'high' });
const LOW = resolveQuality({ override: 'low' });
const { shorePieces, waterClearance, deckDistance, waterGap } = await import('../src/world/builder.js');
const { pinesLilyPads } = await import('../src/world/pines.js');
const WORLDS = {
  park: await import('../src/world/park.js'),
  docks: await import('../src/world/docks.js'),
  gorge: await import('../src/world/gorge.js'),
  woods: await import('../src/world/woods.js'),
  river: await import('../src/world/river.js'),
  moor: await import('../src/world/moor.js'),
  pines: await import('../src/world/pines.js'),
  seaside: await import('../src/world/seaside.js'),
};

const built = new Map();
function area(id) {
  if (!built.has(id)) {
    const scene = new THREE.Scene();
    const areaData = WORLDS[id].build(scene);
    built.set(id, { scene, areaData });
  }
  return built.get(id);
}

function dress(id, opts = {}) {
  const { areaData } = area(id);
  const scene = new THREE.Scene();
  const fx = createWaterDressing(scene, { areaId: id, areaData, tier: HIGH, reducedMotion: false, ...opts });
  return { scene, fx, areaData };
}

const byName = (fx, name) => fx.meshes.find((m) => m.name === name);

function worldPoints(mesh) {
  const pos = mesh.geometry.getAttribute('position');
  mesh.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    out.push({ x: v.x, y: v.y, z: v.z });
  }
  return out;
}

function distToPieces(pieces, x, z) {
  let min = Infinity;
  for (const p of pieces) {
    const dx = p.bx - p.ax, dz = p.bz - p.az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - p.ax) * dx + (z - p.az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    min = Math.min(min, Math.hypot(x - (p.ax + dx * t), z - (p.az + dz * t)));
  }
  return min;
}

const undecked = (waters) => waters.map(({ decks, ...w }) => w);
const triangles = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;

// A vertical ray from above, both faces: topY(mesh)(x, z) is the highest y the
// ray meets on the mesh (null if it misses). A raycaster's answer, but on a
// 0.5 m grid of triangles so thousands of rays stay fast.
function topY(mesh) {
  mesh.updateMatrixWorld(true);
  const pts = worldPoints(mesh);
  const idx = mesh.geometry.index;
  const tri = idx ? Array.from({ length: idx.count }, (_, i) => idx.getX(i)) : pts.map((_, i) => i);
  const C = 0.5, grid = new Map();
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [pts[tri[t]], pts[tri[t + 1]], pts[tri[t + 2]]];
    const x0 = Math.floor(Math.min(a.x, b.x, c.x) / C), x1 = Math.floor(Math.max(a.x, b.x, c.x) / C);
    const z0 = Math.floor(Math.min(a.z, b.z, c.z) / C), z1 = Math.floor(Math.max(a.z, b.z, c.z) / C);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = `${i},${j}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push([a, b, c]);
    }
  }
  return (x, z) => {
    let best = null;
    for (const [a, b, c] of grid.get(`${Math.floor(x / C)},${Math.floor(z / C)}`) ?? []) {
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
      const y = u * a.y + v * b.y + (1 - u - v) * c.y;
      if (best === null || y > best) best = y;
    }
    return best;
  };
}

describe('water dressing', () => {
  it('dresses exactly the seven water areas', () => {
    expect(DRESSED_AREAS).toEqual(['woods', 'river', 'moor', 'pines', 'seaside', 'park', 'gorge']);
  });

  it('is a no-op stub on the docks', () => {
    for (const id of ['docks']) {
      const { scene, fx } = dress(id);
      expect(fx.meshes).toEqual([]);
      expect(scene.children).toHaveLength(0);
      expect(() => { fx.update(0.1); fx.dispose(); }).not.toThrow();
    }
    // and on an area with no data at all (the den)
    const scene = new THREE.Scene();
    const fx = createWaterDressing(scene, { areaId: 'den', areaData: {}, tier: HIGH });
    expect(fx.meshes).toEqual([]);
    expect(scene.children).toHaveLength(0);
  }, 120_000);

  it('bankWobble is smooth and stays in -0.3..+0.1', () => {
    let prev = bankWobble(7, 0);
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s <= 400; s += 0.05) {
      const v = bankWobble(7, s);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
    expect(lo).toBeGreaterThanOrEqual(-0.3);
    expect(hi).toBeLessThanOrEqual(0.1);
    expect(hi - lo).toBeGreaterThan(0.2);
    expect(bankWobble(7, 12.3)).toBe(bankWobble(7, 12.3));
    expect(bankWobble(8, 12.3)).not.toBe(bankWobble(7, 12.3));
  });

  it('is deterministic and never calls Math.random (beyond three uuids)', () => {
    area('woods');
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      if (!/generateUUID/.test(new Error().stack)) throw new Error('Math.random used');
      return 0.5;
    });
    try {
      const a = dress('woods').fx;
      const b = dress('woods').fx;
      expect(a.meshes.length).toBe(b.meshes.length);
      a.meshes.forEach((m, i) => {
        expect(Array.from(m.geometry.getAttribute('position').array))
          .toEqual(Array.from(b.meshes[i].geometry.getAttribute('position').array));
      });
    } finally {
      spy.mockRestore();
    }
  }, 120_000);

  it('adds at most 3 direct, shadowless meshes per area, under 12,000 triangles', () => {
    const tris = {};
    for (const id of DRESSED_AREAS) {
      const { scene, fx } = dress(id);
      expect(fx.meshes.length).toBeGreaterThan(0);
      expect(fx.meshes.length).toBeLessThanOrEqual(3);
      expect(scene.children).toHaveLength(fx.meshes.length);
      for (const m of fx.meshes) {
        expect(m.parent).toBe(scene);
        expect(m.castShadow).toBe(false);
        // the band and stones take tree shadows; none of them casts
        expect(m.receiveShadow).toBe(m.name !== 'waterdress:apron');
      }
      tris[id] = fx.meshes.reduce((n, m) => n + triangles(m), 0);
      expect(tris[id]).toBeLessThanOrEqual(12_000);
    }
  }, 120_000);

  it('the band is transparent, fogged, depth-write off and polygon-offset', () => {
    const band = byName(dress('woods').fx, 'waterdress:band');
    const mat = band.material;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.polygonOffset).toBe(true);
    expect(mat.fog).toBe(true);
    expect(mat.vertexColors).toBe(true);
    // a transparent DoubleSide material is otherwise drawn in two passes
    expect(mat.side !== THREE.DoubleSide || mat.forceSinglePass).toBe(true);
    expect(band.geometry.getAttribute('color').itemSize).toBe(4);
  }, 120_000);

  it('the band follows real shore only, never across open water', () => {
    for (const id of DRESSED_AREAS) {
      const { fx, areaData } = dress(id);
      const band = byName(fx, 'waterdress:band');
      const waters = undecked(areaData.waters);
      const real = shorePieces(areaData.waters);
      for (const p of worldPoints(band)) {
        const depth = -waterClearance(waters, p.x, p.z);
        if (depth > 0.35) {
          expect(distToPieces(real, p.x, p.z), `${id} band vertex at ${p.x.toFixed(2)},${p.z.toFixed(2)}`)
            .toBeLessThan(1.0);
        }
      }
    }
  }, 120_000);

  it('the seaside dresses only its minX shore', () => {
    const { fx, areaData } = dress('seaside');
    const sea = areaData.waters.find((w) => w.id === 'sea');
    const pts = worldPoints(byName(fx, 'waterdress:band'));
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) expect(Math.abs(p.x - sea.minX)).toBeLessThanOrEqual(1.5);
  }, 120_000);

  it('the band sits just over the water and the ground', () => {
    const { fx, areaData } = dress('woods');
    const top = Math.max(...areaData.waterFx.map((h) => h.y));
    for (const p of worldPoints(byName(fx, 'waterdress:band'))) {
      expect(p.y).toBeGreaterThanOrEqual(0.011);
      expect(p.y).toBeLessThanOrEqual(top + 0.01);
    }
  }, 120_000);

  it('stones sit on land by real shore, clear of decks and colliders', () => {
    // Not the Seaside: a sandy beach takes no stones (Task 4, see below).
    for (const id of DRESSED_AREAS.filter((a) => a !== 'seaside')) {
      const { fx, areaData } = dress(id);
      const stones = byName(fx, 'waterdress:stones');
      expect(stones, id).toBeTruthy();
      const centres = stones.userData.centres;
      expect(centres.length).toBeGreaterThan(0);
      const waters = undecked(areaData.waters);
      const real = shorePieces(areaData.waters);
      for (const c of centres) {
        const at = `${id} stone at ${c.x.toFixed(2)},${c.z.toFixed(2)}`;
        expect(waterClearance(waters, c.x, c.z), at).toBeGreaterThan(0);
        expect(distToPieces(real, c.x, c.z), at).toBeLessThanOrEqual(1.5);
        expect(deckDistance(areaData.waters, c.x, c.z), at).toBeGreaterThanOrEqual(1.5);
        for (const k of areaData.colliders ?? []) {
          expect(Math.hypot(c.x - k.x, c.z - k.z), at).toBeGreaterThan(k.r);
        }
      }
    }
  }, 120_000);

  it('separate shore chains of one water get their own wobble seeds', () => {
    let multi = 0;
    for (const id of DRESSED_AREAS) {
      const { fx } = dress(id);
      const seeds = new Map();
      for (const r of byName(fx, 'waterdress:band').userData.runSeeds) {
        if (!seeds.has(r.water)) seeds.set(r.water, new Set());
        seeds.get(r.water).add(r.seed);
      }
      // a water with two or more banks must not give them all one seed
      for (const set of seeds.values()) if (set.size > 1) multi++;
    }
    expect(multi).toBeGreaterThan(0);
  }, 120_000);

  it('stones keep at least r + 0.5 m off the keep-out circles handed in', () => {
    const base = byName(dress('woods').fx, 'waterdress:stones').userData.centres;
    expect(base.length).toBeGreaterThan(2);
    const keepOut = base.slice(0, 3).map((c) => ({ x: c.x, z: c.z, r: 1 }));
    const after = byName(dress('woods', { keepOut }).fx, 'waterdress:stones').userData.centres;
    expect(after.length).toBeLessThan(base.length);
    for (const c of after) {
      for (const k of keepOut) expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeGreaterThanOrEqual(k.r + 0.5);
    }
  }, 120_000);

  it('LOW tier keeps the band (and the sea apron) but has no stones or reeds', () => {
    for (const id of DRESSED_AREAS) {
      const { fx } = dress(id, { tier: LOW });
      // The apron is not decoration: without it the sea ends in a corner.
      const want = id === 'seaside' ? ['waterdress:band', 'waterdress:apron'] : ['waterdress:band'];
      expect(fx.meshes.map((m) => m.name)).toEqual(want);
    }
  }, 120_000);

  // Ruling: the Pines already draws lily pads (and reeds) round every bog
  // (pines.js pinesLilyPads / pinesReeds), so the dressing adds no second set.
  // The brief's placement rule is pinned on the pads that are there.
  it('bogs: no second set of lily pads; the existing pads sit well inside', () => {
    const { fx, areaData } = dress('pines');
    expect(fx.meshes.map((m) => m.name)).not.toContain('waterdress:reeds');
    const bogs = areaData.waters.filter((w) => /^bog-/.test(w.id));
    expect(bogs).toHaveLength(4);
    const pads = pinesLilyPads();
    for (const bog of bogs) {
      const mine = pads.filter((p) => Math.hypot(p.x - bog.x, p.z - bog.z) < bog.r);
      expect(mine.length, bog.id).toBeGreaterThanOrEqual(3);
      for (const p of mine) expect(bog.r - Math.hypot(p.x - bog.x, p.z - bog.z)).toBeGreaterThanOrEqual(0.4);
    }
  }, 120_000);

  it('bogs get a full ring with a dull, not white, foam', () => {
    const { fx, areaData } = dress('pines');
    const band = byName(fx, 'waterdress:band');
    const pts = worldPoints(band);
    const col = band.geometry.getAttribute('color');
    for (const bog of areaData.waters.filter((w) => /^bog-/.test(w.id))) {
      const near = pts.map((p, i) => ({ p, i })).filter(({ p }) => Math.abs(Math.hypot(p.x - bog.x, p.z - bog.z) - bog.r) < 1.6);
      // every quarter of the ring is dressed
      const quads = new Set(near.map(({ p }) => Math.floor(((Math.atan2(p.z - bog.z, p.x - bog.x) + Math.PI) / (Math.PI / 2))) % 4));
      expect(quads.size, bog.id).toBe(4);
      for (const { i } of near) {
        if (col.getW(i) < 0.3) continue;
        const l = (col.getX(i) + col.getY(i) + col.getZ(i)) / 3;
        expect(l, bog.id).toBeLessThan(0.5);
      }
    }
  }, 120_000);

  it('the foam breathes slowly, and not at all under reduced motion', () => {
    const live = dress('woods').fx;
    const u = byName(live, 'waterdress:band').material.userData.breathe;
    const before = u.value;
    live.update(1.3);
    expect(u.value).not.toBe(before);

    const still = dress('woods', { reducedMotion: true }).fx;
    const band = byName(still, 'waterdress:band');
    const snap = () => JSON.stringify([
      band.material.userData.breathe.value, band.material.opacity,
      Array.from(band.geometry.getAttribute('color').array.slice(0, 64)),
      still.meshes.map((m) => [m.position.toArray(), m.rotation.toArray(), m.visible]),
    ]);
    const s0 = snap();
    still.update(1.3);
    still.update(5);
    expect(snap()).toBe(s0);
  }, 120_000);

  // --- Task 4: the Seaside's shoreline ('sea' style) -------------------------

  it('the sea is styled "sea" and takes no stones on its sandy beach', () => {
    const { fx, areaData } = dress('seaside');
    expect(areaData.waterFx.find((h) => h.footprint.id === 'sea').style).toBe('sea');
    expect(fx.meshes.map((m) => m.name)).toEqual(['waterdress:band', 'waterdress:apron']);
  }, 120_000);

  it('the sea gets a wavy foam strip along its beach', () => {
    const { fx, areaData } = dress('seaside');
    const sea = areaData.waters.find((w) => w.id === 'sea');
    const band = byName(fx, 'waterdress:band');
    // The waterline: where the foam's lace edge meets the sand, one point per
    // sample along the shore.
    const line = band.userData.waterline;
    expect(line.length).toBeGreaterThan(50);
    const xs = line.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0.4);
    // and it is a wave, not noise: neighbours a sample apart barely differ
    for (let i = 1; i < line.length; i++) expect(Math.abs(line[i].x - line[i - 1].x)).toBeLessThan(0.25);
    // across the walkable beach and 30 m past both ends of it
    const zs = line.map((p) => p.z);
    const b = areaData.bounds;
    expect(Math.min(...zs)).toBeLessThanOrEqual(b.minZ - 30 + 0.5);
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(b.maxZ + 30 - 0.5);
    // it stays at the shore: nothing out over the sea past x 28, nothing up
    // the beach past the wet sand
    for (const p of worldPoints(band)) {
      expect(p.x).toBeLessThanOrEqual(28);
      expect(p.x).toBeGreaterThan(sea.minX - 1.5);
    }
    // white-ish foam, strongest at the lace edge
    const col = band.geometry.getAttribute('color');
    const foam = band.geometry.getAttribute('aFoam');
    let strong = 0;
    for (let i = 0; i < col.count; i++) {
      if (foam.getX(i) < 0.5 || col.getW(i) < 0.5) continue;
      strong++;
      expect((col.getX(i) + col.getY(i) + col.getZ(i)) / 3).toBeGreaterThan(0.85);
    }
    expect(strong).toBeGreaterThan(50);
  }, 120_000);

  it('the foam strip washes in and out, and holds still under reduced motion', () => {
    const live = dress('seaside').fx;
    const u = byName(live, 'waterdress:band').material.userData.swash;
    const before = u.value;
    live.update(1.3);
    expect(u.value).not.toBe(before);
    const still = dress('seaside', { reducedMotion: true }).fx;
    const s = byName(still, 'waterdress:band').material.userData.swash;
    const s0 = s.value;
    still.update(1.3);
    expect(s.value).toBe(s0);
  }, 120_000);

  it('a far-sea apron carries the sea past its slab, so the shore has no corner', () => {
    const { fx, areaData } = dress('seaside');
    const sea = areaData.waters.find((w) => w.id === 'sea');
    const h = areaData.waterFx.find((f) => f.footprint.id === 'sea');
    const apron = byName(fx, 'waterdress:apron');
    expect(apron.castShadow).toBe(false);
    expect(apron.material.fog).toBe(true);
    const pts = worldPoints(apron);
    for (const p of pts) {
      expect(p.y).toBeLessThan(h.y);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeGreaterThanOrEqual(sea.minX - 1e-6);
    }
    // every point east of the shore line, z -200..200, is under sea or apron
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    for (let z = -200; z <= 200; z += 10) {
      for (const x of [sea.minX + 0.2, 40, 80, 104.8, 106, 150, 220]) {
        const inSea = x > sea.minX && x < sea.maxX && z > sea.minZ && z < sea.maxZ;
        if (inSea) continue;
        ray.set(new THREE.Vector3(x, 5, z), down);
        expect(ray.intersectObject(apron).length, `${x},${z}`).toBeGreaterThan(0);
      }
    }
    // and it tucks under the sea's own edges, so no seam of sky shows
    for (const [x, z] of [[60, sea.maxZ - 0.2], [60, sea.minZ + 0.2], [sea.maxX - 0.2, 0]]) {
      ray.set(new THREE.Vector3(x, 5, z), down);
      expect(ray.intersectObject(apron).length, `${x},${z}`).toBeGreaterThan(0);
    }
  }, 120_000);

  it('dispose removes and frees everything', () => {
    const { scene, fx } = dress('river');
    const spies = fx.meshes.map((m) => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material, 'dispose')]);
    fx.dispose();
    expect(scene.children).toHaveLength(0);
    for (const [g, m] of spies) { expect(g).toHaveBeenCalled(); expect(m).toHaveBeenCalled(); }
  }, 120_000);

  // --- polish-waterlife Task 4: the Woods stream bend's rounded bank ---------
  //
  // The fillet needs the area's ground plane (it borrows its material), which
  // lives in the scene the area was built into: walk.js dresses that same
  // scene. These cases hand a fresh scene a clone of the built ground (same
  // geometry, same material) so the scene holds nothing else.

  const groundOf = (id) => area(id).scene.children.find((c) => c.isMesh && c.userData.ground);
  function dressOnGround(id, opts = {}, ground = groundOf(id).clone()) {
    const { areaData } = area(id);
    const scene = new THREE.Scene();
    scene.add(ground);
    const fx = createWaterDressing(scene, { areaId: id, areaData, tier: HIGH, reducedMotion: false, ...opts });
    return { scene, fx, areaData, ground };
  }
  const LAKE = { x: -14, z: -34 };
  const LAKE_R = 4;
  const CORNER = { x: 23, z: -9 };
  const CENTRE = { x: 21.4, z: -10.6 };
  const inCell = (p, e = 1e-6) => p.x >= 21.4 - e && p.x <= 23 + e && p.z >= -10.6 - e && p.z <= -9 + e;

  it('BANK_FILLETS names the Woods bend and the lake corner, frozen', () => {
    expect(BANK_FILLETS).toEqual({ woods: [{ x: 23, z: -9, r: 1.6, wx: -1, wz: -1 }, { x: -14, z: -34, r: LAKE_R, wx: -1, wz: -1 }] });
    expect(Object.isFrozen(BANK_FILLETS)).toBe(true);
    expect(Object.isFrozen(BANK_FILLETS.woods)).toBe(true);
    expect(Object.isFrozen(BANK_FILLETS.woods[0])).toBe(true);
    expect(Object.isFrozen(BANK_FILLETS.woods[1])).toBe(true);
  });

  it('the Woods lake corner (-14,-34) is rounded: no band sample within 0.3·R of the square corner', () => {
    const band = byName(dressOnGround('woods').fx, 'waterdress:band');
    const f = band.userData.fillets;
    expect(f).toHaveLength(2);
    const samples = f[1].samples;
    expect(samples.length).toBeGreaterThanOrEqual(6);
    for (const p of samples) {
      expect(Math.hypot(p.x - LAKE.x, p.z - LAKE.z), `${p.x},${p.z}`).toBeGreaterThan(0.3 * LAKE_R);
    }
    const cx = LAKE.x - LAKE_R, cz = LAKE.z - LAKE_R;
    const near = samples.filter((p) => p.x >= cx - 1e-6 && p.x <= LAKE.x + 1e-6 && p.z >= cz - 1e-6 && p.z <= LAKE.z + 1e-6);
    expect(near.length).toBeGreaterThanOrEqual(6);
    for (const p of near) expect(Math.abs(Math.hypot(p.x - cx, p.z - cz) - LAKE_R), `${p.x},${p.z}`).toBeLessThan(0.02);
  }, 120_000);

  it('the lake fillet fan covers no fish spot, keeps 1 m off them, and sits off every path and deck', () => {
    const { fx, areaData } = dressOnGround('woods');
    const fill = byName(fx, 'waterdress:fill');
    const [f0, fn] = fill.userData.filletVerts;
    const lakePts = worldPoints(fill).slice(f0, f0 + fn).filter((p) => p.x < 0);
    expect(lakePts.length).toBeGreaterThanOrEqual(12);
    for (const p of lakePts) {
      expect(p.x).toBeGreaterThanOrEqual(LAKE.x - LAKE_R - 1e-6);
      expect(p.x).toBeLessThanOrEqual(LAKE.x + 1e-6);
      expect(p.z).toBeGreaterThanOrEqual(LAKE.z - LAKE_R - 1e-6);
      expect(p.z).toBeLessThanOrEqual(LAKE.z + 1e-6);
    }
    for (const s of fishSpots('woods', areaData)) {
      const dx = Math.max(LAKE.x - LAKE_R - s.x, 0, s.x - LAKE.x), dz = Math.max(LAKE.z - LAKE_R - s.z, 0, s.z - LAKE.z);
      expect(Math.hypot(dx, dz), `${s.x},${s.z}`).toBeGreaterThanOrEqual(1);
    }
    for (const p of lakePts) expect(deckDistance(areaData.waters, p.x, p.z)).toBeGreaterThan(1);
  }, 120_000);

  it('the Woods stream bend has a rounded bank: no band sample of the bend lies within 0.3 m of the square corner (23, -9)', () => {
    const band = byName(dressOnGround('woods').fx, 'waterdress:band');
    const f = band.userData.fillets;
    expect(f).toHaveLength(2);
    const samples = f[0].samples;
    // both footprints' chains run round this corner, so both bend
    expect(samples.length).toBeGreaterThanOrEqual(6);
    for (const p of samples) {
      expect(Math.hypot(p.x - CORNER.x, p.z - CORNER.z), `${p.x},${p.z}`).toBeGreaterThan(0.3);
    }
    const near = samples.filter((p) => inCell(p));
    expect(near.length).toBeGreaterThanOrEqual(6);
    for (const p of near) {
      expect(Math.abs(Math.hypot(p.x - CENTRE.x, p.z - CENTRE.z) - 1.6), `${p.x},${p.z}`).toBeLessThan(0.02);
      // the normal is the radial direction, onto the land
      const rx = (p.x - CENTRE.x) / 1.6, rz = (p.z - CENTRE.z) / 1.6;
      expect(p.nx * rx + p.nz * rz).toBeGreaterThan(0.999);
    }
    // the two edges' samples meet at the 45-degree diagonal
    const diag = { x: CENTRE.x + 1.6 * Math.SQRT1_2, z: CENTRE.z + 1.6 * Math.SQRT1_2 };
    expect(near.some((p) => Math.hypot(p.x - diag.x, p.z - diag.z) < 1e-6)).toBe(true);
    // still the real-shore rule: nothing deep in the water far from a bank
    // (on ground the streams' bites move the visual shore up to BITE_MAX in;
    // the riffles' foam streaks lie mid-stream on purpose, so they are left out)
    const { areaData } = area('woods');
    const real = shorePieces(areaData.waters);
    const streak = new Set((band.userData.streaks ?? []).flatMap(({ verts: [v0, n] }) => Array.from({ length: n }, (_, i) => v0 + i)));
    for (const [i, v] of worldPoints(band).entries()) {
      if (streak.has(i)) continue;
      if (-waterClearance(undecked(areaData.waters), v.x, v.z) > 0.35) expect(distToPieces(real, v.x, v.z)).toBeLessThan(1.0 + BITE_MAX);
    }
    // and the band's land side over the fill rides above it, not under it
    const fill = byName(dressOnGround('woods').fx, 'waterdress:fill');
    const fy = fill.geometry.getAttribute('position').getY(0);
    for (const v of worldPoints(band)) {
      if (inCell(v) && Math.hypot(v.x - CENTRE.x, v.z - CENTRE.z) > 1.6 + 1e-3) expect(v.y, `${v.x},${v.z}`).toBeGreaterThan(fy);
    }
  }, 120_000);

  it('no ground plane, no fillet: the band keeps its square corner', () => {
    const { fx } = dress('woods');
    expect(byName(fx, 'waterdress:fill')).toBeUndefined();
    expect(byName(fx, 'waterdress:band').userData.fillets).toBeUndefined();
    expect(byName(fx, 'waterdress:band').userData.bites).toBeUndefined();
  }, 120_000);

  it('the fillet fan covers the corner and stays inside the square r×r cell', () => {
    const { fx, areaData } = dressOnGround('woods');
    const fill = byName(fx, 'waterdress:fill');
    expect(fill).toBeTruthy();
    expect(fx.meshes).toContain(fill);
    // the fan's own vertices (the rest of the mesh is the streams' bites)
    const [f0, fn] = fill.userData.filletVerts;
    const pts = worldPoints(fill).slice(f0, f0 + fn).filter((p) => p.x > 0);
    const waterY = areaData.waterFx.find((h) => h.footprint.id === 'river-west').y;
    for (const p of pts) {
      expect(inCell(p), `${p.x},${p.z}`).toBe(true);
      expect(p.y).toBeCloseTo(waterY + FILL_LIFT, 6);
    }
    // one triangle per arc segment: 10..16 of them
    // (two fans: the bend's and the lake's)
    expect(fn / 2 - 2).toBeGreaterThanOrEqual(10);
    expect(fn / 2 - 2).toBeLessThanOrEqual(16);
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    // the true corner is covered (from above: the faces look up)
    ray.set(new THREE.Vector3(22.9, 5, -9.1), down);
    expect(ray.intersectObject(fill).length).toBeGreaterThan(0);
    // inside the arc is open water
    ray.set(new THREE.Vector3(21.6, 5, -10.4), down);
    expect(ray.intersectObject(fill).length).toBe(0);
    expect(fill.castShadow).toBe(false);
    expect(fill.receiveShadow).toBe(true);
    expect(fill.userData.noCast).toBe(true);
    expect(fill.matrixAutoUpdate).toBe(false);
    // opaque, after the water in the opaque pass; the band (transparent) is later still
    expect(fill.material.transparent).toBe(false);
    expect(fill.renderOrder).toBeGreaterThan(0);
  }, 120_000);

  it('the fillet shares the ground material and dispose leaves it alive', () => {
    const { scene, fx, ground } = dressOnGround('woods');
    const fill = byName(fx, 'waterdress:fill');
    expect(fill.material).toBe(ground.material);
    // the ground's own attributes, sampled where each vertex lies
    const geo = fill.geometry;
    for (const name of ['uv', 'normal', 'color']) {
      expect(geo.getAttribute(name), name).toBeTruthy();
      expect(geo.getAttribute(name).itemSize).toBe(ground.geometry.getAttribute(name).itemSize);
    }
    const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv'), nrm = geo.getAttribute('normal');
    const { width, height } = ground.geometry.parameters;
    for (let i = 0; i < pos.count; i++) {
      // PlaneGeometry laid flat (rotation.x = -PI/2): u runs with x, v against z
      expect(uv.getX(i)).toBeCloseTo((pos.getX(i) + width / 2) / width, 6);
      expect(uv.getY(i)).toBeCloseTo((height / 2 - pos.getZ(i)) / height, 6);
      expect(nrm.getY(i)).toBeCloseTo(1, 6);
    }
    const matSpy = vi.spyOn(ground.material, 'dispose');
    const geoSpy = vi.spyOn(geo, 'dispose');
    fx.dispose();
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).not.toHaveBeenCalled();
    expect(scene.children).toEqual([ground]);
    matSpy.mockRestore();
  }, 120_000);

  it('the fill follows the ground material when the rain swaps it (and under reduced motion)', () => {
    for (const reducedMotion of [false, true]) {
      const { fx, ground } = dressOnGround('woods', { reducedMotion });
      const fill = byName(fx, 'waterdress:fill');
      const dry = ground.material;
      expect(fill.material).toBe(dry);
      const wet = dry.clone();
      ground.material = wet;
      fx.update(0);
      expect(fill.material, `reducedMotion ${reducedMotion}`).toBe(wet);
      // the rain stops: the dry lawn is back and the wet clone is freed
      ground.material = dry;
      wet.dispose();
      fx.update(0);
      expect(fill.material, `reducedMotion ${reducedMotion}`).toBe(dry);
      const spy = vi.spyOn(dry, 'dispose');
      fx.dispose();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  }, 120_000);

  it('finds the ground plane whatever the scene order', () => {
    const { areaData } = area('woods');
    const scene = new THREE.Scene();
    // a ground-tagged mesh that is no plane, a path and a hidden plane first
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    box.userData.ground = true;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    path.userData.ground = true; path.name = 'path';
    const hidden = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    hidden.userData.ground = true; hidden.visible = false;
    const ground = groundOf('woods').clone();
    scene.add(box, path, hidden, ground);
    const fx = createWaterDressing(scene, { areaId: 'woods', areaData, tier: HIGH });
    expect(byName(fx, 'waterdress:fill').material).toBe(ground.material);
    fx.dispose();
  }, 120_000);

  it('at dusk the fillet takes the tinted lawn: its material and its vertex colours', () => {
    const { areaData } = area('woods');
    const g = groundOf('woods').clone();
    g.geometry = g.geometry.clone();
    const tint = tintDuskLawn({ ground: [g], grass: null, look: duskLook(areaData) });
    const { fx } = dressOnGround('woods', { evening: 'dusk' }, g);
    const fill = byName(fx, 'waterdress:fill');
    expect(fill.material).toBe(g.material);
    const col = fill.geometry.getAttribute('color');
    const gc = g.geometry.getAttribute('color');
    const { width, widthSegments: ws, heightSegments: hs } = g.geometry.parameters;
    const pos = fill.geometry.getAttribute('position');
    const [f0, fn] = fill.userData.filletVerts;
    for (let i = f0; i < f0 + fn; i++) {
      const fx0 = ((pos.getX(i) + width / 2) / width) * ws, fy0 = ((pos.getZ(i) + width / 2) / width) * hs;
      const ix = Math.min(ws - 1, Math.floor(fx0)), iy = Math.min(hs - 1, Math.floor(fy0));
      for (const [k, get] of [[0, 'getX'], [1, 'getY'], [2, 'getZ']]) {
        const vals = [[ix, iy], [ix + 1, iy], [ix, iy + 1], [ix + 1, iy + 1]].map(([a, b]) => gc[get](b * (ws + 1) + a));
        expect(col[get](i), `v${i} c${k}`).toBeGreaterThanOrEqual(Math.min(...vals) - 1e-6);
        expect(col[get](i), `v${i} c${k}`).toBeLessThanOrEqual(Math.max(...vals) + 1e-6);
      }
    }
    fx.dispose();
    tint.dispose();
  }, 120_000);

  it('the fillet is on every tier', () => {
    const { fx } = dressOnGround('woods', { tier: LOW });
    expect(fx.meshes.map((m) => m.name)).toEqual(['waterdress:band', 'waterdress:fill']);
    const hi = dressOnGround('woods').fx;
    expect(hi.meshes.length).toBeLessThanOrEqual(3);
  }, 120_000);

  // Pinned on HEAD e96290b, before the fillet existed: each band's position
  // and colour arrays as [length, sum |v|, sum v * (i % 97 + 1)]. Sums are
  // compared to 1e-7 relative so a last-digit float difference on CI passes
  // and any moved vertex does not.
  const BAND_SIGS = {
    woods: [[9414, 150933.24626954645, -5075727.709597291], [12552, 4524.366993766278, 221473.26101669297]],
    river: [[13968, 255698.0767835551, -2912872.8324981984], [18624, 6713.018713504076, 328937.9169616997]],
    moor: [[9468, 119705.49577815388, 1728377.440748978], [12624, 4541.783086530864, 222640.87666728348]],
    pines: [[15012, 282253.1640906413, -3259469.4474358615], [20016, 5598.474907413125, 274193.9013411477]],
    seaside: [[5130, 104119.7314075008, 2642484.1935188174], [6840, 5319.668896520045, 259625.7970965649]],
  };
  const sig = (arr) => {
    let a = 0, b = 0;
    for (let i = 0; i < arr.length; i++) { a += Math.abs(arr[i]); b += arr[i] * ((i % 97) + 1); }
    return [arr.length, a, b];
  };
  const sameSig = (got, want, at) => {
    expect(got[0], at).toBe(want[0]);
    for (const k of [1, 2]) expect(Math.abs(got[k] - want[k]), at).toBeLessThanOrEqual(1e-7 * Math.abs(want[k]));
  };

  it("with no ground to borrow, every band is the old band exactly", () => {
    for (const id of ['woods', 'river', 'moor', 'pines', 'seaside']) {
      const { fx } = dress(id);
      expect(byName(fx, 'waterdress:fill'), id).toBeUndefined();
      const band = byName(fx, 'waterdress:band');
      sameSig(sig(band.geometry.getAttribute('position').array), BAND_SIGS[id][0], `${id} position`);
      sameSig(sig(band.geometry.getAttribute('color').array), BAND_SIGS[id][1], `${id} color`);
    }
    // and the Seaside (no streams, no fillet) is unchanged on its ground too
    const { fx } = dressOnGround('seaside');
    expect(byName(fx, 'waterdress:fill')).toBeUndefined();
    const band = byName(fx, 'waterdress:band');
    sameSig(sig(band.geometry.getAttribute('position').array), BAND_SIGS.seaside[0], 'seaside position');
    sameSig(sig(band.geometry.getAttribute('color').array), BAND_SIGS.seaside[1], 'seaside color');
  }, 120_000);

  // --- polish-streams Task 1: the streams' wandering bank (bites) -----------

  describe('stream bites', () => {
    const STREAM_AREAS = ['woods', 'river', 'moor', 'pines'];
    // the invariants every bitten stream keeps, the Gorge's lighter band too
    const BITTEN_AREAS = [...STREAM_AREAS, 'gorge'];
    const STREAMS = {
      woods: ['river-west', 'river-north'],
      river: ['river-west', 'river-bend', 'river-east'],
      moor: ['river-south', 'river-west', 'river-mouth'],
      pines: ['mire-north', 'mire-west'],
      gorge: ['stream'],
    };
    const bitesOf = (fx) => byName(fx, 'waterdress:band').userData.bites ?? [];

    it('isStream picks the narrow rect streams, never a lake, pond, pool, bog or the sea', () => {
      for (const id of [...STREAM_AREAS, 'seaside', 'park']) {
        const { areaData } = area(id);
        for (const h of areaData.waterFx) {
          const wid = h.footprint.id;
          if ((STREAMS[id] ?? []).includes(wid)) expect(isStream(h), `${id} ${wid}`).toBe(true);
          if (/^(lake|pond|pool|bog|sea)/.test(wid)) expect(isStream(h), `${id} ${wid}`).toBe(false);
        }
      }
      expect(BITE_CIRCLES).toEqual({ park: ['pond'], woods: ['pond'], river: ['pond', 'pool-1', 'pool-2', 'pool-3'] });
      expect(Object.isFrozen(BITE_CIRCLES)).toBe(true);
      expect(Object.isFrozen(BITE_CIRCLES.park)).toBe(true);
      expect(Object.isFrozen(BITE_CIRCLES.woods)).toBe(true);
      expect(Object.isFrozen(BITE_CIRCLES.river)).toBe(true);
    }, 120_000);

    const RINGS = { woods: ['pond'], river: ['pond', 'pool-1', 'pool-2', 'pool-3'] };
    const RING_AT = { woods: { pond: [-44, -6, 6] }, river: { pond: [44, -6, 6], 'pool-1': [-30, 12, 3.5], 'pool-2': [-12, 34, 2.5], 'pool-3': [-40, 33, 3] } };

    it('the Woods pond and the River pond and pools are bitten like the Park pond', () => {
      for (const [id, wids] of Object.entries(RINGS)) {
        const { fx } = dressOnGround(id, { debug: true });
        const bites = bitesOf(fx);
        for (const w of wids) {
          const b = bites.find((q) => q.water === w);
          expect(b, `${id} ${w}`).toBeTruthy();
          expect(b.maxBite, `${id} ${w}`).toBeLessThanOrEqual(0.6 + 1e-9);
          expect(b.maxBite, `${id} ${w}`).toBeGreaterThanOrEqual(BITE_MIN);
        }
        // no clear white foam round those rings, at any time of day
        for (const evening of [null, 'sunset', 'dusk']) {
          const g = byName(dressOnGround(id, { evening }).fx, 'waterdress:band').geometry;
          const pos = g.getAttribute('position'), col = g.getAttribute('color'), foam = g.getAttribute('aFoam');
          const soft = new THREE.Color(0xcfe0e4);
          for (const w of wids) {
            const [cx, cz, r] = RING_AT[id][w];
            const others = undecked(area(id).areaData.waters).filter((q) => q.id !== w);
            let n = 0;
            for (let i = 0; i < foam.count; i++) {
              if (foam.getX(i) !== 1) continue;
              if (Math.abs(Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) - r) > 1) continue;
              // where another water (a stream the pond runs into) owns the rim, its foam stands
              if (waterClearance(others, pos.getX(i), pos.getZ(i)) < 1.5) continue;
              n++;
              expect(col.getW(i), `${id} ${w} ${evening}`).toBeLessThanOrEqual(0.5 * 0.45 + 1e-6);
              if (evening === null) {
                const at = `${id} ${w} ${pos.getX(i).toFixed(2)},${pos.getZ(i).toFixed(2)} c=${col.getX(i).toFixed(3)}`;
                expect(col.getX(i), at).toBeCloseTo(soft.r, 6);
                expect(col.getY(i)).toBeCloseTo(soft.g, 6);
                expect(col.getZ(i)).toBeCloseTo(soft.b, 6);
              }
            }
            expect(n, `${id} ${w} ${evening}`).toBeGreaterThan(10);
          }
        }
      }
    }, 120_000);

    it('pond bites keep every fish spot clear', () => {
      for (const id of Object.keys(RINGS)) {
        const { areaData } = area(id);
        const before = JSON.stringify(fishSpots(id, areaData));
        const { fx } = dressOnGround(id);
        expect(JSON.stringify(fishSpots(id, areaData)), id).toBe(before);
        const fill = worldPoints(byName(fx, 'waterdress:fill'));
        for (const f of fishSpots(id, areaData)) {
          for (const q of fill) expect(Math.hypot(q.x - f.x, q.z - f.z), `${id} ${f.x},${f.z}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    }, 120_000);

    it('pond dressing adds at most 1,200 triangles in the River and 600 in the Woods', () => {
      const sum = (id) => dressOnGround(id).fx.meshes.reduce((n, m) => n + triangles(m), 0);
      expect(sum('river')).toBeLessThanOrEqual(10_793 + 1_200);
      expect(sum('woods')).toBeLessThanOrEqual(7_917 + 600);
    }, 120_000);

    it('bankBite stays in range and is smooth', () => {
      for (const [kind, lo, hi] of [['stream', 0.15, 0.85], ['pond', 0.10, 0.60]]) {
        for (const period of [0, 44]) {
          let prev = bankBite(11, 0, period, kind);
          let mn = Infinity, mx = -Infinity;
          for (let i = 1; i <= 5000; i++) {
            const v = bankBite(11, i * 0.1, period, kind);
            mn = Math.min(mn, v); mx = Math.max(mx, v);
            expect(Math.abs(v - prev)).toBeLessThanOrEqual(0.05);
            prev = v;
          }
          expect(mn).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(mx).toBeLessThanOrEqual(hi + 1e-9);
          expect(mx - mn).toBeGreaterThan(0.5 * (hi - lo));
        }
      }
      expect(BITE_MAX).toBe(0.85);
      // a ring meets itself
      expect(bankBite(5, 0, 30, 'pond')).toBeCloseTo(bankBite(5, 30, 30, 'pond'), 9);
    });

    it('on ground every stream bank is bitten, the lip over the water, the bite wandering', () => {
      const lips = {}, varied = {};
      for (const id of STREAM_AREAS) {
        lips[id] = 0; varied[id] = 0;
        const { fx, areaData } = dressOnGround(id, { debug: true });
        const bites = bitesOf(fx);
        const band = byName(fx, 'waterdress:band');
        const waters = undecked(areaData.waters);
        // the band's actual vertices, so the lips checked are the ones drawn
        const grid = new Map();
        const key = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
        for (const p of worldPoints(band)) {
          const k = key(p.x, p.z);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(p);
        }
        const drawn = (x, z) => {
          const gx = Math.round(x * 50), gz = Math.round(z * 50);
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            for (const q of grid.get(`${gx + i},${gz + j}`) ?? []) if (Math.hypot(q.x - x, q.z - z) < 1e-4) return true;
          }
          return false;
        };
        const bitten = new Set(bites.map((b) => b.water));
        for (const w of STREAMS[id]) expect(bitten.has(w), `${id} ${w}`).toBe(true);
        for (const b of bites) {
          expect(b.maxBite).toBeLessThanOrEqual(BITE_MAX + 1e-9);
          for (const p of b.samples) {
            if (p.bite <= 0.15) continue;
            const wob = bankWobble(b.seed, p.s, b.period);
            const lx = p.x + p.nx * wob, lz = p.z + p.nz * wob;
            const at = `${id} ${b.water} lip at ${lx.toFixed(2)},${lz.toFixed(2)}`;
            lips[id]++;
            expect(drawn(lx, lz), at).toBe(true);
            expect(waterClearance(waters, lx, lz), at).toBeLessThan(0);
            // the bitten point is the true shore moved bite metres into the water
            expect(Math.hypot(p.x - (p.x0 - p.nx0 * p.bite), p.z - (p.z0 - p.nz0 * p.bite))).toBeLessThan(1e-9);
            expect(p.nx * p.nx0 + p.nz * p.nz0).toBeGreaterThan(0.5);
          }
          const span = b.samples[b.samples.length - 1].s - b.samples[0].s;
          if (span >= 20) {
            varied[id]++;
            const vals = b.samples.map((p) => p.bite);
            expect(Math.max(...vals) - Math.min(...vals), `${id} ${b.water} span ${span.toFixed(1)}`).toBeGreaterThanOrEqual(0.4);
          }
        }
      }
      for (const id of STREAM_AREAS) {
        expect(lips[id], `${id} lips checked`).toBeGreaterThan(20);
        expect(varied[id], `${id} chains checked for variation`).toBeGreaterThan(0);
      }
    }, 120_000);

    it('in production the band keeps only { water, maxBite } per bitten run', () => {
      const bites = bitesOf(dressOnGround('woods').fx);
      expect(bites.length).toBeGreaterThan(0);
      for (const b of bites) expect(Object.keys(b).sort()).toEqual(['maxBite', 'water']);
      const dbg = bitesOf(dressOnGround('woods', { debug: true }).fx);
      expect(dbg[0].samples.length).toBeGreaterThan(0);
    }, 120_000);

    it('the bite tapers to nothing at the edge of the drawn box (bounds + 10 m)', () => {
      let n = 0;
      for (const id of STREAM_AREAS) {
        const { fx, areaData } = dressOnGround(id, { debug: true });
        const b = areaData.bounds;
        const box = { minX: b.minX - 10, maxX: b.maxX + 10, minZ: b.minZ - 10, maxZ: b.maxZ + 10 };
        for (const r of bitesOf(fx)) {
          for (const p of r.samples) {
            const d = Math.min(p.x0 - box.minX, box.maxX - p.x0, p.z0 - box.minZ, box.maxZ - p.z0);
            if (d > 0.3) continue;
            n++;
            expect(p.bite, `${id} ${r.water} ${p.x0.toFixed(2)},${p.z0.toFixed(2)}`).toBeLessThanOrEqual(0.05);
          }
        }
      }
      expect(n).toBeGreaterThan(0);
    }, 120_000);

    it('the bite tapers to nothing at open ends, by decks and by the fillet', () => {
      let ends = 0, decks = 0, corner = 0;
      for (const id of BITTEN_AREAS) {
        const { fx, areaData } = dressOnGround(id, { debug: true });
        const fillets = BANK_FILLETS[id] ?? [];
        for (const b of bitesOf(fx)) {
          for (const p of b.samples) {
            const at = `${id} ${b.water} ${p.x0.toFixed(2)},${p.z0.toFixed(2)}`;
            if (!b.closed && Math.min(p.s, b.length - p.s) <= 0.3) { ends++; expect(p.bite, at).toBeLessThanOrEqual(0.05); }
            if (deckDistance(areaData.waters, p.x0, p.z0) < 1) { decks++; expect(p.bite, at).toBe(0); }
            for (const f of fillets) {
              if (Math.hypot(p.x0 - f.x, p.z0 - f.z) < 2 * f.r) { corner++; expect(p.bite, at).toBe(0); }
            }
          }
        }
      }
      expect(ends).toBeGreaterThan(0);
      expect(decks).toBeGreaterThan(0);
      expect(corner).toBeGreaterThan(0);
    }, 120_000);

    it('fish leap only well past the deepest bite', () => {
      for (const id of [...STREAM_AREAS, 'park']) {
        const { areaData } = area(id);
        const spots = fishSpots(id, areaData);
        expect(spots.length, id).toBeGreaterThan(0);
        for (const f of spots) {
          expect(waterClearance(areaData.waters, f.x, f.z), `${id} ${f.x},${f.z}`).toBeLessThan(-(BITE_MAX + 1));
        }
      }
    }, 120_000);

    it('waterdress:fill shares the ground material, on every tier, and dispose leaves it', () => {
      const tris = {};
      for (const id of STREAM_AREAS) {
        const { fx, ground, scene } = dressOnGround(id);
        const fill = byName(fx, 'waterdress:fill');
        expect(fill, id).toBeTruthy();
        expect(fill.material).toBe(ground.material);
        expect(fill.userData.sharedMaterial).toBe(true);
        expect(fill.castShadow).toBe(false);
        expect(fill.userData.noCast).toBe(true);
        expect(fx.meshes.length).toBeLessThanOrEqual(3);
        expect(fx.meshes.reduce((n, m) => n + triangles(m), 0)).toBeLessThanOrEqual(12_000);
        tris[id] = triangles(fill);
        // every face looks up
        const pos = fill.geometry.getAttribute('position');
        const idx = fill.geometry.index;
        for (let t = 0; t < idx.count; t += 3) {
          const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
          const abx = pos.getX(b) - pos.getX(a), abz = pos.getZ(b) - pos.getZ(a);
          const acx = pos.getX(c) - pos.getX(a), acz = pos.getZ(c) - pos.getZ(a);
          expect(abz * acx - abx * acz, `${id} tri ${t / 3}`).toBeGreaterThanOrEqual(0);
        }
        const spy = vi.spyOn(ground.material, 'dispose');
        fx.dispose();
        expect(spy).not.toHaveBeenCalled();
        expect(scene.children).toEqual([ground]);
        spy.mockRestore();
        const low = dressOnGround(id, { tier: LOW }).fx;
        expect(low.meshes.map((m) => m.name), id).toEqual(['waterdress:band', 'waterdress:fill']);
      }
      console.log('waterdress:fill triangles', JSON.stringify(tris));
    }, 120_000);

    it('every fill vertex rides FILL_LIFT over its own water, for every dressed area with a fill', () => {
      expect(FILL_LIFT).toBeGreaterThanOrEqual(0.01);
      for (const id of ['woods', 'river', 'moor', 'pines', 'park', 'gorge']) {
        const { fx, areaData } = dressOnGround(id, { debug: true });
        const fill = byName(fx, 'waterdress:fill');
        expect(fill, id).toBeTruthy();
        const pts = worldPoints(fill);
        expect(pts.length, id).toBeGreaterThan(0);
        const key = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
        const at = new Map();
        for (const q of pts) {
          const k = key(q.x, q.z);
          if (!at.has(k)) at.set(k, []);
          at.get(k).push(q.y);
        }
        // each bite strip: its water's own height, at the bitten point of every bitten sample
        let strips = 0;
        for (const b of bitesOf(fx)) {
          const h = areaData.waterFx.find((w) => w.footprint.id === b.water);
          const own = (h.y ?? 0.03) + FILL_LIFT;
          expect(b.fillY, `${id} ${b.water}`).toBeCloseTo(own, 6);
          for (const p of b.samples) {
            if (!(p.bite > 0)) continue;
            strips++;
            const bx = p.x0 - p.nx0 * p.bite, bz = p.z0 - p.nz0 * p.bite;
            const ys = at.get(key(bx, bz)) ?? [];
            // alone in its footprint: exactly its own water's height; where another
            // water is within reach of the strip (a junction), at least that, and
            // at least over every water holding the bitten point
            const near = areaData.waterFx.filter((w) => w !== h && [[bx, bz], [p.x0, p.z0]].some(([x, z]) => waterGap(w.footprint, x, z) < 0.2));
            const want = Math.max(own, ...areaData.waterFx.filter((w) => waterGap(w.footprint, bx, bz) < 0).map((w) => (w.y ?? 0.03) + FILL_LIFT));
            const label = `${id} ${b.water} ${p.x.toFixed(2)},${p.z.toFixed(2)}`;
            if (near.length === 0) expect(ys.some((y) => Math.abs(y - own) < 1e-6), label).toBe(true);
            else expect(ys.some((y) => y >= want - 1e-6), label).toBe(true);
          }
        }
        expect(strips, id).toBeGreaterThan(0);
        // no overlapped water pokes through: the fill is at least FILL_LIFT over every
        // water whose footprint holds the vertex (a strip vertex that a bank pushes into
        // a LOWER neighbouring water may sit higher than that water + the lift: it is
        // land there, and covers it)
        for (const q of pts) {
          for (const h of areaData.waterFx) {
            if (waterGap(h.footprint, q.x, q.z) >= 0) continue;
            expect(q.y, `${id} ${h.footprint.id} under fill at ${q.x.toFixed(2)},${q.z.toFixed(2)}`).toBeGreaterThanOrEqual((h.y ?? 0.03) + FILL_LIFT - 1e-6);
          }
        }
      }
    }, 120_000);

    it('a ray just inside the fill\'s water edge meets the band on or over the fill, never under it', () => {
      const checked = {};
      const under = [];
      for (const id of ['woods', 'river', 'moor', 'park', 'gorge']) {
        const { fx } = dressOnGround(id, { debug: true });
        const bandY = topY(byName(fx, 'waterdress:band'));
        const fillY = topY(byName(fx, 'waterdress:fill'));
        checked[id] = 0;
        for (const b of bitesOf(fx)) {
          const ss = b.samples;
          const n = ss.length;
          for (let i = 0; i < n; i++) {
            const p = ss[i];
            if (!(p.bite > 0.05)) continue;
            // the bitten point (the fill's water edge) and the mid-spans either side
            const at = [[p.x, p.z]];
            for (const q of [ss[i - 1] ?? (b.closed ? ss[n - 1] : null), ss[i + 1] ?? (b.closed ? ss[0] : null)]) {
              if (q) at.push([(p.x + q.x) / 2, (p.z + q.z) / 2]);
            }
            for (const [x, z] of at) {
              // 5..20 mm inside the fill, onto the land
              for (const f of [0.005, 0.01, 0.02]) {
                const rx = x + p.nx0 * f, rz = z + p.nz0 * f;
                const fy = fillY(rx, rz), by = bandY(rx, rz);
                if (fy === null || by === null) continue;
                checked[id]++;
                if (by < fy - 1e-6) under.push(`${id} ${b.water} ${rx.toFixed(3)},${rz.toFixed(3)} ${((fy - by) * 1000).toFixed(2)} mm`);
              }
            }
          }
        }
      }
      const perArea = Object.fromEntries(Object.keys(checked).map((id) => [id, under.filter((u) => u.startsWith(`${id} `)).length]));
      console.log('band-over-fill rays', JSON.stringify(checked), 'under', JSON.stringify(perArea));
      expect(under.slice(0, 10), `${under.length} rays meet the band under the fill`).toEqual([]);
      for (const [id, k] of Object.entries(checked)) expect(k, id).toBeGreaterThan(100);
    }, 120_000);

    it('Moor: the fill and band triangle counts are unchanged by the lift', () => {
      const { fx } = dressOnGround('moor');
      expect(triangles(byName(fx, 'waterdress:fill'))).toBe(724);
      expect(triangles(byName(fx, 'waterdress:band'))).toBe(5422);
      expect(triangles(byName(fx, 'waterdress:stones'))).toBe(1764);
    }, 120_000);

    it('Park pond: triangle counts are unchanged by the lift and the fill rides pond y + FILL_LIFT', () => {
      const { fx, areaData } = dressOnGround('park');
      expect(triangles(byName(fx, 'waterdress:fill'))).toBe(128);
      expect(triangles(byName(fx, 'waterdress:band'))).toBe(640);
      expect(triangles(byName(fx, 'waterdress:stones'))).toBe(507);
      const pond = areaData.waterFx.find((h) => h.footprint.id === 'pond');
      for (const q of worldPoints(byName(fx, 'waterdress:fill'))) expect(q.y).toBeCloseTo((pond.y ?? 0.03) + FILL_LIFT, 6);
    }, 120_000);

    it('the fill covers the bitten strip', () => {
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      for (const id of BITTEN_AREAS) {
        const { fx } = dressOnGround(id, { debug: true });
        const fill = byName(fx, 'waterdress:fill');
        let hit = 0;
        for (const b of bitesOf(fx)) {
          // (not a run's end sample: its ray would graze the strip's end edge;
          // the Gorge samples every 3 m, so every one of its samples is tried)
          const every = id === 'gorge' ? 1 : 5;
          for (const p of b.samples.filter((q, i, ss) => i % every === 2 % every && (b.closed || (i > 0 && i < ss.length - 1)) && q.bite > 0.2)) {
            // halfway between the true shore and the bitten line
            ray.set(new THREE.Vector3(p.x0 - p.nx0 * p.bite * 0.5, 5, p.z0 - p.nz0 * p.bite * 0.5), down);
            expect(ray.intersectObject(fill).length, `${id} ${b.water}`).toBeGreaterThan(0);
            hit++;
          }
        }
        expect(hit, id).toBeGreaterThan(10);
      }
    }, 120_000);

    it('on ground, a stream band foam is wet mud, at every time of day', () => {
      for (const evening of [null, 'sunset', 'dusk']) {
        const { fx } = dressOnGround('woods', { evening });
        const g = byName(fx, 'waterdress:band').geometry;
        const col = g.getAttribute('color'), foam = g.getAttribute('aFoam');
        const mud = new THREE.Color(0x4a4330);
        let n = 0;
        for (let i = 0; i < foam.count; i++) {
          if (foam.getX(i) !== 1 || col.getW(i) === 0) continue;
          if (Math.abs(col.getX(i) - mud.r) < 1e-6 && Math.abs(col.getY(i) - mud.g) < 1e-6 && Math.abs(col.getZ(i) - mud.b) < 1e-6) {
            n++;
            expect(col.getW(i)).toBeCloseTo(0.5 * 0.6, 6);
          }
        }
        expect(n, String(evening)).toBeGreaterThan(50);
      }
    }, 120_000);

    it('leaves the gameplay water data untouched', () => {
      for (const id of BITTEN_AREAS) {
        const { areaData } = area(id);
        const before = JSON.stringify(areaData.waters);
        const fxBefore = JSON.stringify(areaData.waterFx.map((h) => h.footprint));
        dressOnGround(id).fx.dispose();
        expect(JSON.stringify(areaData.waters)).toBe(before);
        expect(JSON.stringify(areaData.waterFx.map((h) => h.footprint))).toBe(fxBefore);
      }
    }, 120_000);
  });

  // --- polish-streams Task 2: mid-stream stones, riffles, a quieter rim -----

  describe('riffles', () => {
    const STREAM_AREAS = ['woods', 'river', 'moor', 'pines'];
    const STREAMS = {
      woods: ['river-west', 'river-north'],
      river: ['river-west', 'river-bend', 'river-east'],
      moor: ['river-south', 'river-west', 'river-mouth'],
      pines: ['mire-north', 'mire-west'],
      gorge: ['stream'],
    };
    const BITTEN_AREAS = [...STREAM_AREAS, 'gorge'];
    const LIP = 0.004;

    it('every stream area gets riffle stones well inside the water, clear of decks, just breaking the surface', () => {
      const counts = {};
      for (const id of STREAM_AREAS) {
        const { fx, areaData } = dressOnGround(id);
        const stones = byName(fx, 'waterdress:stones');
        expect(stones, id).toBeTruthy();
        const riffles = stones.userData.riffles;
        expect(riffles.length, id).toBeGreaterThanOrEqual(3);
        const waters = undecked(areaData.waters);
        const b = areaData.bounds;
        for (const s of riffles) {
          const at = `${id} riffle at ${s.x.toFixed(2)},${s.z.toFixed(2)}`;
          expect(STREAMS[id], at).toContain(s.water);
          expect(waterClearance(waters, s.x, s.z), at).toBeLessThan(-(BITE_MAX + 0.3));
          expect(deckDistance(areaData.waters, s.x, s.z), at).toBeGreaterThanOrEqual(2.5);
          expect(s.x, at).toBeGreaterThanOrEqual(b.minX - 10);
          expect(s.x, at).toBeLessThanOrEqual(b.maxX + 10);
          expect(s.z, at).toBeGreaterThanOrEqual(b.minZ - 10);
          expect(s.z, at).toBeLessThanOrEqual(b.maxZ + 10);
          expect(s.r, at).toBeGreaterThanOrEqual(0.12);
          expect(s.r, at).toBeLessThanOrEqual(0.26);
          const hy = areaData.waterFx.find((h) => h.footprint.id === s.water).y;
          const top = s.y + 0.6 * s.r - hy;
          expect(top, at).toBeGreaterThanOrEqual(0.02);
          expect(top, at).toBeLessThanOrEqual(0.12);
        }
        // the riffle stones are drawn: a stones vertex near each one's top
        // (a squashed dodecahedron's top vertex sits at 0.93 of its 0.6 r)
        const pts = worldPoints(stones);
        for (const s of riffles) {
          const top = pts.some((p) => Math.hypot(p.x - s.x, p.z - s.z) <= s.r * 1.2
            && p.y >= s.y + 0.5 * s.r && p.y <= s.y + 0.6 * s.r + 1e-6);
          expect(top, `${id} riffle at ${s.x.toFixed(2)},${s.z.toFixed(2)}`).toBe(true);
        }
        counts[id] = { riffles: riffles.length, stonesTris: triangles(stones) };
      }
      console.log('riffles / stones triangles', JSON.stringify(counts));
    }, 120_000);

    it('each riffle stone trails one or two foam streaks on the water', () => {
      for (const id of STREAM_AREAS) {
        const { fx, areaData } = dressOnGround(id);
        const riffles = byName(fx, 'waterdress:stones').userData.riffles;
        const band = byName(fx, 'waterdress:band');
        const g = band.geometry;
        const pos = g.getAttribute('position'), foam = g.getAttribute('aFoam'), col = g.getAttribute('color');
        const streaks = band.userData.streaks;
        expect(streaks.length, id).toBeGreaterThanOrEqual(riffles.length);
        riffles.forEach((s, i) => {
          const mine = streaks.filter((k) => k.stone === i);
          expect(mine.length, `${id} stone ${i}`).toBeGreaterThanOrEqual(1);
          expect(mine.length, `${id} stone ${i}`).toBeLessThanOrEqual(2);
          const hy = areaData.waterFx.find((h) => h.footprint.id === s.water).y;
          for (const { verts: [v0, n] } of mine) {
            expect(n).toBe(9);
            let alpha = 0;
            for (let v = v0; v < v0 + n; v++) {
              const at = `${id} stone ${i} vert ${v}`;
              expect(foam.getX(v), at).toBe(1);
              expect(pos.getY(v), at).toBeCloseTo(hy + LIP, 6);
              expect(Math.hypot(pos.getX(v) - s.x, pos.getZ(v) - s.z), at).toBeLessThanOrEqual(1.2);
              alpha = Math.max(alpha, col.getW(v));
            }
            expect(alpha).toBeGreaterThan(0.1);
          }
        });
      }
    }, 120_000);

    it('foam streaks stay on the water, never over a bitten bank', () => {
      for (const id of BITTEN_AREAS) {
        const { fx, areaData } = dressOnGround(id);
        const band = byName(fx, 'waterdress:band');
        const pos = band.geometry.getAttribute('position');
        const waters = undecked(areaData.waters);
        // past the deepest bite drawn here (the Gorge's is scaled to half)
        const deepest = Math.max(...(band.userData.bites ?? []).map((q) => q.maxBite));
        expect(deepest, id).toBeLessThanOrEqual(BITE_MAX + 1e-9);
        let n = 0;
        for (const { verts: [v0, k] } of band.userData.streaks) {
          for (let v = v0; v < v0 + k; v++) {
            n++;
            expect(waterClearance(waters, pos.getX(v), pos.getZ(v)), `${id} streak vert ${pos.getX(v).toFixed(2)},${pos.getZ(v).toFixed(2)}`)
              .toBeLessThan(-deepest);
          }
        }
        expect(n, id).toBeGreaterThan(0);
      }
    }, 120_000);

    it('LOW tier: no riffle stones and no streaks', () => {
      for (const id of STREAM_AREAS) {
        const hi = byName(dressOnGround(id).fx, 'waterdress:band');
        const { fx } = dressOnGround(id, { tier: LOW });
        expect(byName(fx, 'waterdress:stones')).toBeUndefined();
        const lo = byName(fx, 'waterdress:band');
        expect(lo.userData.streaks ?? []).toEqual([]);
        const streakVerts = hi.userData.streaks.reduce((k, s) => k + s.verts[1], 0);
        expect(lo.geometry.getAttribute('position').count).toBe(hi.geometry.getAttribute('position').count - streakVerts);
      }
    }, 120_000);

    it('streams wear a quiet foam rim in their water ramp (foamStrength <= 0.1)', async () => {
      const { readFileSync } = await import('node:fs');
      for (const id of STREAM_AREAS) {
        const src = readFileSync(new URL(`../src/world/${id}.js`, import.meta.url), 'utf8');
        const look = src.slice(src.indexOf('const WATER_LOOK'));
        for (const wid of STREAMS[id]) {
          const m = look.match(new RegExp(`'${wid}': \\{[^}]*foamStrength: ([0-9.]+)`));
          expect(m, `${id} ${wid}`).toBeTruthy();
          expect(Number(m[1]), `${id} ${wid}`).toBeLessThanOrEqual(0.1);
        }
      }
    });
  });
  // --- polish-streams Task 3: the Park pond ---------------------------------

  // --- polish-pondrims Task 4: the Gorge stream ------------------------------

  describe('the gorge stream', () => {
    const DECK = { minX: -10.5, maxX: -7, minZ: -11.75, maxZ: -10.25 };
    const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));

    it('the Gorge stream is bitten on both banks, with stones and riffles, off the stepping stones', async () => {
      const { GORGE_KEEP_CLEAR } = await import('../src/world/gorge.js');
      const keepOut = GORGE_KEEP_CLEAR.map(([x, z]) => ({ x, z, r: 0.6 }));
      const { fx, areaData } = dressOnGround('gorge', { keepOut });
      const bites = (byName(fx, 'waterdress:band').userData.bites ?? []).filter((b) => b.water === 'stream');
      expect(bites).toHaveLength(2);
      // the stream is only 1.5 m wide: the two bites never close it
      for (const b of bites) {
        expect(b.maxBite).toBeGreaterThanOrEqual(BITE_MIN);
        expect(b.maxBite).toBeLessThanOrEqual(BITE_MAX * 0.5 + 1e-9);
      }
      const stones = byName(fx, 'waterdress:stones');
      expect(stones).toBeTruthy();
      const { centres, riffles } = stones.userData;
      expect(riffles.length).toBeGreaterThanOrEqual(2);
      expect(centres.length).toBeGreaterThan(0);
      const waters = undecked(areaData.waters);
      for (const s of [...centres, ...riffles]) {
        const at = `gorge stone at ${s.x.toFixed(2)},${s.z.toFixed(2)}`;
        expect(rectDist(DECK, s.x, s.z), at).toBeGreaterThanOrEqual(1.5);
        expect(waterClearance(waters, s.x, s.z), at).toBeGreaterThanOrEqual(-BITE_MAX);
        expect(s.x, at).toBeGreaterThanOrEqual(-13);
        expect(s.x, at).toBeLessThanOrEqual(-4);
        for (const k of keepOut) expect(Math.hypot(s.x - k.x, s.z - k.z), at).toBeGreaterThanOrEqual(k.r + 0.5);
      }
      // riffle stones sit in the open water between the two bitten banks
      for (const s of riffles) expect(s.water).toBe('stream');
    }, 120_000);

    it('the Gorge dressing adds at most 600 triangles', () => {
      const { fx } = dressOnGround('gorge');
      expect(fx.meshes.map((m) => m.name).sort()).toEqual(['waterdress:band', 'waterdress:fill', 'waterdress:stones']);
      const per = Object.fromEntries(fx.meshes.map((m) => [m.name, triangles(m)]));
      const sum = Object.values(per).reduce((a, b) => a + b, 0);
      console.log('gorge waterdress triangles', JSON.stringify(per), sum);
      expect(sum).toBeLessThanOrEqual(600);
    }, 120_000);

    it('finds the Gorge groundPlane in the built scene itself (the trimmed grid still fills)', () => {
      const { scene, areaData } = area('gorge');
      const before = scene.children.length;
      const fx = createWaterDressing(scene, { areaId: 'gorge', areaData, tier: HIGH });
      try {
        const fill = byName(fx, 'waterdress:fill');
        expect(fill).toBeTruthy();
        expect(fill.material).toBe(scene.getObjectByName('groundPlane').material);
      } finally {
        fx.dispose();
      }
      expect(scene.children).toHaveLength(before);
    }, 120_000);
  });

  describe('the park pond', () => {
    const C = { x: -14, z: 2 };
    const deg = (x, z) => ((Math.atan2(z - C.z, x - C.x) * 180) / Math.PI + 360) % 360;
    // distance from (x, z) to the segment a -> b
    const segDist = (x, z, a, b) => {
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    };

    it('on ground: band, fill and stones, under 3,000 triangles together', () => {
      const { fx } = dressOnGround('park');
      expect(fx.meshes.map((m) => m.name)).toEqual(['waterdress:band', 'waterdress:fill', 'waterdress:stones']);
      const tris = Object.fromEntries(fx.meshes.map((m) => [m.name, triangles(m)]));
      console.log('park dressing triangles', JSON.stringify(tris));
      expect(Object.values(tris).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(3000);
      for (const m of fx.meshes) {
        expect(m.castShadow).toBe(false);
        expect(m.userData.noCast).toBe(true);
      }
    }, 120_000);

    it('reeds stand in clumps on the south arcs, clear of the north shore and the duck parade', () => {
      const { fx } = dressOnGround('park');
      const reeds = byName(fx, 'waterdress:stones').userData.reeds;
      expect(reeds.length).toBeGreaterThanOrEqual(10);
      expect(reeds.length).toBeLessThanOrEqual(24);
      for (const r of reeds) {
        const at = `reed at ${r.x.toFixed(2)},${r.z.toFixed(2)}`;
        const a = deg(r.x, r.z);
        expect((a >= 200 && a <= 250) || (a >= 290 && a <= 340), `${at} angle ${a.toFixed(1)}`).toBe(true);
        const d = Math.hypot(r.x - C.x, r.z - C.z);
        expect(d, at).toBeGreaterThanOrEqual(6.2);
        expect(d, at).toBeLessThanOrEqual(7.3);
        expect(Math.hypot(r.x + 14, r.z - 10), at).toBeGreaterThanOrEqual(3);
        expect(Math.hypot(r.x + 14, r.z - 11), at).toBeGreaterThanOrEqual(3);
        expect(segDist(r.x, r.z, C, { x: -8, z: 8 }), at).toBeGreaterThanOrEqual(3);
      }
    }, 120_000);

    it('lily pads float well inside the water, away from the fish', () => {
      const { fx, areaData } = dressOnGround('park');
      const lilies = byName(fx, 'waterdress:stones').userData.lilies;
      expect(lilies.length).toBeGreaterThanOrEqual(5);
      expect(lilies.length).toBeLessThanOrEqual(9);
      const fish = fishSpots('park', areaData);
      expect(fish.length).toBeGreaterThan(0);
      for (const l of lilies) {
        const at = `lily at ${l.x.toFixed(2)},${l.z.toFixed(2)}`;
        expect(waterClearance(areaData.waters, l.x, l.z), at).toBeLessThanOrEqual(-(0.9 + l.r));
        for (const f of fish) expect(Math.hypot(l.x - f.x, l.z - f.z), at).toBeGreaterThanOrEqual(1);
      }
    }, 120_000);

    it('the pond gets rim stones', () => {
      const { fx } = dressOnGround('park');
      const u = byName(fx, 'waterdress:stones').userData;
      const near = u.centres.filter((c) => Math.hypot(c.x - C.x, c.z - C.z) <= 8.5);
      expect(near.length).toBeGreaterThanOrEqual(4);
      console.log('park pond plants', JSON.stringify({ reeds: u.reeds.length, lilies: u.lilies.length, rimStones: near.length }));
    }, 120_000);

    it('the pond wears a soft foam line, not a pale rim', () => {
      for (const evening of [null, 'sunset', 'dusk']) {
        const { fx } = dressOnGround('park', { evening });
        const g = byName(fx, 'waterdress:band').geometry;
        const pos = g.getAttribute('position'), col = g.getAttribute('color'), foam = g.getAttribute('aFoam');
        let n = 0;
        const soft = new THREE.Color(0xcfe0e4);
        for (let i = 0; i < foam.count; i++) {
          if (foam.getX(i) !== 1) continue;
          if (Math.hypot(pos.getX(i) - C.x, pos.getZ(i) - C.z) > 9) continue;
          n++;
          expect(col.getW(i), `${evening} v${i}`).toBeLessThanOrEqual(0.5 * 0.45 + 1e-6);
          if (evening === null) {
            expect(col.getX(i)).toBeCloseTo(soft.r, 6);
            expect(col.getY(i)).toBeCloseTo(soft.g, 6);
            expect(col.getZ(i)).toBeCloseTo(soft.b, 6);
          }
        }
        expect(n, String(evening)).toBeGreaterThan(50);
      }
    }, 120_000);

    it('LOW tier: band and fill only', () => {
      const { fx } = dressOnGround('park', { tier: LOW });
      expect(fx.meshes.map((m) => m.name)).toEqual(['waterdress:band', 'waterdress:fill']);
    }, 120_000);

    it('the stones material is two-sided, flat-shaded and vertex-coloured', () => {
      const mat = byName(dressOnGround('park').fx, 'waterdress:stones').material;
      expect(mat.side).toBe(THREE.DoubleSide);
      expect(mat.flatShading).toBe(true);
      expect(mat.vertexColors).toBe(true);
    }, 120_000);

    it('leaves the park water data untouched', () => {
      const { areaData } = area('park');
      const before = JSON.stringify(areaData.waters);
      dressOnGround('park').fx.dispose();
      expect(JSON.stringify(areaData.waters)).toBe(before);
    }, 120_000);
  });
});
