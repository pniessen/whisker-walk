// =============================================================================
// What Appletree Farm's animals look like (src/farmsim.js is how they behave,
// src/farmanimals.js puts the two together).
//
// BUILT TO BE CHEAP. Older iPads are draw-call bound, and a cat costs about 31
// shadow draws. Each animal here is a handful of meshes, one per part that
// moves, every part one merged geometry coloured per corner, all of them on
// ONE shared material:
//
//             meshes  shadow casters
//   cow          7         2   (body, head and neck)
//   goat         6         1
//   sheepdog     7         1
//   hen          3         0
//   chick        1         0   (one geometry shared by them all)
//   duckling     1         0   (likewise)
//
// The small ones cast nothing: a contact decal (render/contactshadows.js)
// sits under each instead. Parts that must not cast carry userData.noCast,
// which walk.js's caster sweep (render/rig.js) honours.
//
// SHAPED LIKE ANIMALS. No part is a box or a plain ball: bodies, necks, heads,
// legs, horns and tails are skins over rows of cross-sections
// (src/farmshapes.js), so a cow has a flat back over a low-slung belly, a
// goat a deep chest and a tucked-up flank, a collie a ruff. The only things
// left separate are the parts farmanimals.js moves.
//
// Every model stands with its feet at y 0 and its nose at +z. `parts` names
// what src/farmanimals.js moves.
// =============================================================================
import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { loft, at, ball, solid, put, pair, merged, mix, smooth, coatTexture, coatUV, WHITE_UV } from './farmshapes.js';

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

// An eye: a dark bead with a glint in it, on the animal's right; `pair` gives the other.
function eye(r, x, y, z, { around = 6, rings = 3, color = EYE } = {}) {
  return [
    ...pair(put(ball(r, { around, rings, color }), { at: [x, y, z] })),
    ...pair(put(ball(r * 0.34, { around: 4, rings: 1, color: GLINT }), { at: [x + r * 0.45, y + r * 0.45, z + r * 0.6] })),
  ];
}

// ---- the cow ------------------------------------------------------------------------------
export const COW_LOOKS = Object.freeze({
  // black and white: big patches on a cream coat
  patches: { coat: COW_COAT, patch: DARK, face: DARK, blaze: COW_COAT, leg: COW_COAT, ear: DARK, tuft: DARK, horns: true },
  // warm brown, cream underneath
  brown: { coat: 0xa0643a, patch: 0xa0643a, belly: 0xe2c9a2, face: 0xa0643a, blaze: 0xf0e2c8, leg: 0x8a5430, ear: 0x8a5430, tuft: 0x5a3a24, horns: true },
  // the calf: pale brown, no horns yet
  calf: { coat: 0xc9a070, patch: 0xc9a070, belly: 0xeedfc2, face: 0xc9a070, blaze: 0xf6ecd8, leg: 0xc9a070, ear: 0xb88a5a, tuft: 0x8a6a48, horns: false },
});
// The top of her back, in the model's own metres: COW.SIZE times this is
// COW.BACK_Y, the perch a cat sits on (test/farmanimals.test.js holds it there).
const COW_BACK = 1.364;

