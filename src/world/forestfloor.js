import * as THREE from 'three';
import { hash01 } from './builder.js';
import { Tris, bothSidesLit, smoothField, smoothstep, lerp3, lin, scale3, unit } from './dressing.js';

// The forest floor (polish-forestfloor): what lies under the trees, so a wood
// reads as a wood and not a park lawn with trees on it. Two halves:
//
//  - a ground tint (woodsFloorTint), multiplied into the ground mesh's vertex
//    colours by dressing.js's tintGround: darker under the canopies, warm
//    leaf-litter patches gathered under the trees, mossy green patches, the
//    whole wood a little dimmer than its sunny clearing;
//  - the bits on it (forestFloorMesh): fallen leaves lying flat, moss
//    cushions, mushrooms, bluebells and foxgloves, all small and low (the
//    foxgloves, the tallest, stay under 0.6 m), one merged vertex-coloured
//    mesh out of the shadow pass.
//
// Pure apart from forestFloorMesh, which makes Three objects (a geometry, a
// material, a mesh): the caller wraps it in withLocalUuids. Nothing here draws
// Math.random; every variation comes from hash01 of the spot.

// --- the ground tint -----------------------------------------------------------

// How much a tree's canopy shades (x, z): 1 within 1.2 m of the trunk
// (scaled with the tree), fading to 0 by 3.2 m. The darkest tree wins.
export function canopyShade(trees, x, z) {
  let best = 0;
  for (const t of trees) {
    const s = t.scale ?? 1;
    const reach = 3.2 * s;
    const dx = x - t.x;
    const dz = z - t.z;
    if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
    const v = 1 - smoothstep(1.2 * s, reach, Math.hypot(dx, dz));
    if (v > best) best = v;
    if (best === 1) break;
  }
  return best;
}

// How deep the leaf litter lies at (x, z) under the canopies: 1 near a
// trunk, fading out by about 3.3 m (scaled with the tree) with a wobbly edge,
// so the patches are drifts rather than discs. The deepest tree wins.
export function litterDepth(trees, x, z) {
  const wob = 1 + 0.28 * smoothField(x, z, 113, 2.6);
  let best = 0;
  for (const t of trees) {
    const s = t.scale ?? 1;
    const reach = 4.4 * s;
    const dx = x - t.x;
    const dz = z - t.z;
    if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
    const v = 1 - smoothstep(1.2 * s, 3.3 * s * wob, Math.hypot(dx, dz));
    if (v > best) best = v;
    if (best === 1) break;
  }
  return best;
}

// How much (x, z) is among the trees: 1 within 3 m of a trunk (scaled), 0
// past 8 m, so the litter drifts lie in the wood and not as stripes over
// open ground.
function amongTrees(trees, x, z) {
  let best = 0;
  for (const t of trees) {
    const s = t.scale ?? 1;
    const reach = 8 * s;
    const dx = x - t.x;
    const dz = z - t.z;
    if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
    const v = 1 - smoothstep(3 * s, reach, Math.hypot(dx, dz));
    if (v > best) best = v;
    if (best === 1) break;
  }
  return best;
}

// Linear multipliers (the ground's vertex colours multiply its linear colour,
// so these are stronger than they look in sRGB). On the Woods' 0x547f3e
// LITTER at full strength comes out a warm olive-brown (clamped to 1.5/0.5).
const SHADE = [0.88, 0.85, 0.82];
const LITTER = [1.6, 0.66, 0.48];
const MOSS_TINT = [0.82, 1.04, 0.7];
const WOOD_DIM = 0.92;
const clampTint = (v) => (v < 0.5 ? 0.5 : v > 1.5 ? 1.5 : v);
const mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const ONE = [1, 1, 1];

// The Woods' ground multiplier at (x, z): leaf litter under every canopy and
// in a few broad drifts between the trees, moss patches in the green gaps, a
// little shade under the trees, the whole wood a touch dimmer than its
// clearing. Inside the clearing's inner part (its last 3 m fade) it is
// exactly [1, 1, 1]: the clearing stays sunny.
export function woodsFloorTint(trees, clearing) {
  return (x, z) => {
    const shade = canopyShade(trees, x, z);
    const drift = 0.85 * smoothstep(0.2, 0.6, smoothField(x, z, 91, 11)) * amongTrees(trees, x, z);
    const litter = Math.max(litterDepth(trees, x, z), drift);
    let m = lerp3(ONE, SHADE, shade);
    m = mul3(m, lerp3(ONE, LITTER, litter));
    const moss = smoothstep(0.3, 0.7, smoothField(x, z, 97, 8)) * (1 - litter);
    m = mul3(m, lerp3(ONE, MOSS_TINT, moss));
    m = scale3(m, WOOD_DIM);
    // the wood's look fades out over the clearing's last 3 m
    const wood = smoothstep(clearing.r - 3, clearing.r, Math.hypot(x - clearing.x, z - clearing.z));
    m = lerp3(ONE, m, wood);
    return [clampTint(m[0]), clampTint(m[1]), clampTint(m[2])];
  };
}

