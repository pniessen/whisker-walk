// Her own custom cat's name tag on her own walk (cat builder). A ready-made
// cat gets nothing. Kept out of walk.js so it can be tested headless.
import { activeCat, ownTagName } from '../customcats.js';
import { makeNameTag } from '../nametag.js';

// Smaller than a co-walker's tag: hers is on screen the whole walk, right
// above the cat the camera follows (a co-walker's comes and goes).
export const OWN_TAG_SCALE = 0.75;
// Drawn after everything else, with no depth test, so a tall hat (the top
// hat) can never cut through the letters.
export const OWN_TAG_RENDER_ORDER = 999;

// Marks `cat` as her custom cat (userData.custom / customName) and gives it
// its tag. Returns the tag (null for a ready-made cat, or with no document).
export function attachOwnTag(cat, state) {
  const active = activeCat(state);
  if (!cat || !active.custom) return null;
  cat.userData.custom = active.custom;
  cat.userData.customName = ownTagName(state);
  const tag = makeNameTag(cat.userData.customName, { fit: true });
  if (!tag) return null;
  tag.scale.multiplyScalar(OWN_TAG_SCALE);
  tag.material.depthTest = false;
  tag.material.depthWrite = false;
  tag.renderOrder = OWN_TAG_RENDER_ORDER;
  tag.visible = true;
  cat.add(tag);
  cat.userData.ownTag = tag; // kept upright through a fight's pitch and roll (game/avatar.js)
  return tag;
}
