import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { smoothNormals } from '../src/world/rocknormals.js';

// A unit cube as 12 non-indexed triangles, wound outward.
function cubeTris() {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  return Array.from(g.attributes.position.array);
}

// Two quads (four triangles) sharing the edge x = 0, each tilted 10° off
// flat, so they meet at a 20° fold.
function fold(deg) {
  const t = (deg / 2) * (Math.PI / 180);
  const up = Math.tan(t);
  // left quad: x -1..0, rising to the edge; right quad: x 0..1, falling from it
  const L = [[-1, 0, 0], [0, up, 0], [0, up, 1], [-1, 0, 1]];
  const R = [[0, up, 0], [1, 0, 0], [1, 0, 1], [0, up, 1]];
  const out = [];
  for (const [a, b, c, d] of [L, R]) out.push(...a, ...c, ...b, ...a, ...d, ...c);
  return out;
}

describe('smoothNormals', () => {
  it('smoothNormals: a cube keeps its edges, a gentle fold is smooth', () => {
    const cube = cubeTris();
    const n = smoothNormals(cube, null, 60);
    expect(n.length).toBe(cube.length);
    for (let i = 0; i < n.length; i += 3) {
      const comps = [n[i], n[i + 1], n[i + 2]].map(Math.abs).sort((a, b) => b - a);
      expect(comps[0]).toBeCloseTo(1, 6);
      expect(comps[1]).toBeCloseTo(0, 6);
    }

    const f = fold(20);
    const m = smoothNormals(f, null, 60);
    // every corner on the shared edge (x = 0) has the same normal: straight up
    const onEdge = [];
    for (let i = 0; i < f.length; i += 3) if (Math.abs(f[i]) < 1e-9) onEdge.push([m[i], m[i + 1], m[i + 2]]);
    expect(onEdge.length).toBe(6);
    for (const v of onEdge) {
      expect(v[0]).toBeCloseTo(onEdge[0][0], 6);
      expect(v[1]).toBeCloseTo(onEdge[0][1], 6);
      expect(v[2]).toBeCloseTo(onEdge[0][2], 6);
      expect(v[0]).toBeCloseTo(0, 6);
      expect(v[1]).toBeCloseTo(1, 6);
    }
    // ...but the same fold at 20° with a 10° crease keeps its edge
    const k = smoothNormals(f, null, 10);
    for (let i = 0; i < f.length; i += 3) expect(Math.abs(k[i])).toBeGreaterThan(0.1);
  });

  it('welds by the key positions when given, and leaves degenerate faces harmless', () => {
    // the fold with its right half nudged apart, welded back by keys
    const f = fold(20);
    const keys = [];
    for (let i = 0; i < f.length; i += 3) keys.push([f[i], f[i + 1], f[i + 2]]);
    const moved = f.slice();
    for (let i = 18; i < moved.length; i += 3) moved[i] += 1e-3;
    const apart = smoothNormals(moved, null, 60);
    const welded = smoothNormals(moved, keys, 60);
    expect(Math.abs(apart[3])).toBeGreaterThan(0.1); // not welded: still a facet
    expect(Math.abs(welded[3])).toBeLessThan(0.01); // welded: smooth across
    // a zero-area triangle: unit (0, 1, 0), and it changes nothing around it
    const withFlat = [...f, 0, 0.5, 0, 0, 0.5, 0, 0, 0.5, 0];
    const w = smoothNormals(withFlat, null, 60);
    expect(Array.from(w.slice(f.length))).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    for (let i = 0; i < f.length; i++) expect(w[i]).toBeCloseTo(smoothNormals(f, null, 60)[i], 9);
  });
});
