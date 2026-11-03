import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { WHITE_FUR, coatFromStyle, paintCoat, coatColourAt, undersideColourAt, UNDER_BLEND, BELLY_BLEND, UNDER_FRONT } from './coat.js';
import { limbGeometry, paintLimb, legTopDir, footGeometry, plainPawGeometry, attachFolds } from './limbs.js';
import { lookToStyle, sanitizeLook, COATS } from '../customcats.js';
import { animateCat } from './animator.js';
import { henFightState } from './henfight.js';
import { setCatScars } from './scarmesh.js';
import { ruffGeometry } from './ruff.js';
import { GLASSES, GLASSES_FRAME, buildGlasses } from './glasses.js';
import { buildHat, HAT_BLACK, BEANIE_COLOR, WIZARD_COLOR } from './hats.js';
import { buildBackItem, buildHood } from './backitems.js';
import { CAPE, CAPE_SIT, capePoint, capeGeometry } from './cape.js';
import { HEN, HEN_BODY, HEN_SKULL, HEN_COMB, HEN_LEG, henBodyGeometry, henSkullNeckGeometry, henBeakGeometry, henWattlesGeometry, henCombHalves, henEyeGeometry, henTailGeometries, henShankGeometry, henFootGeometry, henNeckAt, henNeckFrontZ } from './hen.js';
import { TORSO, torsoGeometry, deformTorso, LEGACY_BODY, LEGS, PAW_Y, PAW_HALF, HEAD, SKULL, shellInflate, torsoSurface, torsoRetarget, NECK_FORWARD, NECK_FLUFFY, CHEST, REF_RIG, POSE_FIT, TAIL, tailRadius, SIT_TAIL, NAP_TAIL, SIT_TAIL_PLUME, NAP_TAIL_PLUME, lyingTail, torsoUnitAt } from './torso.js';

const STYLE = {
  tabby:     { base: 0x9c7a4f, belly: 0xd8c39a, accent: 0x6f5636, scale: 1.0, stripes: true },
  siamese:   { base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, scale: 0.95, points: true },
  persian:   { base: 0xcfcfd4, belly: 0xe8e8ec, accent: 0xb5b5bc, scale: 1.05, fluffy: true, tailPlume: 1 },
  black:     { base: 0x2a2a30, belly: 0x3a3a42, accent: 0x1c1c22, scale: 1.0 },
  calico:    { base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, scale: 1.0, patches: true },
  mainecoon: { base: 0x7a5b3a, belly: 0xb99a72, accent: 0x5a4028, scale: 1.3, fluffy: true, tufts: true, tailPlume: 1 },
  // the family pets
  zeetoo:    { base: 0xa8825a, belly: 0xe0ccA0, accent: 0x74582f, scale: 1.0, stripes: true },
  // Robbie is a black cat with white socks and flanks — he used to be drawn as
  // the reverse. Black cap, ears and back come from `base`; muzzle, chest and
  // paws from `belly`; the `cow` markings below add the white flanks and blaze.
  robbie:    { base: 0x1a1a1e, belly: 0xf5f5f5, accent: 0xf5f5f5, scale: 1.05, cow: true, whiteLegs: true },
  // D2 is a large tabby-and-white: tabby cap with the "M", white muzzle, chest,
  // belly and legs, a white band over the shoulders, dark tabby back and tail.
  d2:        { base: 0x5a4a3a, belly: 0xf5f5f2, accent: 0x2e261e, scale: 1.15, stripes: true, headStripes: true, whiteLegs: true, band: true, fluffy: true, tailPlume: 0 },
  // Digit is young and slender — all legs and ears — with bold stripes, four
  // white socks, a small white chin and a black collar with a round tag. At
  // scale 0.82 on the standard torso he read as a small STOCKY cat in the eye
  // check, so the torso itself is narrower (0.8 of the width) and the legs are
  // longer again (1.35). The tail and the body's LENGTH are left alone, so the
  // tail stays long for him. The DEPTH is left alone too, on purpose: in the
  // stalk and the sit a standard cat's belly and rump are what touch the
  // ground, and a shallower torso would rest 2.4cm above it there — a hover.
  digit:     { base: 0x7a6248, belly: 0xc8b090, accent: 0x2a2018, scale: 0.82, stripes: true, headStripes: true, socks: true, chin: true, ears: 1.25, legLen: 1.35, body: [0.8, 1, 1], tagCollar: true },
};
// Optional coat flags, all off unless a row sets them. They exist for the
// family cats, who are drawn from photos rather than from a breed:
//   whiteLegs   — limbs take `belly`, not the point colour (a cat in
//                 white stockings rather than white feet).
//   socks       — paws are WHITE_FUR whatever `belly` is: four white socks on
//                 a cat whose underside is not white.
//   band        — a `belly` band across the shoulders, painted over the
//                 stripes (see coat.js).
//   headStripes — three thin `accent` stripes up the forehead: the tabby "M".
//   chin        — a small WHITE_FUR patch under the muzzle.
//   ears        — ear-cone scale, default 1. Baked into the cone, not the mesh,
//                 because the animator owns the ears' rotation.
//   legLen      — leg length factor, default 1. The cat is lifted to keep its
//                 paws on the ground; see the block at the end of buildCat.
//   body        — [x, y, z] factors on the torso ellipsoid, default [1, 1, 1].
//                 Width, depth, length. Everything shaped by the torso follows
//                 it — markings, the belly, the animator's base body scale and
//                 the body- and back-slot accessories; see BODY_SCALE. A y
//                 below 1 lifts the belly off the ground in the stalk and the
//                 sit (the poses where a standard cat's torso is the low point)
//                 — catmodel.test.js's grounding tests will say so.
//   eyeColor    — eye hex; default EYE_COLORS[breed] (a look's row sets it).
//   headPatch   — hex of the skull patch when `patches` is set, default the
//                 calico orange 0xd88030.
//   tailFluff   — factor on every tail link and joint radius, default 1 (the
//                 root ball is unchanged). Long fur thickens the tail with it;
//                 a plumed tail (below) ignores it, so long fur's 1.3 now
//                 only selects the full plume (tailFluff > 1).
//   tailPlume   — 0..1, how much of the plume (torso.js PLUME) the tail has:
//                 fuller all along, widest at 40%, a soft tip. Default derived
//                 from the row: tailFluff > 1 (the builder's long fur) 1,
//                 fluffy 0.5, else 0. 0 is today's taper exactly. D2 sets 0:
//                 her tail is drawn from photos and signed off.
//   bib         — a belly-coloured chest bib (see coat.js).
//   tagCollar   — a built-in black collar with a round silver tag, drawn only
//                 when no collar accessory is worn (never two collars).
const INNER_EAR = 0xe8a0a8;
const EYE_COLORS = { siamese: 0x68a8d8, black: 0xd8b830, zeetoo: 0x4e9440, robbie: 0xb8b040, d2: 0xa8b040, digit: 0xa0a048 };

// Cat Couture: palette for the twelve new per-slot accessory items (plus the
// four re-homed ones, which keep their original colors inline below).
const NECKTIE_COLOR = 0x7a2436;    // maroon
const BOWTIE_COLOR = 0x2c3e6b;     // navy
const SCARF_COLOR = 0xd6602f;      // cozy rust knit, matches beanie
const HOODIE_COLOR = 0x6a4c93;     // purple hoodie
const CAPE_COLOR = 0xd8303c;       // superhero red
const CAPE_ACCENT = 0xf2c14e;      // gold clasp
// The clasp: a gold brooch (radius r, flattened to `flat` through the cloth)
// on the front of each shoulder, just behind the neck edge (s, a ±a), `lift`
// off the cloth. Not at the spine: the head hides the neck edge there from
// every side, and not at the throat, where the collar, its bell or tag and
// the neck items already are. At a ±0.62 each is outside the head's outline
// from the front. Accessories polish Task 4: at the neck edge itself (s 0) the
// brooch on the side the torso turns toward sank 5.6-6.7 cm into the chest in
// the cross (and 4-8 cm in the arch), where the underside counter-yaws to stay
// under the head (animator.js keepChestUnderHead) and bulges over the
// shoulder. A fifth of the way back (s 0.2) it clears the chest in every pose
// (3.5 cm out at the least; s 0.14 cleared the cross but not the arch): on the
// standing tabby that is 13 cm further back and 7 cm further out along the
// shoulder, still on its front, still within 3 cm of the fur.
const CAPE_CLASP = Object.freeze({ a: 0.62, s: 0.2, r: 0.032, flat: 0.7, lift: 0.012 });
const CAPE_DOTS = [[-0.5, 0.25], [0.3, 0.2], [0.75, 0.45], [-0.15, 0.45], [-0.8, 0.6], [0.45, 0.65], [0.1, 0.8], [-0.45, 0.85]];
const SNEAKER_WHITE = 0xf2f2f2;
const SNEAKER_ACCENT = 0xd8303c;
const RAINBOOT_COLOR = 0x3a6ea5;
// Wave-2 catalog balance: every slot gets 4 choices
// `tag` is not in the shop: it is the built-in collar of a cat whose STYLE row
// sets `tagCollar` — a plain black band with a round silver name tag.
// The neck rings (collar, cozy scarf, the streamer scarf's band and stripe)
// lie square to the cat's resting neck, which leans ~19° forward of upright
// from the chest to the head (animator.js fitNeck): front low at the throat,
// back high at the nape. They were tilted the other way (front up 0.32-0.35),
// and from the side the ring's front ran forward under the jaw like a stick
// held in the mouth, with the bell or tag dangling 10 cm below it
// (accessories polish Task 4). Hagrid's rings are re-set round his own neck
// (ringTheNeck; the chicken's collar ring is zeroed), so he never reads this.
const NECK_RING_TILT = 0.33;
// ...and set back (+z, head frame) so the ring's front lies on the throat
// rather than 8-10 cm out in the air ahead of it: the collar's ring and the
// scarf's and streamer scarf's bands. The scarf's tail and the streamers stay
// where they hung; the collar's charm (bell, heart, tag, sparkle star) hangs
// just under the ring's front, on the chest (COLLAR_CHARM, head frame less
// the collar's seat).
const COLLAR_CHARM = [0, -0.095, -0.10];
const NECK_RING_BACK = { collar: 0.065, scarf: 0.085, streamer: 0.1 };
const COLLAR_COLORS = { glow: 0x7ef2c0, heart: 0xf27ab0, studded: 0x2c2c34, tag: 0x1c1c22, sparklecollar: 0x8a5cf0 }; // default red below
const TAG_SILVER = 0xc8ccd4;
const HEART_CHARM = 0xe0447a;
const RAINCOAT_COLOR = 0xf2c94e;
const SWEATER_BASE = 0x2c6e63;
const SWEATER_STRIPE = 0xf2ead9;
const SWEATER_STRIPE_Z = [-0.324, 0.093, 0.509]; // the old rings' centres, legacy unit z
const BALLOON_COLOR = 0xf25c8a;
// Visit prizes (src/visits.js): bright and a little magical, so they read as
// earned rather than bought.
const PRIZE_GOLD = 0xf5c518;
const PRIZE_RIBBON = 0xe0405a;
const PRIZE_LEAF = [0x3f9e4d, 0x6cc070, 0x2f7d3e];
const PRIZE_CONFETTI = [0xf25c8a, 0xf2c14e, 0x4ec9d4, 0x8a6cf2, 0x7ad06a];
const PRIZE_CAPE = 0x5b3fa8;       // confetti cape base: purple, nothing like the red superhero cape
const PRIZE_STAR_LENS = 0xf25cb4;
const PRIZE_WARPAINT = 0x2b5fb8;
const PRIZE_CAKE = 0xf2a0c0;
const PRIZE_FROSTING = 0xfff4e0;
const PRIZE_FLAME = 0xffb02e;
const PRIZE_BALLOONS = [0xf25c8a, 0x4ec9d4, 0xf2c14e];
const PRIZE_STREAMERS = [0xe0405a, 0xf2c14e, 0x4ec9d4, 0x8a6cf2];
const SOCK_COLORS = [0xf27ab0, 0x7ec9b8, 0xf2c14e, 0xf5f5f5]; // mismatched on purpose

// The cape's cloth lives in cape.js (a leaf module, so backitems.js can read
// it without importing this file); re-exported for existing imports.
export { CAPE, CAPE_SIT, capePoint, capeGeometry };

