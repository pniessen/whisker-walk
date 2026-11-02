import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, seedFromCode } from '../rng.js';

// =============================================================================
// THE OLD DOCKS' DRESSING (polish-docks). What turns a grey cobbled plain into
// a busy, friendly harbour: crates stacked against the warehouse gables,
// painted barrels, nets heaped with orange floats, coils of rope and lobster
// pots — along the map edges, against the warehouse gables and out in the open
// cobble yards — plus gulls on the bollards and coloured boats moored in the
// canal. Scenery only, all of it static — and three rules keep it so.
//
// 1. DETERMINISM. THREE's generateUUID takes four Math.random() draws for
//    every Object3D, geometry and material, and test/flattrace.test.js seeds
//    Math.random before each area build, so one extra object here would move
//    every critter after it (test/waterlooks.test.js pins the Docks at 6916
//    draws). Everything this module makes is made inside withLocalUuids, while
//    Math.random is a local stream seeded from DRESSING_SEED: the uuids are the
//    same on every device and the build's draws are what they were. That is
//    also why nothing at module level is a THREE object, and why the dressing
//    never touches builder.js or litMaterial: both cache geometries and
//    materials across areas, and a cache entry first made on the local stream
//    would change the NEXT area's draws. Placement variation comes from
//    hash01, never Math.random.
//
// 2. NO RECORD. dressDocks adds no collider, perch, POI or anything else to
//    the area. In bounds, a cluster either sits inside a collider the area
//    already has (the strip a warehouse's two circles reach past its gable
//    wall) or stands a metre clear of every gameplay point and off every path —
//    test/docksdressing.test.js walks itemsOf() against all of it.
//
// 3. CHEAP. Three meshes: every prop merged into one vertex-coloured mesh (it
//    spans the whole map, so contactshadows' per-child scan gives it no decal),
//    one flat mesh of soft dark blobs under the clusters and one flat mesh of
//    puddle glints and wet patches (both flatter than 0.1 m, so no decal
//    either). None casts: userData.noCast keeps render/rig.js's caster sweep
//    from turning it back on. The warmer stone (warmStone) rescales the
//    ground's own vertex colours and makes nothing at all.
// =============================================================================

export const DRESSING_SEED = 'docks-dressing';

