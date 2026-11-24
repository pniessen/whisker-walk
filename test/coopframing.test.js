import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitsAt, neededLevel, maxSeparation, catPoints, easeLevel, createHeading, SAFE_W, SAFE_H } from '../src/coop/framing.js';
import { MAX_ZOOM_STEP } from '../src/camzoom.js';

// Couch play, milestone 1: the shared camera's maths. Computed from the live
// lens (vertical fov 70, the walk's pitch), never hard-coded.
const lens = (aspect = 16 / 9) => ({ pitch: 0.18, lookY: 0.6, fov: 70, aspect });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const midOf = (a, b) => V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);

describe('widening through the camera steps', () => {
  it('cats close together keep the step the kids chose', () => {
    const a = V(-1, 0, 0), b = V(1, 0, 0);
    expect(neededLevel(catPoints(a, b), 1, midOf(a, b), 0, lens())).toBe(1);
  });

  it('cats farther apart widen it, and the level it picks really fits them (and a little less does not)', () => {
    for (const gap of [12, 16, 22]) {
      const a = V(-gap / 2, 0, 3), b = V(gap / 2, 0, -2);
      const mid = midOf(a, b);
      const L = neededLevel(catPoints(a, b), 1, mid, 0, lens());
      expect(L).toBeGreaterThan(1);
      expect(fitsAt(catPoints(a, b), L + 1e-3, mid, 0, lens())).toBe(true);
      expect(fitsAt(catPoints(a, b), Math.max(1, L - 0.05), mid, 0, lens())).toBe(false);
    }
  });

  it('is monotone: the farther apart, the wider', () => {
    let last = 0;
    for (let gap = 2; gap <= 26; gap += 2) {
      const a = V(-gap / 2, 0, 0), b = V(gap / 2, 0, 0);
      const L = neededLevel(catPoints(a, b), 1, midOf(a, b), 0, lens());
      expect(L).toBeGreaterThanOrEqual(last);
      last = L;
    }
  });

  it('never goes past the widest step, even when the cats cannot fit', () => {
    const a = V(-80, 0, 0), b = V(80, 0, 0);
    expect(neededLevel(catPoints(a, b), 1, midOf(a, b), 0, lens())).toBe(MAX_ZOOM_STEP);
  });

  it('keeps both cats inside the 85 % x 80 % safe box', () => {
    const a = V(-9, 0, 2), b = V(8, 0, -3);
    const mid = midOf(a, b);
    const L = neededLevel(catPoints(a, b), 1, mid, 0, lens());
    expect(fitsAt(catPoints(a, b), L, mid, 0, lens())).toBe(true);
    expect(SAFE_W).toBe(0.85);
    expect(SAFE_H).toBe(0.8);
  });

  it('works from any quarter turn of the view', () => {
    const a = V(-6, 0, -5), b = V(6, 0, 5);
    const mid = midOf(a, b);
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const L = neededLevel(catPoints(a, b), 1, mid, yaw, lens());
      expect(fitsAt(catPoints(a, b), L, mid, yaw, lens()), `yaw ${yaw}`).toBe(true); // 12 m by 10 m fits within the widest step from every side
    }
  });
});

describe('how far apart two cats may stand', () => {
  it('is the width at the widest step, from the live lens, and grows with the picture\'s width', () => {
    const wide = maxSeparation(lens(16 / 9));
    expect(wide).toBeGreaterThan(20);
    expect(wide).toBeLessThan(35);
    expect(maxSeparation(lens(4 / 3))).toBeLessThan(wide);
    expect(maxSeparation(lens(21 / 9))).toBeGreaterThan(wide);
  });

  it('two cats exactly at the limit fit at the widest step, and a hand more does not', () => {
    const d = maxSeparation(lens());
    const a = V(-d / 2, 0, 0), b = V(d / 2, 0, 0);
    expect(fitsAt(catPoints(a, b), MAX_ZOOM_STEP, V(0, 0, 0), 0, lens())).toBe(true);
    const a2 = V(-d / 2 - 0.2, 0, 0), b2 = V(d / 2 + 0.2, 0, 0);
    expect(fitsAt(catPoints(a2, b2), MAX_ZOOM_STEP, V(0, 0, 0), 0, lens())).toBe(false);
  });
});

describe('the eased level', () => {
  it('widens quickly and closes slowly, and snaps under reduced motion', () => {
    const out = easeLevel(1, 3, 0.1, false);
    const back = 3 - easeLevel(3, 1, 0.1, false);
    expect(out - 1).toBeGreaterThan(back); // more of the way out in the same time
    expect(easeLevel(1, 3, 0.016, true)).toBe(3);
    expect(easeLevel(1, 3, 20, false)).toBe(3);
  });
});

describe('the view\'s heading', () => {
  it('starts on the nearest quarter and turns in quarters, left and right', () => {
    const h = createHeading(0.3);
    expect(h.square(0.3)).toBe(0);
    h.turn(1);
    expect(h.target).toBeCloseTo(Math.PI / 2, 10);
    h.turn(-1); h.turn(-1);
    expect(h.target).toBeCloseTo(-Math.PI / 2, 10);
    expect(createHeading().square(2.9)).toBeCloseTo(Math.PI, 10);
  });

  it('eases to the target in about half a second, and snaps under reduced motion', () => {
    const h = createHeading(0);
    h.turn(1);
    for (let i = 0; i < 30; i++) h.step(1 / 60, false); // half a second
    expect(h.yaw).toBeGreaterThan(Math.PI / 2 * 0.95);
    h.turn(1);
    h.step(1 / 60, true);
    expect(h.yaw).toBe(h.target);
  });
});
