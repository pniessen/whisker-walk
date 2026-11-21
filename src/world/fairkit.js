import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// =============================================================================
// THE FAIRGROUND'S MODELLING KIT. The same small toolkit world/farmparts.js
// works with (painted, non-indexed pieces pushed onto a list and merged into
// one vertex-coloured mesh), kept in a file of its own so the Fairground does
// not lean on the Farm's, plus what a fair needs and a farm does not: striped
// canvas, bunting, light bulbs, and shapes swept along a curve.
//
// The rules are farmparts.js's: every function makes THREE objects, so the
// callers run inside withLocalUuids; nothing at module level is a THREE
// object; nothing here touches builder.js or litMaterial; variation comes from
// hash01, never Math.random.
// =============================================================================

export function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

// Each call pushes one painted, non-indexed geometry (position, normal, color)
// onto `P`. Positions are in the caller's frame; `y` is the BOTTOM of the part
// unless `o.c` (centred) is set. `o` = { yaw, pitch, roll, c, shade, sx, sy, sz }.
function matrixOf(x, y, z, o) {
  const e = new THREE.Euler(o.pitch ?? 0, o.yaw ?? 0, o.roll ?? 0, 'YXZ');
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
}

function paint(g, hex, shade = 1) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r * shade;
    col[i * 3 + 1] = c.g * shade;
    col[i * 3 + 2] = c.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// `flip` turns a shape inside out (the inside of a cup or a tub).
function finish(P, geo, hex, m, shade = 1, flip = false) {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (flip) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      for (let k = 0; k < 3; k++) { const t = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = t; }
    }
    for (let i = 0; i < n.length; i++) n[i] = -n[i];
  }
  if (m) g.applyMatrix4(m);
  paint(g, hex, shade);
  P.push(g);
  return g;
}

export function box(P, w, h, d, x, y, z, hex, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!o.c) g.translate(0, h / 2, 0);
  return finish(P, g, hex, matrixOf(x, y, z, o), o.shade);
}

export function cyl(P, rTop, rBottom, h, x, y, z, hex, o = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, o.sides ?? 8, 1, !!o.open);
  if (!o.c) g.translate(0, h / 2, 0);
  return finish(P, g, hex, matrixOf(x, y, z, o), o.shade, !!o.inside);
}

export function ball(P, r, x, y, z, hex, o = {}) {
  const g = new THREE.IcosahedronGeometry(r, o.detail ?? 0);
  return finish(P, g, hex, matrixOf(x, y, z, o), o.shade);
}

