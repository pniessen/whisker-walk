import { describe, it, expect } from 'vitest';
import { scentWarmth, trailCadence, objectiveDistance, QUEST_TRAIL_COLOR } from '../src/questscent.js';

describe('scentWarmth', () => {
  it('is 1 at or inside near, 0 at or beyond far, and between in between', () => {
    expect(scentWarmth(0)).toBe(1);
    expect(scentWarmth(4)).toBe(1);
    expect(scentWarmth(60)).toBe(0);
    expect(scentWarmth(200)).toBe(0);
    const mid = scentWarmth(32);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('warms monotonically as the cat closes in', () => {
    expect(scentWarmth(10)).toBeGreaterThan(scentWarmth(40));
  });

  it('returns 0 for hostile input rather than NaN', () => {
    for (const bad of [NaN, Infinity, -1, undefined, null, '12']) {
      expect(scentWarmth(bad)).toBe(0);
    }
  });
});

describe('trailCadence', () => {
  it('re-lays sooner when warm than when cold', () => {
    expect(trailCadence(0)).toBeLessThan(trailCadence(60));
  });

  it('never returns zero or a non-finite interval', () => {
    for (const d of [0, 4, 32, 60, 500, NaN, -1]) {
      const c = trailCadence(d);
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
    }
  });
});

describe('objectiveDistance', () => {
  it('reads "here" on top of the target and whole metres otherwise', () => {
    expect(objectiveDistance(0)).toBe('here');
    expect(objectiveDistance(1.9)).toBe('here');
    expect(objectiveDistance(23.4)).toBe('23 m');
    expect(objectiveDistance(23.6)).toBe('24 m');
  });

  it('returns null for hostile input rather than "NaN m"', () => {
    for (const bad of [NaN, Infinity, -1, undefined, null]) {
      expect(objectiveDistance(bad)).toBe(null);
    }
  });
});

describe('QUEST_TRAIL_COLOR', () => {
  it('is not the nose-trail yellow', () => {
    expect(QUEST_TRAIL_COLOR).not.toBe(0xf2e04e);
  });
});