// The Pines' version is Task 3's (polish-forestfloor plan).

// --- the bits on the floor -------------------------------------------------------

const LEAF_COLORS = [0x8a4a22, 0xb07a2a, 0x6b4a2c, 0x6f6a30, 0xc89a3a, 0x7a3a1e].map(lin);
const MOSS_COLORS = [0x5f8a2e, 0x76a03a].map(lin);
const STEM_CREAM = lin(0xd8c8a4);
const CAP_COLORS = [0xc8a878, 0x8a5a34].map(lin);
const STEM_GREEN = lin(0x4f7a2e);
const BELL_COLORS = [0x5a63c8, 0x7a6ad8].map(lin);
const FOX_COLORS = [0xc85aa0, 0xe08ac0].map(lin);
const FOX_LEAF = lin(0x4a6e2a);
const CONE_BROWN = lin(0x6b4a2c);
const BERRY_RED = lin(0xb0282a);

// A size factor kept in a sane band, so no spot can push a bit past its cap.
const sizeOf = (p) => Math.min(1.15, Math.max(0.6, p.s ?? 1));
const yawOf = (p, salt) => p.a ?? hash01(p.x, p.z, salt) * Math.PI * 2;
const jitter = (c, p, salt, k = 0.1) => scale3(c, 1 + k * (hash01(p.x, p.z, salt) * 2 - 1));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// One flat-shaded triangle. With `out` (a point inside a closed shape), the
// normal is turned to face away from it; otherwise it is the winding's.
function tri(t, A, B, C, color, out) {
  let n = unit(...cross(sub(B, A), sub(C, A)));
  if (out) {
    const mid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    const d = sub(mid, out);
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) n = [-n[0], -n[1], -n[2]];
  }
  t.v(A[0], A[1], A[2], n, color);
  t.v(B[0], B[1], B[2], n, color);
  t.v(C[0], C[1], C[2], n, color);
}
// A thin standing piece (a stem): lit as if it faced mostly up, so it never
// goes black edge-on.
function sliver(t, A, B, C, color) {
  const n = unit(...cross(sub(B, A), sub(C, A)));
  const up = unit(n[0] * 0.5, 0.85, n[2] * 0.5);
  for (const P of [A, B, C]) t.v(P[0], P[1], P[2], up, color);
}

// A fallen leaf: one triangle 0.16-0.24 m long lying almost flat (the plan's
// 0.09-0.14 m vanished at the walking camera's distance).
function leaf(t, p) {
  const L = (0.16 + 0.08 * hash01(p.x, p.z, 11)) * Math.min(1.1, sizeOf(p));
  const y = 0.018 + 0.012 * hash01(p.x, p.z, 12);
  const yaw = yawOf(p, 13);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const tilt = 0.04 * (hash01(p.x, p.z, 14) * 2 - 1);
  const at = (u, v) => [p.x + u * c - v * s, y + v * tilt * 0.6, p.z + u * s + v * c];
  const col = jitter(LEAF_COLORS[Math.floor(hash01(p.x, p.z, 15) * LEAF_COLORS.length) % LEAF_COLORS.length], p, 16, 0.12);
  const A = at(0, L * 0.6);
  const B = at(-L * 0.28, -L * 0.4);
  const C = at(L * 0.28, -L * 0.4);
  // wound so the normal faces up
  const n = cross(sub(B, A), sub(C, A));
  if (n[1] >= 0) tri(t, A, B, C, col);
  else tri(t, A, C, B, col);
}

// A moss cushion: a squashed icosahedron, its downward faces left out.
let icoCache = null;
function icoFaces() {
  if (icoCache) return icoCache;
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = (g.index ? g.toNonIndexed() : g).attributes.position;
  const faces = [];
  for (let i = 0; i < pos.count; i += 3) {
    faces.push([0, 1, 2].map((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]));
  }
  g.dispose();
  icoCache = faces;
  return faces;
}
function moss(t, p) {
  const r = (0.18 + 0.17 * hash01(p.x, p.z, 21)) * sizeOf(p);
  const yaw = yawOf(p, 22);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const sx = 1 + 0.25 * hash01(p.x, p.z, 23);
  const at = ([u, v, w]) => {
    const lu = u * r * sx;
    const lw = w * r;
    return [p.x + lu * c - lw * s, v * r * 0.3, p.z + lu * s + lw * c];
  };
  const centre = [p.x, -0.05 * r, p.z];
  icoFaces().forEach((f, i) => {
    const [A, B, C] = f.map(at);
    if (Math.max(A[1], B[1], C[1]) <= 0) return; // buried
    // outward normal; a face turned downward is never seen
    let n = cross(sub(B, A), sub(C, A));
    const mid = [(A[0] + B[0] + C[0]) / 3 - centre[0], (A[1] + B[1] + C[1]) / 3 - centre[1], (A[2] + B[2] + C[2]) / 3 - centre[2]];
    if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) n = [-n[0], -n[1], -n[2]];
    if (n[1] < 0) return;
    const col = jitter(MOSS_COLORS[(i + Math.floor(hash01(p.x, p.z, 24) * 2)) % 2], p, 25 + i, 0.08);
    tri(t, A, B, C, col, centre);
  });
}

