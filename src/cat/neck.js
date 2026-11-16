import * as THREE from 'three';
import { NECK, TORSO, SKULL, deformTorso, torsoNormalAt } from './torso.js';

// THE NECK'S SKIN (cat realism B1; torso.js NECK has the design). The neck is
// RINGS rings of NECK.AROUND points: ring 0 is the B loop on the torso, ring 2
// the M loop round the neck line, ring 4 the H loop on the skull, rings 1 and 3
// eased between them (the parabola through B, M and H, point for point). It is
// part of the underside's one mesh (model.js undersideGeometry), so it costs
// no draw call; layNeck re-lays its 60 points wherever the body, the neck line
// and the head are this frame.
export const NECK_RINGS = 5;

// The three loops at rest, each in its own frame: `b` and its normals `bn` in
// the torso mesh's frame (before the body's scale), with `bu` the undeformed
// unit direction of each point (for the coat's colour there); `m` in the
// head's frame (carried with the collar); `h` and `hn` in the head's frame.
// Point j of every loop is at the same angle round the neck: 0 at the nape,
// a quarter turn on at the cat's right (+x), half at the throat.
export function neckLoops(bare = false) {
  const N = NECK.AROUND;
  const b = new Float32Array(N * 3), bn = new Float32Array(N * 3), bu = new Float32Array(N * 3);
  const m = new Float32Array(N * 3), h = new Float32Array(N * 3), hn = new Float32Array(N * 3);
  const [rx, ry, rz] = SKULL.SCALE.map((k) => k * SKULL.R);
  const ct = Math.cos(NECK.TILT), st = Math.sin(NECK.TILT), ca = Math.cos(NECK.ALPHA), sa = Math.sin(NECK.ALPHA);
  // the collar's ring lies square to the resting neck, which leans 0.33 rad
  const cm = Math.cos(0.33), sm = Math.sin(0.33);
  const nape = bare ? NECK.NAPE : 0;
  const n = [0, 0, 0];
  for (let j = 0; j < N; j++) {
    const a = (j / N) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a), up = Math.max(0, c);
    // B: on the torso, sunk a little toward its centre
    const zB = NECK.BASE_Z + (NECK.NAPE_Z - NECK.BASE_Z) * nape * up * up;
    const rB = Math.sqrt(1 - zB * zB);
    const u = [s * rB, c * rB, zB];
    const p = deformTorso(u[0], u[1], u[2]);
    const sinkB = 1 - NECK.SINK / (TORSO.R * Math.hypot(p[0], p[1], p[2]));
    b.set([p[0] * TORSO.R * sinkB, p[1] * TORSO.R * sinkB, p[2] * TORSO.R * sinkB], j * 3);
    bn.set(torsoNormalAt(u, n), j * 3);
    bu.set(u, j * 3);
    // M: round the neck line, square to it (back high at the nape, front low
    // at the throat, as the collar's ring lies); a bare cat's nape stands out
    const r = c > 0 ? NECK.R_SIDE + (NECK.R_BACK - NECK.R_SIDE) * c * c : NECK.R_SIDE + (NECK.R_FRONT - NECK.R_SIDE) * c * c;
    const w = nape * up * up * up;
    const my = NECK.M_AT[1] + r * c * sm, mz = NECK.M_AT[2] + r * c * cm;
    m.set([NECK.M_AT[0] + r * s, my + w * (NECK.M_NAPE[1] - (NECK.M_AT[1] + NECK.R_BACK * sm)), mz + w * (NECK.M_NAPE[2] - (NECK.M_AT[2] + NECK.R_BACK * cm))], j * 3);
    // H: on the skull, ALPHA round the axis pointing down and TILT back
    const d = [sa * s, -ca * ct + sa * c * st, ca * st + sa * c * ct];
    const k = 1 / Math.hypot(d[0] / rx, d[1] / ry, d[2] / rz);
    const sinkH = 1 - NECK.SINK / k;
    h.set([d[0] * k * sinkH, d[1] * k * sinkH, d[2] * k * sinkH], j * 3);
    const nx = d[0] * k / (rx * rx), ny = d[1] * k / (ry * ry), nz = d[2] * k / (rz * rz), nL = Math.hypot(nx, ny, nz);
    hn.set([nx / nL, ny / nL, nz / nL], j * 3);
  }
  return { b, bn, bu, m, h, hn };
}

