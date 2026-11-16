import * as THREE from 'three';
import { SKULL } from './torso.js';

// THE FACE (cat realism round 3, 2026-11-15).
//
// Tier A, on every detailed cat: a mouth, a nose that lies on the muzzle,
// whiskers that fan and curve (noseGeometry, whiskerGeometry), and rounder
// head parts (FACE_SEG).
//
// Tier B, OPTIONS the owner picks from pictures. FACE holds the pick for each;
// the game's default is today's shape until he chooses, and picking one is a
// one-line change of the default here. The picture harness sets these before
// it builds a cat (as it does torso.js PROPORTION).
//   eyes:    'today' | 'soft' (same size, almond, set into the face, a dark
//            rim, a two-tone iris) | 'cat' (a smaller iris, a stronger slant)
//   profile: 'today' | 'profile' (a gentle brow, a slope down to the nose,
//            fuller cheeks below the eyes)
//   ears:    'today' | 'shell' (a cupped shell with a wider base, lower and
//            further out, tipped forward; ear-tip tufts on a tufted cat)
// Owner's picks from the option sheets, 2026-11-15: soft eyes, shell ears,
// today's profile.
export const FACE = { eyes: 'soft', profile: 'today', ears: 'shell' };
export const FACE_OPTIONS = Object.freeze({
  eyes: Object.freeze(['today', 'soft', 'cat']),
  profile: Object.freeze(['today', 'profile']),
  ears: Object.freeze(['today', 'shell']),
});

// A3: segments of the detailed cat's head parts ([around, up]). They were
// skull 16x12, pads 8x6, eyes 8x6, pupils 6x5: flat facets in a close-up.
export const FACE_SEG = Object.freeze({ skull: [24, 16], pad: [12, 8], eye: [12, 8], pupil: [8, 6] });

const SA = SKULL.R * SKULL.SCALE[0], SB = SKULL.R * SKULL.SCALE[1], SC = SKULL.R * SKULL.SCALE[2];
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const _n = new THREE.Vector3();

