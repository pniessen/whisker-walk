// The Jungle lodge, beauty pass 3: the jungle reacts to the cat and lives (brushing, ripples, petals, the day, the day's voice). No triangle, mesh or caster added.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const R = await import('../src/world/junglereact.js');
const B = await import('../src/world/junglebeauty2.js');
const S = await import('../src/world/junglesparkle.js');
const P = await import('../src/world/jungleplan.js');

const mk = (o = {}) => B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });
const pos = (a) => [...a.sway.geometry.attributes.position.array];

describe('the day', () => {
  it('turns through a misty dawn, a hot noon and a humid dusk, all in range, starting in the morning', () => {
    let dawn = 0; let noon = 0; let dusk = 0;
    for (let t = 0; t < R.DAY; t += 3) { const d = R.dayAt(t); dawn = Math.max(dawn, d.dawn); noon = Math.max(noon, d.noon); dusk = Math.max(dusk, d.dusk); expect(d.warm.every((v) => v >= 0 && v <= 1.01)).toBe(true); expect(d.shaft).toBeGreaterThan(0.3); }
    expect(dawn).toBeGreaterThan(0.9); expect(noon).toBeGreaterThan(0.9); expect(dusk).toBeGreaterThan(0.9);
    expect(R.dayAt(0).dawn).toBeGreaterThan(R.dayAt(0).dusk);
    expect(R.dayAt(R.DAY * 0.3).shaft).toBeGreaterThan(R.dayAt(0).shaft); // noon shafts are the strong ones
    expect(R.dayAt(R.DAY * 0.66).glow).toBeGreaterThan(R.dayAt(R.DAY * 0.3).glow); // the lanterns glow most at dusk
  });
});

describe('brushing', () => {
  it('parts the vines and leaves she walks past, and lets them swing back when she goes', () => {
    const a = mk(); const rest = pos(a);
    const vine = a.react.length ? a.sway.geometry.attributes.position : null; expect(vine).not.toBeNull();
    const plan = B.beauty2Plan(); const v = plan.vines[0];
    let t = 0; const cat = { x: v.x + 0.4, z: v.z };
    for (let i = 0; i < 20; i++) { t += 1 / 30; cat.x -= 0.03; a.update(1 / 30, t, cat, 0, null); }
    expect(Math.max(...a.react)).toBeGreaterThan(0.3);
    const near = pos(a);
    for (let i = 0; i < 300; i++) { t += 1 / 30; a.update(1 / 30, t, { x: 500, z: 500 }, 0, null); }
    expect(Math.max(...a.react)).toBeLessThan(0.05);
    expect(near).not.toEqual(rest);
  });
  it('moves nothing in reduced motion', () => {
    const a = mk({ reducedMotion: true }); const s0 = pos(a);
    a.update(1 / 30, 3, { x: -8, z: 22 }, 0, null);
    expect(pos(a)).toEqual(s0); expect(Math.max(...a.react)).toBe(0);
  });
});

describe('ripples and petals', () => {
  it('opens rings where she wades and nowhere on dry land', () => {
    const pool = R.createPool();
    const dry = { x: 0, z: 30 };
    expect(P.riverDist(dry.x, dry.z)).toBeGreaterThan(P.RIVER_W);
    pool.step(1, dry, 0, 1 / 30, true); expect(pool.rings.some((r) => r.on)).toBe(false);
    // find a point in the river
    let wet = null; for (let z = -40; z < 40 && !wet; z += 0.5) for (let x = -40; x < 40 && !wet; x += 0.5) if (P.riverDist(x, z) < P.RIVER_W * 0.5) wet = { x, z };
    expect(wet).not.toBeNull();
    expect(pool.step(1, wet, 0, 1 / 30, true)).toBe('splash'); expect(pool.rings.some((r) => r.on)).toBe(true);
    const o = { x: 0, y: 0, z: 0, g: 0 }; pool.advance(0.6); pool.ringPoint(pool.rings.find((r) => r.on), 0, o); expect(o.g).toBeGreaterThan(0.1);
    pool.advance(2); expect(pool.rings.some((r) => r.on)).toBe(false);
  });
  it('drops rings round her in a shower', () => {
    const pool = R.createPool(); pool.step(5, { x: 0, z: 30 }, 1, 1 / 30, false); expect(pool.rings.some((r) => r.on)).toBe(true);
  });
  it('bursts petals from a shrub she touches, then lets it rest', () => {
    const pool = R.createPool(); const shrubs = B.beauty2Plan().shrubs; const s = shrubs[0];
    const rgb = () => [1, 0, 0.5];
    expect(pool.touch(1, { x: s.x + 0.2, z: s.z }, shrubs, rgb)).toBe(true);
    expect(pool.touch(2, { x: s.x + 0.2, z: s.z }, shrubs, rgb)).toBe(false);
    const o = { x: 0, y: 0, z: 0, g: 0 }; pool.advance(0.5); pool.petalPoint(pool.burstSet[0], 3, o); expect(o.g).toBeGreaterThan(0.2); expect(o.y).toBeGreaterThan(P.jungleY(o.x, o.z));
    expect(pool.touch(R.PETALS.rest + 5, { x: s.x, z: s.z }, shrubs, rgb)).toBe(true);
  });
  it('in the whole life, a shrub touch lights petal points', () => {
    const a = mk(); const s = B.beauty2Plan().shrubs[0]; const col = a.motes.geometry.attributes.color.array;
    const sum = () => col.reduce((n, v) => n + v, 0);
    a.update(1 / 30, 1, { x: s.x + 5, z: s.z }, 0, null); const before = sum();
    a.update(1 / 30, 1.03, { x: s.x, z: s.z }, 0, null); a.update(1 / 30, 1.2, { x: s.x, z: s.z }, 0, null);
    expect(sum()).toBeGreaterThan(before);
  });
});

