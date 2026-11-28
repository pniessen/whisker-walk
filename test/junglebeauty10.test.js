// The Jungle lodge, beauty pass 10: the shared rules.
import { describe, it, expect } from 'vitest';
import * as B from '../src/world/junglebeauty10.js';

describe('coherence rules', () => {
  it('holds the glow load at the budget', () => {
    expect(B.glowScale(3)).toBe(1); expect(B.glowScale(B.CAP.load * 2)).toBeCloseTo(0.5);
    const col = new Float32Array([1, 1, 1]); const pos = new Float32Array([0, 0, 0]);
    expect(B.glowLoad(col, pos, new Float32Array([2]), 1, 0, 0)).toBeCloseTo(4); expect(B.glowLoad(col, pos, new Float32Array([2]), 1, 50, 0)).toBe(0);
  });
  it('eases down fast and up slowly', () => { expect(B.easeScale(1, 0.5, 0.15)).toBeCloseTo(0.5); expect(B.easeScale(0.5, 1, 0.15)).toBeLessThan(0.7); });
  it('lets at most two event effects run, her own first', () => {
    const o = B.eventSlots({ voice: true, golden: true, weather: true, surprise: true }); expect([o.voice, o.golden, o.weather, o.surprise]).toEqual([true, true, false, false]);
    const w = B.eventSlots({ voice: false, golden: false, weather: true, surprise: true }); expect(w.weather && w.surprise).toBe(true);
  });
  it('caps the voices at four (three for ambient)', () => {
    const v = B.createVoiceCap(); let n = 0; for (let i = 0; i < 6; i++) v.play(0, 1, () => n++); expect(n).toBe(3);
    v.play(1, 1, () => n++); v.play(1, 1, () => n++); expect(n).toBe(4); v.play(1, 2.5, () => n++); expect(n).toBe(5);
  });
});
