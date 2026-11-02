import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// HAGRID'S PARTS (body refinement, Task 8; R10-R12). The family's hen is a
// playable "cat": buildChicken (model.js) hangs these geometries on the cat
// rig. The shapes are the sketch's (docs/superpowers/specs/2026-11-01-body-
// refinement-sketch.html, newHagrid, which the owner said "looked great"),
// scaled about 0.85 onto today's centres: body centre y 0.42, head centre
// (0, 0.78, -0.28), skull r 0.13, legs at (±0.1, 0.3, 0.02).
//
// Every builder returns ONE geometry in the frame of the mesh it hangs on,
// vertex-coloured (position, normal, color) unless noted, so a whole part is
// one draw on the shared vertex-coloured material. Nothing here draws a random
// number: the feathers' variation is a sine of position.

export const HEN = Object.freeze({
  FEATHER: 0xb06a30, // today's russet; coatColor('hagrid') reads it
  DARK: 0x9a5826,
  CREAM: 0xe8d0a8,
  HACKLE: 0xc8843c, // the golden neck feathers
  TAIL: 0x2f2a22,
  SHEEN: 0x2e4a3a, // the tail's faint green
  COMB: 0xd83a3a,
  BEAK: 0xf2a04e,
  SHANK: 0xe2b14a,
  BAND: 0xb8902e, // the darker yellow of the shank's scales
  CLAW: 0x3a3128,
  EYE: 0xc58a1a,
  PUPIL: 0x151515,
});

// The body mesh: centre y 0.42, scale (0.9, 0.85, 1.1) as today (base.bodyY,
// base.bodyScale). Its geometry is authored in the cat's frame about that
// centre and divided by SCALE, so the box under the scale is today's body ∪
// belly ∪ wings. R: the hen body's radii (x, y, z) in the cat's frame.
export const HEN_BODY = Object.freeze({ Y: 0.42, SCALE: Object.freeze([0.9, 0.85, 1.1]), R: Object.freeze([0.298, 0.272, 0.352]) });

// The skull (r 0.13, y ×1.05 as today: top 0.1365) at the head origin, and the
// neck: a tube along a quadratic Bézier from inside the skull down and back
// into the body (head-local). P2 is the lowest ring's centre (neckBase). The
// review's (0, -0.18, 0.16) stays inside the body when sniff pitches the head
// 0.62, but not when 'land' squashes the body under a still head or 'swim'
// lifts and tips the head back. 6 cm lower and 4 cm further back it stays
// inside in every state he plays (a grid search: worst case ~1.5 cm, between
// 'swim' pulling it up and 'stretch' tipping the breast down past it), and P1
// well back keeps the lower neck from swinging out of the breast when sniff
// nods the head. Radius R = [top, middle, base] (a quadratic in u): fullest
// where it shows (a hen's thick neck), slim at the hidden base.
export const HEN_SKULL = Object.freeze([0.13, 0.1365, 0.13]);
export const HEN_NECK = Object.freeze({
  P0: Object.freeze([0, -0.03, 0.01]),
  P1: Object.freeze([0, -0.12, 0.13]),
  P2: Object.freeze([0, -0.24, 0.2]),
  R: Object.freeze([0.088, 0.098, 0.05]),
});

// The comb's two halves both turn about this head-local point; REST is the
// animator's resting ear roll, which each half's geometry is counter-rolled by
// (R11) so the crest stands upright at rest.
export const HEN_COMB = Object.freeze({ PIVOT: Object.freeze([0, 0.12, 0]), REST: 0.22 });

// The legs: the foot hangs FOOT_Y below the hip (the leg group's origin), its
// sole on the ground of a standing bird (hip y 0.3).
export const HEN_LEG = Object.freeze({ FOOT_Y: -0.3 });

// The tail feathers' extra tilt in tailPivots[0]'s frame: with today's
// tailRotX -0.6 the fan stands at the sketch's -0.9.
export const HEN_TAIL_TILT = -0.3;

