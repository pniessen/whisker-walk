import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TORSO, SKULL, deformTorso, shellInflate, torsoUnitAt } from './torso.js';

// The capes' cloth (moved out of model.js so backitems.js reads CAPE and
// CAPE_SIT without an import cycle; model.js re-exports all four names).
// A cape (either) is a cloak (polish-pose Task 2): cloth hung on the torso
// (capeGeometry, below), with no scale of its own, so it follows every pose as
// the coats do. It was a 32×40 cm slab behind the rump that read, the owner
// said, "like a dishtowel draped over the tail". Its grid runs across a (-1 one
// flank, 0 the spine, +1 the other) and along s (0 the neck edge, 1 the hem):
// the unit direction's z goes from zFront to zBackAt(a) = zBack + (zBackSide -
// zBack)·a², short at the spine so the tail comes out from under the hem, long
// round the haunches; its half-wrap from the top line blends wrapFront (over
// the shoulders) through wrapMid to wrapBack (the haunch), radians. A point is
// the torso's own surface there, inflated like a coat (shellInflate) and by
// `inflate` more, the lower edge pushed out sideways by up to `flare` so it
// hangs off the flank like cloth. Measured on every preset, full and simple,
// in every state at t 0.4/1.3/2.2 (and walking at 1.5): the cloth is never
// nearer the fur than 1.5 cm (nap) nor the ground than 16 cm (the stalk; the
// sit wears CAPE_SIT, below, which is 15.6 cm up; this cloth was 1.6), and
// never nearer the tail's root than 4.2 cm (stretch) — a longer spine (zBack)
// reaches it. The neck edge's spine end lies under the head.
export const CAPE = Object.freeze({ zFront: -0.8, zBack: 0.68, zBackSide: 0.98, wrapFront: 1.9, wrapMid: 1.85, wrapBack: 1.7, inflate: 1.03, flare: 0.08 });
// The sit's cloth (polish-pose fix wave): the same cloak with its haunch hem
// taken up, worn only in the sit (animator.js swaps the geometry; both are
// built here). The upright sit curls the tail forward round the left haunch
// on the ground, and the standing hem (zBackSide 0.98, half-wrap 1.7 down the
// flank, flared) lay over that curl: from behind and above 192 of 464 seen
// tabby tail vertices were under the cloth, and it came within 0.1 mm of
// link 2 (it clipped). Here the hem ends further forward round the haunch
// (zBackSide 0.75) and higher up the flank (wrapBack 1.0 rad). Measured on
// every preset, full and simple, both sits at t 0..3 every 0.5, from behind
// and from behind-left at the walk camera's distance: no seen tail vertex is
// under the cloth (wrapBack 1.1 left Digit's flicking tip 3-5% under it), and
// the cloth is at least 4.5 cm from every tail vertex (Digit; 5.7 the
// others). Its lowest point is 15.6 cm off the ground (the standing cloth came to 1.6 in the sit). The
// neck edge (s 0) is the same, so the front bands (CAPE_TIE) start where they do standing; the sitting back
// is still covered from the shoulders to the hips.
export const CAPE_SIT = Object.freeze({ ...CAPE, zBackSide: 0.75, wrapBack: 1.0 });
// The cape's point at (a, s): a across (-1 one flank, 0 the spine, +1 the
// other), s along (0 the neck edge, 1 the hem). Body-local, before the body's
// scale (the frame of the torso's own geometry). See CAPE.
const capeSmooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export function capePoint(a, s, out = new THREE.Vector3(), C = CAPE) {
  const wrap = s < 0.5
    ? C.wrapFront + (C.wrapMid - C.wrapFront) * capeSmooth(0, 0.5, s)
    : C.wrapMid + (C.wrapBack - C.wrapMid) * capeSmooth(0.5, 1, s);
  const zBackAt = C.zBack + (C.zBackSide - C.zBack) * a * a;
  const uz = C.zFront + (zBackAt - C.zFront) * s;
  const r = Math.sqrt(1 - uz * uz), phi = a * wrap;
  const dx = r * Math.sin(phi), dy = r * Math.cos(phi);
  const [x, y, z] = deformTorso(dx, dy, uz);
  const k = TORSO.R * shellInflate(dy) * C.inflate;
  out.set(x * k, y * k, z * k);
  out.x += Math.sign(dx) * C.flare * capeSmooth(0.3, -0.2, dy);
  return out;
}

