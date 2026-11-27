// =============================================================================
// THE TREEHOUSE VILLAGE: THE BEAUTY ROUND TWO, trees, shrubs, canopy and houses (2026-11-27, from the owner's live play). The lift stage draws it, all into the village's
// existing merged buckets (paint, leaves; no new mesh), every layer from its own seeded stream (mulberry32; no clock, no Math.random, no text):
//   * TREES: the forest rim's trees are four seeded variants (a flared root base, a gentle taper with a lean, two or three forked limbs, and a crown of five to seven overlapping
//     irregular low-poly lumps in two or three greens with a few autumn tints and a little drooping at the edges), each built once and stamped by merged geometry; the great oak gets
//     forked limbs;
//   * SHRUBS: clusters of four to eight overlapping lumps at varied heights and greens, a few with berries or small flowers, and low ferns (the old cones are gone);
//   * CANOPY: each overhead clump is three overlapping irregular lumps and a few drooping tips, all still above CANOPY_MIN_Y (the camera at zoom step 2 never meets them);
//   * HOUSES: stepped shingle (or thatch) rows on the roofs with a random tone per tile, plank lines and corner posts on the walls, window frames with shutters, door trim, a
//     weathered base and a little moss (the Bakery, the Bookshop and the Bell Tower).
// treehouse.js leaves the old rim, fern and canopy drawing out when this is in (the lift stage is always loaded with the village).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../rng.js';
import * as P from './treehouseplan.js';
import { paint, placed, post, slab, beam } from './treehouseparts.js';

const L = P.TREE_LOOK;
const GREENS = Object.freeze([L.leaf, L.leafLight, L.leafDark]);
const AUTUMN = Object.freeze([0xd9a040, 0xc8683a, 0xe8c85a, 0xb8512e]);
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// A shaded, irregular lump: a low-poly icosahedron whose points are pushed in and out (seeded; the same push for the same corner, so it stays closed), lighter toward the top.
export function lump(rng, x, y, z, rx, ry, rz, hex, tone = 0, tilt = 0, yaw = 0) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.attributes.position;
  const push = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!push.has(k)) push.set(k, 0.78 + rng() * 0.4);
    const f = push.get(k);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  placed(g, 0, 0, 0, { sx: rx, sy: ry, sz: rz });
  placed(g, x, y, z, { yaw, pitch: tilt });
  const out = paint(g, hex, tone);
  const col = out.attributes.color; const p = out.attributes.position;
  for (let i = 0; i < col.count; i++) { // lighter on top, darker underneath
    const k = 0.84 + 0.3 * Math.max(0, Math.min(1, (p.getY(i) - (y - ry)) / (2 * ry)));
    col.setXYZ(i, Math.min(1, col.getX(i) * k), Math.min(1, col.getY(i) * k), Math.min(1, col.getZ(i) * k));
  }
  return out;
}

// A tapering limb along a path of { x, y, z, r } rings (round, `sides` sides), the colour running from `hexA` at the first ring to `hexB` at the last.
export function tube(pts, sides, hexA, hexB) {
  const pos = []; const col = [];
  const rings = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
    const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    const ref = Math.abs(d.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(d, ref).normalize();
    const v = new THREE.Vector3().crossVectors(d, u).normalize();
    const c = _c.setHex(hexA).lerp(new THREE.Color(hexB), i / Math.max(1, pts.length - 1));
    return { pts: Array.from({ length: sides }, (_, j) => { const t = (j / sides) * Math.PI * 2; return new THREE.Vector3(p.x, p.y, p.z).addScaledVector(u, Math.cos(t) * p.r).addScaledVector(v, Math.sin(t) * p.r); }), rgb: [c.r, c.g, c.b] };
  });
  const put = (q, rgb) => { pos.push(q.x, q.y, q.z); col.push(...rgb); };
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i]; const B = rings[i + 1];
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      put(A.pts[j], A.rgb); put(A.pts[k], A.rgb); put(B.pts[j], B.rgb);
      put(A.pts[k], A.rgb); put(B.pts[k], B.rgb); put(B.pts[j], B.rgb);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

const droop = (x, y, z, r, len, hex) => paint(placed(new THREE.ConeGeometry(r, len, 4), x, y - len / 2, z, { pitch: Math.PI }), hex);

