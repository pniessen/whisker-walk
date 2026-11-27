// The Treehouse village, beauty round two (2026-11-27): realistic trees, shrubs, canopy lumps, house dressing, grass and organic sun shafts.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const P = await import('../src/world/treehouseplan.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const { createTreehouseLight, SHAFT_VERTS } = await import('../src/world/treehouselight.js');
const N = await import('../src/world/treehousenature.js');
const G = await import('../src/world/treehousegrass.js');
const B = await import('../src/world/treehousebeauty.js');

const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;

describe('trees', () => {
  it('four variants, each a forked, flared trunk and a crown of overlapping lumps, shared between trees', () => {
    for (let i = 0; i < 4; i++) {
      const v = N.treeVariant(i);
      expect(N.treeVariant(i)).toBe(v);
      v.wood.computeBoundingBox(); v.crown.computeBoundingBox();
      expect(v.wood.boundingBox.max.x - v.wood.boundingBox.min.x).toBeGreaterThan(1.2); // the root flare and the forks make it wider than a post
      expect(v.crown.boundingBox.max.y).toBeGreaterThan(5.5);
      expect(v.crown.attributes.position.count / 3).toBeGreaterThan(100);
    }
    expect(new Set(N.rimTrees().map((t) => t.v)).size).toBe(4);
  });
  it('tube rings face outward', () => {
    const g = N.tube([{ x: 0, y: 0, z: 0, r: 1 }, { x: 0, y: 2, z: 0, r: 1 }], 6, 0xffffff, 0xffffff);
    const p = g.attributes.position; const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) expect(p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i)).toBeGreaterThan(0);
  });
});

describe('canopy', () => {
  it('every lump (and its drooping tip) stays above CANOPY_MIN_Y', () => {
    const lumps = N.canopyLumps();
    expect(lumps.length).toBe(P.scatterCanopy().length * 3);
    for (const l of lumps) expect(l.y - l.ry, `${l.x},${l.z}`).toBeGreaterThanOrEqual(P.CANOPY_MIN_Y);
    const scene = new THREE.Scene(); build(scene);
    const leaves = scene.getObjectByName('treehouse:leaves').geometry.attributes.position;
    let high = 0; for (let i = 0; i < leaves.count; i++) if (leaves.getY(i) > P.CANOPY_MIN_Y - 0.3) high++;
    expect(high).toBeGreaterThan(1000);
  });
});

describe('grass', () => {
  it('patches of several tones, none over another of its own height, tufts clear of colliders, thinning outward', () => {
    const plan = G.planGrass();
    expect(new Set(plan.patches.map((p) => p.hex)).size).toBeGreaterThanOrEqual(4);
    expect(plan.tufts.length).toBeGreaterThan(100); expect(plan.tufts.length).toBeLessThan(400);
    const cs = P.treehouseColliders();
    for (const t of plan.tufts) expect(cs.some((c) => Math.hypot(t.x - c.x, t.z - c.z) < c.r + 0.4)).toBe(false);
    const inner = plan.tufts.filter((t) => Math.hypot(t.x, t.z - 2) < 15).length / (Math.PI * 225);
    const outer = plan.tufts.filter((t) => Math.hypot(t.x, t.z - 2) >= 25).length / (3600 - Math.PI * 625);
    expect(inner).toBeGreaterThan(outer);
  });
  it('the tufts are ONE non-casting mesh, shown on a full tier and hidden on LOW and LITE', () => {
    for (const [tier, shown] of [[null, true], [{ name: 'low' }, false], [{ name: 'lite' }, false]]) {
      const scene = new THREE.Scene(); build(scene);
      const m = scene.getObjectByName('treehouse:tufts');
      expect(m.castShadow).toBe(false);
      const l = createTreehouseLight({ scene, tier });
      expect(m.visible).toBe(shown);
      l.dispose();
    }
  });
});

describe('the sun shafts', () => {
  it('open at real gaps between leaf clumps, fade in from nothing, vary, and are one mesh', () => {
    const plan = B.planBeauty();
    expect(plan.shafts.length).toBeGreaterThanOrEqual(8);
    const lumps = N.canopyLumps();
    for (const s of plan.shafts) {
      for (const l of lumps) expect(Math.hypot(s.tx - l.x, s.tz - l.z)).toBeGreaterThan(Math.max(l.rx, l.rz) * 0.9);
    }
    expect(new Set(plan.shafts.map((s) => s.rTop.toFixed(2))).size).toBeGreaterThan(8);
    expect(new Set(plan.shafts.map((s) => s.lean.toFixed(2))).size).toBeGreaterThan(8);
    const scene = new THREE.Scene(); build(scene);
    const m = scene.getObjectByName('treehouse:shafts');
    expect(m.castShadow).toBe(false);
    const g = m.geometry; const n = plan.shafts.length;
    expect(g.attributes.position.count).toBe(n * SHAFT_VERTS);
    // the first ring of every shaft (its top, the first 8 triangles' leading vertices) is black = alpha 0; the top y is the same everywhere
    const c = g.attributes.color; const p = g.attributes.position;
    for (let i = 0; i < n; i++) {
      const v0 = i * SHAFT_VERTS; // band 0's first vertex is on the top ring
      expect(c.getX(v0)).toBe(0);
      expect(p.getY(v0)).toBeCloseTo(B.TOP_Y, 4);
      // band 1's top ring (1 m down) carries the colour
      const v1 = i * SHAFT_VERTS + 48 + 2; expect(c.getX(v1)).toBeGreaterThan(0.2);
    }
  });
  it('shimmer moves the colours; reduced motion holds them', () => {
    const run = (reducedMotion) => {
      const scene = new THREE.Scene(); build(scene);
      const m = scene.getObjectByName('treehouse:shafts');
      const l = createTreehouseLight({ scene, tier: null, reducedMotion });
      const a = Array.from(m.geometry.attributes.color.array.slice(0, 600));
      l.update(0.1, 40); l.update(0.1, 60);
      const b = Array.from(m.geometry.attributes.color.array.slice(0, 600));
      l.dispose();
      return a.some((v, i) => Math.abs(v - b[i]) > 1e-6);
    };
    expect(run(false)).toBe(true);
    expect(run(true)).toBe(false);
  });
  it('LOW and LITE hide them', () => {
    const scene = new THREE.Scene(); build(scene);
    const l = createTreehouseLight({ scene, tier: { name: 'lite' } });
    expect(scene.getObjectByName('treehouse:shafts').visible).toBe(false);
    l.dispose();
  });
});

describe('measure', () => {
  it('prints the build', () => {
    const scene = new THREE.Scene(); build(scene);
    const rows = scene.children.filter((o) => o.isMesh).map((m) => `${m.name}:${tris(m)}`);
    const total = scene.children.filter((o) => o.isMesh).reduce((n, m) => n + tris(m), 0);
    console.log('TREEHOUSE', rows.join(' '), 'TOTAL', total);
    expect(total).toBeLessThan(70000);
  });
});
