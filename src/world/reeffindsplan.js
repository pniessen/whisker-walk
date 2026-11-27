// =============================================================================
// THE REEF: THE FINDS' PLAN (milestone R3). Where the six discoveries are, the eight collectibles, the three golden mice (the same three as
// src/goldmice.js; test/reefgold.test.js holds the two lists equal), the three scenic spots and the two bubble columns. Pure data: no THREE, no clock, no rng.
// All six discoveries are live: the Pearl Oyster, the Kelp Garden seahorse and the Treasure Chest (milestone R3), and the Sunken Boat, the Old Anchor and the
// Glow Cave (milestone R8: their real positions and rules are world/reefdeep.js's, re-exported here). North is -z; heights are metres over the seabed.
// docs/superpowers/plans/2026-11-26-reef.md sections 3.4, 6 and 8.
// =============================================================================

import { DEEP_FIND_ZONES, DEEP_SCENICS } from './reefdeep.js';

const P2 = (x, z) => Object.freeze({ x, z });

// ---- the discoveries: zone by journal short id (src/reefpages.js: boat, oyster, seahorse, cave, chest, anchor) -------------------------------------
// { x, z, r, still, active }: she finds it standing within r (horizontal; the float height never matters) for `still` seconds. The middles are the
// first ring of the plan's zone keep-outs (reefplan.js KEEP_OUT): no kelp or coral stands on them.
export const REEF_FIND_ZONES = Object.freeze({
  boat: Object.freeze([DEEP_FIND_ZONES.boat]), // R8: the Sunken Boat, in the Deep (the hull's middle; walking by or floating over finds it)
  oyster: Object.freeze([Object.freeze({ x: 17.5, z: -1.5, r: 1.5, still: 1.2, active: true })]), // the Coral Garden: the pearl shows once she waits
  seahorse: Object.freeze([Object.freeze({ x: -22.5, z: 14.5, r: 1.7, still: 2, active: true })]), // the Kelp Garden: stand still among the kelp
  cave: Object.freeze([DEEP_FIND_ZONES.cave]), // R8: the Glow Cave's floor, far west of the Deep
  chest: Object.freeze([Object.freeze({ x: -6.5, z: -15.5, r: 1.4, still: 0.6, active: true })]), // the Sandy Flats
  anchor: Object.freeze([DEEP_FIND_ZONES.anchor]), // R8: the Old Anchor, half in the sand
});
export const REEF_FIND_IDS = Object.freeze(['boat', 'oyster', 'seahorse', 'cave', 'chest', 'anchor']);

// ---- the eight collectibles: five shells and three pieces of sea-glass (ids are load-bearing once shipped) -----------------------------------------
const K = (id, x, z, kind) => Object.freeze({ id, x, z, kind });
export const REEF_COLLECTIBLES = Object.freeze([
  K('reef-1', -14, 26, 'shell'), K('reef-2', 8, 22, 'shell'), K('reef-3', 26, 22, 'shell'), K('reef-4', 36, 12, 'shell'), K('reef-5', 30, -8, 'shell'),
  K('reef-6', -40, 6, 'glass'), K('reef-7', -18, -10, 'glass'), K('reef-8', 6, -24, 'glass'),
]);

// ---- the three golden mice (the final spots): one on the sand behind the boat, two at float height in bubble columns ----------------------------------
// `y` is metres over the seabed there. Reached by floating (the kick button): 1.9 and 2.0 m are inside checkFind's 0.9 m window of a float of 1.1 to 2.2 m.
export const REEF_GOLD = Object.freeze([
  Object.freeze({ id: 'gm-reef-1', x: -36, z: -30, y: 0 }),
  Object.freeze({ id: 'gm-reef-2', x: 14, z: -4, y: 1.9 }),
  Object.freeze({ id: 'gm-reef-3', x: 20, z: 6, y: 2.0 }),
  // gm-reef-4: the Sealab's bunk room (R14, reeflabplan.js BUNK_SPOT). gm-reef-5 is an R10 stub (open sand now, the galleon cabin in R16). Not in KEEP_OUT on purpose (it would move every plant).
  Object.freeze({ id: 'gm-reef-4', x: 2.4, z: -37.1, y: 0 }),
  Object.freeze({ id: 'gm-reef-5', x: 30, z: -28, y: 0 }),
]);
// The bubble columns the two floating mice hang in: a thin stack of bubbles from the sand up to a little over the mouse.
export const BUBBLE_COLUMNS = Object.freeze([
  Object.freeze({ x: 14, z: -4, top: 2.7, n: 9 }),
  Object.freeze({ x: 20, z: 6, top: 2.8, n: 9 }),
]);

// ---- scenic spots (the daily goal "visit a scenic spot"; labels are plain nouns, the same in both word sets) ----------------------------------------
export const REEF_SCENICS = Object.freeze([
  Object.freeze({ id: 'reef-kelp', x: -29, z: 21, label: 'the Kelp Garden' }),
  Object.freeze({ id: 'reef-coral', x: 10, z: 4, label: 'the Coral Garden' }),
  Object.freeze({ id: 'reef-flats', x: -12, z: -19, label: 'the Sandy Flats' }),
  ...DEEP_SCENICS, // R8: the Sunken Boat and the Glow Cave
]);

// ---- the markers the three live finds draw (a Pearl Oyster, a seahorse, a Treasure Chest), one merged mesh (reeffindparts.js) ----------------------
export const REEF_FIND_MARKS = Object.freeze({ oyster: P2(17.5, -1.5), seahorse: P2(-22.5, 14.5), chest: P2(-6.5, -15.5), boat: P2(DEEP_FIND_ZONES.boat.x, DEEP_FIND_ZONES.boat.z), anchor: P2(DEEP_FIND_ZONES.anchor.x, DEEP_FIND_ZONES.anchor.z), cave: P2(DEEP_FIND_ZONES.cave.x, DEEP_FIND_ZONES.cave.z) });
