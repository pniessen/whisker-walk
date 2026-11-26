// =============================================================================
// THE THREE ROOMS' THINGS (milestone G6): the flagstone paths, the Orchid Room's benches' hanging baskets, shelf and hibiscus, the
// Cactus House's soft cacti and low walls, the Butterfly Room's hedge, shrubs, bench and decor stream bed, and the two small
// meshes that pop open when a find happens (the shy orchid, the cactus flower). The glass, mist and shafts are the Palm House's kit
// (greenhouseglass.js); the benches' orchids are greenhouseplants.js orchids() on the rooms' own benches. Every mesh is merged by
// use, vertex-coloured, noCast. Nothing here draws a random number or reads a clock: a plant's look is hash01 of its place.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import * as R from './greenhouserooms.js';
import { frondGeometry, flowerGeometry, tint, shade, collector, finishMesh, memo, stalk } from './greenhouseplants.js';
import { pavedGeometry } from './greenhouseglass.js';

export const GH_ROOM_LOOK_SALT = 0x61a90;
const TAU = Math.PI * 2;
const h01 = (x, z, k) => hash01(x, z, GH_ROOM_LOOK_SALT + k);
const lerp = (a, b, t) => a + (b - a) * t;

const HIB_LEAF = memo(() => frondGeometry({ len: 0.34, width: 0.2, segs: 2, rise: 0.4, droop: 0.4, fold: 0.1, base: 0x2e7236, tip: 0x4f9a46, belly: 0.5 }));
const SHRUB_LEAF = memo(() => frondGeometry({ len: 0.55, width: 0.26, segs: 3, rise: 0.7, droop: 0.9, fold: 0.15, base: 0x2f7a3a, tip: 0x62b04e, belly: 0.5 }));
const HIB_FLOWER = memo(() => flowerGeometry({ r: 0.2, n: 5, petal: 0xe03a3a, centre: 0xf6d44a, lift: 0.3 }));
const HIB_PINK = memo(() => flowerGeometry({ r: 0.18, n: 5, petal: 0xf27ab8, centre: 0xf6d44a, lift: 0.3 }));
const ORCHID_HANG = memo(() => flowerGeometry({ r: 0.1, n: 5, petal: 0xf0a8d8, centre: 0xfff0a8, lift: 0.4 }));
const PEBBLE = memo(() => tint(new THREE.OctahedronGeometry(0.1, 0), 0x9a9488));

// ---------------------------------------------------------------------------------------------
// The flagstone paths joining each room to the Palm House: a few flat slabs each, one mesh.
export function roomPaths() {
  const col = collector();
  R.ROOM_PATHS.forEach(([x0, z0, x1, z1], k) => {
    const w = x1 - x0, d = z1 - z0;
    col.add(tint(new THREE.BoxGeometry(w, 0.05, d), 0xb9b2a0), (x0 + x1) / 2, 0.025, (z0 + z1) / 2, {});
    col.add(pavedGeometry(w - 0.06, d - 0.06, 0xc4bda9, { cell: 1.2, seed: 0x7a0 + k, edge: 0.4, ao: 0.1 }), (x0 + x1) / 2, 0.052, (z0 + z1) / 2, {});
    // a few darker stones laid on it, a function of the place
    for (let i = 0; i < 4; i++) {
      const x = x0 + w * (0.15 + 0.7 * h01(k, i, 1)), z = z0 + d * (0.15 + 0.7 * h01(i, k, 2));
      col.add(tint(new THREE.BoxGeometry(0.5, 0.02, 0.4), 0x9d9684), x, 0.055, z, { yaw: h01(k, i, 3) * TAU });
    }
  });
  return finishMesh('ghRoomPaths', col.merged());
}

