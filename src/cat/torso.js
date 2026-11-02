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

// Legs (sketch): hip pivots and the limb length. Each limb's shape is in
// limbs.js (LEG_SHAPE).
export const LEGS = { LEN: 0.35, HIP_Y: 0.39, FRONT_Z: -0.24, HIND_Z: 0.24, FRONT_X: 0.11, HIND_X: 0.12 };

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

// How much a coat is inflated over the fur (signed off by screenshot, Task 10):
// SHELL_INFLATE on the back and flanks, SHELL_INFLATE_UNDER under the belly,
// where the crouching poses sit on the ground. Blended on the undeformed unit y.
export const SHELL_INFLATE = 1.06;
export const SHELL_INFLATE_UNDER = 1.01;
export function shellInflate(uy) {
  const t = Math.min(1, Math.max(0, (uy + 0.55) / 0.5));
  return SHELL_INFLATE_UNDER + (SHELL_INFLATE - SHELL_INFLATE_UNDER) * t * t * (3 - 2 * t);
}

export const HEAD = { POS: [0, 0.70, -0.40], SCALE: 1.06 };
// The skull: a sphere of radius R scaled by SCALE, centred on the head's origin
// (model.js buildCat). scarmesh.js lays a face scar on this same ellipsoid.
export const SKULL = Object.freeze({ R: 0.21, SCALE: Object.freeze([1, 0.92, 0.95]) });

// The rig the poses in animator.js were written for: hip 0.3, hip-to-sole 0.2969.
export const REF_RIG = { HIP_Y: 0.30, REACH: 0.2585 + 0.062 * 0.62 };

// Per-state correction (metres, added after the pose and the long-leg fit):
// `body` moves every non-leg part, `head` overrides it for the head. Filled by
// measurement against the old rig's pose baseline (test/fixtures/catpose-baseline.json).
// The sit (requestPet, perch): with the shaped torso (deep chest, belly tucked
// toward the hips) the tilted-back rump rests 0.0204 above ground at fit 0 against
// 0.0246 for the old torso, so it comes UP by 0.004 and rests where the old one did.
export const POSE_FIT = Object.freeze({
  requestPet: Object.freeze({ body: 0.004 }),
  perch: Object.freeze({ body: 0.004 }),
});

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

// A back-slot point authored against the old torso, moved onto the new one
// with the same "how far from the fur": its unit-ellipsoid coordinates in
// LEGACY_BODY (scaled by the cat's body factors f), radius ρ and direction d,
// land on the new deformed torso at the same ρ along d. `minRho` floors ρ, so
// an item's main piece that sat sunk in the old fur is pushed out onto the new
// surface (BACK_MIN_RHO). A point far off the body (ρ > 1.5, e.g. something
// floating) just rises with the torso, 0.09.
// Returned in the cat group's own frame (g-local, before g.scale and before the
// leg lift), as [x, y, z].
export function torsoRetarget(point, f = [1, 1, 1], minRho = 0) {
  const [px, py, pz] = point;
  const c = LEGACY_BODY.CENTRE, ls = LEGACY_BODY.SCALE;
  const u = [0, 1, 2].map((i) => ([px, py, pz][i] - c[i]) / (TORSO.R * ls[i] * f[i]));
  const rho = Math.hypot(...u);
  if (rho > 1.5) return [px, py + 0.09, pz];
  const [x, y, z] = deformTorso(u[0] / rho, u[1] / rho, u[2] / rho);
  const k = TORSO.R * Math.max(rho, minRho);
  return [TORSO.SCALE[0] * f[0] * x * k, TORSO.CENTRE_Y + TORSO.SCALE[1] * f[1] * y * k, TORSO.SCALE[2] * f[2] * z * k];
}

// The least ρ a back item's main piece (pack, tank, wing, cape) sits at: its
// centre just outside the fur, so it rests on the back rather than in it. Its
// small parts (nozzles, clasps) keep their old offsets from it.
export const BACK_MIN_RHO = 1.04;

// How far the neck-slot items, the visit-prize neck items and the cat's collar
// move forward (head-local z, front is -z) to lie on the new deeper chest
// instead of inside it. Signed off by screenshot (R5, Task 10). Never Hagrid's.
export const NECK_FORWARD = -0.10;
// Fluffy cats (the ruff): their neck items, neck prizes and collar drop DOWN
// onto the ruff's front, under the chin, and move only a little further
// forward (head-local; `forward` adds to NECK_FORWARD, front is -z; `drop` is
// taken off y). Moving them forward alone, past the ruff, put them in front of
// the face: the ruff reaches almost to the muzzle. Signed off by screenshot (R5).
export const NECK_FLUFFY = { forward: -0.02, drop: 0.07 };
// The hood bunched at the neck (under a hat) keeps its old head-relative spot,
// HEAD.POS + (0, -0.06, 0.08) x HEAD.SCALE, mostly hidden in the neck fur: no
// NECK_FORWARD, no NECK_FLUFFY (forward, the roll crossed the face at mouth
// level). It is lowered by HOOD_BUNCH_DROP (head-local y) so that no part of
// it reaches above the mouth (the bottom of the nose) on any cat.
export const HOOD_BUNCH_DROP = 0.08;