const mat = (color) => litMaterial(color);

// Wave 6. The default segment counts for the LARGE forms only — every small
// part (eyes, studs, pompoms, charms) passes its own explicit, lower counts, so
// raising the default here lands exactly on the four spheres that define the
// cat's outline (body, belly, skull, muzzle, and the chicken's equivalents) and
// on nothing else.
//
// Affordable because docs/VISUAL-PASS.md section 0 measured this scene as
// draw-call bound and nowhere near triangle bound: 10x8 -> 16x12 is +212
// triangles per sphere, about +850 on the whole cat, against a scene that
// renders ~26,000. It buys a body whose silhouette stops showing straight
// segments in a close-up, for no extra mesh and no extra draw call.
const BALL_W = 16;
const BALL_H = 12;

function ball(r, color, sx = 1, sy = 1, sz = 1, wSeg = BALL_W, hSeg = BALL_H) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat(color));
  m.scale.set(sx, sy, sz);
  return m;
}

// -----------------------------------------------------------------------------
// THE CAT FROM BEHIND (polish 1a, Task 5, 2026-11-02). The walk camera sees the
// cat from behind ~90% of the time, where it read as a plain lump.

// The whiskers' outer ends, out from the head's midline (head space).
const WHISKER_REACH = 0.22;
// Where the pupil and the eye shine sit (head-space z): on the eye, not in
// front of it, so neither pokes out of the head's outline from the side.
const EYE_PUPIL_Z = -0.183;
const EYE_SHINE_Z = -0.183;
// How dark the back of an ear is, as a share of its front (vertex colour on
// the ear's own colour): from behind, the ears read as ears, not as two more
// bumps of the same fur.
const EAR_BACK_SHADE = 0.7;
// The ear cone (4 sides, as before), its back shaded by EAR_BACK_SHADE: a
// vertex-colour multiplier, so the material keeps the ear's own colour.
function earGeometry(r, h) {
  const geo = new THREE.ConeGeometry(r, h, 4);
  const n = geo.attributes.normal, col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const t = Math.min(1, Math.max(0, (n.getZ(i) + 0.1) / 0.8));
    const k = 1 - (1 - EAR_BACK_SHADE) * t * t * (3 - 2 * t);
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// The tabby "M" runs back over the crown (headStripes): for a bar at lateral
// direction x on the skull (unit sphere, 0 = the midline), its continuation
// over the top (centred straight up) and down the back of the head (centred
// 60 degrees past the top), each reaching ~32 degrees either way, so the bar
// runs unbroken from the brow to the back of the head. Coarser in a simple build.
const CROWN_STRIPE_X = 0.26;
const CROWN_STRIPE_AT = [Math.PI / 2, (5 * Math.PI) / 6];
const CROWN_STRIPE_HALF = 0.62;
function crownStripe(x, halfX, simple) {
  const k = Math.sqrt(1 - x * x);
  return CROWN_STRIPE_AT.map((a) => ({
    dir: [x, k * Math.sin(a), -k * Math.cos(a)], halfX, halfZ: CROWN_STRIPE_HALF,
    rings: simple ? 2 : 3, seg: simple ? 8 : 12,
  }));
}
// The dark tip starts this far along the blended link (a third: u = 2/3).
const TIP_FROM = 1 / 3;

// -----------------------------------------------------------------------------
// MARKINGS — Wave 6.
//
// A stripe or a patch is a region of FUR, so the one thing it must never do is
// leave the animal's surface. Before this, each marking was a separate squashed
// ellipsoid parked at a point on the body and sized by eye: a tabby's three
// stripes were `ball(0.16, accent, 1.4, 0.16, 0.32)` sitting at y 0.55 on a body
// whose top is at y 0.58 — so at the spine they were just buried, and 20cm out
// to either side, where the body has already curved away to y 0.50, they stood
// 6cm PROUD of it. Measured, not guessed; the same arithmetic explains the cow
// cat's patches reading as flat black polygons lying on the back.
//
// Waves 1 and 2 made this worse rather than better, which is why it is the
// headline item of this wave. Under the old 54-degree sun a marking that stuck
// out 6cm was flat-lit and merely looked slightly wrong. Under the current
// 19.1-degree raking sun it catches a rim of light on its upper edge AND casts
// its own hard shadow onto the fur underneath, so a tabby reads as a stegosaur
// with three dorsal plates. The defect is geometric; the lighting only stopped
// hiding it.
//
// The fix builds each marking as a PATCH OF THE HOST SPHERE — the same sphere
// the body or skull mesh is made of, at the same radius plus a hair — and
// parents it to that mesh. Two consequences fall out for free:
//
//   * The host's non-uniform scale (the torso's TORSO.SCALE, or the cat's own
//     STYLE.body narrowing of it, on the body; the head's uniform HEAD.SCALE)
//     is applied to the patch by the scene graph, so the patch deforms exactly
//     as the surface under it deforms. It cannot lift off, at any point, on any
//     breed, because it is generated from the surface rather than fitted to it.
//   * The ANIMATOR's squash and stretch comes along too. `animateCat` writes
//     body.scale (nap 1.12/0.73/0.89, pounce 0.94/0.83/1.15, land 1.14/0.78/1.05)
//     and body.rotation.y (the 'cross' torso yaw). Markings used to be siblings
//     of the body under the cat group and stayed put while the torso squashed
//     under them; as children of the body they now move with it.
//
// The 0.8% radial lift is deliberately tiny. It is far larger than the depth
// buffer's precision at chase range (~0.01mm at 4.4m against this near/far
// pair) so it never z-fights, and far SMALLER than the shadow rig's depth bias
// (sun.shadow.bias -0.00015 over the fitted frustum is centimetres) so a patch
// can never cast the self-shadow that gave the old blobs their stuck-on rim.
const PATCH_LIFT = 1.008;
const PATCH_UP = new THREE.Vector3(0, 1, 0);

// One elliptical patch on a sphere of radius `r`, centred on direction `dir`.
// halfX/halfZ are TANGENT half-extents at the pole, in units of the sphere
// radius, so 1.0 is a patch that reaches 45 degrees from its centre — a stripe
// wrapping well down the flank — and 0.2 is a small spot.
//
// `more` (polish 1a, Task 5): further patches, each { dir, halfX, halfZ,
// rings, seg } with `dir` already a direction on the sphere, built into the
// SAME geometry. A tabby's "M" bar runs on back over the crown this way: one
// geometry per bar, as before, so the build creates exactly the objects it did
// (three.js draws Math.random for every geometry's uuid, and the flat trace's
// seeded stream runs through the cat builds).
function patchGeometry(r, dir, halfX, halfZ, rings = 4, seg = 18, more = []) {
  const pos = [0, r * PATCH_LIFT, 0]; // centre vertex at the pole
  const nor = [0, 1, 0];
  const idx = [];
  const v = new THREE.Vector3();
  addPatch(pos, nor, idx, r, halfX, halfZ, rings, seg, true);
  const toDir = new THREE.Quaternion().setFromUnitVectors(PATCH_UP, new THREE.Vector3(...dir).normalize());
  if (more.length) {
    // Each extra patch is built at the pole like the first, then turned onto its
    // own direction ahead of the whole geometry's turn onto `dir` below: by
    // toDir⁻¹ · (its own turn), so the final turn lands it on its own direction.
    const back = toDir.clone().invert();
    for (const m of more) {
      const from = pos.length / 3;
      addPatch(pos, nor, idx, r, m.halfX, m.halfZ, m.rings, m.seg, false);
      const q = back.clone().multiply(new THREE.Quaternion().setFromUnitVectors(PATCH_UP, new THREE.Vector3(...m.dir).normalize()));
      for (let i = from * 3; i < pos.length; i += 3) {
        v.set(pos[i], pos[i + 1], pos[i + 2]).applyQuaternion(q); pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
        v.set(nor[i], nor[i + 1], nor[i + 2]).applyQuaternion(q); nor[i] = v.x; nor[i + 1] = v.y; nor[i + 2] = v.z;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  // Built centred on +Y so halfX/halfZ mean what they say; swung onto `dir`
  // afterwards. applyQuaternion goes through applyMatrix4, which carries the
  // normal attribute with it.
  geo.applyQuaternion(toDir);
  return geo;
}

// One patch's rings and triangles at the pole, appended to pos/nor/idx. The
// first patch's centre vertex is already in place (`first`); a further patch
// adds its own.
function addPatch(pos, nor, idx, r, halfX, halfZ, rings, seg, first) {
  const v = new THREE.Vector3();
  if (!first) { pos.push(0, r * PATCH_LIFT, 0); nor.push(0, 1, 0); }
  const c = pos.length / 3 - 1; // the centre vertex
  for (let i = 1; i <= rings; i++) {
    const f = i / rings;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      // Offset in the pole's tangent plane, then re-normalised: the patch is a
      // spherical cap section, so it follows the curvature instead of chording
      // across it.
      v.set(Math.cos(a) * f * halfX, 1, Math.sin(a) * f * halfZ).normalize();
      nor.push(v.x, v.y, v.z);
      pos.push(v.x * r * PATCH_LIFT, v.y * r * PATCH_LIFT, v.z * r * PATCH_LIFT);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(c, c + 1 + ((j + 1) % seg), c + 1 + j); // centre fan
  for (let i = 1; i < rings; i++) {
    const a0 = c + 1 + (i - 1) * seg;
    const b0 = c + 1 + i * seg;
    for (let j = 0; j < seg; j++) {
      const jn = (j + 1) % seg;
      idx.push(a0 + j, b0 + jn, b0 + j, a0 + j, a0 + jn, b0 + jn);
    }
  }
}

// Every patch of one colour on one host, as ONE mesh. This is the reason the
// wave's mesh delta is negative rather than zero: a tabby's stripes were three
// meshes and are now one, and the cow cat's two body patches are now one.
// Draw calls are the budget (VISUAL-PASS.md section 0); triangles are not.
function addMarking(host, r, color, patches) {
  const geos = patches.map((p) => patchGeometry(r, p.dir, p.halfX, p.halfZ, 4, 18, p.more));
  const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos);
  host.add(new THREE.Mesh(geo, mat(color)));
}

// A patch's centre is authored the way the old blobs were — as a point in the
// PARENT's space — and converted here into a direction on the host sphere.
// Dividing out the host's own scale first is what makes (0.12, 0.54, -0.08) on
// the body land in the same visual place it used to.
function dirOn(point, centre, scale) {
  return [
    (point[0] - centre[0]) / scale[0],
    (point[1] - centre[1]) / scale[1],
    (point[2] - centre[2]) / scale[2],
  ];
}

// Collar ring + per-style extras, shared by cat and chicken (which wear the
// same collars at different sizes). `scale` shrinks the whole thing for the
// chicken; the ring/charm anchor points are passed in by the caller.
function buildCollar(style, ringR, tubeR, charmPos) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, tubeR, 6, 12), mat(COLLAR_COLORS[style] ?? 0xd84040));
  ring.rotation.x = Math.PI / 2 - NECK_RING_TILT;
  ring.name = 'collarRing';
  group.add(ring);
  if (style === 'bell') {
    const bell = ball(tubeR * 1.35, 0xf2c14e, 1, 1, 1, 8, 6);
    bell.position.copy(charmPos);
    group.add(bell);
  } else if (style === 'heart') {
    const charm = ball(tubeR * 1.1, HEART_CHARM, 1, 0.85, 0.6, 8, 6);
    charm.position.copy(charmPos);
    group.add(charm);
    for (const side of [-1, 1]) {
      const lobe = ball(tubeR * 0.6, HEART_CHARM, 1, 1, 0.6, 6, 5);
      lobe.position.set(charmPos.x + side * tubeR * 0.55, charmPos.y + tubeR * 0.7, charmPos.z);
      group.add(lobe);
    }
  } else if (style === 'tag') {
    // A flat disc hanging at the throat, faced forward (-z) so it reads as a
    // coin rather than a bead.
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(tubeR * 1.1, tubeR * 1.1, tubeR * 0.3, 10), mat(TAG_SILVER));
    tag.rotation.x = Math.PI / 2;
    tag.position.copy(charmPos);
    group.add(tag);
  } else if (style === 'studded') {
    // studs live in the ring's local XY plane so they follow its tilt
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stud = ball(tubeR * 0.55, 0xf2c14e, 1, 1, 1, 5, 4);
      stud.position.set(Math.cos(a) * ringR, Math.sin(a) * ringR, tubeR * 0.7);
      ring.add(stud);
    }
  } else if (style === 'sparklecollar') {
    // small bright beads all round the ring, in its local plane so they follow its tilt
    const beadColors = [0xffffff, PRIZE_GOLD, 0x7ef2e8, 0xf27ab0];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bead = ball(tubeR * 0.9, beadColors[i % beadColors.length], 1, 1, 1, 6, 5);
      bead.position.set(Math.cos(a) * ringR, Math.sin(a) * ringR, tubeR * 0.9);
      ring.add(bead);
    }
    // a big gold sparkle charm at the throat to catch the eye
    const charm = new THREE.Mesh(starGeometry(tubeR * 2.2, tubeR * 1.0, tubeR * 0.6), mat(PRIZE_GOLD));
    charm.position.copy(charmPos);
    group.add(charm);
  }
  return group;
}

