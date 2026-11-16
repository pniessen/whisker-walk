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
  // Cat realism B2 (2026-11-15): tailBase.. draw the rump out round the tail's
  // root (a 5 cm taper of body, in unit z, centred on the root's direction
  // tailBaseY up, tailBaseW wide), and thigh.. draw it back (and thighOut wider)
  // low on each side over the thigh tops (deformTorso). tailBase is a taste
  // call: 0.14 recommended, 0.07 the smaller one shown on the sheet.
  SHAPE: { chest: 0.16, chestLow: 0.12, waist: 0.14, waistZ: 0.15, waistW: 0.08, waistDrop: 0.08, hips: 0.12, tuck: 0.28, haunch: 0.08, haunchZ: 0.55, haunchZW: 0.07, haunchY: -0.15, haunchYW: 0.2, backRise: 0.07, tailBase: 0.14, tailBaseUp: 0.02, tailBaseY: 0.42, tailBaseW: 0.05, thigh: 0.12, thighOut: 0.03, thighAt: [0.45, 0.0, 0.88], thighW: 0.2 },
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
// Cat realism B2 (2026-11-15): the root is where it was; the rump now comes
// out round it (TORSO.SHAPE.tailBase), so the root ball lies mostly inside
// that taper and reads as the tail's own base, not a button on a flat rump.
// SEAM_LIFT: the tail's lift (rad above level) at which the first link's
// shading is fitted to the rump's (model.js, the seams).
export const TAIL = { LINK: 0.14, R: 0.072, TAPER: 0.8125, CURL: 0.28, ROOT_TILT: 0.28, SCALE: 0.85, ROOT_DY: 0.10, ROOT_Z: 0.33, ROOT_BALL: 0.072, SEAM_LIFT: 0.33 };

// The tail's radius at fraction u of its length (0 root, 1 tip).
export const tailR = (u) => TAIL.R * (1 - TAIL.TAPER * u);

// The plume (polish-tails, 2026-11-03): a long-furred cat's tail radius at
// u = 0, 0.2, ... 1, in the same units as tailR. Thicker all along, widest
// around 40% of the length, then tapering to a soft rounded tip (the tip ball
// is the last knot). The root stays near tailR(0), so the plume still comes
// out from under a cape's hem and the root ball still covers the join.
export const PLUME = Object.freeze([0.074, 0.090, 0.097, 0.088, 0.062, 0.024]);

// The tail's radius at u with `plume` (0 none, 1 full) of the PLUME blended in,
// linear between the knots. plume 0 is exactly tailR(u).
export function tailRadius(u, plume = 0) {
  const r = tailR(u);
  if (!plume) return r;
  const n = PLUME.length - 1, x = Math.min(n, Math.max(0, u * n)), k = Math.min(n - 1, Math.floor(x));
  const knot = PLUME[k] + (PLUME[k + 1] - PLUME[k]) * (x - k);
  return r + plume * (knot - r);
}

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
// B3 (cat realism round 1): the two proportion numbers. `head` scales the
// whole head (and the hat, glasses and neckwear on it); `body` lengthens the
// torso and moves the hips, the tail's root and the head along with its ends.
// Owner's pick from the three-column sheet, 2026-11-15: the head 8% smaller,
// the body as it was. The picture harness may still override them before it
// builds a cat.
export const PROPORTION = { head: 0.92, body: 1 };

