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

const { createWaterDressing, bankWobble, DRESSED_AREAS } = await import('../src/render/waterdress.js');
const { resolveQuality } = await import('../src/render/quality.js');
const HIGH = resolveQuality({ override: 'high' });
const LOW = resolveQuality({ override: 'low' });
const { shorePieces, waterClearance, deckDistance } = await import('../src/world/builder.js');
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

describe('water dressing', () => {
  it('dresses exactly the five water areas', () => {
    expect(DRESSED_AREAS).toEqual(['woods', 'river', 'moor', 'pines', 'seaside']);
  });

  it('is a no-op stub on the park, the docks and the gorge', () => {
    for (const id of ['park', 'docks', 'gorge']) {
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
        expect(m.receiveShadow).toBe(false);
      }
      tris[id] = fx.meshes.reduce((n, m) => n + triangles(m), 0);
      expect(tris[id]).toBeLessThanOrEqual(12_000);
    }
    console.log('waterdress triangles', JSON.stringify(tris));
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
});
