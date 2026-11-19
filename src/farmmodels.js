// =============================================================================
// What Appletree Farm's animals look like (src/farmsim.js is how they behave,
// src/farmlife.js how they breathe, blink and step, and src/farmanimals.js
// puts the three together).
//
// BUILT TO BE CHEAP. Older iPads are draw-call bound, and a cat costs about 31
// shadow draws. Each animal here is one mesh per part that MOVES, every part
// one merged geometry coloured per corner, all of them on ONE shared material:
//
//             meshes  shadow casters
//   cow         15         2   (barrel, neck)
//   goat        10         1
//   sheepdog    11         1
//   hen          5         0   (her open wings are hidden while they are folded)
//   chick        1         0   (one geometry shared by them all)
//   duckling     1         0   (likewise)
//
// The small ones cast nothing: a contact decal (render/contactshadows.js)
// sits under each instead. Parts that must not cast carry userData.noCast,
// which walk.js's caster sweep (render/rig.js) honours.
//
// SHAPED LIKE ANIMALS. Bodies, necks, heads, legs, horns and tails are skins
// over rows of cross-sections (src/farmshapes.js), with the bones that show on
// the living animal put where they show: a cow's hip bones and pin bones, her
// shoulder blades and brisket, knees and hocks that bend; a goat's wedge of a
// body and barred eyes; a collie's ruff, britches and low plume of a tail.
//
// WHAT MOVES is a part of its own (farmanimals.js turns them): a jaw to chew
// with, ears, eyelids, a lower leg below the knee and the hock, a tail. Lids
// are one mesh for both eyes, squashed up under the brow while the eye is
// open; a cow's or a goat's ears are one mesh, turned about the point between
// them.
//
// Every model stands with its feet at y 0 and its nose at +z. `parts` names
// what src/farmanimals.js moves.
// =============================================================================
import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { loft, at, ball, solid, put, pair, merged, mix, smooth, coatTexture, coatUV, rewrap, WHITE_UV } from './farmshapes.js';

const DARK = 0x2a2624;
const HOOF = 0x3a322c;
const PINK = 0xe6a9a0;
const HORN = 0xe8dfc8;
const EYE = 0x16120f;
const GLINT = 0xffffff;
const COW_COAT = 0xf3efe6;

// The one material every farm animal wears: the colours are in the geometry,
// and the one picture it carries is the black-and-white cow's patches
// (farmshapes.js: white, so nothing, everywhere else).
export function farmAnimalMaterial() {
  return litMaterial(0xffffff, { vertexColors: true, map: coatTexture(COW_COAT, DARK) });
}

