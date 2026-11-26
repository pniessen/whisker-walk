// =============================================================================
// THE GREENHOUSE'S GARDEN PARTS (milestone 1): the fountain court's fountain (the Park's kit, reused), the potting
// bench with its seed tray and the watering can, the kitchen bed, the eight garden pots the watering job picks four
// of, a seed packet and the sprouts. Pure builders: nothing here draws a random number or reads a clock.
// =============================================================================

import * as THREE from 'three';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';
import {
  BASIN_PROFILE, SPIRE_PROFILE, BASIN_WATER, FOUNTAIN_STONE, fountainWaterMaterial, latheGeometry, dressFountain,
} from './parkfountain.js';
import * as P from './greenhouseplan.js';
import { hash01 } from './warehouselook.js';
import { frondGeometry, tint, shade, collector, finishMesh, memo } from './greenhouseplants.js';
import { pavedGeometry } from './greenhouseglass.js';

export const GH_TREE_SALT = 0x61a77;

const TAU = Math.PI * 2;

// The Park's two-tier fountain: three constructor slots (basin, water disc, spire), then dressFountain adds the upper
// water, the falling drops and the ripples (one clock, frozen by reduced motion).
export function fountainCourt({ reducedMotion = false } = {}) {
  return withLocalUuids('greenhouse-fountain', () => {
    const stone = () => Object.assign(litMaterial(FOUNTAIN_STONE.color, surfaceProps('cobble')), { roughness: FOUNTAIN_STONE.roughness });
    const fountain = new THREE.Group();
    fountain.name = 'ghFountain';
    const basin = new THREE.Mesh(latheGeometry(BASIN_PROFILE), stone());
    basin.name = 'fountainBasin';
    const water = new THREE.Mesh(new THREE.CylinderGeometry(BASIN_WATER.r, BASIN_WATER.r, BASIN_WATER.h, BASIN_WATER.segments), fountainWaterMaterial());
    water.position.y = BASIN_WATER.top - BASIN_WATER.h / 2;
    water.name = 'fountainWater';
    const spire = new THREE.Mesh(latheGeometry(SPIRE_PROFILE), stone());
    spire.name = 'fountainSpire';
    fountain.add(basin, water, spire);
    dressFountain(fountain, { reducedMotion });
    fountain.position.set(P.FOUNTAIN.x, 0, P.FOUNTAIN.z);
    return fountain;
  });
}

// The watering can: a galvanised body, a long spout with a rose, a loop handle. Origin at its foot.
export function canGeometry() {
  const col = collector();
  const body = tint(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), 0x6a9aa8);
  col.add(body, 0, 0.1, 0, {});
  col.add(tint(new THREE.TorusGeometry(0.1, 0.012, 4, 8, Math.PI * 1.2), 0x4e7a88), -0.1, 0.17, 0, { roll: 1.1 });
  const spout = tint(new THREE.CylinderGeometry(0.014, 0.03, 0.26, 5), 0x6a9aa8);
  col.add(spout, 0.2, 0.2, 0, { roll: -0.95 });
  col.add(tint(new THREE.CylinderGeometry(0.05, 0.035, 0.04, 8), 0x4e7a88), 0.31, 0.31, 0, { roll: -0.95 });
  col.add(tint(new THREE.BoxGeometry(0.1, 0.01, 0.04), 0x4e7a88), 0, 0.205, 0, {});
  return col.merged();
}
export function canMesh() {
  const m = finishMesh('ghCan', canGeometry());
  m.userData.tippable = false;
  return m;
}

