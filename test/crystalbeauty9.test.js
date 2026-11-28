// The Crystal Cave, beauty pass 9 (2026-11-28): the cave answers her voice and moves. No new triangle, mesh or caster; visual and audio only.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const { measureWithLife } = await import('./helpers/lifebudget.js');
const { build } = await import('../src/world/crystal.js');
const V = await import('../src/world/crystalvoice.js');
const { bus } = await import('../src/events.js');

const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const mkAudio = (rings) => { const node = () => ({ connect() {}, gain: param(), frequency: param(), start() { rings.push(1); }, stop() {} }); return { isMuted: () => false, getContext: () => ({ currentTime: 0, destination: {}, createGain: node, createOscillator: node }) }; };
const mkUniforms = () => ({ mood: { value: new THREE.Vector4(0, 0, 0, 0) } });
const mk = (o = {}) => { const scene = new THREE.Scene(); const u = mkUniforms(); const v = V.createCrystalVoice({ scene, decor: { uniforms: u }, ...o }); return { scene, u, v }; };
const cat = { x: -13, y: 0, z: 16.5 };
let base = 0;
const run = (v, from, s, session = null) => { let t = from; for (let i = 0; i < s * 30; i++) { t += 1 / 30; if (v.u) v.u.mood.value.x = base; v.update(1 / 30, t, cat, null, session); } return t; };
const live = (v, t) => v.ps.filter((p) => p.t0 >= 0 && t - p.t0 >= 0 && t - p.t0 < p.life).length;

describe('crystal beauty pass 9', () => {
  it('adds no mesh or caster, and the frame stays inside its row', () => {
    const r = measureWithLife(build);
    console.log('PASS9 whole', JSON.stringify(r.whole));
    expect(r.whole.meshes).toBeLessThanOrEqual(28);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBeLessThanOrEqual(42200);
  });
  it('a meow: crystals light outward and sing, resonance lifts then falls back, moths scatter; a second inside 1.5 s is ignored', () => {
    const rings = []; const { v, u } = mk({ audio: mkAudio(rings) }); v.u = u;
    bus.emit('tip:did', { id: 'call' }); let t = run(v, 0, 0.1);
    expect(v.state.counts.meow).toBe(1); expect(live(v, t)).toBe(0);
    t = run(v, t, 1.0); expect(live(v, t)).toBeGreaterThan(3); expect(u.mood.value.x).toBeGreaterThan(0.5); expect(u.mood.value.x).toBeLessThanOrEqual(1);
    expect(rings.length).toBeGreaterThan(0);
    bus.emit('tip:did', { id: 'call' }); t = run(v, t, 0.2); expect(v.state.counts.meow).toBe(1);
    t = run(v, t, 5); expect(u.mood.value.x).toBe(0);
    bus.emit('tip:did', { id: 'sit' }); run(v, t, 0.1); expect(v.state.counts.meow).toBe(1);
    v.dispose();
  });
  it('lift never passes the mood top', () => { for (const x of [0, 0.4, 1]) for (const e of [0, 0.5, 1]) { const y = V.liftX(x, e); expect(y).toBeGreaterThanOrEqual(x); expect(y).toBeLessThanOrEqual(1); } expect(V.meowEnv(-1)).toBe(0); expect(V.meowEnv(0.5)).toBeGreaterThan(0.9); expect(V.meowEnv(4)).toBe(0); });
  it('a landing sends a floor ring and falling dust; pounce, sniff, still and zoomies each answer once per cooldown', () => {
    const { v } = mk(); bus.emit('pounce:land', {}); let t = run(v, 0, 0.5); expect(v.state.counts.land).toBe(1); expect(live(v, t)).toBeGreaterThan(8);
    const s = { pounceTime: 0, sniffTime: 0, idleTime: 0, wasZooming: false };
    t = run(v, t, 3, s); s.pounceTime = 1; t = run(v, t, 0.2, s); expect(v.state.counts.pounce).toBe(1);
    s.sniffTime = 1; t = run(v, t, 0.5, s); expect(v.state.counts.sniff).toBe(1); expect(live(v, t)).toBeGreaterThan(3);
    s.sniffTime = 0; s.pounceTime = 0; s.idleTime = 3; t = run(v, t, 0.5, s); expect(v.state.counts.sit).toBe(1); expect(v.state.lean).toBeTruthy();
    s.idleTime = 0; s.wasZooming = true; t = run(v, t, 1, s); expect(v.state.counts.zoom).toBe(1); expect(live(v, t)).toBeGreaterThan(4);
    v.dispose();
  });
  it('reduced motion: sounds only, no points, no mood lift; lite has the smaller pool', () => {
    const rings = []; const { v, u, scene } = mk({ audio: mkAudio(rings), reducedMotion: true });
    expect(scene.getObjectByName('crystal:voice')).toBeUndefined();
    bus.emit('tip:did', { id: 'call' }); const t = run(v, 0, 2); expect(rings.length).toBeGreaterThan(0); expect(u.mood.value.x).toBe(0); expect(live(v, t)).toBe(0);
    expect(mk({ tier: { name: 'low', rung: 5, shadows: false } }).v.ps.length).toBe(V.CV.pool.lite);
    v.dispose();
  });
  it('no audio object is fine, and the floor is dimmed where it is already bright', () => {
    const { v } = mk(); bus.emit('tip:did', { id: 'call' }); expect(() => run(v, 0, 2)).not.toThrow(); v.dispose();
    expect(V.floorCalm(0, 0)).toBe(1); expect(V.floorCalm(22, -22)).toBeLessThan(0.6); expect(V.floorCalm(-12.5, -19.5)).toBeLessThan(0.7);
  });
});