// A flat convex polygon through 3D points. One face; draw it in a DoubleSide
// mesh (canvas, bunting) or give both windings.
export function sheet(P, pts, hex, o = {}) {
  const a = new THREE.Vector3(...pts[0]);
  const n = new THREE.Vector3().subVectors(new THREE.Vector3(...pts[1]), a)
    .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...pts[2]), a)).normalize();
  if (o.up && n.y < 0) n.negate();
  const pos = [];
  const nrm = [];
  for (let i = 1; i < pts.length - 1; i++) {
    for (const p of [pts[0], pts[i], pts[i + 1]]) { pos.push(...p); nrm.push(n.x, n.y, n.z); }
    if (o.both) for (const p of [pts[0], pts[i + 1], pts[i]]) { pos.push(...p); nrm.push(-n.x, -n.y, -n.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return finish(P, g, hex, o.m ?? null, o.shade);
}

// A ring of canvas round the y axis from (r0, y0) up to (r1, y1), `sides`
// panels painted in turn from `colors`: a cone (r1 = 0), a drum, a valance.
// `from`/`to` (radians) leave part of the ring open (a tent's doorway).
// `scallop` > 0 hangs each panel's lower edge in a point by that much.
export function stripes(P, r0, y0, r1, y1, colors, x, y, z, o = {}) {
  const sides = o.sides ?? 12;
  const from = o.from ?? 0;
  const to = o.to ?? Math.PI * 2;
  const pos = [];
  const nrm = [];
  const col = [];
  const c = new THREE.Color();
  const a3 = new THREE.Vector3();
  const b3 = new THREE.Vector3();
  const n3 = new THREE.Vector3();
  const tri = (p, q, r, hex, shade) => {
    a3.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    b3.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
    n3.crossVectors(a3, b3);
    // A triangle with no area draws nothing: a valance's flat ring (r0 = r1,
    // y0 = y1) leaves only its scallops, and a cone from r0 = 0 its sides.
    if (n3.lengthSq() < 1e-14) return;
    n3.normalize();
    c.set(hex);
    for (const v of [p, q, r]) { pos.push(...v); nrm.push(n3.x, n3.y, n3.z); col.push(c.r * shade, c.g * shade, c.b * shade); }
  };
  for (let k = 0; k < sides; k++) {
    const a = from + ((to - from) * k) / sides;
    const b = from + ((to - from) * (k + 1)) / sides;
    const hex = colors[k % colors.length];
    const shade = (o.shade ?? 1) * (0.94 + 0.06 * Math.cos(a + 0.6));
    const A0 = [Math.cos(a) * r0, y0, Math.sin(a) * r0];
    const B0 = [Math.cos(b) * r0, y0, Math.sin(b) * r0];
    const A1 = [Math.cos(a) * r1, y1, Math.sin(a) * r1];
    const B1 = [Math.cos(b) * r1, y1, Math.sin(b) * r1];
    // wound so the normal points outward
    if (r1 > 1e-6) { tri(A0, A1, B1, hex, shade); tri(A0, B1, B0, hex, shade); } else tri(A0, A1, B0, hex, shade);
    if (o.scallop) {
      const m = (a + b) / 2;
      tri(A0, B0, [Math.cos(m) * r0, y0 - o.scallop, Math.sin(m) * r0], hex, shade);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.applyMatrix4(matrixOf(x, y, z, o));
  P.push(g);
  return g;
}

// A slab of stripes (an awning, or a skirt stood on end): w along x by d
// along z, its top face at y + t; o: n stripes, yaw/pitch/roll, shade.
export function stripedSlab(P, w, t, d, colors, x, y, z, o = {}) {
  const n = o.n ?? Math.max(2, Math.round(w / 0.45));
  const sub = [];
  for (let i = 0; i < n; i++) {
    box(sub, w / n, t, d, -w / 2 + (i + 0.5) * (w / n), 0, 0, colors[i % colors.length], { shade: o.shade });
  }
  const m = matrixOf(x, y, z, o);
  for (const g of sub) { g.applyMatrix4(m); P.push(g); }
}

// A row of pennants hanging from the line a -> b (3D points), which sags by
// `sag` in the middle. Returns the line's points (for bulbs on the same wire).
export function catenary(a, b, sag, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

export const BUNTING_COLORS = Object.freeze([0xe8423a, 0xf6c92e, 0x3aa0e0, 0x4cba62, 0xf58a2e, 0xb061d6]);
export function bunting(P, a, b, { sag = 0.5, every = 0.55, size = 0.34, salt = 0, wire = 0x5a4a3a } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(2, Math.round(len / every));
  const pts = catenary(a, b, sag, n);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    // the wire: a thin flat strip, and one pennant under it
    sheet(P, [[p[0], p[1] + 0.015, p[2]], [q[0], q[1] + 0.015, q[2]], [q[0], q[1] - 0.015, q[2]], [p[0], p[1] - 0.015, p[2]]], wire);
    const g = 0.12;
    const p1 = [p[0] + (q[0] - p[0]) * g, p[1] + (q[1] - p[1]) * g, p[2] + (q[2] - p[2]) * g];
    const q1 = [q[0] + (p[0] - q[0]) * g, q[1] + (p[1] - q[1]) * g, q[2] + (p[2] - q[2]) * g];
    const tip = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - size, (p[2] + q[2]) / 2];
    // the pennant's tip flutters (canvasOf's shader); its top edge is held by the wire
    swayOf(sheet(P, [p1, q1, tip], BUNTING_COLORS[(i + salt) % BUNTING_COLORS.length]), [0, 0, 1]);
  }
  return pts;
}

// ---- the breeze and the chase: per-vertex numbers the fair's shaders read --------------
// `fairSway` (canvas): how far a vertex may flutter, 0 where the cloth is held,
// 1 at a free tip. `fairChase` (glow): where a bulb is along its string or ring,
// in waves of the chase; below 0, a light that does not chase (a window).
// A list that mixes pieces with and without one is filled in at the merge.
const SWAY = 'fairSway';
const CHASE = 'fairChase';
const BULB_R = 'fairBulbR'; // a bulb's radius (0: not a bulb), so the shader can find its centre
const FILL = Object.freeze({ [SWAY]: 0, [CHASE]: -1, [BULB_R]: 0 });
function setFloat(g, name, values) {
  g.setAttribute(name, new THREE.BufferAttribute(values instanceof Float32Array ? values : new Float32Array(values), 1));
  return g;
}
function swayOf(g, w) {
  return setFloat(g, SWAY, w);
}
export function chaseOf(g, c) {
  return setFloat(g, CHASE, new Float32Array(g.attributes.position.count).fill(c));
}
function fillMissing(P) {
  for (const name of Object.keys(FILL)) {
    if (!P.some((g) => g.attributes[name])) continue;
    for (const g of P) if (!g.attributes[name]) setFloat(g, name, new Float32Array(g.attributes.position.count).fill(FILL[name]));
  }
}

// A light bulb: eight triangles. Its colour is also the colour it glows.
export const BULB_COLORS = Object.freeze([0xfff0b8, 0xffd75a, 0xff8f6a, 0x8fd8ff, 0xfff0b8, 0xa8f0a0]);
export function bulb(P, x, y, z, hex = BULB_COLORS[0], r = 0.072) {
  const g = new THREE.OctahedronGeometry(r, 0);
  // normals pointing straight out from the centre: the same eight triangles
  // shade like a round bead, not a cut gem
  const n = g.attributes.normal;
  const v = g.attributes.position;
  for (let i = 0; i < n.count; i++) {
    const l = Math.hypot(v.getX(i), v.getY(i), v.getZ(i)) || 1;
    n.setXYZ(i, v.getX(i) / l, v.getY(i) / l, v.getZ(i) / l);
  }
  const out = finish(P, g, hex, matrixOf(x, y, z, {}));
  // a bulb chases at dusk; glowMesh works out where it is in its ring or row
  out.userData.fairBulb = true;
  return out;
}
// Bulbs strung along the line a -> b, with its wire. At dusk the chase runs
// along the string from a to b.
export function bulbString(P, W, a, b, { sag = 0.4, every = 0.7, salt = 0, wire = 0x4a4038, colors = BULB_COLORS } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(2, Math.round(len / every));
  const pts = catenary(a, b, sag, n);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (W) sheet(W, [[p[0], p[1] + 0.012, p[2]], [q[0], q[1] + 0.012, q[2]], [q[0], q[1] - 0.012, q[2]], [p[0], p[1] - 0.012, p[2]]], wire);
    if (i > 0) chaseOf(bulb(P, p[0], p[1] - 0.072, p[2], colors[(i + salt) % colors.length]), (i * len) / n / GLOW_LOOK.wave);
  }
}

// Where each bulb of a glow mesh is in the chase, for the bulbs that were not
// strung (bulbString says for its own). The bulbs of one ride lie in a ring
// (the canopy's rim, the wheel's), so the chase goes round it, a whole number
// of waves to a ring; bulbs in a row (the coaster station's eaves) chase along
// it; and the fair's own list, bulbs from one end of the field to the other,
// chases along one slanting direction through the world (up the bell's board,
// along a stall's front). Anything that is not a bulb (a window) stays steady.
function chaseBulbs(P) {
  for (const g of P) {
    if (!g.userData.fairBulb || g.attributes[BULB_R]) continue;
    g.computeBoundingBox();
    const s = g.boundingBox.getSize(new THREE.Vector3());
    setFloat(g, BULB_R, new Float32Array(g.attributes.position.count).fill(Math.max(s.x, s.y, s.z) / 2));
  }
  const list = P.filter((g) => g.userData.fairBulb && !g.attributes[CHASE]);
  if (!list.length) return;
  const box3 = new THREE.Box3();
  const c = new THREE.Vector3();
  const at = list.map((g) => { g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()); });
  box3.setFromPoints(at);
  box3.getCenter(c);
  const size = box3.getSize(new THREE.Vector3());
  const W = GLOW_LOOK.wave;
  // the chase is never below 0 (below 0 means steady): shift a list by whole waves
  const put = (vals) => {
    const lo = Math.floor(Math.min(...vals));
    list.forEach((g, i) => chaseOf(g, vals[i] - lo));
  };
  const [dx, dy, dz] = GLOW_LOOK.slant;
  const slant = () => put(at.map((p) => (p.x * dx + p.y * dy + p.z * dz) / W));
  if (Math.max(size.x, size.y, size.z) > GLOW_LOOK.wide) { slant(); return; }
  const v = [0, 0, 0];
  for (const p of at) { v[0] += (p.x - c.x) ** 2; v[1] += (p.y - c.y) ** 2; v[2] += (p.z - c.z) ** 2; }
  const axes = [0, 1, 2].sort((i, j) => v[i] - v[j]); // least spread first: a ring's axis
  const k = (p, a) => (a === 0 ? p.x - c.x : a === 1 ? p.y - c.y : p.z - c.z);
  if (v[axes[1]] < 0.04 * v[axes[2]]) {
    put(at.map((p) => k(p, axes[2]) / W)); // a row
    return;
  }
  // not flat enough to be a ring (the helter-skelter's coil of bulbs): the slant
  if (v[axes[0]] > 0.25 * v[axes[1]]) { slant(); return; }
  const [u, w] = [axes[1], axes[2]].sort();
  put(at.map((p) => {
    const a = Math.atan2(k(p, w), k(p, u));
    const r = Math.hypot(k(p, u), k(p, w));
    const waves = Math.max(1, Math.round((2 * Math.PI * r) / W));
    return (a / (2 * Math.PI) + 0.5) * waves;
  }));
}

// A strip swept along 3D points: at each point a cross-section `profile`
// ([[across, up], ...]) set square to the path. One face per quad, wound for a
// DoubleSide mesh. `closed` joins the last point to the first.
export function sweep(P, pts, profile, hex, { closed = false, colors = null, sides = null } = {}) {
  const n = pts.length;
  const frames = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    const side = sides ? new THREE.Vector3(sides[i].x, 0, sides[i].z).normalize() : new THREE.Vector3().crossVectors(t, up).normalize();
    const nor = new THREE.Vector3().crossVectors(side, t).normalize();
    frames.push({ side, nor });
  }
  const at = (i, k) => {
    const p = pts[i];
    const f = frames[i];
    const [u, v] = profile[k];
    return [p.x + f.side.x * u + f.nor.x * v, p.y + f.side.y * u + f.nor.y * v, p.z + f.side.z * u + f.nor.z * v];
  };
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    for (let k = 0; k < profile.length - 1; k++) {
      sheet(P, [at(i, k), at(j, k), at(j, k + 1), at(i, k + 1)], colors ? colors[k % colors.length] : hex);
    }
  }
}

