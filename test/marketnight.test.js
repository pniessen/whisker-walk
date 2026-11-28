import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clockNight, nightOn, lanterns, createNight, NIGHT_N } from '../src/world/marketnight.js';

describe('Market beauty pass 8: night life', () => {
  it('is night from 8 pm to 5 am by the clock, and only when asked on a dated walk', () => {
    expect(clockNight(new Date(2026, 9, 15, 21))).toBe(true);
    expect(clockNight(new Date(2026, 9, 15, 3))).toBe(true);
    expect(clockNight(new Date(2026, 9, 15, 12))).toBe(false);
    expect(nightOn({ now: new Date(2026, 9, 15, 0) })).toBe(false);
    expect(nightOn({ night: true })).toBe(true);
    expect(nightOn({ force: 'night' })).toBe(true);
  });
  it('has lanterns for the moths and pools, and a bounded pool', () => {
    expect(lanterns().length).toBeGreaterThan(8);
    expect(Object.values(NIGHT_N).reduce((a, b) => a + b, 0)).toBeLessThan(80);
  });
  it('grades the light and puts it back', () => {
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    const fill = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
    const react = { uMkTone: { value: new THREE.Vector3(1, 1, 1) }, uMkDay: { value: new THREE.Vector2(1, 0) } };
    const n = createNight({ night: true, sun, fill, reducedMotion: true, scene: { background: new THREE.Color(0x88aaff) } });
    n.grade(0.1, react, false);
    expect(sun.intensity).toBeLessThan(1);
    expect(fill.intensity).toBeGreaterThan(0.5);
    expect(react.uMkTone.value.z).toBeGreaterThan(react.uMkTone.value.x);
    expect(react.uMkDay.value.y).toBe(1);
    n.restore();
    expect(sun.intensity).toBe(1);
    expect(fill.intensity).toBe(0.5);
    const day = createNight({ night: false, sun });
    expect(day.grade(1, react, false)).toBe(0);
  });
});
