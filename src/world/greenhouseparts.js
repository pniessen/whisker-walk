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
import { frondGeometry, tint, collector, finishMesh, memo } from './greenhouseplants.js';

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
  const pot = tint(new THREE.CylinderGeometry(0.28, 0.2, 0.36, 8), 0xb8613c);
  const rim = tint(new THREE.CylinderGeometry(0.31, 0.29, 0.07, 8), 0xa4532f);
  const leaves = [];
  P.WATER_POT_SPOTS.forEach(({ x, z }, i) => {
    col.add(pot, x, 0.18, z, {});
    col.add(rim, x, 0.38, z, {});
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