// -----------------------------------------------------------------------------
// helpers

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const hexColour = (h) => new THREE.Color(h);
const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);

// position + normal only (no uv), so parts merge.
function clean(geo) {
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

// Vertex colours from fn(v, colour) per vertex (v in the geometry's frame).
function paint(geo, fn) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    fn(_v, _c);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const solid = (geo, colour) => { const c = colour.isColor ? colour : hexColour(colour); return paint(geo, (v, out) => out.copy(c)); };

// Scale, then rotate (Euler XYZ), then move: a mesh's own transform order.
function place(geo, { scale = [1, 1, 1], rot = [0, 0, 0], pos = [0, 0, 0] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  return geo.applyMatrix4(m);
}

function ball(r, w, h, opts, colour) {
  const g = place(clean(new THREE.SphereGeometry(r, w, h)), opts);
  return colour === undefined ? g : solid(g, colour);
}

function merge(parts) {
  const ranges = [];
  let at = 0;
  for (const g of parts) {
    ranges.push([at, g.attributes.position.count]);
    at += g.attributes.position.count;
  }
  const out = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return { geo: out, ranges };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A tube along `curve` with radius radius(u) and `sides` sides, closed at the
// far end with a cone to `tipOut` beyond the last ring (0: open). Rings are
// framed by the curve's Frenet frames. Returns an indexed geometry.
function tube(curve, rings, sides, radius, { flatX = 1, closeEnd = 0 } = {}) {
  const frames = curve.computeFrenetFrames(rings - 1, false);
  const pos = [];
  const idx = [];
  for (let r = 0; r < rings; r++) {
    const u = r / (rings - 1);
    const c = curve.getPointAt(u);
    const N = frames.normals[r], B = frames.binormals[r];
    const rad = radius(u);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      const v = new THREE.Vector3().copy(c).addScaledVector(N, x).addScaledVector(B, y);
      v.x = c.x + (v.x - c.x) * flatX;
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * sides + s, b = r * sides + (s + 1) % sides;
      const c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (closeEnd) {
    const end = curve.getPointAt(1).addScaledVector(curve.getTangentAt(1), closeEnd);
    const tip = pos.length / 3;
    pos.push(end.x, end.y, end.z);
    const last = (rings - 1) * sides;
    for (let s = 0; s < sides; s++) idx.push(last + s, tip, last + (s + 1) % sides);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// -----------------------------------------------------------------------------
// the body: the sketch's henBody deformation (a full breast low at the front,
// the back rising toward the tail), cream at the breast, hackles over the neck
// join and both folded wings, in the body mesh's frame.

function henCore() {
  const [RX, RY, RZ] = HEN_BODY.R;
  const g = clean(new THREE.SphereGeometry(1, 24, 16));
  const p = g.attributes.position;
  const unit = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    unit[i * 3] = x; unit[i * 3 + 1] = y; unit[i * 3 + 2] = z;
    const front = Math.max(0, -z), back = Math.max(0, z);
    if (y < 0.2) y -= 0.18 * front * (1 - y); // full breast, low at the front
    if (y > 0) y += 0.18 * back * back; // the back rises toward the tail
    z *= 1 + 0.08 * front;
    x *= 1 - 0.18 * back * back;
    p.setXYZ(i, x * RX, y * RY, z * RZ);
  }
  g.computeVertexNormals();
  const feather = hexColour(HEN.FEATHER), dark = hexColour(HEN.DARK), cream = hexColour(HEN.CREAM);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = unit[i * 3], y = unit[i * 3 + 1], z = unit[i * 3 + 2];
    _c.copy(feather).lerp(dark, Math.max(0, y) * 0.35 + 0.15 * Math.sin(z * 18 + x * 9) ** 2);
    _c.lerp(cream, smooth(0.25, 0.75, -z * 0.7 - y * 0.75));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Feather lobes round the neck where it enters the body, front and sides,
// lying along the body's surface (tops tipped back).
function henHackles() {
  const parts = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / (N - 1) - 0.5) * 2.4;
    const colour = mix(HEN.HACKLE, HEN.FEATHER, 0.3 + 0.3 * Math.abs(a) / 1.2);
    parts.push(ball(0.05, 7, 5, {
      scale: [0.7, 1.35, 0.36],
      rot: [0.8, a, 0],
      pos: [Math.sin(a) * 0.092, 0.222 - 0.014 * Math.abs(a), -0.16 - Math.cos(a) * 0.074],
    }, colour));
  }
  return mergeGeometries(parts.splice(0), false);
}

// One folded wing (s = -1 left, +1 right): coverts, a shoulder and four
// primaries tapering to feather tips at the back, in the cat's frame.
function henWing(s) {
  const k = 0.85;
  const parts = [
    ball(0.16 * k, 10, 7, { scale: [0.22, 0.46, 1.25], rot: [0.22, 0, 0], pos: [0, 0.04 * k, -0.06 * k] }, HEN.DARK),
    ball(0.08 * k, 6, 5, { scale: [0.3, 0.7, 0.9], pos: [0, 0.07 * k, -0.17 * k] }, mix(HEN.FEATHER, HEN.DARK, 0.4)),
  ];
  for (let i = 0; i < 4; i++) {
    parts.push(ball(0.11 * k, 6, 4, {
      scale: [0.1, 0.16, 1.15],
      rot: [0.3 + i * 0.03, 0, 0],
      pos: [s * 0.008 * k, (-0.03 - i * 0.016) * k, (0.1 + i * 0.03) * k],
    }, mix(HEN.DARK, HEN.TAIL, 0.3 + i / 8)));
  }
  const g = mergeGeometries(parts, false);
  // hung on the body's side, rolled out a little (the sketch's 0.12)
  place(g, { rot: [0, -s * 0.04, s * 0.12], pos: [s * 0.285, 0.02, 0.02] });
  return g;
}

export function henBodyGeometry() {
  const { geo, ranges } = merge([henCore(), henHackles(), henWing(-1), henWing(1)]);
  const [sx, sy, sz] = HEN_BODY.SCALE;
  geo.scale(1 / sx, 1 / sy, 1 / sz);
  geo.userData.ranges = { body: ranges[0], hackles: ranges[1], wingL: ranges[2], wingR: ranges[3] };
  return geo;
}

// -----------------------------------------------------------------------------
// the head (head-local frame, origin at the skull's centre)

export function henNeckCurve(neck = HEN_NECK) {
  return new THREE.QuadraticBezierCurve3(...[neck.P0, neck.P1, neck.P2].map((a) => new THREE.Vector3(...a)));
}
export function henNeckRadius(u, neck = HEN_NECK) {
  const [a, m, b] = neck.R;
  const c = 2 * m - (a + b) / 2; // the control value that puts r(0.5) at m
  return a * (1 - u) ** 2 + 2 * u * (1 - u) * c + b * u * u;
}

// The neck at u (0 top .. 1 base): its centre, its unit tangent (downward)
// and the unit "front" normal (perpendicular to it, pointing forward and down).
export function henNeckAt(u) {
  const curve = henNeckCurve();
  const centre = curve.getPoint(u);
  const tangent = curve.getTangent(u);
  const front = new THREE.Vector3(0, -tangent.z, tangent.y).normalize(); // tangent turned -90° about x
  if (front.z > 0) front.negate();
  return { centre, tangent, front, radius: henNeckRadius(u) };
}

export function henSkullNeckGeometry(neck = HEN_NECK) {
  const [sx, sy, sz] = HEN_SKULL;
  const skull = paint(ball(0.13, 14, 10, { scale: [1, sy / 0.13, 1] }), (v, out) => {
    out.copy(hexColour(HEN.FEATHER)).lerp(hexColour(HEN.HACKLE), smooth(0.02, 0.12, v.z * 0.6 - v.y * 0.6) * 0.5);
  });
  const tubeGeo = tube(henNeckCurve(neck), 6, 10, (u) => henNeckRadius(u, neck), { closeEnd: 0.04 });
  const feather = hexColour(HEN.FEATHER), hackle = hexColour(HEN.HACKLE), dark = hexColour(HEN.DARK);
  const P0y = neck.P0[1], P2y = neck.P2[1];
  paint(tubeGeo, (v, out) => {
    const k = smooth(0, 1, (v.y - P0y) / (P2y - P0y));
    out.copy(feather).lerp(hackle, 0.55 + 0.3 * k).lerp(dark, 0.1 * Math.sin(v.x * 60 + v.y * 40) ** 2);
  });
  const { geo, ranges } = merge([skull, tubeGeo]);
  geo.userData.ranges = { skull: ranges[0], neck: ranges[1] };
  geo.userData.skull = [sx, sy, sz];
  geo.userData.neck = { P0: [...neck.P0], P1: [...neck.P1], P2: [...neck.P2] };
  geo.userData.neckBase = [...neck.P2];
  return geo;
}

// The beak: a slightly hooked upper half and a smaller lower half, two
// separate pieces, plain (no vertex colour: the mesh is plain BEAK).
export function henBeakGeometry() {
  const L = 0.11;
  const upper = clean(new THREE.ConeGeometry(0.04, L, 8, 3));
  // the hook: the tip curls down, the more the nearer the tip
  const p = upper.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const d = (p.getY(i) + L / 2) / L; // 0 base .. 1 tip
    p.setZ(i, p.getZ(i) - 0.016 * d * d * d);
  }
  place(upper, { rot: [-Math.PI / 2 - 0.12, 0, 0], pos: [0, -0.006, -0.152] });
  const lower = place(clean(new THREE.ConeGeometry(0.026, 0.07, 6, 1)), { rot: [-Math.PI / 2 + 0.15, 0, 0], pos: [0, -0.036, -0.13] });
  const g = mergeGeometries([upper, lower], false);
  upper.dispose(); lower.dispose();
  g.computeVertexNormals();
  return g;
}

export function henWattlesGeometry() {
  const parts = [-1, 1].map((s) => paint(ball(0.03, 7, 5, { scale: [0.6, 1.5, 0.75], rot: [0, 0, s * 0.15], pos: [s * 0.022, -0.105, -0.1] }), (v, out) => {
    out.copy(hexColour(HEN.COMB)).lerp(hexColour(0xa82a2e), smooth(-0.11, -0.15, v.y) * 0.5);
  }));
  const g = mergeGeometries(parts, false);
  parts.forEach((x) => x.dispose());
  return g;
}

// The comb: one joined crest with five rounded points rising from a narrow
// blade on the crown and fanning out above it, split into a front half (the
// blade's front, three points) and a back half (the blade's back, two points),
// each in its pivot's frame and counter-rolled by ∓REST (R11). The fan keeps
// every point under the beanie's shell and its top under the hat brims.
export const COMB_POINTS = Object.freeze([
  // [base z, tip z, tip y]
  [-0.008, -0.054, 0.168],
  [-0.004, -0.027, 0.173],
  [0, 0, 0.176],
  [0.004, 0.027, 0.173],
  [0.008, 0.054, 0.168],
]);
function combPoint([bz, tz, ty]) {
  const base = new THREE.Vector3(0, 0.128, bz), tip = new THREE.Vector3(0, ty - 0.012, tz);
  const axis = tip.clone().sub(base);
  const half = axis.length() / 2 + 0.012;
  const g = clean(new THREE.SphereGeometry(1, 6, 5));
  g.scale(0.013, half, 0.016);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
  const mid = base.clone().add(tip).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}
export function henCombHalves(points = COMB_POINTS) {
  const blade = (z) => ball(1, 8, 6, { scale: [0.017, 0.028, 0.024], pos: [0, 0.122, z] });
  const front = [blade(-0.011), ...points.slice(0, 3).map(combPoint)];
  const back = [blade(0.011), ...points.slice(3).map(combPoint)];
  const comb = hexColour(HEN.COMB);
  return [[front, -1], [back, 1]].map(([parts, s]) => {
    const g = mergeGeometries(parts, false);
    parts.forEach((x) => x.dispose());
    g.translate(-HEN_COMB.PIVOT[0], -HEN_COMB.PIVOT[1], -HEN_COMB.PIVOT[2]);
    // earL rests at +REST and earR at -REST: undo it so the crest stands upright
    g.rotateZ(s * HEN_COMB.REST);
    g.computeVertexNormals();
    return solid(g, comb);
  });
}

// An eye: an amber disc with a black pupil, looking along +z (the mesh is
// turned to face out of the skull).
export function henEyeGeometry() {
  const eye = ball(0.022, 7, 5, { scale: [1, 1, 0.55] }, HEN.EYE);
  const pupil = ball(0.011, 5, 4, { scale: [1, 1, 0.5], pos: [0, 0, 0.022 * 0.55 - 0.002] }, HEN.PUPIL);
  const g = mergeGeometries([eye, pupil], false);
  eye.dispose(); pupil.dispose();
  return g;
}

// -----------------------------------------------------------------------------
// the tail: seven long curved feathers fanned on tailPivots[0], the middle one
// longest, dark with a faint green sheen. [middle three, left pair (x < 0),
// right pair (x > 0)].

function tailFeather(len, rise, colour) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, -0.03),
    new THREE.Vector3(0, rise, len * 0.55),
    new THREE.Vector3(0, rise * 0.35, len),
  );
  const g = tube(curve, 8, 5, (u) => 0.0255 * (1 - 0.85 * smooth(0.25, 1, u)), { flatX: 0.35, closeEnd: 0.015 });
  const sheen = hexColour(HEN.SHEEN);
  return paint(g, (v, out) => out.copy(colour).lerp(sheen, 0.25 * smooth(0, len, v.z)));
}
export function henTailGeometries() {
  const sets = [[], [], []];
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.13, top = 1 - Math.abs(i - 3) / 3.5;
    const k = 0.85;
    const colour = i % 2 ? hexColour(HEN.TAIL) : mix(HEN.TAIL, HEN.SHEEN, 0.5);
    const f = tailFeather((0.32 + 0.2 * top) * k, (0.14 + 0.08 * top) * k, colour);
    // fanned (the sketch's piv.rotation z then y), then tilted with the fan
    const m = new THREE.Matrix4().makeRotationX(HEN_TAIL_TILT)
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, a * 0.6, a * 2.2)));
    f.applyMatrix4(m);
    f.computeBoundingBox();
    const x = (f.boundingBox.min.x + f.boundingBox.max.x) / 2;
    f.boundingBox = null;
    sets[Math.abs(i - 3) <= 1 ? 0 : x < 0 ? 1 : 2].push(f);
  }
  return sets.map((parts) => {
    const g = mergeGeometries(parts, false);
    parts.forEach((x) => x.dispose());
    return g;
  });
}

