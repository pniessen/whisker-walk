import { describe, it, expect } from 'vitest';
import { cameraOffset, moveDirection, viewForward } from '../src/catcam.js';

describe('cameraOffset', () => {
  it('sits behind and above the cat at yaw 0 (camera at +z looking toward -z)', () => {
    const off = cameraOffset(0, 0.15);
    expect(off.z).toBeGreaterThan(3);
    expect(Math.abs(off.x)).toBeLessThan(0.001);
    expect(off.y).toBeGreaterThan(1.5);
  });

  it('orbits with yaw', () => {
    const off = cameraOffset(Math.PI / 2, 0.15);
    expect(off.x).toBeGreaterThan(3);
    expect(Math.abs(off.z)).toBeLessThan(0.001);
  });

  it('higher pitch raises the camera', () => {
    expect(cameraOffset(0, 0.8).y).toBeGreaterThan(cameraOffset(0, 0).y);
  });
});

describe('viewForward', () => {
  it('points from camera toward the cat horizontally', () => {
    const f = viewForward(0);
    expect(f.z).toBeCloseTo(-1);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBe(0);
  });
});

describe('moveDirection', () => {
  it('returns zero with no keys', () => {
    expect(moveDirection(new Set(), 0).length()).toBe(0);
  });

  it('ArrowUp at yaw 0 moves away from the camera (-z)', () => {
    const d = moveDirection(new Set(['ArrowUp']), 0);
    expect(d.z).toBeCloseTo(-1);
  });

  it('movement rotates with camera yaw', () => {
    const d = moveDirection(new Set(['ArrowUp']), Math.PI / 2);
    expect(d.x).toBeCloseTo(-1);
    expect(Math.abs(d.z)).toBeLessThan(0.001);
  });

  it('diagonals are normalized', () => {
    const d = moveDirection(new Set(['ArrowUp', 'ArrowRight']), 0);
    expect(d.length()).toBeCloseTo(1);
  });
});
