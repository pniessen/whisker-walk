// The Treehouse, beauty pass 7 (2026-11-28): photogenic vistas, no new triangle, mesh or caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { measureWithLife } = await import('./helpers/lifebudget.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const V = await import('../src/world/treehousevista.js');

describe('treehouse beauty pass 7', () => {
  it('adds no triangle, mesh or caster', () => {
    const r = measureWithLife(build);
    expect(r.whole.meshes).toBe(23);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBe(60413);
  });

  it('five vistas, each found at its own spot and only facing its own way', () => {
    expect(V.VISTAS).toHaveLength(5);
    for (const v of V.VISTAS) {
      expect(Math.hypot(v.dx, v.dz)).toBeGreaterThan(0.95);
      expect(Math.hypot(v.dx, v.dz)).toBeLessThan(1.05);
      const at = V.pick({ x: v.x, y: v.y, z: v.z }, { x: v.dx, z: v.dz });
      expect(at.v.id).toBe(v.id); expect(at.k).toBeGreaterThan(0.9);
      expect(V.pick({ x: v.x, y: v.y, z: v.z }, { x: -v.dx, z: -v.dz }).k).toBeLessThan(0.2); // the camera looking the other way: no picture
      expect(V.pick({ x: v.x, y: v.y + 4, z: v.z }, null).k).toBe(0); // another level
      expect(V.pick({ x: v.x + 30, y: v.y, z: v.z }, null).k).toBe(0);
    }
    expect(V.pick(null).k).toBe(0);
  });

  it('the golden moment: 3 s still at a vista, sparkles and one chime, once per vista; reduced motion makes none', async () => {
    const C = await import('../src/world/treehousecritters.js');
    const rings = []; const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect() {}, gain: param(), frequency: param(), Q: param(), start() { rings.push(1); }, stop() {} });
    const audio = { isMuted: () => false, getContext: () => ({ currentTime: 0, destination: {}, createGain: node, createOscillator: node, createBiquadFilter: node }) };
    const scene = new THREE.Scene(); const area = build(scene);
    const life = area.life({ scene, reducedMotion: false, tier: null, audio, progression: null, sendEvent: () => {}, roomSeed: 3 });
    const v = V.VISTAS[4]; const cat = { x: v.x, y: v.y, z: v.z }; const cam = { position: { x: v.x - v.dx * 7, y: v.y + 3.8, z: v.z - v.dz * 7 } };
    const pts = scene.getObjectByName('treehouse:vista');
    expect(pts.visible).toBe(false);
    let t = 0; for (let i = 0; i < 60; i++) { t += 1 / 30; life.update(1 / 30, t, cat, cam, {}); }
    expect(pts.visible).toBe(false); // 2 s: not yet
    const before = rings.length;
    for (let i = 0; i < 60; i++) { t += 1 / 30; life.update(1 / 30, t, cat, cam, {}); }
    expect(pts.visible).toBe(true);
    expect(rings.length).toBeGreaterThan(before); // the chime
    const sparks = [...pts.geometry.attributes.position.array].filter((y, i) => i % 3 === 1 && y > -100).length;
    expect(sparks).toBeGreaterThan(5);
    for (let i = 0; i < 300; i++) { t += 1 / 30; life.update(1 / 30, t, cat, cam, {}); }
    expect(pts.visible).toBe(false); // it has risen and gone; standing on does not start it again
    for (let i = 0; i < 300; i++) { t += 1 / 30; life.update(1 / 30, t, cat, cam, {}); }
    expect(pts.visible).toBe(false);
    life.dispose();
    const s2 = new THREE.Scene(); const a2 = build(s2);
    const l2 = a2.life({ scene: s2, reducedMotion: true, tier: null, audio: null, progression: null, sendEvent: () => {} });
    expect(s2.getObjectByName('treehouse:vista')).toBeFalsy();
    for (let i = 0; i < 200; i++) l2.update(1 / 30, i / 30, cat, cam, {});
    l2.dispose();
    expect(C.COUNTS.high.birds).toBeGreaterThan(0);
  });
});
