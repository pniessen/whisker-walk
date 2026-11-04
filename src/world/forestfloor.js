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
// exactly [1, 1, 1]: the clearing stays sunny. With `edge` (the ground's
// half-size) it also fades back to [1, 1, 1] over the last 8 m before the
// ground's edge, so the ground there is its plain base colour, the colour the
// horizon band's near strip carries on with (no pale ring).
export function woodsFloorTint(trees, clearing, { edge = null } = {}) {
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
    let wood = smoothstep(clearing.r - 3, clearing.r, Math.hypot(x - clearing.x, z - clearing.z));
    if (edge != null) wood *= 1 - smoothstep(edge - 8, edge - 1, Math.max(Math.abs(x), Math.abs(z)));
    m = lerp3(ONE, m, wood);
    return [clampTint(m[0]), clampTint(m[1]), clampTint(m[2])];
  };
}

// The Pines' needle beds: under each pine the ground goes a rust-brown of
// fallen needles, deepest at the trunk (canopyShade); out between the pines,
// mossy green patches; the rest the plain floor. NEEDLE at full shade on the
// Pines' 0x56603e is a rust-brown (the clamp stops it at 0.5/1.5).
const NEEDLE = [1.65, 0.66, 0.44];
const PINE_MOSS = [0.86, 1.14, 0.84];
const NEEDLE_SHADE = 1;

// Where the Pines' moss patches lie, 0-1: a broad noise field (seed 113, 9 m
// waves). The ground tint paints its green from it and pines.js lays its moss
// cushions where it runs high, so the cushions sit on the green.
export const pinesMossField = (x, z) => smoothstep(0.25, 0.65, smoothField(x, z, 113, 9));

// The Pines' ground multiplier at (x, z). With `edge` (the ground's
// half-size) it fades back to exactly [1, 1, 1] over the last 8 m before the
// ground's edge, as the Woods' does, so the horizon's near strip carries on
// the ground's own colour. `plain` lists discs ({ x, z, r }) kept the plain
// floor (the island), fading in over 1.5 m outside each.
export function pinesFloorTint(trees, { edge = null, plain = [] } = {}) {
  return (x, z) => {
    const shade = canopyShade(trees, x, z);
    let m = lerp3(ONE, NEEDLE, shade * NEEDLE_SHADE);
    const moss = pinesMossField(x, z) * (1 - shade);
    m = mul3(m, lerp3(ONE, PINE_MOSS, moss));
    let k = 1;
    if (edge != null) k *= 1 - smoothstep(edge - 8, edge - 1, Math.max(Math.abs(x), Math.abs(z)));
    for (const d of plain) k *= smoothstep(d.r, d.r + 1.5, Math.hypot(x - d.x, z - d.z));
    if (k < 1) m = lerp3(ONE, m, k);
    return [clampTint(m[0]), clampTint(m[1]), clampTint(m[2])];
  };
}

// --- the bits on the floor -------------------------------------------------------

const LEAF_COLORS = [0x8a4a22, 0xb07a2a, 0x6b4a2c, 0x6f6a30, 0xb8903a, 0x7a3a1e].map(lin);
const MOSS_COLORS = [0x5f8a2e, 0x76a03a].map(lin);
const STEM_CREAM = lin(0xd8c8a4);
const CAP_COLORS = [0xc8a878, 0x8a5a34].map(lin);
const STEM_GREEN = lin(0x4f7a2e);
const BELL_COLORS = [0x5a63c8, 0x7a6ad8].map(lin);
const FOX_COLORS = [0xc85aa0, 0xe08ac0].map(lin);
const FOX_LEAF = lin(0x4a6e2a);
const NEEDLE_COLORS = [0x8a5a30, 0x9a6a3a, 0xa08050].map(lin);
const CONE_BROWN = lin(0x6a4428);
const BLUEBERRY_LEAF = lin(0x35552c);
const BLUEBERRY = lin(0x3a4a8a);

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

