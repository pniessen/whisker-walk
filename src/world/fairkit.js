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
    n3.crossVectors(a3, b3).normalize();
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

// A flat awning of stripes: w along x by d along z, its top face at y + t.
export function stripedSlab(P, w, t, d, colors, x, y, z, o = {}) {
  const n = o.n ?? Math.max(2, Math.round(w / 0.45));
  const sub = [];
  for (let i = 0; i < n; i++) {
    box(sub, w / n, t, d, -w / 2 + (i + 0.5) * (w / n), 0, 0, colors[i % colors.length]);
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
    sheet(P, [p1, q1, tip], BUNTING_COLORS[(i + salt) % BUNTING_COLORS.length]);
  }
  return pts;
}

// A light bulb: eight triangles. Its colour is also the colour it glows.
export const BULB_COLORS = Object.freeze([0xfff0b8, 0xffd75a, 0xff8f6a, 0x8fd8ff, 0xfff0b8, 0xa8f0a0]);
export function bulb(P, x, y, z, hex = BULB_COLORS[0], r = 0.06) {
  const g = new THREE.OctahedronGeometry(r, 0);
  return finish(P, g, hex, matrixOf(x, y, z, {}));
}
// Bulbs strung along the line a -> b, with its wire.
export function bulbString(P, W, a, b, { sag = 0.4, every = 0.7, salt = 0, wire = 0x4a4038, colors = BULB_COLORS } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(2, Math.round(len / every));
  const pts = catenary(a, b, sag, n);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (W) sheet(W, [[p[0], p[1] + 0.012, p[2]], [q[0], q[1] + 0.012, q[2]], [q[0], q[1] - 0.012, q[2]], [p[0], p[1] - 0.012, p[2]]], wire);
    if (i > 0) bulb(P, p[0], p[1] - 0.06, p[2], colors[(i + salt) % colors.length]);
  }
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

// Canvas: seen from both sides (a cat looks up into a tent roof), and lit by
// the outward normal on both, so the underside of an awning is not black.
export function canvasOf(P, name, { noCast = false } = {}) {
  const m = meshOf(P, name, { roughness: 0.95, noCast, side: THREE.DoubleSide });
  return m;
}

// ---- the glow ------------------------------------------------------------------------
// Every bulb at the fair is drawn with ONE material. By day a bulb is a bead
// of coloured glass; setting the material's emissiveIntensity lights them all
// at once, each in its own colour (the emissive term is multiplied by the
// vertex colour). No real lights.
export const GLOW_MAX = 1.6;
export function glowMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.35, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;',
    );
  };
  m.customProgramCacheKey = () => 'fair-glow-v1';
  m.name = 'fairGlow';
  return m;
}
export function glowMesh(P, name, material) {
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