// ---------------------------------------------------------------------------
// B5, the profile. The skull stays the ball it is (hats sit on its crown, the
// neck on its back); only its FRONT is pushed out along its own normal: a low
// brow over the eyes and a fuller cheek below each. Everything laid on the
// skull's front follows through faceWarp: its markings, the eyes of the
// 'soft' and 'cat' options, the nose bridge, face scars and war paint.
export const PROFILE = Object.freeze({
  brow: 0.011, browY: 0.09, browH: 0.04, browW: 0.12,
  cheek: 0.02, cheekX: 0.16, cheekW: 0.07, cheekY: -0.075, cheekH: 0.065,
  frontFrom: 0.04, frontOver: 0.08, // nothing behind z = frontFrom; all of it by frontFrom - frontOver
  bridgeTop: 0.085, bridgeWidth: 0.036,
});
// How far the skull is pushed out at a head-space point on (or near) it.
export function profileLift(x, y, z) {
  if (FACE.profile !== 'profile') return 0;
  const front = smooth((PROFILE.frontFrom - z) / PROFILE.frontOver);
  if (front === 0) return 0;
  const brow = PROFILE.brow * Math.exp(-(((y - PROFILE.browY) / PROFILE.browH) ** 2) - (x / PROFILE.browW) ** 2);
  const cheek = PROFILE.cheek * Math.exp(-(((Math.abs(x) - PROFILE.cheekX) / PROFILE.cheekW) ** 2) - ((y - PROFILE.cheekY) / PROFILE.cheekH) ** 2);
  return front * (brow + cheek);
}
// A head-space point on the skull, moved (in place) to the shaped face.
export function faceWarp(p) {
  const k = profileLift(p.x, p.y, p.z);
  if (k) p.addScaledVector(_n.set(p.x / (SA * SA), p.y / (SB * SB), p.z / (SC * SC)).normalize(), k);
  return p;
}
// The face's surface along a direction from the head's centre: point and normal.
function faceAlong(d, out = new THREE.Vector3()) {
  const t = 1 / Math.hypot(d.x / SA, d.y / SB, d.z / SC);
  return faceWarp(out.copy(d).multiplyScalar(t));
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
function faceNormal(d, out = new THREE.Vector3()) {
  // two tangents by finite differences on the direction
  const u = _a.set(d.z, 0, -d.x); if (u.lengthSq() < 1e-8) u.set(1, 0, 0); u.normalize();
  const v = _b.crossVectors(d, u).normalize();
  const e = 0.01 * d.length();
  const p0 = faceAlong(d, _c);
  const pu = faceAlong(_d.copy(d).addScaledVector(u, e), new THREE.Vector3()).sub(p0);
  const pv = faceAlong(_d.copy(d).addScaledVector(v, e), new THREE.Vector3()).sub(p0);
  out.crossVectors(pu, pv).normalize();
  if (out.dot(d) < 0) out.negate();
  return out;
}
// The skull's front at (x, y), head space (z, front is -z), shaped by the profile.
export function skullFrontZ(x, y) {
  const q = 1 - (x / SA) ** 2 - (y / SB) ** 2;
  return faceWarp(_c.set(x, y, -SC * Math.sqrt(Math.max(0, q)))).z;
}
// The skull mesh's own sphere (radius SKULL.R, scaled by `scale`) or a marking
// patch on it (a hair larger), reshaped in place. Normals are re-derived for
// the skull (`normals`); a thin patch keeps the sphere's.
export function shapeSkull(geo, scale, normals = true) {
  if (FACE.profile !== 'profile') return geo;
  const p = geo.attributes.position, n = geo.attributes.normal;
  const v = new THREE.Vector3(), w = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).multiply(w.set(...scale));
    const lift = profileLift(v.x, v.y, v.z);
    if (!lift) continue;
    if (normals) faceNormal(v, nn);
    v.addScaledVector(_n.set(v.x / (SA * SA), v.y / (SB * SB), v.z / (SC * SC)).normalize(), lift);
    p.setXYZ(i, v.x / scale[0], v.y / scale[1], v.z / scale[2]);
    // a normal for a mesh scaled by `scale`: the renderer applies the inverse
    if (normals) { nn.multiply(w).normalize(); n.setXYZ(i, nn.x, nn.y, nn.z); }
  }
  p.needsUpdate = true;
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}