// The potting bench: a slab on legs with a lower shelf, a tray of earth for the seeds, a hook post for the can, a
// little notice board and two stacked clay pots. Origin: the bench's centre on the ground.
export function pottingBench() {
  const B = P.POTTING;
  const col = collector();
  const wood = 0xa88258, dark = 0x7a5a3a;
  col.add(tint(new THREE.BoxGeometry(B.w, 0.08, B.d), wood), B.x, B.h - 0.04, B.z, {});
  col.add(tint(new THREE.BoxGeometry(B.w - 0.2, 0.05, B.d - 0.1), 0x8e6a44), B.x, 0.3, B.z, {});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) col.add(tint(new THREE.BoxGeometry(0.09, B.h, 0.09), dark), B.x + sx * (B.w / 2 - 0.1), B.h / 2, B.z + sz * (B.d / 2 - 0.1), {});
  // the seed tray: a shallow box of dark earth with a row of tiny bare furrows
  const tx = B.tray.x - B.x, tz = B.tray.z - B.z;
  col.add(tint(new THREE.BoxGeometry(0.8, 0.07, 0.5), 0x6a4a30), B.tray.x, B.h + 0.035, B.tray.z, {});
  col.add(tint(new THREE.BoxGeometry(0.72, 0.02, 0.42), 0x3c2a1c), B.tray.x, B.h + 0.075, B.tray.z, {});
  void tx; void tz;
  // the can's hook post and notice board (a pale card with two dark marks that are a packet and a drop)
  const hx = B.canHome.x - 0.6, hz = B.canHome.z - 0.3;
  col.add(tint(new THREE.BoxGeometry(0.1, 1.5, 0.1), dark), hx, 0.75, hz, {});
  col.add(tint(new THREE.BoxGeometry(0.34, 0.04, 0.04), dark), hx + 0.17, 1.3, hz, {});
  col.add(tint(new THREE.BoxGeometry(0.5, 0.4, 0.04), 0xf0e6c8), hx, 1.65, hz, {});
  col.add(tint(new THREE.CircleGeometry(0.07, 8), 0x4a8aa8), hx, 1.64, hz + 0.025, {});
  // two clay pots stacked on the shelf, a trowel stuck in the earth
  const potG = tint(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 8), 0xb8613c);
  col.add(potG, B.x - 0.9, 0.4, B.z, {});
  col.add(potG, B.x - 0.9, 0.58, B.z + 0.02, { scale: 0.92 });
  col.add(tint(new THREE.BoxGeometry(0.05, 0.02, 0.2), 0x9aa0a6), B.tray.x + 0.15, B.h + 0.12, B.tray.z - 0.1, { tilt: 0.3 });
  col.add(tint(new THREE.BoxGeometry(0.03, 0.03, 0.14), 0x6a4a30), B.tray.x + 0.15, B.h + 0.2, B.tray.z + 0.02, {});
  return finishMesh('ghBench', col.merged());
}

// The kitchen bed: a low raised frame of boards round dark earth.
export function kitchenBed() {
  const K = P.KITCHEN_BED;
  const col = collector();
  col.add(tint(new THREE.BoxGeometry(K.w - 0.2, 0.18, K.d - 0.2), 0x3e2c1d), K.x, 0.09, K.z, {});
  for (const [w, d, x, z] of [[K.w, 0.1, 0, -K.d / 2], [K.w, 0.1, 0, K.d / 2], [0.1, K.d, -K.w / 2, 0], [0.1, K.d, K.w / 2, 0]]) {
    col.add(tint(new THREE.BoxGeometry(w, 0.28, d), 0x9a7650), K.x + x, 0.14, K.z + z, {});
  }
  return finishMesh('ghKitchenBed', col.merged());
}