// Stamp a stored geometry at a place (cloned, so the stored one stays at the origin), with an optional small tone shift per stamp.
function stamp(g, x, y, z, { yaw = 0, s = 1, tone = 1 } = {}) {
  const c = g.clone();
  c.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(s, s, s)));
  if (tone !== 1) { const a = c.attributes.color; for (let i = 0; i < a.count; i++) a.setXYZ(i, Math.min(1, a.getX(i) * tone), Math.min(1, a.getY(i) * tone), Math.min(1, a.getZ(i) * tone)); }
  return c;
}

// ---- trees: four variants, each { wood, crown } at the origin, one metre of trunk base to a crown about 7 m up (scaled by the tree's own size) -------------------------------------
const TREE_SEEDS = Object.freeze([0x74726531, 0x74726532, 0x74726533, 0x74726534]);
const _trees = new Map();
export function treeVariant(i) {
  if (_trees.has(i)) return _trees.get(i);
  const rng = mulberry32(TREE_SEEDS[i]);
  const lean = (rng() - 0.5) * 0.7; const leanZ = (rng() - 0.5) * 0.5;
  const wood = [tube([
    { x: 0, y: -0.05, z: 0, r: 0.72 }, { x: 0, y: 0.18, z: 0, r: 0.5 }, { x: lean * 0.25, y: 1.0, z: leanZ * 0.25, r: 0.37 },
    { x: lean * 0.6, y: 2.4, z: leanZ * 0.6, r: 0.28 }, { x: lean, y: 3.8, z: leanZ, r: 0.2 }], 6, L.trunkDark, L.trunk)];
  for (let r = 0; r < 3; r++) { // the root flare: three short roots, wide and low
    const a = r * 2.09 + rng() * 0.6;
    wood.push(tube([{ x: Math.cos(a) * 0.3, y: 0.28, z: Math.sin(a) * 0.3, r: 0.17 }, { x: Math.cos(a) * 0.72, y: 0.05, z: Math.sin(a) * 0.72, r: 0.1 }], 3, L.trunk, L.trunkDark));
  }
  const forks = 2 + (i % 2);
  const tips = [];
  for (let f = 0; f < forks; f++) { // the forked limbs
    const a = (f / forks) * 6.28 + rng() * 1.2; const y0 = 2.5 + rng() * 1.0; const out = 0.9 + rng() * 0.8;
    const x0 = lean * (y0 / 3.8); const z0 = leanZ * (y0 / 3.8);
    const mid = { x: x0 + Math.cos(a) * out * 0.5, y: y0 + 0.6, z: z0 + Math.sin(a) * out * 0.5, r: 0.12 };
    const tip = { x: x0 + Math.cos(a) * out, y: y0 + 1.4 + rng() * 0.6, z: z0 + Math.sin(a) * out, r: 0.06 };
    wood.push(tube([{ x: x0, y: y0, z: z0, r: 0.17 }, mid, tip], 4, L.trunk, L.trunkDark));
    tips.push(tip);
  }
  const crown = [];
  const n = 4 + (i % 3);
  const autumn = i === 1 || i === 3;
  for (let k = 0; k < n; k++) {
    const t = k < tips.length ? tips[k] : { x: lean + (rng() - 0.5) * 1.6, y: 4.6, z: leanZ + (rng() - 0.5) * 1.6 };
    const rx = 1.0 + rng() * 0.9; const ry = rx * (0.62 + rng() * 0.25);
    const cx = t.x + (rng() - 0.5) * 0.9; const cy = Math.max(t.y + 0.5, 4.3) + rng() * 1.5; const cz = t.z + (rng() - 0.5) * 0.9;
    const tint = autumn && k % 3 === 2;
    const hex = tint ? AUTUMN[Math.floor(rng() * AUTUMN.length)] : GREENS[Math.floor(rng() * 3)];
    crown.push(lump(rng, cx, cy, cz, rx, ry, rx * (0.85 + rng() * 0.3), hex, rng() * 2 - 1, (rng() - 0.5) * 0.5, rng() * 6.28));
    if (k % 2 === 0) crown.push(droop(cx + Math.cos(k * 2) * rx * 0.7, cy - ry * 0.55, cz + Math.sin(k * 2) * rx * 0.7, 0.26, 0.7 + rng() * 0.4, tint ? hex : L.leafDark)); // a drooping tip at the edge
  }
  crown.push(lump(rng, lean, 6.3, leanZ, 0.9, 0.6, 0.9, L.leafLight, 1, 0, 0)); // the sunny top
  const v = { wood: mergeGeometries(wood), crown: mergeGeometries(crown) };
  _trees.set(i, v);
  return v;
}

