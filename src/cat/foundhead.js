// Found outfits: the head slot, on Hagrid the hen. Every walk hides one
// find-only outfit (src/foundwear/ holds the records). On the cat, a found
// hat is a hats.js BUILD entry like any other hat (one mesh, tagged
// userData.hat), so this file is Hagrid's alone.
//
// THE ANCHORS are addPrizeHead's (model.js), passed as his shop and
// visit-prize hats get them ({ k 0.82, y 0.2, rx 0.09, rz 0.06, ringY 0.115 }).
// The found hats do not need them: each is the cat's own hat carried onto his
// skull (henHat, below), so it lies on his head as it lies on hers.
// Head frame: +y up, -z forward (his beak).
//
// THE TABLE: FOUND_HEN_HEADS[id] = (head, anchors) -> void, adding its meshes
// to `head`. model.js tags each one userData.foundWear = id.
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
import { buildHat } from './hats.js';
import { SKULL } from './torso.js';
import { HEN_SKULL } from './hen.js';
import { hasEntry } from './wearkind.js';

// Hagrid wears the cat's own found hats (hats.js, the simple build: one
// vertex-coloured mesh), carried from the cat's skull onto his: each axis
// scaled by the ratio of the two skulls' radii, so a brim or a band draped on
// the cat's skull lies on his. His comb stands 4 cm above his skull, so what
// stands high on the cat's head is raised more: a crown by `lift` metres,
// easing in between LIFT_FROM and LIFT_TO (the cat's head-local height), so
// its top stays flat; a cap (`dome`) into a round dome `lift` high in the
// middle and none at CAP_R out. The rim stays on his head, the comb is inside
// the hat. A brimmed hat that the cat wears set back (off her eyes) is built
// centred for him (buildHat centred), over the whole comb. A clip lies on his skull unraised.
const CAT_R = SKULL.SCALE.map((s) => SKULL.R * s);
const RATIO = HEN_SKULL.map((r, i) => r / CAT_R[i]);
const LIFT_FROM = 0.168, LIFT_TO = 0.2, CAP_R = 0.105;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function henHat(id, lift = 0, dome = false) {
  return (head) => {
    const hat = buildHat(id, { simple: true, centred: true });
    const p = hat.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * RATIO[0], y = p.getY(i), z = p.getZ(i) * RATIO[2];
      const up = dome ? Math.max(0, 1 - (x * x + z * z) / (CAP_R * CAP_R)) : smooth(LIFT_FROM, LIFT_TO, y);
      p.setXYZ(i, x, y * RATIO[1] + lift * up, z);
    }
    hat.geometry.computeVertexNormals();
    head.add(hat);
  };
}
const CAP = 0.056, CROWN = 0.025;

export const FOUND_HEN_HEADS = Object.freeze({
  acorncap: henHat('acorncap', CAP, true),
  paperboycap: henHat('paperboycap', CAP, true),
  buckethat: henHat('buckethat', CROWN),
  sailorcap: henHat('sailorcap', CROWN),
  strawhat: henHat('strawhat', CROWN),
  stripedboater: henHat('stripedboater', CROWN),
  starfishclip: henHat('starfishclip'),
  featherplume: henHat('featherplume'),
  tradercap: henHat('tradercap', CAP, true),
  keepercap: henHat('keepercap', CAP, true),
  // a gift outfit (src/foundwear/gifts.js), worn as the found hats are
  partyhat: henHat('partyhat', CROWN),
  birthdayhat: henHat('birthdayhat', CROWN),
});

// Hagrid's found hat, if `id` is one; nothing otherwise.
export function addFoundHenHead(head, id, { k, y, rx, rz, ringY = y }) {
  if (hasEntry(FOUND_HEN_HEADS, id)) FOUND_HEN_HEADS[id](head, { k, y, rx, rz, ringY });
}
