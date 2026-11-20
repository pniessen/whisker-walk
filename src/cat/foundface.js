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

const HEART_FRAME = 0xe2433a, HEART_RIM_LIGHT = 0xf7867a, HEART_RIM_DARK = 0xa8261f;
const HEART_LENS = 0xffb3c8, HEART_LENS_DEEP = 0xf27aa0, HEART_SHINE = 0xfffaf6;

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

// Paints every vertex of a geometry by colourOf(position, normal) -> hex.
function paint(geo, colourOf) {
  const p = geo.attributes.position, n = geo.attributes.normal, arr = new Float32Array(p.count * 3), c = new THREE.Color();
  const v = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.set(colourOf(v.fromBufferAttribute(p, i), m.fromBufferAttribute(n, i))).toArray(arr, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}
const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).getHex();

// Turns a piece built facing -z at the origin to its side's lens: yawed to
// the cheek and set at (px, py, pz).
const place = (geo, yaw, px, py, pz) => geo.rotateY(yaw).translate(px, py, pz);

// Heart-shaped Glasses: per side a red heart rim (a heart with a heart-shaped
// hole, bevelled by its colours: lit across the front and the top, dark
// round the back and the underside) round an opaque pink lens that deepens
// toward its point, with a white shine across its upper lobe; a little arched
// bridge between, yawed to the cheek like the Star Sunglasses. Lenses and
// shines are one vertex-coloured mesh, rims and bridge another.
function addHeartGlasses(head, { k, x, y, starZ }) {
  const frames = [], lenses = [], R = 0.084 * k, W = 0.017 * k, D = 0.012 * k;
  for (const side of [-1, 1]) {
    const yaw = -side * 0.4;
    const rim = heartShape(R);
    rim.holes.push(new THREE.Path(heartShape(R - W).getPoints(4).reverse()));
    const ring = new THREE.ExtrudeGeometry(rim, { depth: D, bevelEnabled: false, curveSegments: 4 });
    ring.translate(0, 0, -D / 2 + 0.004 * k).rotateY(Math.PI); // its front face toward -z
    paint(ring, (v, n) => (n.z < -0.5 ? lerpHex(HEART_FRAME, HEART_RIM_LIGHT, 0.1 + 0.6 * v.y / R) : n.z > 0.5 ? HEART_RIM_DARK : lerpHex(HEART_RIM_DARK, HEART_RIM_LIGHT, 0.5 + 0.5 * n.y)));
    frames.push(place(ring, yaw, side * x, y, starZ));
    const lens = new THREE.ShapeGeometry(heartShape(R - W * 0.6), 5);
    lens.rotateY(Math.PI).translate(0, 0, -0.006 * k);
    paint(lens, (v) => lerpHex(HEART_LENS_DEEP, HEART_LENS, 0.75 + v.y / R));
    lenses.push(place(lens, yaw, side * x, y, starZ));
    // the shine: a slanted lozenge on the upper lobe on the outer side
    const sh = new THREE.Shape();
    const sx = -side * 0.032 * k, sy = 0.022 * k;
    sh.absellipse(0, 0, 0.016 * k, 0.0065 * k, 0, Math.PI * 2, false, 0.6 * side);
    const shine = new THREE.ShapeGeometry(sh, 3).translate(sx, sy, 0);
    shine.rotateY(Math.PI).translate(0, 0, -0.007 * k);
    lenses.push(place(paint(shine, () => HEART_SHINE), yaw, side * x, y, starZ));
  }
  // the bridge: a short arch over the nose between the two hearts
  const bridge = new THREE.TorusGeometry(0.017 * k, 0.0055 * k, 4, 6, 2.2).rotateZ((Math.PI - 2.2) / 2);
  bridge.translate(0, y - 0.006 * k, starZ + 0.003);
  frames.push(paint(bridge, (v, n) => lerpHex(HEART_RIM_DARK, HEART_RIM_LIGHT, 0.5 + 0.5 * n.y)));
  // the lenses are glossier, and seen from both sides (dropped, from behind)
  for (const [list, part, extra] of [[frames, 'frames', { roughness: 0.6 }], [lenses, 'lenses', { roughness: 0.4, side: THREE.DoubleSide }]]) {
    const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), litMaterial(0xffffff, { vertexColors: true, ...extra }));
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
