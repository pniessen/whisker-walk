import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';

const STYLE = {
  tabby:     { base: 0x9c7a4f, belly: 0xd8c39a, accent: 0x6f5636, scale: 1.0, stripes: true },
  siamese:   { base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, scale: 0.95, points: true },
  persian:   { base: 0xcfcfd4, belly: 0xe8e8ec, accent: 0xb5b5bc, scale: 1.05, fluffy: true },
  black:     { base: 0x2a2a30, belly: 0x3a3a42, accent: 0x1c1c22, scale: 1.0 },
  calico:    { base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, scale: 1.0, patches: true },
  mainecoon: { base: 0x7a5b3a, belly: 0xb99a72, accent: 0x5a4028, scale: 1.3, fluffy: true, tufts: true },
  // the family pets
  zeetoo:    { base: 0xa8825a, belly: 0xe0ccA0, accent: 0x74582f, scale: 1.0, stripes: true },
  // Robbie is a black cat with white socks and flanks — he used to be drawn as
  // the reverse. Black cap, ears and back come from `base`; muzzle, chest and
  // paws from `belly`; the `cow` markings below add the white flanks and blaze.
  robbie:    { base: 0x1a1a1e, belly: 0xf5f5f5, accent: 0xf5f5f5, scale: 1.05, cow: true, whiteLegs: true },
  // D2 is a large tabby-and-white: tabby cap with the "M", white muzzle, chest,
  // belly and legs, a white band over the shoulders, dark tabby back and tail.
  d2:        { base: 0x5a4a3a, belly: 0xf5f5f2, accent: 0x2e261e, scale: 1.15, stripes: true, headStripes: true, whiteLegs: true, band: true, fluffy: true },
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
//   whiteLegs   — limb cylinders take `belly`, not the point colour (a cat in
//                 white stockings rather than white feet).
//   socks       — paws are WHITE_FUR whatever `belly` is: four white socks on
//                 a cat whose underside is not white.
//   band        — a `belly` band across the shoulders. With `stripes` too, the
//                 front-most stripe is skipped: it sits exactly where the band
//                 goes, and two patches at one lift z-fight.
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
//   tagCollar   — a built-in black collar with a round silver tag, drawn only
//                 when no collar accessory is worn (never two collars).
const INNER_EAR = 0xe8a0a8;
const WHITE_FUR = 0xf5f5f5;
const EYE_COLORS = { siamese: 0x68a8d8, black: 0xd8b830, zeetoo: 0x4e9440, robbie: 0xb8b040, d2: 0xa8b040, digit: 0xa0a048 };

// Cat Couture: palette for the twelve new per-slot accessory items (plus the
// four re-homed ones, which keep their original colors inline below).
const HAT_BLACK = 0x1c1c22;        // tophat
const BEANIE_COLOR = 0xd6602f;     // cozy rust knit
const GLASSES_FRAME = 0xd4a24c;    // thin warm frame
const SUNGLASSES_DARK = 0x26262e;  // dark lens
const NECKTIE_COLOR = 0x7a2436;    // maroon
const BOWTIE_COLOR = 0x2c3e6b;     // navy
const SCARF_COLOR = 0xd6602f;      // cozy rust knit, matches beanie
const HOODIE_COLOR = 0x6a4c93;     // purple hoodie
const CAPE_COLOR = 0xd8303c;       // superhero red
const CAPE_ACCENT = 0xf2c14e;      // gold clasp
const WING_COLORS = [0xf29a8a, 0x9fc9a0]; // coral / sage, mirrored
const SNEAKER_WHITE = 0xf2f2f2;
const SNEAKER_ACCENT = 0xd8303c;
const RAINBOOT_COLOR = 0x3a6ea5;
// Wave-2 catalog balance: every slot gets 4 choices
// `tag` is not in the shop: it is the built-in collar of a cat whose STYLE row
// sets `tagCollar` — a plain black band with a round silver name tag.
const COLLAR_COLORS = { glow: 0x7ef2c0, heart: 0xf27ab0, studded: 0x2c2c34, tag: 0x1c1c22, sparklecollar: 0x8a5cf0 }; // default red below
const TAG_SILVER = 0xc8ccd4;
const HEART_CHARM = 0xe0447a;
const WIZARD_COLOR = 0x4a3b8c;
const RAINCOAT_COLOR = 0xf2c94e;
const SWEATER_BASE = 0x2c6e63;
const SWEATER_STRIPE = 0xf2ead9;
const JETPACK_SILVER = 0xb8bcc4;
const JETPACK_FLAME = 0xf2822e;
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

// Same shape as ball(), but with the non-uniform scale BAKED INTO THE GEOMETRY
// and mesh.scale left at 1. Used for the paws, and only for the paws, because
// the `feet` accessories reach in and write `paw.scale` directly — three of the
// four call `scale.set(...)`, which would wipe a shape carried in mesh.scale and
// hand a boot back its old round ball. Carrying the paw's shape in the geometry
// instead means every existing accessory multiplier composes on top of it
// unchanged.
function shapedBall(r, color, sx, sy, sz, wSeg = BALL_W, hSeg = BALL_H) {
  const geo = new THREE.SphereGeometry(r, wSeg, hSeg);
  geo.scale(sx, sy, sz);
  return new THREE.Mesh(geo, mat(color));
}

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
//   * The host's non-uniform scale (the body's 0.85/0.75/1.35 plush ellipsoid)
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
function patchGeometry(r, dir, halfX, halfZ, rings = 4, seg = 18) {
  const pos = [0, r * PATCH_LIFT, 0]; // centre vertex at the pole
  const nor = [0, 1, 0];
  const idx = [];
  const v = new THREE.Vector3();
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
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j); // centre fan
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * seg;
    const b0 = 1 + i * seg;
    for (let j = 0; j < seg; j++) {
      const jn = (j + 1) % seg;
      idx.push(a0 + j, b0 + jn, b0 + j, a0 + j, a0 + jn, b0 + jn);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  // Built centred on +Y so halfX/halfZ mean what they say; swung onto `dir`
  // afterwards. applyQuaternion goes through applyMatrix4, which carries the
  // normal attribute with it.
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    PATCH_UP, new THREE.Vector3(...dir).normalize()));
  return geo;
}

