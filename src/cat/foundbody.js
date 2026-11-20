// Found outfits: the body and back slots, on the cat only (Hagrid wears no
// body or back item). Every walk hides one find-only outfit (src/foundwear/
// holds the records).
//
// BODY. FOUND_BODY[id] is one of:
//   { kind: 'cape', colour, accent, paint? }
//     a cloak on the back, built by model.js capeOn as the Hero Cape is: the
//     cloth (stand and sit) and its throat clasp and bands (accent: the
//     clasp's colour). paint(a, s) -> hex colours the cloth: a runs across it
//     (-1 one flank, 0 the spine, +1 the other), s along it (0 at the neck,
//     1 at the hem); without it the cloth is plain `colour`;
//   { kind: 'shell', colour, paint? }
//     a coat cut from the torso, built by model.js coatShell as the sweater
//     is. paint(ux, uy, uz) -> hex colours each vertex by its unit direction
//     on the torso (geo.userData.unit: +y up, -z the chest); without it the
//     coat is plain `colour`.
// The kind is wearkind.js bodyKind's answer, so the fur it covers, a pack
// resting on it and the hood all make room as for the shop's.
//
// BACK, FLOATS. FOUND_FLOATS[id] = (kit) -> void, something floating over the
// cat on strings like the balloons. kit is model.js's own balloon kit:
//   onBack(x, y, z)        [x, y, z]: a point on the back (cat frame), moved
//                          from where it sat on the old torso onto this one
//   floatOn(piece, tie)    hangs `piece` on the cat, floating from `tie`
//   floatString(tie, top, r) a string from `tie` up to `top`
//   ball(r, colour, sx, sy, sz, wSeg, hSeg), mat(colour)
// (animator.js floatBalloons keeps each floating piece upright over its tie.)
// A found PACK is not here: it is a backitems.js BACK_ITEM_IDS entry, built
// by buildBackItem like the Tiny Backpack (its meshes carry userData.backItem).
//
// model.js tags each mesh it adds through this file userData.foundWear = id.
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

// The Doormat Cape: coir, a dark border down the flanks (|a| > 0.85) and at
// the hem (s > 0.88), and a bristle fleck on every third grid vertex, 15 %
// darker. The fleck is counted in the full grid's steps (24 across, 20 along),
// so the simple cloth, which has every other vertex, is flecked as the same
// cloth. Counting from a and s keeps it the same on the stand and sit cloths.
const COIR = 0xb8864a, COIR_BORDER = 0x6b4a2a;
const COIR_FLECK = new THREE.Color(COIR).multiplyScalar(0.85).getHex();
function doormatPaint(a, s) {
  if (Math.abs(a) > 0.85 || s > 0.88) return COIR_BORDER;
  return (Math.round((a + 1) * 12) + 2 * Math.round(s * 20)) % 3 === 0 ? COIR_FLECK : COIR;
}

// The Beach-towel Cape: broad stripes along s, three colours, six bands.
const TOWEL_STRIPES = [0xf28a3c, 0xf7e7c6, 0x2fa6a0];
const towelPaint = (a, s) => TOWEL_STRIPES[Math.floor(s * 6) % 3];

// The Fisherman's Jumper: a cream coat with a darker centre cable and two
// side cables along the back, and ribbing at the two ends of the torso.
const JUMPER = 0xece3cf, JUMPER_KNIT = 0xd6cbb2;
function jumperPaint(ux, uy, uz) {
  const cable = Math.abs(ux) < 0.12 || Math.abs(Math.abs(ux) - 0.4) < 0.08;
  const ribbing = uz > 0.85 || uz < -0.75;
  return cable || ribbing ? JUMPER_KNIT : JUMPER;
}

