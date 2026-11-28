// Her own custom cat's name tag on her own walk (cat builder). A ready-made
// cat gets nothing. Kept out of walk.js so it can be tested headless.
import { activeCat, ownRole } from '../customcats.js';
import { rankWord, RANK_KEYS } from '../wordset.js';
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
  const me = ownRole(state);
  cat.userData.customName = me.name;
  cat.userData.role = me.role; // an id (RANK_KEYS), never a word
  // her role's title line under the name, by rank id (the leader's tag goes on top, as a camp leader's does)
  const tag = makeNameTag(cat.userData.customName, { fit: true, sub: rankWord(me.role), top: me.role === RANK_KEYS.leader });
  if (!tag) return null;
  // a kit or apprentice is drawn smaller (catrole.js); the tag keeps its own size
  if (me.scale !== 1) {
    cat.scale.multiplyScalar(me.scale);
    cat.userData.roleScale = me.scale;
    tag.scale.divideScalar(me.scale);
  }
  tag.scale.multiplyScalar(OWN_TAG_SCALE);
  tag.material.depthTest = false;
  tag.material.depthWrite = false;
  tag.renderOrder = OWN_TAG_RENDER_ORDER;
  tag.visible = true;
  cat.add(tag);
  cat.userData.ownTag = tag; // kept upright through a fight's pitch and roll (game/avatar.js)
  return tag;
}
