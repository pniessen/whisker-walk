// Found outfits step 1, Task 7: putting on a find mid-walk.
//
// redressCat(cat, breed, accessories, opts = {}) -> cat (the same object)
//
// Rebuilds her own cat with a new outfit INSIDE the object the walk already
// holds, so every reference to it stays good: session.cat, a carried thing's
// holder (carryables.js, and the yarn ball through placeInMouth), the camera's
// target, a chat bubble's target. The new build is made by buildCat exactly as
// a fresh walk would make it (Hagrid keeps his own hen body: buildCat sends him
// to buildChicken), and its children are moved in.
//
// Kept: every direct child that is a Sprite or a Light. buildCat makes neither
// (test/redress.test.js proves it for every breed), so these are only what the
// walk added: her name tag (game/owntag.js), a chat bubble (chatbubble.js) and
// the dusk collar glow (render/dusk.js addCollarGlow). They go after the new
// parts, in the order they had.
//
// Thrown away: every other child, with its geometries and materials freed as
// endWalk frees them (a map named 'surface:...' is memoised and outlives the
// walk, so it is left alone). Hagrid's fight rig and the swim measure were made
// from the old build; they are forgotten (the rig's spare body freed) and made
// again from the new one the next time they are needed.
//
// userData: the new build's keys win (parts, base, breed); the walk's own keys
// (ownTag, custom, customName, ...) stay. Scale is the new build's (a builder
// cat's size). Position and rotation are untouched: she is where she stood.
//
// Perks read once at walk start (the Glow Collar's dusk light) are not re-read
// here: the glow, if she has one, is kept as it was for this walk.

import { buildCat } from './model.js';
import { disposeHenRig } from './henfight.js';

// Caches on cat.userData made from the old build's meshes.
const BUILD_CACHES = ['henRig', 'waterFit', 'suitTick', 'suitLive'];

const isKept = (o) => !!(o.isSprite || o.isLight);

function freeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.map && !m.map.name?.startsWith('surface:')) m.map.dispose();
        m.dispose();
      }
    }
  });
}

export function redressCat(cat, breed, accessories, opts = {}) {
  const fresh = buildCat(breed, accessories, opts);

  // the old build's caches first: the rig's spare body is freed against the
  // old parts, before they go
  if (cat.userData?.henRig) disposeHenRig(cat);

  const kept = [];
  for (const child of [...cat.children]) {
    if (isKept(child)) {
      kept.push(child);
      continue;
    }
    cat.remove(child);
    freeTree(child);
  }
  for (const o of kept) cat.remove(o);

  for (const child of [...fresh.children]) cat.add(child); // add() takes it off `fresh`
  for (const o of kept) cat.add(o);

  const runtime = { ...cat.userData };
  for (const k of BUILD_CACHES) delete runtime[k];
  cat.userData = { ...runtime, ...fresh.userData };
  cat.scale.copy(fresh.scale);
  const roleScale = cat.userData.roleScale; // a kit or apprentice stays smaller (game/owntag.js)
  if (typeof roleScale === 'number' && roleScale !== 1) cat.scale.multiplyScalar(roleScale);
  return cat;
}