// A hibiscus bush (the hall's, a little larger): branches, small leaves, big flowers.
function hibiscus(col, x, z, scale = 1, pink = false) {
  for (let b = 0; b < 4; b++) {
    const a = (b / 4) * TAU + h01(x, z, 10);
    const bx = x + Math.cos(a) * 0.38 * scale, bz = z + Math.sin(a) * 0.38 * scale, bh = lerp(1.0, 1.5, h01(x + b, z, 11)) * scale;
    col.add(stalk(x, 0, z, bx, bh, bz, 0.03, 0x5a3f2a), 0, 0, 0, {});
    for (let l = 0; l < 4; l++) {
      const la = a + (l - 1.5) * 0.8;
      col.add(HIB_LEAF(), bx + Math.cos(la) * 0.08, bh - 0.04 * l, bz + Math.sin(la) * 0.08, { yaw: -la, roll: 0.25, scale: 1.1 });
    }
    if (b % 2 === 0) col.add(pink ? HIB_PINK() : HIB_FLOWER(), bx, bh + 0.05, bz, { yaw: h01(x + b, z, 12) * TAU, tilt: 0.2, scale: 1 });
  }
}

// ---------------------------------------------------------------------------------------------
// ORCHID ROOM: hanging baskets under the roof, the high shelf (a board on brackets, pots along it), the hibiscus in the corners.
export function orchidRoomDecor() {
  const col = collector();
  const H = R.ORCHID_ROOM;
  // six hanging baskets on thin chains from the roof's ribs, trailing pink blooms
  [[-30.5, -11], [-27.5, -7], [-24, -11.5], [-21, -7.5], [-27, -4.8], [-19.5, -11]].forEach(([x, z], i) => {
    const top = 3.6 + 0.2 * h01(x, z, 20);
    col.add(stalk(x, 2.35, z, x, top, z, 0.008, 0x8a8a80), 0, 0, 0, {});
    col.add(tint(new THREE.CylinderGeometry(0.2, 0.12, 0.16, 8), 0xb8613c), x, 2.2, z, {});
    for (let t = 0; t < 4; t++) {
      const a = (t / 4) * TAU + i;
      col.add(stalk(x, 2.28, z, x + Math.cos(a) * 0.22, 1.85 - 0.1 * (t % 2), z + Math.sin(a) * 0.22, 0.01, 0x4a7a3a), 0, 0, 0, {});
      col.add(ORCHID_HANG(), x + Math.cos(a) * 0.23, 1.85 - 0.1 * (t % 2), z + Math.sin(a) * 0.23, { tilt: 0.9, yaw: a });
    }
  });
  // the high shelf on the west wall: a board, two brackets, five small pots with blooms
  const S = R.ORCHID_SHELF;
  col.add(tint(new THREE.BoxGeometry(S.d, 0.06, S.len), 0xa07a52), S.x, S.y - 0.03, S.z, {});
  for (const dz of [-1.4, 1.4]) col.add(tint(new THREE.BoxGeometry(0.06, 0.4, 0.06), 0x7a5a3a), S.x - 0.2, S.y - 0.25, S.z + dz, {});
  for (let i = 0; i < 5; i++) {
    const z = S.z - S.len / 2 + 0.4 + i * ((S.len - 0.8) / 4);
    col.add(tint(new THREE.CylinderGeometry(0.1, 0.07, 0.14, 7), 0xb8613c), S.x, S.y + 0.07, z, {});
    col.add(HIB_LEAF(), S.x, S.y + 0.14, z, { yaw: i, scale: 0.9 });
    col.add(ORCHID_HANG(), S.x, S.y + 0.36, z, { tilt: 0.3, yaw: i, scale: 0.8 });
    col.add(stalk(S.x, S.y + 0.14, z, S.x, S.y + 0.34, z, 0.008, 0x4a7a3a), 0, 0, 0, {});
  }
  R.ORCHID_HIBISCUS.forEach((h) => hibiscus(col, h.x, h.z, 0.9, true));
  // a few ferns at the north wall's feet between the benches
  void H;
  return finishMesh('ghOrchidRoom', col.merged());
}

// The shy orchid: one big blue bloom cluster over the first bench's fifth pot, drawn closed (small) and opened by the life.
export function shyOrchidMesh() {
  const col = collector();
  for (let f = 0; f < 5; f++) col.add(flowerGeometry({ r: 0.17, n: 5, petal: 0x4a78f0, centre: 0xfff0a8, lift: 0.5 }), 0, 0.12 + f * 0.1, 0, { tilt: 0.7, yaw: f * 1.3, scale: 1 });
  const m = finishMesh('ghShyOrchid', col.merged());
  m.position.set(R.SHY_ORCHID.x, R.SHY_ORCHID.y, R.SHY_ORCHID.z);
  m.scale.setScalar(0.001);
  m.visible = false;
  return m;
}

