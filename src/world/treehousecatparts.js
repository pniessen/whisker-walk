// =============================================================================
// THE TREEHOUSE VILLAGE: THE TREE CATS' PLACES (the plan and the drawing). Four friendly cats of their own live in the tree: one curled on a cushion on the Bakery deck's far corner, one
// sitting on the rail of the far platform watching the village, one on a limb of the great oak, and one peeking out of a hollow at the oak's foot. This file is the plan (pure data: where,
// facing, coat) and the little drawing that goes with it: the cushion, the limb and the hollow, put into the village's own merged paint bucket at build (no mesh of its own, no collider, no
// perch, no ground strip: a cat here is scenery with a hello, never a platform and never in her way). The cats themselves are made by treehousecats.js (the walk's own cat model), a lazy file.
// Stage chunk code (treehousestagebranches.js); start-up never imports it. Draws no random number and reads no clock.
// =============================================================================
import * as THREE from 'three';
import * as P from './treehouseplan.js';
import { paint, placed, post, beam } from './treehouseparts.js';

const L = P.TREE_LOOK;
const O = P.OAK;
const polar = (r, a) => ({ x: O.x + Math.sin(a) * r, z: O.z + Math.cos(a) * r, a });

// The oak's limb: a short branch that leaves the trunk toward the south-west at y 3.4 and rises a little, its far end 5 m out. The cat sits at 4.1 m along it.
export const LIMB = Object.freeze((() => {
  const a = -0.64;
  const from = polar(2.0, a); const to = polar(5.0, a); const seat = polar(4.1, a);
  return { a, from: { ...from, y: 3.35 }, to: { ...to, y: 3.7 }, thick: 0.4, seat: { x: seat.x, z: seat.z, y: 3.35 + (3.7 - 3.35) * ((4.1 - 2.0) / 3.0) + 0.2 } };
})());
// The hollow at the oak's foot, on the south-east side: a dark oval on the bark, the cat sitting in front of it with its back in the shade of the trunk.
export const HOLLOW = Object.freeze((() => { const a = 0.1; const edge = polar(O.r - 0.02, a); const cat = polar(O.r - 0.22, a); return { a, x: edge.x, z: edge.z, y: 0.5, rx: 0.4, ry: 0.55, cat: { x: cat.x, z: cat.z, y: 0 } }; })());
// The cushion on the Bakery deck's far (north-west) corner, clear of the stairs and the hut.
export const CUSHION = Object.freeze({ x: -11.5, z: 10.5, y: P.deckOf('bakery').y, r: 0.42, h: 0.12 });
// The rail of the far platform's north side, between the bridge and the corner lantern.
export const RAIL_SEAT = Object.freeze((() => { const k = P.deckOf('far'); return { x: k.x + 0.6, z: k.z - k.d / 2, y: k.y + P.RAIL_H + 0.07 }; })());

const YAW_TO = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz) + Math.PI; // the model faces -z (src/player.js)
// The cast, in the order the lower rungs drop them (the last first): id, the word's id, breed, a coat over it, pose at rest, and where.
export const CATS = Object.freeze([
  { id: 'cushion', breed: 'calico', coat: null, rest: 'nap', x: CUSHION.x, y: CUSHION.y + CUSHION.h, z: CUSHION.z, yaw: YAW_TO(CUSHION.x, CUSHION.z, -8, 12), scale: 1 },
  { id: 'rail', breed: 'persian', coat: { base: 0x8f939c, belly: 0xe6e6ea, accent: 0x6a6d78 }, rest: 'requestPet', x: RAIL_SEAT.x, y: RAIL_SEAT.y, z: RAIL_SEAT.z, yaw: Math.PI, scale: 0.85 },
  { id: 'limb', breed: 'tabby', coat: { base: 0xc27a3e, belly: 0xf1e2c4, accent: 0x8a4c20 }, rest: 'requestPet', x: LIMB.seat.x, y: LIMB.seat.y, z: LIMB.seat.z, yaw: YAW_TO(LIMB.seat.x, LIMB.seat.z, 0, 24), scale: 0.9 },
  { id: 'hollow', breed: 'siamese', coat: null, rest: 'requestPet', x: HOLLOW.cat.x, y: HOLLOW.cat.y, z: HOLLOW.cat.z, yaw: YAW_TO(O.x, O.z, HOLLOW.cat.x, HOLLOW.cat.z), scale: 0.8 },
].map((c) => Object.freeze(c)));

// The drawing: the cushion (a round pad with a button), the limb (a beam) and the hollow (a dark oval on the bark). Into the village's own 'paint' bucket: no new mesh.
export function drawCatPlaces(kit, M) {
  const C = CUSHION;
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(C.r, C.r * 1.05, C.h, 10), C.x, C.y + C.h / 2, C.z), 0xc8483a, 1));
  kit.put('paint', M.paint, post(C.x, C.z, C.y + C.h, C.y + C.h + 0.03, 0.05, 0.03, 0xe8c04a, 5));
  const f = LIMB.from; const t = LIMB.to;
  kit.put('paint', M.paint, beam(f.x, f.y, f.z, t.x, t.y, t.z, LIMB.thick, L.trunkDark, 2));
  kit.put('paint', M.paint, beam(t.x, t.y, t.z, t.x + Math.sin(LIMB.a - 0.4) * 0.7, t.y + 0.35, t.z + Math.cos(LIMB.a - 0.4) * 0.7, 0.16, L.trunkDark, 1)); // a twig at its tip
  const H = HOLLOW;
  const oval = new THREE.CircleGeometry(1, 12).scale(H.rx, H.ry, 1);
  oval.rotateY(H.a); // the disc's front looks out along the oak's radius
  kit.put('paint', M.paint, paint(placed(oval, H.x + Math.sin(H.a) * 0.03, H.y, H.z + Math.cos(H.a) * 0.03), 0x1e140c));
}
