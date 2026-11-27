import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SPECS, createPathRide, stepPath, posAt, pathLength, hopOffSpot, withStops } from '../src/world/pathride.js';

const ring = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 15 }, { x: 0, z: 15 }];
const line = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 30, z: 10 }];
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pathFor = (spec) => (spec.loop ? ring : line);

function drive(spec, path, seed, steps, dt = 1 / 30) {
  const rnd = rng(seed);
  let r = createPathRide(path, spec);
  const out = [];
  for (let i = 0; i < steps; i++) {
    r = stepPath(r, { fwd: rnd() * 2 - 1, side: rnd() * 2 - 1 }, i % 7 === 0 ? dt * 5 : dt, spec, path);
    out.push(r);
  }
  return out;
}

describe('pathride', () => {
  for (const id of Object.keys(SPECS)) {
    it(`${id}: random stick never leaves the path`, () => {
      const spec = SPECS[id];
      const path = pathFor(spec);
      const L = pathLength(path, spec.loop);
      for (const r of drive(spec, path, 7, 5000)) {
        expect(Math.abs(r.lat)).toBeLessThanOrEqual(spec.laneHalf + 1e-9);
        expect(r.s).toBeGreaterThanOrEqual(0);
        expect(r.s).toBeLessThanOrEqual(L + 1e-9);
        expect(r.v).toBeGreaterThanOrEqual(spec.vMin - 1e-9);
        expect(r.v).toBeLessThanOrEqual(spec.vMax + 1e-9);
        expect(Number.isFinite(r.x + r.z + r.heading)).toBe(true);
      }
    });
    it(`${id}: same input, same result`, () => {
      const spec = SPECS[id];
      expect(drive(spec, pathFor(spec), 3, 800)).toEqual(drive(spec, pathFor(spec), 3, 800));
    });
  }

  it('a loop is closed and wraps', () => {
    const L = pathLength(ring, true);
    expect(L).toBe(70);
    const a = posAt(ring, 0, 0, true), b = posAt(ring, L, 0, true);
    expect(b.x).toBeCloseTo(a.x); expect(b.z).toBeCloseTo(a.z);
    let r = createPathRide(ring, SPECS.boat);
    let laps = 0, prev = r.s;
    for (let i = 0; i < 6000; i++) { r = stepPath(r, { fwd: 0, side: 0 }, 1 / 30, SPECS.boat, ring); if (r.s < prev) laps++; prev = r.s; }
    expect(laps).toBeGreaterThanOrEqual(1);
  });

  it('the sled steers in its lane and the boat does not', () => {
    let r = createPathRide(ring, SPECS.sled);
    for (let i = 0; i < 90; i++) r = stepPath(r, { fwd: 0, side: 1 }, 1 / 30, SPECS.sled, ring);
    expect(r.lat).toBeCloseTo(1.5);
    let b = createPathRide(ring, SPECS.boat);
    for (let i = 0; i < 90; i++) b = stepPath(b, { fwd: 0, side: 1 }, 1 / 30, SPECS.boat, ring);
    expect(b.lat).toBe(0);
  });

  it('the bumper ride reverses at the end and returns', () => {
    const L = pathLength(line, false);
    let r = createPathRide(line, SPECS.cart);
    let sawEnd = false, back = false;
    for (let i = 0; i < 20000; i++) {
      r = stepPath(r, { fwd: 1, side: 0 }, 1 / 30, SPECS.cart, line);
      if (r.dir < 0) sawEnd = true;
      if (sawEnd && r.s < 1) { back = true; break; }
      expect(r.s).toBeGreaterThanOrEqual(0); expect(r.s).toBeLessThanOrEqual(L);
    }
    expect(sawEnd && back).toBe(true);
  });

  it('stops dwell then pull away', () => {
    const spec = withStops(SPECS.cart, [{ name: 'mid', s: 12, dwell: 2 }]);
    let r = createPathRide(line, spec);
    let held = 0, named = null, i = 0;
    for (; i < 3000; i++) {
      r = stepPath(r, { fwd: 0, side: 0 }, 1 / 30, spec, line);
      if (r.stop === 'mid' && r.dwell > 0) { named = r.stop; held++; expect(r.v).toBe(0); expect(r.s).toBe(12); }
      if (named && r.dwell === 0 && r.s > 13) break;
    }
    expect(named).toBe('mid');
    expect(held / 30).toBeGreaterThan(1.8);
    expect(held / 30).toBeLessThan(2.2);
    expect(r.s).toBeGreaterThan(13);
  });

  it('hopOffSpot always returns a spot', () => {
    const spots = [{ x: 0, z: 5 }, { x: 25, z: 12 }, { x: 10, z: -4 }];
    for (const r of drive(SPECS.sled, ring, 11, 300)) {
      const s = hopOffSpot(r, spots);
      expect(spots).toContain(s);
      for (const o of spots) expect((s.x - r.x) ** 2 + (s.z - r.z) ** 2).toBeLessThanOrEqual((o.x - r.x) ** 2 + (o.z - r.z) ** 2 + 1e-9);
    }
    expect(hopOffSpot({ x: 1, z: 2 }, [])).toEqual({ x: 1, z: 2 });
  });

  it('the source has no forbidden calls', () => {
    const src = readFileSync(new URL('../src/world/pathride.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.random|Date\b|performance|THREE|^\s*import\s/m);
  });
});
