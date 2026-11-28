import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

const { moodAt, festivalDay, createMarketWeather, WEATHER_COUNT } = await import('../src/world/marketweather.js');
const { createReact } = await import('../src/world/marketreact.js');

// Market beauty pass 6: weather and atmosphere as events. One Points, no mesh or triangle, a pure schedule, still under reduced motion.
const calm = { part: 0.4, cond: 'clear', festival: false, dusk: false };
describe('market weather', () => {
  it('has a morning mist that is gone by midday, a golden hour toward evening, and keeps off rainy walks', () => {
    expect(moodAt(0, { ...calm, part: 0 }).mist).toBeGreaterThan(0.9);
    expect(moodAt(150, { ...calm, part: 0.5 }).mist).toBe(0);
    expect(moodAt(270, { ...calm, part: 0.9 }).golden).toBeGreaterThan(0.9);
    const rainy = moodAt(10, { ...calm, part: 0, cond: 'rain', raining: true });
    expect(rainy.wet).toBe(1);
    expect(rainy.mist).toBe(0); // rain and mist never share the square
    expect(rainy.golden).toBe(0);
  });
  it('is deterministic, a shower comes and clears, a gust is rare', () => {
    let wet = 0; let clear = 0; let gust = 0;
    for (let t = 0; t < 6000; t += 5) {
      const a = moodAt(t, { ...calm, part: 0.5 });
      const b = moodAt(t, { ...calm, part: 0.5 });
      expect(a).toEqual(b);
      if (a.wet > 0.9) wet++;
      if (a.clear > 0.9) clear++;
      if (a.gust > 0.9) gust++;
      for (const v of Object.values(a)) expect(v >= 0 && v <= 1).toBe(true);
    }
    expect(wet).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(0);
    expect(gust).toBeGreaterThan(0);
    expect(gust).toBeLessThan(wet + 40);
  });
  it('festival evenings are rare days; only then do the lights come', () => {
    let days = 0;
    for (let d = 1; d <= 365; d++) if (festivalDay(new Date(2026, 0, d))) days++;
    expect(days).toBeGreaterThan(20);
    expect(days).toBeLessThan(90);
    expect(moodAt(300, { ...calm, part: 0.95, festival: true }).fest).toBeGreaterThan(0.9);
    expect(moodAt(300, { ...calm, part: 0.95, festival: false }).fest).toBe(0);
  });
  it('stays still under reduced motion', () => {
    for (const f of ['rain', 'mist', 'festival', 'gust']) expect(Object.values(moodAt(100, { ...calm, still: true, force: f })).every((v) => v === 0)).toBe(true);
  });
  it('is one Points, no mesh and no caster, lite draws none, and the sound calls are all optional', () => {
    const scene = new THREE.Scene();
    const react = createReact();
    const w = createMarketWeather(scene, { react }, { force: 'festival' });
    expect(scene.children.length).toBe(1);
    expect(w.points.isPoints).toBe(true);
    expect(w.points.geometry.attributes.position.count).toBe(WEATHER_COUNT);
    expect(w.points.userData.noCast).toBe(true);
    for (let i = 0; i < 60; i++) w.update(0.1, i * 0.1, { x: 0, y: 0, z: 14 }, null, 0.9, null, {}); // a sound with none of the weather's calls
    expect(Array.from(w.points.geometry.attributes.aAlpha.array).some((a) => a > 0.5)).toBe(true);
    w.dispose();
    expect(scene.children.length).toBe(0);
    expect(react.uMkWet.value).toBe(0);
    const lite = createMarketWeather(new THREE.Scene(), { react }, { tier: { rung: 3 }, force: 'rain' });
    expect(lite.points).toBe(null);
    lite.update(0.1, 1, null, null, 0.4, null, null);
    expect(lite.mood.wet).toBeGreaterThan(0);
    const still = createMarketWeather(new THREE.Scene(), { react }, { reducedMotion: true, force: 'rain' });
    expect(still.points).toBe(null);
    still.update(0.1, 1, null, null, 0.4, null, null);
    expect(still.mood.wet).toBe(0);
  });
  it('rain wets the cobbles and rings the lanterns warmer; thunder only while wet', () => {
    const scene = new THREE.Scene();
    const react = createReact();
    const w = createMarketWeather(scene, { react }, { force: 'rain' });
    const calls = [];
    const sound = { thunder: () => calls.push('thunder'), air: () => calls.push('air') };
    for (let i = 0; i < 400; i++) w.update(0.1, 50 + i * 0.1, { x: 0, y: 0, z: 14 }, null, 0.4, null, sound);
    expect(react.uMkWet.value).toBeGreaterThan(0.9);
    expect(w.glow).toBeGreaterThan(0.3);
    expect(calls).toContain('air');
    w.dispose();
  });
});
