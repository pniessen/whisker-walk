// Cat two: which cat it is, and the mover that walks it.
//
// Cat two is another cat of the household's save (one save, two cats: the spec's
// option A): a ready-made cat the save has bought, or one of the five cats
// made in the builder, never the cat cat one is. With only one cat in the
// save, a loaner of a different breed stands in. It is drawn the way every
// co-walker is (a simple cat, src/remotecats.js) and walked by a headless
// player (src/player.js), so its collisions, water, hops and skills are cat
// one's own code.
import * as THREE from 'three';
import { createPlayer, zoomTuning, canSwim } from '../player.js';
import { PERSONALITIES } from '../cat/brain.js';
import { placePace, placeFloat } from '../placephysics.js';
import { activeCat, sanitizeCustomCats, presetFor } from '../customcats.js';
import { sanitizeOutfits, sameWear, wornNow } from '../outfits.js';

export const SECOND_ID = 'local:2'; // a remote's id; nothing ever sends it anywhere
const LOANERS = ['siamese', 'black', 'calico', 'persian', 'mainecoon', 'tabby'];

const readyMade = (catalog, id) => Object.hasOwn(catalog.cats, id) && id !== 'hagrid' && Object.hasOwn(PERSONALITIES, id);

/**
 * The saved outfit cat two puts on: one of the household's own (state.outfits, never a new one),
 * the one this device's couch settings name (`outfit`: its index, or -1 for plain), else the first
 * that cat one is not wearing. Returns a wear map or null.
 */
export function outfitFor(state, catalog, index) {
  const all = sanitizeOutfits(state?.outfits, catalog);
  if (index === -1 || all.length === 0) return null;
  if (Number.isInteger(index) && all[index]) return all[index].wear;
  const mine = wornNow(state?.equipped, catalog);
  return (all.find((o) => !sameWear(o.wear, mine)) ?? all[0]).wear;
}

/** The cat that walks as cat two: { key, breed, name, look, wear } for the save `state` (and the game's CATALOG, which main hands in); `outfit` is the couch setting. */
export function pickSecond(state, catalog, outfit) {
  const mine = activeCat(state);
  const mineKey = mine.custom ?? mine.breed;
  const unlocked = Array.isArray(state?.unlocked?.cats) ? state.unlocked.cats : [];
  const options = [];
  for (const id of unlocked) if (readyMade(catalog, id) && id !== mineKey) options.push({ key: id, breed: id, name: catalog.cats[id].name, look: null });
  for (const c of sanitizeCustomCats(state?.customCats)) {
    if (c.id !== mineKey) options.push({ key: c.id, breed: presetFor(c.personality), name: c.name, look: c.look });
  }
  const picked = options[0] ?? (() => {
    const id = LOANERS.find((l) => l !== mineKey);
    return { key: id, breed: id, name: catalog.cats[id].name, look: null };
  })();
  return { ...picked, wear: outfitFor(state, catalog, outfit) };
}

/** The profile remotecats.upsert takes for cat two. */
export function profileOf(pick) {
  return { playerId: SECOND_ID, breed: pick.breed, petName: pick.name, accessories: { ...(pick.wear ?? {}), ...(pick.look ? { look: pick.look } : {}) } };
}

/**
 * The headless player that walks cat two, placed at `at`. Everything cat one's
 * walk sets once per walk, it sets: the ground, the save's swimming and
 * zoomies, reduced motion. Its camera is a dummy that is never drawn.
 */
export function createMover({ ground, state, pick, at, reducedMotion = false, place = null }) {
  const body = new THREE.Object3D();
  body.position.set(at.x, ground.y(at.x, at.z), at.z);
  body.rotation.y = at.yaw ?? 0;
  const cam = new THREE.PerspectiveCamera();
  const player = createPlayer(cam, null, { headless: true });
  const pace = 2.2 + (PERSONALITIES[pick.breed]?.speed ?? 2) * 0.8; // the same rule as cat one's pace
  player.setAvatar(body, placePace(pace, place)); // the place's own pace and float row (the Reef's slower swim and kick), as cat one's walk sets them
  player.setFloat(placeFloat(place));
  player.setGround(ground);
  player.setZoomTuning(zoomTuning(state));
  player.setSwim(canSwim(state));
  player.setReducedMotion(reducedMotion);
  player.enable();
  return { player, body, cam };
}
