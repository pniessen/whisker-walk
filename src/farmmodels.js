// =============================================================================
// What Appletree Farm's animals look like (src/farmsim.js is how they behave,
// src/farmanimals.js puts the two together).
//
// BUILT TO BE CHEAP. Older iPads are draw-call bound, and a cat costs about 31
// shadow draws. Each animal here is a handful of meshes, one per part that
// moves, every part one merged geometry coloured per face, all of them on ONE
// shared material:
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
// Every model stands with its feet at y 0 and its nose at +z. `parts` names
// what src/farmanimals.js moves.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from './render/materials.js';
import { COW } from './farmsim.js';

const _c = new THREE.Color();

// One piece: a primitive, moved into place, then coloured per face. `color`
// is a hex, or a function of the face's middle (x, y, z) that gives one.
function piece(geo, color, { scale, pre, rot, at } = {}) {
  let g = geo;
  if (scale) g.scale(...scale);
  if (pre) g.translate(...pre); // a move before the turn (a limb's own length, so it turns about its end)
  if (rot) { if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]); }
  if (at) g.translate(...at);
  if (g.index) g = g.toNonIndexed();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    _c.setHex(typeof color === 'function' ? color(x, y, z) : color);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = _c.r; col[(i + k) * 3 + 1] = _c.g; col[(i + k) * 3 + 2] = _c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merged = (pieces) => mergeGeometries(pieces, false);
const ball = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const tube = (rTop, rBottom, len, sides = 7) => new THREE.CylinderGeometry(rTop, rBottom, len, sides);
const cone = (r, len, sides = 6) => new THREE.ConeGeometry(r, len, sides);

// A barrel lying along z: a capsule, its back a little flat and its belly a
// little full.
function barrel(r, len, { radial = 12, cap = 5 } = {}) {
  const g = new THREE.CapsuleGeometry(r, len, cap, radial);
  g.rotateX(Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setY(i, y > 0 ? y * 0.92 : y * 1.08);
  }
  g.computeVertexNormals();
  return g;
}

// The one material every farm animal wears: the colours are in the geometry.
export function farmAnimalMaterial() {
  return litMaterial(0xffffff, { vertexColors: true });
}

