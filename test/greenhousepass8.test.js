// Greenhouse beauty pass 8: the house answers her voice and moves. One pooled Points and soft tones; no mesh, triangle or caster.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const V = await import('../src/world/greenhousevoice.js');
const { build } = await import('../src/world/greenhouse.js');
const { bus } = await import('../src/events.js');

const BEFORE = { meshes: 74, triangles: 58693 }; // pass 7's after
const quiet = () => ({ pounceTime: 0, sniffTime: 0, idleTime: 0, wasZooming: false, perched: null });
const cat = { x: -8, y: 0, z: 14 }, cam = { x: -2, z: 14 };
const mk = (o = {}) => { const scene = new THREE.Scene(); const tones = []; const audio = { isMuted: () => false, getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start: () => tones.push(1), stop() {} }), createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }), destination: {} }), getMaster: () => ({}) }; return { scene, tones, v: V.createVoice({ scene, audio, ...o }) }; };
const run = (v, secs, s = quiet(), t0 = 0) => { for (let i = 0; i < secs * 30; i++) v.update(1 / 30, t0 + i / 30, cat, s, cam); };
const live = (v) => v.ps.filter((p) => p.t0 >= 0).length;
const shown = (v) => { let n = 0; const a = v.points.geometry.attributes.color.array; for (let i = 0; i < a.length / 4; i++) if (a[i * 4 + 3] > 0.05 && v.points.geometry.attributes.aSize.array[i] > 0) n++; return n; };

describe('pass 8: the build', () => {
  it('adds no mesh and no triangle', () => {
    const scene = new THREE.Scene(); build(scene, {});
    let meshes = 0, triangles = 0;
    scene.traverse((o) => { if (!o.isMesh) return; meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
    expect(meshes).toBeLessThanOrEqual(BEFORE.meshes); expect(triangles).toBeLessThanOrEqual(BEFORE.triangles);
  });
  it('uses no random number, no clock and no new three.js symbol', () => {
    const src = readFileSync(new URL('../src/world/greenhousevoice.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|DataTexture/);
  });
});

describe('the answers', () => {
  it('a meow sends bees, pollen and a zip, then a chime and a songbird on the walk audio, and waits 1.5 s', () => {
    const { v, tones } = mk(); v.meow(); run(v, 1.2); expect(tones.length).toBeGreaterThanOrEqual(5); expect(shown(v)).toBeGreaterThan(5);
    const w = mk().v; w.meow(); run(w, 0.5); w.meow(); run(w, 0.5); expect(w.state.counts.meow).toBe(1);
    run(w, 1.2); w.meow(); run(w, 0.1); expect(w.state.counts.meow).toBe(2);
  });
  it('a landing drops petals, droplets and a puff off the near pots', () => {
    const { v } = mk(); v.land(); run(v, 0.5); expect(shown(v)).toBeGreaterThan(8);
  });
  it('a sniff sends sparkles to the bloom she faces, with a soft chime', () => {
    const { v, tones } = mk(); const q = quiet(); q.sniffTime = 1; run(v, 0.8, q); expect(shown(v)).toBeGreaterThan(3); expect(tones.length).toBeGreaterThanOrEqual(2);
    const t = V.BLOOMS.find((b) => b.x === -12); let near = false; const pos = v.points.geometry.attributes.position.array;
    run(v, 1.5, q, 0.8); for (let i = 0; i < v.ps.length; i++) if (Math.hypot(pos[i * 3] - t.x, pos[i * 3 + 2] - t.z) < 3.5 && v.points.geometry.attributes.color.array[i * 4 + 3] > 0) near = true;
    expect(near).toBe(true);
  });
  it('standing still brings butterflies once and the sleepy cat yawns; moving re-arms it', () => {
    let yawns = 0; const { v } = mk({ yawn: () => { yawns++; } }); const s = quiet(); s.idleTime = 2.5; run(v, 2, s);
    expect(v.state.counts.sit).toBe(1); expect(yawns).toBe(1); expect(shown(v)).toBeGreaterThan(1);
    run(v, 4, s, 2); expect(v.state.counts.sit).toBe(1); s.idleTime = 0.2; run(v, 0.1, s, 6); s.idleTime = 2.6; run(v, 0.1, s, 6.1); expect(v.state.counts.sit).toBe(2);
    const p = mk().v; const s2 = quiet(); s2.idleTime = 3; s2.perched = {}; run(p, 1, s2); expect(p.state.counts.sit).toBe(0);
  });
  it('zoomies leave a wake of petals while they last', () => {
    const { v } = mk(); const s = quiet(); s.wasZooming = true; run(v, 1, s); expect(shown(v)).toBeGreaterThan(3);
  });
  it('is the sounds only under reduced motion, nothing on a muted or bare audio, and fewer points in lite', () => {
    const r = mk({ reducedMotion: true }); r.v.meow(); run(r.v, 1.5); expect(shown(r.v)).toBe(0); expect(live(r.v)).toBe(0);
    const m = mk(); m.v.meow(); run(m.v, 3); const muted = V.createVoice({ scene: new THREE.Scene(), audio: { isMuted: () => true, getContext: () => { throw new Error('muted'); } } }); muted.meow(); expect(() => run(muted, 3)).not.toThrow();
    const bare = V.createVoice({ scene: new THREE.Scene(), audio: {} }); bare.meow(); expect(() => run(bare, 3)).not.toThrow();
    const lo = mk({ lite: true }).v, hi = mk().v; for (const x of [lo, hi]) { const s = quiet(); s.idleTime = 3; x.meow(); run(x, 1, s); }
    expect(lo.ps.length).toBeLessThan(hi.ps.length);
  });
  it('the walk bus sets it off, and it lets go on dispose', () => {
    const { v, scene } = mk(); bus.emit('tip:did', { id: 'call' }); bus.emit('pounce:land', {}); run(v, 0.3); expect(v.state.counts.meow).toBe(1); expect(v.state.counts.land).toBe(1);
    v.dispose(); expect(scene.children.length).toBe(0); bus.emit('tip:did', { id: 'call' }); expect(() => run(v, 0.1)).not.toThrow();
  });
});