function mesh(geo, material, { cast = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (!cast) m.userData.noCast = true;
  return m;
}

// A fixed frame inside a moving one: a head built nose-forward, hung nose-down.
function frame(parent, { at: to = [0, 0, 0], rot = 0, scale = 1 } = {}) {
  const g = new THREE.Group();
  g.position.set(...to);
  g.rotation.x = rot;
  if (Array.isArray(scale)) g.scale.set(...scale); else g.scale.setScalar(scale);
  parent.add(g);
  return g;
}

// An eye: a dark bead with a glint in it, on the animal's right; `pair` gives the other.
function eye(r, x, y, z, { around = 8, rings = 3, color = EYE, glint = 0.3 } = {}) {
  return [
    ...pair(put(ball(r, { around, rings, color }), { at: [x, y, z] })),
    ...pair(put(ball(r * glint, { around: 4, rings: 1, color: GLINT }), { at: [x + r * 0.62, y + r * 0.42, z + r * 0.5] })),
  ];
}

// Both eyelids, one mesh: each a cap a little bigger than its eye, hung from
// the eye's top. Squashed (scale.y LID_OPEN) it is the lid's edge under the
// brow; at 1 the eye is shut.
export const LID_OPEN = 0.16;
function lids(material, r, x, y, z, color) {
  const m = mesh(merged(pair(put(ball(r, { around: 7, rings: 2, color }), { at: [x, -r, z] }))), material);
  m.position.y = y + r;
  m.scale.y = LID_OPEN;
  return m;
}

// A leaf of an ear, its root at the origin, out along +x on the animal's
// right, its hollow (pink) to the front.
function earLeaf(len, wide, color, inner, { droop = 0.12, back = 0.25 } = {}) {
  return put(loft([
    { y: 0, z: 0, w: wide * 0.5, up: wide * 0.42, down: wide * 0.42 },
    { y: len * 0.32, z: 0, w: wide, up: wide * 0.36, down: wide * 0.3 },
    { y: len * 0.7, z: 0, w: wide * 0.92, up: wide * 0.26, down: wide * 0.22 },
    { y: len, z: 0, w: wide * 0.4, up: wide * 0.14, down: wide * 0.12 },
  ], {
    around: 6, along: 4, tipEnd: len * 0.1,
    color: (x, y, z) => (z > wide * 0.12 && Math.abs(x) < wide * 0.62 && y > len * 0.12 && y < len * 0.92 ? inner : color),
  }), { rot: [0, back, -(Math.PI / 2 + droop)] });
}

// ---- the cow ------------------------------------------------------------------------------
export const COW_LOOKS = Object.freeze({
  // a Holstein: black patches on a cream coat, a white blaze, a pink muzzle
  patches: { coat: COW_COAT, patch: DARK, face: DARK, blaze: COW_COAT, leg: COW_COAT, lower: COW_COAT, ear: DARK, tuft: DARK, muzzle: PINK, nostril: 0x7a4a48, lid: 0x1c1a19, horns: true },
  // a Jersey: fawn, smoky on her face, neck, hips and shins, a pale ring round a dark muzzle, pale underneath
  brown: { coat: 0xb47c4a, belly: 0xe6cfa6, shade: 0x6e4526, face: 0x966238, leg: 0xa46c3e, lower: 0x5e3d26, ear: 0x7a4e2c, tuft: 0x3a2618, muzzle: 0x3d3330, nostril: 0x1a1614, ring: 0xf0e2c8, lid: 0x966238, horns: true },
  // the calf: pale fawn, no horns yet
  calf: { coat: 0xc9a070, belly: 0xeedfc2, shade: 0xa57c50, face: 0xc49a68, leg: 0xc9a070, lower: 0xb08658, ear: 0xb88a5a, tuft: 0x8a6a48, muzzle: 0x6a5048, nostril: 0x2a2220, ring: 0xf6ecd8, lid: 0xc49a68, horns: false },
});
// The top of her back, in the model's own metres: COW.SIZE times this is
// COW.BACK_Y, the perch a cat sits on (test/farmanimals.test.js holds it there).
export const COW_BACK = 1.364;
// Where her joints are, for farmanimals.js: the length of a leg above and
// below the knee or hock, and how her head hangs at rest.
export const COW_RIG = Object.freeze({ HIP_Y: 0.74, UPPER: 0.36, HEAD_REST: 0.92 });

// buildCow(look, material) → { group, parts }
//   parts: body, torso, head (her neck, hinged at the shoulder), skull (hinged
//   at the poll), jaw, ears, lids, legs[4] (hinged at shoulder and hip),
//   shins[4] (below the knee and the hock), tail
// Modelled 1.36 m to the top of her back and drawn COW.SIZE times that
// (farmanimals.js), which puts her back at COW.BACK_Y, the perch a cat sits
// on: level from her hip bones to her withers, and nothing of her body above
// it. Her belly clears 0.5 m, so a cat walks under her.
export function buildCow(lookName, material) {
  const look = COW_LOOKS[lookName] ?? COW_LOOKS.patches;
  const patched = lookName === 'patches';
  const calf = lookName === 'calf';
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // A calf is all legs: a shorter, slimmer barrel, tucked up higher.
  const slim = calf ? 0.84 : 1;
  const tuck = calf ? 0.1 : 0;
  const short = calf ? 0.86 : 1;
  const B = COW_BACK;
  // Her coat without the picture: paler underneath, smoky toward her neck and
  // over her hips. The edges run along the skin's own lines (v, the way round).
  const coat = (z, v) => {
    let c = look.coat;
    const side = Math.abs(v - 0.5);
    if (look.shade) c = mix(c, look.shade, 0.5 * Math.max(smooth(0.3, 0.85, z), 0.6 * smooth(-0.55, -0.9, z)) * smooth(0.4, 0.2, side));
    if (look.belly) c = mix(c, look.belly, smooth(0.28, 0.4, side));
    return c;
  };
  // where a point beside her barrel is on the picture (a leg lying against her)
  const wrapUV = (x, y, z) => coatUV(z, 0.5 + Math.atan2(x, y - 0.95) / (Math.PI * 2));
  // Her chest and her neck read the picture the same way where they meet: by
  // the angle round a line that runs along her barrel and then rises up her
  // neck. So the black of her neck and the white of her throat and brisket
  // run across from one to the other, with no line where her neck goes in
  // (that line, black on white, was a scarf). `vl` is the skin's own way round,
  // to keep the seam under her where it is.
  const axisY = (z) => 0.95 + 0.11 * smooth(0.5, 0.72, z / short) + 0.2 * Math.max(0, z / short - 0.72);
  const coatV = (x, y, z, vl) => {
    let v = 0.5 + Math.atan2(x, y - axisY(z)) / (Math.PI * 2);
    if (v - vl > 0.5) v -= 1; else if (vl - v > 0.5) v += 1;
    return v;
  };
  const chestUV = (x, y, z, u, v) => coatUV(z, v + (coatV(x, y, z, v) - v) * smooth(0.45 * short, 0.65 * short, z));
  // The bones that show under her hide, pushed out of (or, the hollow in
  // front of her hips, into) the one skin: [x, y, z, reach x, y, z, metres],
  // the same both sides. Nothing rises above her back where the cat sits.
  const bones = [
    [0.31, B - 0.06, -0.6, 0.075, 0.06, 0.1, 0.06],   // her hip bones (hooks), square at the corners of her rump
    [0.14, B - 0.1, -0.93, 0.05, 0.05, 0.06, 0.035],     // her pin bones, either side of the tail head
    [0.0, B - 0.045, -0.9, 0.05, 0.04, 0.07, 0.018],    // the tail head
    [0.37, 1.02, -0.78, 0.07, 0.07, 0.07, 0.022],       // the thurl, her hip joint
    [0.43, 1.13, -0.36, 0.06, 0.12, 0.12, -0.035],      // the hollow in front of her hips
    [0.3, 1.13, 0.5, 0.06, 0.17, 0.09, 0.026],          // her shoulder blades, sloping down from the withers
    [0.23, 0.9, 0.77, 0.06, 0.07, 0.06, 0.032],         // the points of her shoulders
    [0.44, 0.88, 0.1, 0.05, 0.16, 0.26, 0.012],         // a hint of ribs, sprung
  ].map(([bx, by, bz, rx, ry, rz, d]) => [bx * slim, by + (by < 1 ? tuck / 2 : 0), bz * short, rx, ry, rz * short, d]);
  const bulge = (x, y, z) => {
    let d = 0;
    for (const [bx, by, bz, rx, ry, rz, h] of bones) {
      const q = ((Math.abs(x) - bx) / rx) ** 2 + ((y - by) / ry) ** 2 + ((z - bz) / rz) ** 2;
      if (q < 6) d += h * Math.exp(-q);
    }
    return d;
  };
  const torsoParts = [
    loft([
      at(-0.97 * short, B - 0.17, 0.95, 0.1 * slim),
      at(-0.93 * short, B - 0.06, 0.82 + tuck / 2, 0.24 * slim, { nt: 2.8 }),
      at(-0.8 * short, B - 0.014, 0.7 + tuck, 0.36 * slim, { mid: 1.05, nt: 3.0, pinch: -0.04 }),
      at(-0.58 * short, B - 0.004, 0.6 + tuck, 0.4 * slim, { mid: 1.03, nt: 3.3, pinch: -0.06 }),  // square across her hip bones
      at(-0.4 * short, B - 0.006, 0.555 + tuck, 0.425 * slim, { mid: 0.95, nt: 2.2, pinch: 0.24 }),
      at(-0.14 * short, B, 0.5 + tuck, 0.465 * slim, { mid: 0.9, nt: 2.2, pinch: 0.24 }),    // deepest behind her ribs
      at(0.14 * short, B, 0.515 + tuck, 0.445 * slim, { mid: 0.92, nt: 2.3, pinch: 0.2 }),
      at(0.4 * short, B, 0.565 + tuck, 0.39 * slim, { mid: 0.97, nt: 2.4, pinch: 0.12 }),    // narrower at the heart
      at(0.6 * short, B - 0.004, 0.6 + tuck, 0.33 * slim, { mid: 1.0, nt: 2.4 }),
      at(0.76 * short, B - 0.06, 0.6 + tuck, 0.25 * slim, { mid: 0.96, nb: 1.7 }),
      at(0.88 * short, B - 0.24, 0.62 + tuck, 0.15 * slim, { mid: 0.86, nb: 1.5 }),          // her brisket, a keel between the forelegs
    ], {
      around: calf ? 16 : 20, along: calf ? 18 : 20, level: true, tipStart: 0.03, tipEnd: 0.05, bulge,
      color: patched ? look.coat : (x, y, z, u, v) => coat(z, v),
      uv: patched ? chestUV : null,
    }),
  ];
  if (!calf) {
    // the udder, pink, with four teats
    torsoParts.push(put(ball(0.155, { around: 7, rings: 4, color: (x, y) => mix(PINK, 0xf0c4ba, smooth(-0.05, 0.1, y)) }), { scale: [1, 0.8, 1.22], at: [0, 0.585, -0.43] }));
    for (const [tx, tz] of [[0.062, -0.37], [-0.062, -0.37], [0.062, -0.5], [-0.062, -0.5]]) {
      torsoParts.push(put(ball(0.022, { around: 4, rings: 1, color: 0xd9938c }), { scale: [1, 2.1, 1], at: [tx, 0.45, tz] }));
    }
  }
  const torso = mesh(merged(torsoParts), material, { cast: true });
  body.add(torso);

  // Her neck hangs from her withers, hinged at the shoulder: deep, thin from
  // side to side, a dewlap along under it down to the brisket. Its root is a
  // ball about the hinge, inside her chest, so no gap opens as it turns.
  const head = new THREE.Group();
  head.rotation.order = 'YXZ'; // she turns her neck, then lowers it
  head.position.set(0, 1.08, 0.7 * short);
  const neck = mesh(loft([
    { y: -0.12, z: -0.2, w: 0.19 * slim, up: 0.22, down: 0.22 },
    { y: -0.02, z: 0, w: 0.25 * slim, up: 0.285, down: 0.36 - tuck, nb: 1.6 },
    { y: 0.03, z: 0.2, w: 0.19 * slim, up: 0.225, down: 0.34 - tuck, nb: 1.3 },
    { y: 0.07, z: 0.4, w: 0.14, up: 0.175, down: 0.25 - tuck / 2, nb: 1.3 },
    { y: 0.105, z: 0.55, w: 0.125, up: 0.145, down: 0.165, nb: 1.6 },
    { y: 0.12, z: 0.66, w: 0.115, up: 0.125, down: 0.125 },
  ], {
    around: 12, along: 8,
    color: patched ? look.coat : (x, y, z, u, v) => coat(0.6 + u, v),
    uv: patched ? (x, y, z, u, v) => coatUV(z + 0.7 * short, coatV(x, y + 1.08, z + 0.7 * short, v)) : null,
  }), material, { cast: true });
  head.add(neck);
  body.add(head);

  // Her skull, hinged at the poll and built nose-forward: a broad flat
  // forehead, eyes out on its corners, a long face narrowing below them and
  // widening again into a broad soft muzzle. The calf's is shorter, with
  // bigger eyes and ears.
  const skull = new THREE.Group();
  skull.rotation.order = 'YXZ';
  skull.position.set(0, 0.13, 0.63);
  head.add(skull);
  const hs = calf ? 1.22 : 1.15;
  const inner = frame(skull, { rot: COW_RIG.HEAD_REST, scale: calf ? [hs, hs, hs * 0.84] : hs });
  const face = (x, y, z, u, v) => {
    let c = look.face;
    if (look.blaze) {
      const top = Math.abs(v - 0.5) < 0.25 ? 1 : 0;
      c = mix(c, look.blaze, top * smooth(0.02, -0.02, Math.abs(x) - (0.03 + 0.26 * Math.max(0, z - 0.1))) * smooth(-0.03, 0.03, z));
    }
    if (look.shade) c = mix(c, look.shade, 0.6 * smooth(0.08, 0.3, z));
    if (look.ring) c = mix(c, look.ring, smooth(0.3, 0.35, z));
    return mix(c, look.muzzle, smooth(0.385, 0.415, z));
  };
  const ex = 0.152, ey = 0.035, ez = 0.09;
  const er = calf ? 0.042 : 0.036;
  // the bony rims round her eyes, a ridge over each, and the poll between her horns
  const ridges = [
    [ex - 0.005, ey + 0.035, ez - 0.005, 0.045, 0.025, 0.055, 0.016],
    [ex - 0.01, ey - 0.03, ez + 0.01, 0.04, 0.025, 0.05, 0.01],
    [0.0, 0.118, -0.02, 0.09, 0.03, 0.05, 0.012],
    [0.07, -0.08, 0.06, 0.03, 0.05, 0.1, -0.012],   // a little hollow below each eye
  ];
  const skullBulge = (x, y, z) => {
    let d = 0;
    for (const [bx, by, bz, rx, ry, rz, h] of ridges) {
      const q = ((Math.abs(x) - bx) / rx) ** 2 + ((y - by) / ry) ** 2 + ((z - bz) / rz) ** 2;
      if (q < 6) d += h * Math.exp(-q);
    }
    return d;
  };
  const skullParts = [
    loft([
      at(-0.07, 0.06, -0.075, 0.095),
      at(-0.015, 0.115, -0.115, 0.15, { nt: 2.6 }),   // the poll, broad
      at(0.07, 0.11, -0.12, 0.158, { nt: 2.8 }),      // her eyes sit on the corners here
      at(0.16, 0.088, -0.085, 0.128, { nt: 2.6 }),
      at(0.26, 0.066, -0.062, 0.1, { nt: 2.5 }),      // the long bridge of her nose
      at(0.36, 0.054, -0.052, 0.097, { nt: 2.6 }),
      at(0.43, 0.046, -0.05, 0.114, { nt: 2.9, nb: 2.6 }), // a broad muzzle: her upper lip
      at(0.47, 0.022, -0.046, 0.1, { nt: 2.6, nb: 2.6 }),
    ], { around: calf ? 10 : 12, along: 11, level: true, color: face, tipStart: 0.025, tipEnd: 0.016, bulge: skullBulge }),
    ...eye(er, ex, ey, ez, { color: 0x1a120c }),
    // her nostrils: wide, on the corners of her muzzle
    ...pair(put(ball(0.024, { around: 4, rings: 2, color: look.nostril }), { scale: [1.15, 0.8, 0.5], rot: [0, 0.5, 0.5], at: [0.058, -0.008, 0.47] })),
  ];
  if (look.horns) {
    skullParts.push(...pair(put(loft([
      { y: 0, z: 0, r: 0.034 }, { y: 0.07, z: 0.008, r: 0.028 }, { y: 0.125, z: 0.035, r: 0.019 }, { y: 0.155, z: 0.075, r: 0.008 },
    ], { around: 5, color: (x, y, z, u) => mix(HORN, 0x8a7f6a, smooth(0.6, 1, u)), tipEnd: 0.014 }), { rot: [0, 0, -1.05], at: [0.1, 0.095, -0.015] })));
  }
  if (patched) skullParts.push(put(ball(0.07, { around: 6, rings: 3, color: look.tuft }), { scale: [1.3, 0.42, 0.9], at: [0, 0.112, -0.01] })); // her forelock
  inner.add(mesh(merged(skullParts), material));
  // Her lower jaw, hinged below and behind her eye. Closed, its lip meets her
  // upper lip and the rest of it lies up inside her head: she chews with it a
  // little round and round, and drops it to moo.
  const jaw = mesh(merged([
    loft([
      // widest where her skull's underside lies inside it, so her cheek runs
      // on down into her jaw and only her lips show a line
      at(-0.03, 0.035, -0.1, 0.1, { mid: -0.03 }),
      at(0.07, 0.03, -0.128, 0.13, { mid: -0.045 }),   // the deep flat cheek
      at(0.18, 0.025, -0.085, 0.104, { mid: -0.015 }),
      at(0.3, 0.025, -0.055, 0.094, { mid: 0.005 }),
      at(0.39, 0.02, -0.046, 0.1, { mid: 0.012, nb: 2.5 }), // her lower lip, tucked up under the upper one
    ], { around: 8, along: 6, level: true, color: (x, y, z, u, v) => face(x, y - 0.06, z + 0.03, u, 0), tipStart: 0.02, tipEnd: 0.025 }),
    put(ball(0.045, { around: 5, rings: 2, color: 0xd9848a }), { scale: [1, 0.3, 2.5], at: [0, -0.006, 0.24] }), // her tongue
  ]), material);
  jaw.position.set(0, -0.06, 0.03);
  inner.add(jaw);
  // her ears: out sideways below the horns, their hollows forward
  const earSize = calf ? 1.25 : 1;
  const ears = mesh(merged(pair(put(earLeaf(0.2 * earSize, 0.06 * earSize, look.ear, mix(look.ear, PINK, 0.7)), { at: [0.135, 0, 0] }))), material);
  ears.position.set(0, 0.045, -0.03);
  inner.add(ears);
  const lid = lids(material, er * 1.17, ex - 0.004, ey, ez, look.lid);
  inner.add(lid);

  // Four legs in two pieces each. In front: forearm to the knee, then cannon
  // bone, fetlock, pastern and a cloven hoof, with dewclaws behind. Behind:
  // thigh and gaskin down to the hock, which points back, and the same below.
  const thin = calf ? 1 : 1.12;
  const knob = calf ? 1.18 : 1;
  const shinCoat = (x, y) => mix(look.leg, look.lower, smooth(0.0, -0.14, y));
  const hoof = (y0, z0) => pair(put(loft([
    { y: y0 + 0.085, z: z0 - 0.004, w: 0.028, up: 0.05, down: 0.04 },
    { y: y0, z: z0 + 0.012, w: 0.035, up: 0.09, down: 0.05 },
  ], { around: 4, color: HOOF }), { at: [0.03, 0, 0] }));
  const upperFore = () => put(loft([
    { y: 0.24, z: 0, w: 0.06, up: 0.1, down: 0.1 },
    { y: 0.1, z: 0, w: 0.115, up: 0.17, down: 0.16 },       // shoulder and elbow
    { y: -0.08, z: 0.01, w: 0.1, up: 0.125, down: 0.12 },
    { y: -0.24, z: 0.015, w: 0.07, up: 0.08, down: 0.078 },
    { y: -0.335, z: 0.024, w: 0.07 * knob, up: 0.08 * knob, down: 0.064 }, // the knee
    { y: -0.385, z: 0.022, w: 0.058, up: 0.06, down: 0.054 },
  ], { around: 6, along: 7, color: look.leg, tipEnd: 0.02 }), { scale: [thin, 1, thin] });
  const lowerFore = put(merged([
    loft([
      { y: 0.03, z: 0, w: 0.064 * knob, up: 0.07 * knob, down: 0.058 },
      { y: -0.05, z: -0.008, w: 0.05, up: 0.052, down: 0.05 },
      { y: -0.2, z: -0.012, w: 0.045, up: 0.047, down: 0.05 },   // the cannon bone
      { y: -0.265, z: -0.01, w: 0.056, up: 0.056, down: 0.068 }, // the fetlock
      { y: -0.31, z: -0.002, w: 0.05, up: 0.056, down: 0.048 },
    ], { around: 5, along: 5, color: shinCoat, tipStart: 0.02 }),
    ...hoof(-0.38, -0.004),
    put(ball(0.02, { around: 4, rings: 1, color: HOOF }), { scale: [2.2, 1, 1], at: [0, -0.275, -0.07] }), // dewclaws
  ]), { scale: [thin, 1, thin] });
  const upperHind = () => put(loft([
    { y: 0.26, z: 0.02, w: 0.06, up: 0.12, down: 0.1 },
    { y: 0.1, z: 0.03, w: 0.125, up: 0.21, down: 0.17 },        // the thigh
    { y: -0.08, z: 0.04, w: 0.108, up: 0.15, down: 0.13 },
    { y: -0.22, z: 0.0, w: 0.072, up: 0.082, down: 0.085 },
    { y: -0.31, z: -0.042, w: 0.06, up: 0.058, down: 0.08 },    // the hock, its point behind
    { y: -0.36, z: -0.05, w: 0.052, up: 0.054, down: 0.06 },
  ], { around: 6, along: 7, color: look.leg, tipEnd: 0.02 }), { scale: [thin, 1, thin] });
  const lowerHind = put(merged([
    loft([
      { y: 0.03, z: -0.004, w: 0.056, up: 0.056, down: 0.072 },
      { y: -0.06, z: 0.006, w: 0.048, up: 0.05, down: 0.052 },
      { y: -0.22, z: 0.022, w: 0.046, up: 0.048, down: 0.05 },
      { y: -0.295, z: 0.03, w: 0.057, up: 0.058, down: 0.068 },
      { y: -0.34, z: 0.04, w: 0.05, up: 0.056, down: 0.048 },
    ], { around: 5, along: 5, color: shinCoat, tipStart: 0.02 }),
    ...hoof(-0.41, 0.04),
    put(ball(0.02, { around: 4, rings: 1, color: HOOF }), { scale: [2.2, 1, 1], at: [0, -0.305, -0.04] }),
  ]), { scale: [thin, 1, thin] });
  const legs = [];
  const shins = [];
  for (const [lx, lz, fore] of [[-0.23, 0.5, true], [0.23, 0.5, true], [-0.23, -0.54, false], [0.23, -0.54, false]]) {
    const px = lx * slim, pz = lz * short;
    const upper = fore ? upperFore() : upperHind();
    // the patches run on down her shoulder and thigh, where the leg lies against her
    if (patched) rewrap(upper, (x, y, z) => wrapUV(x + px * 1.25, y + COW_RIG.HIP_Y, z + pz));
    const leg = mesh(upper, material);
    leg.position.set(px, COW_RIG.HIP_Y, pz);
    const shin = mesh(fore ? lowerFore : lowerHind, material);
    shin.position.set(0, fore ? -0.36 : -0.33, (fore ? 0.022 : -0.05) * thin);
    leg.add(shin);
    body.add(leg);
    legs.push(leg);
    shins.push(shin);
  }

  // Her tail, from the tail head between her pin bones down past her hocks to a switch.
  const tailCoat = patched ? look.patch : look.leg;
  const tail = mesh(merged([
    loft([
      { y: 0.035, z: 0.05, r: 0.05 }, { y: -0.04, z: -0.025, r: 0.04 }, { y: -0.24, z: -0.045, r: 0.027 },
      { y: -0.5, z: -0.04, r: 0.02 }, { y: -0.72, z: -0.035, r: 0.018 },
    ], { around: 4, along: 6, color: (x, y) => mix(tailCoat, patched ? look.coat : look.lower, smooth(-0.12, -0.3, y)) }),
    loft([
      { y: -0.7, z: -0.035, r: 0.024 }, { y: -0.82, z: -0.035, w: 0.05, up: 0.055, down: 0.055 },
      { y: -0.95, z: -0.03, w: 0.042, up: 0.048, down: 0.048 }, { y: -1.02, z: -0.03, r: 0.012 },
    ], { around: 5, color: look.tuft, tipEnd: 0.03 }),
  ]), material);
  tail.position.set(0, B - 0.07, -0.95 * short);
  body.add(tail);

  return { group, parts: { body, torso, head, skull, jaw, ears, lids: lid, legs, shins, tail } };
}

// ---- the goat ------------------------------------------------------------------------------
export const GOAT_LOOKS = Object.freeze({
  // a white dairy goat (a Saanen): cream, pink where the skin shows, an udder
  white: { coat: 0xf1ece2, back: 0xe6dfd0, under: 0xf6f2ea, leg: 0xe2dbcc, knee: 0xcfc6b4, face: 0xf1ece2, mark: 0xf1ece2, ear: 0xe0d6c6, beard: 0xdcd5c6, muzzle: 0xe3b9ae, iris: 0xb08a3a, lid: 0xd9cfc0, udder: true },
  // a tan one with a black stripe down the spine, black shins, belly and face stripes (a chamoisee Alpine)
  tan: { coat: 0xc69a6a, back: 0x3a2c22, under: 0x4a372a, leg: 0x8a6444, knee: 0x3a2c22, face: 0xd2ac7c, mark: 0x3a2c22, ear: 0x5a4030, beard: 0x3a2c22, muzzle: 0x4a3a34, iris: 0xc0902e, lid: 0x7a5a40, udder: false },
});
const GOAT_HORN = 0x6a5e50;
// Where the face sits on the goat's neck (the head group's own frame).
const GOAT_FACE = Object.freeze({ at: [0, 0.275, 0.135], rot: 0.36, scale: 1.2 });
// Modelled 0.82 m to the top of its back and drawn SIZE.farmgoat times that
// (farmanimals.js): a little taller than the cat. A dairy goat: a wedge of a
// body, deepest at the back, hip bones standing out, a thin upright neck, a
// straight face and a short tail turned up.
// parts: body, head (neck and skull, hinged at the shoulder), jaw (its beard
// hangs from it), ears, lids, legs[4], tail, mouth
export function buildGoat(lookName, material) {
  const look = GOAT_LOOKS[lookName] ?? GOAT_LOOKS.white;
  const group = new THREE.Group();
  const body = new THREE.Group(); // lifted for a hop and for standing on the rock
  group.add(body);
  const coat = (x, y, z, u, v) => {
    const side = Math.abs(v - 0.5);
    return mix(mix(look.coat, look.back, smooth(0.075, 0.03, side)), look.under, smooth(0.34, 0.42, side));
  };
  const torsoParts = [
    loft([
      at(-0.44, 0.735, 0.62, 0.04),
      at(-0.4, 0.775, 0.52, 0.1, { nt: 2.4 }),                      // a rump that slopes
      at(-0.3, 0.815, 0.43, 0.165, { nt: 3.0, mid: 0.67 }),         // hip bones, square
      at(-0.15, 0.808, 0.37, 0.218, { nt: 2.1, pinch: 0.24, mid: 0.57 }), // a big round belly, deepest here
      at(0.04, 0.806, 0.385, 0.2, { pinch: 0.2, mid: 0.58 }),
      at(0.2, 0.814, 0.42, 0.158, { pinch: 0.1, mid: 0.62 }),
      at(0.3, 0.826, 0.455, 0.125, { nt: 1.7, mid: 0.66 }),         // sharp withers
      at(0.39, 0.78, 0.5, 0.09),
      at(0.44, 0.72, 0.56, 0.045),
    ], { around: 12, along: 12, level: true, color: coat, tipStart: 0.015, tipEnd: 0.02 }),
    ...pair(put(ball(0.04, { around: 5, rings: 2, color: look.coat }), { scale: [0.9, 0.7, 1.4], at: [0.135, 0.79, -0.3] })), // hip bones
  ];
  if (look.udder) {
    torsoParts.push(put(ball(0.075, { around: 6, rings: 3, color: 0xeec2b6 }), { scale: [1, 0.95, 1.1], at: [0, 0.4, -0.21] }));
    torsoParts.push(...pair(put(ball(0.016, { around: 4, rings: 1, color: 0xdfa398 }), { scale: [1, 2.2, 1], at: [0.035, 0.325, -0.2] })));
  }
  const torso = mesh(merged(torsoParts), material, { cast: true });
  body.add(torso);
  // a short tail, turned up: it flicks
  const tail = mesh(loft([
    { y: -0.03, z: 0.03, w: 0.04, up: 0.03, down: 0.03 }, { y: 0.05, z: -0.03, w: 0.042, up: 0.02, down: 0.028 },
    { y: 0.12, z: -0.048, w: 0.03, up: 0.014, down: 0.02 }, { y: 0.165, z: -0.05, w: 0.01, up: 0.008, down: 0.01 },
  ], { around: 6, along: 5, color: (x, y, z, u, v) => mix(look.coat, look.back, smooth(0.3, 0.7, u)), tipEnd: 0.02 }), material);
  tail.position.set(0, 0.775, -0.405);
  body.add(tail);

  const head = new THREE.Group();
  head.position.set(0, 0.74, 0.36);
  const neck = loft([
    { y: -0.07, z: -0.09, r: 0.09 },
    { y: 0, z: 0, w: 0.085, up: 0.1, down: 0.13 },
    { y: 0.11, z: 0.06, w: 0.056, up: 0.066, down: 0.078 },
    { y: 0.21, z: 0.11, w: 0.047, up: 0.054, down: 0.056 },
    { y: 0.285, z: 0.145, w: 0.045, up: 0.048, down: 0.048 },
  ], { around: 8, along: 6, color: (x, y, z, u, v) => mix(look.coat, look.back, smooth(0.09, 0.03, Math.abs(v - 0.5)) * smooth(0.9, 0.5, u)) });
  // A long straight face, narrow at the nose; stripes from the eyes to the muzzle on the tan one.
  const face = (x, y, z, u, v) => {
    const stripe = smooth(0.05, 0.02, Math.abs(Math.abs(v - 0.5) - 0.2)) * smooth(-0.02, 0.03, z) * smooth(0.21, 0.17, z);
    return mix(mix(look.face, look.mark, stripe), look.muzzle, smooth(0.2, 0.222, z));
  };
  const ex = 0.074, ey = 0.03, ez = 0.02, er = 0.021;
  const skullParts = [
    loft([
      at(-0.1, 0.04, -0.03, 0.045),
      at(-0.06, 0.078, -0.07, 0.08, { nt: 2.4 }),
      at(0.0, 0.082, -0.08, 0.088, { nt: 2.5 }),
      at(0.07, 0.066, -0.05, 0.07, { nt: 2.4 }),
      at(0.14, 0.05, -0.042, 0.05, { nt: 2.3 }),    // a straight profile
      at(0.2, 0.036, -0.036, 0.045, { nt: 2.4 }),
      at(0.232, 0.018, -0.026, 0.035),
    ], { around: 10, along: 9, level: true, color: face, tipStart: 0.015, tipEnd: 0.008 }),
    // horns, sweeping back
    ...pair(put(loft([
      { y: 0, z: 0, r: 0.028 }, { y: 0.075, z: -0.025, r: 0.024 }, { y: 0.135, z: -0.085, r: 0.018 }, { y: 0.16, z: -0.165, r: 0.009 },
    ], { around: 5, color: (x, y, z, u) => mix(GOAT_HORN, 0x3e362e, smooth(0.5, 1, u)), tipEnd: 0.015 }), { rot: [0, 0, -0.28], at: [0.04, 0.065, -0.055] })),
    // amber eyes with a dark bar across them
    ...pair(put(ball(er, { around: 8, rings: 3, color: look.iris }), { scale: [0.72, 1, 1], at: [ex - er * 0.12, ey, ez] })),
    ...pair(put(ball(er, { around: 6, rings: 2, color: EYE }), { scale: [0.4, 0.3, 0.74], at: [ex + er * 0.46, ey, ez] })),
    ...pair(put(ball(0.008, { around: 4, rings: 1, color: 0x2a2220 }), { scale: [1, 0.7, 0.5], at: [0.018, 0.012, 0.236] })), // nostrils
  ];
  const headGeo = put(merged(skullParts), { scale: [GOAT_FACE.scale, GOAT_FACE.scale, GOAT_FACE.scale], rot: [GOAT_FACE.rot, 0, 0], at: GOAT_FACE.at });
  head.add(mesh(merged([neck, headGeo]), material));
  body.add(head);
  const inner = frame(head, GOAT_FACE);
  const jaw = mesh(merged([
    loft([
      // widest where the skull's underside lies inside it: one cheek, a line only at the lips
      at(-0.01, 0.03, -0.048, 0.064, { mid: -0.028 }),
      at(0.07, 0.024, -0.05, 0.056, { mid: 0.002 }),
      at(0.15, 0.022, -0.03, 0.044, { mid: 0.012 }),
      at(0.185, 0.024, -0.022, 0.034, { mid: 0.016 }),
    ], { around: 7, along: 5, level: true, color: (x, y, z) => mix(look.face, look.muzzle, smooth(0.165, 0.185, z)), tipStart: 0.012, tipEnd: 0.01 }),
    // the beard
    loft([
      { y: -0.025, z: 0.15, w: 0.022, up: 0.028, down: 0.03 }, { y: -0.07, z: 0.145, w: 0.02, up: 0.024, down: 0.026 },
      { y: -0.115, z: 0.13, w: 0.008, up: 0.01, down: 0.01 },
    ], { around: 5, along: 4, color: look.beard, tipEnd: 0.015 }),
  ]), material);
  jaw.position.set(0, -0.045, 0.03);
  inner.add(jaw);
  const ears = mesh(merged(pair(put(earLeaf(0.13, 0.04, look.ear, mix(look.ear, PINK, 0.6), { droop: -0.3, back: 0.3 }), { at: [0.07, 0, 0] }))), material);
  ears.position.set(0, 0.04, -0.06);
  inner.add(ears);
  const lid = lids(material, er * 1.2, ex - 0.003, ey, ez, look.lid);
  inner.add(lid);

  const limb = (keys, hoofZ) => merged([
    loft(keys, { around: 6, color: (x, y) => mix(look.leg, look.knee, smooth(-0.1, -0.2, y)) }),
    // two small claws
    ...pair(put(loft([
      { y: -0.425, z: hoofZ, w: 0.014, up: 0.03, down: 0.024 },
      { y: -0.455, z: hoofZ + 0.006, w: 0.017, up: 0.042, down: 0.027 },
      { y: -0.48, z: hoofZ + 0.007, w: 0.018, up: 0.048, down: 0.029 },
    ], { around: 4, color: HOOF }), { at: [0.015, 0, 0] })),
  ]);
  const fore = limb([
    { y: 0.12, z: 0, w: 0.03, up: 0.05, down: 0.05 },
    { y: 0.02, z: 0, w: 0.055, up: 0.078, down: 0.072 },
    { y: -0.1, z: 0.004, w: 0.038, up: 0.044, down: 0.042 },
    { y: -0.2, z: 0.014, w: 0.036, up: 0.042, down: 0.03 },     // a knobbly knee
    { y: -0.26, z: 0.006, w: 0.023, up: 0.024, down: 0.024 },
    { y: -0.385, z: 0.004, w: 0.021, up: 0.022, down: 0.023 },
    { y: -0.43, z: 0.008, w: 0.028, up: 0.03, down: 0.03 },
  ], 0.008);
  const hind = limb([
    { y: 0.14, z: 0.01, w: 0.03, up: 0.06, down: 0.05 },
    { y: 0.03, z: 0.015, w: 0.06, up: 0.1, down: 0.085 },       // the thigh
    { y: -0.09, z: 0.02, w: 0.046, up: 0.065, down: 0.058 },
    { y: -0.19, z: -0.024, w: 0.032, up: 0.03, down: 0.044 },   // the hock
    { y: -0.26, z: -0.022, w: 0.023, up: 0.024, down: 0.025 },
    { y: -0.385, z: -0.01, w: 0.021, up: 0.022, down: 0.023 },
    { y: -0.43, z: -0.004, w: 0.028, up: 0.03, down: 0.03 },
  ], -0.004);
  const legs = [];
  for (const [lx, lz, geo] of [[-0.1, 0.27, fore], [0.1, 0.27, fore], [-0.1, -0.3, hind], [0.1, -0.3, hind]]) {
    const leg = mesh(geo, material);
    leg.position.set(lx, 0.48, lz);
    body.add(leg);
    legs.push(leg);
  }
  // Where a thing held in its mouth hangs (step 3: the farmer's hat).
  const mouth = new THREE.Group();
  mouth.position.set(0, 0.145, 0.375);
  head.add(mouth);
  return { group, parts: { body, torso, head, jaw, ears, lids: lid, legs, tail, mouth } };
}

// ---- the sheepdog --------------------------------------------------------------------------
// A black-and-white border collie, modelled 0.6 m at the shoulder and drawn
// SIZE.sheepdog times that (farmanimals.js): a big dog beside a cat. A white
// ruff and chest, a blaze, white socks; britches behind his thighs and a plume
// of a tail carried low, its tip white; half-pricked ears with their points
// tipped over, a red collar, soft brown eyes and his tongue out: a friend.
// parts: body, head, jaw (his tongue is on it), ears[2], lids, legs[4], tail
const DOG_FACE = Object.freeze({ at: [0, 0.065, 0.03], rot: 0.12, scale: 1.12 });
export function buildSheepdog(material) {
  const BLACK = 0x2b2a2e;
  const SHEEN = 0x3a3940;
  const WHITE = 0xf2efe8;
  const COLLAR = 0xc8402f;
  const group = new THREE.Group();
  const body = new THREE.Group(); // lowered to lie down
  group.add(body);
  // white from the collar forward and under the chest: both edges run along
  // the mesh's own lines (a ring, a column), so neither is a row of saw teeth
  const coat = (x, y, z, u, v) => mix(mix(BLACK, SHEEN, smooth(0.12, 0.0, Math.abs(v - 0.5))), WHITE, Math.max(smooth(0.16, 0.25, z), smooth(0.3, 0.38, Math.abs(v - 0.5)) * smooth(-0.12, 0.02, z)));
  const fluff = (x, y, z, r, len, tilt, lean = 0, color = WHITE) => put(loft([
    { y: 0, z: 0, r: r * 0.7 }, { y: -len * 0.45, z: 0, r }, { y: -len, z: 0, r: r * 0.2 },
  ], { around: 5, color, tipEnd: len * 0.18 }), { rot: [tilt, 0, lean], at: [x, y, z] });
  const torso = merged([
    loft([
      at(-0.41, 0.55, 0.42, 0.035),
      at(-0.37, 0.585, 0.34, 0.1),
      at(-0.25, 0.595, 0.295, 0.15, { nt: 2.3 }),            // the hips
      at(-0.07, 0.59, 0.31, 0.15, { pinch: 0.08 }),          // a waist, under a long coat
      at(0.12, 0.6, 0.265, 0.168, { pinch: 0.08, mid: 0.45 }), // a deep chest
      at(0.27, 0.61, 0.26, 0.17, { mid: 0.46 }),
      at(0.37, 0.6, 0.31, 0.14),
      at(0.44, 0.56, 0.38, 0.08),
    ], { around: 14, along: 14, level: true, color: coat, tipStart: 0.015, tipEnd: 0.02 }),
    // his neck, up to where the head turns, in a thick white ruff
    loft([
      { y: 0.42, z: 0.24, w: 0.15, up: 0.13, down: 0.17 },
      { y: 0.5, z: 0.32, w: 0.135, up: 0.12, down: 0.16 },
      { y: 0.57, z: 0.37, w: 0.11, up: 0.1, down: 0.115 },
      { y: 0.62, z: 0.4, w: 0.09, up: 0.085, down: 0.09 },
    ], { around: 10, along: 5, color: (x, y, z, u, v) => mix(WHITE, BLACK, smooth(0.12, 0.05, Math.abs(v - 0.5)) * smooth(0.9, 0.3, u)) }),
    // the ruff, and its shaggy end on his chest
    put(ball(0.17, { around: 8, rings: 4, color: WHITE }), { scale: [1, 1.05, 0.78], at: [0, 0.445, 0.35] }),
    fluff(0, 0.395, 0.45, 0.05, 0.12, 0.3),
    fluff(0.055, 0.41, 0.42, 0.042, 0.11, 0.2, 0.3),
    fluff(-0.055, 0.41, 0.42, 0.042, 0.11, 0.2, -0.3),
    fluff(0.105, 0.44, 0.37, 0.036, 0.1, 0.1, 0.55),
    fluff(-0.105, 0.44, 0.37, 0.036, 0.1, 0.1, -0.55),
    // feathering under his belly
    fluff(0, 0.33, 0.08, 0.05, 0.07, -0.5),
    fluff(0, 0.34, -0.08, 0.045, 0.07, -0.6, 0, BLACK),
    // a red collar and its tag
    solid(put(new THREE.TorusGeometry(0.108, 0.017, 3, 10), { rot: [-0.95, 0, 0], at: [0, 0.575, 0.375] }), COLLAR),
    put(ball(0.02, { around: 5, rings: 2, color: 0xe8c04a }), { scale: [1, 1, 0.5], at: [0, 0.49, 0.465] }),
  ]);
  const torsoMesh = mesh(torso, material, { cast: true });
  body.add(torsoMesh);

  const head = new THREE.Group();
  head.rotation.order = 'YXZ';
  head.position.set(0, 0.6, 0.38);
  const inner = frame(head, DOG_FACE);
  // A collie's soft wedge: a rounded crown, a clear stop, and a muzzle that
  // tapers from it to a small round nose. Black over his crown, ears and round
  // his eyes; a white blaze up the middle between them, a white muzzle and chin.
  const face = (x, y, z, u, v) => {
    const top = Math.abs(v - 0.5) < 0.27 ? 1 : 0;
    const blaze = top * smooth(0.008, -0.008, Math.abs(x) - (0.011 + 0.16 * Math.max(0, z - 0.02)));
    const muzzle = smooth(0.092, 0.112, z);
    const chin = smooth(-0.04, -0.06, y) * smooth(0.03, 0.08, z);
    return mix(BLACK, WHITE, Math.max(blaze, muzzle, chin));
  };
  const ex = 0.05, ey = 0.046, ez = 0.07, er = 0.024;
  const skullParts = [
    loft([
      at(-0.11, 0.045, -0.04, 0.05),
      at(-0.07, 0.094, -0.078, 0.092),
      at(0.0, 0.103, -0.088, 0.102),                // a round crown, soft cheeks
      at(0.05, 0.093, -0.07, 0.086),                // a light brow
      at(0.085, 0.062, -0.058, 0.062),              // the stop
      at(0.12, 0.048, -0.052, 0.05),                // and a muzzle tapering from it
      at(0.155, 0.04, -0.045, 0.04),
      at(0.185, 0.03, -0.036, 0.03),
      at(0.2, 0.018, -0.026, 0.02),
    ], { around: 12, along: 12, level: true, color: face, tipStart: 0.02, tipEnd: 0.008 }),
    put(ball(0.016, { around: 7, rings: 3, color: EYE }), { scale: [1.25, 0.85, 0.8], at: [0, 0.014, 0.198] }), // a small round nose
    // soft dark brown eyes set forward, the catchlight up and toward you
    ...pair(put(ball(er, { around: 8, rings: 3, color: 0x4a2c16 }), { scale: [0.9, 1, 1], at: [ex, ey, ez] })),
    ...pair(put(ball(er * 0.32, { around: 4, rings: 1, color: GLINT }), { at: [ex + er * 0.42, ey + er * 0.4, ez + er * 0.78] })),
  ];
  inner.add(mesh(merged(skullParts), material));
  // His lower jaw: slim, widest where his muzzle's underside lies inside it,
  // so closed it is the bottom of his muzzle and only his lips show a line.
  // His tongue lies in it, its tip at his lip: it shows when he pants.
  const jaw = mesh(merged([
    loft([
      at(-0.02, 0.02, -0.052, 0.05, { mid: -0.036 }),   // tucked up under his cheeks
      at(0.05, 0.02, -0.032, 0.05, { mid: -0.014 }),
      at(0.1, 0.018, -0.022, 0.042, { mid: -0.004 }),
      at(0.14, 0.018, -0.014, 0.034, { mid: 0.004 }),
      at(0.168, 0.02, -0.006, 0.025, { mid: 0.012 }),
    ], { around: 7, level: true, color: (x, y, z) => face(x, y - 0.042, z + 0.02, 0, 0), tipStart: 0.012, tipEnd: 0.006 }),
    put(ball(0.026, { around: 6, rings: 2, color: 0xd96a78 }), { scale: [0.8, 0.3, 1.4], rot: [0.08, 0, 0], at: [0, 0.016, 0.142] }),
  ]), material);
  jaw.position.set(0, -0.042, 0.02);
  inner.add(jaw);
  // half-pricked ears: up, and the tips tipped forward
  const earGeo = put(loft([
    { y: 0, z: 0, w: 0.056, up: 0.042, down: 0.032 }, { y: 0.05, z: 0.0, w: 0.049, up: 0.03, down: 0.024 },
    { y: 0.088, z: 0.012, w: 0.035, up: 0.021, down: 0.017 }, { y: 0.103, z: 0.038, w: 0.022, up: 0.014, down: 0.013 },
    { y: 0.094, z: 0.064, w: 0.009, up: 0.008, down: 0.008 },
  ], { around: 6, color: (x, y, z, u) => mix(BLACK, SHEEN, smooth(0.5, 1, u)), tipEnd: 0.008 }), { scale: [0.9, 0.9, 0.9] });
  const ears = [-1, 1].map((s) => {
    const e = mesh(earGeo, material);
    e.position.set(s * 0.074, 0.07, -0.04);
    e.rotation.z = -s * 0.5;
    inner.add(e);
    return e;
  });
  const lid = lids(material, er * 1.18, ex, ey, ez, BLACK);
  inner.add(lid);
  body.add(head);

  // black to the knee, white socks below it; feathers behind the forelegs and britches behind the thighs
  const sock = (x, y) => mix(BLACK, WHITE, smooth(-0.13, -0.19, y));
  const fore = merged([
    loft([
      { y: 0.1, z: 0, w: 0.03, up: 0.04, down: 0.04 },
      { y: 0.0, z: 0, w: 0.05, up: 0.062, down: 0.062 },
      { y: -0.12, z: 0, w: 0.038, up: 0.04, down: 0.05 },
      { y: -0.22, z: 0.002, w: 0.031, up: 0.032, down: 0.04 },
      { y: -0.31, z: 0.002, w: 0.029, up: 0.03, down: 0.03 },
      { y: -0.345, z: 0.008, w: 0.037, up: 0.046, down: 0.034 },   // a paw
      { y: -0.37, z: 0.008, w: 0.035, up: 0.044, down: 0.032 },
    ], { around: 7, color: sock }),
    fluff(0, -0.08, -0.05, 0.024, 0.13, -0.25, 0, BLACK),
  ]);
  const hind = merged([
    loft([
      { y: 0.1, z: 0, w: 0.03, up: 0.05, down: 0.05 },
      { y: 0.0, z: 0.005, w: 0.058, up: 0.085, down: 0.09 },       // the thigh
      { y: -0.11, z: 0.015, w: 0.044, up: 0.05, down: 0.06 },
      { y: -0.2, z: -0.025, w: 0.03, up: 0.028, down: 0.038 },     // the hock
      { y: -0.3, z: -0.018, w: 0.027, up: 0.028, down: 0.028 },
      { y: -0.345, z: -0.008, w: 0.036, up: 0.046, down: 0.032 },
      { y: -0.37, z: -0.008, w: 0.034, up: 0.044, down: 0.03 },
    ], { around: 7, color: sock }),
    fluff(0, 0.03, -0.085, 0.04, 0.17, -0.3, 0, BLACK),
    fluff(0, -0.06, -0.075, 0.03, 0.12, -0.2, 0, BLACK),
  ]);
  const legs = [];
  for (const [lx, lz, geo] of [[-0.09, 0.26, fore], [0.09, 0.26, fore], [-0.09, -0.26, hind], [0.09, -0.26, hind]]) {
    const leg = mesh(geo, material);
    leg.position.set(lx, 0.37, lz);
    body.add(leg);
    legs.push(leg);
  }
  // A plume carried low: down and back from his rump, feathered underneath,
  // lifting at its white tip.
  const tail = mesh(loft([
    { y: 0.0, z: 0.03, r: 0.04 },
    { y: -0.06, z: -0.05, w: 0.044, up: 0.07, down: 0.04, nt: 1.6 },
    { y: -0.16, z: -0.11, w: 0.05, up: 0.09, down: 0.042, nt: 1.5 },
    { y: -0.26, z: -0.17, w: 0.048, up: 0.085, down: 0.04, nt: 1.5 },
    { y: -0.33, z: -0.25, w: 0.036, up: 0.05, down: 0.03 },
    { y: -0.34, z: -0.33, w: 0.012, up: 0.014, down: 0.012 },
  ], { around: 7, along: 7, color: (x, y, z, u) => mix(BLACK, WHITE, smooth(0.66, 0.78, u)), tipEnd: 0.02 }), material);
  tail.position.set(0, 0.53, -0.38);
  body.add(tail);
  return { group, parts: { body, torso: torsoMesh, head, jaw, ears, lids: lid, legs, tail } };
}

// ---- hens, chicks, ducklings ---------------------------------------------------------------
export const HEN_COLORS = Object.freeze([0xb5683a, 0xf2ede2, 0x8f8a84, 0x4a3f3a, 0xd9a860]);
// Each hen's own feathers: her neck (hackle), her tail and the tips of her wing.
const HEN_LOOKS = Object.freeze({
  0xb5683a: { hackle: 0xcf8a48, tail: 0x2e2a28, tip: 0x6a3a22, lobe: 0xd43a30, leg: 0xe8b040 },   // a red hen, black in the tail
  0xf2ede2: { hackle: 0xfaf7f0, tail: 0xe2dccd, tip: 0xd6cfc0, lobe: 0xf6f2ea, leg: 0xf0c040 },   // a white one, white ear lobes
  0x8f8a84: { hackle: 0xc2beb8, tail: 0x56524e, tip: 0x5e5a56, lobe: 0xd43a30, leg: 0xe0b050 },   // grey, a silver neck
  0x4a3f3a: { hackle: 0x3a302c, tail: 0x262120, tip: 0x2e2826, lobe: 0xd43a30, leg: 0x6a625c },   // black, slate legs
  0xd9a860: { hackle: 0xeac888, tail: 0xb98a48, tip: 0xc09050, lobe: 0xd43a30, leg: 0xf0d0a0 },   // buff, pale legs
});
const COMB = 0xd43a30;
const BEAK = 0xf0a23a;
// Where a hen's parts hinge, in her own metres (farmanimals.js).
export const HEN_RIG = Object.freeze({ HIP_Y: 0.125, HEAD: [0, 0.155, 0.1] });
// About 0.47 m to the top of her comb: smaller than the cat. Plump: a full
// breast, a round back and fluff behind; her folded wing lies on her side in
// two layers; a tail of separate feathers held up; scaly legs with three toes
// forward and one back; a comb, wattles, ear lobes, a ringed eye, and a beak
// in two halves.
// parts: body (lifted to flutter), trunk (tips at the hips to peck), head,
// beak (the lower half), wings (open, both: hidden while folded), legs (both)
export function buildHen(color, material) {
  const look = HEN_LOOKS[color] ?? { hackle: mix(color, 0xffffff, 0.2), tail: mix(color, 0x000000, 0.35), tip: mix(color, 0x000000, 0.25), lobe: COMB, leg: BEAK };
  const group = new THREE.Group();
  const body = new THREE.Group(); // lifts to flutter
  group.add(body);
  const trunk = new THREE.Group(); // tips forward to peck, about her hips
  trunk.position.y = HEN_RIG.HIP_Y;
  body.add(trunk);
  const H = -HEN_RIG.HIP_Y;
  const lighter = mix(color, 0xffffff, 0.24);
  const b = [
    loft([
      at(-0.175, 0.265, 0.2, 0.028),
      at(-0.125, 0.298, 0.125, 0.085),                  // fluff behind
      at(-0.045, 0.306, 0.084, 0.116, { pinch: 0.1 }),
      at(0.045, 0.3, 0.078, 0.112, { pinch: 0.08 }),
      at(0.115, 0.284, 0.098, 0.09),                    // a full breast
      at(0.162, 0.25, 0.15, 0.045),
    ], { around: 8, along: 7, level: true, color: (x, y, z) => mix(lighter, color, smooth(0.09, 0.2, y - 0.25 * Math.max(0, -z))), tipStart: 0.012, tipEnd: 0.014 }),
    // her folded wing, in two layers: the coverts, and the flight feathers under them, their tips dark
    ...pair(put(loft([
      at(-0.15, 0.006, -0.02, 0.006), at(-0.09, 0.04, -0.045, 0.024), at(-0.02, 0.064, -0.064, 0.032),
      at(0.05, 0.06, -0.054, 0.028), at(0.095, 0.03, -0.03, 0.014),
    ], { around: 4, level: true, color: (x, y, z) => mix(look.tip, color, smooth(-0.1, 0.0, z + y * 0.6)), tipStart: 0.025, tipEnd: 0.012 }), {
      rot: [-0.14, 0, 0], at: [0.098, 0.215, -0.005],
    })),
    ...pair(put(loft([
      at(-0.05, 0.03, -0.024, 0.012), at(0.02, 0.052, -0.03, 0.024), at(0.085, 0.03, -0.022, 0.012),
    ], { around: 4, level: true, color, tipStart: 0.02, tipEnd: 0.012 }), { rot: [-0.1, 0, 0], at: [0.112, 0.238, 0.012] })),
  ];
  // her tail: four feathers in a fan, held up
  for (const [lean, len, x] of [[0.5, 0.19, 0], [0.78, 0.2, 0.016], [0.78, 0.2, -0.016], [1.08, 0.17, 0]]) {
    b.push(put(loft([
      { y: 0, z: 0, w: 0.03, up: 0.03, down: 0.03 }, { y: len * 0.55, z: 0, w: 0.014, up: 0.036, down: 0.036 }, { y: len, z: 0, w: 0.006, up: 0.016, down: 0.016 },
    ], { around: 4, color: (px, py) => mix(color, look.tail, smooth(0.0, len * 0.4, py)), tipEnd: 0.012 }), { rot: [-lean, 0, 0], at: [x, 0.25, -0.12] }));
  }
  trunk.add(mesh(put(merged(b), { at: [0, H, 0] }), material));

  // her open wings: flat fans out from the shoulder, lifted a little at the
  // tips. Both are one mesh: scale.x spreads them, scale.y beats them up and
  // down (farmanimals.js). Folded, they are hidden: the wing on her side shows.
  const wings = mesh(merged(pair(put(loft([
    at(0.06, 0.012, -0.004, 0.05), at(0.15, 0.05, 0.036, 0.085), at(0.24, 0.095, 0.085, 0.07), at(0.3, 0.125, 0.119, 0.03),
  ], { around: 4, level: true, color: (x, y, z) => mix(color, look.tip, Math.min(1, smooth(0.14, 0.26, z) * 0.8 + smooth(0.0, 0.06, x) * 0.5)), tipEnd: 0.02 }), { rot: [0, Math.PI / 2, 0] }))), material);
  wings.position.set(0, 0.25 + H, 0.02);
  wings.visible = false;
  trunk.add(wings);

  const head = new THREE.Group();
  head.position.set(HEN_RIG.HEAD[0], HEN_RIG.HEAD[1], HEN_RIG.HEAD[2]);
  const h = [
    loft([
      { y: -0.07, z: -0.04, r: 0.055 }, { y: 0, z: 0, w: 0.05, up: 0.056, down: 0.056 },
      { y: 0.065, z: 0.02, w: 0.037, up: 0.04, down: 0.042 }, { y: 0.105, z: 0.03, r: 0.033 },
    ], { around: 6, along: 4, color: (x, y) => mix(color, look.hackle, smooth(-0.05, 0.03, y)) }),
    put(ball(0.052, { around: 7, rings: 3, color: look.hackle }), { scale: [0.92, 1, 1.1], at: [0, 0.118, 0.042] }),
    // the top half of her beak
    solid(put(new THREE.ConeGeometry(0.02, 0.058, 4, 1, true), { scale: [1, 1, 0.55], rot: [Math.PI / 2 + 0.1, 0, 0], at: [0, 0.117, 0.113] }), BEAK),
    // a comb of three points, wattles under the beak, and ear lobes
    put(ball(0.021, { around: 4, rings: 1, color: COMB }), { scale: [0.42, 1.25, 1], at: [0, 0.178, 0.076] }),
    put(ball(0.026, { around: 4, rings: 1, color: COMB }), { scale: [0.42, 1.3, 1], at: [0, 0.188, 0.04] }),
    put(ball(0.021, { around: 4, rings: 1, color: COMB }), { scale: [0.42, 1.15, 1], at: [0, 0.176, 0.004] }),
    ...pair(put(ball(0.017, { around: 4, rings: 1, color: COMB }), { scale: [0.7, 1.6, 0.8], at: [0.013, 0.066, 0.086] })),
    ...pair(put(ball(0.012, { around: 4, rings: 1, color: look.lobe }), { scale: [0.5, 1.2, 1], at: [0.043, 0.098, 0.03] })),
    // a round eye in an orange ring
    ...pair(put(ball(0.0135, { around: 8, rings: 1, color: 0xe08a2a }), { scale: [1, 1, 0.5], rot: [0, Math.PI / 2, 0], at: [0.0425, 0.128, 0.064] })),
    ...pair(put(ball(0.0078, { around: 8, rings: 1, color: EYE }), { scale: [1, 1, 0.5], rot: [0, Math.PI / 2, 0], at: [0.047, 0.128, 0.064] })),
  ];
  head.add(mesh(merged(h), material));
  // the bottom half of her beak: it opens
  const beak = mesh(solid(put(new THREE.ConeGeometry(0.015, 0.044, 4, 1, true), { scale: [1, 1, 0.45], rot: [Math.PI / 2, 0, 0], at: [0, -0.004, 0.022] }), 0xd98a2a), material);
  beak.position.set(0, 0.108, 0.088);
  head.add(beak);
  trunk.add(head);

  // her legs, one mesh: turned about the point between her hips, one foot
  // goes forward as the other goes back (farmanimals.js). A feathered thigh,
  // a scaly shank, three toes forward and one back.
  const foot = [
    solid(put(new THREE.CylinderGeometry(0.0105, 0.0095, 0.115, 4, 1, true), { at: [0, -0.066, 0] }), look.leg),
    put(ball(0.034, { around: 5, rings: 2, color }), { scale: [0.9, 1.25, 1.1], at: [0, 0.012, -0.004] }),
  ];
  for (const turn of [0, 0.6, -0.6, Math.PI]) {
    const len = turn === Math.PI ? 0.03 : 0.062;
    foot.push(solid(put(new THREE.ConeGeometry(0.0105, len, 3, 1, true), {
      scale: [1, 1, 0.75], pre: [0, len / 2, 0], rot: [Math.PI / 2, turn, 0], at: [0, -0.118, 0],
    }), look.leg));
  }
  const legs = mesh(merged(pair(put(merged(foot), { at: [0.05, 0, 0.01] }))), material);
  legs.position.y = HEN_RIG.HIP_Y;
  body.add(legs);
  return { group, parts: { body, trunk, head, beak, wings, legs } };
}

// A small round eye: a dark bead, more sided than its size would need, so up
// close it is a round eye and not a hexagon, with a glint up and forward in it.
function bead(r, x, y, z) {
  return [
    ...pair(put(ball(r, { around: 8, rings: 2, color: EYE }), { scale: [0.75, 1, 1], at: [x, y, z] })),
    ...pair(put(ball(r * 0.34, { around: 4, rings: 1, color: GLINT }), { at: [x + r * 0.62, y + r * 0.38, z + r * 0.45] })),
  ];
}

// One geometry for every chick: a soft yellow ball of down with a round head,
// a little beak a peep open, round dark eyes, wing stubs and two feet, 0.19 m tall.
export function chickGeometry() {
  const Y = 0xf7da5c;
  const leg = merged([
    solid(put(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 3, 1, true), { at: [0, 0.02, 0] }), BEAK),
    ...[0.5, -0.5].map((turn) => solid(put(new THREE.ConeGeometry(0.007, 0.03, 3, 1, true), { scale: [1, 1, 0.6], pre: [0, 0.015, 0], rot: [Math.PI / 2, turn, 0], at: [0, 0.003, 0] }), BEAK)),
  ]);
  // down: paler on the breast and the face, a warmer yellow on the back
  const down = (x, y, z) => mix(0xfbe78f, 0xf0c444, smooth(0.0, 0.05, y - 0.09 - z * 0.4));
  const g = [
    put(ball(0.06, { around: 8, rings: 4, color: (x, y, z) => down(x, y + 0.084, z - 0.008) }), { scale: [0.98, 0.95, 1.18], at: [0, 0.084, -0.008] }),
    put(ball(0.045, { around: 8, rings: 3, color: (x, y, z) => down(x, y + 0.15, z + 0.036) }), { scale: [1, 0.96, 1.02], at: [0, 0.15, 0.036] }),
    solid(put(new THREE.ConeGeometry(0.012, 0.03, 4, 1, true), { scale: [1, 1, 0.6], rot: [Math.PI / 2 + 0.12, 0, 0], at: [0, 0.152, 0.092] }), BEAK),
    solid(put(new THREE.ConeGeometry(0.009, 0.022, 4, 1, true), { scale: [1, 1, 0.5], rot: [Math.PI / 2 - 0.2, 0, 0], at: [0, 0.143, 0.086] }), 0xd98a2a),
    ...bead(0.0085, 0.031, 0.162, 0.066),
    // wing stubs, rounded, held a little off its sides
    ...pair(put(ball(0.03, { around: 5, rings: 2, color: (x, y, z) => mix(0xf6d45a, 0xe8b838, smooth(0.0, -0.02, y)) }), { scale: [0.32, 0.62, 1.1], rot: [-0.3, 0, 0.15], at: [0.057, 0.094, -0.014] })),
    ...pair(put(leg, { at: [0.024, 0, 0] })),
  ];
  return merged(g);
}

