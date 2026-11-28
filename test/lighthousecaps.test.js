import { describe, it, expect } from 'vitest';
import { createCaps, CAPS } from '../src/world/lighthousecaps.js';

describe('lighthouse pass 10 caps', () => {
  it('keeps the two highest active events at full and eases the rest to 30%', () => {
    const c = createCaps();
    c.level('voice', 1); c.level('golden', 1); c.level('weather', 1); c.level('surprise', 1);
    for (let i = 0; i < 400; i++) c.frame(0.05);
    expect(c.k('voice')).toBeCloseTo(1, 2); expect(c.k('golden')).toBeCloseTo(1, 2);
    expect(c.k('weather')).toBeCloseTo(CAPS.low, 1); expect(c.k('surprise')).toBeCloseTo(CAPS.low, 1);
    c.level('voice', 0); for (let i = 0; i < 400; i++) c.frame(0.05);
    expect(c.k('weather')).toBeCloseTo(1, 2); expect(c.k('surprise')).toBeCloseTo(CAPS.low, 1);
  });
  it('scales the glow when the sum passes the budget, never under the floor', () => {
    const c = createCaps(); c.glow('a', 0.9); c.glow('b', 0.9); for (let i = 0; i < 400; i++) c.frame(0.05);
    expect(c.gk()).toBeCloseTo(CAPS.budget / 1.8, 1);
    c.glow('c', 5); for (let i = 0; i < 400; i++) c.frame(0.05); expect(c.gk()).toBeCloseTo(CAPS.floor, 2);
  });
  it('allows four accents at once and skips the fifth', () => {
    const c = createCaps(); for (let i = 0; i < 4; i++) expect(c.slot(10, 2)).toBe(true);
    expect(c.slot(10.5, 2)).toBe(false); expect(c.slot(12.5, 2)).toBe(true);
  });
});