// buildCow(look, material) → { group, parts: { body, head, legs[4], tail } }
// Modelled 1.36 m to the top of her back and drawn COW.SIZE times that
// (farmanimals.js), which puts her back at COW.BACK_Y, the perch a cat sits
// on: level from her hips to her withers, and nothing of her body above it.
// Her belly clears 0.52 m, so a cat walks under her.
export function buildCow(lookName, material) {
  const look = COW_LOOKS[lookName] ?? COW_LOOKS.patches;
  const patched = lookName === 'patches';
  const calf = lookName === 'calf';
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // A calf is all legs: a shorter, slimmer barrel, tucked up higher.
  const slim = calf ? 0.86 : 1;
  const tuck = calf ? 0.09 : 0;
  const short = calf ? 0.86 : 1;
  const B = COW_BACK;
  // paler underneath: the edge runs along the skin's own lines (v, the way
  // round), so it is a clean line and not a row of saw teeth
  const belly = (v) => (look.belly ? mix(look.coat, look.belly, smooth(0.27, 0.37, Math.abs(v - 0.5))) : look.coat);
  const torso = [
    loft([
      at(-0.95 * short, B - 0.07, 0.98, 0.16 * slim, { nt: 2.6 }),
      at(-0.9 * short, B - 0.012, 0.8 + tuck, 0.3 * slim, { nt: 2.8 }),                    // her pin bones, either side of the tail
      at(-0.73 * short, B, 0.66 + tuck, 0.375 * slim, { mid: 1.04, nt: 3.0 }),            // square across her hip bones
      at(-0.46 * short, B, 0.57 + tuck, 0.41 * slim, { mid: 0.99, nt: 2.5, pinch: 0.1 }),
      at(-0.1 * short, B, 0.52 + tuck, 0.445 * slim, { mid: 0.93, nt: 2.4, pinch: 0.16 }), // her belly, low and wide
      at(0.24 * short, B, 0.53 + tuck, 0.43 * slim, { mid: 0.94, nt: 2.4, pinch: 0.14 }),
      at(0.52 * short, B, 0.57 + tuck, 0.37 * slim, { mid: 0.99, nt: 2.5, pinch: 0.06 }),  // narrower at the shoulder
      at(0.73 * short, B - 0.035, 0.65 + tuck, 0.29 * slim, { mid: 1.0 }),
      at(0.85 * short, B - 0.13, 0.76 + tuck, 0.16 * slim),
    ], {
      around: 20, along: 17, level: true, tipStart: 0.03, tipEnd: 0.04,
      color: patched ? look.coat : (x, y, z, u, v) => belly(v),
      uv: patched ? (x, y, z, u, v) => coatUV(z, v) : null,
    }),
  ];
  if (!calf) {
    torso.push(put(ball(0.15, { around: 7, rings: 4, color: PINK }), { scale: [1, 0.78, 1.2], at: [0, 0.58, -0.44] })); // the udder
    for (const [tx, tz] of [[0.06, -0.38], [-0.06, -0.38], [0.06, -0.5], [-0.06, -0.5]]) {
      torso.push(put(ball(0.022, { around: 4, rings: 1, color: 0xd9938c }), { scale: [1, 1.8, 1], at: [tx, 0.455, tz] }));
    }
  }
  body.add(mesh(merged(torso), material, { cast: true }));

  // Head and neck, hinged at the shoulder: down to graze, up to look. The
  // neck's root is a ball about the hinge, deep in her chest, so no gap opens
  // above or below it as it turns; under it hangs her dewlap, a keel.
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.7 * short);
  const hs = calf ? 1.3 : 1.15;
  const neckCoat = patched ? look.patch : null;
  const neck = loft([
    { y: -0.1, z: -0.17, w: 0.17, up: 0.2, down: 0.2 },
    { y: 0, z: 0, w: 0.25 * slim, up: 0.275, down: 0.34, nb: 1.7 },
    { y: 0.13, z: 0.23, w: 0.19 * slim, up: 0.21, down: 0.33 - tuck, nb: 1.35 },
    { y: 0.23, z: 0.42, w: 0.15, up: 0.17, down: 0.25 - tuck / 2, nb: 1.4 },
    { y: 0.295, z: 0.54, w: 0.13, up: 0.15, down: 0.16, nb: 1.8 },
    { y: 0.33, z: 0.62, w: 0.1, up: 0.11, down: 0.11 },
  ], { around: 10, along: 7, color: neckCoat ?? ((x, y, z, u, v) => belly(v)) });

  // The skull, nose at +z: a broad flat forehead, the long bridge of her
  // nose, and a wide soft muzzle.
  const face = (x, y, z, u, v) => {
    const top = Math.abs(v - 0.5) < 0.25;
    const blaze = top ? smooth(0.02, -0.02, Math.abs(x) - (0.03 + 0.2 * Math.max(0, z - 0.02))) * smooth(-0.14, -0.08, z) : 0;
    return mix(mix(look.face, look.blaze, blaze), PINK, smooth(0.26, 0.31, z));
  };
  const skull = [
    loft([
      at(-0.17, 0.1, -0.06, 0.1),
      at(-0.12, 0.155, -0.12, 0.165, { nt: 2.5 }),
      at(-0.02, 0.15, -0.165, 0.178, { nt: 2.6 }),   // her eyes sit here
      at(0.1, 0.1, -0.165, 0.15, { nt: 2.5 }),
      at(0.21, 0.058, -0.15, 0.118, { nt: 2.5 }),    // the bridge of her nose
      at(0.31, 0.045, -0.155, 0.122, { nt: 2.6, nb: 2.4 }),
      at(0.385, 0.03, -0.145, 0.112, { nt: 2.6, nb: 2.4 }),
      at(0.42, -0.005, -0.11, 0.07),
    ], { around: 12, along: 11, level: true, color: face, tipStart: 0.025, tipEnd: 0.012 }),
    put(ball(0.07, { around: 7, rings: 3, color: look.tuft }), { scale: [1.25, 0.6, 0.95], at: [0, 0.15, -0.1] }), // her forelock
    ...pair(put(ball(0.1, { around: 7, rings: 4, color: (x, y, z) => (z > 0.012 && Math.hypot(x, y * 2.2) < 0.09 ? PINK : look.ear) }), {
      scale: [1.35, 0.62, 0.3], rot: [0.25, -0.25, -0.22], at: [0.255, 0.07, -0.13],
    })),
    ...eye(0.036, 0.156, 0.045, 0.0, { around: 5, rings: 2 }),
    ...pair(put(ball(0.02, { around: 5, rings: 2, color: 0x7a4a48 }), { scale: [1, 1.2, 0.5], at: [0.05, -0.035, 0.418] })), // nostrils
  ];
  if (look.horns) {
    skull.push(...pair(put(loft([
      { y: 0, z: 0, r: 0.036 }, { y: 0.07, z: 0.005, r: 0.03 }, { y: 0.13, z: 0.03, r: 0.021 }, { y: 0.17, z: 0.07, r: 0.009 },
    ], { around: 6, along: 6, color: (x, y, z, u) => mix(HORN, 0x8a7f6a, smooth(0.6, 1, u)), tipEnd: 0.015 }), { rot: [0, 0, -1.0], at: [0.1, 0.12, -0.13] })));
  }
  const headGeo = put(merged(skull), { scale: [hs, hs, hs], rot: [0.55, 0, 0], at: [0, 0.31, 0.58] }); // her nose a little down
  head.add(mesh(merged([neck, headGeo]), material, { cast: true }));
  body.add(head);

  // Four legs, hinged at the hip: a shoulder and a knee in front, a thigh and
  // a hock behind, down to a cannon bone, a fetlock and a hoof.
  const thin = calf ? 1 : 1.12;
  const limb = (keys, hoofZ) => put(merged([
    loft(keys, { around: 7, along: 10, color: look.leg }),
    loft([
      { y: -0.655, z: hoofZ, w: 0.058, up: 0.064, down: 0.052 },
      { y: -0.7, z: hoofZ + 0.012, w: 0.07, up: 0.086, down: 0.056 },
      { y: -0.74, z: hoofZ + 0.012, w: 0.076, up: 0.1, down: 0.06 },
    ], { around: 7, color: HOOF }),
  ]), { scale: [thin, 1, thin] });
  const fore = limb([
    { y: 0.24, z: 0, w: 0.06, up: 0.1, down: 0.1 },
    { y: 0.1, z: 0, w: 0.115, up: 0.17, down: 0.16 },
    { y: -0.08, z: 0.01, w: 0.1, up: 0.125, down: 0.12 },
    { y: -0.24, z: 0.015, w: 0.072, up: 0.082, down: 0.08 },
    { y: -0.36, z: 0.028, w: 0.066, up: 0.076, down: 0.06 },   // the knee
    { y: -0.44, z: 0.016, w: 0.05, up: 0.052, down: 0.05 },
    { y: -0.58, z: 0.012, w: 0.046, up: 0.048, down: 0.05 },
    { y: -0.64, z: 0.014, w: 0.057, up: 0.058, down: 0.066 },  // the fetlock
    { y: -0.68, z: 0.02, w: 0.054, up: 0.058, down: 0.05 },
  ], 0.02);
  const hind = limb([
    { y: 0.26, z: 0.02, w: 0.06, up: 0.12, down: 0.1 },
    { y: 0.1, z: 0.03, w: 0.125, up: 0.21, down: 0.17 },       // the thigh
    { y: -0.08, z: 0.04, w: 0.108, up: 0.15, down: 0.13 },
    { y: -0.22, z: 0.0, w: 0.074, up: 0.085, down: 0.085 },
    { y: -0.33, z: -0.05, w: 0.06, up: 0.06, down: 0.076 },    // the hock
    { y: -0.42, z: -0.045, w: 0.048, up: 0.05, down: 0.052 },
    { y: -0.58, z: -0.03, w: 0.046, up: 0.048, down: 0.05 },
    { y: -0.64, z: -0.02, w: 0.057, up: 0.058, down: 0.066 },
    { y: -0.68, z: -0.012, w: 0.054, up: 0.058, down: 0.05 },
  ], -0.012);
  const legs = [];
  for (const [lx, lz, geo] of [[-0.23, 0.5, fore], [0.23, 0.5, fore], [-0.23, -0.54, hind], [0.23, -0.54, hind]]) {
    const leg = mesh(geo, material);
    leg.position.set(lx * slim, 0.74, lz * short);
    body.add(leg);
    legs.push(leg);
  }

  // Her tail: dark at the root where the rump is, and a tuft at the end.
  const tailCoat = look.patch === look.coat ? look.leg : look.coat;
  const tail = mesh(merged([
    loft([
      { y: 0.04, z: 0.03, r: 0.05 }, { y: -0.04, z: -0.01, r: 0.04 }, { y: -0.2, z: -0.015, r: 0.028 },
      { y: -0.42, z: -0.005, r: 0.022 }, { y: -0.62, z: 0, r: 0.02 },
    ], { around: 6, along: 7, color: (x, y) => mix(look.patch, tailCoat, smooth(-0.1, -0.22, y)) }),
    put(ball(0.062, { around: 6, rings: 4, color: look.tuft }), { scale: [1, 1, 2.1], rot: [Math.PI / 2, 0, 0], at: [0, -0.7, 0] }),
  ]), material);
  tail.position.set(0, 1.3, -0.9 * short);
  tail.rotation.x = 0.12;
  body.add(tail);

  return { group, parts: { body, head, legs, tail } };
}