// ---------------------------------------------------------------------------
// A small triangle soup: positions, colours and triangles gathered in plain
// arrays and turned into ONE BufferGeometry at the end (three.js draws
// Math.random for every geometry's uuid, and the seeded worlds run through the
// cat builds: each part here makes exactly the one geometry it replaced).
function soup() {
  const pos = [], col = [], idx = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  return {
    pos, col, idx,
    v(x, y, z, c) { pos.push(x, y, z); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; },
    // a triangle, wound to face `out` (a direction, or a function of its centre)
    tri(a, b, c, out) {
      A.fromArray(pos, a * 3); B.fromArray(pos, b * 3); C.fromArray(pos, c * 3);
      N.crossVectors(B.clone().sub(A), C.clone().sub(A));
      const o = typeof out === 'function' ? out(A.add(B).add(C).multiplyScalar(1 / 3)) : out;
      if (N.dot(o) < 0) idx.push(a, c, b); else idx.push(a, b, c);
    },
    quad(a, b, c, d, out) { this.tri(a, b, c, out); this.tri(a, c, d, out); },
    geometry(shift = [0, 0, 0]) {
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(pos);
      for (let i = 0; i < p.length; i += 3) { p[i] -= shift[0]; p[i + 1] -= shift[1]; p[i + 2] -= shift[2]; }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    },
  };
}
// A vertex colour that turns a material of colour `of` into colour `to` (the
// part's material keeps its own colour, which tests and the dark face read).
const tint = (to, of) => [to.r / Math.max(of.r, 1e-3), to.g / Math.max(of.g, 1e-3), to.b / Math.max(of.b, 1e-3)];
const ONE = [1, 1, 1];
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ---------------------------------------------------------------------------
// A1 + A2, the nose and the mouth.
//   * the leather: a small flat shield, wide at the top and coming to a point
//     over the lip, facing forward on the front of the muzzle (it was a ball
//     standing out in front of the face), with the mouth under it: the line
//     down from the nose and a short curve under each whisker pad. ONE mesh in
//     the nose's own material (noseGeometry), the mouth a vertex colour over it;
//   * the snout it lies on: a low rounded ridge of fur from the leather up to
//     the brow and round to the whisker pads, built INTO the skull's own
//     geometry (addSnout), so it is the head's fur: same material, same
//     shading and grain, no mesh of its own.
export const NOSE_SHAPE = Object.freeze({
  // the leather's outline from the front (x, y), right half, top middle first
  outline: Object.freeze([[0, -0.0085], [0.012, -0.0075], [0.0235, -0.0095], [0.0215, -0.02], [0.012, -0.03], [0, -0.0375]]),
  // The point reaches as far forward and as low as the ball did, and no
  // further: collars in the nap and the bib under a dropped head are fitted
  // to the nose's tip and lower edge (catmodel.test.js).
  topZ: -0.231, tipZ: -0.2505, edgeBack: 0.003, centre: [0, -0.022], skirt: 0.008,
  // the snout: its rows (y) and columns (x), the flat of its top and its half-width, how far it sits behind the leather
  rows: Object.freeze([-0.056, -0.046, -0.0375, -0.024, -0.0085, 0.006, 0.021, 0.036]),
  cols: Object.freeze([0, 0.009, 0.018, 0.027, 0.038, 0.05]),
  flat: 0.015, flatTop: 0.006, half: 0.05, stop: 1.5, stopTall: 1.15, under: 0.0035, sunk: 0.003, low: -0.056,
  mouth: Object.freeze({ from: -0.048, to: -0.09, width: 0.0034, reach: 0.044, dip: 0.011, rise: 0.007, lift: 0.0018 }),
});
const ellFront = (x, y, c, h) => { const q = 1 - ((x - c[0]) / h[0]) ** 2 - ((y - c[1]) / h[1]) ** 2; return q > 0 ? c[2] - h[2] * Math.sqrt(q) : Infinity; };
// The front of the face without the snout at (x, y): skull, whisker pads, chin.
// `muzzle`: { padAt, padHalf, chinAt, chinHalf } in head space (model.js CAT_MUZZLE).
const behindOf = (muzzle) => (x, y) => Math.min(skullFrontZ(x, y),
  ellFront(x, y, muzzle.padAt, muzzle.padHalf), ellFront(x, y, [-muzzle.padAt[0], muzzle.padAt[1], muzzle.padAt[2]], muzzle.padHalf),
  ellFront(x, y, muzzle.chinAt, muzzle.chinHalf));