// THE NECK (cat realism B1, 2026-11-15; neck.js, animator.js fitNeckSkin). A
// short thick skin from the shoulders and the front of the torso to the back
// and underside of the skull, in three loops of AROUND points with two eased
// rings between them:
//   B, on the torso's own surface. Under the throat and at the sides it is the
//      torso's section at unit z BASE_Z, just ahead of where a cape or a coat
//      ends (cape.js CAPE.zFront -0.8). On a cat that wears nothing on its
//      body the top of the loop reaches back over the shoulders to NAPE_Z, so
//      the skin bridges the notch behind the head; a dressed cat's stays at
//      BASE_Z all round, so its neck comes out of the garment's neckline and
//      never through the cloth.
//   M, round the neck line where the collar sits (head frame, carried exactly
//      as the collar is, animator.js neckMove): R_SIDE across, R_BACK behind
//      and R_FRONT at the throat, each a little inside the collar's ring
//      (0.15 less its 0.028 tube), so a collar or scarf rests ON the neck. On
//      a bare-bodied cat its nape point stands out to M_NAPE (the back of a
//      collar is already under the shoulders' fur there).
//   H, on the skull, ALPHA round the axis that points down and TILT back: from
//      a little above the skull's middle at the back to under the chin.
// B and H lie SINK under their surfaces and wear those surfaces' normals and
// colours, so the neck leaves the body and enters the head without a crease.
// Standing, most of it is inside the head and chest; the nape shows always,
// the rest when the head lowers, lifts or turns away from the shoulders. Full
// builds only: it is re-laid every frame (60 points), which the crowd's
// simple cats skip.
// SIT_DIP (m; cat realism B11, 2026-11-16): sitting, the head is held high
// over the shoulders and the nape ran from them to the skull as one straight
// ramp. The nape's middle points are drawn this far in toward the throat
// (neck.js layNeck), so the back of the neck curves in under the skull.
// NAPE (0..1) is the taste call: how far the bare cat's nape stands out, 1 the
// full bridge to M_NAPE, 0 none (a dressed cat's neck).
export const NECK = { AROUND: 12, BASE_Z: -0.84, NAPE_Z: -0.45, M_AT: [0, -0.14, 0.055], R_SIDE: 0.125, R_BACK: 0.14, R_FRONT: 0.115, M_NAPE: [0, -0.025, 0.21], NAPE: 1, NAPE_REACH: 0.4, TILT: 0.7, ALPHA: 0.87, SINK: 0.012, SIT_DIP: 0.035 };

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
// Cat realism B2 (2026-11-15): the rump is fuller low behind the thighs
// (TORSO.SHAPE thigh), and sitting it is the pitched torso's lowest point: at
// 0.006 it rested 0.0024 under the ground on every preset (0.0021 simple), so
// it comes up 0.0025 more and rests on it again (0.0001 / 0.0004 above).
export const POSE_FIT = Object.freeze({
  requestPet: Object.freeze({ body: 0.0085 }),
  perch: Object.freeze({ body: 0.0085 }),
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
//     is at z +0.075 (behind the centre), its top (0.689, the chest; 0.659 once
//     chestDrop lowers it) at z -0.20, and the
//     front hips sit inside the chest (top 0.61 over a 0.39 hip, its
//     underside 0.21).
//   headDY, headDZ (m, the head's offset from where it stands; were +0.06 and
//     +0.1): +0.09 and +0.06. The head is held high (its centre 0.706, over
//     the shoulders' 0.689) and forward over the chest, so the sitting cat is
//     still no taller than the standing one (+0.0065; R3, the name tag's
//     margin) and the throat clears the chest: a bowtie's nearest point is
//     1.0-1.5 cm off the fur, a necktie's 0.7-1.7 cm (catsit.test.js; tabby,
//     Persian, Siamese, Maine Coon, Digit, with chestDrop; 0.14-0.66 cm before it).
//     Further back (+0.16, the first try) the neck items sank 5 cm into the chest.
//   chestDepth: the underside's own z (torso-local) is scaled by this about the
//     chest centre (keepChestUnderHead holds the centre put), so the chest does
//     not bulge forward like a ball (polish-catlooks: 0.75 brought every build's
//     front back 2.1-2.3 cm).
//   chestDrop (m, straight down in the cat's frame; polish-sit Task 3): 0.03.
//     The pitched torso carries the chest ball up under the chin, where it
//     stood 3-10 cm proud of the torso as a band between head and body: from
//     the front, with the shaded underside of the skull above it, it read as
//     a collar on a cat wearing none. Lowered, the ball reads as a bib on the
//     breast. 0.04 and 0.05 let the torso's top poke through between chin and
//     chest (the Persian's front shot); the neck items still sit on the fur
//     (catsit.test.js) and the rump on the ground (catsitupright.test.js).
//   chestSink, chestFlat (cat realism 2026-11-15): the chest still stood out
//     under the chin as a separate pale ball with a shelf under it. Sitting,
//     the chest ball alone (with the tufts and the ruff on it; not the belly,
//     which a lower underside pushed out under the torso, and not the neck) is
//     lowered chestSink more (m, straight down) and its depth scaled by
//     chestFlat again about its centre, so its front lies in the line from
//     the throat to the forelegs and what shows is a bib on the breast. These
//     are written into the chest's own vertices when the cat sits down and
//     taken out when it gets up (animator.js sinkChest), so the chest's centre
//     as the neck line reads it (neckMove) has not moved: the collar, the neck
//     pieces, the cape's clasp and the neck's skin sit exactly where they did.
//   hindOut (m; cat realism B11, 2026-11-16): sitting, each hind hip stands
//     this much further out, so the folded thigh (limbs.js FOLDS.sit) shows
//     as a rounded haunch out of the torso's side, widest low down: from
//     behind the sitting cat is a pear, where it was a tube on end. Not on a
//     cat dressed on its body (limbs.js SLIM_FOLD).
//   foreZ (metres, cat frame, - is forward): both front hips move forward by
//     this: -0.06, the hips at z -0.30, inside the chest; the paws stand 8.3 cm
//     behind the chest's front (the upper chest, y 0.46-0.48), as a sitting
//     cat's breast sits over its forelegs. (Digit's four hips also come in by
//     its torso's width share, animator.js.)
//   foreTilt (rad): 0, the legs hang plumb (the paw's own 0.012 offset leans
//     the hip-to-paw line 0.03 rad, Digit's longer leg 0.025). No swing means
//     fitLongLegs leaves each leg its fitted length, so the soles stay on the
//     ground at every legLen.
export const SIT = Object.freeze({ pitch: 0.75, bodyDY: -0.045, bodyZ: -0.06, headDY: 0.09, headDZ: 0.06, chestDepth: 0.75, chestDrop: 0.03, chestSink: 0.03, chestFlat: 0.8, foreZ: -0.06, foreTilt: 0, hindOut: 0.055 });

// The sitting haunch's coat (cat realism B11, 2026-11-16; limbs.js paintFold):
// the folded hind limb wears the torso's painted coat down to curve parameter
// coatFrom, easing into its own leg colour by coatTo.
export const HAUNCH = Object.freeze({ coatFrom: 0.5, coatTo: 0.85 });

// Grooming (cat realism 2026-11-15): the head comes down and forward to the
// raised front right paw (limbs.js FOLDS.lick) and turns to it: `head` its
// offset from where it stands [y, z], `rot` its turn (nose down, the face to
// the cat's right, a small roll), `lick` the bob of each lick (m).
export const GROOM = Object.freeze({ head: Object.freeze([-0.1, -0.05]), rot: Object.freeze([-0.3, -0.3, -0.1]), lick: 0.02 });

// The stretch (cat realism A7, 2026-11-15): a play bow. It was a torso tipped
// nose-UP with the head dropped 24 cm (the pale chest stood up behind the
// head as a lump) over front legs swung forward in the air. Now the torso
// pitches nose-DOWN about the standing hind hips until the front hips are
// `shoulder` over the ground (the same height on every cat, so a long-legged
// one bows steeper), the front legs fold onto the ground (limbs.js
// FOLDS.bow) and the head is held low over the paws: `head` is its centre
// from the lowered front hip [up, forward (-z)], `headTip` its nose-up tilt.
// Cats with folds only (Hagrid keeps his stretch).
export const BOW = Object.freeze({ shoulder: 0.185, head: Object.freeze([0.25, -0.22]), headTip: 0.05, maxPitch: 0.8 });

// polish-sit Task 2 (2026-11-02): the sitting tail lies round the paws, the
// Warrior Cats sit's other half (animator.js; cats with folds only, Hagrid's
// fan keeps his). Before, the root stayed where the standing cat carries it
// (y 0.446, 18 cm off the pitched rump) and the tail stuck straight out behind.
// Measured in the cat's frame on every preset, full and simple, t 0..3:
//   ROOT [y, z] (m, the torso's own frame before the body's scale and pitch,
//     i.e. the offset from the torso centre in an unpitched cat): [0.035,
//     0.347]. Carried through the posed body's matrix the root lands low on
//     the rump (y 0.070, z 0.218), 1.0 cm under its fur: a sitting cat's tail
//     leaves the bottom of the spine, at the ground. (Rooted higher, 0.157,
//     the first link fell straight down and the tail turned in a hard L.)
//   rotX (tail.rotation.x, + tips the chain down): 0.425.
//   pivotX, pivotY (each pivot's rotation.x and the size of its rotation.y,
//     swung to TAIL_HOOK_SIDE, the cat's left, as the walking tail's hook):
//     link 0 already turns left out of the rump, and the chain runs in one
//     even curve round the back and the left haunch, low along the ground
//     (lowest vertex 0.4 cm up, the tip 3.5 cm at most), at least 3.5 cm
//     clear of the torso past the root link, and off the hind foot. The
//     tip ends at x -0.18..-0.21, z -0.14..-0.15 (the hind hips are at
//     +0.24, the front paws at -0.31), turned in toward the front paws: the
//     tail is 0.6 m long and the haunch 0.45 m wide, so it cannot reach the
//     paws themselves. Fitted by a search over all twelve numbers on tabby
//     and Digit (the narrowest torso) for: tip forward, every link outside
//     the torso and the legs at either end of the flick, nothing in the
//     ground, even bends.
// Cat realism B2 (2026-11-15): ROOT z 0.347 -> 0.357, re-fitted to the fuller
// rump by the same search (the root 1.9 cm under the fur, the tail's lowest
// vertex within 1 mm of the ground, links 2-4 clear of the torso).
export const SIT_TAIL = Object.freeze({
  ROOT: [0.035, 0.357],
  rotX: 0.425,
  pivotX: [-0.3, 0.281, 0.241, 0.219, 0.116],
  pivotY: [1.299, 0.728, 0.672, 0.499, 0.159],
  flick: 0.15, // the tip link's sideways flick, sin(t*2.2)
});

// The nap's head (cat realism 2026-11-15; cats with folds, Hagrid keeps his).
// It was held up beside the shoulders with the face tipped to the sky
// (+0.08, -0.24, +0.14 from where it stands, nose-up 0.55), which with the
// forearms out in front read as a crouching cat looking up. Now it is down
// on the forepaws: `head` its offset from where it stands [x, y, z] (the
// chin 1-2 cm over the paws, forward of the chest so the head and a hood
// stay out of each other), `rot` its turn: the nose a touch down, the face
// turned to the cat's left toward the tail's tip (NAP_TAIL), the cheek
// rolled onto the paws.
// Cat realism B11 (2026-11-16): the body is a loaf. It was the standing
// torso squashed flat (scale 1.12, 0.73, 0.89, 10 cm down) over legs folded
// like a crouching cat's, which read as a sphinx with daylight under it. Now
// `drop` lowers it until the belly rests on the ground, `scale` leaves the
// back high and round over a wide base, `pitch` (nose-up) settles the rump,
// and the legs take the loaf fold (limbs.js FOLDS.loaf): the hind thighs lie
// along the flanks as haunches, their hips `hindOut` further apart, and wear
// the coat (HAUNCH); the forearms are short under the chest, the paws just
// showing under the chin.
export const NAP = Object.freeze({ head: Object.freeze([-0.02, -0.32, -0.08]), rot: Object.freeze([-0.05, 0.75, 0.18]),
  drop: 0.12, scale: Object.freeze([1.16, 0.88, 0.87]), pitch: 0.07, hindOut: 0.045 });

// polish-pose Task 1 (2026-11-02): the napping tail lies flush and curls
// round the body, nose to tail (animator.js; cats with folds only, Hagrid's
// fan rides his body already). Before, the nap lowered and squashed the body
// but the root stayed where the standing cat carries it, 12.7 cm out of the
// lowered rump, and the chain stuck straight out sideways in the air (its top
// 0.50, over the 0.42 back). Same meanings as SIT_TAIL. Measured in the cat's
// frame on every preset, full and simple, t 0..7 (the breathing and the tip's
// sway):
//   ROOT [y, z]: [-0.094, 0.323]. Carried through the posed nap body it lands
//     low on the rump (y 0.173, z 0.288), 1.0 cm out of the fur.
//   rotX 0.4 and the five pivots: link 0 drops out of the rump to the left
//     and down, and the rest lie on the ground (links 1-4 each come within
//     1.6 cm of it, no vertex under 0.3 cm) in one curve round
//     the left haunch, bending 0.62, 0.71, 0.63 rad link to link, the tip
//     link straightening (0.14) along the cat's left side. The tip's pivot
//     stands 3.1 cm up at x -0.287, 0.174 forward of the root; the tail ends
//     at z 0.00 (the torso runs -0.41..0.32), 1.3 cm outside the widest
//     torso seen from above (tabby, x 0.273), so the tail shows round the
//     body from the walk camera. Past the root every link is at least 5.5 cm
//     clear of the torso; the tail's top is 18 cm under the back's.
//   The left, TAIL_HOOK_SIDE, because the nap head turns its nose to the
//     cat's left (rotation.y 0.5, nose x -0.48): nose to tail.
//   The tail is 0.6 m long on a 0.73 m body, so the tip reaches the middle of
//     the flank, not the nose. Coming round the haunch the first two links
//     pass through the outside of the tucked left thigh (FOLDS.tuck), which
//     reads as the tail lying over the hind leg. Fitted by a search over the
//     links' headings on tabby and Digit (simple) for: root flush, every link
//     outside the torso and above the ground at either end of the breathing
//     and the sway, the tip forward and outside the body, even bends.
// Cat realism B11 (2026-11-16): ROOT [-0.094, 0.323] -> [-0.03, 0.353] and the
// last turns [0.487, -0.014] -> [0.483, 0.033], by the same kind of search
// (tabby, Digit, Siamese, Robbie; full and simple). The loaf's body lies
// 2.5 cm lower and is rounder and wider (NAP), which carried the root 6 cm
// down, the lying links 5.5 cm into the ground and link 1 into the rump. Now
// the root is 1 cm under the rump's fur, the lowest vertex 0.3 cm over the
// ground and every link past the root 2.3 cm or more clear of the torso.
export const NAP_TAIL = Object.freeze({
  ROOT: [-0.036, 0.353],
  rotX: 0.4,
  pivotX: [0.532, 0.465, 0.537, 0.628, 0.136],
  pivotY: [0.804, 0.419, 0.483, 0.033, 0.049],
  // The tip link's slow sway, sin(t*0.9). The chain's frames roll as it
  // turns, so on the ground this lifts and lowers the tip: the tip end's
  // centre moves between 1.5 and 3.3 cm up, a sleeping tail's twitch.
  sway: 0.08,
});

// polish-tails (2026-11-03): the lying tails of a plumed cat (PLUME). A
// plume is up to 5 cm fatter than the thin tail, so laid along SIT_TAIL or
// NAP_TAIL it sank 4 cm into the ground and, sitting, 1 cm into the haunch.
// These are the same curves with the root raised (1.3 cm sitting, 2 cm
// napping) and the first links drooping a little less and turning a little
// wider, so the plume rests on the ground clear of the torso (and, sitting,
// out from under a cape). Fitted by a search on the Persian and the Maine
// Coon (full and simple, bare and caped) against the sit, nap and cape
// tests' own measures, staying as near today's numbers as it could:
// sitting, lowest vertex 0.7 cm in the ground, the haunch cleared by 0.4 cm,
// no tail under the cape, the tip 23 cm out to the side; napping, lowest
// vertex 0.2-0.5 cm over the ground, 2.3 cm clear of the torso. Same meanings as SIT_TAIL and
// NAP_TAIL; a partial plume takes the blend (lyingTail).
// Cat realism B2 (2026-11-15): both re-fitted to the fuller rump. Sitting:
// ROOT [0.048, 0.34] -> [0.065, 0.36], rotX 0.44 -> 0.48, the first two
// pivots [-0.295, 0.111] / [1.209, 0.698, 0.687] -> [-0.32, 0.078] / [1.2,
// 0.595, 0.694]: the root 2.2 cm under the fur, the lowest vertex 0.5 cm in
// the ground, links 2-4 0.5 cm clear, no tail under the sit's cape (its hem
// is taken up a touch, cape.js CAPE_SIT). Napping: ROOT y -0.074 -> -0.084,
// pivotY[0] 0.884 -> 0.934: link 1 is 1.7 cm clear again.
export const SIT_TAIL_PLUME = Object.freeze({
  ...SIT_TAIL,
  ROOT: [0.065, 0.36],
  rotX: 0.48,
  pivotX: [-0.32, 0.078, 0.211, 0.219, 0.116],
  pivotY: [1.2, 0.595, 0.694, 0.499, 0.159],
});
// Cat realism B11 (2026-11-16): the napping plume re-fitted to the loaf (NAP)
// by the same search on the Persian and the Maine Coon: ROOT [-0.084, 0.346]
// -> [-0.027, 0.401], the pivots as below. The root is 2.5 cm out of the
// rump's fur, the lowest vertex 0.7 cm over the ground, every link past the
// root 1.7 cm or more clear of the wider torso.
export const NAP_TAIL_PLUME = Object.freeze({
  ...NAP_TAIL,
  ROOT: [-0.027, 0.401],
  rotX: 0.361,
  pivotX: [0.512, 0.38, 0.334, 0.9, 0.136],
  pivotY: [0.931, 0.535, 0.33, 0.154, 0.139],
});

// A lying tail `plume` of the way from `thin` (today's) to `full` (the plume's).
export function lyingTail(thin, full, plume) {
  const mix = (a, b) => (Array.isArray(a) ? Object.freeze(a.map((v, i) => mix(v, b[i]))) : a + plume * (b - a));
  return Object.freeze(Object.fromEntries(Object.keys(thin).map((k) => [k, mix(thin[k], full[k])])));
}

// A point on the unit sphere (nose at -z, rump at +z) pushed into the cat's torso.
export function deformTorso(x, y, z, S = TORSO.SHAPE) {
  const front = Math.max(0, -z), back = Math.max(0, z);
  const x0 = x, y0 = y, z0 = z;
  const waist = Math.exp(-((z - S.waistZ) ** 2) / S.waistW);
  let kx = 1 - S.waist * waist + S.hips * back * back;
  let ky = 1 + S.chest * front - S.waistDrop * waist;
  if (y < 0) ky *= 1 + S.chestLow * front - S.tuck * back * back;
  const haunch = Math.exp(-((z - S.haunchZ) ** 2) / S.haunchZW) * Math.exp(-((y - S.haunchY) ** 2) / S.haunchYW);
  kx *= 1 + S.haunch * haunch;
  x *= kx; y *= ky;
  if (y > 0) y += S.backRise * (z + 1) * 0.5 * (1 - x * x);
  // The tail base (cat realism B2): the rump is drawn out toward the tail's
  // root in a soft mound, so the tail leaves a taper of body, not a flat rump.
  if (S.tailBase && z0 > 0) {
    const dy = y0 - S.tailBaseY, dz = z0 - Math.sqrt(1 - S.tailBaseY * S.tailBaseY);
    const bump = Math.exp(-(x0 * x0 + dy * dy + dz * dz) / S.tailBaseW) * Math.min(1, z0 * 4);
    z += S.tailBase * bump;
    y += S.tailBaseUp * bump;
  }
  // The thigh tops (B2): low on each side of the rump the surface is drawn
  // back and a little out over the top of the thigh, so from behind the hind
  // legs come out of one rump instead of standing on it as two balls.
  if (S.thigh && z0 > 0) {
    const [tx, ty, tz] = S.thighAt;
    const dx = Math.abs(x0) - tx, dy = y0 - ty, dz = z0 - tz;
    const bump = Math.exp(-(dx * dx + dy * dy + dz * dz) / S.thighW) * Math.min(1, z0 * 4);
    z += S.thigh * bump;
    x *= 1 + S.thighOut * bump;
  }
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

// ---------------------------------------------------------------------------
// THE SEAMS (cat realism round 1, A4; 2026-11-15). A leg, the chest and the
// belly are separate smooth parts pushed into the torso, and each used to meet
// it with a visible crease: the light changed direction in one step along the
// line where they cross. Now every vertex of such a part that lies inside the
// torso, or within SEAM.reach of its surface, has its shading direction (its
// normal) turned toward the torso's own at that spot: all the way at the
// surface, easing back to the part's own SEAM.reach out (and only as far as
// the part faces the same way as the torso there). The light then flows
// across the join. Positions and colours are untouched, and it is worked out
// once when the cat is built (model.js), never per frame.
export const SEAM = { reach: 0.07, underReach: 0.05, tailReach: 0.05, square: 0.2 };

// The torso's outward normal at the undeformed unit direction `u`, in the
// torso mesh's own frame (before the body's scale), by finite differences.
export function torsoNormalAt(u, out = [0, 0, 0]) {
  const e = 1e-3;
  // two directions square to u
  let ax = -u[1], ay = u[0], az = 0;
  if (Math.abs(u[2]) > 0.9) { ax = 0; ay = -u[2]; az = u[1]; }
  const aL = Math.hypot(ax, ay, az); ax /= aL; ay /= aL; az /= aL;
  const bx = u[1] * az - u[2] * ay, by = u[2] * ax - u[0] * az, bz = u[0] * ay - u[1] * ax;
  const at = (dx, dy, dz) => {
    const x = u[0] + dx, y = u[1] + dy, z = u[2] + dz, L = Math.hypot(x, y, z);
    return deformTorso(x / L, y / L, z / L);
  };
  const p0 = at(0, 0, 0), p1 = at(e * ax, e * ay, e * az), p2 = at(e * bx, e * by, e * bz);
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  let L = Math.hypot(nx, ny, nz);
  if (nx * p0[0] + ny * p0[1] + nz * p0[2] < 0) L = -L;
  out[0] = nx / L; out[1] = ny / L; out[2] = nz / L;
  return out;
}

// Blend the normals `nor` of the vertices `pos` (both flat xyz arrays, in some
// part's own frame) toward the torso's. `m` is the 4x4 (column-major, as a
// THREE.Matrix4's elements) taking the part's frame into the torso mesh's own
// frame (before the body's scale, where the surface is R * deformTorso);
// `scale` the body's scale, for measuring how far out a vertex is in metres.
// Only vertices [from, to) are touched. Returns nor.
const _su = [0, 0, 0], _sn = [0, 0, 0], _sd = [0, 0, 0];
export function seamNormals(pos, nor, m, scale, reach = SEAM.reach, from = 0, to = pos.length / 3) {
  for (let i = from; i < to; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    _sd[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / TORSO.R;
    _sd[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / TORSO.R;
    _sd[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / TORSO.R;
    const rho = Math.hypot(_sd[0], _sd[1], _sd[2]);
    if (rho < 1e-6) continue;
    torsoUnitAt(_sd, _su);
    const [sx, sy, sz] = deformTorso(_su[0], _su[1], _su[2]);
    const sL = Math.hypot(sx, sy, sz);
    // how far outside the surface, in metres along the ray from the centre
    const out = (rho / sL - 1) * Math.hypot(sx * scale[0], sy * scale[1], sz * scale[2]) * TORSO.R;
    if (out >= reach) continue;
    const k = out <= 0 ? 0 : out / reach;
    let w = 1 - k * k * (3 - 2 * k);
    torsoNormalAt(_su, _sn);
    // back into the part's frame: a normal goes through the transpose
    let tx = m[0] * _sn[0] + m[1] * _sn[1] + m[2] * _sn[2];
    let ty = m[4] * _sn[0] + m[5] * _sn[1] + m[6] * _sn[2];
    let tz = m[8] * _sn[0] + m[9] * _sn[1] + m[10] * _sn[2];
    const tL = Math.hypot(tx, ty, tz); tx /= tL; ty /= tL; tz /= tL;
    // A vertex facing away from the torso's surface there (the inside of a
    // thigh, a part's hidden far side) keeps its own normal: the turn fades
    // out as the two normals come square, so no face is ever lit from behind.
    const facing = tx * nor[i * 3] + ty * nor[i * 3 + 1] + tz * nor[i * 3 + 2];
    if (facing <= SEAM.square) continue;
    w *= Math.min(1, (facing - SEAM.square) * 2);
    const nx = nor[i * 3] + (tx - nor[i * 3]) * w, ny = nor[i * 3 + 1] + (ty - nor[i * 3 + 1]) * w, nz = nor[i * 3 + 2] + (tz - nor[i * 3 + 2]) * w;
    const nL = Math.hypot(nx, ny, nz);
    if (nL < 1e-6) continue;
    nor[i * 3] = nx / nL; nor[i * 3 + 1] = ny / nL; nor[i * 3 + 2] = nz / nL;
  }
  return nor;
}

// THE CHEST IS PART OF THE TORSO (cat realism B11, 2026-11-16). The chest is a
// ball pushed into the front of the torso, and it met the torso at an angle
// all round its rim: a pale cap with an edge, standing 3.1 cm out. Its points
// are now drawn in toward the torso's own surface near that rim: a point
// `out` metres outside the surface (along the ray from the torso's centre)
// is left out * smoothstep(out / toe) outside it. So the rim leaves the torso
// level with it and rises in a soft bell, and everything further out than
// `toe` (the front of the breast, where a tie or a bell rests) is exactly
// where it was. `rim`: a point of the built chest left within rim[0] metres
// of the surface wears the coat painted on the torso under it, easing to its
// own colour by rim[1], so no pale edge shows where the two meet.
// model.js undersideGeometry (the cat as built) and animator.js sinkChest (the
// sitting chest, whose own shift moved the rim) both use it; never per frame.
export const CHEST_BLEND = Object.freeze({ toe: 0.03, rim: Object.freeze([0.006, 0.014]) });

// Draw the points [from, to) of `pos` (flat xyz) toward the torso as above.
// A point p is in the torso mesh's own frame as p * k + o (k, o: xyz; the
// underside's scale and position, [1,1,1] and [0,0,0] for the cat as built);
// `scale` is the body's scale. `each(i, out, unit)`, if given, is called for
// every point with how far outside the surface it now is (m; <= 0 inside,
// untouched) and the undeformed unit direction of the torso under it.
const _bd = [0, 0, 0], _bu = [0, 0, 0];
const ONE3 = Object.freeze([1, 1, 1]), ZERO3 = Object.freeze([0, 0, 0]);
export function blendIntoTorso(pos, from, to, scale, k = ONE3, o = ZERO3, each = null, toe = CHEST_BLEND.toe) {
  for (let i = from; i < to; i++) {
    _bd[0] = (pos[i * 3] * k[0] + o[0]) / TORSO.R;
    _bd[1] = (pos[i * 3 + 1] * k[1] + o[1]) / TORSO.R;
    _bd[2] = (pos[i * 3 + 2] * k[2] + o[2]) / TORSO.R;
    const rho = Math.hypot(_bd[0], _bd[1], _bd[2]);
    if (rho < 1e-6) { if (each) each(i, -1, _bd); continue; }
    torsoUnitAt(_bd, _bu);
    const [sx, sy, sz] = deformTorso(_bu[0], _bu[1], _bu[2]);
    const sL = Math.hypot(sx, sy, sz);
    const perRho = Math.hypot(sx * scale[0], sy * scale[1], sz * scale[2]) / sL * TORSO.R; // metres per unit of rho along this ray
    let out = (rho - sL) * perRho;
    if (out > 0 && out < toe) {
      const x = out / toe;
      out *= x * x * (3 - 2 * x);
      const f = (sL + out / perRho) / rho * TORSO.R;
      pos[i * 3] = (_bd[0] * f - o[0]) / k[0];
      pos[i * 3 + 1] = (_bd[1] * f - o[1]) / k[1];
      pos[i * 3 + 2] = (_bd[2] * f - o[2]) / k[2];
    }
    if (each) each(i, out, _bu);
  }
  return pos;
}

// Smooth normals for the points [from, to) of an indexed part whose points
// were moved: each face's normal (area-weighted) gathered at its corners,
// points at the same place sharing one sum (a sphere's seam and poles are
// doubled points), so no line shows along a seam. Faces of `idx` with a
// corner outside the range are skipped.
export function weldedNormals(pos, nor, idx, from, to) {
  const sums = new Map(), keyOf = new Array(to - from);
  for (let i = from; i < to; i++) {
    const key = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    keyOf[i - from] = key;
    if (!sums.has(key)) sums.set(key, [0, 0, 0]);
  }
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { const sum = sums.get(keyOf[v - from]); sum[0] += nx; sum[1] += ny; sum[2] += nz; }
  }
  for (let i = from; i < to; i++) {
    const [x, y, z] = sums.get(keyOf[i - from]), L = Math.hypot(x, y, z);
    if (L < 1e-12) continue;
    nor[i * 3] = x / L; nor[i * 3 + 1] = y / L; nor[i * 3 + 2] = z / L;
  }
  return nor;
}

// After seamNormals on an indexed part: any face (of `idx`) that the turned
// normals `nor` now light from behind, and that the part's `own` normals did
// not, gets its three vertices' own normals back. Returns nor.
export function keepFacing(pos, nor, own, idx) {
  const lit = (n, a, b, c, wx, wy, wz) => wx * (n[a] + n[b] + n[c]) + wy * (n[a + 1] + n[b + 1] + n[c + 1]) + wz * (n[a + 2] + n[b + 2] + n[c + 2]);
  for (let pass = 0; pass < 4; pass++) {
    let fixed = 0;
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
      if (lit(nor, a, b, c, wx, wy, wz) >= 0 || lit(own, a, b, c, wx, wy, wz) < 0) continue;
      for (const k of [a, b, c]) { nor[k] = own[k]; nor[k + 1] = own[k + 1]; nor[k + 2] = own[k + 2]; }
      fixed++;
    }
    if (!fixed) break;
  }
  return nor;
}

// A back-slot point authored against the old torso, moved onto the new one
// with the same "how far from the fur": its unit-ellipsoid coordinates in
// LEGACY_BODY (scaled by the cat's body factors f), radius ρ and direction d,
// land on the new deformed torso at the same ρ along d. `minRho` floors ρ, so
// a point that sat sunk in the old fur can be pushed out onto the new
// surface. A point far off the body (ρ > 1.5, e.g. something
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
