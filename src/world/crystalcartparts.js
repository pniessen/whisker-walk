// =============================================================================
// THE CRYSTAL CAVE, WING C: LUMI'S CART ON THE OLD TRACKS (milestone C4): THE DRAWING. The track (rails, sleepers, the two wooden platforms, the rubber bumpers and the lamp
// posts) is ONE merged mesh that follows the floor, no drops; the two platform lanterns are one more small mesh (emissive balls, never lights). The cart is a small friendly wooden
// box on four wheels with a pink rim and a lantern on a hook (an emissive ball and a soft halo: never a light). Everything is flagged out of the static merge and draws no random number.
// Imports THREE (already in the cave's own chunk), so this stage costs only its own code.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { paint, dotTexture } from './crystalparts.js';
import { crystalY } from './crystalplan.js';
import * as C from './crystalcartplan.js';

const flag = (m, name) => {
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  m.userData.noMerge = true;
  m.userData.noCast = true;
  m.userData.noContactShadow = true;
  return m;
};

const WOOD = [0x8a6a4a, 0x9a7a54, 0x7c5e42];
const IRON = 0x6c6478;
const RUBBER = 0xff7a9a;

// A box from za to zb (za < zb) at x, `w` wide and `h` thick, `lift` over the floor at both ends and tilted to follow it.
function railBox(x, za, zb, w, h, lift, hex) {
  const ya = crystalY(x, za) + lift, yb = crystalY(x, zb) + lift;
  const len = Math.abs(zb - za);
  const g = new THREE.BoxGeometry(w, h, len + 0.02);
  g.rotateX(-Math.atan2(yb - ya, len)); // za < zb always (the caller walks the line south to north)
  g.translate(x, (ya + yb) / 2, (za + zb) / 2);
  return paint(g, hex);
}

export function drawTrack() {
  const T = C.TRACK;
  const geos = [];
  const step = 1.2;
  const zs = [];
  for (let z = T.zSouth; z < T.zNorth - 1e-6; z += step) zs.push(z);
  zs.push(T.zNorth);
  for (const dx of [-T.railGap / 2, T.railGap / 2]) {
    for (let i = 0; i + 1 < zs.length; i++) geos.push(railBox(T.x + dx, zs[i], zs[i + 1], T.railW, 0.07, 0.1, IRON));
  }
  let k = 0;
  for (let z = T.zSouth; z <= T.zNorth + 1e-6; z += T.sleeperEvery, k++) {
    const g = new THREE.BoxGeometry(T.sleeperHalf * 2, 0.06, 0.18).translate(T.x, crystalY(T.x, z) + 0.05, z);
    geos.push(paint(g, WOOD[k % 3], Math.sin(k * 1.7)));
  }
  // the decks: boards across the line's ends, each on its own bit of floor
  for (const p of C.PLATFORMS) {
    let b = 0;
    for (let z = p.z0 + 0.15; z <= p.z1 - 0.1; z += 0.34, b++) {
      const x = (C.PLATFORM.minX + C.PLATFORM.maxX) / 2;
      const g = new THREE.BoxGeometry(C.PLATFORM.maxX - C.PLATFORM.minX, 0.06, 0.3).translate(x, crystalY(x, z) + 0.07, z);
      geos.push(paint(g, WOOD[(b + 1) % 3], Math.sin(b + z)));
    }
    // the bumper: two low posts and a soft rubber roll across them, just past the cart's nose
    const side = p.id === 'north' ? 1 : -1;
    const bz = p.bumperZ + side * 0.12;
    for (const dx of [-0.34, 0.34]) geos.push(paint(new THREE.BoxGeometry(0.12, 0.34, 0.12).translate(T.x + dx, crystalY(T.x, bz) + 0.3, bz), 0x6a4e36));
    geos.push(paint(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 10).rotateZ(Math.PI / 2).translate(T.x, crystalY(T.x, bz - side * 0.1) + 0.3, bz - side * 0.1), RUBBER));
    // a lamp post at the deck's outer east corner
    const lx = C.PLATFORM.maxX - 0.15, lz = p.id === 'north' ? p.z1 - 0.2 : p.z0 + 0.2;
    geos.push(paint(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 6).translate(lx, crystalY(lx, lz) + 0.5, lz), 0x6a4e36));
  }
  return flag(new THREE.Mesh(mergeGeometries(geos), litMaterial(0xffffff, { vertexColors: true, roughness: 0.9 })), 'cc:track');
}

/** The two platform lanterns' emissive balls (plain meshes on the lamp posts; no light). */
export function drawPlatformLamps() {
  const geos = C.PLATFORMS.map((p) => {
    const lx = C.PLATFORM.maxX - 0.15, lz = p.id === 'north' ? p.z1 - 0.2 : p.z0 + 0.2;
    return new THREE.SphereGeometry(0.1, 8, 6).translate(lx, crystalY(lx, lz) + 1.05, lz);
  });
  return flag(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xffd98a })), 'cc:platformlamps');
}

// ---- the cart ----------------------------------------------------------------------------------------------------------------
// Local axes: +z is the front. A shallow wooden box (floor, four sides, a pink rim), four wheels, a hook post at the side with the lantern. About 1.6 m long, 1.1 m wide, 0.55 m tall.
export function drawCart() {
  const g = new THREE.Group();
  const L = C.CART.len, H = C.CART.half;
  const parts = [paint(new THREE.BoxGeometry(H * 2, 0.06, L).translate(0, 0.22, 0), 0xb8864a)];
  for (const dx of [-H, H]) parts.push(paint(new THREE.BoxGeometry(0.06, 0.3, L).translate(dx, 0.37, 0), 0xc89a5a, dx));
  for (const dz of [-L / 2, L / 2]) parts.push(paint(new THREE.BoxGeometry(H * 2, 0.3, 0.06).translate(0, 0.37, dz), 0xc89a5a, dz));
  parts.push(paint(new THREE.BoxGeometry(H * 2 + 0.1, 0.05, 0.08).translate(0, 0.54, L / 2), 0xffa8c4), paint(new THREE.BoxGeometry(H * 2 + 0.1, 0.05, 0.08).translate(0, 0.54, -L / 2), 0xffa8c4));
  for (const dx of [-H, H]) parts.push(paint(new THREE.BoxGeometry(0.07, 0.05, L).translate(dx, 0.54, 0), 0xffa8c4));
  for (const dx of [-H - 0.04, H + 0.04]) for (const dz of [-0.5, 0.5]) parts.push(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 10).rotateZ(Math.PI / 2).translate(dx, 0.15, dz), IRON));
  parts.push(paint(new THREE.CylinderGeometry(0.03, 0.04, 0.55, 6).translate(H + 0.02, 0.8, -0.55), 0x6a4e36));
  const body = flag(new THREE.Mesh(mergeGeometries(parts), litMaterial(0xffffff, { vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })), 'cc:cart:body');
  const lamp = flag(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd98a })), 'cc:cart:lamp');
  lamp.position.set(H + 0.02, C.CART.lanternY - 0.12, -0.55);
  const halo = flag(new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffcf80, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })), 'cc:cart:halo');
  halo.scale.setScalar(0.7);
  halo.position.copy(lamp.position);
  g.add(body, lamp, halo);
  g.name = 'cc:cart';
  g.rotation.order = 'YXZ';
  return { group: g, halo };
}
