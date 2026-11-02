import { describe, it, expect } from 'vitest';
import { conformTriangles, MAX_PASSES } from '../src/world/meshconform.js';
import { findTJunctions } from './helpers/meshcheck.js';

// bins of [x,y,z] vertices -> { name: flat positions } for findTJunctions
const flat = (bins) => Object.fromEntries(Object.entries(bins).map(([k, v]) => [k, v.flat()]));
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const normalOf = (a, b, c) => cross(sub(b, a), sub(c, a));
const len = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const triangles = (verts) => Array.from({ length: verts.length / 3 }, (_, i) => verts.slice(3 * i, 3 * i + 3));
const area = (verts) => triangles(verts).reduce((s, [a, b, c]) => s + len(normalOf(a, b, c)) / 2, 0);
// A flat quad a b c d, as two triangles facing up (+y).
const quadUp = (a, b, c, d) => [a, b, c, a, c, d];

describe('conformTriangles', () => {
  // Square A (x 0..1) is one quad: 2 triangles, its east edge one segment.
  // Square B (x 1..2) is two strips: 4 triangles, a vertex at (1, 0, 0.5).
  const P = (x, z) => [x, 0, z];
  const A = quadUp(P(0, 0), P(0, 1), P(1, 1), P(1, 0));
  const B = [...quadUp(P(1, 0), P(1, 0.5), P(2, 0.5), P(2, 0)), ...quadUp(P(1, 0.5), P(1, 1), P(2, 1), P(2, 0.5))];

  it('two squares sharing an edge: one T-junction before, none after, same area and facing', () => {
    const bins = { a: A, b: B };
    expect(findTJunctions(flat(bins))).toHaveLength(1);
    const out = conformTriangles(bins);
    expect(Object.keys(out).sort()).toEqual(['a', 'b']);
    expect(findTJunctions(flat(out))).toEqual([]);
    for (const k of ['a', 'b']) {
      expect(Math.abs(area(out[k]) - area(bins[k])), k).toBeLessThan(1e-9);
      for (const [p, q, r] of triangles(out[k])) {
        const n = normalOf(p, q, r);
        expect(len(n), k).toBeGreaterThan(0);
        expect(n[1], k).toBeGreaterThan(0); // every source triangle faces +y
      }
    }
    // A was fanned from the opposite vertex: one more triangle; B untouched
    expect(out.a.length / 3).toBe(3);
    expect(out.b.length / 3).toBe(4);
  });

  it('quantises every position to eps, so equal points become bitwise equal', () => {
    const out = conformTriangles({ a: [[0.1 + 0.2, 0, 0], [1, 0, 0], [0, 0, 1]] });
    expect(out.a[0][0]).toBe(Math.round(0.3 / 1e-6) * 1e-6);
    expect(out.a[0][0]).toBe(Math.round((0.1 + 0.2) / 1e-6) * 1e-6);
  });

  it('a triangle with T-points on two edges is fanned from its centroid', () => {
    // the triangle, facing up, and two other triangles whose corners sit on
    // its edges (at (1, 0, 0) and (0, 0, 1)) without being split themselves
    const tri = [[0, 0, 0], [0, 0, 2], [2, 0, 0]];
    const others = [[1, 0, 0], [0, 0, -1], [2, 0, -1], [0, 0, 1], [-1, 0, 2], [-1, 0, 0]];
    const out = conformTriangles({ a: tri, b: others });
    expect(out.a.length / 3).toBe(2 + 3);
    expect(out.b.length / 3).toBe(2);
    expect(findTJunctions(flat(out))).toEqual([]);
    expect(Math.abs(area(out.a) - 2)).toBeLessThan(1e-9);
    for (const [p, q, r] of triangles(out.a)) expect(normalOf(p, q, r)[1]).toBeGreaterThan(0);
  });

  it('finds T-points on sloped edges too (3D point-on-segment)', () => {
    // a ramp's side triangle with a sloped top edge (0,0,0)-(0,2,4), and a
    // neighbour's corner at (0, 1, 2), half way up it
    const ramp = [[0, 0, 0], [0, 0, 4], [0, 2, 4]];
    const nb = [[0, 1, 2], [1, 1, 2], [1, 1, 3]];
    const bins = { ramp, nb };
    expect(findTJunctions(flat(bins))).toHaveLength(1);
    const out = conformTriangles(bins);
    expect(findTJunctions(flat(out))).toEqual([]);
    expect(out.ramp.length / 3).toBe(2);
    const n0 = normalOf(...ramp);
    for (const [p, q, r] of triangles(out.ramp)) {
      const n = normalOf(p, q, r);
      expect(n[0] * n0[0] + n[1] * n0[1] + n[2] * n0[2]).toBeGreaterThan(0);
    }
  });

  it('emits no zero-area triangles', () => {
    // a degenerate source (three colinear points) with a vertex inside its edge
    const flatTri = [[0, 0, 0], [2, 0, 0], [4, 0, 0]];
    const nb = [[1, 0, 0], [1, 0, 1], [0, 0, 1]];
    const out = conformTriangles({ a: flatTri, b: nb });
    for (const k of ['a', 'b']) for (const [p, q, r] of triangles(out[k])) expect(len(normalOf(p, q, r))).toBeGreaterThan(0);
  });

  it('leaves conforming input alone (but for quantising)', () => {
    const out = conformTriangles({ b: B });
    expect(out.b).toEqual(B);
  });

  // A strip of quads, each cut at a different count along its shared edge
  // with the next, so one split exposes the next (a cascade over passes).
  const cascade = () => {
    const bins = {};
    for (let i = 0; i < 5; i++) {
      const tris = [];
      const n = i + 1;
      for (let k = 0; k < n; k++) tris.push(...quadUp(P(i, k / n), P(i, (k + 1) / n), P(i + 1, (k + 1) / n), P(i + 1, k / n)));
      bins[`s${i}`] = tris;
    }
    bins.t = [[0, 0, 0], [0, 0, 1], [5, 0, 0.5]].map(([x, y, z]) => [x, y, z + 1]); // a sliver touching the top edges
    return bins;
  };

  it('its own output is a fixed point: conforming it again changes nothing', () => {
    for (const bins of [{ a: A, b: B }, { a: [[0, 0, 0], [0, 0, 2], [2, 0, 0]], b: [[1, 0, 0], [0, 0, -1], [2, 0, -1], [0, 0, 1], [-1, 0, 2], [-1, 0, 0]] }, cascade()]) {
      const once = conformTriangles(bins);
      const stats = {};
      const twice = conformTriangles(once, { stats });
      expect(twice).toEqual(once);
      expect(stats).toEqual({ passes: 1, converged: true });
    }
  });

  it('reports how many passes it took, and whether it converged', () => {
    const stats = {};
    conformTriangles({ b: B }, { stats });
    expect(stats).toEqual({ passes: 1, converged: true });
    const two = {};
    conformTriangles({ a: A, b: B }, { stats: two });
    expect(two).toEqual({ passes: 2, converged: true });
    expect(findTJunctions(flat(cascade())).length).toBeGreaterThan(4);
    const c = {};
    const out = conformTriangles(cascade(), { stats: c });
    expect(c.passes).toBeGreaterThanOrEqual(2);
    expect(c.converged).toBe(true);
    expect(c.passes).toBeLessThan(MAX_PASSES);
    expect(findTJunctions(flat(out))).toEqual([]);
  });
});
