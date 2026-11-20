// The find card: "You found something to wear! ✨", her cat wearing it, and
// Wear it / Later. It opens over the pause overlay and pauses the walk as the
// crossing card does (game/crossing.js); either answer puts the pause card
// back and walks on. Back (ui/backstack.js 'find-later') and taking the
// pointer again (onLockChange) are Later. The outfit is already hers when the
// card shows (foundwear/play.js grantFind); the card only asks about putting
// it on now.
//
// Wear it puts it on (progression.equipAccessory) and dresses her cat in
// place (redressSessionCat), so the walk's references to her cat stay good:
// what she carries in her mouth (carryables.js, the found yarn ball) is a
// scene object placed at her mouth each frame, never a child of the cat, so
// neither the redress nor the card's pause and resume drops it.
//
// Nothing here is random or reads the clock.
import { CATALOG } from '../progression.js';
import { activeCat, scarKey } from '../customcats.js';
import { herCatPortrait } from '../thumbnails.js';
import { redressCat } from '../cat/redress.js';
import { assignShadowCastersFor, trimShadowCasters } from '../render/rig.js';
import { LADDER } from '../render/quality.js';
import { canWearNow } from '../foundwear/rules.js';
import { findCardHtml } from '../foundwear/play.js';
import { phrase } from '../clanphrases.js';
import { pauseCardFor } from './walk.js';

const SLOTS = ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet'];

// shadowMinPartNow(tier, rung) -> the shadow trim the walk is on now: the
// tier it was built at (s.tier), or the rung adaptive Auto has stepped down
// to since (game/adaptquality.js status.rung; rung 4 trims live), whichever
// trims more. A rung past the ladder (the 30 fps cap) is the floor rung.
export function shadowMinPartNow(tier, rung) {
  const built = tier?.shadowMinPart ?? 0;
  if (!Number.isInteger(rung) || rung < 0) return built;
  const live = LADDER[Math.min(rung, LADDER.length - 1)]?.shadowMinPart ?? 0;
  return Math.max(built, live);
}

// redressSessionCat(s, progression, { minPart }) -> her cat, dressed in what
// she has on now (cat/redress.js), with her builder coat and her scars as the
// walk built her. Then the walk's caster rule for her cat (walk.js runs
// assignShadowCasters over the scene once, at the build) and, on a rung that
// trims (minPart > 0), the small-parts trim, so her eyes and paws do not start
// casting again.
//
// A BORROWED thing on her (userData.borrowed: the Farm scarecrow's hat,
// farmanimals.js) is not hers: it is lifted off before the redress, so its
// geometry and material are never freed, and put back on the same part of the
// new build where it was. Her own hat under it stays hidden as long as she
// wears his (farmanimals.js poseJobs sees the new head and hides it).
export function redressSessionCat(s, progression, { minPart = 0 } = {}) {
  const cat = s?.cat;
  if (!cat) return null;
  const state = progression.state;
  const a = activeCat(state);
  const borrowed = liftBorrowed(cat);
  const eq = state.equipped ?? {};
  const accessories = {};
  for (const slot of SLOTS) accessories[slot] = eq[slot] ?? null;
  redressCat(cat, a.breed, accessories, { look: a.look, scars: progression.catScars(scarKey(state)) });
  for (const { obj, part } of borrowed) (cat.userData.parts?.[part] ?? cat).add(obj);
  assignShadowCastersFor(cat);
  if (minPart > 0) trimShadowCasters(oneChild(cat), minPart);
  return cat;
}

// Every borrowed thing on the cat, taken off, with the name of the part
// (cat.userData.parts) it was on, or null for the cat itself.
function liftBorrowed(cat) {
  const found = [];
  cat.traverse((o) => { if (o !== cat && o.userData?.borrowed) found.push(o); });
  const parts = cat.userData?.parts ?? {};
  return found.map((obj) => {
    const parent = obj.parent;
    const part = Object.keys(parts).find((k) => parts[k] === parent) ?? null;
    parent.remove(obj);
    return { obj, part };
  });
}

// trimShadowCasters works over a scene's top-level children; this is a scene
// of one, her cat, whose world matrices come from the real scene.
function oneChild(cat) {
  return { children: [cat], updateMatrixWorld: (force) => cat.updateMatrixWorld(force) };
}

// createFindCard(...) -> { show(s, id), wear(), later(), onLockChange(locked) }.
//   releaseControl  pauses the walk under the card (main.js: the ⏸ action)
//   resumeWalk      walks on after an answer
//   onLookChanged   after Wear it: her new look to the room and the cloud
//   shadowMinPart   (s) -> the trim the walk is on now (shadowMinPartNow)
//   getSound        the pause card's Sound and Music switches, as crossing.js
export function createFindCard({
  getSession, overlay, releaseControl, resumeWalk, progression, getIsTouch,
  onLookChanged = () => {}, portrait = herCatPortrait,
  shadowMinPart = (s) => shadowMinPartNow(s?.tier, null),
  redress = (s, p) => redressSessionCat(s, p, { minPart: shadowMinPart(s) }),
  catalog = CATALOG, getSound = () => null,
}) {
  function close(s) {
    overlay.innerHTML = pauseCardFor(s, getIsTouch(), getSound());
    s.findCard = null;
  }

  function show(s, id) {
    if (!s || s.findCard) return;
    const item = catalog.accessories?.[id];
    if (!item) return;
    const state = progression.state;
    const a = activeCat(state);
    const canWear = canWearNow(a.breed, item.slot);
    const catName = a.custom ? a.name : (CATALOG.cats[a.breed]?.name ?? a.name);
    s.findCard = { id };
    overlay.innerHTML = findCardHtml({
      title: phrase('wear.card.title'),
      name: item.name,
      // her cat wearing it; a cat who cannot wear it would not show it, so the emoji
      portrait: canWear ? portrait({ ...state, equipped: { ...state.equipped, [item.slot]: id } }) : null,
      emoji: item.emoji,
      canWear,
      catName,
    });
    releaseControl();
  }

  function wear() {
    const s = getSession();
    if (!s?.findCard) return;
    const id = s.findCard.id;
    const item = catalog.accessories?.[id];
    if (!item || !canWearNow(activeCat(progression.state).breed, item.slot)) return;
    progression.equipAccessory(id);
    redress(s, progression);
    onLookChanged();
    close(s);
    resumeWalk();
  }

  function later() {
    const s = getSession();
    if (!s?.findCard) return;
    close(s);
    resumeWalk();
  }

  function onLockChange(locked) {
    const s = getSession();
    if (locked && s?.findCard) close(s);
  }

  return { show, wear, later, onLockChange };
}