// Math.random := a local stream seeded by `name` for the duration of fn — see
// rule 1 above, and the same helper in world/camp.js.
export function withLocalUuids(name, fn) {
  const real = Math.random;
  Math.random = mulberry32(seedFromCode(name));
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

// builder.js's private hash01, copied: a pure function of its arguments.
export function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

// The footprint radius of each kind at s = 1. Every part a kind builds stays
// inside it (the slot offsets below are sized against it), so itemsOf() is a
// true bound of what stands on the ground.
const RADIUS = Object.freeze({ crates: 1.0, barrels: 1.08, net: 1.25, rope: 0.8, pots: 0.9 });

// Hand-placed. Twenty-two stand outside the 76 x 80 bounds: along the south
// edge behind the spawn, past both ends of both quays, and along the north
// edge behind the warehouses. Five sit in the strip a warehouse's collider
// circles reach past its gable wall. The last seventeen stand free in the open
// cobble yards — the two south-bank yards either side of the spawn road, the
// east and west ends beyond the quays, and the north strip between the
// warehouses — each a metre clear of every gameplay point and off every path
// (test/docksdressing.test.js walks them), so a cat walks round them, not
// through anything it needs.
export const CLUSTERS = Object.freeze([
  // south edge
  { x: -34, z: -43.5, rot: 0.3, kind: 'crates', s: 1.15 },
  { x: -24, z: -42.2, rot: 1.1, kind: 'barrels', s: 1.1 },
  { x: -14, z: -44, rot: -0.4, kind: 'net', s: 1.2 },
  { x: -5, z: -42.5, rot: 0.8, kind: 'pots', s: 1.1 },
  { x: 6, z: -43, rot: -0.7, kind: 'crates', s: 1.2 },
  { x: 16, z: -42.4, rot: 0.2, kind: 'rope', s: 1.2 },
  { x: 25, z: -44, rot: 2.1, kind: 'barrels', s: 1.15 },
  { x: 34, z: -42.6, rot: -1.2, kind: 'net', s: 1.1 },
  // east edge, both quays and beyond
  { x: 40.5, z: 6.8, rot: 1.6, kind: 'crates', s: 1.1 },
  { x: 41, z: -7, rot: 0.5, kind: 'net', s: 1.15 },
  { x: 40, z: 18, rot: -0.9, kind: 'barrels', s: 1.1 },
  { x: 42, z: -20, rot: 2.6, kind: 'pots', s: 1.15 },
  { x: 40.5, z: 30, rot: 0.1, kind: 'crates', s: 1.2 },
  // west edge
  { x: -40.5, z: 7, rot: -1.4, kind: 'net', s: 1.1 },
  { x: -41, z: -6.5, rot: 0.9, kind: 'crates', s: 1.15 },
  { x: -40, z: -22, rot: -0.3, kind: 'barrels', s: 1.1 },
  { x: -42, z: 18, rot: 1.9, kind: 'rope', s: 1.2 },
  { x: -40.5, z: 32, rot: -2.2, kind: 'pots', s: 1.1 },
  // north edge
  { x: -25, z: 42, rot: 0.6, kind: 'crates', s: 1.15 },
  { x: -8, z: 43, rot: -0.8, kind: 'barrels', s: 1.1 },
  { x: 8, z: 41.8, rot: 1.3, kind: 'net', s: 1.1 },
  { x: 28, z: 42.5, rot: -0.2, kind: 'pots', s: 1.15 },
  // in bounds, inside a warehouse collider past its gable wall
  { x: 14.1, z: 16.5, rot: 0.1, kind: 'crates', s: 0.75 },   // W1, west gable
  { x: 25.9, z: 15, rot: -0.3, kind: 'barrels', s: 0.8 },    // W1, east gable
  { x: 5.9, z: 32.5, rot: 0.4, kind: 'pots', s: 0.6 },       // W4, west gable
  { x: 18.25, z: 32.4, rot: 0.9, kind: 'rope', s: 0.75 },     // W4, east gable
  { x: -31.4, z: 16, rot: -0.2, kind: 'crates', s: 0.75 },   // W3, west gable
  // in bounds, free-standing in the open yards
  { x: 7.5, z: -35, rot: 0.5, kind: 'crates', s: 1.0 },      // south-east yard, by the spawn road
  { x: 15.5, z: -33.5, rot: -0.6, kind: 'barrels', s: 1.0 },
  { x: 22, z: -37, rot: 1.2, kind: 'net', s: 1.0 },
  { x: 33, z: -36.5, rot: -0.3, kind: 'pots', s: 1.1 },
  { x: 17, z: -25, rot: 0.9, kind: 'barrels', s: 1.05 },
  { x: 35, z: -23.5, rot: -1.1, kind: 'crates', s: 1.0 },
  { x: 35.5, z: -18, rot: 0.4, kind: 'pots', s: 1.0 },
  { x: -34, z: -36, rot: -0.4, kind: 'crates', s: 1.05 },    // south-west yard
  { x: -25.5, z: -35, rot: 0.7, kind: 'barrels', s: 1.0 },
  { x: -20, z: -28, rot: -0.9, kind: 'net', s: 1.0 },
  { x: -10, z: -23.5, rot: 0.2, kind: 'crates', s: 1.0 },
  { x: -35, z: 22, rot: 1.4, kind: 'crates', s: 1.0 },       // west end, beyond the quay
  { x: 35, z: 14, rot: -0.5, kind: 'crates', s: 1.05 },      // east end, beyond the quay
  { x: 35.5, z: 30, rot: 0.3, kind: 'barrels', s: 1.0 },
  { x: -22, z: 37, rot: -0.2, kind: 'barrels', s: 1.05 },    // north strip
  { x: -10, z: 36, rot: 0.6, kind: 'crates', s: 1.1 },
  { x: 24, z: 37.5, rot: -0.8, kind: 'net', s: 1.0 },
].map((c) => Object.freeze(c)));

const radiusOf = (c) => RADIUS[c.kind] * (c.s ?? 1);

// ---- gulls and boats -----------------------------------------------------------
// Static, all of them (ruling R1): no bob, no per-frame hook.

// The boats: rowing and fishing boats moored along both banks in the free
// stretches of canal — between the east barge and the quay's end, west of the
// plank bridge, in the short gap between it and the west barge, and past the
// bounds at both ends. Length runs along the boat's local +x (bow first), so
// `rot` is a plain yaw. A hull is `len` long and BEAM across.
const BEAM = 1.3;
export const BOATS = Object.freeze([
  { x: 25, z: 2.5, rot: 0.03, hull: 0xc8483a, len: 4.0 },
  { x: 31.5, z: -2.5, rot: Math.PI - 0.03, hull: 0xe8c040, len: 3.6 },
  { x: 35.2, z: 2.5, rot: 0.02, hull: 0x3a8a8a, len: 3.2 },
  { x: -30.5, z: 2.5, rot: 0.02, hull: 0xf0ece0, len: 4.2, trim: 0x3a6ab0 },
  { x: -20.7, z: -2.5, rot: Math.PI, hull: 0x4a7ac0, len: 3.0 },
  { x: 41.5, z: 2.45, rot: -0.05, hull: 0x4a7ac0, len: 3.8 },
  { x: -41, z: -2.5, rot: Math.PI + 0.04, hull: 0xc8483a, len: 3.4 },
].map((b) => Object.freeze(b)));

// The hull's shape, shared by the geometry and the bow gull's spot: t runs
// 0 (stern) to 1 (bow). The sheer rises toward the bow.
const HULL_TOP = 0.3, HULL_KEEL = -0.18, BOAT_Y = 0.05, FOREDECK_T = 0.8;
const hullTop = (t) => HULL_TOP + 0.12 * t * t;

// Where a gull stands on a boat's foredeck, in the world.
function onBow(b) {
  const along = b.len * (0.86 - 0.5);
  return { x: b.x + along * Math.cos(b.rot), z: b.z - along * Math.sin(b.rot), y: BOAT_Y + hullTop(FOREDECK_T) + 0.01 };
}

// Gulls: five on the bollards no perch or prop already uses, one on each
// barge's cabin roof (b.barge at x ±14 turned a quarter: the cabin spans
// x bx-3.7..bx-0.7, roof y 1.75, stack at bx-2.8), and one on the red boat's
// bow. A bollard's cap tops out at y 0.73.
export const GULL_SPOTS = Object.freeze([
  { x: -30, z: 4.2, y: 0.72, rot: 2.6 },
  { x: 18, z: 4.2, y: 0.72, rot: -0.7 },
  { x: -18, z: -4.2, y: 0.72, rot: 0.4 },
  { x: 6, z: -4.2, y: 0.72, rot: -2.2 },
  { x: 30, z: -4.2, y: 0.72, rot: 1.3 },
  { x: 12.6, z: 0.5, y: 1.75, rot: 1.9 },
  { x: -15.4, z: -0.45, y: 1.75, rot: -1.0 },
  { ...onBow(BOATS[0]), rot: 1.5 },
].map((g) => Object.freeze(g)));

// The decorative wet patches (polish-docks Task 3): darker blue-grey stone a
// shower left behind, each with its own sky streaks, out in open cobble —
// off every path and a metre clear of every gameplay point, like the yard
// clusters (the keep-out case walks them as items of kind 'glint'). The four
// authored puddles in docks.js get streaks too, but no record here: they are
// the area's own.
export const GLINT_PUDDLES = Object.freeze([
  { x: -12, z: -30, r: 0.9 },
  { x: 12, z: -30, r: 0.8 },
  { x: 32, z: -28, r: 0.85 },
  { x: -30, z: -20, r: 0.9 },
  { x: -10, z: 14, r: 0.8 },
  { x: 4, z: 20, r: 0.9 },
  { x: -25, z: 28, r: 0.85 },
  { x: 30, z: 26, r: 0.8 },
].map((p) => Object.freeze(p)));

// Every placed dressing item's ground footprint. Later dressing kinds append
// their own items here so the keep-out test sees all of them.
export function itemsOf() {
  return [
    ...CLUSTERS.map((c) => ({ x: c.x, z: c.z, r: radiusOf(c), what: c.kind })),
    ...GULL_SPOTS.map((g) => ({ x: g.x, z: g.z, y: g.y, r: 0.25, what: 'gull' })),
    ...BOATS.map((b) => ({ x: b.x, z: b.z, r: Math.hypot(b.len / 2, BEAM / 2), what: 'boat' })),
    ...GLINT_PUDDLES.map((p) => ({ x: p.x, z: p.z, r: p.r, what: 'glint' })),
  ];
}

// ---- helpers ---------------------------------------------------------------

// A per-vertex `color` for geo (made non-indexed first, so every triangle owns
// its three vertices). `jitter` shades each triangle by up to ±jitter, from
// hash01, so a heap of one colour still reads as many pieces.
export function paint(geo, hex, jitter = 0) {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const _c = new THREE.Color(hex);
  for (let v = 0; v < n; v += 3) {
    const f = jitter ? 1 + jitter * (2 * hash01(v, n, 3.7) - 1) : 1;
    for (let k = 0; k < 3 && v + k < n; k++) {
      col[(v + k) * 3] = _c.r * f;
      col[(v + k) * 3 + 1] = _c.g * f;
      col[(v + k) * 3 + 2] = _c.b * f;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// One geometry out of many painted parts (all non-indexed, all with the same
// attributes). The parts are disposed.
export function mergeParts(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function dressingMaterial({ roughness, metalness = 0, emissive } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: roughness ?? 0.85, metalness });
  if (emissive !== undefined) m.emissive.set(emissive);
  return m;
}

const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const place = (geo, x, y, z, yaw = 0) => {
  geo.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
  return geo;
};

// ---- the kinds -------------------------------------------------------------
// Each builds its parts in the cluster's own frame (centre at the origin,
// ground at y 0, s = 1) and stays inside RADIUS[kind]. `h(k)` is the cluster's
// own hash stream.

function crate(parts, w, x, y, z, yaw, tone) {
  const timber = lerpHex(0xb08a5a, 0x9a7448, tone);
  const dark = lerpHex(timber, 0x3a2a1a, 0.45);
  parts.push(place(paint(new THREE.BoxGeometry(w, w, w), timber, 0.05), x, y + w / 2, z, yaw));
  // the lid band, and two battens round the sides
  parts.push(place(paint(new THREE.BoxGeometry(w + 0.03, 0.07, w + 0.03), dark), x, y + w - 0.06, z, yaw));
  parts.push(place(paint(new THREE.BoxGeometry(0.08, w * 0.9, w + 0.025), dark), x, y + w * 0.45, z, yaw));
  parts.push(place(paint(new THREE.BoxGeometry(w + 0.025, w * 0.9, 0.08), dark), x, y + w * 0.45, z, yaw));
}

// A stack two or three crates high, the bottom pair often on a pallet, and
// a lone crate in front. Every corner stays inside RADIUS.crates (the test
// measures it): the widest reach is the pallet's corner and the front crate's.
function crates(parts, h) {
  const pallet = h(13) > 0.45;
  const y0 = pallet ? 0.14 : 0;
  if (pallet) {
    const wood = lerpHex(0xa88a62, 0x8a6e4e, h(16));
    parts.push(place(paint(new THREE.BoxGeometry(1.5, 0.04, 0.95), wood, 0.06), 0, 0.12, -0.15));
    for (const rx of [-0.68, 0, 0.68]) {
      parts.push(place(paint(new THREE.BoxGeometry(0.1, 0.1, 0.95), lerpHex(wood, 0x3a2a1a, 0.3)), rx, 0.05, -0.15));
    }
  }
  const jit = (k) => (h(k) - 0.5) * 0.16;
  const a = 0.66 + h(2) * 0.08;
  crate(parts, a, -0.38, y0, -0.15, jit(3), h(4));
  const b = 0.6 + h(5) * 0.08;
  crate(parts, b, 0.38, y0, -0.15, jit(6), h(7));
  // second tier: always on the left one, often on the right
  const d = 0.6 + h(8) * 0.08;
  crate(parts, d, -0.38 + jit(17) * 0.3, y0 + a, -0.15, jit(9), h(10));
  if (h(14) > 0.4) crate(parts, 0.54, 0.38, y0 + b, -0.15, jit(18), h(19));
  // third tier, a smaller one on top
  if (h(15) > 0.35) crate(parts, 0.48, -0.38, y0 + a + d, -0.15, jit(21), h(22));
  // a lone crate on the cobbles in front
  if (h(1) > 0.3) crate(parts, 0.5, 0.1, 0, 0.6, jit(11), h(12));
}

const BARREL_PAINT = [0xb0503e, 0x3e6a8a, 0x4e7a52];

function barrel(parts, x, y, z, hex) {
  const body = paint(new THREE.CylinderGeometry(0.29, 0.29, 0.86, 9, 1), hex, 0.04);
  const bands = [0.25, -0.25].map((by) => paint(new THREE.CylinderGeometry(0.305, 0.305, 0.06, 9, 1, true), 0x3a3430)
    .translate(0, by, 0));
  for (const g of [body, ...bands]) parts.push(g.translate(x, y + 0.43, z));
}

// A barrel group of three to five, in the cluster's own frame at s = 1: a
// triangle of three standing drums 0.66 apart (a drum is 0.61 across at its
// bands), a fourth beside them, and with four or five a drum standing on top
// of the triangle. Exported so the test can check no two drums overlap.
const DRUM_R = 0.305;
export function barrelsOf(c) {
  const h = (k) => hash01(c.x, c.z, k);
  const n = 3 + Math.floor(h(1) * 3);
  const first = Math.floor(h(2) * 3);
  const ground = [[-0.33, -0.19], [0.33, -0.19], [0, 0.38]];
  if (n === 5) ground.push([-0.66, 0.38]);
  const drums = ground.map(([x, z], i) => ({ x, z, y: 0, r: DRUM_R, hex: BARREL_PAINT[(first + i) % 3] }));
  if (n >= 4) drums.push({ x: 0, z: 0, y: 0.86, r: DRUM_R, hex: BARREL_PAINT[(first + 1) % 3] });
  return drums;
}

function barrels(parts, h, c) {
  for (const d of barrelsOf(c)) barrel(parts, d.x, d.y, d.z, d.hex);
}

function net(parts, h) {
  // a heap: the top half of an ellipsoid, a = 1.2 across, b = 0.6 high,
  // c = 0.95 deep, its height made lumpy (by position, so the seams of the
  // sphere stay closed), with a second, taller lump slumped against it.
  // Net green, darker than any grass, so it never reads as a bush or a pond.
  const A = 1.2, B = 0.6, C = 0.95;
  const lumpy = (g, sx, sy, sz, x, z) => {
    g.scale(sx, sy, sz);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 0.82 + 0.36 * hash01(Math.round(p.getX(i) * 100), Math.round(p.getZ(i) * 100), 5 + h(1));
      p.setY(i, p.getY(i) * f);
    }
    return g.translate(x, 0, z);
  };
  const half = () => new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(paint(lumpy(half(), A, B, C, 0, 0), 0x2f5446, 0.16));
  parts.push(paint(lumpy(half(), 0.6, 0.78, 0.55, -0.4, 0.25), 0x34584a, 0.16));
  // a cord of floats draped over it, spread round the heap
  for (let i = 0; i < 5; i++) {
    const ang = h(2) * Math.PI * 2 + i * 1.25 + (h(3 + i) - 0.5) * 0.4;
    const rr = 0.4 + h(8 + i) * 0.4;
    const fx = Math.cos(ang) * rr * A, fz = Math.sin(ang) * rr * C;
    const fy = B * Math.sqrt(Math.max(0, 1 - (fx / A) ** 2 - (fz / C) ** 2));
    parts.push(paint(new THREE.SphereGeometry(0.12, 6, 4), 0xe0803a, 0.05).translate(fx, fy + 0.06, fz));
  }
}

function rope(parts, h) {
  const coil = (R, t, x, y, z) => parts.push(place(
    paint(new THREE.TorusGeometry(R, t, 5, 12).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0xc8b088, 0.08),
    x, y + t * 0.55, z, h(9) * Math.PI));
  coil(0.3, 0.085, -0.2, 0, 0);
  coil(0.22, 0.075, -0.2, 0.09, 0);
  coil(0.2, 0.07, 0.38, 0, 0.25);
}

function pot(parts, x, y, z, yaw, tone) {
  const wood = lerpHex(0xa88058, 0x8a6a4a, tone);
  const mesh = 0x46503f;
  parts.push(place(paint(new THREE.BoxGeometry(0.62, 0.05, 0.42), wood), x, y + 0.025, z, yaw));
  parts.push(place(paint(new THREE.BoxGeometry(0.58, 0.17, 0.38), mesh, 0.08), x, y + 0.13, z, yaw));
  for (const [px, pz] of [[-0.29, -0.19], [0.29, -0.19], [-0.29, 0.19], [0.29, 0.19]]) {
    const post = new THREE.BoxGeometry(0.045, 0.17, 0.045).translate(px, 0, pz);
    parts.push(place(paint(post, wood), x, y + 0.13, z, yaw));
  }
  // the arched, slatted top: a half-cylinder of netting under three hoops
  const arch = new THREE.CylinderGeometry(0.19, 0.19, 0.58, 7, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  parts.push(place(paint(arch, mesh, 0.08), x, y + 0.215, z, yaw));
  for (const sx of [-0.26, 0, 0.26]) {
    const hoop = new THREE.TorusGeometry(0.2, 0.022, 3, 5, Math.PI).rotateY(Math.PI / 2).translate(sx, 0, 0);
    parts.push(place(paint(hoop, wood), x, y + 0.215, z, yaw));
  }
}

function pots(parts, h) {
  pot(parts, -0.3, 0, 0.1, (h(1) - 0.5) * 0.4, h(2));
  pot(parts, 0.38, 0, -0.15, (h(3) - 0.5) * 0.4, h(4));
  if (h(5) > 0.35) pot(parts, -0.28, 0.4, 0.08, (h(6) - 0.5) * 0.6, h(7));
  parts.push(paint(new THREE.SphereGeometry(0.13, 8, 6), 0xe0803a, 0.05).translate(0.1, 0.13, 0.55));
}

const KINDS = { crates, barrels, net, rope, pots };

// ---- the blobs --------------------------------------------------------------
// A soft dark disc under each cluster: alpha 0.4 at the centre to 0 at the rim.

function blob(x, z, r) {
  const g = new THREE.CircleGeometry(r, 12).rotateX(-Math.PI / 2);
  const flat = g.toNonIndexed();
  g.dispose();
  const pos = flat.attributes.position;
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i));
    col[i * 4 + 3] = 0.4 * Math.max(0, 1 - d / r);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(col, 4));
  flat.deleteAttribute('uv');
  flat.deleteAttribute('normal');
  return flat.translate(x, 0.012, z);
}

