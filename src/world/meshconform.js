// Conforming triangle soups: no T-junctions (pure, no THREE).
//
// conformTriangles(bins, { eps = 1e-6 } = {}) -> bins
//   bins: { name: [[x,y,z], ...] }, three vertices a triangle, wound as given.
// Returns new bins in which
//   (a) every position is quantised to eps (Math.round(v / eps) * eps), so
//       equal points reached by different arithmetic become bitwise equal and
//       a later displacement keyed on position moves them together;
//   (b) no vertex of any bin lies strictly inside an edge of any triangle of
//       any bin. Such a vertex (a T-point) is where a crack opens once the
//       vertices move: the edge it sits on would move as a straight line.
// A triangle with T-points on one edge is fanned from the opposite vertex;
// with T-points on two or three edges, from its centroid. Every output
// triangle keeps its source's winding and bin, and has area > 0 (a fan
// triangle with none, as a degenerate source makes, is not emitted).
//
// A vertex counts as on an edge when it is within `tol` (default 10 eps: the
// quantising itself moves points by up to eps / 2 a coordinate) of the
// segment and more than `tol` from both ends. Vertices are found through a
// spatial hash on (x, z), cells of HASH_CELL metres. A fan adds edges inside
// its triangle, so the pass repeats (at most MAX_PASSES) until nothing moves.
const HASH_CELL = 2;
const MAX_PASSES = 6;

export function conformTriangles(bins, { eps = 1e-6, tol = 10 * eps } = {}) {
  const q = (v) => Math.round(v / eps) * eps;
  let cur = {};
  for (const [name, verts] of Object.entries(bins)) cur[name] = verts.map((p) => [q(p[0]), q(p[1]), q(p[2])]);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { out, changed } = conformPass(cur, q, tol);
    cur = out;
    if (!changed) break;
  }
  return cur;
}

function conformPass(bins, q, tol) {
  // the unique vertices, by (x, z) cell
  const key = (p) => `${p[0]},${p[1]},${p[2]}`;
  const seen = new Set();
  const cells = new Map();
  const cellKey = (i, k) => i * 73856093 + k * 19349663; // a number key, not a string
  for (const verts of Object.values(bins)) {
    for (const p of verts) {
      const k = key(p);
      if (seen.has(k)) continue;
      seen.add(k);
      const c = cellKey(Math.floor(p[0] / HASH_CELL), Math.floor(p[2] / HASH_CELL));
      let list = cells.get(c);
      if (!list) cells.set(c, (list = []));
      list.push(p);
    }
  }

  // the T-points strictly inside segment a-b, sorted from a to b
  const inside = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 <= 4 * tol * tol) return null;
    const len = Math.sqrt(len2);
    const i0 = Math.floor((Math.min(a[0], b[0]) - tol) / HASH_CELL);
    const i1 = Math.floor((Math.max(a[0], b[0]) + tol) / HASH_CELL);
    const k0 = Math.floor((Math.min(a[2], b[2]) - tol) / HASH_CELL);
    const k1 = Math.floor((Math.max(a[2], b[2]) + tol) / HASH_CELL);
    let found = null;
    for (let i = i0; i <= i1; i++) {
      for (let k = k0; k <= k1; k++) {
        const list = cells.get(cellKey(i, k));
        if (!list) continue;
        for (const p of list) {
          const px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2];
          const t = (px * dx + py * dy + pz * dz) / len2;
          if (t * len <= tol || (1 - t) * len <= tol) continue;
          const ox = px - t * dx, oy = py - t * dy, oz = pz - t * dz;
          if (ox * ox + oy * oy + oz * oz > tol * tol) continue;
          (found || (found = [])).push([t, p]);
        }
      }
    }
    if (!found) return null;
    found.sort((m, n) => m[0] - n[0]);
    return found.map((f) => f[1]);
  };

  // twice the area, squared: a fan triangle at or under this is dropped
  const MIN_AREA2 = tol * tol * tol * tol;
  const area2 = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    return cx * cx + cy * cy + cz * cz;
  };

  let changed = false;
  const out = {};
  for (const [name, verts] of Object.entries(bins)) {
    const res = [];
    const emit = (a, b, c) => {
      if (area2(a, b, c) > MIN_AREA2) res.push(a, b, c);
    };
    for (let t = 0; t + 2 < verts.length; t += 3) {
      const v = [verts[t], verts[t + 1], verts[t + 2]];
      const pts = [inside(v[0], v[1]), inside(v[1], v[2]), inside(v[2], v[0])];
      const split = pts.filter(Boolean).length;
      if (split === 0) {
        emit(v[0], v[1], v[2]);
        continue;
      }
      changed = true;
      if (split === 1) {
        // fan from the vertex opposite the split edge (v[e] -> v[e + 1])
        const e = pts.findIndex(Boolean);
        const a = v[e], b = v[(e + 1) % 3], opp = v[(e + 2) % 3];
        const chain = [a, ...pts[e], b];
        for (let i = 0; i + 1 < chain.length; i++) emit(chain[i], chain[i + 1], opp);
        continue;
      }
      // fan the whole boundary from the centroid
      const ring = [];
      for (let e = 0; e < 3; e++) ring.push(v[e], ...(pts[e] || []));
      const c = [q((v[0][0] + v[1][0] + v[2][0]) / 3), q((v[0][1] + v[1][1] + v[2][1]) / 3), q((v[0][2] + v[1][2] + v[2][2]) / 3)];
      for (let i = 0; i < ring.length; i++) emit(ring[i], ring[(i + 1) % ring.length], c);
    }
    out[name] = res;
  }
  return { out, changed };
}