const leatherZ = (x, y) => {
  const S = NOSE_SHAPE, half = S.outline, yTop = half[0][1], yTip = half[half.length - 1][1];
  return S.tipZ + ((y - yTip) / (yTop - yTip)) * (S.topZ - S.tipZ) + S.edgeBack * (x / 0.0235) ** 2;
};
// The snout's front at (x, y): its crest runs from under the leather straight
// up to the brow, flat across its top and falling away to the face either side.
function snoutZ(x, y, behind, top, stop) {
  const S = NOSE_SHAPE, yTop = S.outline[0][1], yTip = S.outline[S.outline.length - 1][1];
  const base = behind(x, y) + S.sunk;
  if (y >= top || y <= S.low) return base;
  const crest = y >= yTop
    ? behind(0, y) + S.sunk + (leatherZ(0, yTop) + S.under - behind(0, yTop) - S.sunk) * (1 - (y - yTop) / (top - yTop)) ** stop
    : leatherZ(0, Math.max(y, yTip)) + S.under;
  const up = Math.min(1, Math.max(0, (y - yTop) / (top - yTop)));
  const flat = S.flat + (S.flatTop - S.flat) * up;
  const across = 1 - smooth((Math.abs(x) - flat) / (S.half - flat));
  const below = smooth((y - S.low) / (yTip - S.low)); // rounds off under the leather's point
  return Math.min(base, base + (crest - base) * across * below);
}
// The snout, appended to the skull's own sphere geometry (in place: no new
// geometry). `scale` is the skull mesh's; `fur` the bridge's colour, `lip` the
// colour by the pads, `skull` the skull material's colour (THREE.Colors).
// The skull's material must draw vertex colours afterwards.
export function addSnout(geo, scale, { muzzle, fur, lip, skull, blaze = false }) {
  const S = NOSE_SHAPE, tall = FACE.profile === 'profile';
  const top = tall ? PROFILE.bridgeTop : S.rows[S.rows.length - 1];
  const rows = tall ? [...S.rows.slice(0, -1), 0.036, 0.06, top] : S.rows;
  const xs = [...S.cols.slice(1).reverse().map((x) => -x), ...S.cols];
  const behind = behindOf(muzzle);
  const furC = tint(fur, skull), lipC = tint(lip, skull);
  const pos = [], col = [], idx = [];
  for (const y of rows) for (const x of xs) {
    pos.push(x, y, snoutZ(x, y, behind, top, tall ? S.stopTall : S.stop));
    // the fur by the pads is the muzzle's; a blaze (Robbie) is only the crest
    const low = smooth((-0.012 - y) / 0.02) * smooth((Math.abs(x) - 0.004) / 0.02 + 0.6);
    const c = blaze ? mix3(furC, ONE, smooth((Math.abs(x) - 0.009) / 0.008)) : furC;
    col.push(...mix3(c, lipC, low));
  }
  const W = xs.length;
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < W - 1; c++) {
    const a = r * W + c, b = a + 1, d = a + W, e = d + 1;
    idx.push(a, d, b, b, d, e); // facing -z: +x is to the viewer's left
  }
  // smooth normals, head space
  const nor = new Float32Array(pos.length), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    A.fromArray(pos, idx[i] * 3); B.fromArray(pos, idx[i + 1] * 3); C.fromArray(pos, idx[i + 2] * 3);
    B.sub(A); C.sub(A); B.cross(C);
    for (const k of [idx[i], idx[i + 1], idx[i + 2]]) { nor[k * 3] += B.x; nor[k * 3 + 1] += B.y; nor[k * 3 + 2] += B.z; }
  }
  // into the skull's attributes, in its own (unscaled) space
  const p0 = geo.attributes.position, n0 = geo.attributes.normal, uv0 = geo.attributes.uv, i0 = geo.index;
  const n = p0.count, m = pos.length / 3;
  const P = new Float32Array((n + m) * 3), N = new Float32Array((n + m) * 3), K = new Float32Array((n + m) * 3).fill(1), U = new Float32Array((n + m) * 2);
  P.set(p0.array); N.set(n0.array); if (uv0) U.set(uv0.array);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < 3; k++) { P[(n + i) * 3 + k] = pos[i * 3 + k] / scale[k]; K[(n + i) * 3 + k] = col[i * 3 + k]; }
    A.set(nor[i * 3] * scale[0], nor[i * 3 + 1] * scale[1], nor[i * 3 + 2] * scale[2]).normalize();
    if (A.z > 0) A.negate(); // a facet seen from the front
    N.set([A.x, A.y, A.z], (n + i) * 3);
  }
  const I = new (n + m > 65535 ? Uint32Array : Uint16Array)(i0.count + idx.length);
  I.set(i0.array); for (let i = 0; i < idx.length; i++) I[i0.count + i] = idx[i] + n;
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(K, 3));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.userData.snout = { from: n, count: m }; // the appended vertices (tests)
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
// The leather and the mouth. `at`: the nose mesh's position; `nose`, `mouth`:
// THREE.Colors (the leather, which is the material's colour, and the mouth line).
export function noseGeometry({ muzzle, at, nose, mouth }) {
  const S = NOSE_SHAPE, sp = soup();
  const behind = behindOf(muzzle);
  const mouthC = tint(mouth, nose);
  // the whole outline, counter-clockwise from the top middle
  const half = S.outline, ring = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  const yTip = half[half.length - 1][1];
  const FRONT = new THREE.Vector3(0, 0, -1);
  const mid = new THREE.Vector3(S.centre[0], S.centre[1], -0.2);
  const outward = (c) => c.clone().sub(mid);
  // the leather's face (a fan), and its edge turned back into the snout
  const c0 = sp.v(S.centre[0], S.centre[1], leatherZ(...S.centre) - 0.0015, ONE);
  const rim = ring.map(([x, y]) => sp.v(x, y, leatherZ(x, y), ONE));
  const back = ring.map(([x, y]) => sp.v(x * 1.08, S.centre[1] + (y - S.centre[1]) * 1.08, leatherZ(x, y) + S.skirt, ONE));
  for (let j = 0; j < rim.length; j++) {
    const k = (j + 1) % rim.length;
    sp.tri(c0, rim[j], rim[k], FRONT);
    sp.quad(rim[j], rim[k], back[k], back[j], outward);
  }
  // the mouth: ribbons a hair in front of the muzzle
  const M = S.mouth;
  const ribbon = (pts) => {
    let prev = null;
    pts.forEach(([x, y, w], i) => {
      const [nx, ny] = pts[Math.min(i + 1, pts.length - 1)], [px, py] = pts[Math.max(i - 1, 0)];
      const tx = nx - px, ty = ny - py, tl = Math.hypot(tx, ty) || 1, ox = (-ty / tl) * w, oy = (tx / tl) * w;
      const at2 = (qx, qy) => sp.v(qx, qy, behind(qx, qy) - M.lift, mouthC);
      const pair = [at2(x + ox, y + oy), at2(x - ox, y - oy)];
      if (prev) sp.quad(prev[0], pair[0], pair[1], prev[1], FRONT);
      prev = pair;
    });
  };
  ribbon([0, 1, 2, 3].map((i) => [0, M.from + ((M.to - M.from) * i) / 3, M.width / 2]));
  for (const side of [-1, 1]) {
    ribbon([0, 1, 2, 3, 4, 5, 6].map((i) => {
      const u = i / 6;
      return [side * M.reach * u, M.to - M.dip * Math.sin(Math.PI * u) + M.rise * u * u, (M.width / 2) * (1 - 0.6 * u)];
    }));
  }
  const geo = sp.geometry(at);
  // the leather's own lower edge (mesh space): the "mouth line" hair must not cross
  // (model space), and which vertices are the leather (the first `count`)
  geo.userData.leather = { count: 1 + 2 * ring.length, minY: S.centre[1] + (yTip - S.centre[1]) * 1.08 - at[1] };
  return geo;
}

