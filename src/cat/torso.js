import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The cat's "Version 2" proportions (docs/superpowers/specs/2026-10-31-cat-body-design.md):
// a shorter torso on longer legs. Numbers marked (sketch) come from the approved
// cat-shapes sketch; the rest keep today's cat where it already worked.

// The torso: radius, scale and centre height (sketch).
export const TORSO = {
  R: 0.32, SCALE: [0.8, 0.74, 1.12], CENTRE_Y: 0.43,
  // The deformation (sketch): a deep chest, slim waist just behind the middle,
  // round hips, a belly tucked up toward them, a gentle 0.08 haunch (the sketch's
  // first 0.24 was rejected) and a back that rises toward the hips.
  SHAPE: { chest: 0.16, chestLow: 0.12, waist: 0.14, waistZ: 0.15, waistW: 0.08, waistDrop: 0.08, hips: 0.12, tuck: 0.28, haunch: 0.08, haunchZ: 0.55, haunchZW: 0.07, haunchY: -0.15, haunchYW: 0.2, backRise: 0.07 },
  // [around, along the length]: 40 and 28 rings over the ~7 tabby bands.
  SEG: { full: [40, 40], simple: [24, 28] },
};

// The old torso. Every authored marking and accessory point was written in
// this frame, so markings convert their points through it to keep their direction.
export const LEGACY_BODY = { CENTRE: [0, 0.34, 0], SCALE: [0.85, 0.75, 1.35] };

// Legs (sketch), except BOTTOM_R: the paw's width was tuned against 0.058.
export const LEGS = { LEN: 0.35, HIP_Y: 0.39, FRONT_Z: -0.24, HIND_Z: 0.24, FRONT_X: 0.11, HIND_X: 0.12, TOP_R: 0.046, BOTTOM_R: 0.058 };
// The hind leg (sketch): a stouter top, the limb tipped back to the hock, and a
// thick thigh merged into the limb mesh (no extra mesh).
LEGS.HIND = { TOP_R: 0.05, HOCK_X: -0.18, HOCK_Z: 0.03, THIGH_R: 0.11, THIGH_SCALE: [0.85, 1.25, 1.05], THIGH_AT: [0, -0.015, 0.03] };

// The tail (sketch): five links rooted at the rump surface, ROOT_DY above the
// torso centre and ROOT_Z back, the root frame tipped down ROOT_TILT so link 0
// leaves level once the animator curls each link up by CURL (R3: the curl is a
// bend the animator owns, softened lying down and dropped when cross or scared).
// A root ball rounds the join into the rump; the whole tail is SCALE of size.
export const TAIL = { LINK: 0.14, R: 0.078, TAPER: 0.62, TIP: 0.006, CURL: 0.28, ROOT_TILT: 0.28, SCALE: 0.85, ROOT_DY: 0.10, ROOT_Z: 0.33, ROOT_BALL: 0.08 };

// The tail's radius at fraction u of its length (0 root, 1 tip).
export const tailR = (u) => TAIL.R * Math.pow(1 - u, TAIL.TAPER) + TAIL.TIP;

// The paw centre in leg-local space, so the sole stays exactly where it is today
// (old hip 0.3, old paw 0.2585 below it).
export const PAW_Y = -(LEGS.HIP_Y - 0.3 + 0.2585);

// The bare paw's half-height: radius 0.062, flattened to 0.62.
export const PAW_HALF = 0.062 * 0.62;

// A standing sole's height above the ground: the paw centre less the flattened
// paw's half-height.
export const PAW_SOLE_GAP = 0.3 - 0.2585 - PAW_HALF;

export const HEAD = { POS: [0, 0.70, -0.40], SCALE: 1.06 };

// The rig the poses in animator.js were written for: hip 0.3, hip-to-sole 0.2969.
export const REF_RIG = { HIP_Y: 0.30, REACH: 0.2585 + 0.062 * 0.62 };

// Per-state correction (metres, added after the pose and the long-leg fit):
// `body` moves every non-leg part, `head` overrides it for the head. Filled by
// measurement against the old rig's pose baseline (test/fixtures/catpose-baseline.json).
// The sit (requestPet, perch): with the shaped torso (deep chest, belly tucked
// toward the hips) the tilted-back rump rests 0.0204 above ground at fit 0 against
// 0.0246 for the old torso, so it comes UP by 0.004 and rests where the old one did.
export const POSE_FIT = {
  requestPet: { body: 0.004 },
  perch: { body: 0.004 },
};

// A point on the unit sphere (nose at -z, rump at +z) pushed into the cat's torso.
export function deformTorso(x, y, z, S = TORSO.SHAPE) {
  const front = Math.max(0, -z), back = Math.max(0, z);
  const waist = Math.exp(-((z - S.waistZ) ** 2) / S.waistW);
  let kx = 1 - S.waist * waist + S.hips * back * back;
  let ky = 1 + S.chest * front - S.waistDrop * waist;
  if (y < 0) ky *= 1 + S.chestLow * front - S.tuck * back * back;
  const haunch = Math.exp(-((z - S.haunchZ) ** 2) / S.haunchZW) * Math.exp(-((y - S.haunchY) ** 2) / S.haunchYW);
  kx *= 1 + S.haunch * haunch;
  x *= kx; y *= ky;
  if (y > 0) y += S.backRise * (z + 1) * 0.5 * (1 - x * x);
  return [x, y, z];
}

// One welded, deformed surface. Poles sit at nose and rump, the seam runs along
// the belly. `userData.unit` keeps each vertex's undeformed direction.
export function torsoGeometry(r, around, along) {
  let geo = new THREE.SphereGeometry(r, around, along).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  const unit = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const L = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
    const ux = p.getX(i) / L, uy = p.getY(i) / L, uz = p.getZ(i) / L;
    unit[i * 3] = ux; unit[i * 3 + 1] = uy; unit[i * 3 + 2] = uz;
    const [x, y, z] = deformTorso(ux, uy, uz);
    p.setXYZ(i, x * r, y * r, z * r);
  }
  geo.userData.unit = unit;
  geo.computeVertexNormals();
  return geo;
}

// The body-local point (before the mesh's scale) along unit direction `dir`.
export function torsoSurface(dir) {
  const L = Math.hypot(dir[0], dir[1], dir[2]);
  const [x, y, z] = deformTorso(dir[0] / L, dir[1] / L, dir[2] / L);
  return new THREE.Vector3(x * TORSO.R, y * TORSO.R, z * TORSO.R);
}