// Sub-parts built in their own frame, then set down at (x, y, z) turned `yaw`.
export function placed(P, x, y, z, yaw, fn, o = {}) {
  const sub = [];
  fn(sub);
  const m = matrixOf(x, y, z, { ...o, yaw });
  for (const g of sub) { g.applyMatrix4(m); P.push(g); }
}

function merged(P) {
  fillMissing(P);
  const geo = P.length === 1 ? P[0] : mergeGeometries(P, false);
  if (P.length > 1) for (const g of P) g.dispose();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function meshOf(P, name, { roughness = 0.9, noCast = false, side = THREE.FrontSide } = {}) {
  const m = new THREE.Mesh(merged(P), new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side }));
  m.name = name;
  m.receiveShadow = true;
  if (noCast) {
    m.castShadow = false;
    m.userData.noCast = true;
  }
  return m;
}

// Moves a mesh's origin to (x, z) without moving what it draws: for anything
// that is found by where its origin is (treefade.js's fade shapes).
export function recentre(mesh, x, z) {
  mesh.geometry.translate(-x, 0, -z);
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  mesh.position.set(x, 0, z);
  return mesh;
}

// ---- the fair's clock ---------------------------------------------------------------------
// What the fair's two shaders need from the time of day, set once a frame by
// src/fairlive.js (setFairClock). Plain numbers, shared by every canvas and
// glow material: one write moves them all, and nothing is uploaded per mesh.
// Until a walk sets it (or with reduced motion), nothing chases or flutters.
export const FAIR_CLOCK = Object.freeze({
  chase: { value: 0 },     // the chase's phase, in waves (0..1)
  chaseOn: { value: 0 },   // 1: the bulbs chase; 0: steady
  flutterA: { value: 0 },  // the bunting's two flutters, as angles (0..2pi)
  flutterB: { value: 0 },
  flutterOn: { value: 0 }, // 1: the pennants flutter; 0: still
});
// The bunting's flutter: a slow swing and a quicker shiver (periods in
// seconds), the tip moving at most `amp` metres across the line.
export const FLUTTER = Object.freeze({ amp: 0.09, periodA: 1.7, periodB: 0.63 });