// The eight garden pots (the job picks four): a clay pot and a bush of leaves, each leaves-mesh its own so a watered
// one can perk up. Returns { pots, leaves[8] }: `pots` is one merged mesh.
const POT_LEAF = memo(() => frondGeometry({ len: 0.5, width: 0.16, segs: 3, rise: 0.8, droop: 1.1, fold: 0.3, jag: 0.2, base: 0x2f7a3a, tip: 0x62b04e, belly: 0.5 }));
const POT_FLOWER = (hex) => {
  const g = new THREE.IcosahedronGeometry(0.06, 0);
  return tint(g, hex);
};
export function gardenPots() {
  const col = collector();
  const pot = shade(tint(new THREE.CylinderGeometry(0.28, 0.2, 0.36, 8), 0xb8613c), { foot: 0.72, crown: 1.12 });
  const rim = shade(tint(new THREE.CylinderGeometry(0.31, 0.29, 0.07, 8), 0xa4532f), { foot: 0.9, crown: 1.15 });
  const soil = tint(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 8), 0x33241a);
  const leaves = [];
  P.ALL_POT_SPOTS.forEach(({ x, z }, i) => {
    col.add(pot, x, 0.18, z, { k: 0.9 + 0.2 * hash01(i, 4, 0x6c5), warm: (hash01(i, 6, 0x6c5) - 0.5) * 0.25 });
    col.add(rim, x, 0.38, z, {});
    col.add(soil, x, 0.4, z, {});
    const lc = collector();
    for (let k = 0; k < 7; k++) lc.add(POT_LEAF(), 0, 0.4, 0, { yaw: -((k / 7) * TAU + i), scale: 0.9 + 0.2 * ((k * 7 + i) % 3) / 2 });
    const blooms = [0xf27ab8, 0xf5d042, 0xffffff, 0xe84a7a][i % 4];
    for (let k = 0; k < 3; k++) lc.add(POT_FLOWER(blooms), Math.cos(k * 2.1 + i) * 0.14, 0.62 + k * 0.03, Math.sin(k * 2.1 + i) * 0.14, {});
    const m = finishMesh(`ghPot-${i}`, lc.merged());
    m.position.set(x, 0, z);
    leaves.push(m);
  });
  return { pots: finishMesh('ghPots', col.merged()), leaves };
}

// A little cloud that hangs over a thirsty pot: three flattened blobs.
export function thirstCloud() {
  const col = collector();
  col.add(tint(new THREE.IcosahedronGeometry(0.16, 0), 0xb9c4cf), -0.12, 0, 0, { scale: 1 });
  col.add(tint(new THREE.IcosahedronGeometry(0.2, 0), 0xc4ced8), 0.04, 0.04, 0.02, { scale: 1 });
  col.add(tint(new THREE.IcosahedronGeometry(0.14, 0), 0xb9c4cf), 0.2, -0.01, -0.02, { scale: 1 });
  const m = finishMesh('ghCloud', col.merged(), { material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.85 }) });
  m.scale.set(1, 0.6, 1);
  return m;
}

// A seed packet: a small paper envelope with a green seedling printed on it. Stands up, leans a little.
export function packetMesh(i = 0) {
  const col = collector();
  col.add(tint(new THREE.BoxGeometry(0.2, 0.28, 0.02), [0xf6e7b4, 0xf4d4d0, 0xcfe7f4][i % 3]), 0, 0.14, 0, {});
  col.add(tint(new THREE.BoxGeometry(0.2, 0.05, 0.024), 0x6aa84a), 0, 0.255, 0, {});
  col.add(tint(new THREE.ConeGeometry(0.05, 0.1, 4), 0x4f9a46), 0, 0.14, 0.014, {});
  const m = finishMesh(`ghPacket-${i}`, col.merged());
  m.rotation.set(-1.15, 0, 0); // lying on the ground, a corner up
  m.userData.packet = i;
  return m;
}

// The sprouts that pop up in the kitchen bed: five small shoots of two leaves each, one mesh scaled from nothing.
const SPROUT_LEAF = memo(() => frondGeometry({ len: 0.26, width: 0.1, segs: 2, rise: 0.9, droop: 0.9, fold: 0.2, base: 0x4f9a3a, tip: 0x9ad65a, belly: 0.5 }));
export function sproutsMesh() {
  const col = collector();
  for (const [sx, sz] of P.SPROUT_SPOTS) {
    const x = sx - P.KITCHEN_BED.x, z = sz - P.KITCHEN_BED.z; // about the bed's centre, so the pop-up scales from the bed
    for (let k = 0; k < 3; k++) col.add(SPROUT_LEAF(), x, 0.18, z, { yaw: -(k * TAU / 3 + x), scale: 1 });
    col.add(tint(new THREE.CylinderGeometry(0.008, 0.01, 0.12, 4), 0x6aa84a), x, 0.2, z, {});
  }
  const m = finishMesh('ghSprouts', col.merged());
  m.position.set(P.KITCHEN_BED.x, 0, P.KITCHEN_BED.z);
  m.scale.setScalar(0.001);
  m.visible = false;
  return m;
}

