import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const D = await import('../src/world/reefdecor.js');
const P = await import('../src/world/reefplan.js');
const { build } = await import('../src/world/reef.js');
const { decorGeometries } = await import('../src/world/reefdecorparts.js');

const FAMILIES = ['arch', 'pile', 'wood', 'fan', 'head', 'sponge', 'anem', 'grass', 'star', 'urchin', 'shell', 'dollar', 'pebble', 'ripple'];

describe('the Reef seabed decor plan', () => {
  const d = D.scatterDecor();
  it('is deterministic (the same seed, the same answer) and has every family', () => {
    const again = JSON.stringify(D.scatterDecor());
    expect(again).toBe(JSON.stringify(d));
    for (const f of FAMILIES) expect(d[f].length, f).toBeGreaterThan(1);
  });
  it('has its own salts, distinct from each other', () => {
    const v = Object.values(D.DECOR_SALT);
    expect(new Set(v).size).toBe(v.length);
    for (const old of [0x6b656c70, 0x636f7261, 0x70656262, 0x73656167, 0x77696e67, 0x676c6f77, 0x706c616e]) expect(v).not.toContain(old);
  });
  it('keeps every item in bounds and clear of colliders, finds, story places and the restricted places', () => {
    const cols = [...P.reefColliders()];
    const avoid = D.decorAvoid();
    for (const f of FAMILIES) {
      for (const it of d[f]) {
        expect(it.x, f).toBeGreaterThan(P.REEF_BOUNDS.minX + 2);
        expect(it.x, f).toBeLessThan(P.REEF_BOUNDS.maxX - 2);
        expect(it.z, f).toBeGreaterThan(P.REEF_BOUNDS.minZ + 2);
        expect(it.z, f).toBeLessThan(P.REEF_BOUNDS.maxZ - 2);
        expect(D.inRestricted(it.x, it.z), f).toBe(false);
        for (const [x, z, r] of avoid) expect(Math.hypot(it.x - x, it.z - z), `${f} at ${it.x},${it.z}`).toBeGreaterThanOrEqual(r + it.r - 1e-9);
        for (const c of cols) expect(Math.hypot(it.x - c.x, it.z - c.z), f).toBeGreaterThan(c.r + it.r);
      }
    }
  });
  it('keeps the spawn court, the ledge and the cave mouth bare', () => {
    for (const f of FAMILIES) for (const it of d[f]) {
      expect(Math.hypot(it.x - P.REEF_SPAWN.x, it.z - P.REEF_SPAWN.z), f).toBeGreaterThan(7);
      expect(Math.hypot(it.x - 17.2, it.z - 1.6), f).toBeGreaterThan(3.8);
      expect(Math.hypot(it.x - 26, it.z + 18.2), f).toBeGreaterThan(3);
    }
  });
  it('is clumped: seagrass beds hold many tufts and the sand patches are soft', () => {
    expect(d.grassPatches.length).toBeGreaterThan(20);
    const t = D.scatterTufts();
    expect(t.length).toBeGreaterThan(300);
    const half = t.filter((k) => !k.half).length;
    expect(half).toBeGreaterThan(t.length * 0.4);
    expect(half).toBeLessThan(t.length * 0.6);
    for (const k of t) for (const c of k.tint) expect(c).toBeGreaterThan(0);
    let max = 0;
    for (let x = -46; x < 46; x += 1) for (let z = -40; z < 40; z += 1) { const s = D.sandPatch(x, z); max = Math.max(max, s.dark, s.pale); expect(s.dark).toBeGreaterThanOrEqual(0); expect(s.dark).toBeLessThanOrEqual(1); }
    expect(max).toBeGreaterThan(0.3);
  });
  it('draws two meshes, with the lower rungs a half of each, and nothing taller than a small rock pile', () => {
    const { a, b } = decorGeometries();
    expect(a.length).toBeGreaterThan(100);
    expect(b.length).toBeGreaterThan(100);
    const scene = new THREE.Scene();
    build(scene);
    const tufts = scene.getObjectByName('reef:tufts');
    const decor = scene.getObjectByName('reef:decor');
    expect(tufts.isInstancedMesh).toBe(true);
    expect(tufts.count).toBe(D.scatterTufts().length);
    expect(tufts.userData.baseCount).toBeLessThan(tufts.count);
    expect(decor.userData.baseVerts).toBeLessThan(decor.geometry.attributes.position.count);
    expect(tufts.userData.noCast && decor.userData.noCast).toBe(true);
  });
});
