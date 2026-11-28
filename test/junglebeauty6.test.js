// The Jungle lodge, beauty pass 6: weather and atmosphere as events. Net zero triangles, no mesh, no caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const W = await import('../src/world/junglebeauty6.js');
const B = await import('../src/world/junglebeauty2.js');
const P = await import('../src/world/jungleplan.js');
const R = await import('../src/world/junglereact.js');

const mk = (o = {}) => B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });
const sum = (a) => a.reduce((m, v) => m + v, 0);
const dayOf = (p) => (p - 0.12 + 1) % 1 * R.DAY; // the walk time whose day phase is p
const cat = { x: -3, z: 27 };

describe('the events', () => {
  it('golden hour is before the dusk, the dawn mist at dawn, the storm is the shower', () => {
    expect(W.goldenAt(dayOf(0.66))).toBeGreaterThan(0.95); expect(W.goldenAt(dayOf(0.42))).toBe(0); expect(W.goldenAt(dayOf(0.05))).toBe(0);
    const dawn = W.eventsAt(dayOf(0.05), 0, R.dayAt(dayOf(0.05))); expect(dawn.mist).toBeGreaterThan(0.9);
    const storm = W.eventsAt(dayOf(0.05), 1, R.dayAt(dayOf(0.05))); expect(storm.storm).toBe(1); expect(storm.mist).toBeLessThan(0.4);
  });
  it('steam rises only after the rain, while the rainbow stands', () => {
    const c = P.rainSchedule.cycleAt(100); const tb = c.bowAt + 5;
    expect(W.eventsAt(tb, 0, R.dayAt(tb)).steam).toBeGreaterThan(0.3); expect(W.eventsAt(c.rainAt + 10, 1, R.dayAt(10)).steam).toBe(0);
  });
  it('the gust is rare, seeded, brief, and a front that moves along the wind', () => {
    let on = 0; for (let t = 0; t < 3000; t += 0.5) if (W.gustEvent(t).on) on++;
    expect(on).toBeGreaterThan(0); expect(on * 0.5 / 3000).toBeLessThan(0.1); expect(W.gustEvent(500)).toEqual(W.gustEvent(500));
    expect(W.gustEvent(10, 8).on).toBe(true); expect(W.gustEvent(20, 8).on).toBe(W.gustEvent(20).on);
    expect(W.gustFront(6, 0)).toBeGreaterThan(W.gustFront(2, 0)); expect(W.gustWave(0, 0)).toBe(1); expect(W.gustWave(30, 0)).toBeLessThan(0.01);
  });
  it('rolls thunder two or three times a shower, and none in the dry', () => {
    const st = { at: -1, n: 0 }; let n = 0; for (let t = 0; t < 40; t += 0.1) if (W.thunderDue(st, t, 1) > 0) n++;
    expect(n).toBe(3); const dry = { at: -1, n: 0 }; for (let t = 0; t < 40; t += 0.1) expect(W.thunderDue(dry, t, 0)).toBe(-1);
  });
});