// =============================================================================================================
// MILESTONE G3: THE GARDEN FILLS. Four merged meshes (flat ground, street furniture and beds, the shed's kit, the trees), each
// vertex-coloured and made from a handful of small geometries placed by matrix, as the plants are. A look is a function of the
// place (hash01); nothing here draws a random number or reads a clock.
// =============================================================================================================
const flat = (g) => { g.rotateX(-Math.PI / 2); return g; };
const slab = (w, h, d, hex) => tint(new THREE.BoxGeometry(w, h, d), hex);
const seg = (col, x0, z0, x1, z1, w, h, hex, y = 0) => {
  const len = Math.hypot(x1 - x0, z1 - z0);
  col.add(slab(len, h, w, hex), (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2, { yaw: -Math.atan2(z1 - z0, x1 - x0) });
};
const bench = (col, b) => {
  col.add(slab(b.w, 0.07, b.d, 0xa07a52), b.x, b.y - 0.035, b.z, {});
  col.add(slab(b.w, 0.3, 0.05, 0x8e6a44), b.x, b.y + 0.18, b.z - b.d / 2 + 0.03, {});
  for (const sx of [-1, 1]) col.add(slab(0.07, b.y - 0.07, b.d - 0.1, 0x4a4a4e), b.x + sx * (b.w / 2 - 0.1), (b.y - 0.07) / 2, b.z, {});
};

// Flat things a cat walks over: the court's gravel, the paths, the fountain's flagstone ring, the sunny patch by the bench, the
// kitchen garden's earth strips. y a hair over the ground, drawn under everything else.
export function groundDress() {
  const col = collector();
  const C = P.COURT;
  col.add(slab(C.x1 - C.x0, 0.02, C.z1 - C.z0, 0xb9ad96), (C.x0 + C.x1) / 2, 0.01, (C.z0 + C.z1) / 2, {});
  // beauty round 1: the court is laid in flagstones (hashed tones, a worn middle, a darker edge), not one flat slab
  col.add(pavedGeometry(C.x1 - C.x0 - 0.2, C.z1 - C.z0 - 0.2, 0xcfc3aa, { cell: 1.6, seed: 0x6c0, edge: 0.7, ao: 0.12 }), (C.x0 + C.x1) / 2, 0.024, (C.z0 + C.z1) / 2, {});
  // the pond's wet bank: a ring of dark soil under the stones, so the water meets the lawn on something (28 segments, one ring)
  col.add(flat(tint(new THREE.RingGeometry(P.POND.r - 0.25, P.POND.r + 0.55, 36), 0x7c6b48)), P.POND.x, 0.012, P.POND.z, {});
  // the pond's bank: a ring of rounded stones and a few paler ones, each turned and sized on its hash
  const stone = tint(new THREE.IcosahedronGeometry(1, 0), 0x8f9288);
  const stoneHi = tint(new THREE.IcosahedronGeometry(1, 0), 0xb0b0a2);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + hash01(i, 3, 0x9d1) * 0.2;
    const r = P.POND.r + 0.1 + hash01(i, 5, 0x9d1) * 0.5;
    const sc = 0.14 + hash01(i, 7, 0x9d1) * 0.2;
    if (hash01(i, 9, 0x9d1) < 0.25) continue; // gaps, so the bank is not a necklace
    col.add(i % 3 ? stone : stoneHi, P.POND.x + Math.cos(a) * r, sc * 0.3, P.POND.z + Math.sin(a) * r, { scale: sc, sy: sc * 0.6, yaw: a * 3 });
  }
  col.add(flat(tint(new THREE.RingGeometry(P.FOUNTAIN.r + 0.1, P.FOUNTAIN.r + 2.2, 28), 0xcdc2ac)), P.FOUNTAIN.x, 0.016, P.FOUNTAIN.z, {});
  // the path from the court to the fountain ring, and from the ring to the Palm House's south door
  col.add(slab(2.6, 0.02, 26 - (P.FOUNTAIN.z + 5.4), 0xc9bda5), 0, 0.012, (26 + P.FOUNTAIN.z + 5.4) / 2, {});
  col.add(slab(2.6, 0.02, P.FOUNTAIN.z - 5.4, 0xc9bda5), 0, 0.012, (P.FOUNTAIN.z - 5.4) / 2, {});
  col.add(pavedGeometry(2.5, 26 - (P.FOUNTAIN.z + 5.4) - 0.1, 0xd4c8b0, { cell: 1.25, seed: 0x6c1, edge: 0.3, ao: 0.08 }), 0, 0.0235, (26 + P.FOUNTAIN.z + 5.4) / 2, {});
  col.add(pavedGeometry(2.5, P.FOUNTAIN.z - 5.4 - 0.1, 0xd4c8b0, { cell: 1.25, seed: 0x6c2, edge: 0.3, ao: 0.08 }), 0, 0.0235, (P.FOUNTAIN.z - 5.4) / 2, {});
  // the sunny flagstones by the bench
  for (let i = 0; i < 6; i++) col.add(slab(0.9, 0.02, 0.9, i % 2 ? 0xd8cdb6 : 0xcfc4ac), P.SUNNY_BENCH.x - 1.4 + (i % 3) * 1.4, 0.014, P.SUNNY_BENCH.z + 0.9 + Math.floor(i / 3) * 1.1, {});
  // the kitchen garden's dug rows
  for (let i = 0; i < 4; i++) col.add(slab(5, 0.03, 0.55, 0x5c4630), 30 + (i % 2) * 0.4, 0.015, 24.5 + i * 1.1, {});
  return finishMesh('ghGround', col.merged());
}