// ---- gull and boat geometry ----------------------------------------------------

// A herring gull standing, about 0.36 tall, facing local +z, feet at the
// origin: white body and head, pale grey folded wings, dark wingtips crossed
// over the tail, a yellow beak and yellow legs. ~130 triangles.
function gullParts(g) {
  const p = [];
  for (const lx of [-0.035, 0.035]) {
    p.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 3, 1, true), 0xe0a848).translate(lx, 0.05, 0));
  }
  p.push(paint(new THREE.SphereGeometry(1, 6, 4), 0xf4f4f0, 0.03).scale(0.085, 0.085, 0.2).translate(0, 0.17, -0.01));
  for (const sx of [-1, 1]) {
    // a folded wing along the back, and its dark tip crossing over the tail
    p.push(paint(new THREE.SphereGeometry(1, 6, 3), 0xb8c0c8, 0.03)
      .scale(0.035, 0.06, 0.17).rotateZ(sx * 0.2).translate(sx * 0.066, 0.2, -0.05));
    p.push(paint(new THREE.ConeGeometry(0.035, 0.15, 4), 0x2a2a30)
      .rotateX(-Math.PI / 2 - 0.15).translate(sx * 0.03, 0.215, -0.24));
  }
  p.push(paint(new THREE.SphereGeometry(0.065, 6, 4), 0xf4f4f0).translate(0, 0.29, 0.15));
  p.push(paint(new THREE.ConeGeometry(0.018, 0.08, 4), 0xf0c040).rotateX(Math.PI / 2).translate(0, 0.28, 0.24));
  const m = new THREE.Matrix4().makeRotationY(g.rot).setPosition(g.x, g.y, g.z);
  for (const geo of p) geo.applyMatrix4(m);
  return p;
}

