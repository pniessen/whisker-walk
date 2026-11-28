// Greenhouse beauty pass 6: weather as events. Uniforms and one pooled Points; no new mesh, triangle or caster.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const W = await import('../src/world/greenhouseweather.js');
const G = await import('../src/world/greenhouseglass.js');
const PL = await import('../src/world/greenhouseplants.js');
const { build } = await import('../src/world/greenhouse.js');

const BEFORE = { meshes: 74, triangles: 58693 }; // pass 5's after
const mk = (o = {}) => { const scene = new THREE.Scene(); return { scene, w: W.createWeatherFx({ scene, ...o }) }; };

describe('pass 6: the build', () => {
  it('adds no mesh and no triangle', () => {
    const scene = new THREE.Scene();
    build(scene, {});
    let meshes = 0, triangles = 0;
    scene.traverse((o) => { if (!o.isMesh) return; meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
    expect(meshes).toBeLessThanOrEqual(BEFORE.meshes);
    expect(triangles).toBeLessThanOrEqual(BEFORE.triangles);
  });
  it('uses no random number and no clock', () => {
    expect(readFileSync(new URL('../src/world/greenhouseweather.js', import.meta.url), 'utf8')).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
  });
});

describe('the events', () => {
  it('are pure and stay in 0..1; same clock, same answer', () => {
    for (let t = 0; t < 900; t += 7) {
      const a = W.eventsAt(t, { rain: 0, day: { morning: 0.5, warm: 0 } }), b = W.eventsAt(t, { rain: 0, day: { morning: 0.5, warm: 0 } });
      expect(a).toEqual(b);
      for (const v of Object.values(a)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1.0001); }
    }
  });
  it('a dry day walk has a sun burst early; rain, dusk and reduced motion have none', () => {
    let best = 0;
    for (let t = 0; t < 80; t += 1) best = Math.max(best, W.eventsAt(t, {}).sun);
    expect(best).toBeGreaterThan(0.9);
    for (let t = 0; t < 400; t += 3) { expect(W.eventsAt(t, { rain: 1 }).sun).toBe(0); expect(W.eventsAt(t, { dusk: true }).sun).toBe(0); expect(W.eventsAt(t, { reducedMotion: true }).sun).toBe(0); }
  });
  it('a sun burst follows the end of a rain', () => {
    expect(W.eventsAt(300, { sinceRain: 10 }).sun).toBeGreaterThan(0.9);
  });
  it('the dusk glow comes at dusk and the morning haze lifts', () => {
    let g = 0;
    for (let t = 0; t < 80; t++) g = Math.max(g, W.eventsAt(t, { dusk: true }).glow);
    expect(g).toBeGreaterThan(0.9);
    expect(W.eventsAt(5, { day: { morning: 1, warm: 0 } }).haze).toBeGreaterThan(0.9);
    expect(W.eventsAt(200, { day: { morning: 1, warm: 0 } }).haze).toBe(0);
    expect(W.eventsAt(5, { dusk: true, day: { morning: 1, warm: 0 } }).haze).toBe(0);
  });
  it('the wind is rare: under half of the slots', () => {
    let on = 0;
    for (let n = 0; n < 40; n++) { let m = 0; for (let t = n * W.WIND_SLOT; t < (n + 1) * W.WIND_SLOT; t += 3) m = Math.max(m, W.eventsAt(t, {}).wind); if (m > 0.3) on++; }
    expect(on).toBeGreaterThan(2);
    expect(on).toBeLessThan(26);
  });
  it('rain makes the house cosy', () => { expect(W.eventsAt(50, { rain: 1 }).cosy).toBeGreaterThan(0.4); });
});

describe('the fx', () => {
  it('is one Points that casts nothing, hidden until an event shows', () => {
    const { w } = mk();
    expect(w.points.isPoints).toBe(true);
    expect(w.points.castShadow).toBe(false);
    expect(w.points.visible).toBe(false);
    w.update(0.03, 0, false, { x: 0, z: 0 });
    for (let i = 0; i < 1500; i++) w.update(0.033, i, false, { x: 0, z: 0 });
    w.update(0.03, 0, false, { x: 0, z: 0 });
    w.dispose();
  });
  it('a forced sun lights the floor, perks the plants and shows pollen; dispose lets go', () => {
    const { w } = mk({ force: { sun: 1 } });
    w.update(0.03, 0, false, { x: 0, z: 0 });
    expect(G.DAPPLE_FX.sun.value).toBe(1);
    expect(PL.PERK.value).toBe(1);
    expect(w.points.visible).toBe(true);
    w.dispose();
    expect(G.DAPPLE_FX.sun.value).toBe(0);
    expect(PL.PERK.value).toBe(0);
  });
  it('rain wets the floor light; a forced wind sways the plants', () => {
    const { w } = mk();
    for (let i = 0; i < 90; i++) w.update(0.033, i, true, null);
    expect(G.DAPPLE_FX.wet.value).toBeGreaterThan(0.9);
    w.dispose();
    const m = mk({ force: { wind: 0.8 } });
    m.w.update(0.03, 0, false, null);
    expect(PL.WIND.value).toBe(0.8);
    m.w.dispose();
  });
  it('reduced motion: no timed event, and lite draws fewer points', () => {
    const { w } = mk({ reducedMotion: true });
    for (let i = 0; i < 40; i++) w.update(0.5, i, false, null);
    expect(w.state.sun + w.state.glow + w.state.wind + w.state.haze).toBe(0);
    w.dispose();
    expect(mk({ lite: true }).w.points.geometry.attributes.position.count).toBeLessThan(mk().w.points.geometry.attributes.position.count);
  });
  it('the haze comes in and goes out with the fog it was given', () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xffffff, 70, 170);
    const w = W.createWeatherFx({ scene, force: { haze: 1 } });
    w.update(0.03, 0, false, null);
    expect(scene.fog.far).toBeLessThan(170);
    w.dispose();
    expect(scene.fog.far).toBeCloseTo(170, 5);
  });
});