// Street furniture and the beds: two lamps, three benches, the signpost, four clipped hedges, the catnip beds, the willow log. One mesh.
export function streetKit() {
  const col = collector();
  for (const l of P.COURT_LAMPS) {
    col.add(tint(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6), 0x3a3a40), l.x, 1.3, l.z, {});
    col.add(tint(new THREE.SphereGeometry(0.2, 8, 6), 0xfff0c0), l.x, 2.7, l.z, {});
    col.add(tint(new THREE.CylinderGeometry(0.22, 0.2, 0.06, 8), 0x3a3a40), l.x, 2.52, l.z, {});
  }
  for (const b of [P.COURT_BENCH, P.SUNNY_BENCH, P.POND_BENCH]) bench(col, b);
  // the signpost at the court's south edge: a post and an arrow board (the gate itself is milestone G4's)
  col.add(slab(0.12, 1.6, 0.12, 0x6e5030), P.SIGNPOST.x, 0.8, P.SIGNPOST.z, {});
  col.add(slab(0.9, 0.3, 0.05, 0xe8dcc0), P.SIGNPOST.x, 1.35, P.SIGNPOST.z + 0.08, {});
  col.add(slab(0.3, 0.06, 0.06, 0x6aa84a), P.SIGNPOST.x + 0.1, 1.35, P.SIGNPOST.z + 0.12, {});
  // hedges: a dark body with a lighter top and a few paler leaves
  for (const [x0, z0, x1, z1] of P.HEDGES) {
    seg(col, x0, z0, x1, z1, 0.8, 0.9, 0x2f6a34);
    seg(col, x0, z0, x1, z1, 0.64, 0.14, 0x4a8a44, 0.9);
  }
  // catnip beds: a low frame round dark earth, a mat of grey-green catnip with violet-blue flower spikes
  const leaf = tint(new THREE.IcosahedronGeometry(0.2, 0), 0x86a98a);
  const spike = tint(new THREE.ConeGeometry(0.05, 0.28, 5), 0x8a78d8);
  for (const bed of P.CATNIP_BEDS) {
    col.add(slab(bed.w, 0.12, bed.d, 0x4a3524), bed.x, 0.06, bed.z, {});
    for (const [w, d, x, z] of [[bed.w, 0.1, 0, -bed.d / 2], [bed.w, 0.1, 0, bed.d / 2], [0.1, bed.d, -bed.w / 2, 0], [0.1, bed.d, bed.w / 2, 0]]) col.add(slab(w, 0.18, d, 0x9a7650), bed.x + x, 0.09, bed.z + z, {});
    for (let i = 0; i < 9; i++) {
      const x = bed.x + (((i % 3) - 1) * bed.w) / 3.4;
      const z = bed.z + (Math.floor(i / 3) - 1) * (bed.d / 3.2);
      col.add(leaf, x, 0.2, z, { scale: 1 + 0.15 * ((i * 5) % 3), sy: 0.8 });
      col.add(spike, x + 0.06, 0.38, z - 0.04, { tilt: 0.1 * ((i % 3) - 1) });
    }
  }
  // the fallen willow log by the pond: a bark cylinder on its side, a lighter cut end, a few moss knobs
  const L = P.LOG;
  col.add(tint(new THREE.CylinderGeometry(L.r * 0.9, L.r, L.length, 10).rotateX(Math.PI / 2), 0x6a4a2e), L.x, L.r, L.z, {});
  col.add(tint(new THREE.CircleGeometry(L.r * 0.9, 10), 0xc9a878), L.x, L.r, L.z + L.length / 2 + 0.01, {});
  for (const k of [-1, 0, 1]) col.add(tint(new THREE.IcosahedronGeometry(0.14, 0), 0x5d8a3e), L.x + 0.1, L.r * 2 - 0.03, L.z + k * 0.9, { sy: 0.5 });
  return finishMesh('ghStreet', col.merged());
}