// Add the neck to the underside's geometry `geo` (indexed; position, normal
// and colour): NECK_RINGS x AROUND more points (laid by layNeck) with the
// colours `col`, and their faces. Returns the neck's first vertex. The arrays
// are grown in place of making a geometry to merge: a new three.js geometry
// draws a uuid from Math.random, which would shift every seeded stream that
// follows a cat's build.
export function addNeck(geo, col) {
  const N = NECK.AROUND, count = NECK_RINGS * N, start = geo.attributes.position.count;
  const grow = (name, fill) => {
    const old = geo.attributes[name].array, arr = new Float32Array(old.length + count * 3);
    arr.set(old);
    if (fill) arr.set(fill, old.length);
    geo.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  };
  grow('position'); grow('normal'); grow('color', col);
  const idx = Array.from(geo.index.array);
  for (let i = 0; i < NECK_RINGS - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = start + i * N + j, b = start + i * N + (j + 1) % N, c = start + (i + 1) * N + j, d = start + (i + 1) * N + (j + 1) % N;
      idx.push(a, b, c, b, d, c);
    }
  }
  geo.setIndex(idx);
  return start;
}

// Lay the neck: write its points and normals into `geo` (the underside's
// geometry) from vertex `neck.start` on. `bodyM`, `headM` and `underM` are the
// body's, the head's and the underside's matrices this frame; `carryM` is the
// collar's carry (head.matrix x the neck's move, animator.js neckMove; the
// head's own matrix where neckwear rides the head). Everything is worked out
// in the cat's frame and written in the underside's. Allocates nothing.
const _B = new THREE.Vector3(), _M = new THREE.Vector3(), _H = new THREE.Vector3();
const _n = new THREE.Vector3(), _a = new THREE.Vector3(), _l = new THREE.Vector3(), _c = new THREE.Vector3();
const _U = new THREE.Matrix4(), _Uinv = new THREE.Matrix4();
const _nb = new THREE.Matrix3(), _nh = new THREE.Matrix3(), _ut = new THREE.Matrix3();
const _P = new Float32Array(NECK_RINGS * 64 * 3), _Nn = new Float32Array(NECK_RINGS * 64 * 3);
// A point written into a Float32Array. Not Vector3.toArray: that one method
// is shared by every caller, and once any of them has grown a plain array
// through it (building a cape, a backpack or a balloon does) its store turns
// generic for all. This runs 300 times a frame for every detailed cat, and
// measured through toArray the whole animator took twice as long from the
// moment such a cat was built (0.013 -> 0.026 ms a cat, 2026-11-15).
const put = (arr, k, v) => { arr[k] = v.x; arr[k + 1] = v.y; arr[k + 2] = v.z; };
export function layNeck(neck, bodyM, headM, carryM, underM, geo, dip = 0) {
  const N = neck.around, R = NECK_RINGS;
  const { b, bn, m, h, hn } = neck.loops;
  for (let j = 0; j < N; j++) {
    _B.fromArray(b, j * 3).applyMatrix4(bodyM);
    _M.fromArray(m, j * 3).applyMatrix4(carryM);
    _H.fromArray(h, j * 3).applyMatrix4(headM);
    // Over the nape (the top third of the ring) the middle point stays within
    // NECK.NAPE_REACH of the B-to-H span of the midpoint between them, so a
    // head that drops (the sniff, the stalk) draws the nape down with it
    // instead of leaving it standing as a peak behind the ears.
    if (j <= neck.napeTo || j >= N - neck.napeTo) {
      _c.addVectors(_B, _H).multiplyScalar(0.5);
      const reach = NECK.NAPE_REACH * _B.distanceTo(_H), off = _M.distanceTo(_c);
      if (off > reach) _M.sub(_c).multiplyScalar(reach / off).add(_c);
    }
    put(_P, j * 3, _B);
    _P[(N + j) * 3] = 0.375 * _B.x + 0.75 * _M.x - 0.125 * _H.x;
    _P[(N + j) * 3 + 1] = 0.375 * _B.y + 0.75 * _M.y - 0.125 * _H.y;
    _P[(N + j) * 3 + 2] = 0.375 * _B.z + 0.75 * _M.z - 0.125 * _H.z;
    put(_P, (2 * N + j) * 3, _M);
    _P[(3 * N + j) * 3] = -0.125 * _B.x + 0.75 * _M.x + 0.375 * _H.x;
    _P[(3 * N + j) * 3 + 1] = -0.125 * _B.y + 0.75 * _M.y + 0.375 * _H.y;
    _P[(3 * N + j) * 3 + 2] = -0.125 * _B.z + 0.75 * _M.z + 0.375 * _H.z;
    put(_P, (4 * N + j) * 3, _H);
  }
  if (dip) dipNape(neck, carryM, dip);
  // Normals, cat frame. The end rings wear their surfaces' own (the torso's,
  // the skull's); the three between take the skin's, from their neighbours
  // round the ring and along the neck, turned to face out from the ring.
  _nb.getNormalMatrix(bodyM); _nh.getNormalMatrix(headM);
  for (let j = 0; j < N; j++) {
    put(_Nn, j * 3, _n.fromArray(bn, j * 3).applyMatrix3(_nb).normalize());
    put(_Nn, (4 * N + j) * 3, _n.fromArray(hn, j * 3).applyMatrix3(_nh).normalize());
  }
  for (let i = 1; i < R - 1; i++) {
    _c.set(0, 0, 0);
    for (let j = 0; j < N; j++) { _c.x += _P[(i * N + j) * 3]; _c.y += _P[(i * N + j) * 3 + 1]; _c.z += _P[(i * N + j) * 3 + 2]; }
    _c.divideScalar(N);
    for (let j = 0; j < N; j++) {
      const k = (i * N + j) * 3, kp = (i * N + (j + 1) % N) * 3, km = (i * N + (j + N - 1) % N) * 3, ku = k + N * 3, kd = k - N * 3;
      _a.set(_P[kp] - _P[km], _P[kp + 1] - _P[km + 1], _P[kp + 2] - _P[km + 2]);
      _l.set(_P[ku] - _P[kd], _P[ku + 1] - _P[kd + 1], _P[ku + 2] - _P[kd + 2]);
      _n.crossVectors(_a, _l);
      const out = _n.x * (_P[k] - _c.x) + _n.y * (_P[k + 1] - _c.y) + _n.z * (_P[k + 2] - _c.z);
      const L = _n.length() * (out < 0 ? -1 : 1);
      if (L === 0) _n.set(_P[k] - _c.x, _P[k + 1] - _c.y, _P[k + 2] - _c.z).normalize(); else _n.divideScalar(L);
      put(_Nn, k, _n);
    }
  }
  // Into the underside's own frame: points by the inverse of body x underside,
  // normals by its transpose.
  _U.multiplyMatrices(bodyM, underM);
  _Uinv.copy(_U).invert();
  _ut.setFromMatrix4(_U).transpose();
  const pos = geo.attributes.position, nor = geo.attributes.normal, at = neck.start * 3, count = R * N;
  for (let k = 0; k < count; k++) {
    put(pos.array, at + k * 3, _B.fromArray(_P, k * 3).applyMatrix4(_Uinv));
    put(nor.array, at + k * 3, _n.fromArray(_Nn, k * 3).applyMatrix3(_ut).normalize());
  }
  pos.clearUpdateRanges(); pos.addUpdateRange(at, count * 3); pos.needsUpdate = true;
  nor.clearUpdateRanges(); nor.addUpdateRange(at, count * 3); nor.needsUpdate = true;
}

