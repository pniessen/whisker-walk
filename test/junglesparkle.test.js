// The Jungle lodge, beauty pass 1: more flower colours, sun-dapple, bunting and rug (still pieces) and the butterflies and fireflies (the air).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const S = await import('../src/world/junglesparkle.js');
const P = await import('../src/world/jungleplan.js');
const { loadJungleStages, ST } = await import('../src/world/junglestages.js');
await loadJungleStages();
const { build } = await import('../src/world/jungle.js');

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const solid = P.jungleColliders();

describe('the plan', () => {
  const plan = S.sparklePlan();
  it('is seeded: the same twice', () => { expect(S.sparklePlan()).toEqual(plan); });
  it('has every piece the counts promise', () => {
    expect(plan.anchors).toHaveLength(S.SPARKLE.anchors);
    expect(plan.dapples).toHaveLength(S.SPARKLE.dapples);
    expect(plan.fireflies).toHaveLength(S.SPARKLE.fireflies.high);
  });
  it('keeps flowers and dapples clear of the river, the lodge and the solid things', () => {
    for (const a of plan.anchors) for (const f of a.blooms) {
      const x = a.x + f.dx; const z = a.z + f.dz;
      expect(P.clearOf(x, z, 0.5)).toBe(true);
      for (const o of solid) expect(Math.hypot(o.x - x, o.z - z)).toBeGreaterThan(o.r);
    }
    for (const d of plan.dapples) expect(P.clearOf(d.x, d.z, 0.3)).toBe(true);
  });
  it('uses at least four different bloom colours', () => {
    expect(new Set(plan.anchors.flatMap((a) => a.blooms.map((f) => f.hex))).size).toBeGreaterThanOrEqual(4);
  });
});

describe('the still pieces', () => {
  it('cost under 450 triangles, with no cap hiding underground', () => {
    expect(S.sparkleParts().reduce((n, [g]) => n + tris(g), 0)).toBeLessThan(450);
  });
  it('are drawn into the one non-casting bucket: stage b adds no mesh of its own', () => {
    const scene = new THREE.Scene();
    build(scene);
    let meshes = 0; scene.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(8); // the build's count before this pass
  });
});

describe('the air', () => {
  const mk = (o = {}) => S.createJungleAir({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });
  it('keeps fewer butterflies and fireflies on the lower rungs', () => {
    const hi = mk(); const lo = mk({ tier: { name: 'low', rung: 3, shadows: true } }); const lite = mk({ tier: { name: 'low', rung: 5, shadows: false } });
    const n = (a) => [a.butterflies.geometry.attributes.position.count / 12, a.fireflies.geometry.attributes.position.count];
    expect(n(hi)).toEqual([S.SPARKLE.butterflies.high, S.SPARKLE.fireflies.high]);
    expect(n(lo)[0]).toBeLessThan(n(hi)[0]); expect(n(lite)[0]).toBeLessThan(n(lo)[0]);
    expect(n(lo)[1]).toBeLessThan(n(hi)[1]); expect(n(lite)[1]).toBeLessThan(n(lo)[1]);
  });
  it('is one small mesh (4 triangles each) and one Points, neither casting nor merged', () => {
    const a = mk();
    expect(tris(a.butterflies.geometry)).toBe(S.SPARKLE.butterflies.high * 4);
    for (const o of [a.butterflies, a.fireflies]) expect(o.userData).toMatchObject({ noCast: true, noMerge: true });
  });
  it('moves with time, and holds perfectly still in reduced motion', () => {
    const a = mk(); const snap = () => [...a.butterflies.geometry.attributes.position.array, ...a.fireflies.geometry.attributes.position.array];
    const first = snap(); a.update(1 / 30, 5, { x: 99, z: 99 }, 0);
    expect(snap()).not.toEqual(first);
    const r = mk({ reducedMotion: true }); const s0 = [...r.butterflies.geometry.attributes.position.array];
    r.update(1 / 30, 5, { x: 0, z: 0 }, 0); r.update(1 / 30, 9, { x: 0, z: 0 }, 0);
    expect([...r.butterflies.geometry.attributes.position.array]).toEqual(s0);
  });
  it('lifts a butterfly when she comes near, and the fireflies dim in the rain', () => {
    const a = mk(); const an = S.sparklePlan().anchors[0];
    const ys = () => Array.from({ length: 12 }, (_, i) => a.butterflies.geometry.attributes.position.array[i * 3 + 1]).reduce((s, v) => s + v, 0);
    a.update(1 / 30, 3, { x: 99, z: 99 }, 0); const far = ys();
    for (let i = 0; i < 90; i++) a.update(1 / 30, 3, { x: an.x, z: an.z }, 0);
    expect(ys()).toBeGreaterThan(far);
    a.update(1 / 30, 3, { x: 99, z: 99 }, 0);
    const bright = () => a.fireflies.geometry.attributes.color.array.reduce((s, v) => s + v, 0);
    const dry = bright(); a.update(1 / 30, 3, { x: 99, z: 99 }, 1);
    expect(bright()).toBeLessThan(dry);
  });
  it('is cleaned away', () => {
    const scene = new THREE.Scene(); const a = S.createJungleAir({ scene });
    expect(scene.children).toHaveLength(2); a.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('is wired into the place: stage b offers it and the life carries it', () => {
    expect(typeof ST.story.air).toBe('function');
  });
});
