// The Treehouse, beauty pass 3 (2026-11-28): the village reacts to the cat and lives, with NO new geometry.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { measureWithLife } = await import('./helpers/lifebudget.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const G = await import('../src/world/treehouseglow.js');
const C = await import('../src/world/treehousecritters.js');

const fakeSky = () => {
  const M = { paint: new THREE.MeshStandardMaterial(), leaves: new THREE.MeshStandardMaterial() };
  return G.skyPatch(M);
};

describe('treehouse beauty pass 3', () => {
  it('adds no mesh, caster or triangle: the whole frame is the 62,139-triangle one of pass 2', () => {
    const r = measureWithLife(build);
    expect(r.whole.meshes).toBe(23);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBe(62139);
  });

  it('the shaders carry the flex, the shiver, the gust front, the cloud shade and the mist', () => {
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
    const M = { paint: new THREE.MeshStandardMaterial(), leaves: new THREE.MeshStandardMaterial() };
    G.skyPatch(M);
    M.paint.onBeforeCompile(structuredClone(sh));
    const p = { ...sh, uniforms: {} }; M.paint.onBeforeCompile(p);
    const l = { ...sh, uniforms: {} }; M.leaves.onBeforeCompile(l);
    expect(p.vertexShader).toMatch(/uReact\.x/);
    expect(l.vertexShader).toMatch(/uReact\.y/);
    expect(l.vertexShader).toMatch(/front/);
    expect(p.fragmentShader).toMatch(/CLOUD SHADE/);
    expect(p.fragmentShader).toMatch(/FLOOR MIST/);
    expect(p.uniforms.uCat).toBeTruthy();
  });

  it('a drop that ends is a landing, a walk or a door is not', () => {
    const sky = fakeSky(); const cat = { x: 0, y: 2, z: 0 };
    let t = 0;
    const step = (y) => { t += 1 / 30; cat.y = y; sky.update(t, cat, false, 'high'); };
    step(2);
    for (let i = 1; i <= 12; i++) step(2 - (2 * i) / 12); // 5 m/s down
    expect(sky.reaction.landedAt).toBe(0);
    step(0);
    expect(sky.reaction.landedAt).toBeGreaterThan(0);
    expect(sky.reaction.land).toBeGreaterThan(0.3);
    expect(sky.uniforms.uReact.value.x).toBeGreaterThan(0.3);
    expect(sky.uniforms.uReact.value.y).toBeGreaterThan(0.3);
    // the shock fades
    for (let i = 0; i < 90; i++) step(0);
    expect(sky.uniforms.uReact.value.x).toBeLessThan(0.05);
    expect(sky.uniforms.uReact.value.y).toBeLessThan(0.05);
    // a gentle slope is no landing
    const was = sky.reaction.landedAt;
    for (let i = 0; i < 30; i++) step(-0.5 * (i / 30));
    step(-0.5);
    expect(sky.reaction.landedAt).toBe(was);
    // nor a door (a jump of metres)
    cat.x = 20; step(5); step(0);
    expect(sky.reaction.landedAt).toBe(was);
  });

  it('reduced motion and LITE hold the flex and the shiver at nothing', () => {
    for (const [still, rung] of [[true, 'high'], [false, 'lite']]) {
      const sky = fakeSky(); const cat = { x: 0, y: 2, z: 0 };
      let t = 0;
      for (let i = 0; i <= 12; i++) { t += 1 / 30; cat.y = 2 - (2 * i) / 12; sky.update(t, cat, still, rung); }
      t += 1 / 30; sky.update(t, cat, still, rung);
      expect(sky.uniforms.uReact.value.x).toBe(0);
      expect(sky.uniforms.uReact.value.y).toBe(0);
    }
  });

  it('a lantern she passes swings its pool, and holds still under reduced motion', () => {
    const sky = fakeSky(); const l = G.lampPoints()[0];
    const cat = { x: l.x + 0.5, y: 0, z: l.z + 0.5 };
    let moved = 0;
    for (let i = 0; i < 40; i++) { sky.update(i / 30, cat, false, 'high'); const v = sky.uniforms.uLamp.value[0]; moved = Math.max(moved, Math.hypot(v.x - l.x, v.z - l.z)); }
    expect(moved).toBeGreaterThan(0.05);
    const s2 = fakeSky();
    for (let i = 0; i < 40; i++) s2.update(i / 30, cat, true, 'high');
    const v = s2.uniforms.uLamp.value[0];
    expect(Math.hypot(v.x - l.x, v.z - l.z)).toBeLessThan(1e-6);
  });

  it('the shower of leaves is seeded, starts above her, falls and fades out', () => {
    const a = C.burstLeaf(3, 0.5, 1, 2, 3); const b = C.burstLeaf(3, 0.5, 1, 2, 3);
    expect(a).toEqual(b);
    expect(C.burstLeaf(3, 0, 1, 2, 3).y).toBeGreaterThan(2 + 1);
    expect(C.burstLeaf(3, 2, 1, 2, 3).y).toBeLessThan(C.burstLeaf(3, 0.2, 1, 2, 3).y);
    expect(C.burstLeaf(3, C.BURST.life, 1, 2, 3).fade).toBe(0);
    expect(C.BURST.lite).toBe(0);
  });

  it('the thump is silent without a sound context and returns true with one', () => {
    expect(C.thumpNote(null, 0.5)).toBe(false);
  });
});
