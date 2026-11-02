// An independent T-junction finder for the tests (written apart from
// src/world/meshconform.js on purpose: it must not share that file's bugs).
//
// findTJunctions(positionsByMesh, eps = 1e-5) -> string[]
//   positionsByMesh: { name: flat [x,y,z, x,y,z, ...] } (or an array of them),
//   three vertices a triangle, non-indexed, as a BufferGeometry stores them.
// A T-junction is a vertex of any mesh lying strictly inside an edge of any
// triangle of any mesh: within eps of the segment and more than eps from both
// of its ends. Brute force over a 1 m (x, z) hash of the unique vertices.
// Returns descriptions of the offending (vertex, edge) pairs, at most 20.
const CELL = 1;
const MAX = 20;

export function findTJunctions(positionsByMesh, eps = 1e-5) {
  const named = Array.isArray(positionsByMesh)
    ? positionsByMesh.map((p, i) => [String(i), p])
    : Object.entries(positionsByMesh);

  // the unique vertices, bucketed by their (x, z) cell
  const seen = new Set();
  const buckets = new Map();
  const bucketKey = (i, k) => `${i}|${k}`;
  for (const [, pos] of named) {
    for (let i = 0; i + 2 < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      const id = `${x}|${y}|${z}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const k = bucketKey(Math.floor(x / CELL), Math.floor(z / CELL));
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push([x, y, z]);
    }
  }

  const out = [];
  const reported = new Set();
  for (const [name, pos] of named) {
    for (let t = 0; t + 8 < pos.length; t += 9) {
      for (let e = 0; e < 3; e++) {
        const a = [pos[t + 3 * e], pos[t + 3 * e + 1], pos[t + 3 * e + 2]];
        const n = (e + 1) % 3;
        const b = [pos[t + 3 * n], pos[t + 3 * n + 1], pos[t + 3 * n + 2]];
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len <= 2 * eps) continue;
        const i0 = Math.floor((Math.min(a[0], b[0]) - eps) / CELL);
        const i1 = Math.floor((Math.max(a[0], b[0]) + eps) / CELL);
        const k0 = Math.floor((Math.min(a[2], b[2]) - eps) / CELL);
        const k1 = Math.floor((Math.max(a[2], b[2]) + eps) / CELL);
        for (let i = i0; i <= i1; i++) {
          for (let k = k0; k <= k1; k++) {
            const list = buckets.get(bucketKey(i, k));
            if (!list) continue;
            for (const p of list) {
              const px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2];
              const along = (px * dx + py * dy + pz * dz) / len; // metres from a
              if (along <= eps || along >= len - eps) continue;
              // distance from the line: |(p - a) x (b - a)| / |b - a|
              const cx = py * dz - pz * dy;
              const cy = pz * dx - px * dz;
              const cz = px * dy - py * dx;
              const off = Math.sqrt(cx * cx + cy * cy + cz * cz) / len;
              if (off > eps) continue;
              const msg = `${name} triangle ${t / 9} edge (${a.join(', ')})-(${b.join(', ')}) has (${p.join(', ')}) inside it`;
              if (reported.has(msg)) continue;
              reported.add(msg);
              out.push(msg);
              if (out.length >= MAX) return out;
            }
          }
        }
      }
    }
  }
  return out;
}