// Every patch of one colour on one host, as ONE mesh. This is the reason the
// wave's mesh delta is negative rather than zero: a tabby's stripes were three
// meshes and are now one, and the cow cat's two body patches are now one.
// Draw calls are the budget (VISUAL-PASS.md section 0); triangles are not.
function addMarking(host, r, color, patches) {
  const geos = patches.map((p) => patchGeometry(r, p.dir, p.halfX, p.halfZ));
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
  ring.rotation.x = Math.PI / 2 + 0.32;
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

function addPrizeNeck(head, id, { k, y, z, ringR }) {
  if (id === 'streamerscarf') {
    // a fat red wrap with a gold stripe, and four fanned streamers hanging at the front
    const band = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.05 * k, 6, 12), mat(PRIZE_STREAMERS[0]));
    band.rotation.x = Math.PI / 2 + 0.35;
    band.position.set(0, y, z);
    head.add(band);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(ringR + 0.02 * k, 0.018 * k, 5, 12), mat(PRIZE_STREAMERS[1]));
    stripe.rotation.x = Math.PI / 2 + 0.35;
    stripe.position.set(0, y + 0.02 * k, z);
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
const HAGRID_FEATHER = 0xb06a30;

// Hagrid the chicken honors the cat parts contract so the animator, camera,
// and every interaction work unchanged: legs[0]/legs[1] are the real legs
// (the 4-beat gait's front pair is exactly a bipedal alternating step),
// legs[2]/legs[3] are hidden dummies, and the comb stands in for the ears.
function buildChicken(accessories = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }) {
  const g = new THREE.Group();
  const FEATHER = HAGRID_FEATHER;
  const CREAM = 0xe8d0a8;
  const COMB = 0xd83a3a;

  const body = ball(0.34, FEATHER, 0.9, 0.85, 1.1);
  body.position.y = 0.42;
  g.add(body);
  const belly = ball(0.28, CREAM, 0.8, 0.65, 0.95);
  belly.position.set(0, 0.32, -0.04);
  g.add(belly);
  for (const side of [-1, 1]) {
    const wing = ball(0.16, 0x9a5826, 0.35, 0.7, 1.0, 8, 6);
    wing.position.set(side * 0.28, 0.46, 0.02);
    g.add(wing);
  }

  const head = new THREE.Group();
  const skull = ball(0.13, FEATHER, 1, 1.05, 1);
  head.add(skull);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), mat(0xf2a04e));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, -0.01, -0.17);
  head.add(beak);
  const wattle = ball(0.035, COMB, 0.8, 1.2, 0.8, 6, 5);
  wattle.position.set(0, -0.1, -0.12);
  head.add(wattle);
  let earL = null;
  let earR = null;
  for (let i = 0; i < 3; i++) {
    const combBit = ball(0.035, COMB, 0.6, 1.1, 0.8, 6, 5);
    combBit.position.set(0, 0.13 + (i === 1 ? 0.02 : 0), -0.06 + i * 0.06);
    head.add(combBit);
    if (i === 0) earL = combBit;
    if (i === 2) earR = combBit;
  }
  for (const side of [-1, 1]) {
    const eye = ball(0.022, 0x1a1a1e, 1, 1, 1, 6, 5);
    eye.position.set(side * 0.09, 0.03, -0.1);
    head.add(eye);
  }
  head.position.set(0, 0.78, -0.28);
  g.add(head);

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 6), mat(0xf2a04e));
    shank.position.y = -0.15;
    leg.add(shank);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.05, 4), mat(0xf2a04e));
    foot.rotation.y = Math.PI / 4;
    // -0.3 put the cone's underside at world y -0.025, i.e. Hagrid stood 2.5cm
    // into the ground — the same defect the cat's paws had, measured the same
    // way (Box3 over the built model). Hagrid is a playable avatar and gets the
    // same fix.
    foot.position.set(0, -0.2745, -0.04);
    leg.add(foot);
    leg.userData.paw = foot;
    leg.position.set(side * 0.1, 0.3, 0.02);
    g.add(leg);
    legs.push(leg);
  }
  for (let i = 0; i < 2; i++) legs.push(new THREE.Group()); // hidden gait dummies

  // tail: feather fan on the standard pivot chain (3 live pivots + 2 dummies)
  const tail = new THREE.Group();
  const tailPivots = [];
  let parent = tail;
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.position.z = i === 0 ? 0 : 0.05;
    const feather = ball(0.12, i === 1 ? 0x9a5826 : FEATHER, 0.25, 1.15, 0.7, 6, 5);
    feather.position.set((i - 1) * 0.09, 0.1, 0.06);
    feather.rotation.x = 0.5;
    pivot.add(feather);
    parent.add(pivot);
    tailPivots.push(pivot);
    parent = pivot;
  }
  for (let i = 0; i < 2; i++) tailPivots.push(new THREE.Group()); // pivot-count dummies
  tail.position.set(0, 0.52, 0.34);
  tail.rotation.x = -0.6;
  g.add(tail);

  // accessories fit a chicken just fine (a chicken in a bell collar, especially) —
  // but only head/face/neck items: a chicken has no torso, shoulders, or paws
  // worth dressing, so body/back/feet items are skipped outright below rather
  // than crammed onto a bird frame.
  if (accessories.collar) {
    const collar = buildCollar(accessories.collar, 0.12, 0.024, new THREE.Vector3(0, -0.05, -0.06));
    collar.position.set(0, -0.13, 0.06);
    head.add(collar);
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
    const cap = ball(0.11, BEANIE_COLOR, 1, 0.65, 1, 8, 6);
    cap.position.set(0, 0.2, 0);
    head.add(cap);
    const pompom = ball(0.026, 0xf5f5f5, 1, 1, 1, 6, 5);
    pompom.position.set(0, 0.28, 0);
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

  // face: two small frames at eye level plus a bridge
  if (accessories.face === 'glasses' || accessories.face === 'sunglasses') {
    const dark = accessories.face === 'sunglasses';
    const frameColor = dark ? SUNGLASSES_DARK : GLASSES_FRAME;
    for (const side of [-1, 1]) {
      const lens = dark
        ? ball(0.024, frameColor, 1, 1, 0.4, 8, 6)
        : new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 10), mat(frameColor));
      lens.position.set(side * 0.09, 0.03, -0.1);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.005, 0.005), mat(frameColor));
    bridge.position.set(0, 0.03, -0.1);
    head.add(bridge);
  } else if (accessories.face === 'monocle') {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 10), mat(GLASSES_FRAME));
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

  // neck: at the neck seam, just below the wattle — a chicken in a bowtie is the joke
  if (accessories.neck === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.15, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.16, 0.02);
    head.add(tri);
  } else if (accessories.neck === 'necktie') {
    const knot = ball(0.022, NECKTIE_COLOR, 1, 0.8, 0.8, 6, 5);
    knot.position.set(0, -0.14, 0.03);
    head.add(knot);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), mat(NECKTIE_COLOR));
    blade.rotation.x = Math.PI;
    blade.position.set(0, -0.24, 0.05);
    head.add(blade);
  } else if (accessories.neck === 'bowtie') {
    const knot = ball(0.02, BOWTIE_COLOR, 1, 1, 1, 6, 5);
    knot.position.set(0, -0.14, 0.03);
    head.add(knot);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.04, 3), mat(BOWTIE_COLOR));
      wing.rotation.z = -side * (Math.PI / 2);
      wing.position.set(side * 0.04, -0.14, 0.035);
      head.add(wing);
    }
  } else if (accessories.neck === 'scarf') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.024, 6, 12), mat(SCARF_COLOR));
    band.rotation.x = Math.PI / 2 + 0.3;
    band.position.set(0, -0.12, 0.04);
    head.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.015), mat(SCARF_COLOR));
    tail.position.set(0.04, -0.2, 0.06);
    tail.rotation.z = 0.15;
    head.add(tail);
  }

  // visit prizes (collar prizes go through buildCollar above)
  // The rings sit ON his head (skull top ~0.137, ~0.10-0.12 under the ring),
  // round the comb, which pokes up through the middle like a real crown's.
  addPrizeHead(head, accessories.head, { k: 0.82, y: 0.2, rx: 0.09, rz: 0.06, ringY: 0.115 });
  addPrizeFace(head, accessories.face, { k: 0.75, x: 0.09, y: 0.03, z: -0.1, starZ: -0.112, skull: [0.13, 0.13, 0.13] });
  addPrizeNeck(head, accessories.neck, { k: 0.67, y: -0.12, z: 0.04, ringR: 0.1 });

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
  g.userData.base = { bodyY: 0.42, bodyScale: [0.9, 0.85, 1.1], headPos: [0, 0.78, -0.28], tailRotX: -0.6 };
  return g;
}

