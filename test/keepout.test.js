import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { keepOutPoint, dryGroundPoint, standSpot } from '../src/keepout.js';
import { STAND_ON } from '../src/world/gorgeshape.js';

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

  // Past a rect's corner its margin is round, so the way out is straight away
  // from the corner. An edge push there overshot: a stray walking round the
  // Black Mire's corner in the Pines jumped 0.092 m in a 0.087 m step.
  it("a point in a rect's rounded corner goes straight out from the corner", () => {
    const solo = { bounds: BOUNDS, keepOut: { rects: [{ minX: -32, maxX: -27, minZ: -120, maxZ: -6 }], margin: 0.6 } };
    for (const a of [0.2, 0.6, Math.PI / 4, 1.0, 1.4]) {
      const x = -27 + Math.cos(a) * 0.4, z = -6 + Math.sin(a) * 0.4;
      const p = keepOutPoint(solo, x, z);
      expect(p.x).toBeCloseTo(-27 + Math.cos(a) * 0.6, 9);
      expect(p.z).toBeCloseTo(-6 + Math.sin(a) * 0.6, 9);
    }
    // a walk round that corner never moves more than a step a frame
    const step = 2.6 / 30;
    let p = { x: -26.2, z: -9 };
    let worst = 0;
    const target = { x: -30, z: -4 };
    for (let i = 0; i < 300; i++) {
      const dx = target.x - p.x, dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < step) break;
      const q = keepOutPoint(solo, p.x + (dx / d) * step, p.z + (dz / d) * step);
      worst = Math.max(worst, Math.hypot(q.x - p.x, q.z - p.z));
      p = q;
    }
    // round the margin's curve a step can come out a hair longer (under 1%)
    expect(worst).toBeLessThanOrEqual(step * 1.01);
  });

  it('the same input always gives the same output', () => {
    for (const [x, z] of [[40, 40], [20.56, 18.08], [10.4, 3.7], [28, 28]]) {
      expect(keepOutPoint(AREA, x, z)).toEqual(keepOutPoint(AREA, x, z));
    }
  });

  // Where the bay's south edge (z 4.4 with the margin) meets the round land
  // end of the bridge, the pushes alternate between the two. They must reach
  // the corner rather than hand over to the ring search, which used to hop a
  // walking stray a quarter metre a frame here.
  it('a stray walking into the corner by the bridge foot never hops', () => {
    const step = 1.4 / 30; // a stray's wander speed, one frame
    const target = { x: 12.02, z: 4.19 };
    let p = { x: 2, z: 4.3 };
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      const dx = target.x - p.x, dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const q = keepOutPoint(AREA, p.x + (dx / d) * step, p.z + (dz / d) * step);
      expect(outsideAll(q)).toBe(true);
      worst = Math.max(worst, Math.hypot(q.x - p.x, q.z - p.z));
      p = q;
    }
    expect(worst).toBeLessThanOrEqual(step + 1e-6);
    // It ends wedged in the corner, where the edge meets the arc.
    expect(p.x).toBeCloseTo(10 - Math.sqrt(1.5 ** 2 - 0.4 ** 2), 3);
    expect(p.z).toBeCloseTo(4.4, 3);
  });

  it('a point in that corner goes to the nearest way out, not a ring step away', () => {
    // The true nearest clear point, by brute force: the first clear sample on
    // rings 1 mm apart.
    function nearestClear(x, z) {
      for (let r = 0; r <= 1; r += 0.001) {
        for (let k = 0; k < 720; k++) {
          const a = (k / 720) * Math.PI * 2;
          const q = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
          if (outsideAll(q)) return q;
        }
      }
      return null;
    }
    for (const [x, z] of [[8.55, 4.4], [8.57, 4.42], [8.6, 4.45], [8.65, 4.5], [8.7, 4.43]]) {
      const p = keepOutPoint(AREA, x, z);
      const best = nearestClear(x, z);
      expect(outsideAll(p)).toBe(true);
      expect(Math.hypot(p.x - best.x, p.z - best.z), `(${x}, ${z})`).toBeLessThan(0.1);
    }
  });

  it('never mentions the edition, so both editions keep cats out the same way', () => {
    const src = readFileSync(new URL('../src/keepout.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/edition/i);
  });
});