function mesh(geo, material, { cast = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (!cast) m.userData.noCast = true;
  return m;
}

// ---- the cow ------------------------------------------------------------------------------
const DARK = 0x2a2624;
const HOOF = 0x3a322c;
const PINK = 0xe6a9a0;
const HORN = 0xe8dfc8;
export const COW_LOOKS = Object.freeze({
  // black and white: big patches on a cream coat
  patches: { coat: 0xf3efe6, patch: DARK, face: DARK, blaze: 0xf3efe6, leg: 0xf3efe6, ear: DARK, tuft: DARK, horns: true },
  // warm brown, cream underneath
  brown: { coat: 0xa0643a, patch: 0xa0643a, belly: 0xe2c9a2, face: 0xa0643a, blaze: 0xf0e2c8, leg: 0x8a5430, ear: 0x8a5430, tuft: 0x5a3a24, horns: true },
  // the calf: pale brown, no horns yet
  calf: { coat: 0xc9a070, patch: 0xc9a070, belly: 0xeedfc2, face: 0xc9a070, blaze: 0xf6ecd8, leg: 0xc9a070, ear: 0xb88a5a, tuft: 0x8a6a48, horns: false },
});
// The black-and-white cow's patches, as blobs in her body's own frame.
const PATCHES = [
  [0.3, 1.2, 0.55, 0.42], [-0.34, 1.05, 0.2, 0.36], [0.2, 1.25, -0.35, 0.4], [-0.25, 1.0, -0.7, 0.34],
  [0.36, 0.85, -0.05, 0.26], [-0.1, 1.36, -0.05, 0.22], [-0.3, 0.8, 0.7, 0.24],
];
const inPatch = (x, y, z) => PATCHES.some(([px, py, pz, r]) => Math.hypot(x - px, y - py, z - pz) < r);

// buildCow(look, material) → { group, parts: { body, head, legs[4], tail } }
// Her back's top is at COW.BACK_Y (the perch a cat sits on); her belly clears
// 0.6 m, so a cat walks under her.
export function buildCow(lookName, material) {
  const look = COW_LOOKS[lookName] ?? COW_LOOKS.patches;
  const coat = (x, y, z) => {
    if (look.belly && y < 0.86) return look.belly;
    return lookName === 'patches' && inPatch(x, y, z) ? look.patch : look.coat;
  };
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = merged([
    piece(barrel(0.36, 0.95), coat, { at: [0, 1.03, 0] }),
    piece(ball(0.35, 10, 7), coat, { scale: [1.02, 1.0, 0.95], at: [0, 1.0, 0.5] }),      // shoulders and chest
    piece(ball(0.36, 10, 7), coat, { scale: [1.0, 0.98, 0.9], at: [0, 1.01, -0.52] }),    // the rump
    piece(ball(0.15, 8, 6), PINK, { scale: [1, 0.75, 1.1], at: [0, 0.65, -0.4] }),         // the udder
  ]);
  const torsoMesh = mesh(torso, material, { cast: true });
  body.add(torsoMesh);

  // Head and neck, hinged at the shoulder: down to graze, up to look.
  const head = new THREE.Group();
  head.position.set(0, 1.1, 0.68);
  const headAt = [0, 0.36, 0.56];
  const face = (x, y, z) => (Math.abs(x) < 0.06 && z > headAt[2] - 0.06 ? look.blaze : look.face);
  const skull = [
    piece(ball(0.17, 9, 7), face, { scale: [0.95, 0.9, 1.25], at: [0, 0, 0] }),
    piece(ball(0.125, 8, 6), PINK, { scale: [1.05, 0.85, 1.0], at: [0, -0.045, 0.2] }),      // the muzzle
  ];
  for (const s of [-1, 1]) {
    skull.push(piece(ball(0.1, 6, 5), look.ear, { scale: [1.25, 0.35, 0.6], rot: [0, 0, -s * 0.35], at: [s * 0.22, 0.05, -0.1] }));
    skull.push(piece(ball(0.03, 6, 4), 0x16120f, { at: [s * 0.138, 0.05, 0.07] }));         // eyes
    skull.push(piece(ball(0.018, 5, 4), 0x7a4a48, { at: [s * 0.05, -0.03, 0.315] }));       // nostrils
    if (look.horns) skull.push(piece(cone(0.035, 0.15), HORN, { rot: [0, 0, -s * 0.7], at: [s * 0.13, 0.17, -0.06] }));
  }
  const headGeo = merged(skull);
  headGeo.rotateX(0.55); // her nose a little down
  headGeo.translate(...headAt);
  const neck = piece(tube(0.17, 0.25, 0.62, 9), (x, y, z) => coat(x, y + 1.1, z + 0.68), { pre: [0, 0.31, 0], rot: [1.0, 0, 0] });
  const headMesh = mesh(merged([neck, headGeo]), material, { cast: true });
  head.add(headMesh);
  body.add(head);

  // Four legs, hinged at the hip.
  const legGeo = merged([
    piece(tube(0.085, 0.062, 0.66), look.leg, { at: [0, -0.33, 0] }),
    piece(tube(0.07, 0.076, 0.1), HOOF, { at: [0, -0.69, 0] }),
  ]);
  const legs = [];
  for (const [lx, lz] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.54], [0.2, -0.54]]) {
    const leg = mesh(legGeo, material);
    leg.position.set(lx, 0.74, lz);
    body.add(leg);
    legs.push(leg);
  }

  const tail = mesh(merged([
    piece(tube(0.03, 0.022, 0.62, 5), look.patch === look.coat ? look.leg : look.coat, { at: [0, -0.31, 0] }),
    piece(ball(0.065, 6, 5), look.tuft, { scale: [1, 1.5, 1], at: [0, -0.66, 0] }),
  ]), material);
  tail.position.set(0, 1.22, -0.86);
  tail.rotation.x = 0.12;
  body.add(tail);

  return { group, parts: { body, head, legs, tail }, backY: COW.BACK_Y };
}

