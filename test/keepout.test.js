import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { keepOutPoint } from '../src/keepout.js';

// Literal shapes, the same numbers the Pines' ISLAND_KEEP_OUT will carry: the
// lake and the bay as solid boxes, and the bridge as a capsule.
const KO = {
  rects: [{ minX: 26, maxX: 86, minZ: 8, maxZ: 66 }, { minX: 0, maxX: 30, minZ: 5, maxZ: 44 }],
  capsules: [{ x1: 20.56, z1: 18.08, x2: 10.0, z2: 4.0, r: 1.5 }],
  margin: 0.6,
};
const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const AREA = { bounds: BOUNDS, keepOut: KO };
const EPS = 1e-9;

function rectGap(r, x, z) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}
function segGap(c, x, z) {
  const sx = c.x2 - c.x1, sz = c.z2 - c.z1;
  const t = Math.max(0, Math.min(1, ((x - c.x1) * sx + (z - c.z1) * sz) / (sx * sx + sz * sz)));
  return Math.hypot(x - (c.x1 + sx * t), z - (c.z1 + sz * t));
}
function outsideAll(p) {
  return KO.rects.every((r) => rectGap(r, p.x, p.z) >= KO.margin - EPS)
    && KO.capsules.every((c) => segGap(c, p.x, p.z) >= c.r - EPS);
}
function insideInset(p) {
  return p.x >= BOUNDS.minX + 0.5 && p.x <= BOUNDS.maxX - 0.5
    && p.z >= BOUNDS.minZ + 0.5 && p.z <= BOUNDS.maxZ - 0.5;
}

describe('keepOutPoint', () => {
  it('no keep-out leaves every point alone', () => {
    const plain = { bounds: BOUNDS };
    for (const [x, z] of [[0, 0], [40, 40], [28, 28], [-49.9, 49.9], [12.3456789, -7.1]]) {
      expect(keepOutPoint(plain, x, z)).toEqual({ x, z });
    }
    expect(keepOutPoint(undefined, 3, 4)).toEqual({ x: 3, z: 4 });
  });

  it('a point in the lake goes to a shore inside the bounds, never out past them', () => {
    // (40, 40): the nearest way out of the lake is west, into the bay, so the
    // settle passes have to carry it on out of the bay as well.
    const a = keepOutPoint(AREA, 40, 40);
    expect(outsideAll(a)).toBe(true);
    expect(insideInset(a)).toBe(true);
    // (45, 45): east (x 86.6) and south (z 66.6) are out of bounds, so it
    // goes west, to a spot already clear of the bay.
    const b = keepOutPoint(AREA, 45, 45);
    expect(b.x).toBeCloseTo(25.4, 9);
    expect(b.z).toBe(45);
    expect(outsideAll(b)).toBe(true);
  });

  it('a point on the bridge\'s land end goes out sideways', () => {
    // Half a metre off the land end, square to the bridge's bearing (0.6, 0.8).
    const p = keepOutPoint(AREA, 10.4, 3.7);
    expect(outsideAll(p)).toBe(true);
    expect(p.x).toBeCloseTo(11.2, 9);
    expect(p.z).toBeCloseTo(3.1, 9);
    // The push is across the bridge, not along it.
    expect((p.x - 10.4) * 0.6 + (p.z - 3.7) * 0.8).toBeCloseTo(0, 9);
  });

  it('a point where the bay\'s and the lake\'s margins meet the capsule ends outside all three', () => {
    for (const [x, z] of [[20.56, 18.08], [21.5, 19], [27, 9], [28, 28], [25.7, 7.6]]) {
      const p = keepOutPoint(AREA, x, z);
      expect(outsideAll(p)).toBe(true);
      expect(insideInset(p)).toBe(true);
    }
  });

  it('a point outside every shape is unchanged', () => {
    for (const [x, z] of [[0, 0], [-20, 30], [24, 2], [31, 4], [-10, -40], [49, -49]]) {
      expect(keepOutPoint(AREA, x, z)).toEqual({ x, z });
    }
  });

  it('the same input always gives the same output', () => {
    for (const [x, z] of [[40, 40], [20.56, 18.08], [10.4, 3.7], [28, 28]]) {
      expect(keepOutPoint(AREA, x, z)).toEqual(keepOutPoint(AREA, x, z));
    }
  });

  it('never mentions the edition, so both editions keep cats out the same way', () => {
    const src = readFileSync(new URL('../src/keepout.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/edition/i);
  });
});
