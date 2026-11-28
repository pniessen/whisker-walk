// Greenhouse beauty pass 5: living creatures, the day's rhythm, the arrival. One pooled Points; no new mesh, triangle or caster.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const C = await import('../src/world/greenhousecreatures.js');
const S = await import('../src/world/greenhousesound.js');
const { build } = await import('../src/world/greenhouse.js');

const BEFORE = { meshes: 74, triangles: 58693 }; // pass 4's after (build(scene), every mesh)
const visible = (pts) => { const s = pts.geometry.attributes.aSize.array, a = pts.geometry.attributes.color.array; let n = 0; for (let i = 0; i < s.length; i++) if (s[i] > 0 && a[i * 4 + 3] > 0.01) n++; return n; };
const mk = (o = {}) => { const scene = new THREE.Scene(); const chimes = []; const audio = { isMuted: () => false, chime: () => chimes.push(1) }; return { scene, chimes, c: C.createCreatures({ scene, audio, ...o }) }; };

describe('greenhouse pass 5: the build', () => {
  it('adds no mesh and no triangle (the creatures are Points)', () => {
    const scene = new THREE.Scene();
    build(scene, {});
    let meshes = 0, triangles = 0;
    scene.traverse((o) => { if (!o.isMesh) return; meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
    expect(meshes).toBeLessThanOrEqual(BEFORE.meshes);
    expect(triangles).toBeLessThanOrEqual(BEFORE.triangles);
  });
});

describe('creatures', () => {
  it('are one Points that casts nothing', () => {
    const { c } = mk();
    expect(c.points.isPoints).toBe(true);
    expect(c.points.castShadow).toBe(false);
    expect(c.points.userData.noCast).toBe(true);
  });
  it('by day show the bench, post, bed and hummingbird; no moths or fireflies; at dusk they come', () => {
    const day = mk().c, dusk = mk({ dusk: true }).c;
    day.update(0.03, 1, { x: 0, z: 30 }, false); dusk.update(0.03, 1, { x: 0, z: 30 }, false);
    expect(visible(day.points)).toBeGreaterThan(10);
    expect(visible(dusk.points)).toBeGreaterThan(visible(day.points) + 4);
  });
  it('the hummingbird zips away from her and comes back', () => {
    const { c } = mk();
    for (let i = 0; i < 30; i++) c.update(0.033, i / 30, { x: 20, z: 30 }, false);
    const home = c.hummingbird;
    for (let i = 0; i < 40; i++) c.update(0.033, i / 30, { x: -3.5, z: -1 }, true);
    expect(Math.hypot(c.hummingbird.x - home.x, c.hummingbird.z - home.z)).toBeGreaterThan(3);
    for (let i = 0; i < 400; i++) c.update(0.033, i / 30, { x: 20, z: 30 }, false);
    expect(Math.hypot(c.hummingbird.x - home.x, c.hummingbird.z - home.z)).toBeLessThan(0.5);
  });
  it('reduced motion: nothing moves and she does not frighten it', () => {
    const { c } = mk({ reducedMotion: true });
    c.update(0.03, 0, { x: 20, z: 30 }, false);
    const a = Array.from(c.points.geometry.attributes.position.array);
    for (let i = 0; i < 60; i++) c.update(0.033, i, { x: -4, z: -1 }, false);
    expect(Array.from(c.points.geometry.attributes.position.array)).toEqual(a);
  });
  it('the arrival: a puff of pollen and a bee when she first steps under the glass, once; the chime near the bloom once', () => {
    const { c, chimes } = mk();
    c.update(0.03, 0, { x: 0, z: 4 }, false);
    const before = visible(c.points);
    expect(c.arrived).toBe(false);
    c.update(0.03, 1, { x: 0, z: -1 }, true);
    c.update(0.5, 1.5, { x: 0, z: -1 }, true);
    expect(c.arrived).toBe(true);
    expect(visible(c.points)).toBeGreaterThan(before + 10);
    for (let i = 0; i < 300; i++) c.update(0.033, i, { x: -2, z: -1 }, true);
    expect(chimes.length).toBe(1);
    expect(visible(c.points)).toBeLessThan(before + 10); // the puff is gone
  });
  it('a muted walk does not chime', () => {
    const scene = new THREE.Scene(); let n = 0;
    const c = C.createCreatures({ scene, audio: { isMuted: () => true, chime: () => n++ } });
    for (let i = 0; i < 50; i++) c.update(0.033, i, { x: -3, z: -1 }, true);
    expect(n).toBe(0);
  });
  it('lite draws fewer points', () => {
    expect(mk({ lite: true }).c.points.geometry.attributes.position.count).toBeLessThan(mk().c.points.geometry.attributes.position.count);
  });
  it('uses no banned randomness or clock', () => {
    const src = readFileSync(new URL('../src/world/greenhousecreatures.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
  });
});

describe('the day by the clock', () => {
  it('morning mist at 8, noon shafts at 12, afternoon gold at 18, none at 3 am; a bad hour is plain noon-ish', () => {
    expect(C.dayLook(8).morning).toBe(1);
    expect(C.dayLook(12).noon).toBe(1);
    expect(C.dayLook(18).warm).toBeGreaterThan(0.5);
    expect(C.dayLook(3)).toEqual({ morning: 0, noon: 0, warm: 0 });
    expect(C.dayLook(NaN).warm).toBe(0);
  });
});

describe('sound beds', () => {
  it('has the shed tin and the orchid hush streams with distinct salts', () => {
    expect(S.STREAM.tin).toBeDefined(); expect(S.STREAM.hush).toBeDefined();
    expect(new Set(Object.values(S.STREAM)).size).toBe(Object.keys(S.STREAM).length);
  });
  it('cross-fades by place: the shed is heard at the shed, not at the pond; the hush in the orchid room, not at the shed', () => {
    const count = (at) => {
      let n = 0;
      const audio = { isMuted: () => false, getMaster: () => ({}), getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => { n++; return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: () => ({ connect() {} }), start() {}, stop() {}, disconnect() {} }; }, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({ connect() {} }), disconnect() {} }) }) };
      const snd = S.createGreenhouseSound(audio, { weather: { isRaining: () => true } });
      for (let i = 0; i < 600; i++) snd.update(0.05, at, false);
      return n;
    };
    expect(count({ x: 28, z: 16 })).toBeGreaterThan(count({ x: -28, z: 28 }));
    expect(count({ x: -25, z: -9 })).toBeGreaterThan(count({ x: 5, z: 40 }));
  });
});