// -----------------------------------------------------------------------------
// the legs (leg-local: origin at the hip, y up, the bird faces -z)

// A feathery thigh tucked under the body and a scaly yellow shank to the foot.
export function henShankGeometry() {
  const thigh = ball(0.08, 8, 7, { scale: [0.85, 1.1, 0.95], pos: [0, -0.125, 0.005] });
  // the thigh's lower edge breaks into feather tips
  const tp = thigh.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), y = tp.getY(i) + 0.125, z = tp.getZ(i) - 0.005;
    const low = smooth(-0.02, -0.08, y);
    const k = 1 + 0.16 * low * Math.max(0, Math.sin(Math.atan2(z, x) * 4));
    tp.setXYZ(i, x * k, tp.getY(i) - 0.008 * low * Math.max(0, Math.sin(Math.atan2(z, x) * 4)), (z * k) + 0.005);
  }
  thigh.computeVertexNormals();
  const feather = hexColour(HEN.FEATHER), dark = hexColour(HEN.DARK);
  paint(thigh, (v, out) => out.copy(feather).lerp(dark, smooth(-0.13, -0.2, v.y) * 0.6));
  const top = -0.17, bottom = HEN_LEG.FOOT_Y + 0.014;
  const curve = new THREE.LineCurve3(new THREE.Vector3(0, top, 0.006), new THREE.Vector3(0, bottom, 0));
  const shank = tube(curve, 8, 6, (u) => 0.021 - 0.004 * u);
  const yellow = hexColour(HEN.SHANK), band = hexColour(HEN.BAND);
  paint(shank, (v, out) => {
    const ring = Math.round(((top - v.y) / (top - bottom)) * 7);
    out.copy(ring % 2 ? band : yellow);
  });
  const g = mergeGeometries([thigh, shank], false);
  thigh.dispose(); shank.dispose();
  return g;
}

