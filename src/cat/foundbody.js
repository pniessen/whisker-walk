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

export const FOUND_BODY = Object.freeze({});
export const FOUND_FLOATS = Object.freeze({});
