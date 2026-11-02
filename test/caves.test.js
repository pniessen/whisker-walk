import { describe, it, expect } from 'vitest';
import { caveDepth, caveAt } from '../src/caves.js';
import { GORGE_CAVES, GORGE_DENS } from '../src/world/gorgeshape.js';
import { GORGE_BOUNDS } from './helpers/gorgeflood.js';

// Gorge part 3, ruling C1: how deep into a cave a spot is.

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const inAnyCave = (x, z) => GORGE_CAVES.some((c) => c.rects.some((r) => inRect(r, x, z)));

// n evenly spaced points along a polyline, mouth first.
function alongPath(path, n) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    lens.push(l);
    total += l;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    let s = (total * k) / (n - 1);
    let i = 0;
    while (i < lens.length - 1 && s > lens[i]) s -= lens[i++];
    const t = lens[i] > 0 ? Math.min(1, s / lens[i]) : 0;
    out.push([
      path[i][0] + (path[i + 1][0] - path[i][0]) * t,
      path[i][1] + (path[i + 1][1] - path[i][1]) * t,
    ]);
  }
  return out;
}

function forGrid(fn) {
  for (let x = GORGE_BOUNDS.minX; x <= GORGE_BOUNDS.maxX; x += 0.5) {
    for (let z = GORGE_BOUNDS.minZ; z <= GORGE_BOUNDS.maxZ; z += 0.5) fn(x, z);
  }
}

describe('cave depth', () => {
  it('depth is 0 at the mouth, rises along the path and is 1 at the end', () => {
    expect(GORGE_CAVES).toHaveLength(3);
    for (const cave of GORGE_CAVES) {
      const [mx, mz] = cave.path[0];
      expect(caveDepth(GORGE_CAVES, mx, mz)).toBeLessThanOrEqual(0.1);
      const [ex, ez] = cave.path[cave.path.length - 1];
      expect(caveDepth(GORGE_CAVES, ex, ez)).toBeGreaterThanOrEqual(0.95);
      let last = -Infinity;
      for (const [x, z] of alongPath(cave.path, 100)) {
        expect(caveAt(GORGE_CAVES, x, z)).toBe(cave);
        const d = caveDepth(GORGE_CAVES, x, z);
        expect(d).toBeGreaterThanOrEqual(last - 1e-12);
        last = d;
      }
    }
  });

  it('depth is 0 outside every cave and in every den', () => {
    forGrid((x, z) => {
      const d = caveDepth(GORGE_CAVES, x, z);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
      if (!inAnyCave(x, z)) {
        expect(d).toBe(0);
        expect(caveAt(GORGE_CAVES, x, z)).toBe(null);
      }
    });
    for (const den of GORGE_DENS) {
      for (let x = den.minX; x <= den.maxX; x += 0.25) {
        for (let z = den.minZ; z <= den.maxZ; z += 0.25) expect(caveDepth(GORGE_CAVES, x, z)).toBe(0);
      }
    }
    expect(caveDepth([], 0, 0)).toBe(0);
    expect(caveDepth(null, 0, 0)).toBe(0);
  });

  it('two calls agree', () => {
    forGrid((x, z) => {
      expect(Object.is(caveDepth(GORGE_CAVES, x, z), caveDepth(GORGE_CAVES, x, z))).toBe(true);
    });
  });
});