// One geometry for every duckling: it floats, its middle at the waterline. An
// egg of a body with its tail tipped up, a round head with a dark cap and a
// stripe through the eye, a flat bill wider at its end, wing stubs.
export function ducklingGeometry() {
  const Y = 0xf2d55e;
  const BROWN = 0x5e4220;
  // a mallard's duckling: dark brown on the back, yellow face, breast and sides
  const coat = (x, y, z) => mix(Y, BROWN, smooth(0.06, 0.09, y + 0.3 * Math.max(0, -z)) * smooth(0.07, 0.02, z));
  const g = [
    loft([
      at(-0.1, 0.098, 0.066, 0.012),                    // the tail, tipped up
      at(-0.075, 0.094, 0.0, 0.04),
      at(-0.03, 0.098, -0.018, 0.06),
      at(0.03, 0.096, -0.02, 0.062),                    // round, not a boat
      at(0.075, 0.088, 0.0, 0.048),
      at(0.098, 0.07, 0.03, 0.022),                     // the breast up to the neck
    ], { around: 8, level: true, color: (x, y, z) => coat(x, y, z), tipStart: 0.012, tipEnd: 0.012 }),
    put(ball(0.046, { around: 8, rings: 3, color: (x, y, z) => mix(Y, BROWN, Math.max(smooth(0.014, 0.032, y - z * 0.5), smooth(0.009, 0.003, Math.abs(y - 0.008 + z * 0.15)) * smooth(0.02, 0.03, Math.abs(x)) * 0.85)) }), { scale: [0.96, 0.94, 1.05], at: [0, 0.13, 0.066] }),
    loft([
      { y: 0.12, z: 0.098, w: 0.019, up: 0.011, down: 0.009 }, { y: 0.116, z: 0.122, w: 0.018, up: 0.007, down: 0.006 },
      { y: 0.114, z: 0.14, w: 0.021, up: 0.006, down: 0.005 },
    ], { around: 4, color: (x, y, z) => mix(0xe8963a, 0xc9782e, smooth(0.0, -0.004, y - 0.116)), tipEnd: 0.006 }),
    ...bead(0.0085, 0.037, 0.142, 0.088),
    ...pair(put(ball(0.03, { around: 6, rings: 2, color: (x, y) => mix(Y, BROWN, smooth(-0.01, 0.012, y)) }), { scale: [0.42, 0.5, 1.15], rot: [-0.25, 0, 0], at: [0.05, 0.078, -0.016] })), // wing stubs
  ];
  return merged(g);
}