export const FOUND_BODY = Object.freeze({
  doormatcape: Object.freeze({ kind: 'cape', colour: COIR, accent: COIR_BORDER, paint: doormatPaint }),
  beachtowelcape: Object.freeze({ kind: 'cape', colour: 0xf28a3c, accent: 0xf2c14e, paint: towelPaint }),
  fishermansjumper: Object.freeze({ kind: 'shell', colour: JUMPER, paint: jumperPaint }),
});
// The Kite-tail Ribbon: a white string tied at the root of the tail (as the
// Tail Balloon's is), floating up and back, with four bows spaced along it. A
// bow is two flattened cones meeting at a knot on the string; the four are one
// vertex-coloured mesh, built where they hang (its position stays at the
// origin, floatOn keeps it over the tie). Under the whole-cat thumbnail's top.
const KITE_BOWS = Object.freeze([0xe2433a, 0xf7c93b, 0x4eb86a, 0xf08a2c]);
function kiteTail({ onBack, floatOn, floatString }) {
  const foot = new THREE.Vector3(...onBack(0, 0.5, 0.31)), top = new THREE.Vector3(0, 0.86, 0.44);
  floatString(foot, top, 0.003);
  const parts = [];
  KITE_BOWS.forEach((hex, i) => {
    const at = foot.clone().lerp(top, 0.25 + 0.2 * i);
    for (const side of [-1, 1]) {
      const wing = new THREE.ConeGeometry(0.02, 0.05, 6, 1);
      wing.rotateZ(side * Math.PI / 2);          // the point toward the knot, the wide end out
      wing.scale(1, 1, 0.3);                     // flattened
      wing.translate(side * 0.025 + at.x, at.y, at.z);
      wing.deleteAttribute('uv');
      parts.push(paintedGeo(wing, () => hex));
    }
  });
  floatOn(new THREE.Mesh(mergeGeometries(parts), litMaterial(0xffffff, { vertexColors: true })), foot);
}

// The Candyfloss Puff: a paper stick on a string from the back up to a pink
// cloud (four overlapping balls, one vertex-coloured mesh) over the shoulders,
// as the Party Balloon floats.
const FLOSS = 0xf7b6d2, FLOSS_LUMP = 0xf2a0c0, FLOSS_STICK = 0xf5f0e0;
function candyfloss({ onBack, floatOn, floatString }) {
  const tie = new THREE.Vector3(...onBack(0.05, 0.6, 0.2)), top = new THREE.Vector3(0.05, 0.86, 0.2);
  floatString(tie, top, 0.0035).material = litMaterial(FLOSS_STICK);
  const parts = [[0, 0, 0, 0.06, FLOSS], [-0.04, 0.005, 0, 0.05, FLOSS_LUMP], [0.04, 0.005, 0, 0.05, FLOSS_LUMP], [0, -0.045, 0, 0.045, FLOSS_LUMP]]
    .map(([x, y, z, r, hex]) => {
      const ball = new THREE.SphereGeometry(r, 8, 6);
      ball.translate(x, y, z);
      ball.deleteAttribute('uv');
      return paintedGeo(ball, () => hex);
    });
  const puff = new THREE.Mesh(mergeGeometries(parts), litMaterial(0xffffff, { vertexColors: true }));
  puff.name = 'candyflosspuff';
  puff.position.set(0.05, 0.95, 0.2);
  floatOn(puff, tie);
}
export const FOUND_FLOATS = Object.freeze({ kitetailribbon: kiteTail, candyflosspuff: candyfloss });

function paintedGeo(geo, hexOf) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) c.setHex(hexOf(p.getX(i), p.getY(i), p.getZ(i))).toArray(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// buildFoldedJumper() -> one vertex-coloured mesh named 'wear:fishermansjumper',
// the jumper's ground look: a folded square about 24 x 5 x 18 cm (its cables
// along the length, its ribbing along one edge) with two sleeves folded
// across the top, 224 triangles, painted as the coat is (jumperPaint). Built
// about its own centre; seatDisplay stands it on the ground.
export function buildFoldedJumper() {
  const W = 0.24, H = 0.05, D = 0.18;
  const fold = new THREE.BoxGeometry(W, H, D, 8, 1, 4); // 176
  paintedGeo(fold, (x, y, z) => jumperPaint(x / (W / 2) * 0.5, y, z / (D / 2)));
  const parts = [fold];
  for (const z of [-0.035, 0.035]) {
    const sleeve = new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6, 1); // 24
    sleeve.rotateZ(Math.PI / 2);
    sleeve.translate(0, H / 2 + 0.014, z);
    paintedGeo(sleeve, (x) => jumperPaint(0.5, 0, x / 0.1));
    parts.push(sleeve);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), litMaterial(0xffffff, { vertexColors: true }));
  mesh.name = 'wear:fishermansjumper';
  return mesh;
}
