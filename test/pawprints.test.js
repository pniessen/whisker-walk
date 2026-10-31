import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/grass.test.js).
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
  createPawPrints, createTrail, surfaceAt, groundStrips, strideFor, printAlpha,
  SURFACES, AREA_RULES, PRINT_Y, TRACK_HALF_WIDTH,
} = await import('../src/render/pawprints.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildSeaside, SPAWN: SEASIDE_SPAWN } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { assignShadowCasters } = await import('../src/render/rig.js');
const { LADDER } = await import('../src/render/quality.js');
const { inWater } = await import('../src/world/builder.js');

const BUILDS = { park: buildPark, neighborhood: buildNeighborhood, seaside: buildSeaside, docks: buildDocks };

// walk.js's order: build, contact shadows, merge, casters, THEN prints.
function walkScene(areaId) {
  const scene = new THREE.Scene();
  const areaData = BUILDS[areaId](scene);
  createContactShadows(scene);
  mergeStaticProps(scene);
  assignShadowCasters(scene);
  return { scene, areaData };
}

// Walk a straight line at `speed` m/s, 60 fps, calling step/update each frame.
function walkLine(fn, { from, dir, metres, speed = 3, grounded = true }) {
  const dt = 1 / 60;
  const out = [];
  const n = Math.ceil(metres / (speed * dt));
  for (let i = 0; i <= n; i++) {
    const d = Math.min(metres, i * speed * dt);
    const r = fn(from.x + dir.x * d, from.z + dir.z * d, grounded, dt);
    if (r) out.push(r);
  }
  return out;
}

describe('paw print gait', () => {
  it('stride grows with speed and stays in a sane range', () => {
    expect(strideFor(0)).toBeGreaterThanOrEqual(0.24);
    expect(strideFor(2)).toBeLessThan(strideFor(5));
    expect(strideFor(100)).toBeLessThanOrEqual(0.6);
  });

  it('lays alternating left/right prints, one per stride, beside the line of travel', () => {
    const trail = createTrail();
    const prints = walkLine(trail.step, { from: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, metres: 10, speed: 3 });
    // ~0.4m stride at 3 m/s: about 25 prints over 10m.
    expect(prints.length).toBeGreaterThan(15);
    expect(prints.length).toBeLessThan(40);
    for (let i = 1; i < prints.length; i++) {
      expect(prints[i].side).toBe(-prints[i - 1].side);
      const gap = prints[i].z - prints[i - 1].z;
      expect(gap).toBeGreaterThan(0.2);
      expect(gap).toBeLessThan(0.7);
    }
    for (const p of prints) {
      // Walking +Z, the two tracks sit either side of x 0, narrowly.
      expect(Math.abs(p.x)).toBeGreaterThan(0.02);
      expect(Math.abs(p.x)).toBeLessThan(TRACK_HALF_WIDTH * 1.3);
      // Toes point along travel (+Z => yaw ~0), with only a little splay.
      expect(Math.abs(p.yaw)).toBeLessThan(0.3);
    }
    // Left prints and right prints are on opposite sides.
    const left = prints.filter((p) => p.side < 0).map((p) => Math.sign(p.x));
    const right = prints.filter((p) => p.side > 0).map((p) => Math.sign(p.x));
    expect(new Set(left).size).toBe(1);
    expect(new Set(right).size).toBe(1);
    expect(left[0]).toBe(-right[0]);
  });

  it('heading follows the direction of travel', () => {
    const trail = createTrail();
    const prints = walkLine(trail.step, { from: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, metres: 5 });
    // Walking +X => yaw ~ +PI/2.
    for (const p of prints.slice(1)) expect(Math.abs(p.yaw - Math.PI / 2)).toBeLessThan(0.3);
  });

  it('lays nothing standing still, nothing when not grounded', () => {
    const trail = createTrail();
    for (let i = 0; i < 600; i++) expect(trail.step(3, 4, true, 1 / 60)).toBeNull();
    const air = createTrail();
    expect(walkLine(air.step, { from: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, metres: 10, grounded: false })).toHaveLength(0);
  });

  it('fills a scratch print when given one', () => {
    const a = createTrail();
    const b = createTrail();
    const out = {};
    let same = 0;
    for (let i = 0; i <= 120; i++) {
      const pa = a.step(0, i * 0.02, true, 1 / 60);
      const pb = b.step(0, i * 0.02, true, 1 / 60, out);
      expect(pb === null).toBe(pa === null);
      if (pa) { expect(pb).toBe(out); expect(pb).toEqual(pa); same++; }
    }
    expect(same).toBeGreaterThan(2);
  });

  it('lays nothing across a teleport', () => {
    const trail = createTrail();
    trail.step(0, 0, true, 1 / 60);
    expect(trail.step(0, 5, true, 1 / 60)).toBeNull();
    // ...and the next tiny step after it does not count the jump as travel.
    expect(trail.step(0, 5.01, true, 1 / 60)).toBeNull();
  });
});

describe('paw print fade', () => {
  it('holds, then fades to zero at the end of its life', () => {
    expect(printAlpha(0, 9)).toBe(1);
    expect(printAlpha(2, 9)).toBe(1);
    const mid = printAlpha(6, 9);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(printAlpha(9, 9)).toBe(0);
    expect(printAlpha(20, 9)).toBe(0);
    // Monotone.
    let prev = 1;
    for (let a = 0; a <= 9; a += 0.25) {
      const v = printAlpha(a, 9);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('a print about to be recycled has already faded out', () => {
    expect(printAlpha(0, 9, 0, 48)).toBe(1);
    expect(printAlpha(0, 9, 47, 48)).toBe(0);
    expect(printAlpha(0, 9, 44, 48)).toBeGreaterThan(0);
  });
});

describe('paw print surfaces', () => {
  it('Seaside: deep in dry sand, damp on the wet band, none on the boardwalk, pier or sea', () => {
    const { scene, areaData } = walkScene('seaside');
    const strips = groundStrips(scene);
    expect(surfaceAt('seaside', areaData, strips, SEASIDE_SPAWN.x - 6, SEASIDE_SPAWN.z)).toBe('sand');
    expect(surfaceAt('seaside', areaData, strips, 0, 0)).toBe('sand');
    expect(surfaceAt('seaside', areaData, strips, 24.5, 0)).toBe('wetSand');
    expect(surfaceAt('seaside', areaData, strips, 20, 0)).toBeNull(); // boardwalk
    expect(surfaceAt('seaside', areaData, strips, 30, -10)).toBeNull(); // pier
    expect(surfaceAt('seaside', areaData, strips, 30, 20)).toBeNull(); // sea
  });

  it('Docks: faint on the cobbles and the quays, none in the canal or on a bridge', () => {
    const { scene, areaData } = walkScene('docks');
    const strips = groundStrips(scene);
    expect(surfaceAt('docks', areaData, strips, 20, 20)).toBe('stone');
    expect(surfaceAt('docks', areaData, strips, 20, 6.5)).toBe('flagstone');
    expect(surfaceAt('docks', areaData, strips, 20, 0)).toBeNull(); // canal
    const deck = areaData.waters.flatMap((w) => w.decks ?? [])[0];
    expect(surfaceAt('docks', areaData, strips, (deck.minX + deck.maxX) / 2, (deck.minZ + deck.maxZ) / 2)).toBeNull();
    expect(SURFACES.stone.alpha).toBeLessThan(SURFACES.sand.alpha);
  });

  it('park and neighbourhood: gravel paths only, never the lawn or the sidewalk', () => {
    const park = walkScene('park');
    const ps = groundStrips(park.scene);
    expect(ps.some((s) => s.path)).toBe(true);
    expect(surfaceAt('park', park.areaData, ps, 0, 35)).toBe('gravel');
    expect(surfaceAt('park', park.areaData, ps, 20, 35)).toBeNull();
    const nb = walkScene('neighborhood');
    const ns = groundStrips(nb.scene);
    expect(surfaceAt('neighborhood', nb.areaData, ns, 0, 20)).toBe('gravel');
    expect(surfaceAt('neighborhood', nb.areaData, ns, 3.2, 20)).toBeNull(); // sidewalk
    expect(surfaceAt('neighborhood', nb.areaData, ns, 20, 20)).toBeNull(); // lawn
  });

  it('never prints in water or in a puddle, in any area', () => {
    for (const id of Object.keys(AREA_RULES)) {
      const { scene, areaData } = walkScene(id);
      const strips = groundStrips(scene);
      const b = areaData.bounds;
      for (let x = b.minX; x <= b.maxX; x += 1.7) {
        for (let z = b.minZ; z <= b.maxZ; z += 1.7) {
          if (inWater(areaData.waters, x, z)) expect(surfaceAt(id, areaData, strips, x, z)).toBeNull();
        }
      }
      for (const p of areaData.puddles ?? []) expect(surfaceAt(id, areaData, strips, p.x, p.z)).toBeNull();
    }
  });

  it('the den and unknown areas get none', () => {
    expect(surfaceAt('den', {}, [], 0, 0)).toBeNull();
  });
});

describe('createPawPrints', () => {
  it('is ONE instanced mesh that never casts, sits between the ground layers, and skips the sweeps', () => {
    const { scene, areaData } = walkScene('seaside');
    const before = scene.children.length;
    const paws = createPawPrints(scene, { areaId: 'seaside', areaData, tier: LADDER[0] });
    expect(scene.children.length).toBe(before + 1);
    const m = paws.mesh;
    expect(m.isInstancedMesh).toBe(true);
    expect(m.castShadow).toBe(false);
    expect(m.userData.pawPrints).toBe(true);
    expect(m.material.transparent).toBe(true);
    expect(m.material.depthWrite).toBe(false);
    expect(m.material.polygonOffset).toBe(true);
    expect(paws.capacity).toBe(LADDER[0].pawPrints);
    // The caster sweep leaves it alone even if run again.
    assignShadowCasters(scene);
    expect(m.castShadow).toBe(false);
    // Above the wet sand (0.008) and paths (0.01), below the decals (0.015).
    expect(PRINT_Y).toBeGreaterThan(0.01);
    expect(PRINT_Y).toBeLessThan(0.015);
  });

  it('the ring never grows past capacity on a long walk', () => {
    const { scene, areaData } = walkScene('seaside');
    const tier = LADDER[3];
    const paws = createPawPrints(scene, { areaId: 'seaside', areaData, tier });
    const geomBytes = paws.mesh.instanceMatrix.array.length;
    let laid = 0;
    const dt = 1 / 60;
    // Back and forth across dry sand for a long time.
    for (let i = 0; i < 6000; i++) {
      const z = 20 * Math.sin(i * dt * 0.2);
      if (paws.update(dt, { x: 0, z, grounded: true })) laid++;
      expect(paws.count).toBeLessThanOrEqual(tier.pawPrints);
    }
    expect(laid).toBeGreaterThan(tier.pawPrints * 2);
    expect(paws.count).toBe(tier.pawPrints);
    expect(paws.mesh.instanceMatrix.array.length).toBe(geomBytes);
    expect(scene.children.filter((c) => c.userData.pawPrints)).toHaveLength(1);
  });

  it('lays nothing when not grounded, standing still, or swimming in the sea', () => {
    const { scene, areaData } = walkScene('seaside');
    const paws = createPawPrints(scene, { areaId: 'seaside', areaData, tier: LADDER[0] });
    const up = (x, z, grounded) => paws.update(1 / 60, { x, z, grounded });
    walkLine(up, { from: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, metres: 8, grounded: false });
    for (let i = 0; i < 300; i++) up(0, 0, true);
    walkLine(up, { from: { x: 30, z: 0 }, dir: { x: 0, z: 1 }, metres: 8 }); // in the sea
    expect(paws.laid).toBe(0);
    // ...and does lay on sand.
    walkLine(up, { from: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, metres: 8 });
    expect(paws.laid).toBeGreaterThan(5);
  });

  it('lays nothing on the lawn, and prints on a park path', () => {
    const { scene, areaData } = walkScene('park');
    const paws = createPawPrints(scene, { areaId: 'park', areaData, tier: LADDER[0] });
    const up = (x, z, grounded) => paws.update(1 / 60, { x, z, grounded });
    walkLine(up, { from: { x: 20, z: 30 }, dir: { x: 0, z: 1 }, metres: 8 });
    expect(paws.laid).toBe(0);
    walkLine(up, { from: { x: 0, z: 28 }, dir: { x: 0, z: 1 }, metres: 8 });
    expect(paws.laid).toBeGreaterThan(5);
  });

  it('is a no-op stub in the den or with prints off', () => {
    const scene = new THREE.Scene();
    const den = createPawPrints(scene, { areaId: 'den', areaData: {}, tier: LADDER[0] });
    expect(den.mesh).toBeNull();
    expect(() => den.update(1 / 60, { x: 0, z: 0, grounded: true })).not.toThrow();
    const off = createPawPrints(scene, { areaId: 'seaside', areaData: {}, tier: { ...LADDER[0], pawPrints: 0 } });
    expect(off.mesh).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it('every tier has prints, the low rung fewer and shorter-lived', () => {
    for (const t of LADDER) {
      expect(t.pawPrints).toBeGreaterThan(0);
      expect(t.pawFade).toBeGreaterThanOrEqual(5);
      expect(t.pawFade).toBeLessThanOrEqual(10);
    }
    expect(LADDER[3].pawPrints).toBeLessThan(LADDER[0].pawPrints);
    expect(LADDER[3].pawFade).toBeLessThan(LADDER[0].pawFade);
  });

  it('dispose() takes the mesh out of the scene', () => {
    const { scene, areaData } = walkScene('docks');
    const paws = createPawPrints(scene, { areaId: 'docks', areaData, tier: LADDER[0] });
    expect(scene.children).toContain(paws.mesh);
    paws.dispose();
    expect(scene.children).not.toContain(paws.mesh);
  });
});