// Triangles out of [x, y, z] points, each turned to face `out` (so a hull
// built by hand needs no winding bookkeeping), painted `hex`.
function facing(tris, hex, jitter = 0) {
  const pos = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const [p0, p1, p2, out] of tris) {
    a.fromArray(p0); b.fromArray(p1); c.fromArray(p2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) pos.push(...p0, ...p2, ...p1);
    else pos.push(...p0, ...p1, ...p2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return paint(g, hex, jitter);
}

// A quad (corners in order round its edge) as two triangles facing `out`.
const quad = (list, p, q, r, s, out) => { list.push([p, q, r, out], [p, r, s, out]); };

// A rowing / fishing boat: a lofted hull (seven stations, pointed bow,
// square transom) in its colour with a trim band along the gunwale, timber
// inside, a floor, two thwarts and a little foredeck a gull can stand on.
function boatParts(b) {
  const L = b.len, B2 = BEAM / 2;
  const T = [0, 0.2, 0.4, 0.6, 0.8, 0.92, 1];
  const hw = (t) => B2 * (t < 0.35 ? 0.78 + 0.22 * Math.sin((t / 0.35) * Math.PI / 2) : Math.cos(((t - 0.35) / 0.65) * Math.PI / 2));
  const st = T.map((t) => {
    const u = -L / 2 + t * L, w = hw(t), top = hullTop(t), keel = HULL_KEEL + 0.1 * t;
    return { u, w, top, mid: top - 0.1, keel, bw: w * 0.55 };
  });
  const outer = [], trim = [], inner = [], floor = [], fore = [];
  const P = (u, y, z) => [u, y, z];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], c = st[i + 1];
    for (const sd of [1, -1]) {
      quad(trim, P(a.u, a.top, sd * a.w), P(c.u, c.top, sd * c.w), P(c.u, c.mid, sd * c.w * 0.97), P(a.u, a.mid, sd * a.w * 0.97), [0, 0, sd]);
      quad(outer, P(a.u, a.mid, sd * a.w * 0.97), P(c.u, c.mid, sd * c.w * 0.97), P(c.u, c.keel, sd * c.bw), P(a.u, a.keel, sd * a.bw), [0, 0, sd]);
      quad(inner, P(a.u, a.top, sd * a.w), P(c.u, c.top, sd * c.w), P(c.u, c.keel, sd * c.bw), P(a.u, a.keel, sd * a.bw), [0, 0, -sd]);
    }
    quad(outer, P(a.u, a.keel, a.bw), P(c.u, c.keel, c.bw), P(c.u, c.keel, -c.bw), P(a.u, a.keel, -a.bw), [0, -1, 0]);
    const fy = 0.02;
    const fw = (s) => (s.w * 0.55 + s.bw * 0.45) * 0.9;
    if (T[i] < FOREDECK_T) quad(floor, P(a.u, fy, fw(a)), P(c.u, fy, fw(c)), P(c.u, fy, -fw(c)), P(a.u, fy, -fw(a)), [0, 1, 0]);
    if (T[i] >= FOREDECK_T) {
      const y = hullTop(FOREDECK_T);
      quad(fore, P(a.u, y, a.w), P(c.u, y, c.w), P(c.u, y, -c.w), P(a.u, y, -a.w), [0, 1, 0]);
    }
  }
  // the transom, out and in
  const s0 = st[0];
  quad(trim, P(s0.u, s0.top, s0.w), P(s0.u, s0.mid, s0.w * 0.97), P(s0.u, s0.mid, -s0.w * 0.97), P(s0.u, s0.top, -s0.w), [-1, 0, 0]);
  quad(outer, P(s0.u, s0.mid, s0.w * 0.97), P(s0.u, s0.keel, s0.bw), P(s0.u, s0.keel, -s0.bw), P(s0.u, s0.mid, -s0.w * 0.97), [-1, 0, 0]);
  quad(inner, P(s0.u, s0.top, s0.w), P(s0.u, s0.keel, s0.bw), P(s0.u, s0.keel, -s0.bw), P(s0.u, s0.top, -s0.w), [1, 0, 0]);

  const timber = 0xa07a52;
  const trimHex = b.trim ?? (b.hull === 0xf0ece0 ? 0x3a6ab0 : 0xf0ece0);
  const parts = [
    facing(outer, b.hull, 0.04), facing(trim, trimHex, 0.03),
    facing(inner, lerpHex(timber, 0x3a2a1a, 0.35), 0.05), facing(floor, timber, 0.06), facing(fore, timber, 0.05),
  ];
  // two thwarts across the beam: amidships, and a stern seat
  for (const t of [0.5, 0.12]) {
    const u = -L / 2 + t * L, w = hw(t) * 1.9;
    parts.push(paint(new THREE.BoxGeometry(0.22, 0.05, w), lerpHex(timber, 0xffffff, 0.12), 0.04).translate(u, hullTop(t) - 0.08, 0));
  }
  const m = new THREE.Matrix4().makeRotationY(b.rot).setPosition(b.x, BOAT_Y, b.z);
  for (const g of parts) g.applyMatrix4(m);
  return parts;
}

