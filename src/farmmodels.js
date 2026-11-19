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

const _c = new THREE.Color();
const _d = new THREE.Color();

// One piece: a primitive, moved into place, then coloured per face. `color`
// is a hex, or a function of the face's middle (x, y, z) that gives one.
function piece(geo, color, { scale, pre, rot, at, soft = false } = {}) {
  let g = geo;
  if (scale) g.scale(...scale);
  if (pre) g.translate(...pre); // a move before the turn (a limb's own length, so it turns about its end)
  if (rot) { if (rot[0]) g.rotateX(rot[0]); if (rot[1]) g.rotateY(rot[1]); if (rot[2]) g.rotateZ(rot[2]); }
  if (at) g.translate(...at);
  // soft: coloured per corner instead, so a patch's edge is a soft line and
  // not a row of saw teeth (a cow's coat)
  if (soft) {
    const p = g.getAttribute('position');
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // the function gives a hex, or [hexA, hexB, k]: k of the way from A to B
      const got = color(p.getX(i), p.getY(i), p.getZ(i));
      if (Array.isArray(got)) _c.setHex(got[0]).lerp(_d.setHex(got[1]), got[2]);
      else _c.setHex(got);
      c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g.index ? g.toNonIndexed() : g;
  }
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
// Few and big, so each has a clean edge: over the shoulders, a saddle to one
// side, and the rump.
const PATCHES = [
  [0.1, 1.2, 0.62, 0.55], [0.0, 1.15, -0.72, 0.56], [-0.44, 1.05, -0.05, 0.3],
];
// How far inside a patch (x, y, z) is: 0 outside, 1 well inside, a soft step between.
const PATCH_EDGE = 0.07;
function patchK(x, y, z) {
  let k = 0;
  for (const [px, py, pz, r] of PATCHES) {
    const t = Math.min(1, Math.max(0, (r + PATCH_EDGE - Math.hypot(x - px, y - py, z - pz)) / (2 * PATCH_EDGE)));
    k = Math.max(k, t * t * (3 - 2 * t));
  }
  return k;
}

// buildCow(look, material) → { group, parts: { body, head, legs[4], tail } }
// Modelled 1.36 m to the top of her back and drawn COW.SIZE times that
// (farmanimals.js), which puts her back at COW.BACK_Y, the perch a cat sits
// on. Her belly clears 0.55 m, so a cat walks under her.
export function buildCow(lookName, material) {
  const look = COW_LOOKS[lookName] ?? COW_LOOKS.patches;
  const coat = (x, y, z) => {
    if (look.belly && y < 0.86) return look.belly;
    return lookName === 'patches' ? [look.coat, look.patch, patchK(x, y, z)] : look.coat;
  };
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // The patched coat needs a fine mesh for its patches' soft edges; a plain
  // coat does with a third of the triangles.
  const fine = lookName === 'patches';
  const [bw, bh] = fine ? [18, 12] : [12, 8];
  const torso = merged([
    piece(barrel(0.42, 0.9, fine ? { radial: 24, cap: 7, rings: 12 } : { radial: 14, cap: 5, rings: 3 }), coat, { at: [0, 0.974, 0], soft: true }),
    piece(ball(0.4, bw, bh), coat, { scale: [1.02, 1.0, 0.95], at: [0, 0.94, 0.48], soft: true }),  // shoulders and chest
    piece(ball(0.41, bw, bh), coat, { scale: [1.0, 0.98, 0.9], at: [0, 0.95, -0.5], soft: true }),  // the rump
    piece(ball(0.16, 8, 6), PINK, { scale: [1, 0.7, 1.1], at: [0, 0.55, -0.38] }),         // the udder
  ]);
  const torsoMesh = mesh(torso, material, { cast: true });
  body.add(torsoMesh);

  // Head and neck, hinged at the shoulder: down to graze, up to look.
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.7);
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
  const neck = piece(new THREE.CylinderGeometry(0.18, 0.3, 0.62, 12, 4), (x, y, z) => coat(x, y + 1.08, z + 0.7), { pre: [0, 0.31, 0], rot: [1.0, 0, 0], soft: true });
  const headMesh = mesh(merged([neck, headGeo]), material, { cast: true });
  head.add(headMesh);
  body.add(head);

  // Four legs, hinged at the hip.
  const legGeo = merged([
    piece(tube(0.11, 0.075, 0.66, 8), look.leg, { at: [0, -0.33, 0] }),
    piece(tube(0.082, 0.09, 0.1, 8), HOOF, { at: [0, -0.69, 0] }),
  ]);
  const legs = [];
  for (const [lx, lz] of [[-0.23, 0.5], [0.23, 0.5], [-0.23, -0.54], [0.23, -0.54]]) {
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

  return { group, parts: { body, head, legs, tail } };
}

// ---- the goat ------------------------------------------------------------------------------
export const GOAT_LOOKS = Object.freeze({
  white: { coat: 0xefeae0, leg: 0xd9d2c4, face: 0xefeae0, ear: 0xd0c6b6, beard: 0xd9d2c4 },
  tan: { coat: 0xc79f72, leg: 0x6a4a34, face: 0xd8b88c, ear: 0x6a4a34, beard: 0xf0e6d2 },
});
// Modelled 0.85 m to the top of its back and drawn SIZE.farmgoat times that
// (farmanimals.js): a little taller than the cat.
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
// A black-and-white collie, modelled 0.6 m at the shoulder and drawn
// SIZE.sheepdog times that (farmanimals.js): a big dog beside a cat.
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
  eggs.forEach(([x, z, hex], i) => g.push(piece(ball(0.05, 6, 4), hex, { scale: [0.85, 1.15, 0.85], rot: [0.5, i * 1.3, 0], at: [x, i === 3 ? 0.14 : 0.1, z] })));
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
    piece(ball(0.15, 8, 6), (x, y, z) => (z > 0.07 && y < 0.3 ? PALE : BROWN), { scale: [0.95, 1.25, 0.9], at: [0, 0.19, 0] }),
    piece(ball(0.13, 8, 6), (x, y, z) => (z > 0.06 ? PALE : BROWN), { scale: [1.05, 0.9, 0.95], at: [0, 0.34, 0.01] }),
    piece(cone(0.02, 0.05, 4), 0xe0a23a, { rot: [Math.PI * 0.6, 0, 0], at: [0, 0.32, 0.13] }),
  ];
  for (const s of [-1, 1]) {
    g.push(piece(cone(0.035, 0.09, 4), DARKB, { rot: [0, 0, -s * 0.35], at: [s * 0.085, 0.455, 0] }));              // ear tufts
    g.push(piece(ball(0.1, 5, 4), DARKB, { scale: [0.3, 1.0, 0.75], at: [s * 0.14, 0.19, -0.01] }));                 // folded wings
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
    piece(ball(0.12, 7, 5), coat, { scale: [1.2, 0.85, 1], at: [0.02, 0.11, -0.3] }),                       // haunch
    piece(tube(0.03, 0.022, 0.42, 6), STRIPE, { rot: [Math.PI / 2, 0, 1.1], at: [0.17, 0.04, -0.3] }),      // tail, curled round
    piece(tube(0.035, 0.03, 0.2, 6), WHITEC, { rot: [Math.PI / 2, 0, 0.5], at: [0.1, 0.035, 0.2] }),        // front paws, out ahead
    piece(tube(0.035, 0.03, 0.2, 6), WHITEC, { rot: [Math.PI / 2, 0, 0.2], at: [0.03, 0.035, 0.26] }),
  ];
  group.add(mesh(merged(g), material));
  const head = new THREE.Group();
  head.position.set(-0.02, 0.2, 0.2);
  const h = [
    piece(ball(0.1, 8, 6), (x, y, z) => (z > 0.05 && y < 0.02 ? WHITEC : GREY), { scale: [1.05, 0.92, 0.95], at: [0, 0.06, 0.04] }),
    piece(ball(0.014, 5, 4), 0xd98a8a, { at: [0, 0.035, 0.135] }),
  ];
  for (const s of [-1, 1]) {
    h.push(piece(cone(0.04, 0.08, 4), GREY, { rot: [0, 0, -s * 0.25], at: [s * 0.062, 0.165, 0.02] }));
    h.push(piece(ball(0.016, 5, 3), 0x9ac26a, { scale: [1, 1, 0.5], at: [s * 0.042, 0.075, 0.125] }));
    h.push(piece(ball(0.008, 4, 3), 0x14100c, { at: [s * 0.042, 0.075, 0.136] }));
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
    piece(ball(0.075, 7, 5), hex, { scale: [1.1, 0.75, 1.3], at: [0, 0.055, -0.03] }),
    piece(ball(0.058, 7, 5), hex, { at: [0, 0.115, 0.075] }),
    piece(tube(0.016, 0.012, 0.16, 4), dark, { rot: [Math.PI / 2, 0, 1.2], at: [0.07, 0.025, -0.07] }),
  ];
  for (const s of [-1, 1]) {
    g.push(piece(cone(0.024, 0.045, 4), dark, { at: [s * 0.035, 0.175, 0.065] }));
    g.push(piece(ball(0.009, 4, 3), 0x14100c, { at: [s * 0.024, 0.125, 0.125] }));
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
    piece(ball(0.09, 7, 5), (x) => (x > 0.03 ? 0xd9c13a : 0xd23a2e), { scale: [1, 0.9, 1] }),
    piece(tube(0.006, 0.006, 0.05, 4), 0x5a3e24, { at: [0, 0.09, 0] }),
  ]);
}

// One geometry for every grain-store mouse: 0.16 m long, nose at +z.
export function mouseGeometry() {
  const FUR = 0xb3a79c;
  const g = [
    piece(ball(0.05, 6, 4), FUR, { scale: [0.85, 0.8, 1.3], at: [0, 0.04, 0] }),
    piece(cone(0.03, 0.06, 4), FUR, { rot: [Math.PI / 2, 0, 0], at: [0, 0.04, 0.085] }),
    piece(tube(0.005, 0.004, 0.14, 3), 0xd9a09a, { rot: [Math.PI / 2, 0, 0], at: [0, 0.02, -0.13] }),
  ];
  for (const s of [-1, 1]) {
    g.push(piece(ball(0.02, 4, 3), 0xc9aaa0, { scale: [1, 1, 0.4], at: [s * 0.03, 0.075, 0.04] }));
    g.push(piece(ball(0.007, 3, 2), 0x14100c, { at: [s * 0.02, 0.055, 0.085] }));
  }
  return merged(g);
}
