import { describe, it, expect } from 'vitest';
import { createGround } from '../src/ground.js';
import { createTraversal } from '../src/traversal.js';
import { floodTraversal } from './helpers/traversalflood.js';

// Pure: the ground and traversal modules only. S and P as in src/world/traversalyard.js.
const P = (x, z, y) => ({ x, z, y });
const S = (x, z) => ({ x, z });

// Two levels: a roof at y 3 over x -6..0, the yard (y 0) everywhere else.
const ground = createGround({
  strips: [{ x0: -6, z0: 0, x1: 0, z1: 0, width: 6, y0: 3, y1: 3 }],
});
const areaWith = (spec) => ({
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  ground,
  traversal: createTraversal(spec, ground),
});

describe('floodTraversal', () => {
  it('a drop landing beside a wall joins the level it lands on, not the roof', () => {
    const f = floodTraversal(areaWith({ drops: [{ id: 'd', from: S(-0.6, 0), to: S(0.12, 0) }] }), { step: 0.25 });
    expect(f.levelOf(f.regionAt(0.12, 0, 0))).toBe(0);
    expect([...f.edges.get(f.regionAt(-1, 0, 3))]).toContain(f.regionAt(2, 0, 0));
  });
  it('a move end off the grid throws, naming it', () => {
    expect(() => floodTraversal(areaWith({ drops: [{ id: 'far', from: S(-1, 0), to: S(99, 0) }] })))
      .toThrow('floodTraversal: drop far to has no cell at its level');
  });
  it('a crossing end with no ground at its height throws', () => {
    expect(() => floodTraversal(areaWith({ crossings: [{ id: 'c', kind: 'plank', points: [P(-2, 0, 5), P(2, 0, 5)] }] })))
      .toThrow('floodTraversal: crossing c end 0 has no cell at its level');
  });
});
