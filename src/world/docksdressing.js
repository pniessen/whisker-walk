import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from './localuuids.js';

export { withLocalUuids };

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
//    test/docksdressing.test.js walks itemsOf() against all of it. And since
//    nothing stops a cat, a stray or a colony cat walking through a free one,
//    a free cluster is only ever a LOW kind (ruling R7): a net, rope, lobster
//    pots or fish boxes, nothing above 0.6 m — a heap a cat would step over,
//    never a crate stack or barrel group that looks solid and climbable like
//    the Docks' real crate perches. Those stand past the bounds.
//
// 3. CHEAP. Four meshes: every prop merged into one vertex-coloured mesh (it
//    spans the whole map, so contactshadows' per-child scan gives it no decal),
//    one flat mesh of soft dark blobs under the clusters, one flat mesh of
//    puddle glints and wet patches (both flatter than 0.1 m, so no decal
//    either) and one mesh of the warehouse-and-crane skyline past the bounds
//    (it spans the map too). None casts: userData.noCast keeps render/rig.js's caster sweep
//    from turning it back on. The warmer stone (warmStone) rescales the
//    ground's own vertex colours and makes nothing at all.
// =============================================================================

export const DRESSING_SEED = 'docks-dressing';

// builder.js's private hash01, copied: a pure function of its arguments.
export function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

// The footprint radius of each kind at s = 1. Every part a kind builds stays
// inside it (the slot offsets below are sized against it), so itemsOf() is a
// true bound of what stands on the ground.
const RADIUS = Object.freeze({ crates: 1.0, barrels: 1.08, net: 1.25, rope: 0.8, pots: 0.9, fishbox: 0.95 });

