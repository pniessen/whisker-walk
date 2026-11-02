import * as THREE from 'three';
import { FOLDS } from '../../src/cat/limbs.js';

// Task 6, polish-catlooks (2026-11-02): how far a folded upper leg stands
// proud of the torso's flank. Shared by folds.test.js.
//
// The torso's surface is the body mesh and the underside on it (belly, chest):
// a vertex inside either is not proud. For each upper-leg vertex (curve
// parameter t up to the fold's knee or elbow, its second control point) that
// is outside, the distance to the nearest torso point, counted only where that
// point's surface faces sideways or up (face normal y >= FLANK_NY): a leg
// hanging below the belly is a leg, not a lump on the flank. The knee (or
// elbow) ring itself is the joint, free to stand out as a crouching cat's
// does: the upper leg is every ring above it, and the dome over its top.
export const FLANK_NY = -0.5;

function triangles(mesh) {
  const g = mesh.geometry, p = g.attributes.position, out = [];
  const idx = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let f = 0; f < idx.length; f += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(p, idx[f + k]).applyMatrix4(mesh.matrixWorld);
    const tri = new THREE.Triangle(v[0].clone(), v[1].clone(), v[2].clone());
    const n = tri.getNormal(new THREE.Vector3());
    if (n.lengthSq() < 0.5) continue; // a degenerate pole sliver
    const box = new THREE.Box3().setFromPoints([tri.a, tri.b, tri.c]);
    out.push({ tri, n, box });
  }
  return out;
}

// The signed distance from p to one closed mesh's triangles (+ outside), and
// the nearest point's face normal.
const _q = new THREE.Vector3(), _d = new THREE.Vector3();
function nearest(tris, p) {
  let best = Infinity, hit = null;
  for (const t of tris) {
    if (t.box.distanceToPoint(p) ** 2 >= best) continue;
    t.tri.closestPointToPoint(p, _q);
    const d = _q.distanceToSquared(p);
    if (d < best) { best = d; hit = t; _d.subVectors(p, _q); }
  }
  return { dist: Math.sign(_d.dot(hit.n) || 1) * Math.sqrt(best), ny: hit.n.y };
}

// The worst flank lump of the cat's folded legs, as { worst, at, checked }
// (worst in metres, -Infinity when no upper-leg vertex is outside on the
// flank; at names the leg and the vertex; checked counts the upper-leg
// vertices measured). The cat's matrices are updated here.
export function flankLumps(cat) {
  cat.updateMatrixWorld(true);
  const { body, underside, legs } = cat.userData.parts;
  const surfaces = [body, underside].filter(Boolean).map(triangles);
  const v = new THREE.Vector3();
  let worst = -Infinity, at = null, checked = 0;
  legs.forEach((leg, i) => {
    const kind = leg.userData.fold;
    const shape = FOLDS[kind]?.[i < 2 ? 'front' : 'hind'];
    if (!shape) return;
    const knee = 1 / (shape.points.length - 1);
    const limb = leg.children[0];
    const pos = limb.geometry.attributes.position, { t } = limb.geometry.userData;
    for (let k = 0; k < pos.count; k++) {
      if (t[k] > knee - 1e-6) continue;
      checked++;
      v.fromBufferAttribute(pos, k).applyMatrix4(limb.matrixWorld);
      let out = Infinity, ny = 0;
      for (const s of surfaces) {
        const h = nearest(s, v);
        if (h.dist < out) { out = h.dist; ny = h.ny; }
      }
      if (out <= 0 || ny < FLANK_NY) continue;
      if (out > worst) { worst = out; at = `leg ${i} t ${t[k].toFixed(3)} (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`; }
    }
  });
  return { worst, at, checked };
}

// How far the tail's root stands above the rump in the side profile: every
// vertex of the first link's mesh (the root ball and the link) against the
// torso's top straight above or below it at its z (a ray down the centre
// line, where the back is highest), wherever the torso reaches that z. The
// worst, in metres, as { worst, at, checked }.
const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
export function tailRootAboveRump(cat) {
  cat.updateMatrixWorld(true);
  const { body, tailPivots } = cat.userData.parts;
  const mesh = tailPivots[0].children.find((c) => c.isMesh);
  const pos = mesh.geometry.attributes.position, v = new THREE.Vector3(), o = new THREE.Vector3();
  let worst = -Infinity, at = null, checked = 0;
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
    _ray.set(o.set(0, 5, v.z), _down);
    const hit = _ray.intersectObject(body, false)[0];
    if (!hit) continue;
    checked++;
    if (v.y - hit.point.y > worst) { worst = v.y - hit.point.y; at = `(${v.y.toFixed(3)}, z ${v.z.toFixed(3)}) over the rump at ${hit.point.y.toFixed(3)}`; }
  }
  return { worst, at, checked };
}
