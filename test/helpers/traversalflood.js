import { BASE_ABILITIES } from '../../src/traversal.js';
import { STEP_MAX } from '../../src/ground.js';

// The "never stuck" flood for areas with traversal moves. It labels every cell
// of a grid over area.bounds into regions (connected components under
// ground.canStep, four-neighbour, as test/helpers/gorgeflood.js does), then
// joins regions with directed edges: each crossing both ways, each usable hop
// one way. The Rooftops (step 2) reuses it.
export const TRAVERSAL_FLOOD_STEP = 0.25;
export const SNAP_CELLS = 2; // a move end may snap this many cells (Chebyshev) to find its own level
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
  // Without y: the region of the nearest cell (-1 off the grid). With y: the
  // nearest cell within SNAP_CELLS whose ground is at y (within STEP_MAX) and
  // from which (x, z) can be stepped to, or -1 if there is none.
  const regionAt = (x, z, y = undefined) => {
    const i = Math.round((x - minX) / step);
    const j = Math.round((z - minZ) / step);
    if (y === undefined) return i >= 0 && j >= 0 && i < nx && j < nz ? label[i * nz + j] : -1;
    let best = -1;
    let bestD = Infinity;
    for (let p = i - SNAP_CELLS; p <= i + SNAP_CELLS; p++) {
      for (let q = j - SNAP_CELLS; q <= j + SNAP_CELLS; q++) {
        if (p < 0 || q < 0 || p >= nx || q >= nz) continue;
        if (Math.abs(ground.y(cx(p), cz(q)) - y) > STEP_MAX) continue;
        if (!ground.canStep(cx(p), cz(q), x, z)) continue;
        const d = (cx(p) - x) ** 2 + (cz(q) - z) ** 2;
        if (d < bestD) { bestD = d; best = label[p * nz + q]; }
      }
    }
    return best;
  };
  const edges = new Map();
  for (let r = 0; r < regions; r++) edges.set(r, new Set());
  const place = (what, id, which, x, z, y) => {
    const r = regionAt(x, z, y);
    if (r < 0) throw new Error(`floodTraversal: ${what} ${id} ${which} has no cell at its level`);
    return r;
  };
  const join = (a, b) => edges.get(a).add(b);
  for (const c of traversal.crossings) {
    const [e0, e1] = c.ends;
    const a = place('crossing', c.id, 'end 0', e0.x, e0.z, e0.y);
    const b = place('crossing', c.id, 'end 1', e1.x, e1.z, e1.y);
    join(a, b);
    join(b, a);
  }
  for (const h of traversal.hops) {
    if (h.requires && !abilities.longLeap) continue;
    if (h.kind === 'climb' && h.dy > abilities.climb) continue;
    join(place(h.kind, h.id, 'from', h.x0, h.z0, h.y0), place(h.kind, h.id, 'to', h.x1, h.z1, h.y1));
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
