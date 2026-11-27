// Snowville round two: the detail plan's places are open ground, the drawing is deterministic and merged, the lower rungs draw less, the exposure is toned down.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/snowvilleplan.js';
import * as D from '../src/world/snowvilledetailplan.js';
import * as W from '../src/world/snowvillewingplan.js';
import { drawDetail } from '../src/world/snowvilledetail.js';
import { createKit, snowvilleMaterials } from '../src/world/snowvilleparts.js';
import { build } from '../src/world/snowville.js';
import { loadSnowvilleStages } from '../src/world/snowvillestages.js';
import { isLowTier } from '../src/world/snowvillelight.js';

await loadSnowvilleStages();
const tris = (low) => {
  const kit = createKit('t');
  drawDetail(kit, snowvilleMaterials(), { low });
  return kit.meshes().reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
};

describe('the round-two places', () => {
  const things = () => [...D.birches(), ...D.stumps(), ...D.snowmen(), D.well()];
  it('counts: ten birches, eight stumps, three snowmen, one well', () => {
    expect(D.birches().length).toBe(D.BIRCH_COUNT);
    expect(D.stumps().length).toBe(D.STUMP_COUNT);
    expect(D.snowmen().length).toBe(3);
  });
  it('every one is in bounds, clear of every collider of the place and of the sled run, and clear of the others', () => {
    const area = build(new THREE.Scene());
    const B = P.SNOWVILLE_BOUNDS;
    const own = new Set(D.detailColliders().map((c) => `${c.x},${c.z}`));
    const others = area.colliders.filter((c) => !own.has(`${c.x},${c.z}`));
    const all = things();
    all.forEach((t, i) => {
      expect(t.x > B.minX + 2 && t.x < B.maxX - 2 && t.z > B.minZ + 2 && t.z < B.maxZ - 2, JSON.stringify(t)).toBe(true);
      for (const c of others) expect(Math.hypot(t.x - c.x, t.z - c.z), `${JSON.stringify(t)} vs ${JSON.stringify(c)}`).toBeGreaterThan(c.r + 0.5);
      for (const [sx, sz] of D.SLED_KEEP) expect(Math.hypot(t.x - sx, t.z - sz), JSON.stringify(t)).toBeGreaterThan(2.5);
      all.slice(i + 1).forEach((u) => expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThan(1.2));
    });
  });
  it('the detail colliders are the same set every time (the shared stream is fixed)', () => {
    expect(JSON.stringify(D.detailColliders())).toBe(JSON.stringify(D.detailColliders()));
    expect(D.detailColliders().length).toBe(D.BIRCH_COUNT + D.STUMP_COUNT + 3 + 1);
  });
  it('the footprints run from the steps out along the door path, alternating sides, and the notices sit inside the board', () => {
    for (const c of P.COTTAGES) {
      const fp = D.footprints(c);
      expect(fp.length).toBe(D.PRINTS);
      fp.forEach((p, i) => { expect(Math.sign(p.lx)).toBe(i % 2 ? 1 : -1); if (i) expect(p.lz).toBeGreaterThan(fp[i - 1].lz); expect(p.lz).toBeGreaterThan(c.d / 2 + 0.9); });
    }
    expect(D.NOTICES.length).toBe(8);
    for (const n of D.NOTICES) { expect(Math.abs(n.x) + n.w / 2).toBeLessThan(1.1); expect(n.y - n.h / 2).toBeGreaterThan(0.86); expect(n.y + n.h / 2).toBeLessThan(2.16); }
    expect(new Set(D.NOTICES.map((n) => n.paper)).size).toBeGreaterThanOrEqual(6); // varied paper colours
    expect(new Set(D.NOTICES.map((n) => n.tilt)).size).toBeGreaterThanOrEqual(6); // and tilts
    for (const pic of ['pond', 'mitten', 'lantern', 'fish']) expect(D.NOTICES.some((n) => n.pic === pic)).toBe(true);
  });
  it('every cottage has its own shutter hue and roof board', () => {
    for (const c of P.COTTAGES) { expect(D.SHUTTER_HUE[c.id]).toBeTypeOf('number'); expect(D.ROOF_BOARD[c.id]).toBeTypeOf('number'); }
    expect(new Set(Object.values(D.SHUTTER_HUE)).size).toBe(P.COTTAGES.length);
  });
});

describe('the drawing', () => {
  it('draws the same thing twice, draws less on the lower rungs, and adds no mesh of its own', () => {
    const a = tris(false);
    expect(a).toBe(tris(false));
    expect(a).toBeGreaterThan(8000);
    expect(tris(true)).toBeLessThan(a * 0.8);
    const kit = createKit('t');
    drawDetail(kit, snowvilleMaterials());
    expect(kit.meshes().map((m) => m.name).sort()).toEqual(['t:glow', 't:paint', 't:treeBack']);
  });
  it('every piece has the same attributes (they merge) and the fine pieces do not cast', () => {
    const kit = createKit('t');
    drawDetail(kit, snowvilleMaterials());
    for (const m of kit.meshes()) {
      expect(Object.keys(m.geometry.attributes).sort()).toEqual(['color', 'normal', 'position', 'uv']);
      if (m.name === 't:treeBack') expect(m.castShadow).toBe(false);
    }
  });
  it('the built place passes its tier through: LOW draws fewer triangles than HIGH', () => {
    const count = (opts) => { const s = new THREE.Scene(); build(s, opts); let n = 0; s.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return n; };
    expect(count({ water: { quality: { name: 'low', rung: 3, shadows: true } } })).toBeLessThan(count({}));
    expect(isLowTier({ name: 'low', rung: 3, shadows: true })).toBe(true);
  });
});

describe('the exposure', () => {
  it('the sun, the sky fill and the image light are toned down so the lit snow stays under the bloom threshold, and the roof snow is cooler than the ground snow', () => {
    expect(P.SNOW_LOOK.sunIntensity).toBeLessThanOrEqual(0.7);
    expect(P.SNOW_LOOK.hemiIntensity).toBeLessThanOrEqual(0.7);
    expect(P.SNOW_LOOK.envScale).toBeLessThanOrEqual(0.55);
    const area = build(new THREE.Scene());
    expect(area.duskLight.sunIntensity).toBe(P.SNOW_LOOK.sunIntensity);
    expect(area.duskLight.envScale).toBe(P.SNOW_LOOK.envScale);
  });
  it('the wing\'s places are untouched by the detail (the plan lists are still the same)', () => {
    expect(W.wingColliders().length).toBe(8);
  });
});
