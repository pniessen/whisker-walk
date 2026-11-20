// Found outfits: the face slot, on the cat and on Hagrid the hen. Every walk
// hides one find-only outfit (src/foundwear/ holds the records).
//
// THE ANCHORS are addPrizeFace's (model.js), the same the Star Sunglasses
// use, so a found face piece sits where they sit. One builder serves both:
//   k      size (1 on the cat, 0.75 on Hagrid)
//   x      an eye's distance from the midline (0.083 / 0.09)
//   y      the eyes' height (0.03 / 0.03)
//   z      the face's front (-0.17 / -0.1)
//   starZ  where a lens sits, just ahead of the eyes (-0.19 / -0.112)
//   skull  the skull's radii [x, y, z], to lay a piece on the cheek
//          ([0.21, 0.193, 0.1995] / [0.13, 0.13, 0.13]); k === 1 is the cat
// Head frame: +y up, -z forward.
//
// THE TABLE: FOUND_FACES[id] = (head, { k, x, y, z, starZ, skull }) -> void,
// adding its meshes to `head`. model.js tags each one userData.foundWear = id.
//
// THE RULES every found outfit keeps (test/foundwearfit.test.js checks them
// for every record in src/foundwear/):
//   * it only looks: no perk. The perks on shop ids ('backpack', 'booties',
//     'bandana', the Glow Collar) stay on those ids alone;
//   * worn, it adds at most 4 meshes to a cat, full and simple, and at most
//     900 triangles full, 450 simple (a coat shell: no more than the Striped
//     Sweater; a pack: 1200 full, 600 simple). On Hagrid, at most 4 meshes;
//   * no material is emissive, and no colour is the yarn ball's 0x5b7fc7 or a
//     treasure's 0xf25c8a: on the walk it must never read as either;
//   * nothing of it goes into the ground, standing, sitting or napping;
//   * nothing here throws its own dice or reads the clock (no Math.random,
//     walkRng, Date.now or performance.now): two players see the same thing;
//   * every mesh model.js adds through this file is tagged
//     userData.foundWear = id (model.js tagFound), so the ground look
//     (src/foundwear/display.js wornPieces) is made from the worn pieces.
// An id is 3 to 16 lowercase letters (the colony server's check), the
// record's in src/foundwear/, and never changes once shipped. An unknown id,
// or anything that is not a string, adds nothing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { hasEntry } from './wearkind.js';

const HEART_FRAME = 0xe2433a;
const HEART_LENS = 0xffb3c8;

// A flat heart, `r` its half-width, centred on its bounding box, the point
// down: two arcs (the lobes, radius a, centres (+-0.8a, 0)) meeting at the
// cleft, and a point 1.6a below the lobes' centres, reached by a straight
// line tangent to each lobe.
function heartShape(r) {
  const a = r / 1.8, cx = 0.8 * a, tip = 1.6 * a, lift = 0.3 * a;
  const d = Math.hypot(cx, tip);
  const t0 = Math.atan2(-tip, -cx) + Math.acos(a / d); // tangent point on the right lobe
  const cleft = Math.atan2(0.6 * a, -cx);               // the cleft, seen from the right lobe
  const shape = new THREE.Shape();
  shape.moveTo(0, -tip + lift);
  shape.lineTo(cx + a * Math.cos(t0), a * Math.sin(t0) + lift);
  shape.absarc(cx, lift, a, t0, cleft, false);
  shape.absarc(-cx, lift, a, Math.PI - cleft, Math.PI - t0, false);
  shape.closePath();
  return shape;
}

// One heart, extruded a hair (like starGeometry), centred in depth, coloured
// per vertex, then yawed and set at (px, py, pz). dz moves it along its own
// facing before the yaw.
function heartGeo(r, depth, hex, dz, yaw, px, py, pz) {
  const geo = new THREE.ExtrudeGeometry(heartShape(r), { depth, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2 + dz);
  geo.rotateY(yaw);
  geo.translate(px, py, pz);
  return colour(geo, hex);
}

function colour(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Heart-shaped Glasses: per side a red heart frame with a slightly smaller
// pink lens in front, yawed to the cheek like the Star Sunglasses; a red bridge
// between. Lenses are one vertex-coloured mesh, frames and bridge another.
function addHeartGlasses(head, { k, x, y, starZ }) {
  const frames = [], lenses = [];
  for (const side of [-1, 1]) {
    const yaw = -side * 0.4;
    frames.push(heartGeo(0.082 * k, 0.012 * k, HEART_FRAME, 0.007 * k, yaw, side * x, y, starZ));
    lenses.push(heartGeo(0.066 * k, 0.014 * k, HEART_LENS, 0, yaw, side * x, y, starZ));
  }
  const bridge = new THREE.BoxGeometry(x * 0.5, 0.01 * k, 0.01 * k).toNonIndexed();
  bridge.translate(0, y, starZ + 0.004);
  frames.push(colour(bridge, HEART_FRAME));
  for (const [list, part] of [[frames, 'frames'], [lenses, 'lenses']]) {
    const mesh = new THREE.Mesh(mergeGeometries(list), litMaterial(0xffffff, { vertexColors: true }));
    mesh.userData.heartPart = part;
    head.add(mesh);
  }
}

export const FOUND_FACES = Object.freeze({
  heartglasses: addHeartGlasses,
});

// The found face piece, if `id` is one; nothing otherwise.
export function addFoundFace(head, id, { k, x, y, z, starZ, skull }) {
  if (hasEntry(FOUND_FACES, id)) FOUND_FACES[id](head, { k, x, y, z, starZ, skull });
}
