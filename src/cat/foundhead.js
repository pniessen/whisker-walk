// Found outfits: the head slot, on Hagrid the hen. Every walk hides one
// find-only outfit (src/foundwear/ holds the records). On the cat, a found
// hat is a hats.js BUILD entry like any other hat (one mesh, tagged
// userData.hat), so this file is Hagrid's alone.
//
// THE ANCHORS are addPrizeHead's (model.js), the same that his shop hats and
// his visit-prize hats use, so a found hat sits where they sit:
//   k     size (0.82 on Hagrid)
//   y     where a hat rests, on top of his comb (0.2)
//   rx    the head's half-width, across (0.09)
//   rz    the head's half-depth, front to back (0.06)
//   ringY where a ring sits, round the comb and on the skull (0.115)
// Head frame: +y up, -z forward (his beak).
//
// THE TABLE: FOUND_HEN_HEADS[id] = (head, { k, y, rx, rz, ringY }) -> void,
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
import { litMaterial } from '../render/materials.js';
import { hasEntry } from './wearkind.js';

// Hagrid's brimmed hats are the simple versions of src/cat/hats.js's, built
// as addPrizeHead's hats are (round primitives at his anchors: a brim at about
// y - 0.01, the crown above it, round his comb). 3 or 4 meshes each.
const piece = (geo, hex, x, y, z, rx = 0) => {
  const m = new THREE.Mesh(geo, litMaterial(hex));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
};
const cyl = (rTop, rBot, h, sides = 10) => new THREE.CylinderGeometry(rTop, rBot, h, sides);
const dome = (r, sx, sy, sz) => { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(sx, sy, sz); return g; };
const ring = (r, tube) => { const g = new THREE.TorusGeometry(r, tube, 4, 12); g.rotateX(Math.PI / 2); return g; };

// A flat five-armed star lying on the skull at `at`, facing out along `n`.
const flatStar = (outer, inner, depth) => {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer, a = (i / 10) * Math.PI * 2;
    if (i) sh.lineTo(Math.sin(a) * r, Math.cos(a) * r); else sh.moveTo(0, r);
  }
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
};
const HEN_SKULL_R = [0.13, 0.1365, 0.13]; // src/cat/hen.js HEN_SKULL
const onSkull = (m, dir, lift) => {
  const u = new THREE.Vector3(...dir).normalize();
  const n = new THREE.Vector3(u.x / HEN_SKULL_R[0], u.y / HEN_SKULL_R[1], u.z / HEN_SKULL_R[2]).normalize();
  m.position.set(u.x * HEN_SKULL_R[0], u.y * HEN_SKULL_R[1], u.z * HEN_SKULL_R[2]).addScaledVector(n, lift);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return m;
};

export const FOUND_HEN_HEADS = Object.freeze({
  // the beanie's puffed crown leaning forward, a short stiff peak, a button
  paperboycap: (head, { k, y }) => {
    head.add(piece(dome(0.1 * k, 1, 0.62, 1.1), 0x7d6b58, 0, y - 0.012, -0.004));
    head.add(piece(new THREE.BoxGeometry(0.1 * k, 0.008, 0.05 * k), 0x4e4136, 0, y - 0.03, -0.1 * k, 0.25));
    head.add(piece(dome(0.012 * k, 1, 0.8, 1), 0x4e4136, 0, y + 0.045 * k, -0.01));
  },
  // a round soft crown, a sloping brim all round, one stitched ring on it
  buckethat: (head, { k, y }) => {
    head.add(piece(cyl(0.08 * k, 0.1 * k, 0.075), 0xe9c46a, 0, y + 0.025, 0));
    head.add(piece(cyl(0.1 * k, 0.15 * k, 0.02), 0xe9c46a, 0, y - 0.015, 0));
    head.add(piece(ring(0.125 * k, 0.004), 0xc89b3c, 0, y - 0.003, 0));
  },
  // a flat white top, a navy band, a short black peak, a gold badge
  sailorcap: (head, { k, y }) => {
    head.add(piece(cyl(0.09 * k, 0.088 * k, 0.05), 0xf2f2ee, 0, y + 0.03, 0));
    head.add(piece(cyl(0.094 * k, 0.096 * k, 0.026), 0x24365c, 0, y - 0.002, 0));
    head.add(piece(new THREE.BoxGeometry(0.07 * k, 0.006, 0.04 * k), 0x1c1c22, 0, y - 0.012, -0.1 * k, 0.2));
    head.add(piece(dome(0.009 * k, 1, 1, 0.5), 0xf2c14e, 0, y - 0.002, -0.098 * k));
  },
  // a wide straw brim, a round crown, a red band
  strawhat: (head, { k, y }) => {
    head.add(piece(cyl(0.16 * k, 0.16 * k, 0.01, 12), 0xe3c26b, 0, y - 0.015, 0));
    head.add(piece(cyl(0.075 * k, 0.085 * k, 0.07), 0xcfa94e, 0, y + 0.022, 0));
    head.add(piece(cyl(0.087 * k, 0.088 * k, 0.016), 0xc0392b, 0, y - 0.002, 0));
  },
  // a small orange star lying on the right of his head, a pale dot in its middle
  starfishclip: (head, { k }) => {
    const star = onSkull(piece(flatStar(0.036 * k, 0.015 * k, 0.006), 0xf28a3c, 0, 0, 0), [0.55, 0.8, -0.25], -0.001);
    head.add(star);
    head.add(onSkull(piece(dome(0.01 * k, 1, 1, 0.5), 0xf7c08a, 0, 0, 0), [0.55, 0.8, -0.25], 0.005));
  },
  // a russet feather standing up on the left of his head, leaning back, a pale quill
  featherplume: (head, { k }) => {
    // pivot at the skull, axis up the skull's normal, then leant back (+z) 0.3 rad
    const lean = (m, dir) => {
      onSkull(m, dir, 0);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
        .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3));
      return m;
    };
    const quill = new THREE.CylinderGeometry(0.003, 0.004, 0.13 * k, 4);
    quill.translate(0, 0.065 * k, 0);
    head.add(lean(piece(quill, 0xf2e6c8, 0, 0, 0), [-0.45, 0.85, 0.3]));
    const vane = dome(0.022 * k, 0.45, 3.2, 0.12); vane.translate(0, 0.085 * k, 0);
    head.add(lean(piece(vane, 0xa0522d, 0, 0, 0), [-0.45, 0.85, 0.3]));
  },
  // a flat top, straight sides, a flat brim, a red band with a white stripe
  stripedboater: (head, { k, y }) => {
    head.add(piece(cyl(0.125 * k, 0.125 * k, 0.01, 12), 0xe8cf86, 0, y - 0.015, 0));
    head.add(piece(cyl(0.08 * k, 0.08 * k, 0.07), 0xe8cf86, 0, y + 0.022, 0));
    head.add(piece(cyl(0.083 * k, 0.083 * k, 0.02), 0xe2433a, 0, y - 0.002, 0));
    head.add(piece(cyl(0.0835 * k, 0.0835 * k, 0.006), 0xf5f5f5, 0, y - 0.002, 0));
  },
});

// Hagrid's found hat, if `id` is one; nothing otherwise.
export function addFoundHenHead(head, id, { k, y, rx, rz, ringY = y }) {
  if (hasEntry(FOUND_HEN_HEADS, id)) FOUND_HEN_HEADS[id](head, { k, y, rx, rz, ringY });
}