// ---------------------------------------------------------------------------
// A6, the whiskers: four a side fanning from the whisker pad, each a shallow
// curve that sweeps forward and droops at its tip, and two short ones over
// each eye. One LineSegments for all twelve (they were six separate lines).
// `reach`: how far out from the midline the longest may end (from behind the
// head must hide most of them).
export const WHISKERS = Object.freeze({
  seg: 4,
  // [root x, root y, root z, end x share of reach, end dy, end z]
  pad: Object.freeze([
    [0.066, -0.047, -0.214, 0.9, 0.05, -0.228],
    [0.071, -0.058, -0.216, 1, 0.02, -0.236],
    [0.072, -0.07, -0.214, 1, -0.012, -0.236],
    [0.068, -0.081, -0.208, 0.86, -0.04, -0.226],
  ]),
  // over the eye: [root x, y, end x, y, end z]; the root is on the brow
  brow: Object.freeze([[0.062, 0.082, 0.08, 0.135, -0.186], [0.076, 0.08, 0.104, 0.124, -0.176]]),
  bend: Object.freeze([0, 0.012, -0.008]),
});
export function whiskerGeometry(reach) {
  const W = WHISKERS, pts = [];
  const curve = (a, b, bend) => {
    let prev = null;
    for (let i = 0; i <= W.seg; i++) {
      const t = i / W.seg, k = 4 * t * (1 - t);
      const p = [a[0] + (b[0] - a[0]) * t + bend[0] * k, a[1] + (b[1] - a[1]) * t + bend[1] * k, a[2] + (b[2] - a[2]) * t + bend[2] * k];
      if (prev) pts.push(...prev, ...p);
      prev = p;
    }
  };
  for (const side of [-1, 1]) {
    for (const [x, y, z, share, dy, ez] of W.pad) curve([side * x, y, z], [side * reach * share, y + dy, ez], W.bend);
    for (const [x, y, ex, ey, ez] of W.brow) curve([side * x, y, skullFrontZ(x, y) + 0.004], [side * ex, ey, ez], [side * 0.004, 0.004, -0.012]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  return geo;
}

// ---------------------------------------------------------------------------
// B4, the eyes. 'soft' and 'cat' are an almond LENS lying on the face (the
// 'today' eye is a ball standing a centimetre proud of it): a two-tone iris,
// lighter round the pupil, inside a dark rim, the outer corner raised. One
// mesh, the rim and the iris tones in its vertex colours over the eye's own
// colour. The lens is built in its own flat frame (x across, y up, -z out of
// the face) and the mesh is turned to lie on the face, so the lids' y-scale
// (animator.js lids) still closes it to a line, about its own middle.
export const EYES = Object.freeze({
  at: [0.083, 0.03], // the right eye's centre from the front (today's spot)
  soft: Object.freeze({ a: 0.039, up: 0.035, down: 0.031, sharp: 0.72, slant: 0.14, pupil: [0.62, 1.2, 0.3], seg: 14 }),
  cat: Object.freeze({ a: 0.036, up: 0.028, down: 0.026, sharp: 0.8, slant: 0.3, pupil: [0.46, 1.08, 0.3], seg: 14 }),
  rings: Object.freeze([0.42, 0.88]), // the light iris ends, the rim begins (share of the lens)
  irisIn: 1.22, irisOut: 0.7, rim: 0x241a14,
  lift: Object.freeze({ centre: 0.004, iris: 0.0022, rim: 0.003, edge: 0.0006, skirt: -0.004 }),
  pupilLift: 0.0032, shine: Object.freeze([-0.012, 0.015, 0.0015]),
});
// Where an eye of this option sits: position, the turn that lays it on the
// face (with its slant), and the turn without the slant (the pupil's: a
// cat's pupil stands upright however the eye is set).
export function eyeFrame(side, kind) {
  const E = EYES, o = E[kind];
  const x = side * E.at[0], y = E.at[1];
  const q0 = 1 - (x / SA) ** 2 - (y / SB) ** 2;
  const d = new THREE.Vector3(x, y, -SC * Math.sqrt(Math.max(0, q0)));
  const at = faceAlong(d), n = faceNormal(d);
  const right = new THREE.Vector3(0, 1, 0).cross(n.clone().negate()).normalize(); // local +x
  const up = n.clone().negate().cross(right).normalize();
  const flat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n.clone().negate()));
  // the outer corner up: a roll about the eye's own axis (local z points into the face)
  const turn = flat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * o.slant));
  return { at, n, flat, turn, dir: d };
}
export function eyeGeometry(side, kind, eyeColour) {
  const E = EYES, o = E[kind], f = eyeFrame(side, kind), sp = soup();
  const inv = f.turn.clone().invert();
  const rimC = tint(new THREE.Color(E.rim), eyeColour);
  const irisIn = [E.irisIn, E.irisIn, E.irisIn], irisOut = [E.irisOut, E.irisOut, E.irisOut];
  const p = new THREE.Vector3(), q = new THREE.Vector3(), nn = new THREE.Vector3();
  // a lens point (u, v) in the eye's frame, `lift` off the face under it
  const place = (u, v, lift, c) => {
    p.set(u, v, 0).applyQuaternion(f.turn).add(f.at); // head space, on the tangent plane
    faceAlong(p, q); faceNormal(p, nn);
    q.addScaledVector(nn, lift).sub(f.at).applyQuaternion(inv);
    return sp.v(q.x, q.y, q.z, c);
  };
  // the almond: pointed corners, the upper lid a little fuller than the lower
  const outline = (j) => {
    const th = (j / o.seg) * Math.PI * 2, s = Math.sin(th);
    return [o.a * Math.cos(th), (s >= 0 ? o.up : -o.down) * Math.abs(s) ** (2 * o.sharp)];
  };
  const OUT = new THREE.Vector3(0, 0, -1);
  const centre = place(0, 0, E.lift.centre, irisIn);
  const rings = [
    [E.rings[0], E.lift.centre * 0.6 + E.lift.iris * 0.4, irisIn],
    [E.rings[1], E.lift.iris, irisOut],
    [E.rings[1], E.lift.iris, rimC],
    [0.94, E.lift.rim, rimC],
    [1, E.lift.edge + 0.0012, rimC],
    [1.05, E.lift.skirt, rimC],
  ].map(([r, lift, c]) => Array.from({ length: o.seg }, (_, j) => { const [u, v] = outline(j); return place(u * r, v * r, lift, c); }));
  for (let j = 0; j < o.seg; j++) sp.tri(centre, rings[0][j], rings[0][(j + 1) % o.seg], OUT);
  for (let r = 0; r < rings.length - 1; r++) {
    if (r === 1) continue; // the iris ends and the rim begins in one place
    for (let j = 0; j < o.seg; j++) { const k = (j + 1) % o.seg; sp.quad(rings[r][j], rings[r][k], rings[r + 1][k], rings[r + 1][j], OUT); }
  }
  return sp.geometry();
}

