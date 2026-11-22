import * as THREE from 'three';

// Coplanar-overlap finder for z-fighting (flicker). Two triangles that face the
// same way, lie within `tol` metres of one plane and overlap in area fight for
// the depth buffer: which one shows changes with the camera by a few
// millimetres, so the pair shimmers. Pairs facing opposite ways (back to back
// inside a solid) are culled by the material and never fight.
//
// trianglesOf(meshes, box) -> [{ a, b, c, n, d, mesh }] world space, only those
// whose bounds touch `box` (a THREE.Box3); a mesh's material must not be
// double-sided for its triangles to count one way (double-sided ones are kept
// and flagged `both`).
export function trianglesOf(meshes, box) {
  const out = [];
  const m = new THREE.Matrix4();
  const tri = new THREE.Triangle();
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    if (!pos) continue;
    const idx = mesh.geometry.index;
    const n = idx ? idx.count : pos.count;
    m.copy(mesh.matrixWorld);
    const both = mesh.material?.side === THREE.DoubleSide;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      const a = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(m);
      const b = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(m);
      const c = new THREE.Vector3().fromBufferAttribute(pos, ic).applyMatrix4(m);
      if (!box.intersectsBox(new THREE.Box3().setFromPoints([a, b, c]))) continue;
      const col = mesh.geometry.attributes.color;
      const rgb = col ? [0, 1, 2].map((q) => (col.getX([ia, ib, ic][q]) + 0) ) : null;
      const shade = col ? [0, 1, 2].map((ch) => ([ia, ib, ic].reduce((t, v) => t + col.getComponent(v, ch), 0) / 3)) : [0, 0, 0];
      void rgb;
      tri.set(a, b, c);
      const nrm = tri.getNormal(new THREE.Vector3());
      if (nrm.lengthSq() < 0.5) continue; // degenerate
      out.push({ a, b, c, n: nrm, d: nrm.dot(a), mesh, both, shade, mat: mesh.material });
    }
  }
  return out;
}

// Area of the overlap of two coplanar triangles, by clipping one against the
// other in the plane of `t.n` (Sutherland-Hodgman).
function overlapArea(s, t) {
  const n = t.n;
  const ax = Math.abs(n.x) > 0.5 ? 'x' : null;
  const [u, v] = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? ['y', 'z'] : Math.abs(n.y) >= Math.abs(n.z) ? ['x', 'z'] : ['x', 'y'];
  void ax;
  const P = (tri) => [tri.a, tri.b, tri.c].map((p) => [p[u], p[v]]);
  const area = (poly) => {
    let s2 = 0;
    for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i]; const [x1, y1] = poly[(i + 1) % poly.length]; s2 += x0 * y1 - x1 * y0; }
    return s2 / 2;
  };
  let subject = P(s);
  const clip = P(t);
  const orient = Math.sign(area(clip)) || 1;
  for (let i = 0; i < 3 && subject.length; i++) {
    const [x0, y0] = clip[i];
    const [x1, y1] = clip[(i + 1) % 3];
    const inside = ([x, y]) => orient * ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) >= -1e-12;
    const cut = ([px, py], [qx, qy]) => {
      const a1 = y1 - y0, b1 = x0 - x1, c1 = a1 * x0 + b1 * y0;
      const a2 = qy - py, b2 = px - qx, c2 = a2 * px + b2 * py;
      const det = a1 * b2 - a2 * b1;
      return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
    };
    const next = [];
    for (let j = 0; j < subject.length; j++) {
      const cur = subject[j];
      const prev = subject[(j + subject.length - 1) % subject.length];
      if (inside(cur)) { if (!inside(prev)) next.push(cut(prev, cur)); next.push(cur); } else if (inside(prev)) next.push(cut(prev, cur));
    }
    subject = next;
  }
  return subject.length < 3 ? 0 : Math.abs(area(subject));
}

// Every same-facing, near-coplanar, overlapping pair: [{ i, j, area, gap, a, b, differ }].
// `differ` is how far apart the two triangles' looks are (their material, or
// their vertex colours): two overlapping faces of one colour on one material
// shade the same wherever the depth buffer settles, so they do not shimmer;
// pass { onlyDiffering: true } to list just the pairs that do.
export function coplanarPairs(tris, { tol = 0.001, minArea = 1e-6, onlyDiffering = false, colourTol = 0.01 } = {}) {
  const found = [];
  const look = (s, t) => (s.mat !== t.mat ? 1 : Math.max(...s.shade.map((v, k) => Math.abs(v - t.shade[k]))));
  // triangles facing the same way (their normals rounded to a 0.02 grid), each group by plane offset
  const groups = new Map();
  tris.forEach((t, i) => {
    const key = t.n.toArray().map((v) => Math.round(v * 50)).join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  for (const ids of groups.values()) {
    ids.sort((p, q) => tris[p].d - tris[q].d);
    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const i = ids[x], j = ids[y];
        const s = tris[i], t = tris[j];
        if (t.d - s.d > tol) break;
        if (s.n.dot(t.n) < 0.9995) continue;
        const differ = look(s, t);
        if (onlyDiffering && differ <= colourTol) continue;
        const area = overlapArea(s, t);
        if (area > minArea) found.push({ i, j, area, gap: Math.abs(s.d - t.d), a: s.mesh.name, b: t.mesh.name, differ });
      }
    }
  }
  return found;
}
