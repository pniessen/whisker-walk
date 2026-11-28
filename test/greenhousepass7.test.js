// Greenhouse beauty pass 7: photogenic vistas and the golden moment. One pooled Points; no mesh, triangle or caster.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const V = await import('../src/world/greenhousevista.js');
const { build } = await import('../src/world/greenhouse.js');

const BEFORE = { meshes: 74, triangles: 58693 }; // pass 6's after
const mk = (o = {}) => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x88aa66, 1));
  scene.fog = new THREE.Fog(0xe6f2e8, 70, 170);
  return { scene, v: V.createVistas({ scene, ...o }) };
};

describe('pass 7: the build', () => {
  it('adds no mesh and no triangle', () => {
    const scene = new THREE.Scene();
    build(scene, {});
    let meshes = 0, triangles = 0;
    scene.traverse((o) => { if (!o.isMesh) return; meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
    expect(meshes).toBeLessThanOrEqual(BEFORE.meshes);
    expect(triangles).toBeLessThanOrEqual(BEFORE.triangles);
  });
  it('uses no random number, no clock and never the forbidden word', () => {
    const src = readFileSync(new URL('../src/world/greenhousevista.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|DataTexture/);
  });
});

describe('the vistas', () => {
  it('are found by place, strongest at the spot, none far away', () => {
    for (const v of V.VISTAS) { const at = V.vistaAt(v.x, v.z); expect(at.vista.id).toBe(v.id); expect(at.k).toBeGreaterThan(0.99); }
    expect(V.vistaAt(100, 100)).toBeNull();
  });
  it('grade warms the fill and undo it exactly when she leaves and on dispose', () => {
    const { scene, v } = mk();
    const fill = scene.children[0], r0 = fill.color.r, b0 = fill.color.b, far0 = scene.fog.far;
    for (let i = 0; i < 200; i++) v.update(0.05, { x: 0, z: 26 }, 0);
    expect(fill.color.r).toBeGreaterThan(r0); expect(fill.color.b).toBeLessThan(b0); expect(scene.fog.far).toBeLessThan(far0);
    for (let i = 0; i < 400; i++) v.update(0.05, { x: 60, z: 60 }, 0);
    expect(fill.color.r).toBeCloseTo(r0, 2); expect(scene.fog.far).toBeCloseTo(far0, 3);
    for (let i = 0; i < 100; i++) v.update(0.05, { x: 0, z: 26 }, 0);
    v.dispose();
    expect(fill.color.r).toBeCloseTo(r0, 5); expect(scene.fog.far).toBeCloseTo(far0, 5);
  });
  it('the golden moment: after 3 s still at a vista, once a walk, with a chime on the game audio only', () => {
    let chimes = 0;
    const audio = { isMuted: () => false, chime: () => { chimes++; } };
    const { v } = mk({ audio });
    for (let i = 0; i < 60; i++) v.update(0.05, { x: 0, z: 26 }, 2); // not still enough
    expect(v.state.golden).toBe(false); expect(chimes).toBe(0);
    for (let i = 0; i < 60; i++) v.update(0.05, { x: 0, z: 26 }, 3.2);
    expect(v.state.golden).toBe(true); expect(chimes).toBe(1);
    expect(v.points.visible).toBe(true);
    for (let i = 0; i < 400; i++) v.update(0.05, { x: 0, z: 26 }, 5);
    expect(chimes).toBe(1); expect(v.state.gold).toBe(0);
  });
  it('no golden moment away from a vista, muted, or on a bare stub', () => {
    const { v } = mk({ audio: { isMuted: () => true, chime: () => { throw new Error('muted'); } } });
    for (let i = 0; i < 100; i++) v.update(0.05, { x: 40, z: 40 }, 9);
    expect(v.state.golden).toBe(false);
    const w = mk({ audio: {} }).v; // a bare stub: no isMuted, nothing is asked for
    for (let i = 0; i < 100; i++) w.update(0.05, { x: 0, z: 26 }, 9);
    expect(w.state.golden).toBe(true);
  });
  it('reduced motion holds the sparkles still; lite has fewer and keeps the fog', () => {
    const run = (o) => { const { scene, v } = mk(o); for (let i = 0; i < 160; i++) v.update(0.05, { x: 0, z: 26 }, 3.5); return { v, scene }; };
    const a = run({ reducedMotion: true });
    const p1 = Array.from(a.v.points.geometry.attributes.position.array);
    for (let i = 0; i < 10; i++) a.v.update(0.05, { x: 0, z: 26 }, 3.5);
    expect(Array.from(a.v.points.geometry.attributes.position.array)).toEqual(p1);
    const l = run({ lite: true });
    expect(l.v.points.geometry.attributes.position.count).toBeLessThan(a.v.points.geometry.attributes.position.count);
    expect(l.scene.fog.far).toBe(170);
  });
});