// ---- the build ---------------------------------------------------------------

// ---- the stone and the glints ------------------------------------------------

// Smooth value noise in [0, 1] on a `cell`-metre lattice, from hash01 alone.
function valueNoise(x, z, cell, salt) {
  const gx = x / cell, gz = z / cell;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash01(ix, iz, salt), b = hash01(ix + 1, iz, salt);
  const c = hash01(ix, iz + 1, salt), d = hash01(ix + 1, iz + 1, salt);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
}

const SANDSTONE = [1.08, 1.02, 0.94];
const SLATE = [0.94, 0.96, 1.02];

// Gentle warm and cool patches over the quay: the ground's own per-vertex
// `color` (builder.js's macro streaks) is multiplied by a blend between a
// sandstone and a slate tint, from a 9–16 m value-noise field of the vertex's
// world (x, z). Rescales the attribute in place and creates nothing; a pure
// function of position. Marked, so a second call never doubles it.
export function warmStone(ground) {
  const col = ground?.geometry?.attributes?.color;
  if (!col || ground.userData.warmStone) return;
  ground.userData.warmStone = true;
  ground.updateMatrix();
  const pos = ground.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(ground.matrix);
    const f = 0.6 * valueNoise(v.x, v.z, 16, 11.3) + 0.4 * valueNoise(v.x, v.z, 9, 23.9);
    const t = Math.min(1, Math.max(0, (f - 0.5) * 2.2 + 0.5));
    for (let k = 0; k < 3; k++) {
      col.setComponent(i, k, col.getComponent(i, k) * (SLATE[k] + (SANDSTONE[k] - SLATE[k]) * t));
    }
  }
  col.needsUpdate = true;
}