// ---------------------------------------------------------------------------
// B6, the shell ear: a cupped sheet, convex behind and hollow in front, wide
// at the base and drawn to a tip, the pink of the inner ear in the hollow's
// own vertex colours (so the shell needs no inner-ear mesh). In the ear's own
// frame as the cone was: y from -h/2 at the base to h/2 at the tip, +z behind.
export const SHELL_EAR = Object.freeze({
  width: 0.92,        // base half-width, in ear radii (the cone's was 0.79)
  back: 0.56, front: 0.3, rimZ: -0.16, // the cup's depth behind and in front, the rim's z, in ear radii
  taper: 0.8, cupTaper: 0.6,
  at: [0.132, 0.168, 0.004], yaw: 0.3, tip: 0.2, // head space; turned out and tipped forward (radians)
  pink: 0.72, pinkTop: 0.74,
  rows: 4, cols: 6, simpleRows: 3, simpleCols: 2,
  tuft: Object.freeze({ from: 0.74, len: 0.2, back: 0.12, shade: 0.55 }), // in ear heights
});
export function shellEarGeometry(r, h, { simple = false, tuft = false, backShade = 0.7, pink = ONE } = {}) {
  const E = SHELL_EAR, sp = soup();
  const N = simple ? E.simpleRows : E.rows, M = simple ? E.simpleCols : E.cols;
  const w = r * E.width;
  const sheet = (t, s, depth) => {
    const W = w * (1 - t) ** E.taper, cup = r * depth * (1 - t) ** E.cupTaper;
    return [W * s, -h / 2 + t * h, r * E.rimZ * (1 - t) + cup * (1 - s * s)];
  };
  const back = (t, s) => sheet(t, s, E.back), front = (t, s) => sheet(t, s, E.front);
  const BACK = new THREE.Vector3(0, 0.15, 1), FRONT = new THREE.Vector3(0, -0.1, -1);
  const grid = (fn, colour) => {
    const rows = [];
    for (let i = 0; i < N; i++) {
      const t = i / N;
      rows.push(Array.from({ length: M + 1 }, (_, j) => { const s = (j / M) * 2 - 1; return sp.v(...fn(t, s), colour(t, s)); }));
    }
    return rows;
  };
  const shade = (t, s) => { const k = backShade + (1 - backShade) * 0.5 * s * s; return [k, k, k]; };
  const hollow = (t, s) => (Math.abs(s) <= E.pink && t <= E.pinkTop ? pink : ONE);
  const b = grid(back, shade), f = grid(front, hollow);
  const tipB = sp.v(0, h / 2, 0, shade(1, 0)), tipF = sp.v(0, h / 2, 0, ONE);
  for (const [rows, tip, out] of [[b, tipB, BACK], [f, tipF, FRONT]]) {
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < M; j++) sp.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j], out);
    for (let j = 0; j < M; j++) sp.tri(rows[N - 1][j], rows[N - 1][j + 1], tip, out);
  }
  if (tuft) {
    // a lynx tip: a short dark spike of fur off the ear's point, leaning back
    const T = E.tuft, t0 = T.from, dark = [T.shade, T.shade, T.shade];
    const base = [back(t0, -1), back(t0, 1), back(t0, 0)].map((p) => sp.v(...p, dark));
    const top = sp.v(0, h / 2 + T.len * h * 0.5, T.back * h, dark);
    const mid = new THREE.Vector3(0, h / 2, r * E.rimZ * (1 - t0));
    for (let j = 0; j < 3; j++) sp.tri(base[j], base[(j + 1) % 3], top, (c) => c.clone().sub(mid));
  }
  const geo = sp.geometry();
  // For the scar's ear nick (scarmesh.js layNick): a point of the ear's BACK
  // and its normal, v across (0 the middle, 1 the outer edge, on side sx) and
  // u up (0 base, 1 tip).
  // It follows the sheet as BUILT (its rows and columns, straight between
  // them), so the nick lies on a crowd cat's coarse ear as on a detailed one.
  const built = (t, s) => {
    const ft = Math.min(Math.max(t, 0), 1) * N, i = Math.min(Math.floor(ft), N - 1), kt = ft - i;
    const fs = ((Math.min(Math.max(s, -1), 1) + 1) / 2) * M, j = Math.min(Math.floor(fs), M - 1), ks = fs - j;
    const node = (r, c) => new THREE.Vector3(...back(r / N, (c / M) * 2 - 1));
    const lo = node(i, j).lerp(node(i, j + 1), ks), hi = node(i + 1, j).lerp(node(i + 1, j + 1), ks);
    return lo.lerp(hi, kt);
  };
  geo.userData.backAt = (v, u, sx) => {
    const s = sx * v, e = 0.01;
    const P = built(u, s);
    const du = built(u + e, s).sub(P), ds = built(u, s + sx * e).sub(P);
    const n = new THREE.Vector3().crossVectors(du, ds).normalize();
    if (n.z < 0) n.negate();
    return { point: P, normal: n, shade: shade(u, s)[0] };
  };
  geo.userData.shell = { r, h };
  return geo;
}

// A lens eye on a dark face glows a little in its own colour (model.js
// DARK_FACE). The glow follows the lens's vertex colours, so the dark rim
// stays dark instead of shining as a ring.
export function lensGlow(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= min( vColor.rgb, vec3( 1.0 ) );');
  };
  material.customProgramCacheKey = () => 'cat-lens-glow';
  return material;
}
