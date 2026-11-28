// The Fairground's beauty pass 6 (src/fairwx.js): weather and atmosphere as events, all pure functions of the weather and the clock.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gustAt, finaleAt, finaleLane, wantedLit, wxCounts } from '../src/fairwx.js';
import { createFairAlive } from '../src/fairalive.js';
import { FAIR_CLOCK } from '../src/world/fairkit.js';

describe('fair beauty pass 6', () => {
  it('gusts and finales are rare, brief and the same on every device', () => {
    let g = 0; let f = 0;
    for (let T = 0; T < 86400; T += 5) { if (gustAt(T) > 0) g++; if (finaleAt(T) >= 0) f++; }
    expect(g).toBeGreaterThan(0); expect(g / 17280).toBeLessThan(0.2); expect(f).toBeGreaterThan(0); expect(f / 17280).toBeLessThan(0.06);
    expect(gustAt(349)).toBeCloseTo(gustAt(349), 12); expect(gustAt(0.5)).toBeGreaterThanOrEqual(0);
    expect(finaleLane(0, 0)).toEqual({ k: 0, local: 0 }); expect(finaleLane(0, 1)).toBeNull();
  });
  it('a golden-hour walk climbs to night; other walks keep their lamps', () => {
    expect(wantedLit(0.6, 'sunset', 0)).toBeCloseTo(0.6, 6); expect(wantedLit(0.6, 'sunset', 400)).toBeCloseTo(0.95, 6);
    expect(wantedLit(0, 'clear', 400)).toBe(0); expect(wantedLit(1, 'rain', 400)).toBe(1);
  });
  it('rain brings the lights up and clearing fades them; no geometry is added; reduced motion adds no slots', () => {
    expect(wxCounts(1, true)).toEqual({ glow: 0, bits: 0, fire: 0 }); expect(wxCounts(0.25, false).fire).toBe(0);
    const sc = new THREE.Scene(); const w = { condition: 'rain', rainbowVisible: false, raining: true, isRaining() { return this.raining; } };
    const al = createFairAlive({ scene: sc, weather: w });
    let meshes = 0; sc.traverse((o) => { if (o.isMesh) meshes++; }); expect(meshes).toBe(0);
    for (let i = 0; i < 400; i++) al.update(1 / 10, 100 + i / 10, { x: 0, z: 30 }, FAIR_CLOCK.lit.value, 0, 0);
    expect(FAIR_CLOCK.lit.value).toBeGreaterThan(0.4);
    w.raining = false; w.rainbowVisible = true;
    for (let i = 0; i < 600; i++) al.update(1 / 10, 140 + i / 10, { x: 0, z: 30 }, FAIR_CLOCK.lit.value, 0, 0);
    expect(FAIR_CLOCK.lit.value).toBeLessThan(0.1);
  });
});