// ---- the goat ------------------------------------------------------------------------------
export const GOAT_LOOKS = Object.freeze({
  white: { coat: 0xefeae0, leg: 0xd9d2c4, face: 0xefeae0, ear: 0xd0c6b6, beard: 0xd9d2c4 },
  tan: { coat: 0xc79f72, leg: 0x6a4a34, face: 0xd8b88c, ear: 0x6a4a34, beard: 0xf0e6d2 },
});
// About 0.85 m to the top of its back, 1.15 to the horn tips.
export function buildGoat(lookName, material) {
  const look = GOAT_LOOKS[lookName] ?? GOAT_LOOKS.white;
  const group = new THREE.Group();
  const body = new THREE.Group(); // lifted for a hop and for standing on the rock
  group.add(body);
  const torso = merged([
    piece(barrel(0.2, 0.48, { radial: 10, cap: 4 }), look.coat, { at: [0, 0.64, 0] }),
    piece(ball(0.19, 8, 6), look.coat, { at: [0, 0.66, 0.26] }),
    piece(cone(0.045, 0.16, 5), look.coat, { rot: [-0.7, 0, 0], at: [0, 0.84, -0.46] }), // a short tail, up
  ]);
  body.add(mesh(torso, material, { cast: true }));

  const head = new THREE.Group();
  head.position.set(0, 0.74, 0.36);
  const skull = [
    piece(ball(0.1, 8, 6), look.face, { scale: [0.9, 0.95, 1.3] }),
    piece(ball(0.062, 7, 5), look.face, { scale: [1, 0.9, 1.2], at: [0, -0.04, 0.13] }),
    piece(ball(0.02, 5, 4), 0x4a3a34, { at: [0, -0.035, 0.205] }),                       // nose
    piece(cone(0.035, 0.13, 5), look.beard, { rot: [Math.PI, 0, 0], at: [0, -0.15, 0.1] }), // beard
  ];
  for (const s of [-1, 1]) {
    skull.push(piece(ball(0.06, 6, 4), look.ear, { scale: [1.5, 0.3, 0.6], rot: [0, 0, -s * 0.5], at: [s * 0.14, 0.0, -0.05] }));
    skull.push(piece(ball(0.02, 5, 4), 0x16120f, { at: [s * 0.083, 0.03, 0.06] }));
    skull.push(piece(cone(0.03, 0.2, 5), 0x6a5e50, { rot: [-0.85, 0, -s * 0.25], at: [s * 0.05, 0.14, -0.08] })); // horns, swept back
  }
  const headGeo = merged(skull);
  headGeo.rotateX(0.3);
  headGeo.translate(0, 0.27, 0.16);
  const neck = piece(tube(0.085, 0.13, 0.34, 7), look.coat, { pre: [0, 0.17, 0], rot: [0.5, 0, 0] });
  head.add(mesh(merged([neck, headGeo]), material));
  body.add(head);

  const legGeo = merged([
    piece(tube(0.05, 0.034, 0.42, 6), look.leg, { at: [0, -0.21, 0] }),
    piece(tube(0.038, 0.042, 0.06, 6), HOOF, { at: [0, -0.45, 0] }),
  ]);
  const legs = [];
  for (const [lx, lz] of [[-0.1, 0.27], [0.1, 0.27], [-0.1, -0.3], [0.1, -0.3]]) {
    const leg = mesh(legGeo, material);
    leg.position.set(lx, 0.48, lz);
    body.add(leg);
    legs.push(leg);
  }
  // Where a thing held in its mouth hangs (step 3: the farmer's hat).
  const mouth = new THREE.Group();
  mouth.position.set(0, 0.2, 0.36);
  head.add(mouth);
  return { group, parts: { body, head, legs, mouth } };
}

