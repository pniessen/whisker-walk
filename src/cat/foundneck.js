// Found outfits: the neck and collar slots, on the cat and on Hagrid the hen.
// Every walk hides one find-only outfit (src/foundwear/ holds the records).
//
// NECK. THE ANCHORS are addPrizeNeck's (model.js), the same the Streamer
// Scarf uses, so a found neck piece sits where it sits:
//   k        size (1 on the cat, 0.67 on Hagrid)
//   y, z     the neck seam's front, where a scarf's band sits
//   ringR    a band's radius round the neck (0.15 / 0.155)
//   ringBack how far a band is set back (+z) so its front lies on the throat
//            (the cat's NECK_RING_BACK.streamer; 0 on Hagrid)
//   tilt     NECK_RING_TILT (model.js): a band round the neck is tipped by
//            Math.PI / 2 - tilt, as the scarf's is
// Head frame: +y up, -z forward.
// A PIECE THAT GOES ROUND THE NECK is a THREE.TorusGeometry mesh: on Hagrid,
// model.js re-rings every torus round his leaning neck (ringTheNeck); the
// other pieces hang where they were built. Add meshes straight to `head`,
// never a group. On the cat they are carried on the neck as neckwear
// (animator.js fitNeck).
// THE TABLE: FOUND_NECKS[id] = (head, { k, y, z, ringR, ringBack, tilt })
// -> void.
//
// COLLAR. buildCollar (model.js) makes the ring for the cat and for Hagrid,
// then, for a FOUND_COLLARS style, colours it and calls its dress:
//   FOUND_COLLARS[style] = { ring, charmed, dress }
//   ring     the ring's colour (hex)
//   charmed  true when a charm hangs at the throat (wearkind.js isCharmed:
//            a cape's clasp is then left off under it)
//   dress(group, ring, { ringR, tubeR, charmPos }) -> void: adds the pieces,
//            either on `ring` in its local XY plane (they follow its tilt, as
//            the studs do) or on `group` at `charmPos` (a charm, facing -z).
//            Cat: ringR 0.15, tubeR 0.028; Hagrid: 0.135, 0.024 (his charms
//            are turned back to face forward after).
//
// model.js tags each mesh it adds through this file userData.foundWear = id
// (for a collar, the whole group, ring and all).
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
//
// wearkind.js imports this file, so its hasEntry is written out here.

export const FOUND_NECKS = Object.freeze({});
export const FOUND_COLLARS = Object.freeze({});

// The found neck piece, if `id` is one; nothing otherwise.
export function addFoundNeck(head, id, { k, y, z, ringR, ringBack = 0, tilt }) {
  if (typeof id === 'string' && Object.hasOwn(FOUND_NECKS, id)) FOUND_NECKS[id](head, { k, y, z, ringR, ringBack, tilt });
}
