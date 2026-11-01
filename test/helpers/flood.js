import { expect } from 'vitest';

// Flood-fill the cells a grounded cat may stand on (isWalkable) on a 0.5 m
// grid from `start`, four-neighbour, lifted from test/woods.test.js.
const STEP = 0.5;
export function floodFrom(area, start, isWalkable) {
  const { minX, maxX, minZ, maxZ } = area.bounds;
  const nx = Math.round((maxX - minX) / STEP) + 1;
  const nz = Math.round((maxZ - minZ) / STEP) + 1;
  const seen = new Uint8Array(nx * nz);
  const ok = (i, j) => isWalkable(minX + i * STEP, minZ + j * STEP);
  const si = Math.round((start.x - minX) / STEP);
  const sj = Math.round((start.z - minZ) / STEP);
  expect(ok(si, sj), 'the flood start is walkable').toBe(true);
  const stack = [[si, sj]];
  seen[si * nz + sj] = 1;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di, q = j + dj;
      if (p < 0 || q < 0 || p >= nx || q >= nz || seen[p * nz + q] || !ok(p, q)) continue;
      seen[p * nz + q] = 1;
      stack.push([p, q]);
    }
  }
  const reaches = (x, z) => {
    const i = Math.round((x - minX) / STEP), j = Math.round((z - minZ) / STEP);
    return i >= 0 && j >= 0 && i < nx && j < nz && seen[i * nz + j] === 1;
  };
  const reachesWithin = (x, z, r) => {
    for (let i = Math.floor((x - r - minX) / STEP); i <= Math.ceil((x + r - minX) / STEP); i++) {
      for (let j = Math.floor((z - r - minZ) / STEP); j <= Math.ceil((z + r - minZ) / STEP); j++) {
        if (i < 0 || j < 0 || i >= nx || j >= nz || !seen[i * nz + j]) continue;
        if (Math.hypot(minX + i * STEP - x, minZ + j * STEP - z) < r) return true;
      }
    }
    return false;
  };
  return { reaches, reachesWithin };
}
