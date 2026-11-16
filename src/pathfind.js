// A way round things: the shortest walk from one spot to another over a grid
// of the map, for the paw-print trail and the cat that leads (the guided first
// walk and the first camp walk). Plain arithmetic: no THREE, no dice.
//
// findPath(walkable, bounds, from, to, { cell, canStep }) -> [{ x, z }, …]
//   walkable(x, z)             may a cat stand here?
//   canStep(ax, az, bx, bz)    may it step from a to b? (a rim on raised
//                              ground; every step is fine when not given)
// The list runs from the first point after `from` to the end, with the points
// in a straight run dropped. A start or an end that is not walkable is moved
// to the nearest grid point that is. No way at all gives null, and the caller
// falls back to the straight line.

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function findPath(walkable, bounds, from, to, { cell = 1, canStep = null, maxCells = 40000 } = {}) {
  if (!bounds || !from || !to || typeof walkable !== 'function') return null;
  const w = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / cell) + 1);
  const h = Math.max(1, Math.floor((bounds.maxZ - bounds.minZ) / cell) + 1);
  if (w * h > maxCells) return null;
  const gx = (i) => bounds.minX + i * cell;
  const gz = (j) => bounds.minZ + j * cell;
  const ok = new Int8Array(w * h); // 0 not asked, 1 yes, -1 no
  const free = (i, j) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    const k = j * w + i;
    if (ok[k] === 0) ok[k] = walkable(gx(i), gz(j)) ? 1 : -1;
    return ok[k] === 1;
  };
  // The nearest free grid point to (x, z), searched outward in rings.
  const snap = (x, z) => {
    const ci = Math.round((x - bounds.minX) / cell);
    const cj = Math.round((z - bounds.minZ) / cell);
    for (let r = 0; r <= 8; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (!free(ci + di, cj + dj)) continue;
          const d = Math.hypot(gx(ci + di) - x, gz(cj + dj) - z);
          if (d < bestD) { bestD = d; best = [ci + di, cj + dj]; }
        }
      }
      if (best) return best;
    }
    return null;
  };
  const a = snap(from.x, from.z);
  const b = snap(to.x, to.z);
  if (!a || !b) return null;

  const start = a[1] * w + a[0];
  const goal = b[1] * w + b[0];
  const g = new Float32Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const heur = (k) => Math.hypot((k % w) - b[0], Math.floor(k / w) - b[1]);
  // A small binary heap of [f, k].
  const heap = [];
  const push = (f, k) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  g[start] = 0;
  push(heur(start), start);
  let found = false;
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) { found = true; break; }
    const i = k % w;
    const j = Math.floor(k / w);
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (!free(ni, nj)) continue;
      // No cutting a corner between two blocked cells.
      if (di !== 0 && dj !== 0 && (!free(i + di, j) || !free(i, j + dj))) continue;
      if (canStep && !canStep(gx(i), gz(j), gx(ni), gz(nj))) continue;
      const nk = nj * w + ni;
      if (closed[nk]) continue;
      const cost = g[k] + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
      if (cost < g[nk]) {
        g[nk] = cost;
        came[nk] = k;
        push(cost + heur(nk), nk);
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = goal; k !== -1; k = came[k]) cells.push(k);
  cells.reverse();
  // Drop the points inside a straight run.
  const out = [];
  for (let n = 1; n < cells.length; n++) {
    const k = cells[n];
    const prev = cells[n - 1];
    const next = cells[n + 1];
    const straight = next !== undefined && (k - prev) === (next - k);
    if (!straight) out.push({ x: gx(k % w), z: gz(Math.floor(k / w)) });
  }
  // End exactly on the asked-for spot when it is itself walkable.
  if (walkable(to.x, to.z)) {
    if (out.length) out[out.length - 1] = { x: to.x, z: to.z };
    else out.push({ x: to.x, z: to.z });
  }
  return straighten(from, out, walkable, canStep);
}

// Is the straight line from a to b all walkable (asked every half metre)?
function clearLine(a, b, walkable, canStep) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / 0.5));
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const z = a.z + ((b.z - a.z) * i) / n;
    if (!walkable(x, z)) return false;
    if (canStep && !canStep(px, pz, x, z)) return false;
    px = x; pz = z;
  }
  return true;
}

// A grid path runs in eighths of a turn; this cuts each corner the map lets
// it cut, so the walk is a few long straight legs.
function straighten(from, pts, walkable, canStep) {
  const out = [];
  let at = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearLine(at, pts[j], walkable, canStep)) j -= 1;
    out.push(pts[j]);
    at = pts[j];
    i = j + 1;
  }
  return out;
}

// The length of a path from `from`, in metres.
export function pathLength(from, path) {
  let d = 0;
  let p = from;
  for (const q of path ?? []) {
    d += Math.hypot(q.x - p.x, q.z - p.z);
    p = q;
  }
  return d;
}

// The point `dist` metres along the path from `from` (the path's end when it
// is shorter).
export function pointAlong(from, path, dist) {
  let left = dist;
  let p = from;
  for (const q of path ?? []) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d >= left && d > 0) return { x: p.x + ((q.x - p.x) * left) / d, z: p.z + ((q.z - p.z) * left) / d };
    left -= d;
    p = q;
  }
  return { x: p.x, z: p.z };
}