// ---- the sheepdog --------------------------------------------------------------------------
// A black-and-white collie, about 0.55 m at the shoulder.
export function buildSheepdog(material) {
  const BLACK = 0x2b2a2e;
  const WHITE = 0xf2efe8;
  const group = new THREE.Group();
  const body = new THREE.Group(); // lowered to lie down
  group.add(body);
  const coat = (x, y, z) => (z > 0.2 && y < 0.5 ? WHITE : z > 0.3 ? WHITE : BLACK); // white chest and ruff
  const torso = merged([
    piece(barrel(0.17, 0.44, { radial: 10, cap: 4 }), coat, { at: [0, 0.44, 0] }),
    piece(ball(0.19, 8, 6), coat, { scale: [1, 1, 0.9], at: [0, 0.46, 0.24] }), // a shaggy ruff
  ]);
  body.add(mesh(torso, material, { cast: true }));

  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.38);
  const face = (x, y, z) => (Math.abs(x) < 0.035 || z > 0.11 ? WHITE : BLACK); // a white blaze and muzzle
  const skull = [
    piece(ball(0.13, 9, 7), face, { scale: [1, 0.95, 1.05] }),
    piece(ball(0.07, 7, 5), WHITE, { scale: [0.95, 0.8, 1.5], at: [0, -0.04, 0.14] }),
    piece(ball(0.026, 5, 4), 0x16120f, { at: [0, -0.02, 0.245] }),                         // nose
    piece(ball(0.03, 5, 4), 0xd8707a, { scale: [0.9, 0.4, 1.3], at: [0, -0.1, 0.17] }),    // a happy tongue
  ];
  for (const s of [-1, 1]) {
    skull.push(piece(cone(0.055, 0.13, 4), BLACK, { rot: [0.5, 0, -s * 0.45], at: [s * 0.085, 0.13, -0.02] })); // ears, tipped forward
    skull.push(piece(ball(0.02, 5, 4), 0x16120f, { at: [s * 0.06, 0.03, 0.11] }));
  }
  head.add(mesh(merged(skull), material));
  body.add(head);

  const legGeo = merged([
    piece(tube(0.05, 0.04, 0.2, 6), BLACK, { at: [0, -0.1, 0] }),
    piece(tube(0.04, 0.045, 0.18, 6), WHITE, { at: [0, -0.28, 0] }), // white socks
  ]);
  const legs = [];
  for (const [lx, lz] of [[-0.09, 0.26], [0.09, 0.26], [-0.09, -0.26], [0.09, -0.26]]) {
    const leg = mesh(legGeo, material);
    leg.position.set(lx, 0.37, lz);
    body.add(leg);
    legs.push(leg);
  }
  const tail = mesh(merged([
    piece(tube(0.05, 0.035, 0.3, 6), BLACK, { at: [0, 0.15, 0] }),
    piece(ball(0.045, 6, 4), WHITE, { at: [0, 0.32, 0] }),
  ]), material);
  tail.geometry.rotateX(-0.9); // up and back
  tail.position.set(0, 0.5, -0.36);
  body.add(tail);
  return { group, parts: { body, head, legs, tail } };
}

