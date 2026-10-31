import { describe, it, expect } from 'vitest';
import { MAP_RADIUS_M, mapRadiusFor, toMap, pinToRim } from '../src/ui/minimapmath.js';

const view = { cx: 0, cz: 0, heading: 0, mode: 'north', radiusM: 35, radiusPx: 55 };

describe('toMap', () => {
  it('north mode: a point 10 m north of the cat is straight up', () => {
    const p = toMap(0, -10, view);
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeCloseTo(-10 * 55 / 35);
    expect(p.inside).toBe(true);
  });

  it('north mode ignores heading', () => {
    expect(toMap(10, 0, { ...view, heading: 1.2 })).toEqual(toMap(10, 0, view));
  });

  it('turn mode: whatever is ahead is up', () => {
    // heading PI/2 means forward is world -x
    const p = toMap(-10, 0, { ...view, mode: 'turn', heading: Math.PI / 2 });
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeLessThan(0);
  });

  it('turn mode: behind is down', () => {
    const p = toMap(10, 0, { ...view, mode: 'turn', heading: Math.PI / 2 });
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeGreaterThan(0);
  });

  it('turn mode: the camera\'s right is screen right', () => {
    // facing -z (heading 0), world +x is on the right
    const p = toMap(10, 0, { ...view, mode: 'turn', heading: 0 });
    expect(p.u).toBeGreaterThan(0);
    expect(p.v).toBeCloseTo(0);
  });

  it('is relative to the cat, not the world origin', () => {
    const p = toMap(5, -20, { ...view, cx: 5, cz: -10 });
    expect(p.u).toBeCloseTo(0);
    expect(p.v).toBeCloseTo(-10 * 55 / 35);
  });

  it('outside the radius is flagged', () => {
    expect(toMap(0, -60, view).inside).toBe(false);
  });
});

describe('pinToRim', () => {
  it('keeps the bearing and lands on the rim', () => {
    const p = pinToRim({ u: 300, v: -400 }, 55, 6);
    expect(Math.hypot(p.u, p.v)).toBeCloseTo(49);
    expect(Math.atan2(p.v, p.u)).toBeCloseTo(Math.atan2(-400, 300));
  });

  it('leaves inside points alone', () => {
    expect(pinToRim({ u: 10, v: -20 }, 55, 6)).toEqual({ u: 10, v: -20 });
  });
});

describe('mapRadiusFor', () => {
  it('falls back to the default radius', () => {
    expect(MAP_RADIUS_M).toBe(35);
    expect(mapRadiusFor('nowhere')).toBe(35);
  });
});