// A mushroom cluster: 2-3 mushrooms, each a 5-sided open stem and a 6-sided
// cone cap.
function mushrooms(t, p) {
  const k = sizeOf(p);
  const n = 2 + Math.floor(hash01(p.x, p.z, 31) * 2);
  const base = yawOf(p, 32);
  for (let m = 0; m < n; m++) {
    const ang = base + m * 2.2;
    const d = m === 0 ? 0 : (0.07 + 0.06 * hash01(p.x + m, p.z, 33)) * k;
    const cx = p.x + Math.cos(ang) * d;
    const cz = p.z + Math.sin(ang) * d;
    const h = (0.06 + 0.04 * hash01(p.x, p.z + m, 34)) * k * (m === 0 ? 1 : 0.8);
    const rs = 0.018 * k;
    const rc = 0.07 * k * (m === 0 ? 1 : 0.8);
    const stem = jitter(STEM_CREAM, p, 35 + m, 0.06);
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2;
      const a1 = ((i + 1) / 5) * Math.PI * 2;
      const P0 = [cx + Math.cos(a0) * rs, 0, cz + Math.sin(a0) * rs];
      const P1 = [cx + Math.cos(a1) * rs, 0, cz + Math.sin(a1) * rs];
      const Q0 = [P0[0], h, P0[2]];
      const Q1 = [P1[0], h, P1[2]];
      const mid = [cx, h / 2, cz];
      tri(t, P0, P1, Q1, stem, mid);
      tri(t, P0, Q1, Q0, stem, mid);
    }
    const cap = jitter(CAP_COLORS[Math.floor(hash01(p.x + m, p.z, 36) * 2) % 2], p, 37 + m, 0.08);
    const top = [cx, h + 0.05 * k, cz];
    const rimY = h - 0.012 * k;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + m;
      const a1 = ((i + 1) / 6) * Math.PI * 2 + m;
      const R0 = [cx + Math.cos(a0) * rc, rimY, cz + Math.sin(a0) * rc];
      const R1 = [cx + Math.cos(a1) * rc, rimY, cz + Math.sin(a1) * rc];
      tri(t, top, R0, R1, cap, [cx, rimY - 0.05, cz]);
    }
  }
}

// A hanging bell: an open 3-sided cone, its mouth downward (the camera is
// above it; its mouth is left out to keep the triangles for more flowers).
function bell(t, top, len, r, color, turn) {
  const mouthY = top[1] - len;
  const ring = [0, 1, 2].map((i) => {
    const a = turn + (i / 3) * Math.PI * 2;
    return [top[0] + Math.cos(a) * r, mouthY, top[2] + Math.sin(a) * r];
  });
  const inside = [top[0], top[1] - len * 0.6, top[2]];
  for (let i = 0; i < 3; i++) tri(t, top, ring[i], ring[(i + 1) % 3], color, inside);
}

// A bluebell clump: five stems, each a thin triangle arching out, a bell
// hanging from its tip.
function bluebells(t, p) {
  const k = sizeOf(p);
  const base = yawOf(p, 41);
  for (let i = 0; i < 5; i++) {
    const ang = base + i * 1.26 + 0.3 * hash01(p.x + i, p.z, 42);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const foot = 0.03 * hash01(p.x, p.z + i, 43);
    const fx = p.x + c * foot;
    const fz = p.z + s * foot;
    const h = (0.18 + 0.07 * hash01(p.x + i, p.z, 44)) * k;
    const lean = (0.04 + 0.04 * hash01(p.x, p.z + i, 45)) * k;
    const tip = [fx + c * lean, h, fz + s * lean];
    const w = 0.006 * k;
    sliver(t, [fx - s * w, 0, fz + c * w], [fx + s * w, 0, fz - c * w], tip, jitter(STEM_GREEN, p, 46 + i, 0.08));
    const bellTop = [tip[0] + c * 0.012 * k, h - 0.006 * k, tip[2] + s * 0.012 * k];
    const col = jitter(BELL_COLORS[(i + Math.floor(hash01(p.x, p.z, 47) * 2)) % 2], p, 48 + i, 0.08);
    bell(t, bellTop, 0.035 * k, 0.017 * k, col, ang);
  }
}