// A flat five-point star, extruded a hair so it has a face to catch light.
function starGeometry(outer, inner, depth) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// Visit-prize head, face and neck items, shared by the cat and Hagrid. Each
// takes the same anchors the shop items of that slot use, so the prize sits
// where its neighbours do: `k` scales size, the rest are the slot's anchors.
// `ringY` is where the two rings (Party Crown, Leaf Crown) sit; it defaults to
// `y`. Hagrid needs his lower: his hats rest on top of the comb at `y`, but a
// ring that wide hung there floats round the comb, clear of his small skull.
function addPrizeHead(head, id, { k, y, rx, rz, ringY = y }) {
  if (id === 'partycrown') {
    y = ringY;
    // a gold band with five tall points (the Flower Crown is soft petals)
    const band = new THREE.Mesh(new THREE.TorusGeometry(rx * 0.95, 0.011 * k, 5, 12), mat(PRIZE_GOLD));
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, rz / rx, 1);
    band.position.set(0, y - 0.005, 0);
    head.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.03 * k, 0.1 * k, 4), mat(PRIZE_GOLD));
      point.position.set(Math.cos(a) * rx * 0.95, y + 0.045 * k, Math.sin(a) * rz * 0.95);
      head.add(point);
      const jewel = ball(0.014 * k, i % 2 ? 0x4ec9d4 : PRIZE_RIBBON, 1, 1, 1, 5, 4);
      jewel.position.set(Math.cos(a) * rx * 0.95, y + 0.1 * k, Math.sin(a) * rz * 0.95);
      head.add(jewel);
    }
  } else if (id === 'leafcrown') {
    // a ring of green leaves, each tipped outward
    y = ringY;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = ball(0.032 * k, PRIZE_LEAF[i % PRIZE_LEAF.length], 0.55, 0.3, 1.5, 5, 4);
      leaf.position.set(Math.cos(a) * rx, y, Math.sin(a) * rz);
      leaf.rotation.y = -a + Math.PI / 2;
      leaf.rotation.x = -0.5;
      head.add(leaf);
    }
    const twig = new THREE.Mesh(new THREE.TorusGeometry(rx, 0.006 * k, 4, 12), mat(0x6b4a2a));
    twig.rotation.x = Math.PI / 2;
    twig.scale.set(1, rz / rx, 1);
    twig.position.set(0, y - 0.01, 0);
    head.add(twig);
  } else if (id === 'candlehat') {
    // a tiny pink cake with frosting, one candle and a flame. Scaled to 0.65 and
    // sunk into the fur so the flame tops out near the Party Crown's points and
    // the head close-up frames the whole thing.
    const c = k * 0.65;
    y -= 0.045;
    const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * c, 0.085 * c, 0.06 * c, 10), mat(PRIZE_CAKE));
    cake.position.set(0, y + 0.03 * c, 0);
    head.add(cake);
    const frosting = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * c, 0.08 * c, 0.018 * c, 10), mat(PRIZE_FROSTING));
    frosting.position.set(0, y + 0.067 * c, 0);
    head.add(frosting);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.01 * c, 0.01 * c, 0.07 * c, 6), mat(0x4ec9d4));
    candle.position.set(0, y + 0.11 * c, 0);
    head.add(candle);
    const flame = ball(0.014 * c, PRIZE_FLAME, 0.8, 1.5, 0.8, 5, 4);
    flame.position.set(0, y + 0.16 * c, 0);
    head.add(flame);
  }
}

function addPrizeFace(head, id, { k, x, y, z, starZ, skull }) {
  if (id === 'starshades') {
    // big star lenses (the Sunglasses are round and dark): a pink star on a
    // slightly larger gold star, yawed to follow the cheek, plus a gold bridge
    for (const side of [-1, 1]) {
      const lens = new THREE.Group();
      const back = new THREE.Mesh(starGeometry(0.082 * k, 0.04 * k, 0.012 * k), mat(PRIZE_GOLD));
      back.position.z = 0.007 * k;
      const front = new THREE.Mesh(starGeometry(0.066 * k, 0.03 * k, 0.014 * k), mat(PRIZE_STAR_LENS));
      lens.add(back, front);
      lens.position.set(side * x, y, starZ);
      lens.rotation.y = -side * 0.4;
      head.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(x * 0.5, 0.01 * k, 0.01 * k), mat(PRIZE_GOLD));
    bridge.position.set(0, y, starZ + 0.004);
    head.add(bridge);
  } else if (id === 'warpaint') {
    // three blue stripes on each cheek, each placed ON the skull ellipsoid and
    // turned to lie along its tangent there, slanting down toward the chin
    const [ax, ay, az] = skull;
    const cx = x * 1.5;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const sy = y - (0.03 + i * 0.032) * k;
        const ux = cx / ax, uy = sy / ay;
        const sz = -az * Math.sqrt(Math.max(0.05, 1 - ux * ux - uy * uy));
        const yaw = Math.atan2(cx / (ax * ax), -sz / (az * az));
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08 * k, 0.012 * k, 0.012 * k), mat(PRIZE_WARPAINT));
        stripe.position.set(side * cx, sy, sz - 0.003 * k);
        stripe.rotation.y = -side * yaw;
        stripe.rotation.z = -side * 0.3;
        head.add(stripe);
      }
    }
  }
}

function addPrizeNeck(head, id, { k, y, z, ringR, ringBack = 0 }) {
  if (id === 'streamerscarf') {
    // a fat red wrap with a gold stripe, and four fanned streamers hanging at the front
    const band = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.05 * k, 6, 12), mat(PRIZE_STREAMERS[0]));
    band.rotation.x = Math.PI / 2 - NECK_RING_TILT;
    band.position.set(0, y, z + ringBack);
    head.add(band);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(ringR + 0.02 * k, 0.018 * k, 5, 12), mat(PRIZE_STREAMERS[1]));
    stripe.rotation.x = Math.PI / 2 - NECK_RING_TILT;
    stripe.position.set(0, y + 0.02 * k, z + ringBack);
    head.add(stripe);
    for (let i = 0; i < 4; i++) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.055 * k, 0.22 * k, 0.014 * k), mat(PRIZE_STREAMERS[i]));
      tail.position.set((-0.075 + i * 0.05) * k, y - 0.17 * k, z - 0.07 * k - i * 0.004);
      tail.rotation.z = (i - 1.5) * 0.2;
      head.add(tail);
    }
  }
}

// Hagrid's russet feathers, shared with coatColor so his map dot matches.
const HAGRID_FEATHER = HEN.FEATHER;

// Hagrid's neck items (Task 8, R12). Today's neck items hung round an
// imaginary upright neck; the new neck leans back from under the skull into
// the breast (about 48° at the collar), so the rings (collar, scarf, the
// streamer scarf's band) go round it at HEN_*_U along it, and the front pieces
// (bow tie, necktie, bandana, the scarf's tail, the streamers) sit on its
// front surface at their own height. A ring square to the neck stands up
// behind his head like a sash, so each is leaned HEN_RING_LEAN back toward
// level; leaned, a ring needs R/cos(lean) to clear a neck of radius R, so
// each is a size up (collar 0.135, scarf ×1.3, streamer band 0.155).
const HEN_COLLAR_U = 0.5;
const HEN_SCARF_U = 0.45;
const HEN_RING_LEAN = 0.4;
const HEN_SCARF_LEAN = 0.25; // higher up, a leaned scarf's front would rise into his throat
const _Z = new THREE.Vector3(0, 0, 1);
const _X = new THREE.Vector3(1, 0, 0);

// The ring round the neck at u: its centre, its axis (the neck's downward
// tangent leaned toward straight down) and its front (perpendicular to the
// axis, forward and down).
function neckRing(u, lean = HEN_RING_LEAN) {
  const { centre, tangent } = henNeckAt(u);
  const axis = tangent.clone().applyAxisAngle(_X, lean);
  const front = new THREE.Vector3(0, -axis.z, axis.y);
  if (front.z > 0) front.negate();
  return { centre, axis, front };
}

// Turn `obj` so its local +z (a torus's axis) is the ring's axis at u, and
// centre it there.
function ringTheNeck(obj, u, lean = HEN_RING_LEAN) {
  const { centre, axis } = neckRing(u, lean);
  obj.rotation.set(0, 0, 0);
  obj.quaternion.setFromUnitVectors(_Z, axis);
  obj.position.copy(centre);
  return obj;
}