// A fallen leaf: a pointed oval, 0.12-0.18 m long and 0.45 of that wide,
// lying almost flat at 0.018-0.035 m. Four points (tip, side, base, side) and
// two triangles meeting along the centre vein, the sides lifted 5-9 mm above
// it, so the two halves catch the light a little differently (one flat
// triangle 0.16-0.24 m read as a big shard close to the camera).
function leaf(t, p) {
  const L = 0.12 + 0.06 * hash01(p.x, p.z, 11);
  const W = 0.45 * L;
  const y = 0.018 + 0.006 * hash01(p.x, p.z, 12);
  const yaw = yawOf(p, 13);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const fold = 0.005 + 0.004 * hash01(p.x, p.z, 14);
  const lift = 0.004 * hash01(p.x, p.z, 17); // the tip a touch up off the ground
  const at = (u, v, h) => [p.x + u * c - v * s, y + h, p.z + u * s + v * c];
  const col = jitter(LEAF_COLORS[Math.floor(hash01(p.x, p.z, 15) * LEAF_COLORS.length) % LEAF_COLORS.length], p, 16, 0.12);
  const tip = at(L * 0.55, 0, lift);
  const base = at(-L * 0.45, 0, 0);
  const sideA = at(0, W / 2, fold);
  const sideB = at(0, -W / 2, fold);
  // each half wound so its normal faces up
  for (const side of [sideA, sideB]) {
    const n = cross(sub(side, tip), sub(base, tip));
    if (n[1] >= 0) tri(t, tip, side, base, col);
    else tri(t, tip, base, side, col);
  }
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

// A fallen pine needle: one sliver triangle 0.16-0.24 m long and 0.025 m
// wide, lying flat at 0.018-0.03 m, rust or dry.
function needle(t, p) {
  const L = 0.16 + 0.08 * hash01(p.x, p.z, 81);
  const w = 0.0125;
  const y = 0.018 + 0.012 * hash01(p.x, p.z, 82);
  const yaw = yawOf(p, 83);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const col = jitter(NEEDLE_COLORS[Math.floor(hash01(p.x, p.z, 84) * NEEDLE_COLORS.length) % NEEDLE_COLORS.length], p, 85, 0.1);
  const A = [p.x + c * L / 2, y, p.z + s * L / 2];
  const B = [p.x - c * L / 2 - s * w, y, p.z - s * L / 2 + c * w];
  const C = [p.x - c * L / 2 + s * w, y, p.z - s * L / 2 - c * w];
  const n = cross(sub(B, A), sub(C, A));
  if (n[1] >= 0) tri(t, A, B, C, col);
  else tri(t, A, C, B, col);
}

// A fallen pinecone: two 5-sided cones base to base, 0.09-0.12 m long, lying
// on its side.
function cone(t, p) {
  const L = 0.09 + 0.03 * hash01(p.x, p.z, 61);
  const r = L * 0.27;
  const yaw = yawOf(p, 62);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // the base ring a little behind the middle, so the cone's tip is longer
  const bx = p.x - c * L * 0.1;
  const bz = p.z - s * L * 0.1;
  const tipF = [p.x + c * L * 0.55, r, p.z + s * L * 0.55];
  const tipB = [p.x - c * L * 0.45, r, p.z - s * L * 0.45];
  const turn = hash01(p.x, p.z, 63) * Math.PI;
  const ring = [0, 1, 2, 3, 4].map((i) => {
    const a = turn + (i / 5) * Math.PI * 2;
    // around the cone's axis (horizontal, along yaw): sideways and up
    const side = Math.cos(a) * r;
    return [bx - s * side, r + Math.sin(a) * r, bz + c * side];
  });
  const mid = [bx, r, bz];
  const col = jitter(CONE_BROWN, p, 64, 0.12);
  for (let i = 0; i < 5; i++) {
    const A = ring[i];
    const B = ring[(i + 1) % 5];
    tri(t, tipF, A, B, col, mid);
    tri(t, tipB, A, B, scale3(col, 0.85), mid);
  }
}

// A blueberry clump: three squashed icosahedron lobes (0.16-0.22 m), their
// downward faces left out, and six blue berries (0.025 m tetras) on top.
function blueberries(t, p) {
  const base = yawOf(p, 71);
  const tops = [];
  for (let l = 0; l < 3; l++) {
    const r = 0.16 + 0.06 * hash01(p.x + l, p.z, 72);
    const a = base + l * 2.09;
    const d = l === 0 ? 0.04 : 0.13 + 0.05 * hash01(p.x, p.z + l, 73);
    const cx = p.x + Math.cos(a) * d;
    const cz = p.z + Math.sin(a) * d;
    const sq = 0.55 + 0.15 * hash01(p.x + l, p.z + l, 74);
    const cy = 0.03;
    const yaw = a + hash01(p.x, p.z, 75 + l) * Math.PI;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = ([u, v, w]) => [cx + (u * c - w * s) * r, cy + v * r * sq, cz + (u * s + w * c) * r];
    const centre = [cx, cy, cz];
    icoFaces().forEach((f, i) => {
      const [A, B, C] = f.map(at);
      if (Math.max(A[1], B[1], C[1]) <= 0) return; // buried
      let n = cross(sub(B, A), sub(C, A));
      const mid = [(A[0] + B[0] + C[0]) / 3 - cx, (A[1] + B[1] + C[1]) / 3 - cy, (A[2] + B[2] + C[2]) / 3 - cz];
      if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) n = [-n[0], -n[1], -n[2]];
      if (n[1] < 0) return; // a face turned downward is never seen
      tri(t, A, B, C, jitter(BLUEBERRY_LEAF, p, 76 + l * 20 + i, 0.1), centre);
    });
    tops.push({ cx, cz, r, top: cy + r * sq * 0.8 });
  }
  for (let i = 0; i < 6; i++) {
    const L = tops[i % 3];
    const a = base + i * 1.7 + hash01(p.x + i, p.z, 77);
    const d = L.r * (0.25 + 0.4 * hash01(p.x, p.z + i, 78));
    const x = L.cx + Math.cos(a) * d;
    const z = L.cz + Math.sin(a) * d;
    // the lobe's top falls away from its middle
    const y = L.top * (1 - 0.45 * (d / L.r) * (d / L.r));
    const e = 0.025;
    const P0 = [x, y + e, z];
    const ring = [0, 1, 2].map((j) => [x + Math.cos(a + j * 2.094) * e * 0.8, y - e * 0.2, z + Math.sin(a + j * 2.094) * e * 0.8]);
    const mid = [x, y + e * 0.3, z];
    const col = jitter(BLUEBERRY, p, 79 + i, 0.1);
    for (let j = 0; j < 3; j++) tri(t, P0, ring[j], ring[(j + 1) % 3], col, mid);
    tri(t, ring[0], ring[1], ring[2], col, mid);
  }
}

const SHAPES = { leaves: leaf, needles: needle, moss, mushrooms, bluebells, foxgloves: foxglove, cones: cone, blueberries };

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