// A foxglove: a tapered stem 0.4-0.55 m, a few low leaves, and six pink bells
// hanging up the top half.
function foxglove(t, p) {
  const k = Math.min(1.05, sizeOf(p));
  const h = (0.4 + 0.15 * hash01(p.x, p.z, 51)) * k;
  const yaw = yawOf(p, 52);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const w = 0.014 * k;
  const stem = jitter(STEM_GREEN, p, 53, 0.08);
  const tip = [p.x, h, p.z];
  sliver(t, [p.x - s * w, 0, p.z + c * w], [p.x + s * w, 0, p.z - c * w], tip, stem);
  sliver(t, [p.x - c * w, 0, p.z - s * w], [p.x + c * w, 0, p.z + s * w], tip, stem);
  for (let i = 0; i < 3; i++) {
    const a = yaw + i * 2.1;
    const L = 0.16 * k;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const A = [p.x + ca * L, 0.03, p.z + sa * L];
    const B = [p.x - sa * 0.04 * k, 0.05, p.z + ca * 0.04 * k];
    const C = [p.x + sa * 0.04 * k, 0.05, p.z - ca * 0.04 * k];
    const n = cross(sub(B, A), sub(C, A));
    if (n[1] >= 0) tri(t, A, B, C, FOX_LEAF);
    else tri(t, A, C, B, FOX_LEAF);
  }
  for (let i = 0; i < 6; i++) {
    const f = 0.5 + 0.42 * (i / 5);
    const y = h * f;
    const a = yaw + i * 2.4;
    const off = 0.03 * k * (1.1 - 0.4 * (i / 5));
    const top = [p.x + Math.cos(a) * off, y, p.z + Math.sin(a) * off];
    const col = jitter(FOX_COLORS[(i + Math.floor(hash01(p.x, p.z, 54) * 2)) % 2], p, 55 + i, 0.08);
    bell(t, top, 0.065 * k * (1 - 0.35 * (i / 5)), 0.03 * k * (1 - 0.3 * (i / 5)), col, a);
  }
}

// A fallen pine cone: a tetra lying on its side.
function cone(t, p) {
  const k = sizeOf(p);
  const yaw = yawOf(p, 61);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const L = 0.07 * k;
  const r = 0.025 * k;
  const back = [p.x - c * L / 2, r, p.z - s * L / 2];
  const nose = [p.x + c * L / 2, r * 0.8, p.z + s * L / 2];
  const ring = [[-s * r, 2 * r, c * r], [s * r, 2 * r, -c * r], [0, 0, 0]].map(([dx, y, dz]) => [back[0] + dx, y, back[2] + dz]);
  const mid = [p.x, r, p.z];
  const col = jitter(CONE_BROWN, p, 62, 0.1);
  for (let i = 0; i < 3; i++) tri(t, nose, ring[i], ring[(i + 1) % 3], col, mid);
  tri(t, ring[0], ring[1], ring[2], col, mid);
}

// A sprig of berries: three tiny red tetras on the ground.
function berries(t, p) {
  const k = sizeOf(p);
  for (let i = 0; i < 3; i++) {
    const a = yawOf(p, 71) + i * 2.1;
    const x = p.x + Math.cos(a) * 0.03 * k;
    const z = p.z + Math.sin(a) * 0.03 * k;
    const r = 0.015 * k;
    const top = [x, 0.04 * k, z];
    const ring = [0, 1, 2].map((j) => [x + Math.cos(a + j * 2.094) * r, 0.012, z + Math.sin(a + j * 2.094) * r]);
    const mid = [x, 0.02, z];
    const col = jitter(BERRY_RED, p, 72 + i, 0.1);
    for (let j = 0; j < 3; j++) tri(t, top, ring[j], ring[(j + 1) % 3], col, mid);
  }
}

// `needles` (the Pines) are Task 3's.
const SHAPES = { leaves: leaf, moss, mushrooms, bluebells, foxgloves: foxglove, cones: cone, berries };

// The whole floor as one mesh. `parts` maps each kind to its spots
// ({ x, z, s?, a? }); any may be missing. Lambert, double-sided and lit from
// the normals as built on both faces (dressing.js bothSidesLit): thin
// edge-on pieces under a standard material showed a pale grey sheen (the
// fern pass found the same), Lambert keeps their true colours.
export function forestFloorMesh(parts, { name = 'forestFloor' } = {}) {
  const t = new Tris();
  for (const [kind, draw] of Object.entries(SHAPES)) {
    for (const p of parts?.[kind] ?? []) draw(t, p);
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  bothSidesLit(material);
  const mesh = new THREE.Mesh(t.geometry(), material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  return mesh;
}
