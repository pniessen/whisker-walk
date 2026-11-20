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
import { hasEntry } from './wearkind.js';

export const FOUND_HEN_HEADS = Object.freeze({});

// Hagrid's found hat, if `id` is one; nothing otherwise.
export function addFoundHenHead(head, id, { k, y, rx, rz, ringY = y }) {
  if (hasEntry(FOUND_HEN_HEADS, id)) FOUND_HEN_HEADS[id](head, { k, y, rx, rz, ringY });
}