// Hand-placed. Thirty-four stand outside the 76 x 80 bounds: along the
// south edge behind the spawn, past both ends of both quays, along the east
// and west edges, and along the north edge behind the warehouses — every
// crate stack and barrel group is out here or in a collider. Five sit in the
// strip a warehouse's collider circles reach past its gable wall. The last
// seventeen stand free in the open cobble yards — the two south-bank yards
// either side of the spawn road, the east and west ends beyond the quays, and
// the north strip between the warehouses — each a metre clear of every
// gameplay point and off every path (test/docksdressing.test.js walks them).
// No collider stops a cat there, so they are all low (`yard: true`; rule 2):
// nets, rope, single-tier lobster pots and fish boxes, none above 0.6 m.
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
  { x: 41, z: -38, rot: 0.7, kind: 'crates', s: 1.1 },
  { x: 40.5, z: -31, rot: -1.3, kind: 'barrels', s: 1.1 },
  { x: 42, z: -20, rot: 2.6, kind: 'pots', s: 1.15 },
  { x: 41, z: -13.5, rot: 0.2, kind: 'crates', s: 1.15 },
  { x: 41, z: -7, rot: 0.5, kind: 'net', s: 1.15 },
  { x: 40.5, z: 6.8, rot: 1.6, kind: 'crates', s: 1.1 },
  { x: 40, z: 18, rot: -0.9, kind: 'barrels', s: 1.1 },
  { x: 41.5, z: 24, rot: 1.0, kind: 'barrels', s: 1.05 },
  { x: 40.5, z: 30, rot: 0.1, kind: 'crates', s: 1.2 },
  // west edge
  { x: -41, z: -38.5, rot: -0.6, kind: 'barrels', s: 1.1 },
  { x: -40.5, z: -31, rot: 1.2, kind: 'crates', s: 1.15 },
  { x: -40, z: -22, rot: -0.3, kind: 'barrels', s: 1.1 },
  { x: -41, z: -14, rot: 2.3, kind: 'barrels', s: 1.05 },
  { x: -41, z: -6.5, rot: 0.9, kind: 'crates', s: 1.15 },
  { x: -40.5, z: 7, rot: -1.4, kind: 'net', s: 1.1 },
  { x: -42, z: 18, rot: 1.9, kind: 'rope', s: 1.2 },
  { x: -41.5, z: 25, rot: -0.8, kind: 'crates', s: 1.1 },
  { x: -40.5, z: 32, rot: -2.2, kind: 'pots', s: 1.1 },
  // north edge
  { x: -35, z: 42.5, rot: 1.4, kind: 'barrels', s: 1.1 },
  { x: -25, z: 42, rot: 0.6, kind: 'crates', s: 1.15 },
  { x: -8, z: 43, rot: -0.8, kind: 'barrels', s: 1.1 },
  { x: 0, z: 42.2, rot: 0.3, kind: 'crates', s: 1.15 },
  { x: 8, z: 41.8, rot: 1.3, kind: 'net', s: 1.1 },
  { x: 17, z: 43, rot: -1.6, kind: 'barrels', s: 1.1 },
  { x: 28, z: 42.5, rot: -0.2, kind: 'pots', s: 1.15 },
  { x: 36, z: 42, rot: 2.4, kind: 'crates', s: 1.1 },
  // in bounds, inside a warehouse collider past its gable wall
  { x: 14.1, z: 16.5, rot: 0.1, kind: 'crates', s: 0.75 },   // W1, west gable
  { x: 25.9, z: 15, rot: -0.3, kind: 'barrels', s: 0.8 },    // W1, east gable
  { x: 5.9, z: 32.5, rot: 0.4, kind: 'pots', s: 0.6 },       // W4, west gable
  { x: 18.25, z: 32.4, rot: 0.9, kind: 'rope', s: 0.75 },     // W4, east gable
  { x: -31.4, z: 16, rot: -0.2, kind: 'crates', s: 0.75 },   // W3, west gable
  // in bounds, free-standing in the open yards: low kinds only (rule 2)
  { x: 7.5, z: -35, rot: 0.5, kind: 'fishbox', s: 1.0, yard: true },  // south-east yard, by the spawn road
  { x: 15.5, z: -33.5, rot: -0.6, kind: 'pots', s: 1.0, yard: true },
  { x: 22, z: -37, rot: 1.2, kind: 'net', s: 1.0, yard: true },
  { x: 33, z: -36.5, rot: -0.3, kind: 'pots', s: 1.1, yard: true },
  { x: 17, z: -25, rot: 0.9, kind: 'rope', s: 1.3, yard: true },
  { x: 35, z: -23.5, rot: -1.1, kind: 'fishbox', s: 1.0, yard: true },
  { x: 35.5, z: -18, rot: 0.4, kind: 'pots', s: 1.0, yard: true },
  { x: -34, z: -36, rot: -0.4, kind: 'pots', s: 1.05, yard: true },   // south-west yard
  { x: -25.5, z: -35, rot: 0.7, kind: 'fishbox', s: 1.0, yard: true },
  { x: -20, z: -28, rot: -0.9, kind: 'net', s: 1.0, yard: true },
  { x: -10, z: -23.5, rot: 0.2, kind: 'rope', s: 1.2, yard: true },
  { x: -35, z: 22, rot: 1.4, kind: 'fishbox', s: 1.0, yard: true },   // west end, beyond the quay
  { x: 35, z: 14, rot: -0.5, kind: 'pots', s: 1.05, yard: true },     // east end, beyond the quay
  { x: 35.5, z: 30, rot: 0.3, kind: 'rope', s: 1.3, yard: true },
  { x: -22, z: 37, rot: -0.2, kind: 'fishbox', s: 1.05, yard: true }, // north strip
  { x: -10, z: 36, rot: 0.6, kind: 'pots', s: 1.1, yard: true },
  { x: 24, z: 37.5, rot: -0.8, kind: 'net', s: 1.0, yard: true },
].map((c) => Object.freeze(c)));

const radiusOf = (c) => RADIUS[c.kind] * (c.s ?? 1);

// ---- gulls and boats -----------------------------------------------------------
// The boats are static (ruling R1). The gulls move, but only in the vertex
// shader of the one merged props mesh (polish-gulls, see gullMotion below):
// gulls on the water bob, perched gulls turn their heads now and then.

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

// Gulls afloat on the canal (polish-gulls): no legs, the body sitting low in
// the water (y is the gull's origin, 0.125 under the canal's 0.04 surface, deep
// enough that the top of its 2.5 cm bob never lifts the body clear), and
// clear of both bridges, both barges, every boat and both duck circles.
export const FLOAT_GULLS = Object.freeze([
  { x: -4.5, z: 1.6, y: -0.085, rot: -2.0 },
  { x: 21, z: -1.3, y: -0.085, rot: 0.9 },
  { x: -35, z: -0.8, y: -0.085, rot: 2.4 },
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
    ...FLOAT_GULLS.map((g) => ({ x: g.x, z: g.z, y: g.y, r: 0.25, what: 'gull' })),
    ...BOATS.map((b) => ({ x: b.x, z: b.z, r: Math.hypot(b.len / 2, BEAM / 2), what: 'boat' })),
    ...GLINT_PUDDLES.map((p) => ({ x: p.x, z: p.z, r: p.r, what: 'glint' })),
  ];
}

// ---- helpers ---------------------------------------------------------------

