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
// Polish 1a, Task 5 (2026-11-02): the taper is even, R at the root losing
// TAPER of it by the tip (0.072 to 0.0135, a rounded end), and the root ball is
// no wider than the root. It was R (1 - u)^0.62 + 0.006 on a 0.08 ball: a
// thick, slowly narrowing tail that pinched to a 6 mm spike over its last link,
// which from the walk camera read as a lump with a horn on it. The tip is no
// rounder than 0.0135: the cross pose holds the tail straight up, and its tip
// sets the cat's top there, which the name tag clears (nametag.js CROSS_TAG_Y).
export const TAIL = { LINK: 0.14, R: 0.072, TAPER: 0.8125, CURL: 0.28, ROOT_TILT: 0.28, SCALE: 0.85, ROOT_DY: 0.10, ROOT_Z: 0.33, ROOT_BALL: 0.072 };

// The tail's radius at fraction u of its length (0 root, 1 tip).
export const tailR = (u) => TAIL.R * (1 - TAIL.TAPER * u);

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
// The sit (requestPet, perch), re-measured for the upright sit (polish-sit,
// 2026-11-02): at fit 0 the nose-up torso's rump (its lowest point) rests
// 0.0058 under the ground on every preset (0.0055 simple), so it comes UP by
// 0.006 and rests on it (0.0002 / 0.0005 above). The old 0.004 was measured
// for the nose-down torso, whose rump rested 0.0204 above ground.
export const POSE_FIT = Object.freeze({
  requestPet: Object.freeze({ body: 0.006 }),
  perch: Object.freeze({ body: 0.006 }),
});

// The sit (requestPet, perch): the classic Warrior Cats sit (polish-sit,
// 2026-11-02). It was a nose-down torso (rotation.x -0.5) on tucked haunches,
// which from the side read as a cat crouching to pounce. Now the torso pitches
// nose-UP, its rump on the ground and its shoulders high over the forelegs.
// Cats only (animator.js; ruling R1): Hagrid keeps his sit. Measured in the
// cat's frame on every preset, full and simple:
//   pitch (rad, + lifts the nose, which faces -z): 0.75, the spine about 43°
//     up. 0.85 stood the shoulders 0.716 high, where the head (held under the
//     standing cat's top, R3) sank into them; 0.65 still read as a crouch.
//   bodyDY (m, added to the sit's old bodyY - 0.02): -0.045, so the rump's
//     low point rests on the ground (with POSE_FIT). It is -(FOLDS.sit.drop -
//     0.02): the hind fold's top sits at the lowered hip (limbs.js).
//   bodyZ (m, body.position.z): -0.06. Pitched about its centre the torso's
//     shoulders swing back over the hips; moved forward, its rump's low point
//     is at z +0.075 (behind the centre), its top (0.689) at z -0.20, and the
//     front hips sit inside the chest (top 0.61 over a 0.39 hip, its
//     underside 0.21).
//   headDY, headDZ (m, the head's offset from where it stands; were +0.06 and
//     +0.1): +0.09 and +0.06. The head is held high (its centre 0.706, over
//     the shoulders' 0.689) and forward over the chest, so the sitting cat is
//     still no taller than the standing one (+0.0065; R3, the name tag's
//     margin) and the throat clears the chest: a bowtie's nearest point is
//     0.14-0.18 cm off the fur, a necktie's 0.45-0.66 cm (catsit.test.js).
//     Further back (+0.16, the first try) the neck items sank 5 cm into the chest.
//   chestDepth: the underside's own z (torso-local) is scaled by this about the
//     chest centre (keepChestUnderHead holds the centre put), so the chest does
//     not bulge forward like a ball (polish-catlooks: 0.75 brought every build's
//     front back 2.1-2.3 cm).
//   foreZ (metres, cat frame, - is forward): both front hips move forward by
//     this: -0.06, the hips at z -0.30, inside the chest; the paws stand 8.3 cm
//     behind the chest's front (the upper chest, y 0.46-0.48), as a sitting
//     cat's breast sits over its forelegs. (Digit's four hips also come in by
//     its torso's width share, animator.js.)
//   foreTilt (rad): 0, the legs hang plumb (the paw's own 0.012 offset leans
//     the hip-to-paw line 0.03 rad, Digit's longer leg 0.025). No swing means
//     fitLongLegs leaves each leg its fitted length, so the soles stay on the
//     ground at every legLen.
export const SIT = Object.freeze({ pitch: 0.75, bodyDY: -0.045, bodyZ: -0.06, headDY: 0.09, headDZ: 0.06, chestDepth: 0.75, foreZ: -0.06, foreTilt: 0 });

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

// The inverse of torsoSurface's direction (polish-catlooks, 2026-11-02): the
// UNDEFORMED unit direction whose deformed surface point lies along the
// body-local direction `dir`. The coat is painted by undeformed direction
// (coat.js), so a part hung on the torso reads the coat under it through this.
// Fixed-point: nudge u by how far its deformed direction misses `dir`. The
// deformation only stretches by 0.7-1.3, so 8 steps land within ~1e-6.
export function torsoUnitAt(dir, out = [0, 0, 0]) {
  const L = Math.hypot(dir[0], dir[1], dir[2]);
  const d0 = dir[0] / L, d1 = dir[1] / L, d2 = dir[2] / L;
  let u0 = d0, u1 = d1, u2 = d2;
  for (let k = 0; k < 8; k++) {
    const [x, y, z] = deformTorso(u0, u1, u2);
    const P = Math.hypot(x, y, z);
    u0 -= x / P - d0; u1 -= y / P - d1; u2 -= z / P - d2;
    const M = Math.hypot(u0, u1, u2);
    u0 /= M; u1 /= M; u2 /= M;
  }
  out[0] = u0; out[1] = u1; out[2] = u2;
  return out;
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
// Fluffy cats: their neck items, neck prizes and collar sit exactly where a
// tabby's do (body refinement, Task 7 fix round 1). The small bib (ruff.js)
// stands about 5 mm out of the chest under the chin (9 mm before the Task 10
// fix flattened it), so the necktie's and bowtie's knots, on a tabby's spot,
// rest on it with their fronts out of the fur; 5 mm further back and the
// necktie sank into the 9 mm bib, 5 mm
// further forward and the streamer tails hang further off the fur than a
// tabby's (the 'rests on the bib' test). Head-local; `forward` adds to
// NECK_FORWARD (front is -z), `drop` is taken off y. Was { forward: -0.02,
// drop: 0.07 } on the torus.
export const NECK_FLUFFY = { forward: 0, drop: 0 };
// The chest ball in the underside (model.js undersideGeometry): a sphere of
// radius R scaled by SCALE (x also by the frame's fx), at y CENTRE_Y + DY and
// z Z·fz, cat frame.
export const CHEST = Object.freeze({ R: 0.15, SCALE: Object.freeze([1.05, 1.1, 0.9]), DY: 0.06, Z: -0.33 });
// The hood bunched at the neck (under a hat) keeps its old head-relative spot,
// HEAD.POS + (0, -0.06, 0.08) x HEAD.SCALE, mostly hidden in the neck fur: no
// NECK_FORWARD, no NECK_FLUFFY (forward, the roll crossed the face at mouth
// level). It is lowered by HOOD_BUNCH_DROP (head-local y) so that no part of
// it reaches above the mouth (the bottom of the nose) on any cat.
export const HOOD_BUNCH_DROP = 0.08;
