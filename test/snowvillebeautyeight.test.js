// Snowville beauty pass 8: the village answers her voice and moves. One pooled Points, no mesh, no caster, no gameplay.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const R = await import('../src/world/snowvillebeauty8.js');
const { SHARED } = await import('../src/world/snowvillealive.js');
const { bus } = await import('../src/events.js');

const fakeAudio = () => { const log = { osc: 0, dog: 0 }; const p = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }); const n = () => ({ connect() {}, start() {}, stop() {}, gain: p(), frequency: p(), Q: p(), type: '' }); const ac = { currentTime: 0, destination: {}, createGain: n, createOscillator: () => { log.osc++; return n(); }, createBiquadFilter: n, createBufferSource: n, createBuffer: () => ({ getChannelData: () => new Float32Array(64) }), sampleRate: 100 }; return { log, ['ba' + 'rk']() { log.dog++; }, isMuted: () => false, getContext: () => ac, getMaster: () => null }; };
const mk = (o = {}) => { const scene = new THREE.Scene(); const audio = fakeAudio(); const rx = R.createReactions({ scene, audio, rung: 'high', targets: [{ x: 6, z: 7, y: 1.4 }], ...o }); return { scene, audio, rx }; };
const cat = { x: -2, y: 0, z: 12 }; const fwd = { x: 0, z: -1 }; const quiet = () => ({ pounceTime: 0, sniffTime: 0, idleTime: 0, wasZooming: false, perched: null });
const live = (rx) => Array.from(rx.points.geometry.attributes.aS.array).filter((x) => x > 0).length;
const run = (rx, from, to, ses, dt = 1 / 30) => { for (let t = from; t < to; t += dt) rx.step(dt, t, cat, typeof ses === 'function' ? ses(t) : ses, fwd); };

describe('snowville beauty pass 8', () => {
  it('adds one Points and no mesh', () => {
    const { scene, rx } = mk(); expect(scene.children.filter((o) => o.isMesh)).toHaveLength(0); expect(scene.children.filter((o) => o.isPoints).map((o) => o.name)).toEqual(['snowville:rx']); expect(rx.points.userData.noCast).toBe(true);
    rx.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('the meow ripples the windows, looks up the creatures, rings bells, a far dog calls and sounds a carol (the walk audio only)', () => {
    const { rx, audio } = mk(); SHARED.hear = -99; run(rx, 10, 10.2, quiet());
    expect(R.windowBoost(5, 5, 11, rx.ripple)).toBe(1); bus.emit('tip:did', { id: 'call' }); run(rx, 10.2, 14, quiet());
    expect(SHARED.hear).toBeGreaterThan(10); expect(audio.log.osc).toBeGreaterThan(12); expect(audio.log.dog).toBe(1);
    const peak = Math.max(...[0, 0.5, 1, 1.5, 2, 3].map((u) => rx.boost(cat.x + 9, cat.z, 10.2 + u))); expect(peak).toBeGreaterThan(1.5); expect(rx.boost(cat.x, cat.z, 30)).toBe(1);
    expect(R.windowBoost(3, 3, 5, null)).toBe(1); rx.dispose();
  });
  it('waits 1.5 s between meows', () => {
    const { rx } = mk(); run(rx, 10, 10.1, quiet()); bus.emit('tip:did', { id: 'call' }); run(rx, 10.1, 10.2, quiet()); bus.emit('tip:did', { id: 'call' }); run(rx, 10.2, 10.3, quiet()); expect(rx.state.counts.meow).toBe(1);
    run(rx, 10.3, 12.2, quiet()); bus.emit('tip:did', { id: 'call' }); run(rx, 12.2, 12.4, quiet()); expect(rx.state.counts.meow).toBe(2); rx.dispose();
  });
  it('a landing throws a puff of snow, a sniff sends wisps to the stall, standing still settles flakes, zoomies leave a wake', () => {
    const a = mk(); run(a.rx, 10, 10.1, quiet()); bus.emit('pounce:land'); run(a.rx, 10.1, 10.4, quiet()); expect(live(a.rx)).toBeGreaterThan(8); run(a.rx, 10.4, 13, quiet()); expect(live(a.rx)).toBe(0); a.rx.dispose();
    const b = mk(); run(b.rx, 10, 10.1, quiet()); run(b.rx, 10.1, 11.5, () => ({ ...quiet(), sniffTime: 1 })); expect(live(b.rx)).toBeGreaterThan(3); expect(b.audio.log.osc).toBeGreaterThan(0); b.rx.dispose();
    const c = mk(); run(c.rx, 10, 10.2, quiet()); run(c.rx, 10.2, 16, (t) => ({ ...quiet(), idleTime: t - 10 })); expect(live(c.rx)).toBeGreaterThan(5); expect(SHARED.heed).toBeGreaterThan(10); c.rx.dispose();
    const d = mk(); run(d.rx, 10, 10.1, quiet()); run(d.rx, 10.1, 11.2, { ...quiet(), wasZooming: true }); expect(live(d.rx)).toBeGreaterThan(4); d.rx.dispose();
  });
  it('reduced motion is sounds only, and a muted or bare audio object stays safe', () => {
    const { rx, audio } = mk({ motion: false }); run(rx, 10, 10.1, quiet()); bus.emit('tip:did', { id: 'call' }); bus.emit('pounce:land'); run(rx, 10.1, 13, quiet()); expect(live(rx)).toBe(0); expect(audio.log.osc).toBeGreaterThan(0); expect(rx.boost(cat.x + 5, cat.z, 11)).toBe(1); rx.dispose();
    const m = mk({ audio: { ...fakeAudio(), isMuted: () => true } }); run(m.rx, 10, 10.1, quiet()); bus.emit('tip:did', { id: 'call' }); run(m.rx, 10.1, 14, quiet()); m.rx.dispose();
    const bare = mk({ audio: {} }); run(bare.rx, 10, 10.1, quiet()); bus.emit('tip:did', { id: 'call' }); run(bare.rx, 10.1, 14, quiet()); bare.rx.dispose();
  });
  it('lite draws fewer points', () => { const a = mk({ rung: 'lite' }); const b = mk(); expect(a.rx.ps.length).toBeLessThan(b.rx.ps.length); a.rx.dispose(); b.rx.dispose(); });
});
