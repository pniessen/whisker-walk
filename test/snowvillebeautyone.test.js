import { describe, it, expect } from 'vitest';
import { gustAt, flakeAt } from '../src/world/snowvillelight.js';

describe('snowville beauty pass 1: wind gusts', () => {
  it('is calm at time 0 (reduced motion stands still) and always between 0 and 1', () => {
    expect(gustAt(0)).toBe(0);
    let peak = 0;
    for (let t = 0; t < 600; t += 0.5) { const g = gustAt(t); expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1); peak = Math.max(peak, g); }
    expect(peak).toBeGreaterThan(0.2); // there are gusts
  });
  it('keeps every flake within a few metres of where it would be without wind', () => {
    for (let t = 0; t < 300; t += 7) for (let i = 0; i < 60; i++) {
      const a = flakeAt(i, t, 0, 0); expect(Number.isFinite(a.x + a.y + a.z)).toBe(true);
      expect(Math.abs(a.x)).toBeLessThan(40);
    }
  });
});
