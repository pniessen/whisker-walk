import { describe, it, expect } from 'vitest';
import { eventsAt, flashAt, FORCES } from '../src/world/lighthouseweather.js';

describe('lighthouse weather as events (pass 6)', () => {
  it('is a pure function of clock, hour and seed, all in 0..1', () => {
    for (const seed of [0, 7, 1234]) for (let t = 0; t < 900; t += 7) {
      const a = eventsAt(t, { hour: 12, seed });
      expect(a).toEqual(eventsAt(t, { hour: 12, seed }));
      for (const k of ['storm', 'fog', 'sunset', 'stars', 'flash']) { expect(a[k]).toBeGreaterThanOrEqual(0); expect(a[k]).toBeLessThanOrEqual(1); }
    }
  });
  it('a storm and a fog never add past one, and some walk has each', () => {
    let storm = false; let fog = false;
    for (let seed = 0; seed < 40; seed++) for (let t = 0; t < 600; t += 5) {
      const e = eventsAt(t, { hour: 8, seed });
      if (e.storm > 0.9) storm = true;
      if (e.fog > 0.9) fog = true;
      expect(e.storm + e.fog).toBeLessThanOrEqual(1.0001);
    }
    expect(storm && fog).toBe(true);
  });
  it('sunset follows the real clock; stars only at night', () => {
    expect(eventsAt(50, { hour: 18.5 }).sunset).toBeGreaterThan(0.9);
    expect(eventsAt(50, { hour: 12 }).sunset).toBe(0);
    expect(eventsAt(50, { hour: 12, night: 0 }).stars).toBe(0);
    let any = false;
    for (let seed = 0; seed < 30; seed++) if (eventsAt(50, { hour: 23, night: 1, seed }).stars > 0.9) any = true;
    expect(any).toBe(true);
  });
  it('reduced motion has no timed events, forced ones show, lightning flashes exist', () => {
    for (let t = 0; t < 600; t += 5) { const e = eventsAt(t, { hour: 8, reducedMotion: true }); expect(e.storm + e.fog + e.flash).toBe(0); }
    for (const f of FORCES) expect(eventsAt(10, { force: f })[f === 'night' ? 'stars' : f]).toBe(1);
    expect(eventsAt(10, { force: 'off' }).storm).toBe(0);
    let flashes = 0; for (let t = 0; t < 60; t += 1 / 30) if (flashAt(t, 0, 0) === 1) flashes++;
    expect(flashes).toBeGreaterThan(0);
  });
});

describe('lighthouse weather adds no mesh, triangle or caster', () => {
  it('only two Points, restored on dispose', async () => {
    const THREE = await import('three');
    const { createLighthouseWeather } = await import('../src/world/lighthouseweather.js');
    globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' }) }) };
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf0c080, 45, 160);
    const sun = new THREE.DirectionalLight(0xffb066, 1.2); const fill = new THREE.HemisphereLight(0xaab4dc, 0x886644, 0.62);
    scene.add(sun, fill);
    const before = scene.children.length;
    const wx = createLighthouseWeather({ scene, sun, fill, force: 'storm', seed: 3 });
    expect(scene.children.length - before).toBe(2);
    expect(scene.children.filter((o) => o.isMesh).length).toBe(0);
    wx.update(0.03, 4.4, null, { x: 14, y: 0, z: 36 });
    expect(sun.intensity).toBeLessThan(1.2 * 0.6 + 1);
    expect(scene.fog.far).toBeLessThan(160);
    wx.dispose();
    expect(sun.intensity).toBeCloseTo(1.2, 5);
    expect(scene.fog.far).toBe(160);
    expect(scene.children.length).toBe(before);
  });
});