const GLINT_Y = 0.026, PATCH_Y = 0.018;
const PATCH_HEX = 0x3e4a58;
const STREAK_HEX = [0x9cb0c4, 0xaabdd0, 0x90a6bc];

// Flat triangles facing up, straight into position/color lists.
function flatTri(out, a, b, c, y, hex) {
  const col = new THREE.Color(hex);
  for (const [x, z] of [a, b, c]) {
    out.pos.push(x, y, z);
    out.col.push(col.r, col.g, col.b);
  }
}

// 2–4 thin tapered slivers of sky across a puddle of radius r, all near one
// heading (a reflection streaks one way), every point within 0.75 r of the
// centre.
function streaks(out, p, salt) {
  const h = (k) => hash01(p.x, p.z, salt + k);
  const n = 2 + Math.floor(h(0) * 3);
  const heading = h(1) * Math.PI;
  for (let i = 0; i < n; i++) {
    const yaw = heading + (h(10 + i) - 0.5) * 0.3;
    const ux = Math.cos(yaw), uz = Math.sin(yaw);
    const half = p.r * (0.3 + 0.2 * h(20 + i));             // ≤ 0.5 r
    const across = (i - (n - 1) / 2) * p.r * 0.12 + (h(30 + i) - 0.5) * p.r * 0.06;
    const along = (h(40 + i) - 0.5) * p.r * 0.1;
    // centre ≤ 0.23 r from the puddle's, so a tip stays inside 0.75 r
    const cx = p.x + ux * along - uz * across, cz = p.z + uz * along + ux * across;
    const w = 0.015 + 0.015 * h(50 + i);
    const tipA = [cx + ux * half, cz + uz * half], tipB = [cx - ux * half, cz - uz * half];
    const sideA = [cx - uz * w, cz + ux * w], sideB = [cx + uz * w, cz - ux * w];
    const hex = STREAK_HEX[Math.floor(h(60 + i) * STREAK_HEX.length) % STREAK_HEX.length];
    flatTri(out, tipA, sideB, tipB, GLINT_Y, hex);
    flatTri(out, tipA, tipB, sideA, GLINT_Y, hex);
  }
}