// The way home (G4): a little stone archway with a lantern and ivy, standing at RETURN_ARCH facing west (she walks west into it),
// with one faint warm disc in the gap (the one transparent draw). The Park's archway is its twin (src/teleport.js, `own`: the
// gate draws nothing here). Two meshes: the stone body (vertex colours) and the disc.
export function returnArch() {
  const A = P.RETURN_ARCH;
  const col = collector();
  const stone = [0xb69a74, 0xad9168];
  for (const [i, sz] of [-1, 1].entries()) col.add(slab(0.5, A.spring, 0.5, stone[i]), 0, A.spring / 2, sz * A.pillarGap, {});
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (i / 6);
    const mid = i === 3;
    col.add(slab(0.5, mid ? 0.6 : 0.46, mid ? 0.72 : 0.62, mid ? 0xd2b88a : stone[i % 2]), 0, A.spring + Math.sin(a) * A.pillarGap, Math.cos(a) * A.pillarGap, { tilt: Math.PI / 2 - a });
  }
  const ivy = tint(new THREE.IcosahedronGeometry(0.22, 0), 0x4e8a42);
  for (const [y, z, k] of [[0.4, -1.08, 1], [1.0, -0.86, 0.8], [1.6, -1.1, 0.9], [2.5, -1.2, 0.8], [0.5, 1.1, 0.9], [1.3, 0.84, 0.8]]) col.add(ivy, 0.12, y, z, { scale: k, sy: k * 0.8 });
  col.add(slab(0.2, 0.26, 0.2, 0xffe08a), -0.34, A.spring + A.pillarGap + 0.62, 0, {});
  col.add(slab(0.3, 0.05, 0.3, 0x3a3a40), -0.34, A.spring + A.pillarGap + 0.78, 0, {});
  const body = finishMesh('ghReturnArchBody', col.merged());
  const discGeo = new THREE.CircleGeometry(0.78, 24).rotateY(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.set(0, 1.25, 0);
  disc.name = 'ghReturnArchDisc';
  disc.userData.noMerge = true;
  disc.userData.noCast = true;
  disc.castShadow = false;
  const g = new THREE.Group();
  g.name = 'ghReturnArch';
  g.add(body, disc);
  g.position.set(A.x, 0, A.z);
  return g;
}