// The rim's trees: { x, z, s, yaw, v } (the same stream the plan's scatterRim gives; no new random draw touches it).
export function rimTrees() { return P.scatterRim().map((t) => ({ x: t.x, z: t.z, s: t.s * 0.95, yaw: t.yaw, v: Math.floor(t.yaw * 3.1) % 4 })); }

export function drawTrees(kit, M) {
  for (const t of rimTrees()) {
    const v = treeVariant(t.v);
    const tone = 0.92 + ((t.yaw * 13) % 1) * 0.16;
    kit.put('paint', M.paint, stamp(v.wood, t.x, 0, t.z, { yaw: t.yaw, s: t.s }));
    kit.put('leaves', M.leaves, stamp(v.crown, t.x, 0, t.z, { yaw: t.yaw, s: t.s, tone }), { noCast: true });
  }
  // the great oak: forked sub-limbs at the end of each great limb, and a lick of moss on the roots
  const O = P.OAK;
  const rng = mulberry32(0x6f616b32); // 'oak2'
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const ex = O.x + Math.cos(a) * 5.5; const ez = O.z + Math.sin(a) * 5.5; const ey = O.h + 1.5;
    for (let f = 0; f < 2; f++) {
      const b = a + (f ? 0.6 : -0.6) + (rng() - 0.5) * 0.3;
      kit.put('paint', M.paint, beam(ex - Math.cos(a) * 1.4, ey - 0.5, ez - Math.sin(a) * 1.4, ex + Math.cos(b) * 2.6, ey + 1.1 + rng() * 0.8, ez + Math.sin(b) * 2.6, 0.38, L.trunkDark, f));
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.9;
    kit.put('leaves', M.leaves, lump(rng, O.x + Math.cos(a) * (O.r + 0.2), 0.35 + rng() * 0.3, O.z + Math.sin(a) * (O.r + 0.2), 0.45, 0.22, 0.4, 0x6f9a44, rng()), { noCast: true });
  }
}

// ---- shrubs and ferns ---------------------------------------------------------------------------------------------------------------
const BERRY = Object.freeze([0xc8383a, 0xf0e8f0, 0xe27a8e, 0x8a64c8, 0xf2c04a]);
const _shrubs = new Map();
export function shrubVariant(i) {
  if (_shrubs.has(i)) return _shrubs.get(i);
  const rng = mulberry32(0x73687200 + i);
  const parts = [];
  const n = 4 + Math.floor(rng() * 4) + (i % 4 === 3 ? 1 : 0); // four to eight lumps
  const tops = [];
  for (let k = 0; k < n; k++) {
    const a = rng() * 6.28; const d = (k === 0 ? 0 : 0.18 + rng() * 0.32);
    const r = 0.22 + rng() * 0.22; const y = 0.14 + rng() * 0.38;
    const x = Math.cos(a) * d; const z = Math.sin(a) * d;
    parts.push(lump(rng, x, y, z, r, r * (0.7 + rng() * 0.3), r, GREENS[Math.floor(rng() * 3)], rng() * 2 - 1, 0, rng() * 6.28));
    tops.push([x, y + r * 0.7, z]);
  }
  if (i % 3 !== 1) { // berries or small flowers, in one colour
    const hex = BERRY[i % BERRY.length];
    const m = 3 + Math.floor(rng() * 2);
    for (let k = 0; k < m; k++) { const t = tops[k % tops.length]; parts.push(paint(placed(new THREE.OctahedronGeometry(0.045, 0), t[0] + (rng() - 0.5) * 0.25, t[1] - 0.05 + rng() * 0.1, t[2] + (rng() - 0.5) * 0.25), hex, k * 0.5)); }
  }
  const g = mergeGeometries(parts);
  _shrubs.set(i, g);
  return g;
}
let _fern = null;
function fernGeo() {
  if (_fern) return _fern;
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.283;
    parts.push(paint(placed(new THREE.ConeGeometry(0.09, 0.6, 3, 1, true), Math.cos(a) * 0.14, 0.25, Math.sin(a) * 0.14, { yaw: -a + 1.57, pitch: 0.75 }), i % 2 ? L.leafLight : L.leaf, i % 3));
  }
  _fern = mergeGeometries(parts);
  return _fern;
}