// An irregular 10-gon of wet stone, rim at 0.75–1.0 r.
function wetPatch(out, p) {
  const rim = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = p.r * (0.75 + 0.25 * hash01(p.x, p.z, 70 + i));
    rim.push([p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr]);
  }
  for (let i = 0; i < 10; i++) flatTri(out, [p.x, p.z], rim[(i + 1) % 10], rim[i], PATCH_Y, PATCH_HEX);
}

// One flat mesh: streaks over every authored puddle and the GLINT_PUDDLES
// patches with their own. Not ground, not 'path' (weather.js's rain swap never
// takes it), never in the shadow pass, and only a faint emissive so it still
// reads on a grey rainy screen without glowing at dusk.
function glintMesh(puddles) {
  const out = { pos: [], col: [] };
  for (const p of puddles) streaks(out, p, 101);
  for (const p of GLINT_PUDDLES) {
    wetPatch(out, p);
    streaks(out, p, 201);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  const normals = new Float32Array(out.pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const mesh = tag(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0xe8f0f8, roughness: 0.05, metalness: 0, emissive: 0x28323c, vertexColors: true,
    polygonOffset: true, polygonOffsetFactor: -2,
  })), false);
  mesh.name = 'docksGlints';
  return mesh;
}

// A cluster's parts, placed in the world. Exported so the test can measure
// them against the cluster's footprint radius.
export function partsOf(c) {
  const s = c.s ?? 1;
  const h = (k) => hash01(c.x, c.z, k);
  const local = [];
  KINDS[c.kind](local, h, c);
  const yaw = c.rot + (h(20) - 0.5) * 0.6;
  const m = new THREE.Matrix4().makeRotationY(yaw).scale(new THREE.Vector3(s, s, s)).setPosition(c.x, 0, c.z);
  for (const g of local) g.applyMatrix4(m);
  return local;
}