const frac = (x) => x - Math.floor(x);
// setFairClock(T, reducedMotion): T the time of day in seconds (fairlive's clock).
export function setFairClock(T, reducedMotion = false) {
  const on = reducedMotion ? 0 : 1;
  FAIR_CLOCK.chaseOn.value = on;
  FAIR_CLOCK.flutterOn.value = on;
  if (!Number.isFinite(T)) return;
  FAIR_CLOCK.chase.value = frac(T * GLOW_LOOK.speed);
  FAIR_CLOCK.flutterA.value = frac(T / FLUTTER.periodA) * Math.PI * 2;
  FAIR_CLOCK.flutterB.value = frac(T / FLUTTER.periodB) * Math.PI * 2;
}

// GLSL float literals for the shaders below.
const glsl = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

// Canvas: seen from both sides (a cat looks up into a tent roof), and lit by
// the outward normal on both, so the underside of an awning is not black.
// A pennant flutters (bunting() marks its tip): it swings across its own line,
// along its face's normal, held still at the wire. Everything else on canvas
// has a sway of 0 and stands still; every canvas mesh carries the attribute,
// so they all still merge with one another (render/mergeprops.js keys on it).
// The swing is drawn only: no collider or perch reads a pennant.
export function canvasOf(P, name, { noCast = false } = {}) {
  for (const g of P) if (!g.attributes[SWAY]) setFloat(g, SWAY, new Float32Array(g.attributes.position.count));
  const m = meshOf(P, name, { roughness: 0.95, noCast, side: THREE.DoubleSide });
  m.material.onBeforeCompile = flutterShader;
  m.material.customProgramCacheKey = () => 'fair-canvas-v1';
  return m;
}
function flutterShader(shader) {
  shader.uniforms.fairFlutterA = FAIR_CLOCK.flutterA;
  shader.uniforms.fairFlutterB = FAIR_CLOCK.flutterB;
  shader.uniforms.fairFlutterOn = FAIR_CLOCK.flutterOn;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute float fairSway;
uniform float fairFlutterA;
uniform float fairFlutterB;
uniform float fairFlutterOn;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
if (fairSway > 0.0 && fairFlutterOn > 0.0) {
  vec3 fairAcross = vec3(objectNormal.x, 0.0, objectNormal.z);
  float fairLen = length(fairAcross);
  if (fairLen > 0.001) {
    float fairPh = position.x * 0.83 + position.z * 0.61;
    float fairW = 0.7 * sin(fairFlutterA + fairPh) + 0.3 * sin(fairFlutterB + fairPh * 1.9);
    transformed += fairAcross / fairLen * (fairSway * ${glsl(FLUTTER.amp)} * fairW * fairFlutterOn);
    transformed.y += fairSway * ${glsl(FLUTTER.amp * 0.25)} * fairW * fairW * fairFlutterOn;
  }
}`);
}

// ---- the glow ------------------------------------------------------------------------
// Every bulb at the fair is drawn with ONE material. By day a bulb is a bead
// of coloured glass; setting the material's emissiveIntensity lights them all
// at once, each in its own colour. No real lights.
//
// What a lit bulb gives off (all in the vertex shader, so a phone's fragment
// precision never matters):
//  - its own colour, made deeper (`sat`) and brought to one brightness, so a
//    cream bulb glows amber and a blue one blue: the old glow was the pale
//    paint colour times white, which bloom and tone mapping turned white;
//  - dimmer near the camera, by distance and nothing else, so wherever the
//    strings hang, a bulb beside the camera is a bead, never a white square
//    (the street lamps' globes do the same: builder.js dimNearGlobe);
//  - anything on this material that is not a bulb (a lit window, a sign
//    board: no fairChase) glows in its own paint colour, softer (`pane`), so
//    words on it still read and nothing chases;
//  - a bulb right by the camera is drawn smaller (`shrink`), a bead;
//  - the chase: brightness running along each string and round each ride,
//    in waves `wave` metres long, `speed` waves a second, down to `low` between.
export const GLOW_MAX = 2.0;
export const GLOW_LOOK = Object.freeze({
  sat: 1.7, cap: 2.6,
  near: 1.2, far: 5.0, nearScale: 0.06,
  shrinkNear: 0.7, shrinkFar: 2.4, shrink: 0.4,
  pane: 0.55,
  wave: 2.8, speed: 0.45, low: 0.4,
  wide: 20, slant: Object.freeze([0.62, 0.55, 0.56]),
});
// The near-camera dimming as a number (the shader's smoothstep), for tests.
export function glowNearScale(d, L = GLOW_LOOK) {
  const t = Math.min(1, Math.max(0, (d - L.near) / (L.far - L.near)));
  return L.nearScale + (1 - L.nearScale) * t * t * (3 - 2 * t);
}
export function glowMaterial() {
  const m = new THREE.MeshStandardMaterial({
    // rough enough that a sign board or a window pane on this material shows no sun glint by day
    vertexColors: true, roughness: 0.7, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0,
  });
  m.onBeforeCompile = glowShader;
  m.customProgramCacheKey = () => 'fair-glow-v2';
  m.name = 'fairGlow';
  return m;
}
function glowShader(shader) {
  const L = GLOW_LOOK;
  shader.uniforms.fairChasePhase = FAIR_CLOCK.chase;
  shader.uniforms.fairChaseOn = FAIR_CLOCK.chaseOn;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute float fairChase;
attribute float fairBulbR;
uniform float fairChasePhase;
uniform float fairChaseOn;
varying vec3 vFairGlow;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
if (fairBulbR > 0.0) {
  // a bulb right by the camera draws smaller: a bead, never a pane filling the view
  vec3 fairOut = normalize(objectNormal) * fairBulbR;
  vec3 fairMid = transformed - fairOut;
  float fairDm = distance((modelMatrix * vec4(fairMid, 1.0)).xyz, cameraPosition);
  transformed = fairMid + fairOut * mix(${glsl(L.shrink)}, 1.0, smoothstep(${glsl(L.shrinkNear)}, ${glsl(L.shrinkFar)}, fairDm));
}`)
    .replace('#include <project_vertex>', `#include <project_vertex>
{
  const vec3 fairLuma = vec3(0.2126, 0.7152, 0.0722);
  vec3 fairC = vColor.rgb;
  if (fairChase > -0.5) {
    fairC = max(mix(vec3(dot(fairC, fairLuma)), fairC, ${glsl(L.sat)}), 0.0);
    fairC /= max(dot(fairC, fairLuma), 0.05);
    fairC *= min(1.0, ${glsl(L.cap)} / max(fairC.r, max(fairC.g, fairC.b)));
  } else {
    fairC *= ${glsl(L.pane)};
  }
  vec4 fairAt = modelMatrix * vec4(transformed, 1.0);
  float fairNear = mix(${glsl(L.nearScale)}, 1.0, smoothstep(${glsl(L.near)}, ${glsl(L.far)}, distance(fairAt.xyz, cameraPosition)));
  float fairRun = 1.0;
  if (fairChase > -0.5) {
    float fairS = 0.5 + 0.5 * cos(6.2831853 * (fairChase - fairChasePhase));
    fairRun = mix(1.0, mix(${glsl(L.low)}, 1.0, fairS * fairS), fairChaseOn);
  }
  vFairGlow = fairC * (fairNear * fairRun);
}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFairGlow;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vFairGlow;');
}
export function glowMesh(P, name, material) {
  chaseBulbs(P);
  // every piece carries both, so a list with no bulb at all still reads as steady panes
  for (const g of P) {
    for (const k of [CHASE, BULB_R]) if (!g.attributes[k]) setFloat(g, k, new Float32Array(g.attributes.position.count).fill(FILL[k]));
  }
  const m = new THREE.Mesh(merged(P), material);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.noCast = true;
  m.userData.fairGlow = true;
  // The dusk pass must not swap this material for a copy, and the merge must
  // not fold these into anything else: one material drives them all.
  m.userData.noMerge = true;
  return m;
}
