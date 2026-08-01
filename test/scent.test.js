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

  it('digById unearths a treat by id with no proximity check, sharing digAt\'s unearth path', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    const treat = scent.treats[1];
    expect(treat.mound.scale.y).toBe(0.25); // untouched mound, pre-dig
    const result = scent.digById(treat.id);
    expect(result).toBe(treat);
    expect(treat.dug).toBe(true);
    expect(treat.mound.scale.y).toBe(0.08); // same mound-open side effect as digAt
  });

  it('digById returns null for an already-dug id or an unknown id', () => {
    const scent = createScent(scene, AREA, () => 0.4);
    const treat = scent.treats[0];
    expect(scent.digById(treat.id)).toBe(treat);
    expect(scent.digById(treat.id)).toBe(null); // already dug
    expect(scent.digById('no-such-id')).toBe(null); // unknown id
  });

  it('nudges a treat that rolled onto a collider center clear of it and in bounds', () => {
    const area = {
      pois: [{ x: 0, z: 0 }],
      colliders: [{ x: 0, z: 0, r: 3 }],
      bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    };
    // constant rng => zero jitter => the treat rolls exactly onto the poi,
    // which sits dead-center on the collider.
    const scent = createScent(scene, area, () => 0.5);
    expect(scent.treats.length).toBeGreaterThan(0);
    for (const tr of scent.treats) {
      expect(Math.hypot(tr.x, tr.z)).toBeGreaterThanOrEqual(4.5);
      expect(tr.x).toBeGreaterThanOrEqual(area.bounds.minX);
      expect(tr.x).toBeLessThanOrEqual(area.bounds.maxX);
      expect(tr.z).toBeGreaterThanOrEqual(area.bounds.minZ);
      expect(tr.z).toBeLessThanOrEqual(area.bounds.maxZ);
    }
  });
});
