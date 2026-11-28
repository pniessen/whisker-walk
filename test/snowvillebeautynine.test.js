// Snowville beauty pass 9: the winter lantern festival. One pooled Points, no mesh, no caster, only on the festival evenings.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const F = await import('../src/world/snowvillefestival.js');
const { SHARED } = await import('../src/world/snowvillealive.js');
const P = await import('../src/world/snowvilleplan.js');

const fakeAudio = () => { const log = { osc: 0 }; const p = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }); const n = () => ({ connect() {}, start() {}, stop() {}, gain: p(), frequency: p(), Q: p(), type: '' }); const ac = { currentTime: 0, destination: {}, createGain: n, createOscillator: () => { log.osc++; return n(); }, createBiquadFilter: n, createBufferSource: n, createBuffer: () => ({ getChannelData: () => new Float32Array(64) }), sampleRate: 100 }; return { log, isMuted: () => false, getContext: () => ac, getMaster: () => null }; };
const eve = new Date(2026, 11, 21, 19, 0);
const mk = (o = {}) => { const scene = new THREE.Scene(); const audio = fakeAudio(); const f = F.createFestival({ scene, audio, now: eve, ...o }); return { scene, audio, f }; };
const cat = (x, z) => ({ x, y: P.snowY(x, z), z });
const run = (f, from, to, c) => { for (let t = from; t < to; t += 1 / 30) f.step(1 / 30, t, c); };
const shown = (f) => Array.from(f.points.geometry.attributes.aS.array).filter((x) => x > 0).length;

describe('snowville beauty pass 9: the winter lantern festival', () => {
  it('is on only on the festival evenings', () => {
    expect(F.festivalAt(new Date(2026, 11, 21, 19, 0))).toBe(true); expect(F.festivalAt(new Date(2026, 11, 31, 18, 0))).toBe(true); expect(F.festivalAt(new Date(2027, 0, 1, 21, 0))).toBe(true);
    expect(F.festivalAt(new Date(2026, 11, 21, 12, 0))).toBe(false); expect(F.festivalAt(new Date(2026, 11, 5, 19, 0))).toBe(false); expect(F.festivalAt(new Date(2026, 6, 4, 19, 0))).toBe(false); expect(F.festivalAt(new Date(2026, 11, 21, 23, 0))).toBe(false);
  });
  it('makes nothing outside the festival, and one Points, no mesh, no caster inside it', () => {
    const off = mk({ now: new Date(2026, 6, 4, 19, 0) }); expect(off.f.active).toBe(false); expect(off.scene.children).toHaveLength(0); off.f.step(0.03, 1, cat(0, 30)); off.f.dispose();
    const { scene, f } = mk(); expect(scene.children.filter((o) => o.isMesh)).toHaveLength(0); expect(scene.children.map((o) => o.name)).toEqual(['snowville:fest']); expect(f.points.userData.noCast).toBe(true);
    f.dispose(); expect(scene.children).toHaveLength(0); expect(SHARED.fest).toBe(0);
  });
  it('the lane lights one by one as she walks and stays lit; the wind ducks; the tree bursts once with a carol', () => {
    const { f, audio } = mk(); run(f, 10, 17, cat(0, 44)); const first = f.state.lit.filter((x) => x !== undefined).length; expect(SHARED.fest).toBeGreaterThan(0.9);
    run(f, 17, 20, cat(0, 30)); const mid = f.state.lit.filter((x) => x !== undefined).length; expect(mid).toBeGreaterThan(first);
    expect(f.state.bursts).toBe(0); run(f, 20, 22, cat(10, 12)); expect(f.state.lit.filter((x) => x !== undefined).length).toBeGreaterThan(mid); run(f, 22, 23, cat(0, 30)); expect(f.state.lit[0]).toBeDefined();
    const o0 = audio.log.osc; run(f, 23, 24, cat(-4, 12)); expect(f.state.bursts).toBe(1); expect(audio.log.osc).toBeGreaterThan(o0); run(f, 24, 40, cat(-4, 12)); run(f, 40, 41, cat(-4, 12)); expect(f.state.bursts).toBe(1); f.dispose();
  });
  it('reduced motion is still: no burst, nothing moves, the lane is lit; lite draws fewer', () => {
    const a = mk({ motion: false }); run(a.f, 10, 16, cat(-4, 12)); const p1 = Array.from(a.f.points.geometry.attributes.position.array); run(a.f, 16, 20, cat(-4, 12)); expect(Array.from(a.f.points.geometry.attributes.position.array)).toEqual(p1); expect(a.f.state.bursts).toBe(0); expect(a.f.state.lit.every((x) => x !== undefined)).toBe(true); a.f.dispose();
    const b = mk({ rung: 'lite' }); const c = mk(); expect(b.f.count).toBeLessThan(c.f.count); b.f.dispose(); c.f.dispose();
  });
  it('stays on the walk ground and a muted or bare audio object is safe', () => {
    const { f } = mk({ audio: {} }); run(f, 1, 70, cat(2, 20)); expect(shown(f)).toBeGreaterThan(30);
    const pos = f.points.geometry.attributes.position.array; for (let i = 0; i < f.count; i++) expect(pos[i * 3 + 1]).toBeGreaterThanOrEqual(P.snowY(pos[i * 3], pos[i * 3 + 2]) - 0.001); f.dispose();
    const m = mk({ audio: { ...fakeAudio(), isMuted: () => true } }); run(m.f, 1, 70, cat(-4, 12)); m.f.dispose();
  });
});
