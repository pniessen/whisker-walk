// The Pines' paths and the bridge foot, as plain numbers: a leaf, so the clan
// ground can ask where the truce path runs without loading the Pines' drawing
// (pines.js re-exports all of it).
import { ISLAND_BRIDGE_WOODS, fromWoods } from './lake.js';

// The paths, as [x1, z1, x2, z2] centreline segments, all 3 m wide. The truce
// path comes in from the River (lined up with the River's own north path) and
// winds east to the bridge foot; the pine path runs north from its bend up to
// the log bridge (the bridge is the gap after its end); the east path leaves
// it for the forest's east side; the swamp path goes from the truce path's
// first bend up the swamp to the stepping stones (the gap after it); the two
// deep-swamp paths meet in the corner, one from each crossing.
export const PINES_PATHS = Object.freeze([
  // the truce path
  [-26, 50, -26, 34], [-26, 34, -10, 18], [-10, 18, -4, 2], [-4, 2, 10.6, 2.5],
  // the pine path
  [-4, 2, -8, -18], [-8, -18, -24, -30],
  // the east path
  [-8, -18, 18, -26], [18, -26, 40, -4],
  // the swamp path
  [-26, 34, -36, 6], [-36, 6, -42, -3],
  // the deep-swamp paths
  [-42, -14, -44, -36], [-35, -30, -44, -36],
].map((s) => Object.freeze(s)));

// The truce path on its own: from the River's border to 2.3 m short of the
// bridge foot. Exported so a later plan's patrols can keep off it: crossing
// Pines land to the bridge never starts a chase.
export const TRUCE_PATH = Object.freeze(PINES_PATHS.slice(0, 4));

// The island bridge, written once in Woods coordinates (lake.js) so no two
// maps can disagree about it. Its shore end is the bridge foot, 0.2 m onto
// the bay's north shore, where the truce path meets the deck.
export const BRIDGE_FOOT = Object.freeze(fromWoods('pines', ...ISLAND_BRIDGE_WOODS[1]));