// ---------------------------------------------------------------------------------------------
// CACTUS HOUSE: soft clusters (a big rounded cactus, two small ones, a few pale tufts: no spike is drawn), the low walls with pots.
// beauty round 2: ribbed (every other column darker), a darker foot and a sunlit crown, and three greens (blue-grey, leaf, yellow) picked on the hash
const CACTUS_GREENS = [0x5f9a5a, 0x4f8f6a, 0x7aa24f];
const cactusBodies = memo(() => CACTUS_GREENS.map((c) => shade(tint(new THREE.CapsuleGeometry(0.34, 0.9, 3, 8), c), { foot: 0.7, crown: 1.12, ribs: 4, ribDepth: 0.16 })));
const cactusArms = memo(() => CACTUS_GREENS.map((c) => shade(tint(new THREE.CapsuleGeometry(0.12, 0.3, 2, 6), c), { foot: 0.85, crown: 1.1 })));
const CACTUS_SMALL = memo(() => shade(tint(new THREE.CapsuleGeometry(0.17, 0.28, 2, 7), 0x6aa862), { foot: 0.75, crown: 1.12, ribs: 3, ribDepth: 0.14 }));
const TUFT = memo(() => tint(new THREE.OctahedronGeometry(0.035, 0), 0xf3ecd2));
export function cactusHouseDecor() {
  const col = collector();
  R.CACTUS_CLUSTERS.forEach((k, i) => {
    const big = lerp(0.95, 1.25, h01(k.x, k.z, 30));
    const gi = Math.floor(h01(k.x, k.z, 29) * 3) % 3;
    col.add(cactusBodies()[gi], k.x, 0.45 * big, k.z, { scale: big });
    // a soft arm each side
    col.add(cactusArms()[gi], k.x + 0.36 * big, 0.95 * big, k.z, { roll: -0.5, scale: big });
    col.add(cactusArms()[gi], k.x - 0.34 * big, 0.75 * big, k.z + 0.05, { roll: 0.5, scale: big });
    // two small ones at its foot
    for (let s = 0; s < 2; s++) {
      const a = h01(k.x, k.z, 31 + s) * TAU;
      col.add(CACTUS_SMALL(), k.x + Math.cos(a) * 0.62, 0.2, k.z + Math.sin(a) * 0.62, { scale: lerp(0.9, 1.3, h01(k.x, k.z, 33 + s)) });
    }
    // pale tufts along the ribs (soft dots)
    for (let t = 0; t < 7; t++) {
      const a = (t / 7) * TAU + i, y = 0.3 + 0.18 * (t % 4);
      col.add(TUFT(), k.x + Math.cos(a) * 0.34 * big, y * big, k.z + Math.sin(a) * 0.34 * big, {});
    }
    // sand ring and a few pebbles
    col.add(tint(new THREE.CylinderGeometry(k.r + 0.15, k.r + 0.25, 0.05, 12), 0xd4be88), k.x, 0.025, k.z, {});
    for (let p = 0; p < 3; p++) col.add(PEBBLE(), k.x + Math.cos(p * 2.2 + i) * (k.r + 0.35), 0.05, k.z + Math.sin(p * 2.2 + i) * (k.r + 0.35), { scale: 0.8 + 0.3 * p });
  });
  // low walls (0.5 m high, 0.5 m deep) with a pot of little round cacti every metre and a half
  for (const [x0, z0, x1] of R.CACTUS_LOW_WALLS) {
    const len = x1 - x0;
    col.add(tint(new THREE.BoxGeometry(len + 0.5, 0.5, 0.5), 0xc9a878), (x0 + x1) / 2, 0.25, z0, {});
    col.add(tint(new THREE.BoxGeometry(len + 0.6, 0.06, 0.58), 0xb8956a), (x0 + x1) / 2, 0.53, z0, {});
    for (let i = 0; i < 3; i++) {
      const x = x0 + 0.2 + i * ((len - 0.4) / 2);
      col.add(tint(new THREE.CylinderGeometry(0.17, 0.12, 0.2, 7), 0xb8613c), x, 0.66, z0, {});
      col.add(CACTUS_SMALL(), x, 0.86, z0, { scale: 0.9 });
    }
  }
  return finishMesh('ghCactusHouse', col.merged());
}