// Where the shrubs and the low ferns stand: the same open spots scatterFerns picked (no new colliders).
export function shrubSpots() {
  const sp = P.scatterFerns();
  return sp.map((f, i) => ({ x: f.x, z: f.z, s: f.s, yaw: (i * 2.399) % 6.28, v: i % 8, fern: i % 3 === 2 }));
}
export function drawShrubs(kit, M) {
  for (const f of shrubSpots()) {
    if (f.fern) kit.put('leaves', M.leaves, stamp(fernGeo(), f.x, 0, f.z, { yaw: f.yaw, s: f.s * 1.3 }), { noCast: true });
    else kit.put('leaves', M.leaves, stamp(shrubVariant(f.v), f.x, 0, f.z, { yaw: f.yaw, s: f.s * 1.45, tone: 0.94 + ((f.yaw * 7) % 1) * 0.12 }), { noCast: true });
  }
}

// ---- the overhead canopy: three overlapping lumps for each clump of the plan ---------------------------------------------------------
// canopyLumps() -> [{ x, y, z, rx, ry, rz, hex, tone, tilt, yaw, droop }], a pure plan (the sun shafts look for the gaps between them). Every lump's underside is above CANOPY_MIN_Y.
export function canopyLumps() {
  const rng = mulberry32(0x63616e32); // 'can2'
  const out = [];
  const floorY = P.CANOPY_MIN_Y + 0.4;
  for (const c of P.scatterCanopy()) {
    const base = c.hue < 0.33 ? L.leafDark : c.hue < 0.7 ? L.leaf : L.leafLight;
    for (let k = 0; k < 3; k++) {
      const main = k === 0;
      const rx = c.s * (main ? 0.92 : 0.55 + rng() * 0.2); const ry = rx * (0.5 + rng() * 0.12);
      const a = rng() * 6.28; const d = main ? 0 : c.s * (0.45 + rng() * 0.25);
      const y = Math.max(c.y + (main ? 0 : (rng() - 0.3) * 0.5 * c.s), floorY + ry);
      const hex = main ? base : rng() < 0.16 ? AUTUMN[Math.floor(rng() * AUTUMN.length)] : GREENS[Math.floor(rng() * 3)];
      out.push({ x: c.x + Math.cos(a) * d, y, z: c.z + Math.sin(a) * d, rx, ry, rz: rx * (0.85 + rng() * 0.3), hex, tone: rng() * 2 - 1, tilt: (rng() - 0.5) * 0.4, yaw: rng() * 6.28, droop: rng() < 0.55 });
    }
  }
  return out;
}
export function drawCanopy(kit, M) {
  const rng = mulberry32(0x63616e33);
  for (const l of canopyLumps()) {
    kit.put('leaves', M.leaves, lump(rng, l.x, l.y, l.z, l.rx, l.ry, l.rz, l.hex, l.tone, l.tilt, l.yaw), { noCast: true });
    if (l.droop) kit.put('leaves', M.leaves, droop(l.x + l.rx * 0.55, l.y - l.ry * 0.45, l.z + l.rz * 0.3, 0.3, 0.55, L.leafDark), { noCast: true });
  }
}