// ---- the goat ------------------------------------------------------------------------------
export const GOAT_LOOKS = Object.freeze({
  white: { coat: 0xefeae0, leg: 0xd9d2c4, face: 0xefeae0, ear: 0xd0c6b6, beard: 0xd9d2c4, stripe: 0xe4ddd0, muzzle: 0xe3b9ae },
  tan: { coat: 0xc79f72, leg: 0x6a4a34, face: 0xd8b88c, ear: 0x6a4a34, beard: 0xf0e6d2, stripe: 0x7a5638, muzzle: 0x5a4238 },
});
const GOAT_HORN = 0x6a5e50;
// Modelled 0.83 m to the top of its back and drawn SIZE.farmgoat times that
// (farmanimals.js): a little taller than the cat. Lean: a deep chest, a
// tucked-up flank, slim legs with knees and hocks.
export function buildGoat(lookName, material) {
  const look = GOAT_LOOKS[lookName] ?? GOAT_LOOKS.white;
  const group = new THREE.Group();
  const body = new THREE.Group(); // lifted for a hop and for standing on the rock
  group.add(body);
  const coat = (x, y, z, u, v) => mix(look.coat, look.stripe, smooth(0.07, 0.03, Math.abs(v - 0.5))); // a stripe down the spine
  const torso = merged([
    loft([
      at(-0.43, 0.78, 0.64, 0.035),
      at(-0.39, 0.805, 0.55, 0.11),
      at(-0.27, 0.82, 0.49, 0.16, { nt: 2.5, mid: 0.68 }),   // the hips
      at(-0.08, 0.815, 0.44, 0.19, { pinch: 0.12 }),         // a flank tucked up
      at(0.12, 0.82, 0.4, 0.172, { pinch: 0.1, mid: 0.6 }),  // a deep chest
      at(0.27, 0.83, 0.41, 0.15, { mid: 0.62 }),             // the withers
      at(0.38, 0.79, 0.5, 0.1),
      at(0.44, 0.74, 0.58, 0.05),
    ], { around: 12, along: 11, level: true, color: coat, tipStart: 0.015, tipEnd: 0.02 }),
    // a short tail, up
    loft([
      { y: 0.77, z: -0.4, w: 0.04, up: 0.03, down: 0.03 }, { y: 0.86, z: -0.445, w: 0.038, up: 0.022, down: 0.026 },
      { y: 0.935, z: -0.455, w: 0.014, up: 0.01, down: 0.012 },
    ], { around: 6, along: 4, color: look.stripe, tipEnd: 0.02 }),
  ]);
  body.add(mesh(torso, material, { cast: true }));

  const head = new THREE.Group();
  head.position.set(0, 0.74, 0.36);
  const neck = loft([
    { y: -0.07, z: -0.09, r: 0.09 },
    { y: 0, z: 0, w: 0.095, up: 0.11, down: 0.14 },
    { y: 0.1, z: 0.075, w: 0.068, up: 0.078, down: 0.09 },
    { y: 0.19, z: 0.14, w: 0.055, up: 0.062, down: 0.066 },
    { y: 0.25, z: 0.18, w: 0.045, up: 0.045, down: 0.045 },
  ], { around: 8, along: 5, color: look.coat });
  // A long straight face, narrow at the nose.
  const face = (x, y, z) => mix(look.face, look.muzzle, smooth(0.2, 0.222, z) * smooth(-0.04, -0.02, y));
  const skull = [
    loft([
      at(-0.11, 0.045, -0.035, 0.045),
      at(-0.07, 0.08, -0.075, 0.084, { nt: 2.4 }),
      at(0.0, 0.08, -0.088, 0.09, { nt: 2.4 }),
      at(0.08, 0.057, -0.075, 0.07, { nt: 2.4 }),
      at(0.15, 0.04, -0.062, 0.052, { nt: 2.3 }),
      at(0.2, 0.03, -0.055, 0.047, { nt: 2.3 }),
      at(0.228, 0.012, -0.04, 0.03),
    ], { around: 10, along: 9, level: true, color: face, tipStart: 0.015, tipEnd: 0.008 }),
    // a beard
    loft([
      { y: -0.045, z: 0.165, w: 0.02, up: 0.026, down: 0.028 }, { y: -0.11, z: 0.158, w: 0.018, up: 0.022, down: 0.024 },
      { y: -0.175, z: 0.14, w: 0.006, up: 0.008, down: 0.008 },
    ], { around: 5, along: 4, color: look.beard, tipEnd: 0.015 }),
    // alert ears, out to the sides
    ...pair(put(ball(0.07, { around: 6, rings: 4, color: (x, y, z) => (z > 0.008 && Math.hypot(x, y * 2) < 0.06 ? mix(look.ear, PINK, 0.6) : look.ear) }), {
      scale: [1.3, 0.55, 0.28], rot: [0.2, -0.35, 0.3], at: [0.125, 0.04, -0.065],
    })),
    // horns, curving back
    ...pair(put(loft([
      { y: 0, z: 0, r: 0.028 }, { y: 0.075, z: -0.025, r: 0.024 }, { y: 0.135, z: -0.085, r: 0.018 }, { y: 0.16, z: -0.165, r: 0.009 },
    ], { around: 5, along: 6, color: (x, y, z, u) => mix(GOAT_HORN, 0x3e362e, smooth(0.5, 1, u)), tipEnd: 0.015 }), { rot: [0, 0, -0.28], at: [0.04, 0.065, -0.055] })),
    ...eye(0.021, 0.079, 0.022, 0.015, { around: 5, rings: 2 }),
  ];
  const headGeo = put(merged(skull), { scale: [1.2, 1.2, 1.2], rot: [0.3, 0, 0], at: [0, 0.24, 0.17] });
  head.add(mesh(merged([neck, headGeo]), material));
  body.add(head);

  const limb = (keys, hoofZ) => merged([
    loft(keys, { around: 6, along: 9, color: look.leg }),
    loft([
      { y: -0.425, z: hoofZ, w: 0.027, up: 0.032, down: 0.026 },
      { y: -0.452, z: hoofZ + 0.006, w: 0.032, up: 0.044, down: 0.028 },
      { y: -0.48, z: hoofZ + 0.006, w: 0.034, up: 0.048, down: 0.03 },
    ], { around: 6, color: HOOF }),
  ]);
  const fore = limb([
    { y: 0.12, z: 0, w: 0.03, up: 0.05, down: 0.05 },
    { y: 0.02, z: 0, w: 0.055, up: 0.078, down: 0.072 },
    { y: -0.1, z: 0.004, w: 0.04, up: 0.046, down: 0.044 },
    { y: -0.21, z: 0.012, w: 0.032, up: 0.037, down: 0.029 },   // the knee
    { y: -0.27, z: 0.006, w: 0.023, up: 0.024, down: 0.024 },
    { y: -0.39, z: 0.004, w: 0.021, up: 0.022, down: 0.023 },
    { y: -0.44, z: 0.008, w: 0.027, up: 0.029, down: 0.028 },
  ], 0.008);
  const hind = limb([
    { y: 0.14, z: 0.01, w: 0.03, up: 0.06, down: 0.05 },
    { y: 0.03, z: 0.015, w: 0.06, up: 0.1, down: 0.085 },       // the thigh
    { y: -0.09, z: 0.02, w: 0.046, up: 0.065, down: 0.058 },
    { y: -0.19, z: -0.022, w: 0.031, up: 0.03, down: 0.04 },    // the hock
    { y: -0.26, z: -0.022, w: 0.023, up: 0.024, down: 0.025 },
    { y: -0.39, z: -0.01, w: 0.021, up: 0.022, down: 0.023 },
    { y: -0.44, z: -0.004, w: 0.027, up: 0.029, down: 0.028 },
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
  mouth.position.set(0, 0.14, 0.41);
  head.add(mouth);
  return { group, parts: { body, head, legs, mouth } };
}

// ---- the sheepdog --------------------------------------------------------------------------
// A black-and-white collie, modelled 0.6 m at the shoulder and drawn
// SIZE.sheepdog times that (farmanimals.js): a big dog beside a cat. A white
// ruff and chest, a blaze, white socks and a white tip to a plume of a tail;
// half-pricked ears, a red collar, and his tongue out: a friend.
export function buildSheepdog(material) {
  const BLACK = 0x2b2a2e;
  const WHITE = 0xf2efe8;
  const COLLAR = 0xc8402f;
  const group = new THREE.Group();
  const body = new THREE.Group(); // lowered to lie down
  group.add(body);
  // white from the collar forward and under the chest: both edges run along
  // the mesh's own lines (a ring, a column), so neither is a row of saw teeth
  const coat = (x, y, z, u, v) => mix(BLACK, WHITE, Math.max(smooth(0.16, 0.25, z), smooth(0.3, 0.38, Math.abs(v - 0.5)) * smooth(-0.12, 0.02, z)));
  const fluff = (x, y, z, r, len, tilt, lean = 0) => put(loft([
    { y: 0, z: 0, r: r * 0.7 }, { y: -len * 0.45, z: 0, r }, { y: -len, z: 0, r: r * 0.2 },
  ], { around: 5, along: 4, color: WHITE, tipEnd: len * 0.18 }), { rot: [tilt, 0, lean], at: [x, y, z] });
  const torso = merged([
    loft([
      at(-0.41, 0.55, 0.42, 0.035),
      at(-0.37, 0.585, 0.34, 0.1),
      at(-0.25, 0.595, 0.295, 0.15, { nt: 2.3 }),            // the hips
      at(-0.07, 0.59, 0.31, 0.152, { pinch: 0.08 }),         // a waist, under a long coat
      at(0.12, 0.6, 0.27, 0.168, { pinch: 0.08, mid: 0.45 }), // a deep chest
      at(0.27, 0.61, 0.265, 0.17, { mid: 0.46 }),
      at(0.37, 0.6, 0.31, 0.14),
      at(0.44, 0.56, 0.38, 0.08),
    ], { around: 16, along: 15, level: true, color: coat, tipStart: 0.015, tipEnd: 0.02 }),
    // his neck, up to where the head turns, in a thick white ruff
    loft([
      { y: 0.42, z: 0.24, w: 0.15, up: 0.13, down: 0.17 },
      { y: 0.5, z: 0.32, w: 0.135, up: 0.12, down: 0.16 },
      { y: 0.57, z: 0.37, w: 0.11, up: 0.1, down: 0.115 },
      { y: 0.62, z: 0.4, w: 0.09, up: 0.085, down: 0.09 },
    ], { around: 10, along: 6, color: (x, y, z, u, v) => mix(WHITE, BLACK, smooth(0.12, 0.05, Math.abs(v - 0.5)) * smooth(0.9, 0.3, u)) }),
    // the ruff, and its shaggy end on his chest
    put(ball(0.17, { around: 9, rings: 5, color: WHITE }), { scale: [1, 1.05, 0.78], at: [0, 0.445, 0.35] }),
    fluff(0, 0.395, 0.45, 0.05, 0.12, 0.3),
    fluff(0.055, 0.41, 0.42, 0.042, 0.11, 0.2, 0.3),
    fluff(-0.055, 0.41, 0.42, 0.042, 0.11, 0.2, -0.3),
    fluff(0.105, 0.44, 0.37, 0.036, 0.1, 0.1, 0.55),
    fluff(-0.105, 0.44, 0.37, 0.036, 0.1, 0.1, -0.55),
    // a red collar and its tag
    solid(put(new THREE.TorusGeometry(0.108, 0.017, 4, 10), { rot: [-0.95, 0, 0], at: [0, 0.575, 0.375] }), COLLAR),
    put(ball(0.02, { around: 5, rings: 2, color: 0xe8c04a }), { scale: [1, 1, 0.5], at: [0, 0.49, 0.465] }),
  ]);
  body.add(mesh(torso, material, { cast: true }));

  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.38);
  // a blaze up between the eyes, a white muzzle, black cheeks and crown
  const face = (x, y, z, u, v) => {
    const blaze = smooth(0.012, -0.012, Math.abs(x) - (0.014 + 0.2 * Math.max(0, z - 0.04))) * (Math.abs(v - 0.5) < 0.25 ? 1 : 0);
    return mix(BLACK, WHITE, Math.max(blaze, smooth(0.1, 0.125, z), smooth(-0.05, -0.08, y) * smooth(-0.02, 0.05, z)));
  };
  const skull = [
    loft([
      at(-0.11, 0.045, -0.04, 0.05),
      at(-0.07, 0.098, -0.085, 0.102, { nt: 2.2 }),
      at(0.0, 0.108, -0.098, 0.118, { nt: 2.2 }),    // a round crown, full cheeks
      at(0.06, 0.088, -0.09, 0.092, { nt: 2.3 }),    // the brow
      at(0.098, 0.04, -0.074, 0.058, { nt: 2.3 }),   // the stop: down to a tapered muzzle
      at(0.15, 0.028, -0.062, 0.046, { nt: 2.3 }),
      at(0.195, 0.02, -0.05, 0.038, { nt: 2.3 }),
      at(0.218, 0.008, -0.032, 0.025),
    ], { around: 12, along: 12, level: true, color: face, tipStart: 0.02, tipEnd: 0.008 }),
    put(ball(0.025, { around: 6, rings: 3, color: EYE }), { scale: [1.1, 0.9, 0.9], at: [0, 0.006, 0.218] }),                // nose
    put(ball(0.03, { around: 6, rings: 2, color: 0xe07a86 }), { scale: [0.85, 0.3, 1.5], rot: [0.5, 0, 0], at: [0, -0.066, 0.172] }), // a happy tongue
    // half-pricked ears: up, and the tips tipped forward
    ...pair(put(loft([
      { y: 0, z: 0, w: 0.054, up: 0.04, down: 0.03 }, { y: 0.05, z: 0.0, w: 0.047, up: 0.03, down: 0.022 },
      { y: 0.088, z: 0.012, w: 0.033, up: 0.02, down: 0.016 }, { y: 0.103, z: 0.036, w: 0.02, up: 0.013, down: 0.012 },
      { y: 0.097, z: 0.058, w: 0.008, up: 0.007, down: 0.007 },
    ], { around: 6, along: 7, color: BLACK, tipEnd: 0.008 }), { scale: [0.9, 0.9, 0.9], rot: [0, 0, -0.5], at: [0.074, 0.07, -0.04] })),
    ...eye(0.02, 0.06, 0.04, 0.074, { color: 0x3a2412 }),
  ];
  head.add(mesh(put(merged(skull), { scale: [1.12, 1.12, 1.12], rot: [0.12, 0, 0], at: [0, 0.065, 0.03] }), material));
  body.add(head);

  // black to the knee, white socks below it
  const sock = (x, y) => mix(BLACK, WHITE, smooth(-0.13, -0.19, y));
  const fore = loft([
    { y: 0.1, z: 0, w: 0.03, up: 0.04, down: 0.04 },
    { y: 0.0, z: 0, w: 0.05, up: 0.062, down: 0.062 },
    { y: -0.12, z: 0, w: 0.038, up: 0.04, down: 0.046 },
    { y: -0.22, z: 0.002, w: 0.031, up: 0.032, down: 0.034 },
    { y: -0.31, z: 0.002, w: 0.029, up: 0.03, down: 0.03 },
    { y: -0.345, z: 0.008, w: 0.037, up: 0.046, down: 0.034 },   // a paw
    { y: -0.37, z: 0.008, w: 0.035, up: 0.044, down: 0.032 },
  ], { around: 7, along: 9, color: sock });
  const hind = loft([
    { y: 0.1, z: 0, w: 0.03, up: 0.05, down: 0.05 },
    { y: 0.0, z: 0.005, w: 0.058, up: 0.085, down: 0.085 },      // the thigh
    { y: -0.11, z: 0.015, w: 0.044, up: 0.05, down: 0.056 },
    { y: -0.2, z: -0.025, w: 0.03, up: 0.028, down: 0.038 },     // the hock
    { y: -0.3, z: -0.018, w: 0.027, up: 0.028, down: 0.028 },
    { y: -0.345, z: -0.008, w: 0.036, up: 0.046, down: 0.032 },
    { y: -0.37, z: -0.008, w: 0.034, up: 0.044, down: 0.03 },
  ], { around: 7, along: 9, color: sock });
  const legs = [];
  for (const [lx, lz, geo] of [[-0.09, 0.26, fore], [0.09, 0.26, fore], [-0.09, -0.26, hind], [0.09, -0.26, hind]]) {
    const leg = mesh(geo, material);
    leg.position.set(lx, 0.37, lz);
    body.add(leg);
    legs.push(leg);
  }
  // A plume, up and back, feathered underneath, its tip white.
  const tail = mesh(loft([
    { y: -0.02, z: 0.03, r: 0.04 },
    { y: 0.05, z: -0.06, w: 0.045, up: 0.07, down: 0.04, nt: 1.6 },
    { y: 0.14, z: -0.15, w: 0.05, up: 0.085, down: 0.042, nt: 1.5 },
    { y: 0.24, z: -0.22, w: 0.046, up: 0.075, down: 0.04, nt: 1.5 },
    { y: 0.32, z: -0.25, w: 0.03, up: 0.04, down: 0.03 },
    { y: 0.37, z: -0.255, w: 0.01, up: 0.012, down: 0.01 },
  ], { around: 8, along: 9, color: (x, y, z, u) => mix(BLACK, WHITE, smooth(0.62, 0.74, u)), tipEnd: 0.015 }), material);
  tail.position.set(0, 0.52, -0.37);
  body.add(tail);
  return { group, parts: { body, head, legs, tail } };
}

// ---- hens, chicks, ducklings ---------------------------------------------------------------
export const HEN_COLORS = Object.freeze([0xb5683a, 0xf2ede2, 0x8f8a84, 0x4a3f3a, 0xd9a860]);
const COMB = 0xd43a30;
const BEAK = 0xf0a23a;
// About 0.47 m to the top of her comb: smaller than the cat. A plump body, her
// breast forward and her tail a fan held up; a comb, wattles and a beak.
export function buildHen(color, material) {
  const group = new THREE.Group();
  const body = new THREE.Group(); // tips forward to peck, lifts to flutter
  group.add(body);
  const darker = new THREE.Color(color).multiplyScalar(0.72).getHex();
  const lighter = mix(color, 0xffffff, 0.22);
  const b = [
    loft([
      at(-0.18, 0.27, 0.2, 0.025),
      at(-0.13, 0.295, 0.13, 0.078),
      at(-0.05, 0.305, 0.088, 0.108, { pinch: 0.08 }),
      at(0.04, 0.3, 0.082, 0.108, { pinch: 0.08 }),
      at(0.11, 0.275, 0.11, 0.084),
      at(0.155, 0.235, 0.16, 0.04),
    ], { around: 8, along: 7, level: true, color: (x, y) => mix(lighter, color, smooth(0.1, 0.2, y)), tipStart: 0.012, tipEnd: 0.012 }),
    // her tail: a fan, thin from side to side, held up
    loft([
      { y: 0.25, z: -0.1, w: 0.045, up: 0.05, down: 0.05 },
      { y: 0.32, z: -0.155, w: 0.032, up: 0.075, down: 0.058 },
      { y: 0.375, z: -0.195, w: 0.02, up: 0.068, down: 0.05 },
      { y: 0.405, z: -0.22, w: 0.008, up: 0.035, down: 0.028 },
    ], { around: 5, along: 4, color: darker, tipEnd: 0.012 }),
  ];
  // legs, and three toes forward and one back
  const foot = [solid(put(new THREE.CylinderGeometry(0.011, 0.01, 0.1, 4, 1, true), { at: [0, 0.056, 0] }), BEAK)];
  for (const turn of [0, 0.55, -0.55, Math.PI]) {
    foot.push(solid(put(new THREE.ConeGeometry(0.01, turn === Math.PI ? 0.03 : 0.055, 3, 1, true), {
      scale: [1, 1, 0.7], pre: [0, turn === Math.PI ? 0.015 : 0.0275, 0], rot: [Math.PI / 2, turn, 0], at: [0, 0.007, 0],
    }), BEAK));
  }
  b.push(...pair(put(merged(foot), { at: [0.05, 0, 0.01] })));
  body.add(mesh(merged(b), material));
  const wings = mesh(merged(pair(put(loft([
    at(-0.14, 0.012, -0.012, 0.006), at(-0.09, 0.045, -0.04, 0.026), at(-0.02, 0.068, -0.062, 0.034),
    at(0.05, 0.062, -0.056, 0.03), at(0.095, 0.03, -0.03, 0.014),
  ], { around: 6, along: 5, level: true, color: (x, y, z) => mix(darker, color, smooth(-0.02, 0.07, z) * 0.5), tipStart: 0.02, tipEnd: 0.012 }), {
    rot: [-0.12, 0, 0], at: [0.1, 0.215, -0.005],
  }))), material);
  body.add(wings);
  const head = new THREE.Group();
  head.position.set(0, 0.28, 0.1);
  const h = [
    loft([
      { y: -0.07, z: -0.04, r: 0.055 }, { y: 0, z: 0, w: 0.052, up: 0.058, down: 0.056 },
      { y: 0.065, z: 0.022, w: 0.04, up: 0.042, down: 0.044 }, { y: 0.105, z: 0.032, r: 0.036 },
    ], { around: 7, along: 4, color }),
    put(ball(0.056, { around: 7, rings: 4, color }), { scale: [0.95, 1, 1.08], at: [0, 0.118, 0.04] }),
    solid(put(new THREE.ConeGeometry(0.021, 0.062, 5, 1, true), { scale: [1, 1, 0.8], rot: [Math.PI / 2 + 0.12, 0, 0], at: [0, 0.108, 0.115] }), BEAK),
    // a comb of three points, and wattles under the beak
    put(ball(0.022, { around: 4, rings: 2, color: COMB }), { scale: [0.42, 1.15, 1], at: [0, 0.182, 0.072] }),
    put(ball(0.026, { around: 4, rings: 2, color: COMB }), { scale: [0.42, 1.2, 1], at: [0, 0.192, 0.038] }),
    put(ball(0.022, { around: 4, rings: 2, color: COMB }), { scale: [0.42, 1.1, 1], at: [0, 0.18, 0.004] }),
    ...pair(put(ball(0.017, { around: 4, rings: 1, color: COMB }), { scale: [0.7, 1.5, 0.8], at: [0.013, 0.062, 0.088] })),
    ...pair(put(ball(0.012, { around: 6, rings: 1, color: EYE }), { rot: [0, Math.PI / 2, 0], at: [0.047, 0.128, 0.066] })),
  ];
  head.add(mesh(merged(h), material));
  body.add(head);
  return { group, parts: { body, head, wings } };
}

// One geometry for every chick: a soft yellow egg with a round head, a beak
// and two legs, 0.19 m tall.
export function chickGeometry() {
  const Y = 0xf7da5c;
  const g = [
    put(ball(0.06, { around: 6, rings: 4, color: (x, y) => mix(0xf3cf4c, Y, smooth(-0.04, 0.02, y)) }), { scale: [0.98, 0.95, 1.18], at: [0, 0.084, -0.008] }),
    put(ball(0.044, { around: 7, rings: 4, color: 0xf9e27a }), { at: [0, 0.15, 0.04] }),
    solid(put(new THREE.ConeGeometry(0.014, 0.036, 3, 1, true), { rot: [Math.PI / 2, 0, 0], at: [0, 0.146, 0.094] }), BEAK),
    ...pair(put(ball(0.0085, { around: 6, rings: 1, color: EYE }), { rot: [0, Math.PI / 2, 0], at: [0.031, 0.16, 0.07] })),
    ...pair(solid(put(new THREE.CylinderGeometry(0.007, 0.007, 0.04, 3, 1, true), { at: [0.024, 0.02, 0] }), BEAK)),
  ];
  return merged(g);
}

// One geometry for every duckling: it floats, its middle at the waterline. A
// little boat of a body with its tail turned up, a round head, a flat bill.
export function ducklingGeometry() {
  const Y = 0xf2d55e;
  const BROWN = 0x8a6a3a;
  const g = [
    loft([
      at(-0.108, 0.078, 0.058, 0.01), at(-0.07, 0.07, -0.004, 0.046), at(-0.01, 0.084, -0.02, 0.066),
      at(0.05, 0.08, -0.014, 0.058), at(0.092, 0.058, 0.01, 0.028),
    ], { around: 7, along: 5, level: true, color: (x, y, z, u, v) => mix(Y, BROWN, smooth(0.14, 0.08, Math.abs(v - 0.5))), tipStart: 0.008, tipEnd: 0.012 }),
    put(ball(0.048, { around: 6, rings: 3, color: (x, y, z) => mix(Y, BROWN, smooth(0.012, 0.03, y - z * 0.5)) }), { at: [0, 0.125, 0.06] }),
    loft([{ y: 0.112, z: 0.098, w: 0.023, up: 0.01, down: 0.01 }, { y: 0.109, z: 0.136, w: 0.02, up: 0.006, down: 0.006 }], { around: 4, color: 0xe8963a, tipEnd: 0.008 }),
    ...pair(put(ball(0.009, { around: 6, rings: 1, color: EYE }), { rot: [0, Math.PI / 2, 0], at: [0.036, 0.138, 0.088] })),
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