// The cape's cloth: a grid of (a, s), 24×20 (12×10 simple), double-sided.
export function capeGeometry(simple, C = CAPE) {
  const [na, ns] = simple ? [12, 10] : [24, 20];
  const pos = new Float32Array((na + 1) * (ns + 1) * 3), idx = [], p = new THREE.Vector3();
  for (let j = 0; j <= ns; j++) {
    for (let i = 0; i <= na; i++) {
      capePoint(-1 + (2 * i) / na, j / ns, p, C);
      p.toArray(pos, (j * (na + 1) + i) * 3);
      if (i < na && j < ns) {
        const q = j * (na + 1) + i, r = q + na + 1;
        idx.push(q, r, q + 1, q + 1, r, r + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// THE THROAT CLASP (owner, 2026-11-04). A cape fastens at the throat: its two
// front edges run from the shoulders to the front of the neck, under the chin,
// where one gold clasp pins them. (It was a brooch on the front of each
// shoulder: polish-pose had kept the clasp off the throat because a clasp
// hung on the BODY there sinks into the head or the chest as the neck moves.)
// So the clasp is not hung on the body. It sits where a collar's charm hangs
// (model.js: the collar's seat + COLLAR_CHARM, head frame) and is carried on
// the neck exactly as the collar is (animator.js fitNeck's neckMove: on the
// head as built in the stretch and the swim); each front edge is a cloth band
// from the cape's neck edge on the front of the shoulder (capePoint(±a, s),
// lifted `lift` off the cloth) to the clasp's side (`tuck` × r out along the
// head's x, under the clasp), a quadratic curve bowed `bulge` out from the
// chest centre (the band's middle would cut the chest), `w0` wide at the
// shoulder narrowing to `w1` at the clasp. Clasp and bands are ONE vertex-
// coloured mesh on the body, re-laid every frame (layCapeTie: a few dozen
// vertices). The clasp is a gold disc (a ball of radius r flattened to `flat`
// along its face, which looks forward and a little down: `face`, head frame)
// with a small ruby (`gem` × r) in its face, so it reads as a brooch, not a
// collar's bell. Sizes are in the head's frame, as every neck piece's are
// (× HEAD.SCALE on the cat).
export const CAPE_TIE = Object.freeze({ a: 0.6, s: 0.02, lift: 0.008, bulge: 0.05, w0: 0.1, w1: 0.035, tuck: 0.55, r: 0.04, flat: 0.45, gem: 0.38, ruby: 0xb3172f, face: Object.freeze([0, -0.35, -1]), rows: 9, simpleRows: 6 });

// The tie's geometry: the clasp (when `clasp`) then the two bands (rows × 2
// vertices each, -x side first), vertex-coloured; positions are written by
// layCapeTie. userData.tie: { clasp: [start, count] | null, bands: [[start,
// count], [start, count]], rows, template (the clasp's head-frame vertices),
// throat (head frame), shoulders (the bands' body-local start points) }.
export function capeTieGeometry({ simple, clasp, throat, band, gold, shape, C = CAPE }) {
  const rows = simple ? CAPE_TIE.simpleRows : CAPE_TIE.rows;
  const T = CAPE_TIE;
  let template = null, clIdx = [], gemFrom = Infinity;
  if (clasp) {
    // a gold disc with a ruby in its face (gem × r, standing half out of the gold)
    const disc = new THREE.SphereGeometry(T.r, simple ? 6 : 8, simple ? 4 : 6).scale(1, 1, T.flat);
    const gem = new THREE.SphereGeometry(T.r * T.gem, simple ? 5 : 6, 4).scale(1, 1, 0.7).translate(0, 0, -T.r * T.flat * 0.75);
    const both = mergeGeometries([disc.deleteAttribute('uv').deleteAttribute('normal'), gem.deleteAttribute('uv').deleteAttribute('normal')]);
    both.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(...T.face).normalize()));
    both.translate(...throat);
    template = Array.from(both.attributes.position.array);
    clIdx = Array.from(both.index.array);
    gemFrom = disc.attributes.position.count;
    disc.dispose(); gem.dispose(); both.dispose();
  }
  const nClasp = template ? template.length / 3 : 0;
  const n = nClasp + 2 * 2 * rows;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [...clIdx];
  const g = new THREE.Color(gold), r = new THREE.Color(band), ruby = new THREE.Color(T.ruby);
  for (let i = 0; i < n; i++) (i < nClasp ? (i < gemFrom ? g : ruby) : r).toArray(col, i * 3);
  const bands = [0, 1].map((k) => {
    const start = nClasp + k * 2 * rows;
    for (let j = 0; j < rows - 1; j++) {
      const q = start + 2 * j;
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
    return [start, 2 * rows];
  });
  // each band's start: on the cloth's neck edge at the front of the shoulder,
  // lifted off it along the cloth's normal (body-local, before the body's scale)
  const P = new THREE.Vector3(), A = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3();
  const shoulders = [-1, 1].map((side) => {
    const a = side * T.a;
    capePoint(a, T.s, P, C);
    capePoint(a + 0.01, T.s, A, C).sub(P);
    capePoint(a, T.s + 0.01, S, C).sub(P);
    N.crossVectors(S, A).normalize();
    if (N.dot(P) < 0) N.negate();
    return P.clone().addScaledVector(N, T.lift).toArray();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.userData.tie = { clasp: template ? [0, nClasp] : null, bands, rows, template, throat: [...throat], shoulders, shape };
  return geo;
}

// Clear of the cat. Every band vertex, and the clasp as a whole, is pushed
// out of the skull (torso.js SKULL, on the head) to `skull` × its size, out
// of the torso's fur to `torso` × its radius there (the cape cloth lies at
// ~1.09), and out of the chest and belly balls (the underside: model.js
// undersideGeometry, each an ellipsoid in the cat's resting frame) to
// `chest` × their size, radially from each centre. A pose can bring the head
// back over the shoulders (the arch), bulge the chest over them (the cross's
// counter-yawed underside) or lay the throat on the chest (the sniff): the
// band and the clasp then ride out over it instead of through it.
export const CAPE_TIE_CLEAR = Object.freeze({ skull: 1.1, torso: 1.05, chest: 1.12, passes: 3 });

const _inv = new THREE.Matrix4();
const _invHead = new THREE.Matrix4();
const _invUnder = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _cl = new THREE.Vector3();
const _x = new THREE.Vector3();
const _f = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _o = new THREE.Vector3();
const _w = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _head = new THREE.Vector3();
const _push = new THREE.Vector3();
const _best = new THREE.Vector3();
const _L = new THREE.Vector3();
const _u = [0, 0, 0];
const _d = [0, 0, 0];
const _M = { body: null, head: null, under: null };   // this frame's matrices (set by layCapeTie)
// Push P (cat frame) out of the skull, the torso and the underside balls, in place.
function clear(P, shape) {
  const C = CAPE_TIE_CLEAR;
  for (let pass = 0; pass < C.passes; pass++) {
    let moved = false;
    // the skull
    _L.copy(P).applyMatrix4(_invHead);
    const rx = SKULL.R * SKULL.SCALE[0], ry = SKULL.R * SKULL.SCALE[1], rz = SKULL.R * SKULL.SCALE[2];
    let k = Math.hypot(_L.x / rx, _L.y / ry, _L.z / rz);
    if (k < C.skull) { P.copy(_L.multiplyScalar(C.skull / Math.max(k, 1e-6)).applyMatrix4(_M.head)); moved = true; }
    // the torso (body-local, before the body's scale)
    _L.copy(P).applyMatrix4(_inv);
    const len = _L.length();
    _L.toArray(_d);
    torsoUnitAt(_d, _u);
    const [sx, sy, sz] = deformTorso(_u[0], _u[1], _u[2]);
    const surf = TORSO.R * Math.hypot(sx, sy, sz);
    if (len < C.torso * surf) { P.copy(_L.multiplyScalar(C.torso * surf / Math.max(len, 1e-6)).applyMatrix4(_M.body)); moved = true; }
    // the chest and belly balls (underside-local → the cat's resting frame)
    for (const ball of shape.balls) {
      _L.copy(P).applyMatrix4(_inv).applyMatrix4(_invUnder);
      const [bx, by, bz] = shape.bs;
      const ex = _L.x * bx - ball.at[0], ey = _L.y * by + shape.cy - ball.at[1], ez = _L.z * bz - ball.at[2];
      k = Math.hypot(ex / ball.r[0], ey / ball.r[1], ez / ball.r[2]);
      if (k < C.chest) {
        const g = C.chest / Math.max(k, 1e-6);
        _L.set((ball.at[0] + ex * g) / bx, (ball.at[1] + ey * g - shape.cy) / by, (ball.at[2] + ez * g) / bz)
          .applyMatrix4(_M.under).applyMatrix4(_M.body);
        P.copy(_L);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return P;
}

// Lay the clasp and bands for this frame. `claspM`: the clasp's head frame →
// the cat's frame (head.matrix · the neck's carry); `bodyM`, `headM`,
// `underM`: body.matrix, head.matrix, underside.matrix (the underside's is in
// the body's frame). Writes body-local positions, normals and the bounding
// sphere; returns the clasp centre, body-local (also kept in
// mesh.userData.at). Allocates nothing of its own after the first call
// (deformTorso returns a small array per cleared point).
export function layCapeTie(mesh, claspM, bodyM, headM, underM) {
  const geo = mesh.geometry, tie = geo.userData.tie, T = CAPE_TIE;
  const pos = geo.attributes.position;
  _M.body = bodyM; _M.head = headM; _M.under = underM;
  _inv.copy(bodyM).invert();
  _invHead.copy(headM).invert();
  _invUnder.copy(underM).invert();
  _chest.fromArray(tie.shape.chestCentre).applyMatrix4(underM).applyMatrix4(bodyM);
  _head.setFromMatrixPosition(headM);
  _cl.fromArray(tie.throat).applyMatrix4(claspM);                       // the clasp's centre, cat frame
  _x.setFromMatrixColumn(claspM, 0).normalize();                        // the head's x, cat frame
  _f.fromArray(T.face).transformDirection(claspM);                      // the clasp's face, cat frame
  // the clasp, moved whole: by the largest push any of its rim and face
  // points needs, until none needs one
  for (let pass = 0; pass < 3; pass++) {
    _best.set(0, 0, 0);
    // (the rim's points taken 15% wide, so the facets between them clear too)
    for (let k = 0; k < 7; k++) {
      _v.copy(_cl);
      if (k === 1 || k === 2) _v.addScaledVector(_x, (k === 1 ? 1 : -1) * T.r * 1.15);
      if (k === 3 || k === 4) _v.addScaledVector(_t.crossVectors(_f, _x).normalize(), (k === 3 ? 1 : -1) * T.r * 1.15);
      if (k === 5 || k === 6) _v.addScaledVector(_f, (k === 5 ? 1 : -1) * T.r * T.flat * 1.15);
      _push.copy(_v);
      clear(_push, tie.shape).sub(_v);
      if (_push.lengthSq() > _best.lengthSq()) _best.copy(_push);
    }
    if (_best.lengthSq() === 0) break;
    _cl.add(_best);
  }
  if (tie.template) {
    // the template is head-frame about tie.throat: carried, then moved to the cleared centre
    _o.fromArray(tie.throat).applyMatrix4(claspM);
    const tp = tie.template;
    for (let i = 0; i < tp.length / 3; i++) {
      _v.set(tp[i * 3], tp[i * 3 + 1], tp[i * 3 + 2]).applyMatrix4(claspM).sub(_o).add(_cl).applyMatrix4(_inv);
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
  }
  const rows = tie.rows;
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1;
    _p0.fromArray(tie.shoulders[k]).applyMatrix4(bodyM);
    _p1.copy(_cl).addScaledVector(_x, side * T.tuck * T.r).addScaledVector(_f, -0.3 * T.r);
    _mid.addVectors(_p0, _p1).multiplyScalar(0.5);
    _q.subVectors(_mid, _chest).normalize();
    _o.subVectors(_mid, _head).normalize();
    _q.add(_o).normalize().multiplyScalar(T.bulge).add(_mid);
    const start = tie.bands[k][0];
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1), u = 1 - t;
      _b.copy(_p0).multiplyScalar(u * u).addScaledVector(_q, 2 * u * t).addScaledVector(_p1, t * t);
      _t.subVectors(_q, _p0).multiplyScalar(2 * u).addScaledVector(_w.subVectors(_p1, _q), 2 * t);
      _o.subVectors(_b, _chest).normalize();
      _w.crossVectors(_t, _o).normalize().multiplyScalar(side * (T.w0 + (T.w1 - T.w0) * t) / 2);
      // the last row stays tucked under the clasp; every other vertex is cleared
      const last = j === rows - 1;
      _v.copy(_b).add(_w); if (!last) clear(_v, tie.shape);
      _v.applyMatrix4(_inv);
      pos.setXYZ(start + 2 * j, _v.x, _v.y, _v.z);
      _v.copy(_b).sub(_w); if (!last) clear(_v, tie.shape);
      _v.applyMatrix4(_inv);
      pos.setXYZ(start + 2 * j + 1, _v.x, _v.y, _v.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  _cl.applyMatrix4(_inv);
  const at = (mesh.userData.at ??= [0, 0, 0]);
  _cl.toArray(at);
  return at;
}