describe('the cost', () => {
  it('adds no mesh, no triangle and no point beyond the pooled few', () => {
    const scene = new THREE.Scene(); const a = B.createJungleBeauty2({ scene, tier: { name: 'high' } });
    expect(scene.children).toHaveLength(3);
    const base = a.counts.points; expect(base).toBeLessThan(400); // pass 5 added the creatures and the light bloom (about 36 points); pass 6 the weather points (138: rain, mist, gold, gust), all pooled in this one Points; the count is fixed by the rung, not by the date or the weather
    expect(a.counts.swayTriangles).toBe(mk().counts.swayTriangles);
  });
  it('keeps LITE small', () => { expect(mk({ tier: { name: 'low', rung: 5, shadows: false } }).counts.points).toBeLessThan(mk().counts.points); });
});

describe('the sound', () => {
  const fake = (muted = false) => {
    const made = { osc: 0, buf: 0 };
    const node = () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {}, type: '' });
    const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createOscillator: () => { made.osc++; return node(); }, createGain: node, createBiquadFilter: node, createBufferSource: () => { made.buf++; return node(); }, createBuffer: () => ({ getChannelData: () => new Float32Array(8000) }) };
    return { made, audio: { getContext: () => ac, isMuted: () => muted, getMaster: () => ({}) } };
  };
  it('rustles as she brushes the leaves, croaks at dusk, and is silent when muted', () => {
    const f = fake(); const a = mk({ audio: f.audio }); const v = B.beauty2Plan().vines[0]; let t = 0; const cat = { x: v.x + 0.5, z: v.z };
    for (let i = 0; i < 30; i++) { t += 1 / 30; cat.x -= 0.03; a.update(1 / 30, t, cat, 0, null); }
    expect(f.made.buf).toBeGreaterThan(0);
    const g = fake(true); const m = mk({ audio: g.audio }); t = 0; const c2 = { x: v.x + 0.5, z: v.z };
    for (let i = 0; i < 30; i++) { t += 1 / 30; c2.x -= 0.03; m.update(1 / 30, t, c2, 0, null); }
    for (let tt = R.DAY * 0.6; tt < R.DAY * 0.8; tt += 1) m.update(1, tt, { x: 0, z: 0 }, 0, null);
    expect(g.made.osc + g.made.buf).toBe(0);
  });
  it('is about more at dusk: frogs join the crickets', () => {
    const f = fake(); const a = mk({ audio: f.audio }); for (let t = R.DAY * 0.62; t < R.DAY * 0.82; t += 1) a.update(1, t, { x: 0, z: 0 }, 0, null);
    expect(f.made.osc).toBeGreaterThan(40);
  });
});

describe('the fireflies and butterflies', () => {
  it('swirl in toward her when she comes near, and the butterflies scatter from her', () => {
    const air = S.createJungleAir({ scene: new THREE.Scene(), tier: { name: 'high' } });
    const f0 = [...air.fireflies.geometry.attributes.position.array];
    const h = S.sparklePlan().fireflies[0]; const cat = { x: h.x + 3, z: h.z };
    for (let t = 0; t < 4; t += 1 / 30) air.update(1 / 30, t, cat, 0);
    const f1 = air.fireflies.geometry.attributes.position.array;
    expect(Math.hypot(f1[0] - cat.x, f1[2] - cat.z)).toBeLessThan(Math.hypot(f0[0] - cat.x, f0[2] - cat.z));
  });
});

describe('the day grades the light', () => {
  it('warms and dims the sun at dusk, brightens it at noon, thins the haze at dawn, and puts everything back', () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x88aa88, 30, 110);
    const sun = new THREE.DirectionalLight(0xfff0d0, 2); const fill = new THREE.HemisphereLight(0xffffff, 0x445544, 1);
    const a = B.createJungleBeauty2({ scene, tier: { name: 'high' }, sun, fill });
    a.update(1 / 30, R.DAY * 0.3, { x: 0, z: 0 }, 0, null); const noon = sun.intensity;
    a.update(1 / 30, R.DAY * 0.66, { x: 0, z: 0 }, 0, null); const dusk = sun.intensity; const duskG = sun.color.g;
    a.update(1 / 30, 1, { x: 0, z: 0 }, 0, null);
    expect(noon).toBeGreaterThan(2); expect(dusk).toBeLessThan(2); expect(duskG).toBeLessThan(0.94); expect(scene.fog.near).toBeLessThan(30);
    a.dispose(); expect(sun.intensity).toBe(2); expect(scene.fog.near).toBe(30); expect(fill.intensity).toBe(1);
  });
  it('leaves the light alone in reduced motion', () => {
    const sun = new THREE.DirectionalLight(0xfff0d0, 2); const a = B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: true, sun });
    a.update(1 / 30, R.DAY * 0.66, { x: 0, z: 0 }, 0, null); expect(sun.intensity).toBe(2);
  });
});
