import { BASE_ABILITIES } from '../../src/traversal.js';

// The "never stuck" flood for areas with traversal moves. It labels every cell
// of a grid over area.bounds into regions (connected components under
// ground.canStep, four-neighbour, as test/helpers/gorgeflood.js does), then
// joins regions with directed edges: each crossing both ways, each usable hop
// one way. The Rooftops (step 2) reuses it.
export const TRAVERSAL_FLOOD_STEP = 0.25;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function floodTraversal(area, { step = TRAVERSAL_FLOOD_STEP, abilities = BASE_ABILITIES } = {}) {
  const { minX, maxX, minZ, maxZ } = area.bounds;
  const { ground, traversal } = area;
  const nx = Math.round((maxX - minX) / step) + 1;
  const nz = Math.round((maxZ - minZ) / step) + 1;
  const cx = (i) => minX + i * step;
  const cz = (j) => minZ + j * step;
  const label = new Int32Array(nx * nz).fill(-1);
  const levels = [];
  let regions = 0;
  for (let s = 0; s < label.length; s++) {
    if (label[s] >= 0) continue;
    const r = regions++;
    label[s] = r;
    levels.push(ground.y(cx(Math.floor(s / nz)), cz(s % nz)));
    const stack = [s];
    while (stack.length) {
      const k = stack.pop();
      const i = Math.floor(k / nz);
      const j = k - i * nz;
      for (const [di, dj] of DIRS) {
        const p = i + di;
        const q = j + dj;
        if (p < 0 || q < 0 || p >= nx || q >= nz || label[p * nz + q] >= 0) continue;
        if (!ground.canStep(cx(i), cz(j), cx(p), cz(q))) continue;
        label[p * nz + q] = r;
        stack.push(p * nz + q);
      }
    }
  }
  const regionAt = (x, z) => {
    const i = Math.round((x - minX) / step);
    const j = Math.round((z - minZ) / step);
    return i >= 0 && j >= 0 && i < nx && j < nz ? label[i * nz + j] : -1;
  };
  const edges = new Map();
  for (let r = 0; r < regions; r++) edges.set(r, new Set());
  const join = (a, b) => { if (a >= 0 && b >= 0) edges.get(a).add(b); };
  for (const c of traversal.crossings) {
    const [e0, e1] = c.ends;
    const a = regionAt(e0.x, e0.z);
    const b = regionAt(e1.x, e1.z);
    join(a, b);
    join(b, a);
  }
  for (const h of traversal.hops) {
    if (h.requires && !abilities.longLeap) continue;
    if (h.kind === 'climb' && h.dy > abilities.climb) continue;
    join(regionAt(h.x0, h.z0), regionAt(h.x1, h.z1));
  }
  const reachable = (from) => {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      for (const n of edges.get(queue.shift()) || []) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    return seen;
  };
  return { regions, regionAt, levelOf: (r) => levels[r], edges, reachable };
}
