// Greenhouse beauty pass 3: the house reacts to her and to the weather (uniforms only; no geometry).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const G = await import('../src/world/greenhouseglass.js');
const { build } = await import('../src/world/greenhouse.js');

describe('greenhouse pass 3', () => {
  it('tells the glass, mist and leaves where she is, and clears it on dispose', () => {
    const scene = new THREE.Scene();
    const area = build(scene, {});
    const life = area.life({ scene, ground: { y: () => 0 }, reducedMotion: false });
    life.update(0.1, 1, { x: 1, y: 0, z: -3 }, null, null);
    life.update(0.1, 1.1, { x: 1.3, y: 0, z: -3 }, null, null);
    const v = G.CAT_NEAR.value;
    expect(v.w).toBe(1);
    expect(v.x).toBeCloseTo(1.3);
    expect(v.z).toBeGreaterThan(0);
    life.dispose();
    expect(G.CAT_NEAR.value.w).toBe(0);
  });
  it('does not react under reduced motion, and rain brings the roof rain on', () => {
    const scene = new THREE.Scene();
    const area = build(scene, {});
    const life = area.life({ scene, ground: { y: () => 0 }, reducedMotion: true, weather: { isRaining: () => true, setSheltered() {} } });
    life.update(0.1, 1, { x: 1, y: 0, z: -3 }, null, null);
    expect(G.CAT_NEAR.value.w).toBe(0);
    expect(G.RAIN_ON.value).toBe(1);
    life.dispose();
    expect(G.RAIN_ON.value).toBe(0);
  });
  it('thins the sun shafts in rain and warms them at dusk', () => {
    const scene = new THREE.Scene();
    const area = build(scene, {});
    const life = area.life({ scene, ground: { y: () => 0 }, reducedMotion: false, dusk: true, weather: { isRaining: () => true, setSheltered() {} } });
    for (let i = 0; i < 200; i++) life.update(0.1, i * 0.1, { x: 0, y: 0, z: 30 }, null, null);
    const sh = scene.getObjectByName('sunShafts').userData.shaft;
    expect(sh.uGain.value).toBeLessThan(0.4);
    expect(sh.uWarm.value).toBe(1);
    life.dispose();
  });
});