// A per-vertex `color` for geo (made non-indexed first, so every triangle owns
// its three vertices). `jitter` shades each triangle by up to ±jitter, from
// hash01, so a heap of one colour still reads as many pieces. The `uv` goes:
// no dressing material has a map, and every part dropping it keeps the
// attribute sets mergeGeometries needs in step.
export function paint(geo, hex, jitter = 0) {
  let g = geo;
  if (g.index) {
    g = geo.toNonIndexed();
    geo.dispose();
  }
  g.deleteAttribute('uv');
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

function net(parts, h, c) {
  // a heap: the top half of an ellipsoid, a = 1.2 across, b = 0.6 high,
  // c = 0.95 deep, its height made lumpy (by position, so the seams of the
  // sphere stay closed), with a second, taller lump slumped against it.
  // Net green, darker than any grass, so it never reads as a bush or a pond.
  // Out in a yard it lies flatter (b 0.42, the lump 0.48), so with the lumps
  // (up to ×1.18) and the floats it stays under 0.6 m (rule 2).
  const low = !!c.yard;
  const A = 1.2, B = low ? 0.42 : 0.6, C = 0.95;
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
  parts.push(paint(lumpy(half(), 0.6, low ? 0.48 : 0.78, 0.55, -0.4, 0.25), 0x34584a, 0.16));
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

// Two pots side by side, often a third stacked on them — but never in a
// yard, where a stack would stand 0.9 m (rule 2); one pot tops out at 0.44.
function pots(parts, h, c) {
  pot(parts, -0.3, 0, 0.1, (h(1) - 0.5) * 0.4, h(2));
  pot(parts, 0.38, 0, -0.15, (h(3) - 0.5) * 0.4, h(4));
  if (!c.yard && h(5) > 0.35) pot(parts, -0.28, 0.4, 0.08, (h(6) - 0.5) * 0.6, h(7));
  parts.push(paint(new THREE.SphereGeometry(0.13, 8, 6), 0xe0803a, 0.05).translate(0.1, 0.13, 0.55));
}

// Fish boxes: shallow plastic trays 0.16 m deep in harbour colours, one
// stack two or three high, one beside it one or two high, and often a lone
// one in front; the top tray of each stack holds crushed ice and a few fish.
// Three high at s 1.05 is 0.57 m, so a stack stays low (rule 2). Every
// corner stays inside RADIUS.fishbox: slot centre plus the tray's 0.374
// half-diagonal.
const FISHBOX_PAINT = [0x3a6ab0, 0xc04a3a, 0xe0a040, 0x4e8a6a];
const TRAY_W = 0.62, TRAY_D = 0.42, TRAY_H = 0.16;

function fishTray(parts, x, y, z, yaw, hex, top, h, salt) {
  parts.push(place(paint(new THREE.BoxGeometry(TRAY_W, TRAY_H, TRAY_D), hex, 0.05), x, y + TRAY_H / 2, z, yaw));
  // a darker rim band, so stacked trays read as separate trays
  parts.push(place(paint(new THREE.BoxGeometry(TRAY_W + 0.02, 0.03, TRAY_D + 0.02), lerpHex(hex, 0x1a1a22, 0.35)),
    x, y + TRAY_H - 0.02, z, yaw));
  if (!top) return;
  parts.push(place(paint(new THREE.BoxGeometry(TRAY_W - 0.06, 0.012, TRAY_D - 0.06), 0xdde6ec, 0.04),
    x, y + TRAY_H + 0.006, z, yaw));
  for (let i = 0; i < 3; i++) {
    const fx = -0.17 + i * 0.17, fz = (h(salt + i) - 0.5) * 0.12;
    const fish = paint(new THREE.SphereGeometry(1, 6, 4), 0x9eacb8, 0.06)
      .scale(0.13, 0.03, 0.045).rotateY((h(salt + 3 + i) - 0.5) * 0.8).translate(fx, 0, fz);
    parts.push(place(fish, x, y + TRAY_H + 0.035, z, yaw));
  }
}

function fishbox(parts, h) {
  const colour = (k) => FISHBOX_PAINT[Math.floor(h(k) * FISHBOX_PAINT.length) % FISHBOX_PAINT.length];
  const jit = (k) => (h(k) - 0.5) * 0.2;
  const stack = (x, z, n, salt) => {
    for (let i = 0; i < n; i++) fishTray(parts, x, i * TRAY_H, z, jit(salt + i), colour(salt + 5 + i), i === n - 1, h, salt + 10);
  };
  stack(-0.3, -0.15, 2 + (h(1) > 0.5 ? 1 : 0), 20);
  stack(0.38, 0.1, 1 + (h(2) > 0.4 ? 1 : 0), 40);
  if (h(3) > 0.3) stack(-0.15, 0.52, 1, 60);
}

const KINDS = { crates, barrels, net, rope, pots, fishbox };

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
// over the tail, a yellow beak and yellow legs. ~130 triangles. A floating
// gull (`afloat`) has no legs.
//
// Every part carries `aGull` for the motion shader (gullMotion): xyz is the
// pivot and w is kind + phase. A floating gull is all kind 1, pivoting at its
// origin; a perched gull's head and beak are kind 2, pivoting at its neck, and
// the rest of it is kind 0 (still). The phase is the spot's own hash, so no
// two gulls move in step.
const NECK = new THREE.Vector3(0, 0.25, 0.12);
function gullParts(g, afloat = false) {
  const p = [];
  const head = [];
  if (!afloat) {
    for (const lx of [-0.035, 0.035]) {
      p.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 3, 1, true), 0xe0a848).translate(lx, 0.05, 0));
    }
  }
  p.push(paint(new THREE.SphereGeometry(1, 6, 4), 0xf4f4f0, 0.03).scale(0.085, 0.085, 0.2).translate(0, 0.17, -0.01));
  for (const sx of [-1, 1]) {
    // a folded wing along the back, and its dark tip crossing over the tail
    p.push(paint(new THREE.SphereGeometry(1, 6, 3), 0xb8c0c8, 0.03)
      .scale(0.035, 0.06, 0.17).rotateZ(sx * 0.2).translate(sx * 0.066, 0.2, -0.05));
    p.push(paint(new THREE.ConeGeometry(0.035, 0.15, 4), 0x2a2a30)
      .rotateX(-Math.PI / 2 - 0.15).translate(sx * 0.03, 0.215, -0.24));
  }
  head.push(paint(new THREE.SphereGeometry(0.065, 6, 4), 0xf4f4f0).translate(0, 0.29, 0.15));
  head.push(paint(new THREE.ConeGeometry(0.018, 0.08, 4), 0xf0c040).rotateX(Math.PI / 2).translate(0, 0.28, 0.24));
  const m = new THREE.Matrix4().makeRotationY(g.rot).setPosition(g.x, g.y, g.z);
  const phase = Math.min(0.999, hash01(g.x, g.z, 31));
  const neck = NECK.clone().applyMatrix4(m);
  for (const geo of p) setGull(geo.applyMatrix4(m), afloat ? [g.x, g.y, g.z, 1 + phase] : [0, 0, 0, 0]);
  for (const geo of head) setGull(geo.applyMatrix4(m), afloat ? [g.x, g.y, g.z, 1 + phase] : [neck.x, neck.y, neck.z, 2 + phase]);
  return [...p, ...head];
}