// The flowering cactus's pink flower, shut until she sits beside it: a flat flower on the big cactus's crown.
export function cactusFlowerMesh() {
  const k = R.CACTUS_FLOWERING;
  const big = lerp(0.95, 1.25, h01(k.x, k.z, 30));
  const col = collector();
  col.add(flowerGeometry({ r: 0.26, n: 6, petal: 0xf26aa8, centre: 0xffe066, lift: 0.5 }), 0, 0, 0, { scale: 1 });
  col.add(flowerGeometry({ r: 0.18, n: 6, petal: 0xff9ac8, centre: 0xffe066, lift: 0.7 }), 0, 0.04, 0, { yaw: 0.5 });
  const m = finishMesh('ghCactusFlower', col.merged());
  m.position.set(k.x, 0.45 * big + 0.34 * big + 0.45 * big + 0.02, k.z);
  m.scale.setScalar(0.001);
  m.visible = false;
  return m;
}

// ---------------------------------------------------------------------------------------------
// BUTTERFLY ROOM: the hibiscus hedge across the back, four flowering shrubs, the bench, the decor stream bed.
export function butterflyRoomDecor() {
  const col = collector();
  R.BUTTERFLY_HEDGE.forEach((h, i) => hibiscus(col, h.x, h.z, 1.15, i % 2 === 1));
  const blooms = [0xf27ab8, 0xf5d042, 0xb07ae0, 0xffffff];
  R.BUTTERFLY_SHRUBS.forEach((s, i) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + i;
      col.add(SHRUB_LEAF(), s.x + Math.cos(a) * 0.15, 0.25, s.z + Math.sin(a) * 0.15, { yaw: -a, scale: lerp(1.2, 1.7, h01(s.x + k, s.z, 40)) });
    }
    for (let k = 0; k < 9; k++) {
      const a = h01(s.x + k, s.z, 41) * TAU, r = 0.15 + 0.45 * h01(s.x, s.z + k, 42);
      col.add(flowerGeometry({ r: 0.12, n: 5, petal: blooms[(i + k) % 4], centre: 0xfff0a8, lift: 0.4 }), s.x + Math.cos(a) * r, 0.85 + 0.5 * h01(s.x + k, s.z + k, 43), s.z + Math.sin(a) * r, { yaw: a, tilt: 0.3 });
    }
  });
  const B = R.BUTTERFLY_BENCH;
  col.add(tint(new THREE.BoxGeometry(B.w, 0.07, B.d), 0xa07a52), B.x, B.y - 0.035, B.z, {});
  for (const sx of [-1, 1]) col.add(tint(new THREE.BoxGeometry(0.08, B.y, 0.4), 0x7a5a3a), B.x + sx * (B.w / 2 - 0.1), B.y / 2, B.z, {});
  col.add(tint(new THREE.BoxGeometry(B.w, 0.4, 0.05), 0x8a6642), B.x, B.y + 0.25, B.z - 0.22, {});
  // the stream bed: a blue ribbon of quads between pebbles, flat on the floor (no water: she walks over it)
  const pts = R.STREAM_POINTS, w = R.STREAM_WIDTH;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const g = new THREE.BoxGeometry(w, 0.02, len + 0.1);
    col.add(tint(g, 0x7ab8d8), (a.x + b.x) / 2, 0.04, (a.z + b.z) / 2, { yaw: Math.atan2(b.x - a.x, b.z - a.z) });
    for (const side of [-1, 1]) {
      const nx = Math.cos(Math.atan2(b.x - a.x, b.z - a.z)), nz = -Math.sin(Math.atan2(b.x - a.x, b.z - a.z));
      for (let p = 0; p < 3; p++) {
        const t = (p + 0.5) / 3;
        col.add(PEBBLE(), a.x + (b.x - a.x) * t + nx * side * (w / 2 + 0.05), 0.07, a.z + (b.z - a.z) * t + nz * side * (w / 2 + 0.05), { scale: 0.8 + 0.5 * h01(i * 3 + p, side, 44) });
      }
    }
  }
  return finishMesh('ghButterflyRoom', col.merged());
}

export const roomMeshes = () => ({
  paths: roomPaths(), orchid: orchidRoomDecor(), cactus: cactusHouseDecor(), butterfly: butterflyRoomDecor(),
});