// Hagrid the chicken honors the cat parts contract so the animator, camera,
// and every interaction work unchanged: legs[0]/legs[1] are the real legs
// (the 4-beat gait's front pair is exactly a bipedal alternating step),
// legs[2]/legs[3] are hidden dummies, and the comb stands in for the ears.
//
// Body refinement, Task 8 (R10): a hen built from src/cat/hen.js's parts at
// today's size: the body (breast, hackles and both folded wings in one
// vertex-coloured mesh, so the animator's squash, nap and fluff carry them);
// in the head group the skull and neck (one mesh, first child), the beak, the
// wattles, the comb's front and back halves (earL/earR) and two eyes; seven
// tail feathers in three meshes, all on tailPivots[0] (nap turns each nested
// pivot by 0.55, so feathers on pivots 1 and 2 would fan apart); per leg a
// feathery thigh with a scaly shank (first child) and a foot (userData.paw).
// 15 meshes bare, one shared vertex-coloured material plus the plain beak.
function buildChicken(accessories = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }) {
  const g = new THREE.Group();
  const painted = litMaterial(0xffffff, { vertexColors: true });

  const body = new THREE.Mesh(henBodyGeometry(), painted);
  body.position.y = HEN_BODY.Y;
  body.scale.set(...HEN_BODY.SCALE);
  g.add(body);

  const head = new THREE.Group();
  const skullNeck = new THREE.Mesh(henSkullNeckGeometry(), painted);
  head.add(skullNeck);
  head.userData.neckBase = [...skullNeck.geometry.userData.neckBase];
  const beak = new THREE.Mesh(henBeakGeometry(), mat(HEN.BEAK));
  head.add(beak);
  const wattles = new THREE.Mesh(henWattlesGeometry(), painted);
  wattles.name = 'wattles';
  head.add(wattles);
  // the comb's halves stand in for the ears; their geometry is counter-rolled
  // by the resting ear roll, so at rest (±REST) the crest stands upright
  const [combFront, combBack] = henCombHalves();
  const earL = new THREE.Mesh(combFront, painted);
  const earR = new THREE.Mesh(combBack, painted);
  for (const [ear, s] of [[earL, 1], [earR, -1]]) {
    ear.position.set(...HEN_COMB.PIVOT);
    ear.rotation.z = s * HEN_COMB.REST;
    head.add(ear);
  }
  for (const side of [-1, 1]) {
    // today's eye spots, so face items are untouched; turned to look out of
    // the skull along its surface normal there
    const eye = new THREE.Mesh(henEyeGeometry(), painted);
    eye.position.set(side * 0.09, 0.03, -0.1);
    const [ax, ay, az] = HEN_SKULL;
    const n = new THREE.Vector3(eye.position.x / (ax * ax), eye.position.y / (ay * ay), eye.position.z / (az * az)).normalize();
    eye.quaternion.setFromUnitVectors(_Z, n);
    head.add(eye);
  }
  head.position.set(0, 0.78, -0.28);
  g.add(head);

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.add(new THREE.Mesh(henShankGeometry(), painted));
    const foot = new THREE.Mesh(henFootGeometry(), painted);
    foot.position.set(0, HEN_LEG.FOOT_Y, 0);
    leg.add(foot);
    leg.userData.paw = foot;
    leg.position.set(side * 0.1, 0.3, 0.02);
    g.add(leg);
    legs.push(leg);
  }
  for (let i = 0; i < 2; i++) legs.push(new THREE.Group()); // hidden gait dummies

  // tail: the standard pivot chain (3 live pivots + 2 dummies); all seven
  // feathers hang on the first, so nap's per-pivot wrap turns the fan whole
  const tail = new THREE.Group();
  const tailPivots = [];
  let parent = tail;
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.position.z = i === 0 ? 0 : 0.05;
    parent.add(pivot);
    tailPivots.push(pivot);
    parent = pivot;
  }
  for (const geo of henTailGeometries()) tailPivots[0].add(new THREE.Mesh(geo, painted));
  for (let i = 0; i < 2; i++) tailPivots.push(new THREE.Group()); // pivot-count dummies
  tail.position.set(0, 0.51, 0.32); // = base.tailAnchor: the animator carries it with the body
  tail.rotation.x = -0.6;
  g.add(tail);

  // accessories fit a chicken just fine (a chicken in a bell collar, especially) —
  // but only head/face/neck items: a chicken has no torso, shoulders, or paws
  // worth dressing, so body/back/feet items are skipped outright below rather
  // than crammed onto a bird frame.
  if (accessories.collar) {
    // the ring goes square round the neck; the charm hangs at its front
    const { axis, front } = neckRing(HEN_COLLAR_U);
    const q = new THREE.Quaternion().setFromUnitVectors(_Z, axis);
    const charm = front.clone().multiplyScalar(0.17).addScaledVector(axis, 0.01).applyQuaternion(q.clone().invert());
    const collar = buildCollar(accessories.collar, 0.135, 0.024, charm);
    collar.getObjectByName('collarRing').rotation.set(0, 0, 0);
    // the charms are built facing forward (-z) in the head's frame: undo the
    // ring's turn on each, about the charm's spot, so the tag, star and heart
    // still face forward rather than down the neck
    const qInv = q.clone().invert();
    for (const piece of collar.children) {
      if (piece.name === 'collarRing') continue;
      piece.position.sub(charm).applyQuaternion(qInv).add(charm);
      piece.quaternion.premultiply(qInv);
    }
    head.add(ringTheNeck(collar, HEN_COLLAR_U));
  }

  // head: hats sit between the comb and the beak, scaled down for a chicken skull
  if (accessories.head === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = ball(0.024, [0xf2a0c0, 0xf2e04e, 0xffffff][i % 3], 1, 1, 1, 5, 4);
      petal.position.set(Math.cos(a) * 0.09, 0.2, Math.sin(a) * 0.06);
      head.add(petal);
    }
  } else if (accessories.head === 'tophat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 10), mat(HAT_BLACK));
    brim.position.set(0, 0.19, 0);
    head.add(brim);
    const crownPart = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 10), mat(HAT_BLACK));
    crownPart.position.set(0, 0.24, 0);
    head.add(crownPart);
  } else if (accessories.head === 'beanie') {
    // low enough that the cap's faceted underside meets the skull all round
    // the comb's base, so no red shows in a gap between them
    const cap = ball(0.11, BEANIE_COLOR, 1, 0.65, 1, 8, 6);
    cap.position.set(0, 0.19, 0);
    head.add(cap);
    const pompom = ball(0.026, 0xf5f5f5, 1, 1, 1, 6, 5);
    pompom.position.set(0, 0.27, 0);
    head.add(pompom);
  } else if (accessories.head === 'wizard') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 10), mat(WIZARD_COLOR));
    brim.position.set(0, 0.19, 0);
    head.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 10), mat(WIZARD_COLOR));
    cone.position.set(0, 0.28, 0);
    cone.rotation.z = 0.12;
    head.add(cone);
    const star = ball(0.016, 0xf2c14e, 1, 1, 0.5, 5, 4);
    star.position.set(0.04, 0.25, -0.05);
    head.add(star);
  }

  // face: glasses fitted to his side-set eyes, each rim facing out of the
  // skull over its eye, the bridge arcing over the beak's root (glasses.js;
  // polish-catlooks 2026-11-02: the old forward-facing rings were edge-on to
  // anyone looking at his eyes, so they never showed)
  if (accessories.face === 'glasses' || accessories.face === 'sunglasses') {
    for (const m of buildGlasses(accessories.face, GLASSES.hen)) head.add(m);
  } else if (accessories.face === 'monocle') {
    // polish-catlooks (2026-11-02): the rim as thick as the glasses' frames
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.026, GLASSES.hen.tube, 6, 10), mat(GLASSES_FRAME));
    rim.position.set(0.09, 0.03, -0.1);
    head.add(rim);
    for (let i = 0; i < 2; i++) {
      const link = ball(0.006, GLASSES_FRAME, 1, 1, 1, 4, 3);
      link.position.set(0.105 + i * 0.01, 0 - i * 0.024, -0.09);
      head.add(link);
    }
  } else if (accessories.face === 'eyepatch') {
    const patch = ball(0.032, HAT_BLACK, 1, 1, 0.4, 8, 6);
    patch.position.set(0.09, 0.03, -0.105);
    head.add(patch);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.006, 6, 14), mat(HAT_BLACK));
    band.rotation.x = Math.PI / 2 - 0.25;
    band.rotation.z = 0.2;
    band.position.set(0, 0.05, 0);
    head.add(band);
  }

  // neck: on the new neck's front, just below the wattles — a chicken in a
  // bowtie is the joke. Each front piece sits at its own height against the
  // neck's front surface (henNeckFrontZ); the scarf's band rings the neck.
  const KNOT_Y = -0.16;
  const knotZ = henNeckFrontZ(KNOT_Y);
  if (accessories.neck === 'bandana') {
    // the triangle's top face spans z -0.12..+0.06 about its centre: its back
    // edge goes just in front of the neck
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.15, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.21, henNeckFrontZ(-0.135) - 0.066);
    head.add(tri);
  } else if (accessories.neck === 'necktie') {
    const knot = ball(0.022, NECKTIE_COLOR, 1, 0.8, 0.8, 6, 5);
    knot.position.set(0, KNOT_Y, knotZ - 0.03);
    head.add(knot);
    // the blade lies down the breast, which slopes forward under the neck
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), mat(NECKTIE_COLOR));
    blade.rotation.x = Math.PI + 0.5;
    blade.position.set(0, KNOT_Y - 0.085, knotZ - 0.06);
    head.add(blade);
  } else if (accessories.neck === 'bowtie') {
    // each wing's base reaches 0.04 behind its centre: they stand clear of
    // the neck, the knot between them
    const knot = ball(0.02, BOWTIE_COLOR, 1, 1, 1, 6, 5);
    knot.position.set(0, KNOT_Y, knotZ - 0.037);
    head.add(knot);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.04, 3), mat(BOWTIE_COLOR));
      wing.rotation.z = -side * (Math.PI / 2);
      wing.position.set(side * 0.04, KNOT_Y, knotZ - 0.045);
      head.add(wing);
    }
  } else if (accessories.neck === 'scarf') {
    // today's band, a size up so it clears the neck, round it
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.024, 6, 12), mat(SCARF_COLOR));
    band.scale.setScalar(1.3);
    head.add(ringTheNeck(band, HEN_SCARF_U, HEN_SCARF_LEAN));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.015), mat(SCARF_COLOR));
    // the loose end hangs from the ring's front down onto the breast
    tail.position.set(0.04, -0.22, -0.045);
    tail.rotation.set(0.5, 0, 0.15);
    head.add(tail);
  }

  // visit prizes (collar prizes go through buildCollar above)
  // The rings sit ON his head (skull top ~0.137, ~0.10-0.12 under the ring),
  // round the comb, which pokes up through the middle like a real crown's.
  addPrizeHead(head, accessories.head, { k: 0.82, y: 0.2, rx: 0.09, rz: 0.06, ringY: 0.115 });
  addPrizeFace(head, accessories.face, { k: 0.75, x: 0.09, y: 0.03, z: -0.1, starZ: -0.112, skull: [0.13, 0.13, 0.13] });
  // the streamer scarf: its band and stripe ring the neck like the scarf; its
  // streamers hang in front of the breast
  const prizeNeck = new THREE.Group();
  addPrizeNeck(prizeNeck, accessories.neck, { k: 0.67, y: -0.11, z: -0.03, ringR: 0.155 });
  let rings = 0;
  for (const piece of [...prizeNeck.children]) {
    if (piece.geometry.type === 'TorusGeometry') {
      ringTheNeck(piece, HEN_SCARF_U - 0.06 * rings++, HEN_SCARF_LEAN);
    }
    head.add(piece);
  }

  // body/back/feet: no torso, shoulders, or paw-shells worth dressing on a
  // bird frame — every item in those slots is skipped here rather than
  // rendered floating or mis-anchored.

  // Never merged. render/mergeprops.js welds a top-level child's leaves into
  // one mesh per material, and animator.js drives THIS rig by the references
  // in userData.parts — a merged leg is a leg the animator still holds a
  // pointer to and the scene no longer contains. walk.js already runs the
  // merge before any cat exists, so this flag is belt-and-braces for a harness
  // or a future caller that does not.
  g.userData.noMerge = true;
  g.userData.breed = 'hagrid';
  g.userData.parts = { body, head, tail, tailPivots, legs, earL, earR, whiskers: [] };
  // combGive (R11): the animator damps his comb's ear writes about the rest to
  // a quarter, so a twitch is a wobble and the fight's ear-pin never splits it.
  // tailAnchor: the tail's resting spot, which the animator carries with the
  // posed body so the fan's root stays in his back (nap drops and squashes it).
  g.userData.base = { bodyY: HEN_BODY.Y, bodyScale: [...HEN_BODY.SCALE], headPos: [0, 0.78, -0.28], tailRotX: -0.6, combGive: 0.25, tailAnchor: [0, 0.51, 0.32] };
  return g;
}

// Where the camera looks on a cat: the head, plus the 4 cm the old 0.6 sat above
// the old head (0.56). Follows the head if the body is reshaped again.
export const CAT_LOOK_Y = HEAD.POS[1] + 0.04;

