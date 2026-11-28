import { describe, it, expect } from 'vitest';
import * as B from '../src/world/greenhousebudget.js';

describe('greenhouse pass 10 budgets', () => {
  it('caps the shaft gain and the light sum', () => {
    expect(B.capGain(2.4)).toBe(B.GAIN_CAP);
    expect(B.capGain(1)).toBe(1);
    expect(B.lightShare(2)).toBe(1);
    expect(B.lightShare(4.4)).toBeCloseTo(0.5);
  });
  it('lets at most two events show at full strength, by priority', () => {
    const a = B.allocate({ voice: true, gold: true, weather: true, night: true });
    expect(a.voice).toBe(1); expect(a.gold).toBe(1); expect(a.weather).toBe(B.LOW); expect(a.night).toBe(B.LOW);
    expect(B.allocate({ voice: false, gold: false, weather: true, night: true }).night).toBe(1);
    expect(B.allocate({ voice: true, gold: false, weather: true, night: true }).goldMayStart).toBe(false);
    expect(B.allocate({ voice: false, gold: false, weather: true, night: false }).goldMayStart).toBe(true);
  });
  it('allows at most four voices at once (three for ambient ticks) and frees them with time', () => {
    let now = 1;
    const audio = { getContext: () => ({ currentTime: now }) };
    expect([1, 2, 3, 4, 5].map(() => B.voiceFree(audio, 2))).toEqual([true, true, true, true, false]);
    expect(B.voiceFree(audio, 2, false)).toBe(false);
    now = 4;
    expect(B.voiceFree(audio, 2, false)).toBe(true);
  });
});
