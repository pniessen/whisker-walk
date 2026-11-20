// Found outfits: the feet slot, on the cat only (Hagrid wears no feet item).
// Every walk hides one find-only outfit (src/foundwear/ holds the records).
//
// THE TABLE: FOUND_FEET[id] = (legs, { plainPaw, mat, PAW_Y }) -> void, built
// as the shop's boots are (model.js, the feet chain):
//   legs         the four legs; each leg.userData.paw is its paw mesh
//   plainPaw(leg) swaps the toed foot for the plain paw (R8) and returns the
//                paw: call it first, so the piece wraps the shape it was made
//                for
//   mat(colour)  a lit material
//   PAW_Y        the paw's height on the leg, where a band or cuff is hung
// Recolour or rescale the paw, or add pieces to the leg. A paw made taller
// (scale.y > 1) is lifted after, with what hangs on the leg, so the sole
// stays on the ground (model.js, "A feet item that makes the paw taller").
//
// model.js tags each leg's paw, and what was added to the leg,
// userData.foundWear = id.
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

// The Puddle Wellies (the Park's): tall glossy yellow paws, taller than the
// Rain Boots (1.7 against 1.4), each with a red band round the sole, a red
// trim round its top and a red pull-tab at the back. The plain paw replaces
// the toed foot, so the paw adds no mesh; each leg's red trims are one mesh
// (the band, its top trim and its tab), the outfit's four meshes. The paw is
// painted: a sunny yellow, a soft pale shine high on its front, a deeper
// ochre toward the sole.
const WELLY = 0xf7c22e, WELLY_SHINE = 0xfff1a8, WELLY_DEEP = 0xd9a62a, WELLY_RED = 0xd8403a;
export const FOUND_FEET = Object.freeze({
  puddlewellies(legs, { plainPaw, PAW_Y }) {
    const red = litMaterial(WELLY_RED, { roughness: 0.5 });
    for (const leg of legs) {
      const paw = plainPaw(leg);
      paw.scale.set(1.12, 1.7, 1.12);
      paw.geometry.computeBoundingBox();
      const hb = paw.geometry.boundingBox.max, sc = paw.scale;
      const p = paw.geometry.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) / hb.x, y = p.getY(i) / hb.y, z = p.getZ(i) / hb.z;
        c.set(WELLY).lerp(new THREE.Color(WELLY_SHINE), Math.min(0.55, Math.max(0, 0.45 * y - 0.5 * z - 0.25 * x - 0.3))).lerp(new THREE.Color(WELLY_DEEP), Math.max(0, -y - 0.3)).toArray(col, i * 3);
      }
      paw.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      paw.material = litMaterial(0xffffff, { vertexColors: true, roughness: 0.45 });
      // Each red piece is sized from the paw's own box: the ellipse the scaled
      // paw makes at the piece's height, 2 mm out, so the red shows all round.
      // (measured at the piece's edge nearer the paw's middle, where it is widest)
      const ring = (dy, h) => {
        const level = Math.sqrt(Math.max(0, 1 - ((Math.abs(dy) - h / 2) / sc.y / hb.y) ** 2));
        return new THREE.CylinderGeometry(1, 1, h, 8).scale(hb.x * sc.x * level + 0.002, 1, hb.z * sc.z * level + 0.002).translate(0, dy, 0);
      };
      const top = hb.y * sc.y * 0.6, back = hb.z * sc.z * Math.sqrt(1 - 0.36);
      const tab = new THREE.BoxGeometry(0.012, 0.016, 0.006).translate(0, top + 0.008, back + 0.006);
      const trims = [ring(-0.03, 0.012), ring(top, 0.007), tab].map((g) => g.toNonIndexed());
      for (const g of trims) g.deleteAttribute('uv');
      const band = new THREE.Mesh(mergeGeometries(trims), red);
      band.position.set(paw.position.x, PAW_Y, paw.position.z);
      leg.add(band);
    }
  },
});