// Gorge part 2 (G7): onlyOn names the only places a cat may stand.
describe('keepOut.onlyOn', () => {
  const ONLY = { rects: [], capsules: [], margin: 0.4, onlyOn: STAND_ON };
  const GORGE = { bounds: BOUNDS, keepOut: ONLY };
  const onAllowed = (p) => STAND_ON.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ);

  it('onlyOn moves a point into the nearest allowed rectangle', () => {
    // (-30, 20) is on the west top: the floor rectangle is nearest
    const p = keepOutPoint(GORGE, -30, 20);
    expect(p.x).toBeGreaterThanOrEqual(-18 + ONLY.margin - EPS);
    expect(p.x).toBeLessThanOrEqual(2);
    expect(p.z).toBe(20);
    expect(p).toEqual({ x: -18 + ONLY.margin, z: 20 });
    // a point inside an allowed rectangle comes back untouched, the edges and
    // the seam between two rectangles included
    for (const [x, z] of [[-10, 0], [-44, -11], [20, -30], [22, 15], [-18, -11], [-17.95, 16], [2, 40]]) {
      expect(keepOutPoint(GORGE, x, z), `(${x}, ${z})`).toEqual({ x, z });
    }
    // an area without onlyOn gives every point back as before
    const plain = { bounds: BOUNDS, keepOut: { rects: [], capsules: [], margin: 0.4 } };
    for (const [x, z] of [[-30, 20], [40, 0], [10, 10]]) expect(keepOutPoint(plain, x, z)).toEqual({ x, z });
  });

  it('every point lands in an allowed rectangle, at the margin when moved', () => {
    for (let x = -49.5; x <= 49.5; x += 3.3) {
      for (let z = -49.5; z <= 49.5; z += 3.1) {
        const p = keepOutPoint(GORGE, x, z);
        expect(onAllowed(p), `(${x}, ${z})`).toBe(true);
        if (p.x !== x || p.z !== z) {
          const r = STAND_ON.find((q) => p.x >= q.minX && p.x <= q.maxX && p.z >= q.minZ && p.z <= q.maxZ);
          expect(Math.min(p.x - r.minX, r.maxX - p.x, p.z - r.minZ, r.maxZ - p.z)).toBeGreaterThanOrEqual(ONLY.margin - EPS);
        }
      }
    }
  });

  it("dryGroundPoint's water pushes and ring search keep to onlyOn too", () => {
    // A pond across the floor rectangle's whole width: the dry ground nearest
    // its centre is past the floor's edges, on the rock, and onlyOn pushes it
    // back into the pond, so the ring search has to find the dry floor north
    // or south of it (without onlyOn in its test it settled on the rock east
    // of the floor, at (2.85, 30)).
    const pond = { kind: 'circle', x: -8, z: 30, r: 10.5 };
    const area = { bounds: BOUNDS, waters: [pond], keepOut: ONLY };
    for (const [x, z] of [[-8, 30], [-16, 30], [-1, 30], [-30, 30], [10, 30]]) {
      const p = dryGroundPoint(area, x, z);
      expect(onAllowed(p), `(${x}, ${z}) -> (${p.x}, ${p.z})`).toBe(true);
      expect(Math.hypot(p.x - pond.x, p.z - pond.z), `(${x}, ${z})`).toBeGreaterThan(pond.r);
    }
  });

  it('standSpot moves a spot only where the area has onlyOn', () => {
    expect(standSpot(GORGE, -30, 20)).toEqual(keepOutPoint(GORGE, -30, 20));
    // the Pines' keep-out (no onlyOn): a puddle on the lake stays where it fell
    expect(standSpot(AREA, 40, 40)).toEqual({ x: 40, z: 40 });
    expect(standSpot({ bounds: BOUNDS }, 40, 40)).toEqual({ x: 40, z: 40 });
    expect(standSpot(undefined, 1, 2)).toEqual({ x: 1, z: 2 });
  });
});
