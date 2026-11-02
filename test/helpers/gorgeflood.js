import { gorgeGround } from '../../src/world/gorgeshape.js';

// The Gorge's walkability flood ("Task 2's flood"): from the spawn, on a
// 0.25 m grid over the map's bounds, four-neighbour, stepping wherever
// ground.canStep allows. Water is ignored: the stream is wadeable.
//
// GORGE_BOUNDS and GORGE_SPAWN are the numbers table's; gorge.js owns them
// from Task 4, and this helper can import them from there then.
export const GORGE_BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
export const GORGE_SPAWN = Object.freeze({ x: -44, z: -11 });
export const FLOOD_STEP = 0.25;

const { minX, maxX, minZ, maxZ } = GORGE_BOUNDS;
const NX = Math.round((maxX - minX) / FLOOD_STEP) + 1;
const NZ = Math.round((maxZ - minZ) / FLOOD_STEP) + 1;
const cellX = (i) => minX + i * FLOOD_STEP;
const cellZ = (j) => minZ + j * FLOOD_STEP;

// floodGorge({ blocked }) -> { ground, reached(x, z), forEachReached(fn), grid }.
// `blocked(x, z)` removes cells from the flood. reached() snaps to the
// nearest grid cell; points outside the bounds are never reached. The
// unblocked flood is computed once per test file and shared.
let shared = null;
export function floodGorge({ blocked = null } = {}) {
  if (!blocked && shared) return shared;
  const ground = gorgeGround();
  const seen = new Uint8Array(NX * NZ);
  const si = Math.round((GORGE_SPAWN.x - minX) / FLOOD_STEP);
  const sj = Math.round((GORGE_SPAWN.z - minZ) / FLOOD_STEP);
  if (blocked?.(cellX(si), cellZ(sj))) throw new Error('the flood start is blocked');
  const stack = [si * NZ + sj];
  seen[stack[0]] = 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const k = stack.pop();
    const i = Math.floor(k / NZ);
    const j = k - i * NZ;
    const ax = cellX(i);
    const az = cellZ(j);
    for (const [di, dj] of DIRS) {
      const p = i + di;
      const q = j + dj;
      if (p < 0 || q < 0 || p >= NX || q >= NZ) continue;
      const n = p * NZ + q;
      if (seen[n]) continue;
      const bx = cellX(p);
      const bz = cellZ(q);
      if (blocked?.(bx, bz) || !ground.canStep(ax, az, bx, bz)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  const reached = (x, z) => {
    const i = Math.round((x - minX) / FLOOD_STEP);
    const j = Math.round((z - minZ) / FLOOD_STEP);
    return i >= 0 && j >= 0 && i < NX && j < NZ && seen[i * NZ + j] === 1;
  };
  const forEachReached = (fn) => {
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) if (seen[i * NZ + j]) fn(cellX(i), cellZ(j));
    }
  };
  const forEachCell = (fn) => {
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) fn(cellX(i), cellZ(j), seen[i * NZ + j] === 1);
    }
  };
  const result = Object.freeze({
    ground, reached, forEachReached, forEachCell,
    grid: Object.freeze({ minX, minZ, step: FLOOD_STEP, nx: NX, nz: NZ, seen }),
  });
  if (!blocked) shared = result;
  return result;
}