// Gives every vertex of geo the same aGull value (see gullParts).
function setGull(geo, v) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set(v, i * 4);
  geo.setAttribute('aGull', new THREE.BufferAttribute(a, 4));
  return geo;
}

// The motion itself, in the props material's vertex shader: one uniform, set
// once a frame from the mesh's onBeforeRender, and nothing else per frame.
// A floating gull rises and falls 2.5 cm on a ~4.8 s swell and rolls and
// pitches a few degrees; a perched gull's head holds a direction for 3.5 s,
// then turns (up to ~30 degrees either way) in about half a second. The head
// targets come from a GLSL hash of the hold's index and the gull's phase:
// visual only, never a Math.random draw. The normal turns with the vertex.
// Static props have aGull.w 0 and skip all of it.
export const GULL_SHADER_KEY = 'docks-gulls-v1';
export function gullMotion(material) {
  const uniforms = { uGullTime: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aGull;
uniform float uGullTime;
float gullHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
mat3 gullTurn(vec4 g) {
  float kind = floor(g.w);
  float ph = fract(g.w) * 6.2831853;
  if (kind < 0.5) return mat3(1.0);
  if (kind < 1.5) {
    float r = sin(uGullTime * 1.6 + ph) * 0.07;
    float p = sin(uGullTime * 1.05 + ph * 1.7) * 0.05;
    mat3 roll = mat3(cos(r), sin(r), 0.0, -sin(r), cos(r), 0.0, 0.0, 0.0, 1.0);
    mat3 pitch = mat3(1.0, 0.0, 0.0, 0.0, cos(p), sin(p), 0.0, -sin(p), cos(p));
    return roll * pitch;
  }
  float t = uGullTime / 3.5 + fract(g.w) * 7.0;
  float hold = floor(t);
  float seed = fract(g.w) * 97.0;
  float a0 = gullHash(hold - 1.0 + seed) - 0.5;
  float a1 = gullHash(hold + seed) - 0.5;
  float y = mix(a0, a1, smoothstep(0.0, 0.15, fract(t))) * 1.1;
  return mat3(cos(y), 0.0, -sin(y), 0.0, 1.0, 0.0, sin(y), 0.0, cos(y));
}
float gullLift(vec4 g) {
  float kind = floor(g.w);
  return (kind > 0.5 && kind < 1.5) ? sin(uGullTime * 1.3 + fract(g.w) * 6.2831853) * 0.025 : 0.0;
}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
mat3 gTurn = gullTurn(aGull);
objectNormal = gTurn * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if (aGull.w > 0.5) {
  transformed = aGull.xyz + gTurn * (transformed - aGull.xyz);
  transformed.y += gullLift(aGull);
}`);
  };
  material.customProgramCacheKey = () => GULL_SHADER_KEY;
  return uniforms;
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

// ---- the skyline ---------------------------------------------------------------
// What stands past the bounds (polish-docks Task 4): builder.horizonBand's
// 52 flat-roofed blocks from 56 m out read as grey cardboard on their own, so
// a mid layer of warehouses with real roofs stands in front of them at 44–56 m
// and a far layer of harbour cranes stands among them at 60–95 m, where the
// fog (40→130 m) turns them to silhouettes against the overcast sky. Two of
// the warehouses straddle the canal's ends, so the water runs into a dark
// culvert under a gable instead of stopping square on open cobbles.
//
// A piece is a w × d footprint turned by `rot` round (x, z), h tall overall.
// Its local +z is its front and faces the play area; local x runs along the
// front (for a crane, along the jib; for a gantry, along the boom). Kinds:
// 'gable' a pitched roof with its gable end to the front, 'shed' a hipped
// roof, 'sawtooth' a north-light roof whose teeth zig-zag along the front,
// 'crane' a luffing jib crane and 'gantry' a container gantry. All of it is
// one merged mesh (rule 3), opaque and fogged.
const N = Math.PI, E = -Math.PI / 2, W = Math.PI / 2, S = 0;
const WH = (kind, x, z, rot, w, d, h, color) => ({ kind, x, z, rot, w, d, h, color });
export const SKYLINE = Object.freeze([
  // north, behind the warehouse row
  WH('gable', -44, 50, N, 9, 8, 7.5, 0x8a6a5a),
  WH('sawtooth', -30, 51, N, 14, 9, 6.5, 0x7a7a86),
  WH('shed', -14, 50, N, 13, 8, 8, 0x9a8468),
  WH('gable', 1, 50.5, N, 10, 9, 9, 0x6a7a74),
  WH('sawtooth', 16, 51, N, 14, 9, 6, 0x8a6a5a),
  WH('shed', 32, 50, N, 12, 8, 7, 0x7a7a86),
  // south, behind the spawn
  WH('shed', -40, -51, S, 12, 8, 6.5, 0x6a7a74),
  WH('gable', -25, -50.5, S, 9, 8, 8.5, 0x9a8468),
  WH('sawtooth', -10, -51, S, 15, 9, 6, 0x8a6a5a),
  WH('gable', 6, -50, S, 10, 8, 7.5, 0x7a7a86),
  WH('shed', 22, -51, S, 13, 8, 9, 0x6a7a74),
  WH('sawtooth', 38, -51, S, 12, 9, 5.5, 0x9a8468),
  // east: the canal's end (x 45.1–54, its face just past the water's end at
  // 45, so the culvert meets the water), and one either side
  WH('gable', 49.55, 0, E, 12, 8.9, 8, 0x8a6a5a),
  WH('sawtooth', 50, 22, E, 14, 8, 6, 0x6a7a74),
  WH('shed', 50, -22, E, 12, 8, 7, 0x9a8468),
  // west: the other end, and one either side
  WH('shed', -49.55, 0, W, 13, 8.9, 7.5, 0x7a7a86),
  WH('gable', -50, -24, W, 10, 8, 8, 0x8a6a5a),
  WH('sawtooth', -50, 24, W, 14, 8, 6.5, 0x9a8468),
  // the far layer: four luffing cranes and two container gantries
  WH('crane', -30, 74, 0.4, 24, 4.4, 22, 0xb0503e),
  WH('crane', 18, 82, 2.6, 22, 4.4, 24, 0xd8d0c0),
  WH('gantry', 58, 68, -0.6, 28, 9, 18, 0xb0503e),
  WH('crane', -76, 8, 1.9, 22, 4.4, 20, 0xd8d0c0),
  WH('gantry', 74, -26, 1.2, 26, 9, 16, 0xd8d0c0),
  WH('crane', -18, -80, -0.5, 22, 4.4, 18, 0xb0503e),
].map((p) => Object.freeze(p)));

// The canal's culvert: the piece whose front sits on the water's end.
const CULVERT_HALF = 3.6, CULVERT_TOP = 2.6, CULVERT_SPRING = 1.1;
const isCanalEnd = (p) => p.z === 0 && Math.abs(p.x) > 45 && Math.abs(p.x) < 50;

// A box `t` thick from p0 to p1 (both [x, y, z]), painted.
function beam(p0, p1, t, hex, tz = t) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = paint(new THREE.BoxGeometry(t, len, tz), hex, 0.03);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
const box = (w, h, d, x, y, z, hex, jitter = 0.03) => paint(new THREE.BoxGeometry(w, h, d), hex, jitter).translate(x, y + h / 2, z);

// Windows as darker quads on a wall: rows every 2.4 m from 1.3 m up, bays
// every 2.3 m, a few left out by hash. `face(u, y)` maps a point on the wall
// (u along it, y up) to [x, y, z]; `skip(u, y)` leaves a window out.
function windows(tris, span, eave, face, out, salt, skip = () => false, maxRows = 3) {
  const bays = Math.floor((span - 1.0) / 2.3);
  if (bays < 1) return;
  const u0 = -((bays - 1) * 2.3) / 2;
  for (let f = 0; f < maxRows; f++) {
    const y = 1.3 + f * 2.4;
    if (y + 1.2 > eave - 0.4) break;
    for (let c = 0; c < bays; c++) {
      const u = u0 + c * 2.3;
      if (skip(u, y) || hash01(f * 7 + c, salt, 5.1) < 0.15) continue;
      quad(tris, face(u - 0.5, y), face(u + 0.5, y), face(u + 0.5, y + 1.2), face(u - 0.5, y + 1.2), out);
    }
  }
}

// A warehouse in its own frame: a body inset 0.25 m inside the footprint, its
// roof (eaves out to the footprint's edge), and its doors and windows.
function warehouseParts(p) {
  const { w, d, h, kind } = p;
  const bw = w - 0.5, bd = d - 0.5;
  const rise = kind === 'gable' ? Math.min(0.28 * w, 3) : kind === 'shed' ? Math.min(0.3 * d, 2.5) : 1.8;
  const e = h - rise;
  const body = p.color;
  const roofHex = lerpHex(body, 0x2e2c34, 0.5);
  const dark = lerpHex(body, 0x1e2430, 0.6);
  const parts = [box(bw, e, bd, 0, 0, 0, body, 0.02)];
  const roof = [], ends = [], glass = [], holes = [], culvert = [];
  const P = (x, y, z) => [x, y, z];
  if (kind === 'gable') {
    for (const sx of [-1, 1]) {
      quad(roof, P(sx * w / 2, e - 0.15, -d / 2), P(sx * w / 2, e - 0.15, d / 2), P(0, h, d / 2), P(0, h, -d / 2), [sx * rise, w / 2, 0]);
    }
    for (const sz of [-1, 1]) ends.push([P(-bw / 2, e, sz * bd / 2), P(bw / 2, e, sz * bd / 2), P(0, h - 0.05, sz * bd / 2), [0, 0, sz]]);
  } else if (kind === 'shed') {
    const r = Math.max(0, w / 2 - d / 2);
    for (const sz of [-1, 1]) {
      quad(roof, P(-w / 2, e - 0.1, sz * d / 2), P(w / 2, e - 0.1, sz * d / 2), P(r, h, 0), P(-r, h, 0), [0, d / 2, sz * rise]);
    }
    for (const sx of [-1, 1]) roof.push([P(sx * w / 2, e - 0.1, d / 2), P(sx * w / 2, e - 0.1, -d / 2), P(sx * r, h, 0), [sx * rise, d / 2, 0]]);
  } else {
    // sawtooth: each tooth rises from x0 to its glazed upright at x1
    const n = Math.max(3, Math.round(bw / 4.5)), tw = bw / n;
    for (let i = 0; i < n; i++) {
      const x0 = -bw / 2 + i * tw, x1 = x0 + tw;
      quad(roof, P(x0, e, -bd / 2), P(x0, e, bd / 2), P(x1, h, bd / 2), P(x1, h, -bd / 2), [-rise, tw, 0]);
      quad(i === n - 1 ? ends : glass, P(x1, e, bd / 2), P(x1, e, -bd / 2), P(x1, h, -bd / 2), P(x1, h, bd / 2), [1, 0, 0]);
      for (const sz of [-1, 1]) ends.push([P(x0, e, sz * bd / 2), P(x1, e, sz * bd / 2), P(x1, h, sz * bd / 2), [0, 0, sz]]);
    }
  }
  // the front: a loading door, or over the canal the culvert's dark arch
  const fz = bd / 2 + 0.03;
  const front = (u, y) => P(u, y, fz);
  let skipFront;
  if (isCanalEnd(p)) {
    const arch = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (i / 10);
      arch.push(front(CULVERT_HALF * Math.cos(a), CULVERT_SPRING + (CULVERT_TOP - CULVERT_SPRING) * Math.sin(a)));
    }
    quad(culvert, front(-CULVERT_HALF, 0), front(CULVERT_HALF, 0), front(CULVERT_HALF, CULVERT_SPRING), front(-CULVERT_HALF, CULVERT_SPRING), [0, 0, 1]);
    for (let i = 0; i < 10; i++) culvert.push([front(0, CULVERT_SPRING), arch[i], arch[i + 1], [0, 0, 1]]);
    skipFront = (u, y) => y < CULVERT_TOP + 0.3 && Math.abs(u) < CULVERT_HALF + 0.7;
  } else {
    const dh = Math.min(3.2, e - 1.4);
    quad(holes, front(-1.3, 0), front(1.3, 0), front(1.3, dh), front(-1.3, dh), [0, 0, 1]);
    skipFront = (u, y) => y < dh + 0.3 && Math.abs(u) < 2.0;
  }
  const salt = Math.round(p.x * 13 + p.z * 7);
  windows(holes, bw, e, front, [0, 0, 1], salt, skipFront);
  // one row down each side, for the corner views
  for (const sx of [-1, 1]) {
    windows(holes, bd, e, (u, y) => P(sx * (bw / 2 + 0.03), y, u), [sx, 0, 0], salt + sx * 3, () => false, 1);
  }
  parts.push(facing(roof, roofHex, 0.04));
  if (ends.length) parts.push(facing(ends, body, 0.02));
  if (glass.length) parts.push(facing(glass, 0x56606c, 0.03));
  if (holes.length) parts.push(facing(holes, dark, 0.05));
  // the tunnel the canal runs into: near-black, darker than any window
  if (culvert.length) parts.push(facing(culvert, 0x1a1e24));
  return parts;
}

const desat = (hex, t) => lerpHex(hex, 0x8a8a8a, t);

// A luffing jib crane in its own frame: a portal on four legs at the back of
// the footprint, a mast with rib bands (the lattice, read at distance), a cab
// with an A-frame, a counterweight behind and the jib angled up to the
// footprint's front end, with a stay and the hoist rope hanging from its tip.
function craneParts(p) {
  const { w, h } = p;
  const paintHex = desat(p.color, 0.2);
  const cream = desat(0xd8d0c0, 0.15);
  const steel = 0x4a4a52;
  const px = -w / 2 + 3.0, lz = 1.6;
  const mt = 0.45 * h;
  const parts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.45, 4, 0.45, px + sx * 1.6, 0, sz * lz, paintHex));
  parts.push(box(3.8, 0.5, 2 * lz + 0.6, px, 4, 0, paintHex));
  parts.push(box(1.0, mt - 4.5, 1.0, px, 4.5, 0, paintHex));
  for (let y = 6.5; y < mt - 0.5; y += 2.5) parts.push(box(1.3, 0.15, 1.3, px, y, 0, paintHex));
  parts.push(box(2.6, 2.0, 2.2, px + 0.1, mt, 0, cream));
  parts.push(box(2.4, 1.6, 1.8, -w / 2 + 1.25, mt + 0.2, 0, steel));
  parts.push(beam([-w / 2 + 2.3, mt + 1.0, 0], [px - 1.0, mt + 1.0, 0], 0.4, steel));
  const apex = [px - 0.2, mt + 4.2, 0];
  parts.push(beam([px - 0.9, mt + 2.0, 0], apex, 0.3, paintHex), beam([px + 0.7, mt + 2.0, 0], apex, 0.3, paintHex));
  const pivot = [px + 1.4, mt + 1.0, 0], tip = [w / 2 - 0.6, h - 0.6, 0];
  parts.push(beam(pivot, tip, 0.7, paintHex));
  parts.push(beam(apex, tip, 0.12, steel));
  parts.push(box(0.1, 6.5, 0.1, tip[0], tip[1] - 6.8, 0, steel));
  parts.push(box(0.5, 0.5, 0.5, tip[0], tip[1] - 7.3, 0, steel));
  return parts;
}

// A container gantry in its own frame: two A-frames standing on a four-legged
// portal, the boom running the footprint's whole length, its machinery house
// at the back end and stays from the apexes out to both boom ends.
function gantryParts(p) {
  const { w, d, h } = p;
  const paintHex = desat(p.color, 0.2);
  const cream = desat(0xd8d0c0, 0.15);
  const steel = 0x4a4a52;
  const hb = Math.round(h * 0.55);
  const lz = d / 2 - 0.6, top = hb + 1.1, ay = h - 0.5;
  const parts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(0.9, hb, 0.9, sx * 5, 0, sz * lz, paintHex));
    parts.push(box(0.9, 0.6, 2 * lz, sx * 5, 0, 0, paintHex));
  }
  for (const sz of [-1, 1]) {
    parts.push(box(10.9, 1.0, 0.9, 0, hb - 1.0, sz * lz, paintHex));
    // the A-frame on this side, and its stays to both ends of the boom
    parts.push(beam([-5, top, sz * lz], [-1, ay, sz * lz], 0.6, paintHex), beam([3, top, sz * lz], [-1, ay, sz * lz], 0.6, paintHex));
    parts.push(beam([-1, ay, sz * lz], [w / 2 - 1.0, top, sz * lz], 0.15, steel), beam([-1, ay, sz * lz], [-w / 2 + 1.0, top, sz * lz], 0.15, steel));
  }
  parts.push(box(0.6, 0.6, 2 * lz, -1, ay - 0.3, 0, paintHex));
  parts.push(box(w - 0.4, 1.1, 1.8, 0, hb, 0, paintHex));
  parts.push(box(5, 2.4, 3.2, -w / 2 + 3.2, top, 0, cream));
  return parts;
}

const SKYLINE_KINDS = { gable: warehouseParts, shed: warehouseParts, sawtooth: warehouseParts, crane: craneParts, gantry: gantryParts };

// A skyline piece's parts, placed in the world. Exported so the test can hold
// them to the piece's footprint and height.
export function skylinePartsOf(p) {
  const parts = SKYLINE_KINDS[p.kind](p);
  const m = new THREE.Matrix4().makeRotationY(p.rot).setPosition(p.x, 0, p.z);
  for (const g of parts) g.applyMatrix4(m);
  return parts;
}

function skylineMesh() {
  const parts = [];
  for (const p of SKYLINE) parts.push(...skylinePartsOf(p));
  // opaque and fogged (MeshStandardMaterial's default), so the far layer
  // fades to silhouette; matte, and no userData.window — the windows are
  // vertex colours, so walk.js's dusk pass never lights them
  const mesh = tag(new THREE.Mesh(mergeParts(parts), dressingMaterial({ roughness: 1 })));
  mesh.name = 'docksSkyline';
  return mesh;
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
// `reducedMotion` (walk.js's setting, via docks.js's water options) leaves the
// gulls perfectly still: no shader patch, no per-frame hook.
export function dressDocks(scene, area, { reducedMotion = false } = {}) {
  const meshes = withLocalUuids(DRESSING_SEED, () => {
    const parts = [];
    for (const c of CLUSTERS) parts.push(...partsOf(c));
    for (const g of GULL_SPOTS) parts.push(...gullParts(g));
    for (const b of BOATS) parts.push(...boatParts(b));
    for (const g of FLOAT_GULLS) parts.push(...gullParts(g, true));
    // everything that is not a gull holds still (aGull.w 0)
    for (const geo of parts) if (!geo.attributes.aGull) setGull(geo, [0, 0, 0, 0]);
    const props = tag(new THREE.Mesh(mergeParts(parts), dressingMaterial({ roughness: 0.85 })));
    props.name = 'docksDressing';
    if (!reducedMotion) {
      const u = gullMotion(props.material);
      props.userData.gulls = u;
      // Wrapped well before float precision matters; the jump once an hour
      // is a single frame's twitch.
      props.onBeforeRender = () => { u.uGullTime.value = (performance.now() / 1000) % 3600; };
    }

    const blobs = mergeParts(CLUSTERS.map((c) => blob(c.x, c.z, radiusOf(c) + 0.3)));
    const shade = tag(new THREE.Mesh(blobs, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    })));
    shade.name = 'docksDressingBlobs';
    return [props, shade, glintMesh(area?.puddles ?? []), skylineMesh()];
  });
  // Rescales the ground's colours in place: no object, so outside the stream.
  warmStone(scene.children?.find((c) => c.userData?.ground));
  for (const m of meshes) scene.add(m);
  return meshes;
}
