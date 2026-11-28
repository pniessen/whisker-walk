// The Crystal Cave, beauty pass 8 (2026-11-28): photogenic vistas, no new triangle, mesh or caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const { measureWithLife } = await import('./helpers/lifebudget.js');
const { build } = await import('../src/world/crystal.js');
const V = await import('../src/world/crystalvista.js');
const { createCrystalMood } = await import('../src/world/crystalmood.js');

describe('crystal beauty pass 8', () => {
  it('adds no mesh or caster, and the frame stays inside its row', () => {
    const r = measureWithLife(build);
    expect(r.whole.meshes).toBeLessThanOrEqual(28);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBeLessThanOrEqual(42200);
  });
  it('five vistas, each found at its own spot and only facing its own way', () => {
    expect(V.VISTAS).toHaveLength(5);
    for (const v of V.VISTAS) {
      const at = V.pick({ x: v.x, z: v.z }, { x: v.dx, z: v.dz });
      expect(at.v.id).toBe(v.id); expect(at.k).toBeGreaterThan(0.9);
      expect(V.pick({ x: v.x, z: v.z }, { x: -v.dx, z: -v.dz }).k).toBeLessThan(0.2);
      expect(V.pick({ x: v.x + 30, z: v.z }, null).k).toBe(0);
      for (const w of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { const p = V.palette(v, w); for (const c of [p.near, p.mid, p.far]) c.forEach((x) => expect(x).toBeGreaterThanOrEqual(0)); expect(p.edge).toBeGreaterThan(0.9); }
    }
    expect(V.pick(null).k).toBe(0);
  });
  it('the golden moment: 3 s still, sparkles and one chime, once per vista; reduced motion makes none', () => {
    const rings = []; const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
    const node = () => ({ connect() {}, gain: param(), frequency: param(), start() { rings.push(1); }, stop() {} });
    const audio = { isMuted: () => false, getContext: () => ({ currentTime: 0, destination: {}, createGain: node, createOscillator: node }) };
    const scene = new THREE.Scene(); const mood = createCrystalMood({ scene, audio, reducedMotion: false });
    const v = V.VISTAS[2]; const cat = { x: v.x, y: 0, z: v.z }; const cam = { position: { x: v.x - v.dx * 4.5, y: 2.2, z: v.z - v.dz * 4.5 } };
    const pts = scene.getObjectByName('crystal:vista'); expect(pts.visible).toBe(false);
    let t = 0; const run = (s) => { for (let i = 0; i < s * 30; i++) { t += 1 / 30; mood.update(1 / 30, t, cat, cam); } };
    run(2); expect(pts.visible).toBe(false);
    const before = rings.length; run(1.5); expect(pts.visible).toBe(true); expect(rings.length).toBeGreaterThan(before);
    run(8); expect(pts.visible).toBe(false); run(8); expect(pts.visible).toBe(false);
    mood.dispose();
    const s2 = new THREE.Scene(); const m2 = createCrystalMood({ scene: s2, audio: null, reducedMotion: true });
    expect(s2.getObjectByName('crystal:vista')).toBeFalsy(); for (let i = 0; i < 200; i++) m2.update(1 / 30, i / 30, cat, cam); m2.dispose();
  });
});