// -----------------------------------------------------------------------------
// The first models' primitive helpers, kept for the small things below (hats,
// eggs, mice, kittens, the owl): a primitive, moved into place and coloured per
// face. Every corner points at the coat picture's one white texel (WHITE_UV),
// so the cow's patches never show on them.
// -----------------------------------------------------------------------------
const _pc = new THREE.Color();
function piece(geo, color, { scale, pre, rot, at: to } = {}) {
  let g = geo;
  if (scale) g.scale(...scale);
  if (pre) g.translate(...pre); // a move before the turn (a limb's own length, so it turns about its end)
  if (rot) { if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]); }
  if (to) g.translate(...to);
  if (g.index) g = g.toNonIndexed();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const tex = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    _pc.setHex(typeof color === 'function' ? color(x, y, z) : color);
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = _pc.r; col[(i + k) * 3 + 1] = _pc.g; col[(i + k) * 3 + 2] = _pc.b;
      tex[(i + k) * 2] = WHITE_UV[0]; tex[(i + k) * 2 + 1] = WHITE_UV[1];
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
  return g;
}
const orb = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const tube = (rTop, rBottom, len, sides = 7) => new THREE.CylinderGeometry(rTop, rBottom, len, sides);
const cone = (r, len, sides = 6) => new THREE.ConeGeometry(r, len, sides);
// A barrel lying along z: a capsule, its back a little flat and its belly a
// little full.
function barrel(r, len, { radial = 12, cap = 5, rings = 6 } = {}) {
  const g = new THREE.CapsuleGeometry(r, len, cap, radial, rings);
  g.rotateX(Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setY(i, y > 0 ? y * 0.92 : y * 1.08);
  }
  g.computeVertexNormals();
  return g;
}