// Three toes forward, one back, each ending in a dark claw; an ankle knob on
// top. The sole (lowest point) is at y 0.001 of the foot's frame, which hangs
// FOOT_Y below the hip: the ground of a standing bird.
export function henFootGeometry() {
  const k = 0.85;
  const parts = [ball(0.02, 6, 4, { scale: [1, 0.8, 1], pos: [0, 0.018, 0] }, HEN.SHANK)];
  for (const [a, len] of [[-0.45, 0.13], [0, 0.15], [0.45, 0.13], [Math.PI, 0.07]]) {
    const L = len * k, r0 = 0.016 * k, r1 = 0.011 * k;
    const yaw = new THREE.Matrix4().makeRotationY(a);
    // toe: a tapered tube along -z with knuckle bumps, lying on the ground
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, r0, 0), new THREE.Vector3(0, r1, -L));
    const toe = tube(curve, 4, 5, (u) => r0 + (r1 - r0) * u + 0.002 * Math.sin(u * Math.PI * 3) ** 2);
    paint(toe, (v, out) => out.copy(hexColour(HEN.SHANK)).lerp(hexColour(HEN.BAND), 0.25 * Math.sin(v.z * 120) ** 2));
    toe.applyMatrix4(yaw);
    parts.push(toe);
    const claw = clean(new THREE.ConeGeometry(r1, 0.034 * k * 1.2, 5, 1, true));
    place(claw, { rot: [-Math.PI / 2 - 0.4, 0, 0], pos: [0, r1 - 0.004, -L - 0.012] });
    solid(claw, HEN.CLAW);
    claw.applyMatrix4(yaw);
    parts.push(claw);
  }
  const g = mergeGeometries(parts, false);
  parts.forEach((x) => x.dispose());
  g.computeBoundingBox();
  g.translate(0, 0.001 - g.boundingBox.min.y, 0);
  g.boundingBox = null;
  return g;
}

// The z of the neck's front surface (x 0) at head-local height y: the front
// line S(u) = centre + front·radius, interpolated where it crosses y.
export function henNeckFrontZ(y) {
  let prev = null;
  for (let i = 0; i <= 200; i++) {
    const { centre, front, radius } = henNeckAt(i / 200);
    const s = centre.addScaledVector(front, radius);
    if (prev && (prev.y - y) * (s.y - y) <= 0) {
      const k = prev.y === s.y ? 0 : (y - prev.y) / (s.y - prev.y);
      return prev.z + (s.z - prev.z) * k;
    }
    prev = s;
  }
  return prev.z;
}