// ---- the houses -------------------------------------------------------------------------------------------------------------------
const SHUTTER = Object.freeze({ bakery: 0xe9843a, books: 0x4a78d8, crown: 0x8a64c8 });
// Per-tile colour: each facet of an open frustum (6 vertices) gets its own tone.
function tiles(g, hex, rng, spread) {
  const n = g.attributes.position.count; const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 6) {
    _c.setHex(hex).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * spread);
    for (let j = 0; j < 6 && i + j < n; j++) { col[(i + j) * 3] = _c.r; col[(i + j) * 3 + 1] = _c.g; col[(i + j) * 3 + 2] = _c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// Roof rows over a cone (base radius R, height H, apex at yTop): `rows` stepped frusta, each row a little proud of the one above, a tone per tile.
function roofRows(kit, M, rng, x, z, yBase, R, H, sides, yaw, hex, rows, spread) {
  for (let i = 0; i < rows; i++) {
    const t0 = i / rows; const t1 = (i + 1) / rows;
    const rb = R * (1 - t0) + 0.07; const rt = R * (1 - t1) + 0.015;
    const g = new THREE.CylinderGeometry(rt, rb, (H / rows) * 1.02, sides, 1, true);
    placed(g, x, yBase + H * (t0 + t1) / 2, z, { yaw });
    const out = g.toNonIndexed(); g.dispose();
    out.computeVertexNormals();
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
    kit.put('paint', M.paint, tiles(out, hex, rng, spread));
  }
}
// A flat panel placed in a yawed frame: (lx, ly, lz) are metres right / up / out of its centre c.
function panel(kit, M, c, yaw, lx, ly, lz, w, h, d, hex, jitter = 0) {
  const cs = Math.cos(yaw); const sn = Math.sin(yaw);
  kit.put('paint', M.paint, slab(c.x + lx * cs + lz * sn, c.y + ly, c.z - lx * sn + lz * cs, w, h, d, hex, { yaw, jitter }));
}
function windowDress(kit, M, c, yaw, shutter) {
  panel(kit, M, c, yaw, 0, 0.34, 0.03, 0.8, 0.07, 0.1, L.trunkDark);
  panel(kit, M, c, yaw, 0, -0.34, 0.03, 0.8, 0.07, 0.1, L.trunkDark);
  panel(kit, M, c, yaw, 0.34, 0, 0.03, 0.07, 0.75, 0.1, L.trunkDark);
  panel(kit, M, c, yaw, -0.34, 0, 0.03, 0.07, 0.75, 0.1, L.trunkDark);
  panel(kit, M, c, yaw, 0, 0, 0.04, 0.04, 0.62, 0.07, L.trunkDark);
  panel(kit, M, c, yaw, 0, 0, 0.04, 0.62, 0.04, 0.07, L.trunkDark);
  panel(kit, M, c, yaw, 0, -0.41, 0.07, 0.9, 0.05, 0.16, L.plank);
  panel(kit, M, c, yaw, 0.58, 0, 0.04, 0.26, 0.74, 0.05, shutter, 1);
  panel(kit, M, c, yaw, -0.58, 0, 0.04, 0.26, 0.74, 0.05, shutter, -1);
}
function doorDress(kit, M, x, y, z, hw, hh, front) {
  const c = { x, y, z };
  panel(kit, M, c, 0, -hw - 0.05, 0, front, 0.1, hh + 0.1, 0.1, L.plank);
  panel(kit, M, c, 0, hw + 0.05, 0, front, 0.1, hh + 0.1, 0.1, L.plank);
  panel(kit, M, c, 0, 0, hh / 2 + 0.07, front, hw * 2 + 0.4, 0.12, 0.14, L.plank);
  panel(kit, M, c, 0, 0, -hh / 2 + 0.05, front + 0.14, hw * 2 + 0.35, 0.1, 0.3, 0x8a8a80); // the stone step
  kit.put('paint', M.paint, paint(placed(new THREE.OctahedronGeometry(0.045, 0), x + hw * 0.7, y, z + front + 0.06), L.bell));
}
function moss(kit, M, rng, x, y, z, r) {
  kit.put('leaves', M.leaves, lump(rng, x, y, z, r, r * 0.45, r, 0x6f9a44, rng()), { noCast: true });
}

export function drawHouses(kit, M) {
  const rng = mulberry32(0x686f7573); // 'hous'
  for (const k of P.DECKS) {
    const h = k.hut; if (!h) continue;
    const y = k.y;
    const hue = SHUTTER[k.id] ?? SHUTTER.books;
    if (h.roof === 'bell') {
      const hw = h.r * 0.95; const fz = h.z + hw;
      roofRows(kit, M, rng, h.x, h.z, y + h.h, h.r * 1.6, 1.8, 4, Math.PI / 4, L.shingle, 7, 0.16);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.put('paint', M.paint, slab(h.x + sx * hw, y + h.h / 2, h.z + sz * hw, 0.16, h.h + 0.04, 0.16, L.trunkDark, { jitter: 1 })); // corner posts
      kit.put('paint', M.paint, slab(h.x, y + h.h - 0.08, h.z, hw * 2 + 0.2, 0.14, hw * 2 + 0.2, L.trunkDark)); // the cornice
      kit.put('paint', M.paint, slab(h.x, y + 0.2, h.z, hw * 2 + 0.12, 0.42, hw * 2 + 0.12, 0x6b5a45, { jitter: 1 })); // the weathered base
      for (const u of [-0.25, 0.25, -0.65, 0.65]) { // plank lines: every face, the front keeping to the sides of its door and window
        for (const [fx, fz, ax] of [[0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1]]) {
          if (fz === 1 && Math.abs(u) < 0.5) continue;
          const off = u * hw;
          kit.put('paint', M.paint, slab(h.x + (ax ? fx * (hw + 0.01) : off), y + h.h / 2 + 0.2, h.z + (ax ? off : fz * (hw + 0.01)), ax ? 0.03 : 0.05, h.h - 0.5, ax ? 0.05 : 0.03, L.plankDark));
        }
      }
      doorDress(kit, M, h.x, y + 0.9, fz + 0.01, 0.45, 1.8, 0.03);
      windowDress(kit, M, { x: h.x, y: y + h.h * 0.62, z: fz + 0.02 }, 0, hue);
      moss(kit, M, rng, h.x - hw, y + 0.4, h.z + hw, 0.34); moss(kit, M, rng, h.x + hw, y + 0.45, h.z - hw, 0.3);
      moss(kit, M, rng, h.x + hw * 0.6, y + h.h + 0.15, h.z + hw + 0.1, 0.28);
      continue;
    }
    const R = h.r + 0.45;
    roofRows(kit, M, rng, h.x, h.z, y + h.h, R, 1.5, 12, 0, h.roof === 'thatch' ? L.thatch : L.shingle, h.roof === 'thatch' ? 5 : 6, h.roof === 'thatch' ? 0.2 : 0.18);
    kit.put('paint', M.paint, post(h.x, h.z, y, y + 0.45, h.r + 0.05, h.r + 0.08, 0x6b5a45, 12, 1)); // the weathered base
    kit.put('paint', M.paint, post(h.x, h.z, y + h.h - 0.14, y + h.h, h.r + 0.06, h.r + 0.06, L.trunkDark, 12)); // the eave band
    for (let i = 0; i < 12; i++) { // corner posts at the facet corners; plank lines at the facets' middles (a gap where the door and the window face)
      const a = (i / 12) * 6.283;
      for (const [aa, r, w, hex] of [[a, h.r + 0.015, 0.07, L.trunkDark], [a + 0.2618, h.r * 0.966 + 0.01, 0.025, L.plankDark]]) {
        const d = Math.min(Math.abs(Math.atan2(Math.sin(aa - 0.2), Math.cos(aa - 0.2))), Math.abs(Math.atan2(Math.sin(aa + 0.59), Math.cos(aa + 0.59))));
        if (d < 0.32 || (w < 0.05 && i % 2)) continue;
        kit.put('paint', M.paint, post(h.x + Math.sin(aa) * r, h.z + Math.cos(aa) * r, y + 0.4, y + h.h - 0.14, w, w, hex, 4));
      }
    }
    doorDress(kit, M, h.x + h.r * 0.2, y + 0.85, h.z + h.r - 0.02, 0.4, 1.7, 0.03);
    windowDress(kit, M, { x: h.x - h.r * 0.55, y: y + h.h * 0.62, z: h.z + h.r * 0.82 }, -0.5, hue);
    for (let i = 0; i < 3; i++) { const a = 1.2 + i * 2.1; moss(kit, M, rng, h.x + Math.sin(a) * (h.r + 0.1), y + 0.3 + (i % 2) * 0.1, h.z + Math.cos(a) * (h.r + 0.1), 0.3); }
    moss(kit, M, rng, h.x + R * 0.55, y + h.h + 0.45, h.z + R * 0.5, 0.3);
  }
}

export function drawNature(kit, M) {
  drawTrees(kit, M);
  drawShrubs(kit, M);
  drawCanopy(kit, M);
  drawHouses(kit, M);
}