// -----------------------------------------------------------------------------
// THE UNDERSIDE (Task 6): belly, chest and, on a fluffy cat, the ruff (ruff.js), merged
// into one vertex-coloured geometry in TORSO-LOCAL space (the body mesh's own
// frame: less (0, CENTRE_Y, 0), divided by the body scale), so it is hung on
// the torso and posed with it. Each part is authored in the cat's frame
// exactly as the separate meshes were, then carried into the torso's.
// `f` is STYLE.body (Digit's narrow frame). userData.ranges gives each part's
// vertex range; userData.chestCentre the chest's centre, torso-local.
// A simple build rounds the belly and chest at 12×8 (the triangle cap).
export function undersideGeometry(s, coat, f = [1, 1, 1], opts = {}) {
  const [fx, fy, fz] = f;
  const BS = [TORSO.SCALE[0] * fx, TORSO.SCALE[1] * fy, TORSO.SCALE[2] * fz];
  const [w, h] = opts.simple ? [12, 8] : [BALL_W, BALL_H];
  const toTorso = (geo) => geo.translate(0, -TORSO.CENTRE_Y, 0).scale(1 / BS[0], 1 / BS[1], 1 / BS[2]);
  // The chest and belly ease from their pale front into the coat painted under
  // them (polish-catlooks, 2026-11-02; coat.js undersideColourAt), instead of
  // one solid colour with a hard disc edge. Per vertex: its direction from the
  // part's centre (cat frame) against the part's front axis, and the coat under
  // it. The coat is painted by UNDEFORMED torso direction, so the vertex's
  // torso-local direction is carried back through the deformation exactly
  // (torsoUnitAt), not just normalised: the deformation bends directions by up
  // to ~6° under the chest and belly, enough to shift a tabby band under the
  // rim (a band is ~25° wide, its edge ~4°).
  const eased = (geo, hex, centre, front, band) => {
    geo.deleteAttribute('uv');
    const p = geo.attributes.position;
    const c = new THREE.Color();
    const col = new Float32Array(p.count * 3);
    const local = [0, 0, 0], unit = [0, 0, 0], dir = [0, 0, 0], fromCentre = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      local[0] = p.getX(i); local[1] = p.getY(i); local[2] = p.getZ(i);
      fromCentre.set(local[0] * BS[0] - centre[0], local[1] * BS[1] + TORSO.CENTRE_Y - centre[1], local[2] * BS[2] - centre[2]).normalize();
      undersideColourAt(coat, hex, fromCentre.toArray(dir), torsoUnitAt(local, unit), c, front, band);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  const bellyAt = [0, TORSO.CENTRE_Y - 0.08 * fy, -0.06 * fz];
  const chestAt = [0, TORSO.CENTRE_Y + CHEST.DY, CHEST.Z * fz];
  const parts = {
    belly: eased(toTorso(new THREE.SphereGeometry(0.26, w, h).scale(0.74 * fx, 0.58 * fy, 0.95 * fz)
      .translate(...bellyAt)), s.belly, bellyAt, UNDER_FRONT.belly, BELLY_BLEND),
    chest: eased(toTorso(new THREE.SphereGeometry(CHEST.R, w, h).scale(CHEST.SCALE[0] * fx, CHEST.SCALE[1], CHEST.SCALE[2])
      .translate(...chestAt)), coat.chest, chestAt, UNDER_FRONT.chest, UNDER_BLEND),
  };
  if (s.fluffy) {
    // a small bib under the chin, jaw fluff and a fringe (ruff.js), already
    // vertex-coloured and without uv
    parts.ruff = toTorso(ruffGeometry(s, opts.simple));
  }
  const ranges = {};
  let at = 0;
  for (const [k, geo] of Object.entries(parts)) {
    const n = geo.attributes.position.count;
    ranges[k] = [at, at + n];
    at += n;
  }
  const geo = mergeGeometries(Object.values(parts));
  for (const p of Object.values(parts)) p.dispose();
  geo.userData.ranges = ranges;
  geo.userData.chestCentre = [0, CHEST.DY / BS[1], CHEST.Z * fz / BS[2]];
  return geo;
}

// The corner map draws a remote sibling's dot in their cat's main coat colour.
// Hagrid has no STYLE entry (he is built by buildChicken), so he is named here.
export function coatColor(breed, look = null) {
  if (look != null) return COATS[sanitizeLook(look).coat].hex;
  if (breed === 'hagrid') return HAGRID_FEATHER;
  return (Object.hasOwn(STYLE, breed) ? STYLE[breed] : STYLE.tabby).base;
}

// A copy of a breed's STYLE row (read-only: tests build a cat from a variant).
export const catStyle = (breed) => Object.freeze({ ...STYLE[breed] });

export function buildCat(breed, accessories = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }, opts = {}) {
  if (breed === 'hagrid') return buildChicken(accessories);
  // opts.style (Clan Life Part 1): a whole STYLE-shaped row, e.g. a clan coat
  // (clancast.js CLAN_COATS). Everything below reads `s`, so the row paints the
  // coat, points, paws, tail and markings and sets g.scale; `breed` still picks
  // the eyes. With a style, STYLE[breed] is never read. Without one, nothing
  // changes (the golden test pins it). The cat builder's lookToStyle(look)
  // will come in through this same seam.
  // opts.look (the cat builder): a Look, used when opts.style is absent. It is
  // turned into a frozen style row by lookToStyle, so buildCat only ever reads
  // `s`, never writes it. `breed` stays userData.breed; the row, not the
  // breed, supplies the eyes (eyeColor), skull patch (headPatch) and tail
  // fluff (tailFluff).
  const s = opts.style ?? (opts.look != null ? lookToStyle(opts.look) : STYLE[breed]);
  const g = new THREE.Group();
  const pointColor = s.points ? s.accent : s.base;

  // body: the torso mesh (an undeformed unit sphere shaped by torsoGeometry), with the belly and chest on it
  //
  // STYLE.body reshapes the torso for one cat (Digit's narrow kitten frame).
  // BODY_SCALE is the ONE place that shape lives, and everything that has to
  // match the torso reads it rather than the bare TORSO.SCALE: the body
  // mesh, the markings (they are patches of the host sphere, so they take the
  // body's scale from the scene graph), userData.base.bodyScale (the animator
  // rewrites body.scale from it every frame — miss it and the cat is reset to
  // the standard torso on the first frame) and the belly below. Body- and
  // back-slot accessories take fx/fy/fz too. With no `body` the factors are
  // exactly 1, so a standard breed's scale is TORSO.SCALE untouched.
  const BODY_R = TORSO.R;
  const [fx, fy, fz] = s.body ?? [1, 1, 1];
  const BODY_SCALE = [TORSO.SCALE[0] * fx, TORSO.SCALE[1] * fy, TORSO.SCALE[2] * fz];
  // A balloon's tie, authored on the old torso, re-placed on the new one at
  // the same distance from the fur (torso.js torsoRetarget).
  const onBack = (x, y, z) => torsoRetarget([x, y, z], [fx, fy, fz]);
  // Neck items, the neck prize and the collar sit NECK_FORWARD ahead of where
  // they sat on the old torso. A fluffy cat's rest on its small bib, at a
  // tabby's spot (NECK_FLUFFY).
  const neckZ = NECK_FORWARD + (s.fluffy ? NECK_FLUFFY.forward : 0);
  const neckY = s.fluffy ? -NECK_FLUFFY.drop : 0;
  // The coat is painted into the torso's vertex colours (coat.js): tabby
  // bands, the calico's patches, Robbie's bib and flanks, D2's shoulder band.
  // White material, so a painted base is exactly today's material colour.
  const coat = coatFromStyle(s);
  const body = new THREE.Mesh(
    paintCoat(torsoGeometry(BODY_R, ...TORSO.SEG[opts.simple ? 'simple' : 'full']), coat),
    litMaterial(0xffffff, { vertexColors: true }));
  body.scale.set(...BODY_SCALE);
  body.position.y = TORSO.CENTRE_Y;
  body.userData.coat = coat; // the limbs' tops blend from it (limbs.js)
  g.add(body);
  // The underside: belly, chest and (fluffy cats) ruff, merged into ONE
  // vertex-coloured mesh hung on the torso, so it naps, sits and stretches with
  // it. The animator counter-yaws it (R4) so the chest stays under the chin.
  const underside = new THREE.Mesh(
    undersideGeometry(s, coat, [fx, fy, fz], opts),
    litMaterial(0xffffff, { vertexColors: true }));
  underside.userData.underside = true;
  underside.userData.ranges = underside.geometry.userData.ranges;
  underside.userData.chestCentre = underside.geometry.userData.chestCentre;
  body.add(underside);

  // head
  const SKULL_R = SKULL.R;
  const SKULL_SCALE = SKULL.SCALE;
  const head = new THREE.Group();
  const skull = ball(SKULL_R, pointColor, ...SKULL_SCALE);
  head.add(skull);
  const MUZZLE_R = 0.09;
  const MUZZLE_SCALE = [1.25, 0.75, 0.9];
  const MUZZLE_CENTRE = [0, -0.06, -0.16];
  const muzzle = ball(MUZZLE_R, s.belly, ...MUZZLE_SCALE);
  muzzle.position.set(...MUZZLE_CENTRE);
  head.add(muzzle);
  const nose = ball(0.024, INNER_EAR, 1, 0.8, 0.8, 6, 5);
  nose.position.set(0, -0.02, -0.245);
  nose.userData.nose = true;   // tests find the nose by this, not by child order
  head.add(nose);
  // `ears` grows the cone in its geometry (the animator writes ear rotation, so
  // the mesh transform is not ours to scale) and lifts it by half the added
  // height, so a bigger ear grows UP off the skull instead of sinking into it.
  const EARS = s.ears ?? 1;
  const earH = s.tufts ? 0.19 : 0.15;
  const earLift = (earH * (EARS - 1)) / 2;
  for (const side of [-1, 1]) {
    if (!opts.simple) {
      const cheek = ball(0.065, s.belly, 1, 0.9, 0.8, 8, 6);
      cheek.position.set(side * 0.085, -0.07, -0.14);
      head.add(cheek);
    }
    const ear = new THREE.Mesh(earGeometry(0.075 * EARS, earH * EARS), litMaterial(pointColor, { vertexColors: true }));
    ear.position.set(side * 0.12, 0.18 + earLift, 0.01);
    ear.rotation.z = -side * 0.22;
    head.add(ear);
    if (!opts.simple) {
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.045 * EARS, 0.09 * EARS, 4), mat(INNER_EAR));
      inner.position.set(side * 0.115, 0.16 + earLift, -0.015);
      inner.rotation.z = -side * 0.22;
      head.add(inner);
    }
    if (side === -1) head.userData.earL = ear;
    else head.userData.earR = ear;

    const eye = ball(0.036, s.eyeColor ?? EYE_COLORS[breed] ?? 0x4e9440, 1, 1.15, 0.7, 8, 6);
    eye.position.set(side * 0.083, 0.03, -0.165);
    head.add(eye);
    // Polish 1a, Task 5: the pupil and the shine sit on the eye rather than
    // out in front of it (they were at z -0.19 and -0.195), so from the side
    // the far eye's pupil and shine no longer poke out of the head's outline.
    // The eye itself is where it was.
    const pupil = ball(0.017, 0x1a1a1e, 0.7, 1.2, 0.6, 6, 5);
    pupil.position.set(side * 0.083, 0.03, EYE_PUPIL_Z);
    head.add(pupil);
    if (!opts.simple) {
      const shine = ball(0.007, 0xffffff, 1, 1, 1, 4, 3);
      shine.position.set(side * 0.07, 0.048, EYE_SHINE_Z);
      head.add(shine);
    }
  }
  // whiskers
  // Polish 1a, Task 5: from the walk camera (behind) the old whiskers, 0.28
  // out and swept BACK to z -0.14, stood 9 cm clear of the head on both sides,
  // three lines within a few pixels of each other: a white bar through the head
  // like a bone. Now they end WHISKER_REACH out (within 4 cm of the skull's
  // outline from behind, whose half-width at whisker height is 0.19-0.20) and
  // sweep forward to z -0.235, so from behind the head hides most of them, at
  // a fainter 0.45. From the front they still fan out past the cheeks.
  const whiskers = [];
  if (!opts.simple) {
    const whiskerMat = new THREE.LineBasicMaterial({ color: 0xf8f8f8, transparent: true, opacity: 0.45 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = -0.05 - i * 0.018;
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.07, y, -0.19),
          new THREE.Vector3(side * WHISKER_REACH, y + (i - 1) * 0.03, -0.235),
        ]);
        const w = new THREE.Line(geo, whiskerMat);
        head.add(w);
        whiskers.push(w);
      }
    }
  }
  head.position.set(...HEAD.POS);
  head.scale.setScalar(HEAD.SCALE);
  g.add(head);

  // legs: hip-pivoted groups, each one smooth limb (limbs.js) and a paw.
  // The limb is today's leg colour, its top blending into the torso's own
  // painted colour at that hip (R7), on the body's vertex-coloured material.
  const legs = [];
  const legHex = s.whiteLegs ? s.belly : pointColor;
  const limbTop = [];
  const legSpots = [
    [-LEGS.FRONT_X, LEGS.FRONT_Z, false], [LEGS.FRONT_X, LEGS.FRONT_Z, false], // front L, R
    [-LEGS.HIND_X, LEGS.HIND_Z, true], [LEGS.HIND_X, LEGS.HIND_Z, true], // back L, R
  ];
  for (const [x, z, hind] of legSpots) {
    const leg = new THREE.Group();
    const topColour = coatColourAt(coat, legTopDir(x, z, [fx, fy, fz]));
    limbTop.push(topColour);
    const limb = new THREE.Mesh(
      paintLimb(limbGeometry(LEGS.LEN, hind, opts.simple), legHex, topColour),
      litMaterial(0xffffff, { vertexColors: true }));
    leg.add(limb);
    // The foot (body refinement Task 4, limbs.js footGeometry): a soft oval
    // with a flat sole and a low top, four toes scalloped into its front edge
    // and claw tips just showing, in today's paw colour on the shared
    // vertex-coloured material. Its sole is PAW_HALF below its centre, so it
    // stands where the old paw stood (on y = 0), and its heel is where the old
    // paw's was. The shape lives in the geometry, not in mesh.scale, because
    // the `feet` accessories write paw.scale directly; they also swap in the
    // plain paw (plainPawGeometry), so a boot sits exactly where it always did.
    const pawColour = s.socks ? WHITE_FUR : s.points ? s.accent : s.belly;
    const paw = new THREE.Mesh(footGeometry(pawColour, opts.simple), litMaterial(0xffffff, { vertexColors: true }));
    paw.position.set(0, PAW_Y, -0.012); // the sole stays where it always was
    leg.add(paw);
    leg.userData.paw = paw;
    leg.position.set(x, LEGS.HIP_Y, z);
    g.add(leg);
    legs.push(leg);
  }

  // -------------------------------------------------------------------------
  // TAIL — 5 tapered links on nested pivots (torso.js TAIL, sketch). It grows
  // out of the rump: rooted at the rump's surface, thick at the base, with a
  // root ball rounding the join, rounded joints and a rounded tip, all MERGED
  // into the five link meshes (mesh count is the budget).
  //
  // The chain itself is the animator's: `animateCat` writes every pivot's
  // ROTATION each frame (the resting curl, R3, the lagged sway, the 'cross'
  // lash) and tail.rotation.x (the raise). It never writes a pivot POSITION, so
  // the pivots are plain: 0 at the root, then one link along +z each. The root
  // frame is tipped down by TAIL.ROOT_TILT (base.tailRotX) so that, with the
  // full curl, link 0 leaves level and each further link bends up by CURL.
  //
  // Polish 1a, Task 5: a dark-tipped tail (stripes, points) is dark over its
  // last third, not its last two links (40%, a dark spike). The tip link is
  // dark; the link before it is painted in its vertex colours, its first third
  // blending from the coat into the tip colour (TIP_FROM) and the rest dark.
  const tail = new THREE.Group();
  const tailPivots = [];
  // polish-tails: a plumed tail (long fur) takes its radii from tailRadius
  // and ignores tailFluff; with no plume the tail is today's, vertex for vertex.
  const plume = s.tailPlume ?? (s.tailFluff > 1 ? 1 : s.fluffy ? 0.5 : 0);
  const TF = plume > 0 ? 1 : (s.tailFluff ?? 1);
  const tailRad = (u) => tailRadius(u, plume) * TF;
  const darkTip = !!(s.stripes || s.points);
  let parent = tail;
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    if (i > 0) pivot.position.set(0, 0, TAIL.LINK);
    const blend = darkTip && i === 3;
    // The link runs from its pivot along +z: the cylinder's +y axis turned onto
    // +z. Open-ended; the balls below close every end. The blended link has
    // rings at each third of its length, for its colours to change along.
    const parts = [new THREE.CylinderGeometry(tailRad((i + 1) / 5), tailRad(i / 5), TAIL.LINK, 12, blend ? 3 : 1, true)
      .rotateX(Math.PI / 2).translate(0, 0, TAIL.LINK / 2)];
    // A simple build (strays, rivals, ghosts) rounds them at 8×5: Digit's
    // simple cat sits at the 5,500-triangle cap once the chest is in.
    const [rw, rh, jw, jh] = opts.simple ? [8, 5, 8, 5] : [12, 8, 10, 6];
    // A plume's balls are fat enough for the 10-sided ball (its pole across
    // the tail) to zigzag through the 12-sided link at every joint. Plumed,
    // each ball is 12 around with its pole along the tail, so its equator is
    // the link's own end ring and the ball only shows round the bend.
    const ball = plume > 0
      ? (r) => new THREE.SphereGeometry(r, 12, opts.simple ? 4 : 8).rotateX(Math.PI / 2)
      : (r, w = jw, h = jh) => new THREE.SphereGeometry(r, w, h);
    parts.push(i === 0
      ? ball(plume > 0 ? tailRad(0) : TAIL.ROOT_BALL, rw, rh)   // the root, into the rump
      : ball(tailRad(i / 5)));   // a rounded joint
    if (i === 4) parts.push(ball(tailRad(1)).translate(0, 0, TAIL.LINK)); // the tip
    const geo = mergeGeometries(parts);
    const seg = new THREE.Mesh(geo, blend
      ? litMaterial(0xffffff, { vertexColors: true })
      : mat(i >= 3 && darkTip ? s.accent : s.base));
    if (blend) {
      // Coat at and behind the pivot, the tip colour from a third of the way
      // along the link (u = 2/3 of the whole tail) on.
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const from = new THREE.Color(s.base), to = new THREE.Color(s.accent), c = new THREE.Color();
      for (let k = 0; k < pos.count; k++) {
        c.lerpColors(from, to, Math.min(1, Math.max(0, pos.getZ(k) / (TAIL.LINK * TIP_FROM))));
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    pivot.add(seg);
    parent.add(pivot);
    tailPivots.push(pivot);
    parent = pivot;
  }
  tail.position.set(0, TORSO.CENTRE_Y + TAIL.ROOT_DY, TAIL.ROOT_Z);
  tail.rotation.x = TAIL.ROOT_TILT;
  tail.scale.setScalar(TAIL.SCALE);
  g.add(tail);

  // -------------------------------------------------------------------------
  // BREED MARKINGS. Every one of these is now a patch of the surface it sits on
  // — see the block comment on patchGeometry() for what was wrong before and
  // why the raking sun of Wave 1 made it the loudest defect on the cat. The
  // centres below are the SAME authored points the old blobs used, converted to
  // directions on the host sphere by dirOn(), so nothing moves; only the
  // geometry stops floating.
  //
  // `onSkull` / `onMuzzle` parent to the mesh, not to the group,
  // which is what makes a marking follow the animator's squash and stretch.
  //
  // They QUEUE rather than build: every patch of one colour on one host is
  // collected first and emitted as one addMarking call at the end, so two
  // flags that paint one colour on one host still cost one mesh, not two.
  // Map keeps insertion order, so the build stays deterministic.
  const queued = new Map(); // host mesh -> { r, byColour: Map(colour -> patches) }
  const queue = (host, r, centre, scale) => (colour, pts) => {
    if (!queued.has(host)) queued.set(host, { r, byColour: new Map() });
    const { byColour } = queued.get(host);
    if (!byColour.has(colour)) byColour.set(colour, []);
    byColour.get(colour).push(...pts.map((p) => ({ ...p, dir: dirOn(p.at, centre, scale) })));
  };
  const onSkull = queue(skull, SKULL_R, [0, 0, 0], SKULL_SCALE);
  const onMuzzle = queue(muzzle, MUZZLE_R, MUZZLE_CENTRE, MUZZLE_SCALE);

  // The body's own markings (stripes, band, calico and cow patches) are
  // painted into the torso instead — see coat.js. Only the head's remain here.
  if (s.headStripes) {
    // The tabby "M": three thin bars running up the forehead from between the
    // eyes. On a patch swung onto a direction in the skull's YZ plane, halfX
    // stays across the face and halfZ runs up the slope of the brow, so these
    // are narrow (0.07) and long (0.34). The side bars sit ~15 degrees off the
    // midline — far enough apart that no two overlap.
    //
    // Polish 1a, Task 5: each bar runs on back over the crown and down the back
    // of the head (from behind, the head was a plain ball), as two more patches
    // built into the bar's own geometry: no extra mesh, no extra object.
    onSkull(s.accent, [
      { at: [0, 0.13, -0.15], halfX: 0.07, halfZ: 0.34, more: crownStripe(0, 0.07, opts.simple) },
      { at: [-0.055, 0.12, -0.145], halfX: 0.06, halfZ: 0.28, more: crownStripe(-CROWN_STRIPE_X, 0.06, opts.simple) },
      { at: [0.055, 0.12, -0.145], halfX: 0.06, halfZ: 0.28, more: crownStripe(CROWN_STRIPE_X, 0.06, opts.simple) },
    ]);
  }
  if (s.chin) {
    // Under the muzzle and a little forward, so it shows from the chase camera
    // as a pale throat-line rather than only from below. The point is on the
    // muzzle's own surface, 37 degrees forward of straight down.
    onMuzzle(WHITE_FUR, [{ at: [0, -0.114, -0.209], halfX: 0.45, halfZ: 0.35 }]);
  }
  if (s.patches) {
    onSkull(s.headPatch ?? 0xd88030, [{ at: [0.09, 0.14, -0.05], halfX: 0.50, halfZ: 0.56 }]);
  }
  if (s.cow) {
    // Robbie's coat, from the photo: black on top with white flanks and bib
    // (painted, coat.js) and a narrow white blaze up between the eyes.
    // The blaze: ~4cm wide, so it fits in the gap between the eyes, and long
    // enough to run from the muzzle up onto the forehead.
    onSkull(s.belly, [{ at: [0, 0.09, -0.17], halfX: 0.10, halfZ: 0.45 }]);
  }

  for (const [host, { r, byColour }] of queued) {
    for (const [colour, patches] of byColour) addMarking(host, r, colour, patches);
  }

  // accessories — head/g-parented so they track poses; every item here is
  // added BEFORE the final g.scale.setScalar(s.scale) below, so all of its
  // dimensions and offsets are automatically scaled with the breed (same
  // idiom the body/head/legs already rely on) — a Persian (1.05x) and a
  // Maine Coon (1.3x) both get a proportionally-sized outfit for free.
  // A `tagCollar` cat wears its own collar until the player buys it another:
  // the accessory replaces the built-in one rather than stacking on it.
  const collarStyle = accessories.collar ?? (s.tagCollar ? 'tag' : null);
  if (collarStyle) {
    const collar = buildCollar(collarStyle, 0.15, 0.028, new THREE.Vector3(...COLLAR_CHARM));
    collar.getObjectByName('collarRing').position.z = NECK_RING_BACK.collar;
    collar.position.set(0, -0.14 + neckY, 0.1 + neckZ);
    collar.name = 'collar';
    head.add(collar);
    // The animator carries it on the neck in every pose (animator.js
    // fitNeck; on the head as built in the stretch and the swim).
    head.userData.collar = collar;
  }

  // head: every hat is one vertex-coloured mesh seated ON the skull, its
  // brim or band draped over the head with the ears poking through (hats.js;
  // accessories polish Task 1 — they used to float 4-5 cm over the head).
  const hat = buildHat(accessories.head, { simple: opts.simple });
  if (hat) head.add(hat);

  // face: eye level — thick frames, a faint tinted lens and a glint, the
  // rims just in front of the eyes (glasses.js; polish-catlooks 2026-11-02:
  // the old 6 mm rings barely showed)
  if (accessories.face === 'glasses' || accessories.face === 'sunglasses') {
    for (const m of buildGlasses(accessories.face, GLASSES.cat)) head.add(m);
  } else if (accessories.face === 'monocle') {
    // polish-catlooks (2026-11-02): the rim as thick as the glasses' frames
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.032, GLASSES.cat.tube, 6, 10), mat(GLASSES_FRAME));
    rim.position.set(0.083, 0.03, -0.17);
    head.add(rim);
    for (let i = 0; i < 3; i++) { // chain dangles toward the cheek
      const link = ball(0.007, GLASSES_FRAME, 1, 1, 1, 4, 3);
      link.position.set(0.105 + i * 0.012, -0.005 - i * 0.028, -0.16);
      head.add(link);
    }
  } else if (accessories.face === 'eyepatch') {
    const patch = ball(0.044, HAT_BLACK, 1, 1, 0.4, 8, 6);
    patch.position.set(0.083, 0.03, -0.175);
    head.add(patch);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 14), mat(HAT_BLACK));
    band.rotation.x = Math.PI / 2 - 0.25;
    band.rotation.z = 0.2;
    band.position.set(0, 0.06, -0.01);
    head.add(band);
  }

  // neck: at the neck seam, where the collar also sits, NECK_FORWARD ahead of
  // where it sat on the old torso so it lies on the deeper chest. Every neck
  // piece (and the neck prize's) is recorded in head.userData.neckwear, so the
  // animator carries them on the neck with the collar (animator.js fitNeck).
  const neckwear = [];
  let neckFrom = head.children.length;
  if (accessories.neck === 'bandana') {
    // a flat face to the front, its third corner tucked back into the neck
    // (accessories polish Task 4: with the corner forward, a head turned to
    // groom left it poking out past the nose like a little flag)
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.17, 3), mat(0x3a6ea5));
    tri.rotation.set(Math.PI, Math.PI, 0);
    tri.position.set(0, -0.18 + neckY, 0.03 + neckZ);
    head.add(tri);
  } else if (accessories.neck === 'necktie') {
    const knot = ball(0.028, NECKTIE_COLOR, 1, 0.8, 0.8, 6, 5);
    knot.position.set(0, -0.17 + neckY, 0.04 + neckZ);
    head.add(knot);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 4), mat(NECKTIE_COLOR));
    blade.rotation.x = Math.PI;
    blade.position.set(0, -0.32 + neckY, 0.08 + neckZ);
    head.add(blade);
  } else if (accessories.neck === 'bowtie') {
    const knot = ball(0.026, BOWTIE_COLOR, 1, 1, 1, 6, 5);
    knot.position.set(0, -0.17 + neckY, 0.04 + neckZ);
    head.add(knot);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.05, 3), mat(BOWTIE_COLOR));
      wing.rotation.z = -side * (Math.PI / 2);
      wing.position.set(side * 0.05, -0.17 + neckY, 0.045 + neckZ);
      head.add(wing);
    }
  } else if (accessories.neck === 'scarf') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 6, 12), mat(SCARF_COLOR));
    band.rotation.x = Math.PI / 2 - NECK_RING_TILT;
    band.position.set(0, -0.15 + neckY, 0.08 + neckZ + NECK_RING_BACK.scarf);
    head.add(band);
    // the tail hangs from the band's front down the chest, leaning back with
    // it (accessories polish Task 4: it hung straight down 6 cm further back,
    // inside the chest with only its foot showing below it)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), mat(SCARF_COLOR));
    tail.position.set(0.06, -0.28 + neckY, 0.04 + neckZ);
    tail.rotation.set(-0.38, 0, 0.15);
    head.add(tail);
  }

  neckwear.push(...head.children.slice(neckFrom));

  // visit prizes (collar prizes go through buildCollar above; the head
  // prizes are hats now, built above)
  addPrizeFace(head, accessories.face, { k: 1, x: 0.083, y: 0.03, z: -0.17, starZ: -0.19, skull: [0.21, 0.193, 0.1995] });
  neckFrom = head.children.length;
  addPrizeNeck(head, accessories.neck, { k: 1, y: -0.15 + neckY, z: 0.08 + neckZ, ringR: 0.15, ringBack: NECK_RING_BACK.streamer });
  neckwear.push(...head.children.slice(neckFrom));
  if (neckwear.length) head.userData.neckwear = neckwear;

  // body: over the torso — hoodie is a shell plus a hood, a cape a cloak over
  // the back. The three shells are the torso's own geometry, inflated (more on
  // the back than under the belly), hung on the torso with no scale of their
  // own: they take its BODY_SCALE, so a narrow cat's coat is narrow too, and
  // follow every pose. The capes are cloth cut from the same surface and hung
  // on the torso the same way (CAPE, polish-pose Task 2). The hood lies on
  // the coat at the withers (hoodOn, below).
  // The back slot hangs only the balloons on g: they float (polish-pose
  // Task 3, ruling P3). (The backpack, wings and jetpack once hung here too,
  // tagged userData.ridesBody and carried on the posed torso in the sit; since
  // accessories polish Task 2 they hang on the body, backitems.js.) Each
  // balloon piece remembers its tie (userData.float.tie, cat frame, where its
  // string is tied on the back) and each string its knot end and
  // built length (userData.span); animator.js floatBalloons carries the tie on
  // the posed torso in every state, keeps the balloons and the knot upright at
  // their built height unless the tie rises, and stretches each string from
  // the tie to its knot end.
  const floatOn = (piece, tie) => {
    piece.userData.float = { tie: tie.toArray() };
    g.add(piece);
    return piece;
  };
  const floatString = (tie, top, r) => {
    const len = tie.distanceTo(top);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 4), mat(0xf5f5f5));
    string.position.addVectors(tie, top).multiplyScalar(0.5);
    // the cylinder's axis (+y) laid exactly along tie → top, as floatBalloons lays it
    string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(tie).normalize());
    string.userData.span = { top: top.toArray(), len };
    return floatOn(string, tie);
  };
  const coatShell = (color, paint) => {
    // A full shell is 32×32 (the torso itself is 40×40; the simple shell uses
    // the torso's simple grid), fine enough that the shell does not sag
    // between its facets and thin the clearance to the fur.
    const geo = torsoGeometry(BODY_R, ...(opts.simple ? TORSO.SEG.simple : [32, 32]));
    const unit0 = geo.userData.unit, pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = shellInflate(unit0[i * 3 + 1]);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const shell = new THREE.Mesh(geo, paint ? litMaterial(0xffffff, { vertexColors: true }) : mat(color));
    if (paint) {
      const unit = geo.userData.unit, n = geo.attributes.position.count;
      const base = new THREE.Color(SWEATER_BASE), stripe = new THREE.Color(SWEATER_STRIPE);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const z = unit[i * 3 + 2];
        const on = SWEATER_STRIPE_Z.some((zi) => Math.abs(z - zi) < 0.088);
        const c = on ? stripe : base;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    body.add(shell);
    return shell;
  };
  // The hood is always DOWN, hat or no hat (accessories polish Task 3): a
  // soft scoop lying on the coat at the withers behind the head, with the
  // hoodie's drawstrings down the chest, ONE mesh on the body (backitems.js
  // buildHood), so it follows every pose with the coat.
  // With a backpack, jetpack or wings on, the hood presses flat as it slides
  // back (tuck), under the pack rather than into it.
  const tuck = accessories.back === 'backpack' || accessories.back === 'jetpack' || accessories.back === 'wings';
  const hoodOn = (color, drawstrings) => body.add(buildHood(color, { bodyScale: BODY_SCALE, simple: !!opts.simple, drawstrings, tuck }));
  // A cape is a cloak on the body (CAPE): the cloth shell, fastened by a gold
  // brooch on the front of each shoulder (CAPE_CLASP), both in ONE mesh. Small
  // round parts lie ON the cloth (onCape): each is built round in the scaled
  // torso frame, turned to face out of the cloth there, lifted off it, and
  // brought back into the body's frame by 1 / BODY_SCALE, so the torso's
  // scale does not squash it (as the raincoat's buttons are counter-scaled).
  const scaled = new THREE.Vector3(...BODY_SCALE);
  const onCape = (geo, a, s, lift, colour, C = CAPE) => {
    const P = capePoint(a, s, undefined, C).multiply(scaled);
    const A = capePoint(a + 0.01, s, undefined, C).multiply(scaled).sub(P), S = capePoint(a, s + 0.01, undefined, C).multiply(scaled).sub(P);
    const n = new THREE.Vector3().crossVectors(S, A).normalize();
    if (n.dot(P) < 0) n.negate();
    geo.deleteAttribute('uv');
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n));
    geo.translate(P.x + n.x * lift, P.y + n.y * lift, P.z + n.z * lift);
    geo.scale(1 / BODY_SCALE[0], 1 / BODY_SCALE[1], 1 / BODY_SCALE[2]);
    geo.userData.at = P.addScaledVector(n, lift).divide(scaled).toArray();
    if (colour !== undefined) {
      const c = new THREE.Color(colour), cnt = geo.attributes.position.count, col = new Float32Array(cnt * 3);
      for (let k = 0; k < cnt; k++) c.toArray(col, k * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    return geo;
  };
  // A cloth that changes for the sit (CAPE_SIT) keeps both geometries in
  // userData.capeGeo; the animator wears one or the other. Whichever is worn
  // is disposed with the cat, and takes the other with it.
  const sitPair = (stand, sit) => {
    let gone = false;
    const both = () => { if (gone) return; gone = true; stand.dispose(); sit.dispose(); };
    stand.addEventListener('dispose', both);
    sit.addEventListener('dispose', both);
    return { stand, sit };
  };
  const capeOn = (color, accent) => {
    const material = mat(color);
    material.side = THREE.DoubleSide;
    const geo = sitPair(capeGeometry(opts.simple), capeGeometry(opts.simple, CAPE_SIT));
    const cape = new THREE.Mesh(geo.stand, material);
    cape.userData.cape = true;
    cape.userData.capeGeo = geo;
    body.add(cape);
    const pins = [-1, 1].map((side) => onCape(new THREE.SphereGeometry(CAPE_CLASP.r, 6, 5).scale(1, 1, CAPE_CLASP.flat), side * CAPE_CLASP.a, CAPE_CLASP.s, CAPE_CLASP.lift));
    const clasp = new THREE.Mesh(mergeGeometries(pins), mat(accent));
    clasp.geometry.computeVertexNormals();
    clasp.userData.capeClasp = true;
    clasp.userData.at = pins.map((g) => g.userData.at);   // each brooch's centre, body-local
    body.add(clasp);
  };
  // The confetti cape's dots: CAPE_DOTS spots (a, s) on the back and flanks,
  // each a flattened ball lying on the cloth, merged into ONE vertex-coloured
  // mesh.
  const confettiOnCape = () => {
    const dotsOn = (C) => {
      const g = mergeGeometries(CAPE_DOTS.map(([a, s], i) =>
        onCape(new THREE.SphereGeometry(0.022, 5, 4).scale(1, 1, 0.4), a, s, 0.004, PRIZE_CONFETTI[i % PRIZE_CONFETTI.length], C)));
      g.computeVertexNormals();
      return g;
    };
    const geo = sitPair(dotsOn(CAPE), dotsOn(CAPE_SIT));   // the dots stay on the sit's cloth too
    const dots = new THREE.Mesh(geo.stand, litMaterial(0xffffff, { vertexColors: true }));
    dots.userData.capeDots = true;
    dots.userData.capeGeo = geo;
    body.add(dots);
  };
  if (accessories.body === 'hoodie') {
    coatShell(HOODIE_COLOR);
    hoodOn(HOODIE_COLOR, true);
  } else if (accessories.body === 'cape' || accessories.body === 'confetticape') {
    const prize = accessories.body === 'confetticape';
    capeOn(prize ? PRIZE_CAPE : CAPE_COLOR, prize ? PRIZE_GOLD : CAPE_ACCENT);
    if (prize) confettiOnCape();
  } else if (accessories.body === 'raincoat') {
    coatShell(RAINCOAT_COLOR);
    hoodOn(RAINCOAT_COLOR, false);
    for (let i = 0; i < 2; i++) { // toggle buttons down the chest (front is -z)
      // on the shell, in body-local space, so it rides the coat; counter-scaled
      // so the torso's own scale does not squash it
      const dir = [0, 0.35 - i * 0.3, -1];
      const L = Math.hypot(...dir), uy = dir[1] / L;
      const button = ball(0.02, 0x8a6a20, 1, 1, 0.6, 6, 5);
      button.position.copy(torsoSurface(dir).multiplyScalar(shellInflate(uy)));
      button.position.addScaledVector(new THREE.Vector3(...dir).divideScalar(L), 0.008);
      button.scale.set(1 / BODY_SCALE[0], 1 / BODY_SCALE[1], 0.6 / BODY_SCALE[2]);
      body.add(button);
    }
  } else if (accessories.body === 'sweater') {
    coatShell(null, true); // knit stripes are painted: one mesh
  }

  // back: the backpack, jetpack and wings are shaped things built ON the
  // torso and hung on the body (backitems.js, accessories polish Task 2), so
  // they follow every pose; each rests on whatever is outermost on the back —
  // the cape's cloth, a coat shell or the fur. The balloons (below) float.
  if (accessories.back === 'backpack' || accessories.back === 'jetpack' || accessories.back === 'wings') {
    const isCape = accessories.body === 'cape' || accessories.body === 'confetticape';
    const isShell = accessories.body === 'hoodie' || accessories.body === 'raincoat' || accessories.body === 'sweater';
    const cover = isCape ? 'cape' : isShell ? 'shell' : 'fur';
    for (const item of buildBackItem(accessories.back, { bodyScale: BODY_SCALE, cover, simple: !!opts.simple })) body.add(item);
  }
  if (accessories.back === 'balloonbunch') {
    // three balloons on three strings tied at one point over the tail; kept
    // under ~y 1.05 so the whole-cat shop thumbnail still frames them. Only
    // the tie moves onto the new back; the balloons keep their heights.
    const tie = new THREE.Vector3(...onBack(0.05, 0.58, 0.2));
    const tops = [[-0.07, 0.79, 0.19], [0.1, 0.86, 0.22], [0.03, 0.74, 0.14]];
    tops.forEach(([bx, by, bz], i) => {
      floatString(tie, new THREE.Vector3(bx, by, bz), 0.003);
      const balloon = ball(0.075, PRIZE_BALLOONS[i], 1, 1.15, 1, 10, 8);
      balloon.position.set(bx, by + 0.09, bz);
      floatOn(balloon, tie);
    });
  } else if (accessories.back === 'balloon') {
    // hovers just over the tail — low enough to stay inside the shop
    // thumbnail's whole-cat framing (~y 1.1 at this plane). The string's foot
    // moves onto the new back; its top, the knot and the balloon keep their heights.
    const foot = new THREE.Vector3(...onBack(0.06, 0.6, 0.2)), top = new THREE.Vector3(0.06, 0.9, 0.2);
    floatString(foot, top, 0.004);
    const knot = ball(0.014, BALLOON_COLOR, 1, 1, 1, 5, 4);
    knot.position.set(0.06, 0.92, 0.2);
    floatOn(knot, foot);
    const balloon = ball(0.09, BALLOON_COLOR, 1, 1.15, 1, 10, 8);
    balloon.position.set(0.06, 1.0, 0.2);
    floatOn(balloon, foot);
  }


  // feet: small shells on the paw positions. Cuff and stripe hang from the paw.
  // Every item first swaps the toed foot for today's plain paw (R8), so it
  // wraps the shape it was made for and sits exactly where it always sat.
  const plainPaw = (leg) => {
    const paw = leg.userData.paw;
    paw.geometry.dispose();
    paw.geometry = plainPawGeometry();
    return paw;
  };
  if (accessories.feet === 'booties') {
    for (const leg of legs) {
      plainPaw(leg);
      leg.userData.paw.material = mat(0xf2c14e);
      leg.userData.paw.scale.multiplyScalar(1.15);
    }
  } else if (accessories.feet === 'goldbooties') {
    // shiny gold paws with a darker gold cuff at the ankle
    for (const leg of legs) {
      plainPaw(leg);
      leg.userData.paw.material = mat(PRIZE_GOLD);
      leg.userData.paw.scale.multiplyScalar(1.18);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 8), mat(0xd9a000));
      cuff.position.set(0, PAW_Y + 0.0385, 0);
      leg.add(cuff);
    }
  } else if (accessories.feet === 'sneakers') {
    for (const leg of legs) {
      plainPaw(leg);
      leg.userData.paw.material = mat(SNEAKER_WHITE);
      leg.userData.paw.scale.set(1.2, 0.95, 1.25);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.09), mat(SNEAKER_ACCENT));
      stripe.position.set(0, PAW_Y - 0.0115, 0);
      leg.add(stripe);
    }
  } else if (accessories.feet === 'rainboots') {
    for (const leg of legs) {
      plainPaw(leg);
      leg.userData.paw.material = mat(RAINBOOT_COLOR);
      leg.userData.paw.scale.set(1.15, 1.4, 1.15);
    }
  } else if (accessories.feet === 'socks') {
    legs.forEach((leg, i) => {
      plainPaw(leg);
      leg.userData.paw.material = mat(SOCK_COLORS[i % SOCK_COLORS.length]);
      leg.userData.paw.scale.set(1.1, 1.3, 1.1);
    });
  }

  // A feet item that makes the paw taller (scale.y > 1) would push its sole
  // into the ground (R2). Lift the paw, and whatever hangs with it, by the
  // extra half-height, so the sole stays where a bare paw's is. A flatter
  // shell (the sneaker, 0.95) is left alone: it clears the ground already.
  for (const leg of legs) {
    const lift = PAW_HALF * Math.max(0, leg.userData.paw.scale.y - 1);
    if (lift) for (const part of leg.children.slice(1)) part.position.y += lift;
  }

  // -------------------------------------------------------------------------
  // LEG LENGTH. Done last, once every part and accessory is in place, so one
  // pass can lift the whole cat. Δ is the extra limb length: each hip pivot
  // rises by Δ and its limb is rebuilt Δ longer, hanging from the pivot as
  // before; the paw (and any feet accessory hung on the leg) drops back by Δ,
  // so it lands where it always did and the cat still stands at y = 0. Every
  // other direct child of g — body (and the underside on it), head, tail,
  // body- and back-slot accessories — rises by Δ with the hips.
  //
  // The animator writes body and head positions from userData.base every
  // frame, so base carries the lift too; it never writes a leg position, so
  // the raised pivots survive every pose.
  //
  // Standing is not the only pose, though. The animator folds legs by scaling
  // them about the hip and swings them by rotating about it, and both of those
  // move a longer leg's paw further than the reference rig's (hip 0.3) that
  // the poses were written for — and EVERY cat's hip is now above that rig's,
  // by base.legLift (0.09 standard, more for Digit). So every lifted child
  // remembers its lifted height in userData.liftY, and animator.js's
  // fitLongLegs uses legLift and legReach to bring the cat down by legLift in
  // a crouch and re-fit each posed leg so its sole lands where the reference
  // rig's would (and never below the ground).
  const LEG_LEN = s.legLen ?? 1;
  const dy = LEGS.LEN * (LEG_LEN - 1);
  const hipY = LEGS.HIP_Y + dy;
  for (const child of g.children) {
    child.position.y += dy;
    child.userData.liftY = child.position.y;
    // a balloon piece's tie and a string's knot end rise with it (one array each)
    if (child.userData.float) child.userData.float.tie[1] += dy;
    if (child.userData.span) child.userData.span.top[1] += dy;
    if (!legs.includes(child) || LEG_LEN === 1) continue;
    const [limb, ...hung] = child.children;
    limb.geometry.dispose();
    const k = legs.indexOf(child);
    limb.geometry = paintLimb(limbGeometry(LEGS.LEN * LEG_LEN, k >= 2, opts.simple), legHex, limbTop[k]);
    for (const part of hung) part.position.y -= dy; // the paw, a cuff, a sneaker stripe
  }
  // The folds (Task 5, R1): each leg gets its baked fold shapes now, with its
  // final limb, paw and feet item in place, so a fold moves exactly these.
  legs.forEach((leg, i) => attachFolds(leg, { hind: i >= 2, simple: !!opts.simple, hipY, len: LEGS.LEN * LEG_LEN }));
  const bodyY = TORSO.CENTRE_Y + dy;
  const headPos = [HEAD.POS[0], HEAD.POS[1] + dy, HEAD.POS[2]];

  g.scale.setScalar(s.scale);
  // Never merged. render/mergeprops.js welds a top-level child's leaves into
  // one mesh per material, and animator.js drives THIS rig by the references
  // in userData.parts — a merged leg is a leg the animator still holds a
  // pointer to and the scene no longer contains. walk.js already runs the
  // merge before any cat exists, so this flag is belt-and-braces for a harness
  // or a future caller that does not.
  g.userData.noMerge = true;
  g.userData.breed = breed;
  g.userData.parts = {
    body, head, tail, tailPivots, legs, underside,
    earL: head.userData.earL, earR: head.userData.earR, whiskers,
  };
  // hipY and legLift (the hip's rise over the reference rig the poses were
  // written for) and legReach (that rig's hip-to-sole drop) drive animator.js's
  // fitLongLegs; poseFit is the per-state correction applyPoseFit adds after it.
  g.userData.base = {
    bodyY, bodyScale: [...BODY_SCALE], headPos, tailRotX: TAIL.ROOT_TILT, tailCurl: TAIL.CURL,
    hipY, legLift: hipY - REF_RIG.HIP_Y, legReach: REF_RIG.REACH, poseFit: POSE_FIT,
    // polish-tails: a plumed tail lies along its own sit and nap curves, and
    // stalking droops its fuller first link (animator.js STALK_CARRIAGE).
    ...(plume > 0 && { tailPlume: plume, sitTail: lyingTail(SIT_TAIL, SIT_TAIL_PLUME, plume), napTail: lyingTail(NAP_TAIL, NAP_TAIL_PLUME, plume) }),
  };
  // opts.scars (fight moves and scars): scars.js render entries. Only a scarred
  // cat gets the scar mesh; without one, nothing here runs.
  if (opts.scars?.length) setCatScars(g, opts.scars);
  return g;
}

