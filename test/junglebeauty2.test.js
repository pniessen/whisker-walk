// The Jungle lodge, beauty pass 2: bold colour and light at play distance (still pieces, the swaying soup, shafts, motes, flock, sound).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const B = await import('../src/world/junglebeauty2.js');
const P = await import('../src/world/jungleplan.js');
const { loadJungleStages, ST } = await import('../src/world/junglestages.js');
await loadJungleStages();
const { build } = await import('../src/world/jungle.js');
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const solid = P.jungleColliders();

describe('the plan', () => {
  const plan = B.beauty2Plan();
  it('is seeded and carries every count the table promises', () => {
    expect(B.beauty2Plan()).toEqual(plan);
    expect(plan.vines).toHaveLength(B.B2.vines.high); expect(plan.canopy).toHaveLength(B.B2.canopy.high); expect(plan.leaves).toHaveLength(B.B2.leaves.high);
    expect(plan.shrubs).toHaveLength(B.B2.shrubs); expect(plan.mushrooms).toHaveLength(B.B2.mushrooms); expect(plan.shafts).toHaveLength(B.B2.shafts.high); expect(plan.glints).toHaveLength(B.B2.glints.high);
  });
  it('keeps shrubs, leaves and mushrooms off the solid things and the river, and shafts off the spawn court', () => {
    for (const o of [...plan.shrubs, ...plan.leaves, ...plan.mushrooms]) {
      expect(P.riverDist(o.x, o.z)).toBeGreaterThan(P.RIVER_W);
      for (const c of solid) expect(Math.hypot(c.x - o.x, c.z - o.z)).toBeGreaterThan(c.r);
    }
    for (const s of plan.shafts) expect(Math.hypot(s.x - P.RING.x, s.z - P.RING.z)).toBeGreaterThan(9);
  });
  it('uses many saturated colours', () => { expect(new Set(plan.vines.map((v) => v.pal)).size).toBeGreaterThanOrEqual(5); });
});

describe('the still pieces', () => {
  it('cost under 2,600 triangles and add no mesh to the build', () => {
    expect(B.beauty2Parts().reduce((n, [g]) => n + tris(g), 0)).toBeLessThan(2600);
    const scene = new THREE.Scene(); build(scene);
    let meshes = 0; scene.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(8);
  });
  it('is stage b that draws them', () => { expect(typeof ST.b.air).toBe('function'); });
});

describe('the life', () => {
  const mk = (o = {}) => B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });
  it('keeps less on the lower rungs, and no shafts or flock on LITE', () => {
    const hi = mk(); const lo = mk({ tier: { name: 'low', rung: 3, shadows: true } }); const lite = mk({ tier: { name: 'low', rung: 5, shadows: false } });
    expect(lo.counts.swayTriangles).toBeLessThan(hi.counts.swayTriangles); expect(lite.counts.swayTriangles).toBeLessThan(lo.counts.swayTriangles);
    expect(lite.shafts).toBeNull(); expect(lite.counts.birds).toBe(0); expect(hi.shafts).not.toBeNull();
  });
  it('adds two non-casting meshes and one Points, all cleaned away', () => {
    const scene = new THREE.Scene(); const a = B.createJungleBeauty2({ scene, tier: { name: 'high' } });
    expect(scene.children).toHaveLength(3);
    for (const o of [a.sway, a.shafts, a.motes]) expect(o.userData).toMatchObject({ noCast: true, noMerge: true });
    a.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('sways with time and holds perfectly still in reduced motion', () => {
    const a = mk(); const first = [...a.sway.geometry.attributes.position.array];
    a.update(1 / 30, 7, { x: 0, z: 0 }, 0, null);
    expect([...a.sway.geometry.attributes.position.array]).not.toEqual(first);
    const r = mk({ reducedMotion: true }); const s0 = [...r.sway.geometry.attributes.position.array];
    r.update(1 / 30, 7, { x: 0, z: 0 }, 0, null);
    expect([...r.sway.geometry.attributes.position.array]).toEqual(s0);
    expect(r.counts.birds).toBe(0);
  });
  it('sends a flock across in front of the camera, and the gust stays in range', () => {
    const a = mk(); const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 2.9, 33); cam.lookAt(0, 1, 28); cam.updateMatrixWorld();
    const nS = a.sway.geometry.attributes.position.count - a.counts.birds * 15; const pos = a.sway.geometry.attributes.position.array;
    for (let t = 0; t < 12; t += 1 / 30) a.update(1 / 30, t, { x: 0, z: 28 }, 0, cam);
    let live = 0; for (let i = nS * 3; i < pos.length; i++) if (pos[i] !== 0) live++;
    expect(live).toBeGreaterThan(0);
    for (let t = 0; t < 400; t += 0.7) { expect(B.gustAt(t)).toBeGreaterThanOrEqual(0); expect(B.gustAt(t)).toBeLessThanOrEqual(1); }
  });
  it('fades the motes in rain', () => {
    const a = mk(); const sum = () => a.motes.geometry.attributes.color.array.reduce((s, v) => s + v, 0);
    a.update(1 / 30, 3, { x: 0, z: 0 }, 0, null); const dry = sum(); a.update(1 / 30, 3, { x: 0, z: 0 }, 1, null);
    expect(sum()).toBeLessThan(dry);
  });
});

describe('the sound', () => {
  const fake = (muted = false) => {
    const made = { osc: 0, buf: 0 };
    const node = () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {}, type: '' });
    const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createOscillator: () => { made.osc++; return node(); }, createGain: node, createBiquadFilter: node, createBufferSource: () => { made.buf++; return node(); }, createBuffer: () => ({ getChannelData: () => new Float32Array(8000) }) };
    return { made, audio: { getContext: () => ac, isMuted: () => muted, getMaster: () => ({}) } };
  };
  it('chirps crickets and calls from afar in the dry, and is silent when muted', () => {
    const f = fake(); expect(B.cricketNote(f.audio, 1)).toBe(true); expect(f.made.osc).toBe(5);
    expect(B.cricketNote(fake(true).audio, 1)).toBe(false); expect(B.cricketNote(null, 1)).toBe(false);
    const a = B.createJungleBeauty2({ scene: new THREE.Scene(), audio: f.audio });
    const before = f.made.osc; for (let t = 0; t < 60; t += 1) a.update(1, t, { x: 0, z: 0 }, 0, null);
    expect(f.made.osc).toBeGreaterThan(before + 10);
    const g = fake(true); const m = B.createJungleBeauty2({ scene: new THREE.Scene(), audio: g.audio }); for (let t = 0; t < 60; t += 1) m.update(1, t, { x: 0, z: 0 }, 0, null);
    expect(g.made.osc).toBe(0);
  });
  it('lays a leaf-drip under the rain', () => {
    const f = fake(); const a = B.createJungleBeauty2({ scene: new THREE.Scene(), audio: f.audio });
    for (let t = 0; t < 10; t += 0.1) a.update(0.1, t, { x: 0, z: 0 }, 1, null);
    expect(f.made.buf).toBeGreaterThan(10);
  });
});
