// A walking route over Lighthouse Point's real ground, colliders and waters: a breadth-first search on a 0.5 m grid
// (the way test/lighthouseplan.test.js floods it), returned as points about 0.5 m apart. For the kitten tests: the cat
// walks the route and the kitten follows.
import { inWater } from '../../src/world/water.js';

const STEP = 0.5;
const CAT = 0.45;

export function route(area, from, to) {
  const { minX, maxX, minZ, maxZ } = area.bounds;
  const nx = Math.round((maxX - minX) / STEP) + 1;
  const nz = Math.round((maxZ - minZ) / STEP) + 1;
  const cx = (i) => minX + i * STEP;
  const cz = (j) => minZ + j * STEP;
  const ok = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ
    && area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT)
    && !inWater(area.waters, x, z);
  const idx = (i, j) => i * nz + j;
  const i0 = Math.round((from.x - minX) / STEP); const j0 = Math.round((from.z - minZ) / STEP);
  const i1 = Math.round((to.x - minX) / STEP); const j1 = Math.round((to.z - minZ) / STEP);
  const prev = new Int32Array(nx * nz).fill(-2);
  prev[idx(i0, j0)] = -1;
  const queue = [[i0, j0]];
  for (let h = 0; h < queue.length; h++) {
    const [i, j] = queue[h];
    if (i === i1 && j === j1) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di; const q = j + dj;
      if (p < 0 || q < 0 || p >= nx || q >= nz || prev[idx(p, q)] !== -2) continue;
      if (!ok(cx(p), cz(q)) || !area.ground.canStep(cx(i), cz(j), cx(p), cz(q))) continue;
      prev[idx(p, q)] = idx(i, j);
      queue.push([p, q]);
    }
  }
  if (prev[idx(i1, j1)] === -2) return null;
  const out = [];
  for (let k = idx(i1, j1); k !== -1; k = prev[k]) out.push({ x: cx(Math.floor(k / nz)), z: cz(k % nz) });
  return out.reverse().map((p) => ({ ...p, y: area.ground.y(p.x, p.z) }));
}