// =============================================================================
// Step 3: the small things of the jobs and the discoveries. Each is ONE merged
// geometry on the animals' shared material (the owl and the barn cat have one
// more for the part that moves), and none casts a shadow.
// =============================================================================
const STRAW = 0xdcbb5c;
const STRAW_DARK = 0xb9963f;
const HAT_BAND = 0xc2463a;

// A straw hat, its brim's underside at y 0. `r` is the brim's radius: the
// scarecrow's is 0.5 (world/farmparts.js), the farmer's the same hat.
export function strawHatGeometry(r = 0.5) {
  const k = r / 0.5;
  return merged([
    piece(tube(0.5 * k, 0.5 * k, 0.04 * k, 10), STRAW_DARK, { at: [0, 0.02 * k, 0] }),
    piece(tube(0.2 * k, 0.27 * k, 0.18 * k, 10), STRAW, { at: [0, 0.13 * k, 0] }),
    piece(tube(0.275 * k, 0.28 * k, 0.05 * k, 10), HAT_BAND, { at: [0, 0.065 * k, 0] }),
  ]);
}

// A nest of straw with four eggs in it, 0.5 m across.
export function eggNestGeometry() {
  const g = [
    piece(new THREE.TorusGeometry(0.2, 0.07, 5, 10), (x, y, z) => (Math.sin(x * 40 + z * 31) > 0 ? STRAW : STRAW_DARK), { rot: [Math.PI / 2, 0, 0], at: [0, 0.06, 0] }),
    piece(tube(0.2, 0.18, 0.04, 10), STRAW_DARK, { at: [0, 0.03, 0] }),
  ];
  const eggs = [[-0.07, 0.03, 0xf4ead8], [0.07, 0.05, 0xe9d2b0], [0.0, -0.08, 0xf6f0e4], [0.02, 0.0, 0xd9b890]];
  eggs.forEach(([x, z, hex], i) => g.push(piece(orb(0.05, 6, 4), hex, { scale: [0.85, 1.15, 0.85], rot: [0.5, i * 1.3, 0], at: [x, i === 3 ? 0.14 : 0.1, z] })));
  return merged(g);
}