// ---------------------------------------------------------------------------
// Fight measurements (2026-11-01 fight moves and scars, Task 2). Each poses the
// cat with animateCat to measure it, and leaves it posed: a fight's staging
// re-poses both cats every frame. Nothing else is touched (not the group's
// position, rotation or scale), and every number is in the cat's own frame
// with its scale applied: where it would be standing at the origin, unrotated.
// Call them once at fight start, before staging.
// ---------------------------------------------------------------------------

const _toGroup = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _pt = new THREE.Vector3();

// The extent of `obj` (with its descendants when `deep`) in the group's own
// frame, scaled by the group: every vertex, so a rotated part is measured as
// it is, not by its loose bounding box. Sprites (name tags) are skipped.
function localBox(group, obj, deep) {
  const box = new THREE.Box3();
  group.updateMatrixWorld(true);
  _toGroup.copy(group.matrixWorld).invert();
  const add = (o) => {
    const pos = o.geometry?.attributes?.position;
    if (o.isSprite || !pos) return;
    _m.multiplyMatrices(_toGroup, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) box.expandByPoint(_pt.fromBufferAttribute(pos, i).applyMatrix4(_m).multiply(group.scale));
  };
  if (deep) obj.traverse(add); else add(obj);
  return box;
}

// The top of the body mesh (the torso alone) in `state`: where a cat landing
// on this one's back stands. The pin uses catBackY(loser, 'pinned'), measured
// rather than worked out from TORSO, so it lands on the flattened back.
export function catBackY(group, state = 'follow') {
  animateCat(group, state, 0, 0);
  return localBox(group, group.userData.parts.body, false).max.y;
}

