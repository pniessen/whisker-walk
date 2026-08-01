import { describe, it, expect } from 'vitest';
import { joystickVector, isStalkMag, classifyTouch } from '../src/touchinput.js';

describe('joystickVector', () => {
  it('zeroes out within the dead zone', () => {
    // offset (5,5) from origin, maxR 60 -> mag ~0.117, below dead 0.15
    const v = joystickVector(100, 100, 105, 105, 60, 0.15);
    expect(v).toEqual({ x: 0, z: 0, mag: 0 });
  });

  it('clamps magnitude to 1 when the thumb moves beyond maxR', () => {
    const v = joystickVector(0, 0, 200, 0, 60);
    expect(v.mag).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it('preserves direction signs (screen-right/down -> positive x/z, and mirrored)', () => {
    const v = joystickVector(0, 0, 30, 30, 60);
    expect(v.x).toBeGreaterThan(0);
    expect(v.z).toBeGreaterThan(0);

    const v2 = joystickVector(0, 0, -30, -30, 60);
    expect(v2.x).toBeLessThan(0);
    expect(v2.z).toBeLessThan(0);
  });
});

describe('isStalkMag', () => {
  it('is true only strictly inside the (0, threshold) band, false at both edges', () => {
    expect(isStalkMag(0)).toBe(false);
    expect(isStalkMag(0.2)).toBe(true);
    expect(isStalkMag(0.45)).toBe(false);
    expect(isStalkMag(0.6)).toBe(false);
  });
});

describe('classifyTouch', () => {
  it('classifies a quick, small movement as a tap', () => {
    expect(classifyTouch(0, 200, 0, 0, 5, 5)).toBe('tap');
  });

  it('treats the 300ms boundary as a drag, not a tap', () => {
    expect(classifyTouch(0, 299, 0, 0, 5, 5)).toBe('tap');
    expect(classifyTouch(0, 300, 0, 0, 5, 5)).toBe('drag');
  });

  it('treats the 10px boundary as a drag, not a tap', () => {
    expect(classifyTouch(0, 100, 0, 0, 9.9, 0)).toBe('tap');
    expect(classifyTouch(0, 100, 0, 0, 10, 0)).toBe('drag');
  });
});