// The owl asleep on the beam, 0.42 m tall, feet at y 0, facing +z. Its eyes
// are shut (two dark lines); `eye` is one open eye, shown for a moment when
// the cat meows.
export function buildOwl(material) {
  const BROWN = 0x8a6a48;
  const PALE = 0xdcc9a4;
  const DARKB = 0x5c4630;
  const group = new THREE.Group();
  const g = [
    piece(orb(0.15, 8, 6), (x, y, z) => (z > 0.07 && y < 0.3 ? PALE : BROWN), { scale: [0.95, 1.25, 0.9], at: [0, 0.19, 0] }),
    piece(orb(0.13, 8, 6), (x, y, z) => (z > 0.06 ? PALE : BROWN), { scale: [1.05, 0.9, 0.95], at: [0, 0.34, 0.01] }),
    piece(cone(0.02, 0.05, 4), 0xe0a23a, { rot: [Math.PI * 0.6, 0, 0], at: [0, 0.32, 0.13] }),
  ];
  for (const s of [-1, 1]) {
    g.push(piece(cone(0.035, 0.09, 4), DARKB, { rot: [0, 0, -s * 0.35], at: [s * 0.085, 0.455, 0] }));              // ear tufts
    g.push(piece(orb(0.1, 5, 4), DARKB, { scale: [0.3, 1.0, 0.75], at: [s * 0.14, 0.19, -0.01] }));                 // folded wings
    g.push(piece(new THREE.BoxGeometry(0.06, 0.012, 0.012), 0x2a2018, { rot: [0, 0, s * 0.15], at: [s * 0.055, 0.36, 0.122] })); // a shut eye
    g.push(piece(tube(0.014, 0.014, 0.03, 4), 0xe0a23a, { at: [s * 0.045, 0.015, 0.04] }));                          // feet
  }
  const body = mesh(merged(g), material);
  group.add(body);
  const eye = mesh(merged([
    piece(tube(0.036, 0.036, 0.012, 8), 0xf2c230, { rot: [Math.PI / 2, 0, 0], at: [0.055, 0.36, 0.128] }),
    piece(tube(0.017, 0.017, 0.016, 6), 0x14100c, { rot: [Math.PI / 2, 0, 0], at: [0.055, 0.36, 0.128] }),
  ]), material);
  eye.visible = false;
  group.add(eye);
  return { group, parts: { body, eye } };
}