const tag = (mesh, receive = true) => {
  mesh.userData.dressing = true;
  mesh.userData.noCast = true;
  mesh.castShadow = false;
  mesh.receiveShadow = receive;
  return mesh;
};

// `area` is the record build() is about to return; nothing here writes to it
// (rule 2), and later dressing reads it.
export function dressDocks(scene, area) {
  const meshes = withLocalUuids(DRESSING_SEED, () => {
    const parts = [];
    for (const c of CLUSTERS) parts.push(...partsOf(c));
    for (const g of GULL_SPOTS) parts.push(...gullParts(g));
    for (const b of BOATS) parts.push(...boatParts(b));
    const props = tag(new THREE.Mesh(mergeParts(parts), dressingMaterial({ roughness: 0.85 })));
    props.name = 'docksDressing';

    const blobs = mergeParts(CLUSTERS.map((c) => blob(c.x, c.z, radiusOf(c) + 0.3)));
    const shade = tag(new THREE.Mesh(blobs, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    })));
    shade.name = 'docksDressingBlobs';
    return [props, shade, glintMesh(area?.puddles ?? [])];
  });
  // Rescales the ground's colours in place: no object, so outside the stream.
  warmStone(scene.children?.find((c) => c.userData?.ground));
  for (const m of meshes) scene.add(m);
  return meshes;
}
