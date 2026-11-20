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
import { hasEntry } from './wearkind.js';

export const FOUND_FACES = Object.freeze({});

// The found face piece, if `id` is one; nothing otherwise.
export function addFoundFace(head, id, { k, x, y, z, starZ, skull }) {
  if (hasEntry(FOUND_FACES, id)) FOUND_FACES[id](head, { k, x, y, z, starZ, skull });
}