// The barn cat, lying on her side in the hay with her head up, nose at +z.
// `head` lifts when a visitor comes. A grey tabby with white paws.
export function buildBarnCat(material) {
  const GREY = 0x8d8a86;
  const STRIPE = 0x5e5b58;
  const WHITEC = 0xf1ece2;
  const coat = (x, y, z) => (Math.sin(z * 38) > 0.55 && y > 0.1 ? STRIPE : GREY);
  const group = new THREE.Group();
  const g = [
    piece(barrel(0.13, 0.36, { radial: 8, cap: 3, rings: 3 }), coat, { scale: [1.15, 0.8, 1], at: [0, 0.11, -0.05] }),
    piece(orb(0.12, 7, 5), coat, { scale: [1.2, 0.85, 1], at: [0.02, 0.11, -0.3] }),                       // haunch
    piece(tube(0.03, 0.022, 0.42, 6), STRIPE, { rot: [Math.PI / 2, 0, 1.1], at: [0.17, 0.04, -0.3] }),      // tail, curled round
    piece(tube(0.035, 0.03, 0.2, 6), WHITEC, { rot: [Math.PI / 2, 0, 0.5], at: [0.1, 0.035, 0.2] }),        // front paws, out ahead
    piece(tube(0.035, 0.03, 0.2, 6), WHITEC, { rot: [Math.PI / 2, 0, 0.2], at: [0.03, 0.035, 0.26] }),
  ];
  group.add(mesh(merged(g), material));
  const head = new THREE.Group();
  head.position.set(-0.02, 0.2, 0.2);
  const h = [
    piece(orb(0.1, 8, 6), (x, y, z) => (z > 0.05 && y < 0.02 ? WHITEC : GREY), { scale: [1.05, 0.92, 0.95], at: [0, 0.06, 0.04] }),
    piece(orb(0.014, 5, 4), 0xd98a8a, { at: [0, 0.035, 0.135] }),
  ];
  for (const s of [-1, 1]) {
    h.push(piece(cone(0.04, 0.08, 4), GREY, { rot: [0, 0, -s * 0.25], at: [s * 0.062, 0.165, 0.02] }));
    h.push(piece(orb(0.016, 5, 3), 0x9ac26a, { scale: [1, 1, 0.5], at: [s * 0.042, 0.075, 0.125] }));
    h.push(piece(orb(0.008, 4, 3), 0x14100c, { at: [s * 0.042, 0.075, 0.136] }));
  }
  head.add(mesh(merged(h), material));
  group.add(head);
  return { group, parts: { head } };
}

