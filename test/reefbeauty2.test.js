import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
stubCanvasDocument();
const S = await import('../src/world/reefsound.js');
const B = await import('../src/world/reefbeauty2.js');

const fakeAudio = (muted) => {
  const made = { osc: 0, ctx: 0 };
  const node = () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, start() {}, stop() {} });
  const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator() { made.osc++; return node(); } };
  return { made, isMuted: () => muted, getContext() { made.ctx++; return ac; }, getMaster: () => ({}) };
};

describe('reef beauty pass 2', () => {
  it('sound: a ping, a song and a burble come on their own lattices, and nothing at all while muted', () => {
    const a = fakeAudio(false); const s = S.createReefSound({ audio: a });
    for (let i = 0; i < 4000; i++) s.update(0.1); // 400 s
    expect(s.pings).toBeGreaterThan(20); expect(s.songs).toBeGreaterThan(5); expect(s.blips).toBeGreaterThan(50);
    expect(S.pingIn(3)).toBe(S.pingIn(3));
    const m = fakeAudio(true); const q = S.createReefSound({ audio: m });
    for (let i = 0; i < 2000; i++) q.update(0.1);
    expect(m.made.ctx).toBe(0); expect(m.made.osc).toBe(0); expect(q.pings + q.songs).toBe(0);
  });
  it('shoal: glints are a pure function of time, stay under the surface and over the sand, and a cat scatters them', () => {
    const o = {}; const p = {};
    for (const s of B.SHOALS) for (let i = 0; i < s.n; i++) for (let t = 0; t < 200; t += 7.3) { B.glintPose(s, i, t, o); expect(o.y).toBeLessThan(8.5); expect(o.flash).toBeGreaterThan(0); expect(B.glintPose(s, i, t, p).x).toBe(o.x); }
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x4aa6a8, 6, 40);
    const b = B.createReefBeauty2({ scene, rung: 'high' });
    const cat = new THREE.Vector3(-9, 3, 22);
    b.update(0.05, 0, null, null);
    const before = b.shoal.geometry.attributes.position.array.slice();
    for (let i = 0; i < 40; i++) b.update(0.05, 0, cat, null, true);
    const after = b.shoal.geometry.attributes.position.array;
    let moved = 0; for (let i = 0; i < before.length; i += 3) if (Math.hypot(after[i] - before[i], after[i + 2] - before[i + 2]) > 0.8) moved++;
    expect(moved).toBeGreaterThan(5);
    expect(b.counts.fish).toBe(260); expect(B.shoalSize('lite')).toBeLessThan(B.shoalSize('high') / 2);
    b.dispose();
  });
  it('reduced motion: nothing moves and no trail is drawn', () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x4aa6a8, 6, 40);
    const b = B.createReefBeauty2({ scene, reducedMotion: true });
    b.update(0.1, 0, new THREE.Vector3(-9, 3, 22), null, true);
    const a = b.shoal.geometry.attributes.position.array.slice();
    b.update(5, 9, new THREE.Vector3(-9, 3, 22), null, true);
    expect(Array.from(b.shoal.geometry.attributes.position.array)).toEqual(Array.from(a));
    expect(b.group.children).not.toContain(b.trail);
    b.dispose();
  });
});