describe('the points', () => {
  it('the lower rungs keep fewer, and the points are all inside the one motes mesh', () => {
    expect(W.weatherPoints('lite').length).toBeLessThan(W.weatherPoints('low').length); expect(W.weatherPoints('low').length).toBeLessThan(W.weatherPoints('high').length);
    expect(W.weatherPoints('high').length).toBe(138);
  });
  const at = (w, ev, i = 0) => { const p = W.weatherPoints('high').find((q) => q.w === w && q.i === i); return W.weatherAt(p, 33, { storm: 0, steam: 0, mist: 0, gold: 0, gust: 0, gustAge: 3, ...ev }, cat, { size: 1 }); };
  it('each point shows only for its own event', () => {
    for (const [w, e] of [['bank', 'mist'], ['dew', 'mist'], ['gold', 'gold'], ['fly', 'gold'], ['drop', 'storm'], ['eave', 'storm'], ['steam', 'steam'], ['leaf', 'gust']]) {
      let off = 0; let on = 0; for (let i = 0; i < 6; i++) { off += at(w, {}, i).g; on += at(w, { [e]: 1 }, i).g; }
      expect(off, w).toBe(0); expect(on, w).toBeGreaterThan(0);
    }
  });
  it('banks, steam and sheen stay clear of the cat, the roof streams off the veranda front', () => {
    for (let i = 0; i < 7; i++) { const b = at('bank', { mist: 1 }, i); expect(Math.hypot(b.x - cat.x, b.z - cat.z)).toBeGreaterThanOrEqual(4.99); }
    for (let i = 0; i < 8; i++) { const s = at('steam', { steam: 1 }, i); expect(Math.hypot(s.x - cat.x, s.z - cat.z)).toBeGreaterThanOrEqual(4.49); }
    for (let i = 0; i < 11; i++) { const e = at('eave', { storm: 1 }, i); expect(e.x).toBeGreaterThan(P.LODGE.x0); expect(e.x).toBeLessThan(P.LODGE.x1); expect(e.y).toBeLessThanOrEqual(3.3); }
  });
  it('the cloth bows in the rain and bends in the gust front only near it', () => {
    expect(W.swayBoost({ storm: 1, gust: 0, gustAge: 0 }, 0, 0, cat)).toBeGreaterThan(0.5);
    const ev = { storm: 0, gust: 1, gustAge: 3.2 }; const front = cat.x * 0 + 0; void front;
    expect(W.swayBoost(ev, cat.x, cat.z, cat)).toBeGreaterThan(1); expect(W.swayBoost(ev, cat.x + 40, cat.z + 28, cat)).toBeLessThan(0.1);
  });
  it('the grade greens the storm, warms the gold, and does nothing in plain weather', () => {
    const mkL = () => ({ fog: { color: new THREE.Color(0.5, 0.7, 0.5), near: 10, far: 80 }, sun: { color: new THREE.Color(1, 1, 1), intensity: 1 }, fill: { color: new THREE.Color(1, 1, 1), intensity: 1 }, scene: { backgroundIntensity: 1, environmentIntensity: 1, background: {} } });
    const plain = mkL(); W.gradeWeather({ storm: 0, gold: 0, mist: 0, steam: 0 }, plain); expect(plain.fog.near).toBe(10); expect(plain.sun.intensity).toBe(1);
    const storm = mkL(); W.gradeWeather({ storm: 1, gold: 0, mist: 0, steam: 0 }, storm); expect(storm.sun.intensity).toBeLessThan(0.7); expect(storm.fog.near).toBeLessThan(10); expect(storm.fog.color.g).toBeGreaterThan(storm.fog.color.r);
    const gold = mkL(); W.gradeWeather({ storm: 0, gold: 1, mist: 0, steam: 0 }, gold); expect(gold.sun.color.r).toBeGreaterThan(gold.sun.color.b + 0.2);
  });
});

describe('in the place', () => {
  it('adds no mesh and no caster; the downpour, the gust and the golden hour light the motes', () => {
    const scene = new THREE.Scene(); const a = mk({ scene }); expect(scene.children).toHaveLength(3);
    const col = a.motes.geometry.attributes.color.array; const c = { x: -3, z: 27 };
    const lit = (t, rain) => { for (let i = 0; i < 5; i++) a.update(1 / 30, t + i / 30, c, rain, null); return sum(Array.from(col)); };
    const calm = lit(dayOf(0.3), 0); const rainy = lit(dayOf(0.3), 1); expect(rainy).not.toBe(calm);
    a.trigger('gust', dayOf(0.3) + 100); const gusty = lit(dayOf(0.3) + 103, 0); expect(gusty).toBeGreaterThan(calm * 0.5);
    const gold = lit(dayOf(0.66), 0); expect(gold).not.toBe(calm);
  });
  it('is still in reduced motion', () => {
    const r = mk({ reducedMotion: true }); const col = r.motes.geometry.attributes.color.array; const before = Array.from(col); r.update(1 / 30, 50, cat, 1, null); expect(Array.from(col)).toEqual(before);
  });
  it('speaks only through optional-safe audio', () => {
    const a = mk({ audio: null }); for (let t = 0; t < 40; t += 0.5) a.update(0.5, t, cat, 1, null);
    const b = mk({ audio: { getContext: () => null } }); b.update(1 / 30, 3, cat, 1, null);
  });
});
