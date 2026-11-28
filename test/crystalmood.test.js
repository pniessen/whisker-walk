// The Crystal Cave beauty pass 6: the six-minute mood cycle, the drafts, the linger song.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
stubCanvasDocument();
const M = await import('../src/world/crystalmood.js');

const fakeAudio = () => { const log = []; const node = () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, frequency: { value: 0, setTargetAtTime() {} }, connect() {}, start() {}, stop() {} }); const ac = { currentTime: 0, destination: {}, createGain: () => { log.push('g'); return node(); }, createOscillator: () => { log.push('o'); return node(); } }; return { log, getContext: () => ac, isMuted: () => false }; };
const tick = (mood, secs, cat, t0 = 0) => { for (let i = 0; i < secs * 30; i++) mood.update(1 / 30, t0 + i / 30, cat); };

describe('moods (beauty pass 6)', () => {
  it('weights always sum to 1, start calm, visit every mood in six minutes and blend over 15 s', () => {
    const seen = new Set();
    for (let t = 0; t < 720; t += 1) { const w = M.moodAt(t); expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6); w.forEach((v, i) => { if (v > 0.99) seen.add(i); }); }
    expect(M.moodAt(0)).toEqual([1, 0, 0, 0]); expect(seen.size).toBe(4);
    expect(M.moodAt(45)[0]).toBe(1); expect(M.moodAt(82)[0]).toBeGreaterThan(0); expect(M.moodAt(82)[0]).toBeLessThan(1); expect(M.moodAt(91)[1]).toBeGreaterThan(0.99);
    expect(M.moodAt(360)).toEqual(M.moodAt(0));
  });
  it('the draft comes and goes within 0..1', () => {
    let lo = 1; let hi = 0; for (let t = 0; t < 600; t += 0.5) { const w = M.windAt(t); lo = Math.min(lo, w.s); hi = Math.max(hi, w.s); expect(Number.isFinite(w.ang)).toBe(true); }
    expect(lo).toBeLessThan(0.05); expect(hi).toBeGreaterThan(0.9);
  });
  it('reduced motion is calm only: no points, no mood, no node; low draws fewer points', () => {
    const scene = new THREE.Scene(); const a = fakeAudio();
    const r = M.createCrystalMood({ scene, audio: a, reducedMotion: true }); tick(r, 3, { x: 0, y: 0, z: 0 }, 135);
    expect(r.state.mood).toEqual([1, 0, 0, 0]); expect(r.points.visible).toBe(false); expect(a.log.length).toBe(0); r.dispose();
    const hi = M.createCrystalMood({ scene: new THREE.Scene(), tier: { name: 'high', shadows: true } }); const lo = M.createCrystalMood({ scene: new THREE.Scene(), tier: { name: 'low', shadows: false } });
    expect(lo.points.geometry.attributes.position.count).toBeLessThan(hi.points.geometry.attributes.position.count);
  });
  it('a muted walk makes no node', () => {
    const a = fakeAudio(); a.isMuted = () => true; const m = M.createCrystalMood({ scene: new THREE.Scene(), audio: a }); tick(m, 5, { x: 0, y: 0, z: 0 }, 135); expect(a.log.length).toBe(0);
  });
  it('lingering 6 s by a hero crystal lights it and sings once; walking breaks it', () => {
    const h = M.heroSites()[0]; const a = fakeAudio(); const m = M.createCrystalMood({ scene: new THREE.Scene(), audio: a });
    const cat = { x: h.x - 1.5, y: 0, z: h.z }; m.update(1 / 30, 0, cat); tick(m, 4, cat, 0.1); expect(m.songs).toBe(0); expect(m.state.ling).toBe(0);
    tick(m, 4, cat, 4.2); expect(m.songs).toBe(1); expect(m.state.ling).toBeGreaterThan(0.9);
    tick(m, 6, cat, 8.3); expect(m.songs).toBe(1);
    m.update(1 / 30, 15, { x: cat.x + 1, y: 0, z: cat.z }); expect(m.state.ling).toBeLessThanOrEqual(1);
    const far = { x: 40, y: 0, z: 40 }; const m2 = M.createCrystalMood({ scene: new THREE.Scene(), audio: a }); m2.update(1 / 30, 0, far); tick(m2, 10, far, 0.1); expect(m2.songs).toBe(0);
  });
  it('the dream dims the lights and darkens the fog; leaving restores', () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x442244, 5, 38); const l = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(l);
    const m = M.createCrystalMood({ scene }); tick(m, 2, { x: 0, y: 0, z: 0 }, 315); expect(l.intensity).toBeLessThan(0.6); expect(scene.fog.far).toBeLessThan(30);
    m.dispose(); expect(l.intensity).toBe(1); expect(scene.fog.far).toBe(38);
  });
});