// The potting shed (7 x 5, door west, roof 2.4), the rain barrel, two pot stacks, the cold frames and the bean rows' poles.
export function shedKit() {
  const col = collector();
  const S = P.SHED;
  const wall = 0x9a7a5a;
  col.add(slab(S.w, S.roof - 0.3, S.d, wall), S.x, (S.roof - 0.3) / 2, S.z, {});
  // beauty round 1: a weathered skirt of darker board at the foot, a stone footing round the base (contact), a pale lintel band under the eaves
  col.add(slab(S.w + 0.06, 0.45, S.d + 0.06, 0x6e5238), S.x, 0.225, S.z, {});
  col.add(slab(S.w + 0.3, 0.12, S.d + 0.3, 0x8f9288), S.x, 0.06, S.z, {});
  col.add(slab(S.w + 0.04, 0.12, S.d + 0.04, 0xb89a68), S.x, S.roof - 0.42, S.z, {});
  // a window box under the window: a trough of earth and three flowers
  col.add(slab(0.2, 0.14, 0.85, 0x7a5632), S.door.x - 0.12, 0.98, S.door.z - 1.4, {});
  for (let i = 0; i < 3; i++) col.add(tint(new THREE.IcosahedronGeometry(0.09, 0), [0xf0a0b8, 0xf6d860, 0xe88060][i]), S.door.x - 0.14, 1.12, S.door.z - 1.4 + (i - 1) * 0.28, {});
  // two flagstones to the door
  for (let i = 0; i < 3; i++) col.add(slab(0.7, 0.03, 0.6, i % 2 ? 0xb8b09c : 0xa8a692), S.door.x - 0.7 - i * 0.8, 0.015, S.door.z + (i % 2 ? 0.15 : -0.1), { yaw: i * 0.3 });
  // boards: dark battens down the long walls
  for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) col.add(slab(0.06, S.roof - 0.4, 0.04, hash01(i, sz, 0x5ed) < 0.4 ? 0x6a4c34 : 0x7a5c40), S.x - S.w / 2 + 0.6 + i * 1.16, (S.roof - 0.4) / 2, S.z + sz * (S.d / 2 + 0.02), {});
  // a low pitched roof (two leaning slabs), overhanging, with a lighter ridge
  for (const sz of [-1, 1]) col.add(slab(S.w + 0.5, 0.1, S.d / 2 + 0.35, 0x5a4a44), S.x, S.roof - 0.15, S.z + sz * (S.d / 4 + 0.05), { tilt: sz * 0.12 });
  col.add(slab(S.w + 0.5, 0.1, 0.2, 0x7a6a62), S.x, S.roof + 0.08, S.z, {});
  // the door (west wall) with a handle and a window beside it
  const D = S.door;
  col.add(slab(0.06, D.h, D.w, 0x5a7a52), D.x - 0.03, D.h / 2, D.z, {});
  col.add(tint(new THREE.SphereGeometry(0.04, 6, 4), 0xd8c070), D.x - 0.08, 0.95, D.z + 0.38, {});
  col.add(slab(0.05, 0.6, 0.8, 0xbfe0ea), D.x - 0.03, 1.3, D.z - 1.4, {});
  col.add(slab(0.07, 0.05, 0.92, 0xf0e6c8), D.x - 0.04, 0.98, D.z - 1.4, {});
  // the notice by the door: a pale card (the offer's note is the life's line)
  col.add(slab(0.04, 0.34, 0.26, 0xf0e6c8), D.x - 0.06, 1.55, D.z + 0.95, {});
  // the rain barrel: staves, two iron hoops, a lid of dark water
  const R = P.RAIN_BARREL;
  col.add(tint(new THREE.CylinderGeometry(R.r * 0.9, R.r * 0.82, R.h, 12), 0x7a5632), R.x, R.h / 2, R.z, {});
  for (const y of [0.25, R.h - 0.3]) col.add(tint(new THREE.CylinderGeometry(R.r * 0.93, R.r * 0.93, 0.05, 12), 0x3a3a40), R.x, y, R.z, {});
  col.add(tint(new THREE.CylinderGeometry(R.r * 0.78, R.r * 0.78, 0.02, 12), 0x4a7a90), R.x, R.h + 0.005, R.z, {});
  // pot stacks: three clay pots nested up to the stack's height, slightly turned
  for (const st of P.POT_STACKS) {
    const ph = st.h / 3;
    for (let i = 0; i < 3; i++) {
      col.add(tint(new THREE.CylinderGeometry(0.34 - i * 0.03, 0.24 - i * 0.03, ph + 0.02, 9), i % 2 ? 0xb8613c : 0xc46f46), st.x + 0.02 * i, ph * i + ph / 2, st.z - 0.02 * i, {});
      col.add(tint(new THREE.CylinderGeometry(0.37 - i * 0.03, 0.34 - i * 0.03, 0.06, 9), 0xa4532f), st.x + 0.02 * i, ph * (i + 1) - 0.02, st.z - 0.02 * i, {});
    }
  }
  // cold frames: a low wooden box with a tilted glass-green lid
  for (const f of P.COLD_FRAMES) {
    col.add(slab(f.w, f.h * 0.6, f.d, 0x9a7650), f.x, f.h * 0.3, f.z, {});
    col.add(slab(f.w - 0.1, 0.05, f.d - 0.05, 0xcfe8dc), f.x, f.h * 0.78, f.z, { tilt: -0.18 });
    col.add(slab(f.w - 0.3, 0.14, f.d - 0.3, 0x4f9a46), f.x, f.h * 0.6 + 0.06, f.z, {});
  }
  // bean poles: two A-frames of canes with a few leaves, east of the cold frames
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
    const x = 33 + r * 1.6;
    const z = 8 + i * 1.3;
    col.add(tint(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), 0xb89a68), x, 0.8, z, { roll: 0.18 });
    col.add(tint(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), 0xb89a68), x, 0.8, z, { roll: -0.18 });
    col.add(tint(new THREE.IcosahedronGeometry(0.16, 0), 0x4f9a46), x, 0.9, z, { sy: 1.5 });
  }
  return finishMesh('ghShed', col.merged(), { cast: true });
}