// ---- hens, chicks, ducklings ---------------------------------------------------------------
export const HEN_COLORS = Object.freeze([0xb5683a, 0xf2ede2, 0x8f8a84, 0x4a3f3a, 0xd9a860]);
const COMB = 0xd43a30;
const BEAK = 0xf0a23a;
// About 0.42 m to the top of her comb: smaller than the cat.
export function buildHen(color, material) {
  const group = new THREE.Group();
  const body = new THREE.Group(); // tips forward to peck, lifts to flutter
  group.add(body);
  const darker = new THREE.Color(color).multiplyScalar(0.72).getHex();
  const b = [
    piece(ball(0.15, 9, 7), color, { scale: [0.85, 0.85, 1.15], at: [0, 0.2, 0] }),
    piece(cone(0.1, 0.24, 6), darker, { scale: [0.55, 1, 1], rot: [-0.75, 0, 0], at: [0, 0.3, -0.19] }), // tail feathers, up
  ];
  for (const s of [-1, 1]) {
    b.push(piece(tube(0.012, 0.012, 0.1, 4), BEAK, { at: [s * 0.05, 0.05, 0.01] }));
    b.push(piece(new THREE.BoxGeometry(0.05, 0.012, 0.07), BEAK, { at: [s * 0.05, 0.006, 0.03] }));
  }
  body.add(mesh(merged(b), material));
  const wings = mesh(merged([-1, 1].map((s) => piece(ball(0.1, 7, 5), darker, { scale: [0.3, 0.75, 1.1], at: [s * 0.125, 0.22, -0.02] }))), material);
  body.add(wings);
  const head = new THREE.Group();
  head.position.set(0, 0.28, 0.1);
  const h = [
    piece(tube(0.045, 0.06, 0.12, 6), color, { at: [0, 0.04, 0.01] }),
    piece(ball(0.062, 8, 6), color, { at: [0, 0.11, 0.03] }),
    piece(cone(0.022, 0.06, 4), BEAK, { rot: [Math.PI / 2, 0, 0], at: [0, 0.105, 0.11] }),
    piece(new THREE.BoxGeometry(0.018, 0.045, 0.085), COMB, { at: [0, 0.185, 0.03] }),
    piece(ball(0.02, 5, 4), COMB, { scale: [0.8, 1.3, 0.8], at: [0, 0.06, 0.085] }), // wattle
  ];
  for (const s of [-1, 1]) h.push(piece(ball(0.012, 5, 4), 0x16120f, { at: [s * 0.052, 0.12, 0.06] }));
  head.add(mesh(merged(h), material));
  body.add(head);
  return { group, parts: { body, head, wings } };
}

// One geometry for every chick: a yellow ball of fluff, 0.16 m tall.
export function chickGeometry() {
  const Y = 0xf7da5c;
  const g = [
    piece(ball(0.06, 8, 6), Y, { scale: [0.95, 0.95, 1.1], at: [0, 0.085, 0] }),
    piece(ball(0.045, 8, 6), 0xf9e27a, { at: [0, 0.15, 0.04] }),
    piece(cone(0.014, 0.035, 4), BEAK, { rot: [Math.PI / 2, 0, 0], at: [0, 0.145, 0.095] }),
  ];
  for (const s of [-1, 1]) {
    g.push(piece(ball(0.008, 4, 3), 0x16120f, { at: [s * 0.032, 0.16, 0.07] }));
    g.push(piece(tube(0.007, 0.007, 0.04, 4), BEAK, { at: [s * 0.025, 0.02, 0] }));
  }
  return merged(g);
}

// One geometry for every duckling: it floats, its middle at the waterline.
export function ducklingGeometry() {
  const Y = 0xf2d55e;
  const BROWN = 0x8a6a3a;
  const g = [
    piece(ball(0.075, 8, 6), (x, y) => (y > 0.065 ? BROWN : Y), { scale: [0.9, 0.7, 1.2], at: [0, 0.035, 0] }),
    piece(ball(0.05, 8, 6), (x, y, z) => (y > 0.15 && z < 0.07 ? BROWN : Y), { at: [0, 0.125, 0.06] }),
    piece(new THREE.BoxGeometry(0.04, 0.014, 0.05), 0xe8963a, { at: [0, 0.115, 0.125] }),
    piece(cone(0.03, 0.06, 4), BROWN, { rot: [-1.0, 0, 0], at: [0, 0.08, -0.1] }),
  ];
  for (const s of [-1, 1]) g.push(piece(ball(0.009, 4, 3), 0x16120f, { at: [s * 0.036, 0.14, 0.09] }));
  return merged(g);
}