// One geometry for a kitten, curled up small with its head up, nose at +z.
// `hex` is its coat.
export function kittenGeometry(hex) {
  const dark = new THREE.Color(hex).multiplyScalar(0.7).getHex();
  const g = [
    piece(orb(0.075, 7, 5), hex, { scale: [1.1, 0.75, 1.3], at: [0, 0.055, -0.03] }),
    piece(orb(0.058, 7, 5), hex, { at: [0, 0.115, 0.075] }),
    piece(tube(0.016, 0.012, 0.16, 4), dark, { rot: [Math.PI / 2, 0, 1.2], at: [0.07, 0.025, -0.07] }),
  ];
  for (const s of [-1, 1]) {
    g.push(piece(cone(0.024, 0.045, 4), dark, { at: [s * 0.035, 0.175, 0.065] }));
    g.push(piece(orb(0.009, 4, 3), 0x14100c, { at: [s * 0.024, 0.125, 0.125] }));
  }
  return merged(g);
}

// A saucer of milk, 0.3 m across.
export function saucerGeometry() {
  return merged([
    piece(tube(0.15, 0.1, 0.035, 12), 0xdfe6ee, { at: [0, 0.0175, 0] }),
    piece(tube(0.125, 0.125, 0.008, 12), 0xfffdf6, { at: [0, 0.036, 0] }),
  ]);
}

// A windfall apple, its middle at y 0.
export function appleGeometry() {
  return merged([
    piece(orb(0.09, 7, 5), (x) => (x > 0.03 ? 0xd9c13a : 0xd23a2e), { scale: [1, 0.9, 1] }),
    piece(tube(0.006, 0.006, 0.05, 4), 0x5a3e24, { at: [0, 0.09, 0] }),
  ]);
}

// One geometry for every grain-store mouse: 0.16 m long, nose at +z.
export function mouseGeometry() {
  const FUR = 0xb3a79c;
  const g = [
    piece(orb(0.05, 6, 4), FUR, { scale: [0.85, 0.8, 1.3], at: [0, 0.04, 0] }),
    piece(cone(0.03, 0.06, 4), FUR, { rot: [Math.PI / 2, 0, 0], at: [0, 0.04, 0.085] }),
    piece(tube(0.005, 0.004, 0.14, 3), 0xd9a09a, { rot: [Math.PI / 2, 0, 0], at: [0, 0.02, -0.13] }),
  ];
  for (const s of [-1, 1]) {
    g.push(piece(orb(0.02, 4, 3), 0xc9aaa0, { scale: [1, 1, 0.4], at: [s * 0.03, 0.075, 0.04] }));
    g.push(piece(orb(0.007, 3, 2), 0x14100c, { at: [s * 0.02, 0.055, 0.085] }));
  }
  return merged(g);
}