// The corner map draws a remote sibling's dot in their cat's main coat colour.
// Hagrid has no STYLE entry (he is built by buildChicken), so he is named here.
export function coatColor(breed) {
  if (breed === 'hagrid') return HAGRID_FEATHER;
  return (Object.hasOwn(STYLE, breed) ? STYLE[breed] : STYLE.tabby).base;
}

export function buildCat(breed, accessories = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }, opts = {}) {
  if (breed === 'hagrid') return buildChicken(accessories);
  const s = STYLE[breed];
  const g = new THREE.Group();
  const pointColor = s.points ? s.accent : s.base;

  // body: plush ellipsoid + belly + chest
  //
  // STYLE.body reshapes the torso for one cat (Digit's narrow kitten frame).
  // BODY_SCALE is the ONE place that shape lives, and everything that has to
  // match the torso reads it rather than the bare 0.85/0.75/1.35: the body
  // mesh, the markings (dirOn divides by it, so an authored point lands on the
  // narrowed surface, not off it), userData.base.bodyScale (the animator
  // rewrites body.scale from it every frame — miss it and the cat is reset to
  // the standard torso on the first frame) and the belly below. Body- and
  // back-slot accessories take fx/fy/fz too. With no `body` the factors are
  // exactly 1 and every product below is the old number bit-for-bit, which is
  // what keeps the standard breeds byte-identical.
  const BODY_R = 0.32;
  const [fx, fy, fz] = s.body ?? [1, 1, 1];
  const BODY_SCALE = [0.85 * fx, 0.75 * fy, 1.35 * fz];
  const BODY_CENTRE = [0, 0.34, 0];
  // How far a shallower torso brings the top of the back down: the back-slot
  // items sit on the spine and drop with it rather than float over it.
  const BACK_DROP = BODY_R * 0.75 * (1 - fy);
  const body = ball(BODY_R, s.base, ...BODY_SCALE);
  body.position.y = 0.34;
  g.add(body);
  // The belly hangs off the body's underside, so it narrows with it and its
  // offset below the body centre (0.08) shrinks with the depth.
  const belly = ball(0.26, s.belly, 0.78 * fx, 0.6 * fy, 1.15 * fz);
  belly.position.set(0, fy === 1 ? 0.26 : 0.34 - 0.08 * fy, -0.02);
  g.add(belly);

  // head
  const SKULL_R = 0.21;
  const SKULL_SCALE = [1, 0.92, 0.95];
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
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075 * EARS, earH * EARS, 4), mat(pointColor));
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

    const eye = ball(0.036, EYE_COLORS[breed] ?? 0x4e9440, 1, 1.15, 0.7, 8, 6);
    eye.position.set(side * 0.083, 0.03, -0.165);
    head.add(eye);
    const pupil = ball(0.017, 0x1a1a1e, 0.7, 1.2, 0.6, 6, 5);
    pupil.position.set(side * 0.083, 0.03, -0.19);
    head.add(pupil);
    if (!opts.simple) {
      const shine = ball(0.007, 0xffffff, 1, 1, 1, 4, 3);
      shine.position.set(side * 0.07, 0.05, -0.195);
      head.add(shine);
    }
  }
  // whiskers
  const whiskers = [];
  if (!opts.simple) {
    const whiskerMat = new THREE.LineBasicMaterial({ color: 0xf8f8f8, transparent: true, opacity: 0.65 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = -0.05 - i * 0.018;
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.07, y, -0.19),
          new THREE.Vector3(side * 0.28, y + (i - 1) * 0.035, -0.14),
        ]);
        const w = new THREE.Line(geo, whiskerMat);
        head.add(w);
        whiskers.push(w);
      }
    }
  }
  head.position.set(0, 0.56, -0.44);
  g.add(head);

  if (s.fluffy) {
    const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.075, 6, 12), mat(s.belly));
    ruff.rotation.x = Math.PI / 2 - 0.35;
    ruff.position.set(0, 0.46, -0.32);
    g.add(ruff);
  }

  // legs: hip-pivoted groups with paw spheres
  const legs = [];
  const legSpots = [
    [-0.11, -0.3], [0.11, -0.3], // front L, R
    [-0.11, 0.28], [0.11, 0.28], // back L, R
  ];
  for (const [x, z] of legSpots) {
    const leg = new THREE.Group();
    // 6 -> 12 radial segments. At 5cm across and a metre and a half from the
    // camera in the close-up shots, a 6-sided prism shows its flats; 12 costs
    // 24 triangles a leg and reads as a limb.
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.058, 0.26, 12), mat(s.whiteLegs ? s.belly : pointColor));
    limb.position.y = -0.13;
    leg.add(limb);
    // Wave 6. Two things were wrong with the paw. It was a near-sphere, so it
    // read as a knob on the end of a peg rather than as a foot; and it was
    // parked at -0.27, which put its underside at world y -0.0196 — the cat
    // stood 2cm INTO the ground on every surface in the game, measured off the
    // model's own bounding box. It is now flatter, wider, longer front-to-back
    // and pushed a little forward (-z is the cat's facing direction), and sits
    // AT y = 0 rather than through it.
    //
    // The shape lives in the geometry, not in mesh.scale — see shapedBall() for
    // why the `feet` accessories require that.
    // The width is deliberately held near the limb's own 0.058 bottom radius:
    // flaring it wider turns a pale paw into a clog. The read comes from the
    // depth (1.42, so it reaches forward under the leg) and the flatness (0.62),
    // not from the width.
    const pawColour = s.socks ? WHITE_FUR : s.points ? s.accent : s.belly;
    const paw = shapedBall(0.062, pawColour, 1.02, 0.62, 1.42, 12, 9);
    paw.position.set(0, -0.2585, -0.012);
    leg.add(paw);
    leg.userData.paw = paw;
    leg.position.set(x, 0.3, z);
    g.add(leg);
    legs.push(leg);
  }

  // -------------------------------------------------------------------------
  // TAIL — 5 tapered segments on nested pivots. Wave 6 reshapes the segments
  // and re-places the pivots; the CHAIN ITSELF is untouched, because the
  // animator owns it: `animateCat` resets every pivot's ROTATION to zero each
  // frame and then writes rotation.y (the lagged sway, the 'cross' lash) and
  // tail.rotation.x (the raise). It never writes a pivot POSITION and never
  // touches the segment meshes, so the shape below is expressed entirely in
  // pivot positions and per-segment transforms and survives every pose.
  //
  // Three things were wrong with the old tail, all visible in the chase frame:
  //
  //  1. It did not taper to anything. Radii ran 0.048 -> 0.018 and stopped, so
  //     the tip was a 3.6cm flat disc — clearly visible end-on as a bright
  //     circular cap in the raking sun.
  //  2. The base was as thin as the tip was thick. A cat's tail is thickest
  //     where it leaves the body; this one was a uniform 4-5cm rod, which reads
  //     as wire, not fur.
  //  3. It was dead straight. Nothing about a resting cat is dead straight, and
  //     a straight line is the one shape the eye reads as manufactured.
  //
  // The taper now runs 13.2cm across at the root down to 1.2cm at the tip,
  // ending in a hemispherical cap MERGED INTO THE LAST SEGMENT'S GEOMETRY rather
  // than added as a sixth mesh — mesh count is the budget, so a rounded tip has
  // to be free or it does not happen. The arc is a gentle 17 degrees over the
  // whole length, on top of the -0.6 rad the tail group is already held at.
  const TAIL_LINK = 0.132;   // link length; 5 links ~ 0.66, a touch under body length
  const TAIL_ARC = 0.075;    // radians of upward curve per link (4 x 0.075 = 17 deg at the tip)
  const tailR = (u) => 0.060 * Math.pow(1 - u, 0.62) + 0.006; // 0.066 root -> 0.006 tip
  const tail = new THREE.Group();
  const tailPivots = [];
  let parent = tail;
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    // Each pivot sits at the END of the previous link. Pivot rotations are
    // zeroed by the animator every frame, so a parent carries no rotation and
    // these offsets can all be expressed in the same (tail-local) frame using
    // the ABSOLUTE tilt of the preceding link.
    if (i > 0) {
      const prev = (i - 1) * TAIL_ARC;
      pivot.position.set(0, Math.sin(prev) * TAIL_LINK, Math.cos(prev) * TAIL_LINK);
    }
    const far = tailR((i + 1) / 5);
    const near = tailR(i / 5);
    // 6 -> 10 radial segments: at the root this is now a 13cm-diameter tube and
    // a hexagon reads as a hexagon.
    let geo = new THREE.CylinderGeometry(far, near, TAIL_LINK, 10, 1, true);
    if (i === 4) {
      // The rounded tip, merged in. openEnded above so the two pieces do not
      // leave a disc buried inside the cap.
      const cap = new THREE.SphereGeometry(far, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.translate(0, TAIL_LINK / 2, 0);
      geo = mergeGeometries([geo, cap]);
    } else if (i === 0) {
      // Every other link butts into the next one, so only the ROOT end is ever
      // open to the air — and only on link 0, which is buried in the rump
      // anyway. Capped for the sake of the poses that lift the tail clear.
      const root = new THREE.SphereGeometry(near, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      root.translate(0, -TAIL_LINK / 2, 0);
      geo = mergeGeometries([geo, root]);
    }
    const seg = new THREE.Mesh(geo, mat(i >= 3 && (s.stripes || s.points) ? s.accent : s.base));
    // Cylinder's axis is +Y; rotation.x = PI/2 maps +Y onto +Z (straight back).
    // Subtracting this link's tilt swings it up into the arc.
    const tilt = i * TAIL_ARC;
    seg.rotation.x = Math.PI / 2 - tilt;
    seg.position.set(0, Math.sin(tilt) * TAIL_LINK / 2, Math.cos(tilt) * TAIL_LINK / 2);
    pivot.add(seg);
    parent.add(pivot);
    tailPivots.push(pivot);
    parent = pivot;
  }
  // Root moved in and down from (0, 0.44, 0.42). The body's surface at z = 0.42
  // is only y = 0.396, so the OLD root floated 4cm clear of the rump — invisible
  // on a 4.8cm rod, obvious on a 6.6cm one. At z = 0.38 the surface is at 0.454,
  // which buries the thicker root inside the body where it belongs.
  tail.position.set(0, 0.42, 0.38);
  tail.rotation.x = -0.6;
  g.add(tail);

  // -------------------------------------------------------------------------
  // BREED MARKINGS. Every one of these is now a patch of the surface it sits on
  // — see the block comment on patchGeometry() for what was wrong before and
  // why the raking sun of Wave 1 made it the loudest defect on the cat. The
  // centres below are the SAME authored points the old blobs used, converted to
  // directions on the host sphere by dirOn(), so nothing moves; only the
  // geometry stops floating.
  //
  // `onBody` / `onSkull` / `onMuzzle` parent to the mesh, not to the group,
  // which is what makes a marking follow the animator's squash and stretch.
  //
  // They QUEUE rather than build: every patch of one colour on one host is
  // collected first and emitted as one addMarking call at the end, so two
  // flags that both paint `belly` on the body (the shoulder band and a white
  // flank, say) still cost one mesh, not two. Map keeps insertion order, so
  // the build stays deterministic.
  const queued = new Map(); // host mesh -> { r, byColour: Map(colour -> patches) }
  const queue = (host, r, centre, scale) => (colour, pts) => {
    if (!queued.has(host)) queued.set(host, { r, byColour: new Map() });
    const { byColour } = queued.get(host);
    if (!byColour.has(colour)) byColour.set(colour, []);
    byColour.get(colour).push(...pts.map((p) => ({ ...p, dir: dirOn(p.at, centre, scale) })));
  };
  const onBody = queue(body, BODY_R, BODY_CENTRE, BODY_SCALE);
  const onSkull = queue(skull, SKULL_R, [0, 0, 0], SKULL_SCALE);
  const onMuzzle = queue(muzzle, MUZZLE_R, MUZZLE_CENTRE, MUZZLE_SCALE);

  if (s.stripes) {
    // Four bands rather than three. They were three because each was a mesh;
    // merged into one they are free, and four is the count at which a wrapped
    // band pattern stops reading as "some marks on its back" and starts reading
    // as a tabby. halfX 1.5 carries each band ~56 degrees down the flank —
    // over the spine and well past the shoulder, the way a real tabby's do.
    // A cat with a white shoulder `band` loses the front stripe: the band sits
    // on exactly that spot, and two patches at the same lift z-fight.
    onBody(s.accent, [
      { at: [0, 0.58, -0.30], halfX: 1.42, halfZ: 0.15 },
      { at: [0, 0.58, -0.10], halfX: 1.50, halfZ: 0.16 },
      { at: [0, 0.58, 0.11], halfX: 1.50, halfZ: 0.16 },
      { at: [0, 0.58, 0.30], halfX: 1.38, halfZ: 0.14 },
    ].slice(s.band ? 1 : 0));
  }
  if (s.band) {
    // White over the shoulders and down both sides, where a tabby-and-white's
    // bib reaches up round the neck. Slightly wider than the stripe it
    // replaces so it reads as a collar of fur, not as a pale stripe.
    onBody(s.belly, [{ at: [0, 0.58, -0.30], halfX: 1.45, halfZ: 0.14 }]);
  }
  if (s.headStripes) {
    // The tabby "M": three thin bars running up the forehead from between the
    // eyes. On a patch swung onto a direction in the skull's YZ plane, halfX
    // stays across the face and halfZ runs up the slope of the brow, so these
    // are narrow (0.07) and long (0.34). The side bars sit ~15 degrees off the
    // midline — far enough apart that no two overlap.
    onSkull(s.accent, [
      { at: [0, 0.13, -0.15], halfX: 0.07, halfZ: 0.34 },
      { at: [-0.055, 0.12, -0.145], halfX: 0.06, halfZ: 0.28 },
      { at: [0.055, 0.12, -0.145], halfX: 0.06, halfZ: 0.28 },
    ]);
  }
  if (s.chin) {
    // Under the muzzle and a little forward, so it shows from the chase camera
    // as a pale throat-line rather than only from below. The point is on the
    // muzzle's own surface, 37 degrees forward of straight down.
    onMuzzle(WHITE_FUR, [{ at: [0, -0.114, -0.209], halfX: 0.45, halfZ: 0.35 }]);
  }
  if (s.patches) {
    onBody(s.accent, [{ at: [0.12, 0.54, -0.08], halfX: 0.62, halfZ: 0.72 }]);
    onBody(0x333333, [{ at: [-0.12, 0.54, 0.14], halfX: 0.56, halfZ: 0.64 }]);
    onSkull(0xd88030, [{ at: [0.09, 0.14, -0.05], halfX: 0.50, halfZ: 0.56 }]);
  }
  if (s.cow) {
    // Robbie's coat, from the photo: black on top, with a big white patch low
    // on each flank and a narrow white blaze up between the eyes. The two
    // flanks are one colour on one host, so they cost one mesh. On a patch
    // swung onto a sideways direction, halfX runs UP the flank and halfZ along
    // the body: ±35 degrees vertically from a centre ~16 degrees below the
    // equator keeps the black saddle over the top of the back.
    // The bib — the white chest under his chin that the photo shows plainly
    // and the first build left black — is a third patch in the same colour on
    // the same host, so it rides in the same mesh and costs nothing. Centred
    // on the front of the chest just above the equator, so it runs up under
    // the head into the white muzzle and down to the white belly. halfZ runs
    // UP the chest here (±37 degrees) and halfX across it (±29 degrees); the
    // flank patches reach no further forward than ~56 degrees off the front,
    // which leaves a black gap of 25+ degrees between them at every height.
    // That gap matters: two patches at one lift z-fight where they overlap.
    onBody(s.belly, [
      { at: [0.27, 0.27, 0.06], halfX: 0.70, halfZ: 0.90 },
      { at: [-0.27, 0.27, 0.06], halfX: 0.70, halfZ: 0.90 },
      { at: [0, 0.36, -0.43], halfX: 0.55, halfZ: 0.75 },
    ]);
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
    const collar = buildCollar(collarStyle, 0.15, 0.028, new THREE.Vector3(0, -0.06, -0.12));
    collar.position.set(0, -0.14, 0.1);
    head.add(collar);
  }

  // head: above the skull, hats sit between the ears
  if (accessories.head === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = ball(0.026, [0xf2a0c0, 0xf2e04e, 0xffffff][i % 3], 1, 1, 1, 5, 4);
      petal.position.set(Math.cos(a) * 0.11, 0.24, Math.sin(a) * 0.07);
      head.add(petal);
    }
  } else if (accessories.head === 'tophat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 10), mat(HAT_BLACK));
    brim.position.set(0, 0.23, 0);
    head.add(brim);
    const crownPart = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 10), mat(HAT_BLACK));
    crownPart.position.set(0, 0.3, 0);
    head.add(crownPart);
  } else if (accessories.head === 'beanie') {
    const cap = ball(0.14, BEANIE_COLOR, 1, 0.65, 1, 8, 6);
    cap.position.set(0, 0.25, 0);
    head.add(cap);
    const pompom = ball(0.032, 0xf5f5f5, 1, 1, 1, 6, 5);
    pompom.position.set(0, 0.35, 0);
    head.add(pompom);
  } else if (accessories.head === 'wizard') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 10), mat(WIZARD_COLOR));
    brim.position.set(0, 0.23, 0);
    head.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 10), mat(WIZARD_COLOR));
    cone.position.set(0, 0.36, 0);
    cone.rotation.z = 0.12;
    head.add(cone);
    const star = ball(0.022, CAPE_ACCENT, 1, 1, 0.5, 5, 4);
    star.position.set(0.05, 0.31, -0.075);
    head.add(star);
  }

  // face: eye level — two small frames plus a bridge
  if (accessories.face === 'glasses' || accessories.face === 'sunglasses') {
    const dark = accessories.face === 'sunglasses';
    const frameColor = dark ? SUNGLASSES_DARK : GLASSES_FRAME;
    for (const side of [-1, 1]) {
      const lens = dark
        ? ball(0.032, frameColor, 1, 1, 0.4, 8, 6)
        : new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 10), mat(frameColor));
      lens.position.set(side * 0.083, 0.03, -0.17);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.006), mat(frameColor));
    bridge.position.set(0, 0.03, -0.17);
    head.add(bridge);
  } else if (accessories.face === 'monocle') {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 6, 10), mat(GLASSES_FRAME));
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

  // neck: at the neck seam, where the collar also sits
  if (accessories.neck === 'bandana') {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.17, 3), mat(0x3a6ea5));
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.18, 0.02);
    head.add(tri);
  } else if (accessories.neck === 'necktie') {
    const knot = ball(0.028, NECKTIE_COLOR, 1, 0.8, 0.8, 6, 5);
    knot.position.set(0, -0.17, 0.04);
    head.add(knot);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 4), mat(NECKTIE_COLOR));
    blade.rotation.x = Math.PI;
    blade.position.set(0, -0.32, 0.08);
    head.add(blade);
  } else if (accessories.neck === 'bowtie') {
    const knot = ball(0.026, BOWTIE_COLOR, 1, 1, 1, 6, 5);
    knot.position.set(0, -0.17, 0.04);
    head.add(knot);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.05, 3), mat(BOWTIE_COLOR));
      wing.rotation.z = -side * (Math.PI / 2);
      wing.position.set(side * 0.05, -0.17, 0.045);
      head.add(wing);
    }
  } else if (accessories.neck === 'scarf') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 6, 12), mat(SCARF_COLOR));
    band.rotation.x = Math.PI / 2 + 0.35;
    band.position.set(0, -0.15, 0.08);
    head.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), mat(SCARF_COLOR));
    tail.position.set(0.06, -0.28, 0.1);
    tail.rotation.z = 0.15;
    head.add(tail);
  }

  // visit prizes (collar prizes go through buildCollar above)
  addPrizeHead(head, accessories.head, { k: 1, y: 0.24, rx: 0.11, rz: 0.07 });
  addPrizeFace(head, accessories.face, { k: 1, x: 0.083, y: 0.03, z: -0.17, starZ: -0.19, skull: [0.21, 0.193, 0.1995] });
  addPrizeNeck(head, accessories.neck, { k: 1, y: -0.15, z: 0.08, ringR: 0.15 });

  // body: over the torso — hoodie is a shell plus a hood, cape drapes behind/down.
  // The three shells (and the sweater's knit rings) are scaled by the torso's
  // fx/fy/fz factors so a narrow cat's sweater is narrow too, not a barrel with
  // a kitten inside it. The cape hangs behind the rump and the hood sits on the
  // head, so neither is resized.
  if (accessories.body === 'hoodie') {
    const shell = ball(0.33, HOODIE_COLOR, 0.88 * fx, 0.78 * fy, 1.32 * fz, 10, 8);
    shell.position.set(0, 0.35, 0.02);
    g.add(shell);
    // hood-up/hood-down rule: a hat needs the head clear, so the hood only
    // goes up when no head item is equipped — otherwise it bunches at the neck.
    if (!accessories.head) {
      const hood = ball(0.17, HOODIE_COLOR, 1, 1, 0.9, 8, 6);
      hood.position.set(0, 0.64, -0.28);
      g.add(hood);
    } else {
      const bunch = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 10), mat(HOODIE_COLOR));
      bunch.rotation.x = Math.PI / 2 + 0.3;
      bunch.position.set(0, 0.5, -0.36);
      g.add(bunch);
    }
  } else if (accessories.body === 'cape') {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.04), mat(CAPE_COLOR));
    cape.position.set(0, 0.28, 0.45);
    cape.rotation.x = -0.15;
    g.add(cape);
    const clasp = ball(0.032, CAPE_ACCENT, 1, 1, 1, 6, 5);
    clasp.position.set(0, 0.48, 0.28);
    g.add(clasp);
  } else if (accessories.body === 'confetticape') {
    // a purple cape (not the hero's red) flecked with confetti dots on its outer face
    const capeGroup = new THREE.Group();
    capeGroup.position.set(0, 0.28, 0.45);
    capeGroup.rotation.x = -0.15;
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.04), mat(PRIZE_CAPE));
    capeGroup.add(cape);
    const dots = [[-0.09, 0.14], [0.06, 0.15], [0.11, 0.04], [-0.04, 0.05], [-0.11, -0.05], [0.03, -0.06], [0.1, -0.14], [-0.05, -0.15]];
    dots.forEach(([dx, dy], i) => {
      const dot = ball(0.022, PRIZE_CONFETTI[i % PRIZE_CONFETTI.length], 1, 1, 0.4, 5, 4);
      dot.position.set(dx, dy, 0.022);
      capeGroup.add(dot);
    });
    g.add(capeGroup);
    const clasp = ball(0.032, PRIZE_GOLD, 1, 1, 1, 6, 5);
    clasp.position.set(0, 0.48, 0.28);
    g.add(clasp);
  } else if (accessories.body === 'raincoat') {
    const shell = ball(0.33, RAINCOAT_COLOR, 0.88 * fx, 0.78 * fy, 1.32 * fz, 10, 8);
    shell.position.set(0, 0.35, 0.02);
    g.add(shell);
    // same hood-up/hood-down rule as the hoodie: hats need the head clear
    if (!accessories.head) {
      const hood = ball(0.17, RAINCOAT_COLOR, 1, 1, 0.9, 8, 6);
      hood.position.set(0, 0.64, -0.28);
      g.add(hood);
    } else {
      const bunch = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 6, 10), mat(RAINCOAT_COLOR));
      bunch.rotation.x = Math.PI / 2 + 0.3;
      bunch.position.set(0, 0.5, -0.36);
      g.add(bunch);
    }
    for (let i = 0; i < 2; i++) { // toggle buttons down the chest (front is -z)
      const button = ball(0.02, 0x8a6a20, 1, 1, 0.6, 6, 5);
      button.position.set(0, 0.42 - i * 0.09, -0.36 - i * 0.03);
      g.add(button);
    }
  } else if (accessories.body === 'sweater') {
    const shell = ball(0.33, SWEATER_BASE, 0.88 * fx, 0.78 * fy, 1.32 * fz, 10, 8);
    shell.position.set(0, 0.35, 0.02);
    g.add(shell);
    for (let i = 0; i < 3; i++) { // knit stripes ring the torso
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.038, 6, 14), mat(SWEATER_STRIPE));
      stripe.scale.set(fx, 0.88 * fy, 1);
      stripe.position.set(0, 0.35, -0.14 + i * 0.18);
      g.add(stripe);
    }
  }

  // back: behind the shoulders. On a narrower, shallower torso these ride the
  // spine down by BACK_DROP and pull in (or slim) by fx, so a pack 18cm across
  // does not overhang a kitten's back and the wings stay at the shoulders.
  if (accessories.back === 'backpack') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.18 * fx, 0.13, 0.1), mat(0x3a6ea5));
    pack.position.set(0, 0.56 - BACK_DROP, 0.12);
    g.add(pack);
  } else if (accessories.back === 'wings') {
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.02), mat(WING_COLORS[side === -1 ? 0 : 1]));
      wing.position.set(side * 0.22 * fx, 0.44 - BACK_DROP, 0.3);
      wing.rotation.z = side * 0.5;
      wing.rotation.y = side * 0.3;
      g.add(wing);
    }
  } else if (accessories.back === 'jetpack') {
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), mat(JETPACK_SILVER));
      tank.position.set(side * 0.07 * fx, 0.52 - BACK_DROP, 0.16);
      tank.rotation.x = 0.15;
      g.add(tank);
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 8), mat(JETPACK_FLAME));
      nozzle.rotation.x = Math.PI;
      nozzle.position.set(side * 0.07 * fx, 0.4 - BACK_DROP, 0.185);
      g.add(nozzle);
    }
  } else if (accessories.back === 'balloonbunch') {
    // three balloons on three strings tied at one point over the tail; kept
    // under ~y 1.05 so the whole-cat shop thumbnail still frames them
    const tie = new THREE.Vector3(0.05, 0.58, 0.2);
    const tops = [[-0.07, 0.79, 0.19], [0.1, 0.86, 0.22], [0.03, 0.74, 0.14]];
    tops.forEach(([bx, by, bz], i) => {
      const len = Math.hypot(bx - tie.x, by - tie.y, bz - tie.z);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 4), mat(0xf5f5f5));
      string.position.set((bx + tie.x) / 2, (by + tie.y) / 2, (bz + tie.z) / 2);
      string.rotation.z = -Math.atan2(bx - tie.x, by - tie.y);
      string.rotation.x = Math.atan2(bz - tie.z, by - tie.y);
      g.add(string);
      const balloon = ball(0.075, PRIZE_BALLOONS[i], 1, 1.15, 1, 10, 8);
      balloon.position.set(bx, by + 0.09, bz);
      g.add(balloon);
    });
  } else if (accessories.back === 'balloon') {
    // hovers just over the tail — low enough to stay inside the shop
    // thumbnail's whole-cat framing (~y 1.1 at this plane)
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 4), mat(0xf5f5f5));
    string.position.set(0.06, 0.75, 0.2);
    g.add(string);
    const knot = ball(0.014, BALLOON_COLOR, 1, 1, 1, 5, 4);
    knot.position.set(0.06, 0.92, 0.2);
    g.add(knot);
    const balloon = ball(0.09, BALLOON_COLOR, 1, 1.15, 1, 10, 8);
    balloon.position.set(0.06, 1.0, 0.2);
    g.add(balloon);
  }

  // feet: small shells on the paw positions
  if (accessories.feet === 'booties') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(0xf2c14e);
      leg.userData.paw.scale.multiplyScalar(1.15);
    }
  } else if (accessories.feet === 'goldbooties') {
    // shiny gold paws with a darker gold cuff at the ankle
    for (const leg of legs) {
      leg.userData.paw.material = mat(PRIZE_GOLD);
      leg.userData.paw.scale.multiplyScalar(1.18);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 8), mat(0xd9a000));
      cuff.position.set(0, -0.22, 0);
      leg.add(cuff);
    }
  } else if (accessories.feet === 'sneakers') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(SNEAKER_WHITE);
      leg.userData.paw.scale.set(1.2, 0.95, 1.25);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.09), mat(SNEAKER_ACCENT));
      stripe.position.set(0, -0.27, 0);
      leg.add(stripe);
    }
  } else if (accessories.feet === 'rainboots') {
    for (const leg of legs) {
      leg.userData.paw.material = mat(RAINBOOT_COLOR);
      leg.userData.paw.scale.set(1.15, 1.4, 1.15);
    }
  } else if (accessories.feet === 'socks') {
    legs.forEach((leg, i) => {
      leg.userData.paw.material = mat(SOCK_COLORS[i % SOCK_COLORS.length]);
      leg.userData.paw.scale.set(1.1, 1.3, 1.1);
    });
  }

  // -------------------------------------------------------------------------
  // LEG LENGTH. Done last, once every part and accessory is in place, so one
  // pass can lift the whole cat. Δ is the extra limb length: each hip pivot
  // rises by Δ and its limb is rebuilt Δ longer, hanging from the pivot as
  // before; the paw (and any feet accessory hung on the leg) drops back by Δ,
  // so it lands where it always did and the cat still stands at y = 0. Every
  // other direct child of g — body, belly, head, ruff, tail, body- and
  // back-slot accessories — rises by Δ with the hips.
  //
  // The animator writes body and head positions from userData.base every
  // frame, so base carries the lift too; it never writes a leg position, so
  // the raised pivots survive every pose.
  //
  // Standing is not the only pose, though. The animator folds legs by scaling
  // them about the hip and swings them by rotating about it, and both of those
  // move a longer leg's paw further than a standard one's — a long-legged cat
  // would hover when it sat or crouched. So base also carries `legLift` (Δ)
  // and `legReach` (a standard leg's hip-to-sole drop), and every lifted child
  // remembers its lifted height in userData.liftY: animator.js's fitLongLegs
  // uses them to bring the cat down by Δ in a crouch and re-fit each posed
  // leg so its sole lands where a standard cat's would.
  const LEG_LEN = s.legLen ?? 1;
  let bodyY = 0.34;
  let headPos = [0, 0.56, -0.44];
  let legLift = 0;
  if (LEG_LEN !== 1) {
    const dy = 0.26 * (LEG_LEN - 1);
    legLift = dy;
    for (const child of g.children) {
      child.position.y += dy;
      child.userData.liftY = child.position.y;
      if (!legs.includes(child)) continue;
      const [limb, ...hung] = child.children;
      limb.geometry.dispose();
      limb.geometry = new THREE.CylinderGeometry(0.046, 0.058, 0.26 * LEG_LEN, 12);
      limb.position.y = -0.13 * LEG_LEN;
      for (const part of hung) part.position.y -= dy; // the paw, a sneaker stripe
    }
    bodyY += dy;
    headPos = [0, 0.56 + dy, -0.44];
  }

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
    body, head, tail, tailPivots, legs,
    earL: head.userData.earL, earR: head.userData.earR, whiskers,
  };
  g.userData.base = { bodyY, bodyScale: [...BODY_SCALE], headPos, tailRotX: -0.6 };
  // The sole of a standard paw: hip 0.3, paw centre 0.2585 below it, and the
  // flattened paw's half-height (0.062 * 0.62) below that.
  if (legLift) Object.assign(g.userData.base, { legLift, legReach: 0.2585 + 0.062 * 0.62 });
  return g;
}
