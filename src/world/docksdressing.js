import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, seedFromCode } from '../rng.js';

// =============================================================================
// THE OLD DOCKS' DRESSING (polish-docks). What turns a grey cobbled plain into
// a busy, friendly harbour: crates stacked against the warehouse gables,
// painted barrels, nets heaped with orange floats, coils of rope and lobster
// pots, most of it just outside the walkable bounds where the cat sees it from
// the spawn and from both quays. Scenery only — and three rules keep it so.
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
// 3. CHEAP. Two meshes: every prop merged into one vertex-coloured mesh (it
//    spans the whole map, so contactshadows' per-child scan gives it no decal),
//    and one flat mesh of soft dark blobs under the clusters (flatter than
//    0.1 m, so no decal either). Neither casts: userData.noCast keeps
//    render/rig.js's caster sweep from turning it back on.
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
const RADIUS = Object.freeze({ crates: 1.05, barrels: 1.02, net: 1.0, rope: 0.8, pots: 0.9 });

// Hand-placed. Most stand outside the 76 x 80 bounds: along the south edge
// behind the spawn, past both ends of both quays, and along the north edge
// behind the warehouses. The five in bounds sit in the strip a warehouse's
// collider circles reach past its gable wall, so nothing new blocks the cat.
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
].map((c) => Object.freeze(c)));

const radiusOf = (c) => RADIUS[c.kind] * (c.s ?? 1);

// Every placed dressing item's ground footprint. Later dressing kinds append
// their own items here so the keep-out test sees all of them.
export function itemsOf() {
  return CLUSTERS.map((c) => ({ x: c.x, z: c.z, r: radiusOf(c), what: c.kind }));
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

function crates(parts, h) {
  const n = 3 + Math.floor(h(1) * 2);
  const a = 0.7 + h(2) * 0.2;
  crate(parts, a, -0.4, 0, -0.1, (h(3) - 0.5) * 0.4, h(4));
  crate(parts, 0.6 + h(5) * 0.25, 0.42, 0, 0.15, (h(6) - 0.5) * 0.4, h(7));
  if (n >= 3) crate(parts, 0.55 + h(8) * 0.12, -0.38, a, -0.08, (h(9) - 0.5) * 0.6, h(10));
  if (n >= 4) crate(parts, 0.5, 0.32, 0, -0.6, (h(11) - 0.5) * 0.3, h(12));
}

const BARREL_PAINT = [0xb0503e, 0x3e6a8a, 0x4e7a52];

function barrel(parts, x, z, hex, lying, yaw) {
  const body = paint(new THREE.CylinderGeometry(0.29, 0.29, 0.86, 10, 1), hex, 0.04);
  const bands = [0.25, -0.25].map((y) => paint(new THREE.CylinderGeometry(0.305, 0.305, 0.06, 10, 1, true), 0x3a3430)
    .translate(0, y, 0));
  for (const g of [body, ...bands]) {
    if (lying) g.rotateZ(Math.PI / 2).translate(0, 0.29, 0);
    else g.translate(0, 0.43, 0);
    parts.push(place(g, x, 0, z, yaw));
  }
}

function barrels(parts, h) {
  const first = Math.floor(h(1) * 3);
  barrel(parts, -0.35, 0.05, BARREL_PAINT[first], false, 0);
  barrel(parts, 0.33, -0.12, BARREL_PAINT[(first + 1) % 3], false, 0);
  // a third on its side behind them, square to the pair
  if (h(2) > 0.4) barrel(parts, 0.0, 0.62, BARREL_PAINT[(first + 2) % 3], true, 0);
}

function net(parts, h) {
  // a heap: the top half of an ellipsoid, a = 0.95 across, b = 0.36 high, c = 0.76 deep
  const A = 0.95, B = 0.36, C = 0.76;
  const mound = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  mound.scale(A, B, C);
  parts.push(paint(mound, 0x5e6a4a, 0.14));
  // a cord of floats draped over it, spread round the heap
  for (let i = 0; i < 4; i++) {
    const ang = h(2) * Math.PI * 2 + i * 1.55 + (h(3 + i) - 0.5) * 0.4;
    const rr = 0.45 + h(8 + i) * 0.35;
    const fx = Math.cos(ang) * rr * A, fz = Math.sin(ang) * rr * C;
    const fy = B * Math.sqrt(Math.max(0, 1 - (fx / A) ** 2 - (fz / C) ** 2));
    parts.push(paint(new THREE.SphereGeometry(0.11, 8, 6), 0xe0803a, 0.05).translate(fx, fy + 0.05, fz));
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
  // the arched, slatted top: a half-cylinder of netting under four hoops
  const arch = new THREE.CylinderGeometry(0.19, 0.19, 0.58, 7, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  parts.push(place(paint(arch, mesh, 0.08), x, y + 0.215, z, yaw));
  for (const sx of [-0.28, -0.095, 0.095, 0.28]) {
    const hoop = new THREE.TorusGeometry(0.2, 0.022, 3, 7, Math.PI).rotateY(Math.PI / 2).translate(sx, 0, 0);
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
  const g = new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2);
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

// ---- the build ---------------------------------------------------------------

function clusterParts(c) {
  const s = c.s ?? 1;
  const h = (k) => hash01(c.x, c.z, k);
  const local = [];
  KINDS[c.kind](local, h);
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
    for (const c of CLUSTERS) parts.push(...clusterParts(c));
    const props = tag(new THREE.Mesh(mergeParts(parts), dressingMaterial({ roughness: 0.85 })));
    props.name = 'docksDressing';

    const blobs = mergeParts(CLUSTERS.map((c) => blob(c.x, c.z, radiusOf(c) + 0.3)));
    const shade = tag(new THREE.Mesh(blobs, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    })));
    shade.name = 'docksDressingBlobs';
    return [props, shade];
  });
  for (const m of meshes) scene.add(m);
  return meshes;
}