// What fightactions.js placeFrame turns a cat about: `hindZ`, how far behind
// the group's origin the hind paws' heels are (the pitch turns about them, so
// the hind paws rock on their heels and never dip into the ground), and
// `pivotY`, the torso centre's height in the 'roll' pose (the roll turns
// about it).
// How far in from the heel, as a fraction of half the paw's length, the pitch
// pivot sits. Rocked 0.9 rad (the rear-up) about the heel itself (0) the hind
// paws hover 2-3 cm; about the sole's centre (1) they dip ~3 cm and the hind
// limb's hock (it tips back behind the paw) goes 4-5 cm into the ground. A
// quarter in keeps the paws within ~1.5 cm above the ground and the hock
// within ~2.5 cm below it (measured on tabby, mainecoon, digit, an intruder).
const HEEL_IN = 0.25;
export function catPivot(group) {
  const { body, legs } = group.userData.parts;
  const hagrid = group.userData.breed === 'hagrid';
  animateCat(group, hagrid ? henFightState('roll') : 'roll', 0, 0);
  group.updateMatrixWorld(true);
  _toGroup.copy(group.matrixWorld).invert();
  _pt.setFromMatrixPosition(_m.multiplyMatrices(_toGroup, body.matrixWorld));
  const pivotY = _pt.y * group.scale.y;
  animateCat(group, 'follow', 0, 0);
  // Hagrid's two real feet are legs[0..1]; the rest are empty dummy groups.
  const hind = hagrid ? legs.slice(0, 2) : legs.length >= 4 ? legs.slice(2) : legs;
  let hindZ = 0;
  for (const leg of hind) {
    const b = localBox(group, leg.userData.paw ?? leg, true);
    hindZ = Math.max(hindZ, b.max.z - HEEL_IN * (b.max.z - b.min.z) / 2);
  }
  return { hindZ, pivotY };
}

// Everything the fight needs to know about a cat's size, measured once:
// `top` (the standing cat's highest point, accessories included), `backY`
// and `pinnedBackY` (catBackY standing and pinned) and catPivot's hindZ and
// pivotY. Leaves the cat standing ('follow' at t 0).
export function catDims(group) {
  const pinnedBackY = catBackY(group, group.userData.breed === 'hagrid' ? henFightState('pinned') : 'pinned');
  const { hindZ, pivotY } = catPivot(group);
  const backY = catBackY(group);
  const top = localBox(group, group, true).max.y;
  return { top, backY, pinnedBackY, hindZ, pivotY };
}
