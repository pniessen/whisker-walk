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

// The Puddle Wellies (the Park's): tall yellow paws, taller than the Rain
// Boots (1.5 against 1.4), each with a red band at the sole. The plain paw
// replaces the toed foot, so the paw adds no mesh: the four bands are the
// outfit's four meshes.
export const FOUND_FEET = Object.freeze({
  puddlewellies(legs, { plainPaw, mat, PAW_Y }) {
    const red = mat(0xd8403a);
    for (const leg of legs) {
      const paw = plainPaw(leg);
      paw.material = mat(0xf5c842);
      paw.scale.set(1.15, 1.5, 1.15);
      // The band is sized from the paw's own box: the ellipse the scaled paw
      // makes at the band's top edge, 2 mm out, so the red shows all round it.
      paw.geometry.computeBoundingBox();
      const hb = paw.geometry.boundingBox.max, sc = paw.scale, drop = 0.03 - 0.006;
      const level = Math.sqrt(Math.max(0, 1 - (drop / sc.y / hb.y) ** 2));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.012, 8), red);
      band.scale.set(hb.x * sc.x * level + 0.002, 1, hb.z * sc.z * level + 0.002);
      band.position.set(paw.position.x, PAW_Y - 0.03, paw.position.z);
      leg.add(band);
    }
  },
});
