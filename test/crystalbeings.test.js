// The Crystal Cave beauty pass 5: living creatures (glow-moths, cave fish, crystal-sprites, the sleeping stone cat's eyes), the arrival bloom and the climbing chamber pitches.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
stubCanvasDocument();
const A = await import('../src/world/crystalalive.js');
const T = await import('../src/world/crystaltalesplan.js');
const D = await import('../src/world/crystaldecor.js');
const S = await import('../src/world/crystalsound.js');
const W = await import('../src/world/crystalwingplan.js');
const P = await import('../src/world/crystalplan.js');

const make = (opts = {}) => { const scene = new THREE.Scene(); const alive = A.createCrystalAlive({ scene, decor: null, tier: { name: 'high', shadows: true }, ...opts }); return { scene, alive, beings: scene.children.find((c) => c.name === 'crystal:beings') }; };
const cam = (x, z, tx, tz) => { const c = new THREE.PerspectiveCamera(); c.position.set(x, 2.6, z); c.lookAt(tx, 1, tz); c.updateMatrixWorld(); return c; };
const pt = (b, i) => ({ x: b.geometry.attributes.position.getX(i), y: b.geometry.attributes.position.getY(i), z: b.geometry.attributes.position.getZ(i), a: b.geometry.attributes.color.getW(i) });

describe('creatures (beauty pass 5)', () => {
  it('a moth circles its crystal, then settles on it and takes off again', () => {
    const site = A.mothSites()[0]; const seen = new Set();
    for (let t = 0; t < 60; t += 0.5) { const m = A.mothAt(0, t, site); seen.add(m.rest > 0.99 ? 'rest' : m.rest < 0.01 ? 'fly' : 'mid'); expect(Math.hypot(m.x - site.x, m.z - site.z)).toBeLessThan(site.s * 0.7 + 1.2); }
    expect(seen.has('rest') && seen.has('fly')).toBe(true);
  });
  it('the fish stay in the water and scatter from her paws', () => {
    for (let i = 0; i < 10; i++) { const f = A.fishAt(i, 40 + i, null, W.POOL); expect(Math.hypot(f.x - W.POOL.x, f.z - W.POOL.z)).toBeLessThanOrEqual(W.POOL.r * 0.88 + 1e-6); }
    const calm = A.fishAt(3, 50, null, W.POOL); const nearCat = { x: calm.x - 0.5, z: calm.z };
    const moved = A.fishAt(3, 50, nearCat, W.POOL);
    expect(moved.fright).toBeGreaterThan(0.5);
    expect(Math.hypot(moved.x - nearCat.x, moved.z - nearCat.z)).toBeGreaterThan(Math.hypot(calm.x - nearCat.x, calm.z - nearCat.z));
  });
  it('the sleeping stone cat\'s eyes glow only as she comes near', () => {
    expect(A.eyeGlow(T.STATUE.x + 1.5, T.STATUE.z)).toBeGreaterThan(0.95);
    expect(A.eyeGlow(T.STATUE.x + 30, T.STATUE.z)).toBe(0);
    expect(T.eyeSpots()).toHaveLength(2);
  });
  it('the stone cat stands clear of every decor site and collider', () => {
    for (const k of D.decorAvoid()) expect(Math.hypot(T.STATUE.x - k[0], T.STATUE.z - k[1])).toBeGreaterThanOrEqual(k[2] + T.STATUE.r - 0.3);
    for (const k of [...D.smallSites('high'), ...D.beautySites('high')]) expect(Math.hypot(T.STATUE.x - k.x, T.STATUE.z - k.z)).toBeGreaterThanOrEqual((k.rad || 1) + T.STATUE.r - 0.3);
  });
  it('a sprite peeks out when she is near and the view is turned away, and hides when she looks at it', () => {
    const k = A.spriteSites()[0]; const cat = { x: k.x + 5, y: 0, z: k.z };
    const away = make(); const look = make();
    for (let i = 0; i < 150; i++) { away.alive.update(1 / 30, 300 + i / 30, cat, cam(cat.x + 3, cat.z, cat.x + 10, cat.z)); look.alive.update(1 / 30, 300 + i / 30, cat, cam(cat.x + 3, cat.z, k.x, k.z)); }
    const idx = (b) => b.geometry.attributes.color.count; expect(idx(away.beings)).toBeGreaterThan(0);
    const first = 8 * 2 + 10 * 3 + 8; // worms, moths, fish come first; the sprites follow
    const alphaOf = (b) => pt(b, first).a + pt(b, first + 1).a;
    expect(alphaOf(away.beings)).toBeGreaterThan(0.5);
    expect(alphaOf(look.beings)).toBeLessThan(0.05);
  });
  it('reduced motion draws no creatures; lite draws fewer', () => {
    const r = make({ reducedMotion: true }); r.alive.update(1 / 30, 300, { x: 0, y: 0, z: 20 }, null); expect(r.beings.visible).toBe(false);
    expect(make({ tier: { name: 'low', rung: 5, shadows: false } }).alive.counts.moths).toBeLessThan(make().alive.counts.moths);
  });
  it('entering a chamber lights it up for a moment, and it fades', () => {
    const U = { cat: { value: new THREE.Vector4() }, catL: { value: new THREE.Vector4() }, rip: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, bloom: { value: new THREE.Vector4(-99, 0, 0, 0) } };
    const r = make({ decor: { uniforms: U } });
    r.alive.update(1 / 30, 10, { x: 0, y: 0, z: 28 }, null); r.alive.update(1 / 30, 10.1, { x: -14, y: 0, z: 4 }, null);
    expect(U.bloom.value.w).toBeGreaterThan(0.8);
    for (let i = 0; i < 150; i++) r.alive.update(1 / 30, 11 + i / 30, { x: -14, y: 0, z: 4 }, null);
    expect(U.bloom.value.w).toBe(0);
  });
});

describe('the soundscape tells the path (beauty pass 5)', () => {
  it('the chamber pitches climb along the way in', () => {
    const order = ['entry', 'rose', 'pool', 'gold', 'heart'].map((z) => S.ZONE_PITCH[z]);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    expect(S.HUE_PITCH.rose).toBeLessThan(S.HUE_PITCH.blue); expect(S.HUE_PITCH.blue).toBeLessThan(S.HUE_PITCH.gold); expect(S.HUE_PITCH.gold).toBeLessThan(S.HUE_PITCH.heart);
  });
  it('stepping into a chamber sings once and leaving it leaves a quiet tail; muted does neither', () => {
    const mk = (muted) => { const made = { osc: 0 }; const node = () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} } }); const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: () => { made.osc++; return { frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '', connect() {}, start() {}, stop() {} }; } }; return { made, audio: { getContext: () => ac, isMuted: () => muted } }; };
    const a = mk(false); const s = S.createCrystalSound({ audio: a.audio });
    s.update(0.1, { x: 0, z: 26 });
    for (let i = 0; i < 80; i++) s.update(0.1, { x: 0, z: 26 });
    s.update(0.1, { x: -16, z: 4 });
    expect(s.arrivals).toBe(1); expect(s.farewells).toBe(1);
    const m = mk(true); const q = S.createCrystalSound({ audio: m.audio });
    q.update(0.1, { x: 0, z: 26 }); q.update(0.1, { x: -16, z: 4 });
    expect(q.arrivals + q.farewells).toBe(0);
  });
});
