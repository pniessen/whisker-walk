import { describe, it, expect } from 'vitest';
import { validateGround } from '../src/ground.js';
import { validateTraversal } from '../src/traversal.js';
import * as L from '../src/world/lighthousespike.js';

const area = L.spikeArea();

describe('the Lighthouse spike data', () => {
  it('ground validates (ceilings clear, nothing steeper than 1 in 3)', () => expect(validateGround(L.SPIKE_GROUND)).toEqual([]));
  it('the traversal validates', () => {
    expect(validateTraversal(L.SPIKE_TRAVERSAL, { ground: area.ground, bounds: L.SPIKE_BOUNDS, colliders: L.SPIKE_COLLIDERS })).toEqual([]);
  });
  it('three flights of at most 12 m, at about 1 in 3.3, climbing 6 to 13.5 through two landings', () => {
    const cs = area.traversal.crossings;
    expect(cs.map((c) => c.kind)).toEqual(['stair', 'stair', 'stair']);
    expect(cs.map((c) => c.ends[0].y)).toEqual([6, 8.5, 11]);
    expect(cs.map((c) => c.ends[1].y)).toEqual([8.5, 11, 13.5]);
    for (const c of cs) {
      expect(c.length).toBeLessThanOrEqual(12);
      const steepest = Math.max(...c.segs.map((s) => Math.abs(s.grade)));
      expect(steepest).toBeGreaterThan(0.25);
      expect(steepest).toBeLessThan(0.33);
    }
  });
  it('flights join at their landings', () => {
    const [a, b, c] = area.traversal.crossings;
    for (const [p, q] of [[a, b], [b, c]]) {
      expect(p.ends[1].x).toBe(q.ends[0].x);
      expect(p.ends[1].z).toBe(q.ends[0].z);
    }
  });
  it('the gallery is above the plateau, the cave floor is at 0 and its roof is a ceiling', () => {
    const g = area.ground;
    expect(g.y(L.TOWER.x + 4, L.TOWER.z)).toBe(13.5);
    expect(g.y(-10, -19)).toBe(0);
    expect(g.ceil(-10, -19)).toBe(2.6);
    expect(g.ceil(-20, -10)).toBe(Infinity);
    expect(g.y(-20, -10)).toBe(6);
  });
  it('the plateau cannot be stepped into the cave from above (its roof is not walkable)', () => {
    const g = area.ground;
    for (const z of [-21.5, -19, -16.5]) expect(g.canStep(-17, z, -15, z)).toBe(false);
    for (const x of [-14, -8]) { expect(g.canStep(x, -15, x, -17)).toBe(false); expect(g.canStep(x, -23, x, -21)).toBe(false); }
    expect(g.canStep(-3, -19, -10, -19)).toBe(true); // the mouth
  });
});