// The nape's dip (NECK.SIT_DIP; the sit, cat realism B11): each middle point
// of the nape (ring 2 of the points just laid in _P) is drawn `dip` metres in
// toward the throat's point across the ring, most at the top of the nape, and
// the eased rings either side of it follow (0.75 of the way, as they are 0.75
// of the middle point), so the back of the neck curves in between the
// shoulders and the skull. Its own function, called only in the sit: written
// into layNeck's loop it slowed every state's neck (measured 2026-11-16).
function dipNape(neck, carryM, dip) {
  const N = neck.around, { m } = neck.loops;
  for (let j = 0; j < N; j++) {
    if (j > neck.napeTo && j < N - neck.napeTo) continue;
    const up = Math.cos((j / N) * Math.PI * 2), k = (2 * N + j) * 3;
    _l.fromArray(m, ((j + N / 2) % N) * 3).applyMatrix4(carryM);
    _l.x -= _P[k]; _l.y -= _P[k + 1]; _l.z -= _P[k + 2];
    const L = _l.length();
    if (L < 1e-6) continue;
    _l.multiplyScalar(dip * up * up / L);
    const a = k - N * 3, b = k + N * 3;
    _P[k] += _l.x; _P[k + 1] += _l.y; _P[k + 2] += _l.z;
    _P[a] += _l.x * 0.75; _P[a + 1] += _l.y * 0.75; _P[a + 2] += _l.z * 0.75;
    _P[b] += _l.x * 0.75; _P[b + 1] += _l.y * 0.75; _P[b + 2] += _l.z * 0.75;
  }
}

// The torso's own extent: Box3.setFromObject(body, true) (every vertex of the
// body mesh and all it carries, world frame), less the neck's points. The neck
// is in the underside's mesh but reaches up to the skull, and what measures
// the torso (waterlook.js waterFit: how deep a cat swims) means the torso.
const _bv = new THREE.Vector3();
export function torsoBox(body, box = new THREE.Box3()) {
  box.makeEmpty();
  body.updateWorldMatrix(false, true);
  body.traverse((o) => {
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const neck = o.userData.neck, from = neck ? neck.start : Infinity, to = neck ? neck.start + NECK_RINGS * neck.around : Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (i >= from && i < to) continue;
      box.expandByPoint(_bv.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}
