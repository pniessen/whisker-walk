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

const { createWaterDressing, bankWobble, DRESSED_AREAS, BANK_FILLETS } = await import('../src/render/waterdress.js');
const { tintDuskLawn, duskLook } = await import('../src/render/dusk.js');
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
  const CORNER = { x: 23, z: -9 };
  const CENTRE = { x: 21.4, z: -10.6 };
  const inCell = (p, e = 1e-6) => p.x >= 21.4 - e && p.x <= 23 + e && p.z >= -10.6 - e && p.z <= -9 + e;

  it('BANK_FILLETS names the Woods bend, frozen', () => {
    expect(BANK_FILLETS).toEqual({ woods: [{ x: 23, z: -9, r: 1.6, wx: -1, wz: -1 }] });
    expect(Object.isFrozen(BANK_FILLETS)).toBe(true);
    expect(Object.isFrozen(BANK_FILLETS.woods)).toBe(true);
    expect(Object.isFrozen(BANK_FILLETS.woods[0])).toBe(true);
  });

  it('the Woods stream bend has a rounded bank: no band sample of the bend lies within 0.3 m of the square corner (23, -9)', () => {
    const band = byName(dressOnGround('woods').fx, 'waterdress:band');
    const f = band.userData.fillets;
    expect(f).toHaveLength(1);
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
    const { areaData } = area('woods');
    const real = shorePieces(areaData.waters);
    for (const v of worldPoints(band)) {
      if (-waterClearance(undecked(areaData.waters), v.x, v.z) > 0.35) expect(distToPieces(real, v.x, v.z)).toBeLessThan(1.0);
    }
    // and the band's land side over the fill rides above it, not under it
    const fill = byName(dressOnGround('woods').fx, 'waterdress:fillet');
    const fy = fill.geometry.getAttribute('position').getY(0);
    for (const v of worldPoints(band)) {
      if (inCell(v) && Math.hypot(v.x - CENTRE.x, v.z - CENTRE.z) > 1.6 + 1e-3) expect(v.y, `${v.x},${v.z}`).toBeGreaterThan(fy);
    }
  }, 120_000);

  it('no ground plane, no fillet: the band keeps its square corner', () => {
    const { fx } = dress('woods');
    expect(byName(fx, 'waterdress:fillet')).toBeUndefined();
    expect(byName(fx, 'waterdress:band').userData.fillets).toBeUndefined();
  }, 120_000);

  it('the fillet fan covers the corner and stays inside the square r×r cell', () => {
    const { fx, areaData } = dressOnGround('woods');
    const fill = byName(fx, 'waterdress:fillet');
    expect(fill).toBeTruthy();
    expect(fx.meshes).toContain(fill);
    const pts = worldPoints(fill);
    const waterY = areaData.waterFx.find((h) => h.footprint.id === 'river-west').y;
    for (const p of pts) {
      expect(inCell(p), `${p.x},${p.z}`).toBe(true);
      expect(p.y).toBeCloseTo(waterY + 0.002, 6);
    }
    expect(triangles(fill)).toBeGreaterThanOrEqual(10);
    expect(triangles(fill)).toBeLessThanOrEqual(16);
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
    const fill = byName(fx, 'waterdress:fillet');
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

  it('at dusk the fillet takes the tinted lawn: its material and its vertex colours', () => {
    const { areaData } = area('woods');
    const g = groundOf('woods').clone();
    g.geometry = g.geometry.clone();
    const tint = tintDuskLawn({ ground: [g], grass: null, look: duskLook(areaData) });
    const { fx } = dressOnGround('woods', { evening: 'dusk' }, g);
    const fill = byName(fx, 'waterdress:fillet');
    expect(fill.material).toBe(g.material);
    const col = fill.geometry.getAttribute('color');
    const gc = g.geometry.getAttribute('color');
    const { width, widthSegments: ws, heightSegments: hs } = g.geometry.parameters;
    const pos = fill.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
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
    expect(fx.meshes.map((m) => m.name)).toEqual(['waterdress:band', 'waterdress:fillet']);
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

  it("other areas' bands are unchanged", () => {
    for (const id of ['river', 'moor', 'pines', 'seaside']) {
      const { fx } = dressOnGround(id);
      expect(byName(fx, 'waterdress:fillet'), id).toBeUndefined();
      const band = byName(fx, 'waterdress:band');
      sameSig(sig(band.geometry.getAttribute('position').array), BAND_SIGS[id][0], `${id} position`);
      sameSig(sig(band.geometry.getAttribute('color').array), BAND_SIGS[id][1], `${id} color`);
    }
    // and the Woods with no ground to borrow is the old band exactly
    const band = byName(dress('woods').fx, 'waterdress:band');
    sameSig(sig(band.geometry.getAttribute('position').array), BAND_SIGS.woods[0], 'woods position');
    sameSig(sig(band.geometry.getAttribute('color').array), BAND_SIGS.woods[1], 'woods color');
  }, 120_000);
});
