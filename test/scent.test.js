import { describe, it, expect } from 'vitest';
import { rollTreats, trailPoints, createScent } from '../src/scent.js';

const POIS = [{ x: 10, z: 0 }, { x: -10, z: 10 }, { x: 0, z: -20 }];
const rngQueue = (...vals) => () => (vals.length ? vals.shift() : 0.5);
const scene = { add() {}, remove() {} };
const AREA = { pois: POIS, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };

describe('rollTreats', () => {
  it('buries the requested number near distinct pois', () => {
    const treats = rollTreats(() => 0.3, POIS, 2);
    expect(treats).toHaveLength(2);
    expect(treats[0].id).not.toBe(treats[1].id);
  });
});

describe('trailPoints', () => {
  it('produces steps points progressing from from to to', () => {
    const pts = trailPoints({ x: 0, z: 0 }, { x: 10, z: 0 }, () => 0.5, 7);
    expect(pts).toHaveLength(7);
    expect(pts[0].x).toBeLessThan(pts[6].x);
    for (const p of pts) expect(Math.abs(p.z)).toBeLessThan(2); // jitter bounded
  });
});

describe('createScent', () => {
  it('sniff finds a treat in range once, digAt unearths within 1.2', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    const treat = scent.treats[0];
    const near = { x: treat.x - 5, z: treat.z };
    expect(scent.sniff(near, 18)).toBe(treat);
    expect(scent.sniff(near, 18)).toBe(null); // trail already revealed
    expect(scent.digAt({ x: treat.x + 5, z: treat.z })).toBe(null); // too far
    expect(scent.digAt({ x: treat.x + 0.5, z: treat.z })).toBe(treat);
    expect(scent.digAt({ x: treat.x + 0.5, z: treat.z })).toBe(null); // already dug
  });

  it('sniff out of range finds nothing', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    expect(scent.sniff({ x: 999, z: 999 }, 18)).toBe(null);
  });
});
