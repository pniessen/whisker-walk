// =============================================================================
// THE TREEHOUSE VILLAGE: THE TREE CATS' PLACES (the plan and the drawing). Three friendly cats of their own live in the tree: one curled on a cushion on the Bakery deck's far corner, one
// sitting on the rail of the far platform watching the village, and one peeking out of a hollow at the oak's foot. This file is the plan (pure data: where,
// facing, coat) and the little drawing that goes with it: the cushion and the hollow, put into the village's own merged paint bucket at build (no mesh of its own, no collider, no
// perch, no ground strip: a cat here is scenery with a hello, never a platform and never in her way). The cats themselves are made by treehousecats.js (the walk's own cat model), a lazy file.
// Stage chunk code (treehousestagebranches.js); start-up never imports it. Draws no random number and reads no clock.
// =============================================================================
import * as THREE from 'three';
import * as P from './treehouseplan.js';
import { paint, placed, post } from './treehouseparts.js';

const L = P.TREE_LOOK;
const O = P.OAK;
const polar = (r, a) => ({ x: O.x + Math.sin(a) * r, z: O.z + Math.cos(a) * r, a });

// The hollow at the oak's foot, on the south-east side: a dark oval on the bark, the cat sitting in front of it with its back in the shade of the trunk.
export const HOLLOW = Object.freeze((() => { const a = 0.1; const edge = polar(O.r - 0.02, a); const cat = polar(O.r + 0.1, a); return { a, x: edge.x, z: edge.z, y: 0.5, rx: 0.4, ry: 0.55, cat: { x: cat.x, z: cat.z, y: 0 } }; })());
// The cushion on the Bakery deck's far (north-west) corner, clear of the stairs and the hut.
export const CUSHION = Object.freeze({ x: -11.5, z: 10.5, y: P.deckOf('bakery').y, r: 0.42, h: 0.12 });
// The rail of the far platform's north side, between the bridge and the corner lantern.
export const RAIL_SEAT = Object.freeze((() => { const k = P.deckOf('far'); return { x: k.x + 0.6, z: k.z - k.d / 2, y: k.y + P.RAIL_H + 0.07 }; })());

const YAW_TO = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz) + Math.PI; // the model faces -z (src/player.js)
// The cast: id, the coat (a low-poly look, treehousecatmesh.js), pose at rest, and where. The sitters face where they watch; the hollow's cat faces out of its hollow.
const LOOKS = Object.freeze({
  calico: Object.freeze({ base: 0xf0ead8, belly: 0xf8f4e8, accent: 0xd88030, patch: 0x2e2a2a, patches: true }),
  grey: Object.freeze({ base: 0x8f939c, belly: 0xe6e6ea, accent: 0x6a6d78, stripes: true }),
  siamese: Object.freeze({ base: 0xe8dcc8, belly: 0xf2ead9, accent: 0x4a3b32, points: true }),
});
export const CATS = Object.freeze([
  { id: 'cushion', look: LOOKS.calico, rest: 'nap', x: CUSHION.x, y: CUSHION.y + CUSHION.h, z: CUSHION.z, yaw: YAW_TO(CUSHION.x, CUSHION.z, -8, 12), scale: 1 },
  { id: 'rail', look: LOOKS.grey, rest: 'sit', x: RAIL_SEAT.x, y: RAIL_SEAT.y, z: RAIL_SEAT.z, yaw: Math.PI, scale: 0.85 },
  { id: 'hollow', look: LOOKS.siamese, rest: 'sit', x: HOLLOW.cat.x, y: HOLLOW.cat.y, z: HOLLOW.cat.z, yaw: YAW_TO(O.x, O.z, HOLLOW.cat.x, HOLLOW.cat.z), scale: 0.8 },
].map((c) => Object.freeze(c)));

// The drawing: the cushion (a round pad with a button) and the hollow (a dark oval on the bark). Into the village's own 'paint' bucket: no new mesh.
export function drawCatPlaces(kit, M) {
  const C = CUSHION;
  kit.put('paint', M.paint, paint(placed(new THREE.CylinderGeometry(C.r, C.r * 1.05, C.h, 10), C.x, C.y + C.h / 2, C.z), 0xc8483a, 1));
  kit.put('paint', M.paint, post(C.x, C.z, C.y + C.h, C.y + C.h + 0.03, 0.05, 0.03, 0xe8c04a, 5));
  const H = HOLLOW;
  const oval = new THREE.CircleGeometry(1, 12).scale(H.rx, H.ry, 1);
  oval.rotateY(H.a); // the disc's front looks out along the oak's radius
  kit.put('paint', M.paint, paint(placed(oval, H.x + Math.sin(H.a) * 0.03, H.y, H.z + Math.cos(H.a) * 0.03), 0x1e140c));
}
