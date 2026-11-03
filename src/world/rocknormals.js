// Crease-aware smooth normals for non-indexed triangles (pure, no THREE).
//
// smoothNormals(pos, keyPos, creaseDeg) -> Float32Array, one normal per
// vertex (same length as pos). Vertices are welded by keyPos[i] (a position
// before some move, e.g. the rock's quantised pre-relief positions, so every
// copy of a vertex welds even where float rounding would split it) when given,
// else by their exact position. Each face corner gets the angle-weighted sum
// of the normals of the welded faces whose normal is within creaseDeg of its
// own face's normal: a sharper fold keeps its edge, a gentler one shades
// smooth. Face normals are as three's computeVertexNormals takes them
// ((C - B) x (A - B)). A degenerate face contributes nothing; a corner with no
// usable face (its own face degenerate) gets (0, 1, 0).
export function smoothNormals(pos, keyPos, creaseDeg) {
  const nv = Math.floor(pos.length / 3);
  const nt = Math.floor(nv / 3);
  const out = new Float32Array(nv * 3);
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180) - 1e-9;

  // Face normals (unit, or 0 for a degenerate face) and corner angles.
  const fn = new Float64Array(nt * 3);
  const ok = new Uint8Array(nt);
  const ang = new Float64Array(nv);
  for (let t = 0; t < nt; t++) {
    const a = 9 * t;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const bx = pos[a + 3], by = pos[a + 4], bz = pos[a + 5];
    const cx = pos[a + 6], cy = pos[a + 7], cz = pos[a + 8];
    const cbx = cx - bx, cby = cy - by, cbz = cz - bz;
    const abx = ax - bx, aby = ay - by, abz = az - bz;
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 1e-12)) continue;
    ok[t] = 1;
    fn[3 * t] = nx / len;
    fn[3 * t + 1] = ny / len;
    fn[3 * t + 2] = nz / len;
    // the angle at each corner, between its two edges
    const P = [[ax, ay, az], [bx, by, bz], [cx, cy, cz]];
    for (let k = 0; k < 3; k++) {
      const o = P[k], p = P[(k + 1) % 3], q = P[(k + 2) % 3];
      const ux = p[0] - o[0], uy = p[1] - o[1], uz = p[2] - o[2];
      const vx = q[0] - o[0], vy = q[1] - o[1], vz = q[2] - o[2];
      const d = (ux * vx + uy * vy + uz * vz) / (Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz));
      ang[3 * t + k] = Math.acos(d > 1 ? 1 : d < -1 ? -1 : d) || 0;
    }
  }

  // Weld: one group id per distinct key, then each group's corners in a run.
  const ids = new Map();
  const group = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const v = keyPos ? keyPos[i] : null;
    const key = v ? `${v[0]},${v[1]},${v[2]}` : `${pos[3 * i]},${pos[3 * i + 1]},${pos[3 * i + 2]}`;
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    group[i] = id;
  }
  const ng = ids.size;
  const start = new Int32Array(ng + 1);
  for (let i = 0; i < nv; i++) start[group[i] + 1]++;
  for (let g = 0; g < ng; g++) start[g + 1] += start[g];
  const fill = start.slice(0, ng);
  const members = new Int32Array(nv);
  for (let i = 0; i < nv; i++) members[fill[group[i]]++] = i;

  for (let g = 0; g < ng; g++) {
    const s = start[g], e = start[g + 1];
    for (let a = s; a < e; a++) {
      const i = members[a];
      const t = (i / 3) | 0;
      if (!ok[t]) {
        out[3 * i + 1] = 1;
        continue;
      }
      const fx = fn[3 * t], fy = fn[3 * t + 1], fz = fn[3 * t + 2];
      let sx = 0, sy = 0, sz = 0;
      for (let b = s; b < e; b++) {
        const j = members[b];
        const u = (j / 3) | 0;
        if (!ok[u]) continue;
        const gx = fn[3 * u], gy = fn[3 * u + 1], gz = fn[3 * u + 2];
        if (fx * gx + fy * gy + fz * gz < cosCrease) continue;
        const w = ang[j];
        sx += w * gx;
        sy += w * gy;
        sz += w * gz;
      }
      const len = Math.hypot(sx, sy, sz);
      if (len > 1e-12) {
        out[3 * i] = sx / len;
        out[3 * i + 1] = sy / len;
        out[3 * i + 2] = sz / len;
      } else {
        out[3 * i] = fx;
        out[3 * i + 1] = fy;
        out[3 * i + 2] = fz;
      }
    }
  }
  return out;
}