// The outer trees: a trunk and a few blobs of leaf, a hashed lean and tint; the tall willow at the pond hangs strands.
const WILLOW_STRAND = memo(() => frondGeometry({ len: 2.4, width: 0.16, segs: 3, rise: 0.5, droop: 2.4, fold: 0.1, base: 0x5f9a4e, tip: 0x8cc468, belly: 0.4 }));
export function trees() {
  const col = collector();
  const trunk = shade(tint(new THREE.CylinderGeometry(0.16, 0.26, 1, 6), 0x6a4a2e), { foot: 0.7, crown: 1.12, ribs: 3, ribDepth: 0.2 });
  const blob = (hex) => shade(tint(new THREE.IcosahedronGeometry(1, 0), hex), { foot: 0.66, crown: 1.16 });
  const greens = [0x3f8a3f, 0x4f9a46, 0x2f7a3a, 0x5aa04a];
  P.TREE_SPOTS.forEach(([x, z, h], i) => {
    const k = hash01(x, z, GH_TREE_SALT);
    const willow = h >= 9;
    col.add(trunk, x, (h * 0.45) / 2, z, { sy: h * 0.45, scale: willow ? 1.5 : 1 });
    const hex = greens[Math.floor(k * greens.length) % greens.length];
    const r = h * (willow ? 0.2 : 0.24);
    for (let j = 0; j < 3; j++) {
      const a = k * 6 + j * 2.1;
      col.add(blob(hex), x + Math.cos(a) * r * 0.45, h * 0.62 + j * 0.12 * h * 0.3, z + Math.sin(a) * r * 0.45, { scale: r * (1 - j * 0.12) });
    }
    if (willow) for (let j = 0; j < 12; j++) col.add(WILLOW_STRAND(), x + Math.cos(j * 0.52) * 0.5, h * 0.66, z + Math.sin(j * 0.52) * 0.5, { yaw: -(j * 0.52), tilt: 0 });
    void i;
  });
  return finishMesh('ghTrees', col.merged(), { cast: true });
}
