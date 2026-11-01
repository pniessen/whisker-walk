import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { ISLAND_BRIDGE_WOODS, fromWoods, fromWoodsDisc, islandBridgePlank } from './lake.js';
import {
  ISLAND_LAND, BRIDGE_DECK, ISLAND_KEEP_OUT, LAKE_BOX, BAY_BOX,
  ISLAND_POIS, ISLAND_SCENICS, ISLAND_COLLECTIBLES, ISLAND_PERCHES, MEETING_STONES, ISLAND_BUSHES,
  ISLAND_PUDDLES, ISLAND_CRITTERS, ISLAND_MOMENTS, islandReeds, buildIsland,
} from './island.js';
import { GOLD_MICE } from '../goldmice.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { ZOOM_STEPS } from '../camzoom.js';
import { addCamp } from './camp.js';

// =============================================================================
// The Pines and Swamp.
//
// The fourth clan territory from her territory map: a dark pine forest and a
// boggy swamp, north of the River and west of the Moor, holding the lake's
// north-west shore where the one bridge to the island starts. Coordinates are
// metres, x east and z south, so north is -z, as the corner map draws it. The
// Pines sits directly north of the River in the same x frame (a River point
// (x, z) is the Pines point (x, z + 100)) and directly west of the Moor in the
// same z frame (a Moor point (x, z) is the Pines point (x + 100, z)), so a
// Woods point (x, z) is the Pines point (x + 100, z + 100).
//
// WHERE ITS EDGES FACE. Each edge looks like the place over it:
//   * east is the Moor. The lake's north shore carries straight on over the
//     border at the same z, and the Moor's river pours into the lake just
//     past the edge, so the two maps read as one place. No path crosses this
//     border yet;
//   * south is the River. The River's north path carries on over the border
//     at the same x as the truce path, and the lake's west shore is one line
//     across it. The cat spawns on the truce path, 6 m in from the River;
//   * north is more pines, out to the edge of her map, so the hills are dark;
//   * west is the swamp going on, in a wet olive.
//
// THE LAKE, THE ISLAND AND THE BRIDGE. The Woods, the River and the Moor all
// paint the lake, the island and its plank bridge on their horizons, out past
// their own bounds. In this frame all three fall inside the Pines' bounds, in
// the south-east quarter, so this is the one map that holds them as ground
// truth, and the other three are asserted against it in test/pines.test.js.
// The island is ground cut out of the lake and its bay (island.js), and the
// bridge is walkable: its deck runs the plank's whole length, from the truce
// path's end onto the island, and it is the only way there. No cat stands on
// the lake, the bridge or the island (owner's decision 4): the area's keepOut
// holds the strays and ghosts off all three, and off the mire and the bogs.
//
// WHY THE DECKS EXIST. Water stops a cat (v19). The Black Mire, a dark creek,
// comes in from the north edge (mire-north), turns at its corner and runs out
// to the west edge (mire-west), so the deep swamp in the north-west corner is
// cut off from the spawn. Each of the two reaches carries one dry crossing,
// the fallen-log bridge over mire-north and the stepping stones over
// mire-west, and those two are the ONLY ways in; either one alone is enough.
// Sea Legs is a shortcut, never a key: nothing a kid must reach is cut off
// except through a deck. test/pines.test.js floods the walkable ground from
// the spawn and proves it, and that with the decks taken away the deep swamp
// can't be reached.
//
// Each deck record is the part of its crossing the kids can SEE above the
// water, not a wider rectangle around it, so a cat standing on a deck is
// standing on log or stone, never on water beside it. Both are at least 1.5 m
// wide, enough to steer onto with a thumb.
//
// Nothing here reads which way the game is being played: the Pines builds the
// same for everyone.
// =============================================================================

// Where a walk places the cat: on the truce path, 6 m in from the River, where
// the River's north path crosses the border.
export const SPAWN = Object.freeze({ x: -26, z: 44 });

const BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });

// The log bridge over mire-north: the River's fallen trunk, 3 m through, its
// top hewn flat and 1.9 m wide (builder.logBridge), level at LOG_TOP, turned
// to run along x at z -30. The deck is the middle 1.8 m of that flat, so a cat
// on the deck is on the log. The trunk runs 1.5 m onto each bank so the
// crossing starts on dry ground. test/pines.test.js raycasts the built log
// across the whole deck.
const LOG_Z = -30;
const LOG_W = 3.0;
const LOG_FLAT = 1.9;
const LOG_TOP = 0.16;
const LOG_HALF = 0.9;
const LOG_BRIDGE = Object.freeze({ minX: -33.5, maxX: -25.5, minZ: LOG_Z - LOG_HALF, maxZ: LOG_Z + LOG_HALF });

// The stepping stones over mire-west: the Woods' shipped ford exactly
// (fourteen broad flat stones, round, close and staggered in height so they
// overlap with no open water between them), run along z at x -42 over the
// 5 m channel. The ±0.75 m deck sits inside about ±0.83 m of visible stone,
// so the deck is never wider than what is drawn.
const STONES_X = -42;
const STONES = { n: 14, rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 };
const STONES_HALF = 0.75;
const STEPPING_STONES = Object.freeze({
  minX: STONES_X - STONES_HALF, maxX: STONES_X + STONES_HALF, minZ: -12.5, maxZ: -4.5,
});

// The waters. Every footprint runs on past the bounds where its water does, so
// the lake opens out to the horizon and the mire comes in from the north and
// leaves to the west rather than stopping at a wall.
//
// The lake fills the south-east. Its north shore (minZ) is the Moor's, its
// east end the Moor's (+100 in x), its west shore (minX) the River's and its
// south end the River's (+100 in z), so each shore is one line over a border;
// its south-east corner is the Woods' lake corner. Its box is in island.js,
// which keeps the strays off it with the same numbers.
//
// The wadeable band along each shore (swimming; see builder.js's WATER
// FOOTPRINTS). Every cat may wade it; Sea Legs is for the deep water past it.
//   * The lake and the bay share one width, so the island's rim (shore of
//     both) has one band. 1.0, not the usual 1.2: the island's south rim is
//     only 3.1 m from the mainland corner at (26, 44), and two 1.2 bands would
//     leave 0.7 m of deep water between them; two 1.0 bands leave 1.1. It also
//     keeps the long walk round the bay to the island under the route test's
//     8 m of slack (test/wadingroutes.test.js: 7.7 m at 1.0, 8.1 at 1.2).
//   * The Black Mire is 5 m across, like the Woods', the River's and the
//     Moor's rivers, and gets their 1.2: a deep middle of 2.6 m. With the
//     decks taken away, wading still reaches nothing in the deep swamp.
//   * The bogs are small (r 2.5 to 3.5), so 1.0, as the River's pools.
//   * The Moor's river and its mouth, out past the east edge, keep the Moor's
//     own 1.2.
const SHALLOW_LAKE = 1.0;
const SHALLOW_MIRE = 1.2;
const SHALLOW_BOG = 1.0;

// The island is cut out of both the lake and the bay: it crosses the lake's
// west edge and the bay's east edge, so each is drawn with a notch (Island
// Task 2) and each reads the island as dry ground.
const ISLANDS = Object.freeze([ISLAND_LAND]);
const LAKE = Object.freeze({ id: 'lake', kind: 'rect', ...LAKE_BOX, islands: ISLANDS, shallow: SHALLOW_LAKE });
// The bay round the island: the River's far lake, +100 in z, and the Moor's,
// +100 in x. Its north shore (z 5) is where the bridge starts, and it carries
// the bridge's deck, a strip on the bridge's diagonal (the deck lies wholly in
// the bay, x < 26).
const LAKE_BAY = Object.freeze({
  id: 'lake-bay', kind: 'rect', ...BAY_BOX, islands: ISLANDS, shallow: SHALLOW_LAKE,
  decks: Object.freeze([BRIDGE_DECK]),
});
// The Black Mire, in from the north edge, then out to the west. The two
// reaches share their south and east edges, so the corner is watertight.
const MIRE_NORTH = Object.freeze({
  id: 'mire-north', kind: 'rect', minX: -32, maxX: -27, minZ: -120, maxZ: -6, shallow: SHALLOW_MIRE,
  decks: Object.freeze([LOG_BRIDGE]),
});
const MIRE_WEST = Object.freeze({
  id: 'mire-west', kind: 'rect', minX: -120, maxX: -27, minZ: -11, maxZ: -6, shallow: SHALLOW_MIRE,
  decks: Object.freeze([STEPPING_STONES]),
});
// Four bogs on the swamp side, two either side of the mire.
const BOG_1 = Object.freeze({ id: 'bog-1', kind: 'circle', x: -40, z: 16, r: 3.5, shallow: SHALLOW_BOG });
const BOG_2 = Object.freeze({ id: 'bog-2', kind: 'circle', x: -44, z: 30, r: 3, shallow: SHALLOW_BOG });
const BOG_3 = Object.freeze({ id: 'bog-3', kind: 'circle', x: -37, z: -22, r: 2.5, shallow: SHALLOW_BOG });
const BOG_4 = Object.freeze({ id: 'bog-4', kind: 'circle', x: -40, z: -44, r: 2.5, shallow: SHALLOW_BOG });
// The Moor's river-west and river-mouth, +100 in x: they pour into the lake
// just past the east edge, so a kid looking east sees the Moor's river arrive.
// Wholly outside the bounds.
const MOOR_RIVER = Object.freeze({ id: 'moor-river', kind: 'rect', minX: 60, maxX: 123, minZ: -4, maxZ: 1, shallow: 1.2 });
const MOOR_MOUTH = Object.freeze({ id: 'moor-mouth', kind: 'rect', minX: 60, maxX: 65, minZ: -4, maxZ: 10, shallow: 1.2 });

export const PINES_WATERS = Object.freeze([
  LAKE, LAKE_BAY, MIRE_NORTH, MIRE_WEST, BOG_1, BOG_2, BOG_3, BOG_4, MOOR_RIVER, MOOR_MOUTH,
]);

// Where the Pines' strays and ghosts never stand (src/keepout.js): the
// island's keep-out (the lake, the bay and the bridge), and the Black Mire's
// two reaches and the four bogs. Strays and ghosts don't stop at water (see
// player.js), so without these they waded straight through the mire and the
// bogs. A bog is a circle, so it is a capsule with both ends at its middle,
// as wide as the bog plus the same margin as the rects.
//
// The cost: a stray can't walk the log bridge or the stepping stones either
// (their water is kept out, decks and all), so a stray that starts on one
// side of the mire stays on that side, and none crosses into the deep swamp.
// ISLAND_KEEP_OUT stays as it was, for the patrols that will need only the
// island's part.
const bogCapsule = (w) => Object.freeze({ x1: w.x, z1: w.z, x2: w.x, z2: w.z, r: w.r + ISLAND_KEEP_OUT.margin });
const mireRect = (w) => Object.freeze({ minX: w.minX, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ });
export const PINES_KEEP_OUT = Object.freeze({
  rects: Object.freeze([...ISLAND_KEEP_OUT.rects, mireRect(MIRE_NORTH), mireRect(MIRE_WEST)]),
  capsules: Object.freeze([...ISLAND_KEEP_OUT.capsules, ...[BOG_1, BOG_2, BOG_3, BOG_4].map(bogCapsule)]),
  margin: ISLAND_KEEP_OUT.margin,
});

// How each water is drawn. The lake, the bay and the Moor's river in the
// green-blue every neighbour paints them (one water across the borders); the
// mire and the bogs a dark peaty green. Heights differ wherever footprints
// overlap (the lake under its bay, the mire's corner, the Moor's river into
// its mouth, the mouth over the lake) so the planes never fight for a pixel.
//
// `shores` lists only the edges a cat can see: an edge out past the bounds is
// open water to the horizon, and an edge hidden under an overlapping water is
// no bank either, so painting foam there would be a lie. The Moor's river is
// all past the bounds, so it has none. A bog is a circle, banked all round.
// The lake keeps only its north shore: its west edge (x 26) runs up through
// the bay's water and into the island's own shore, so foam there would draw a
// line across open water. That costs the 6 m of real lake shore at x 26, z
// 44..50, by the bay's south-east pocket; the bay's south shore keeps its foam.
const WATER_COLOR = 0x5f98a8;
const MIRE_COLOR = 0x4a5a48;
const WATER_LOOK = {
  lake: { y: 0.03, shores: ['minZ'] },
  'lake-bay': { y: 0.025, shores: ['minX', 'minZ', 'maxZ'] },
  'mire-north': { y: 0.035, color: MIRE_COLOR, shores: ['minX', 'maxX'] },
  'mire-west': { y: 0.02, color: MIRE_COLOR, shores: ['minZ', 'maxZ', 'maxX'] },
  'bog-1': { y: 0.03, color: MIRE_COLOR },
  'bog-2': { y: 0.03, color: MIRE_COLOR },
  'bog-3': { y: 0.03, color: MIRE_COLOR },
  'bog-4': { y: 0.03, color: MIRE_COLOR },
  'moor-river': { y: 0.035, shores: [] },
  'moor-mouth': { y: 0.045, shores: [] },
};

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
const PATH_W = 3;
const PATH_STYLE = { surface: 'sand', color: 0x6a5640 };

// The truce path on its own: from the River's border to 2.3 m short of the
// bridge foot. Exported so a later plan's patrols can keep off it: crossing
// Pines land to the bridge never starts a chase.
export const TRUCE_PATH = Object.freeze(PINES_PATHS.slice(0, 4));

// The island out on the lake: the one island every shore shows, moved into
// this frame by lake.js. Here it is flat ground (ISLAND_LAND, island.js), cut
// out of the lake and the bay; this record keeps the shared rise the
// neighbours paint it with.
export const PINES_ISLAND = fromWoodsDisc('pines');

// The island bridge, written once in Woods coordinates (lake.js) so no two
// maps can disagree about it. Its shore end is the bridge foot, 0.2 m onto
// the bay's north shore, where the truce path meets the deck.
export const BRIDGE_FOOT = Object.freeze(fromWoods('pines', ...ISLAND_BRIDGE_WOODS[1]));

// The two truce stones, standing either side of the bridge foot on dry land:
// a mark that the path ends here and the lake begins. Each a collider, so a
// cat walks between them to the shore.
const TRUCE_STONES = [{ x: 9.0, z: 3.6, r: 0.4 }, { x: 12.2, z: 3.6, r: 0.4 }];
const TRUCE_STONE_H = 0.9;

// The horizon. Hills all round, each side tinted for the neighbour over it:
// more dark pines to the north (the colour the River and the Moor paint the
// Pines), the Moor's heather to the east, the River's green to the south, the
// swamp's wet olive to the west. None where the lake, the mire and the Moor's
// river leave the map, so the water opens out to the sky. No rooftops:
// Twolegplace is not next to the Pines.
export const PINES_HORIZON = Object.freeze({
  kind: 'hills', inner: 56, outer: 116, height: 8, wavelength: 30,
  color: 0x34503e, salt: 47,
  avoid: Object.freeze([LAKE, MIRE_NORTH, MIRE_WEST, MOOR_RIVER, MOOR_MOUTH]),
  sideTints: Object.freeze({ north: 0x3f5a46, east: 0x9a8a9c, south: 0x7f9a66, west: 0x4a5a44 }),
});

// --- the things to find ------------------------------------------------------
// Laid out before the scenery (the pines, the undergrowth and the reeds),
// because PINES_KEEP_CLEAR (below) is built from these very records: whatever
// a kid hunts for, nothing grows on it.

// The nine points of interest the race and the quests draw on. Each stands at
// least 2 m from the water and far enough from every rock, stump and log that
// spots.js's clearSpot leaves it exactly where it is, so a race ring stands on
// its POI (test/pines.test.js checks both, and floods each one from the
// spawn). The last is in the deep swamp, behind the Black Mire.
const POIS = [
  [-14, 30], [-34, 24], [-18, 6], [-6, -8], [-18, -42], [12, -40], [34, -30], [40, -4], [-44, -26],
].map(([x, z]) => ({ x, z }));

const SCENICS = [
  { id: 'island-bridge', x: 8, z: 1, label: 'the bridge to the island' },
  { id: 'black-mire', x: -24, z: -22, label: 'the black mire' },
  { id: 'swamp-heart', x: -45, z: -20, label: 'the heart of the swamp' },
];

const COLLECTIBLES = [
  { id: 'pines-find-1', x: -20, z: 20, label: 'a fat pine cone' },
  { id: 'pines-find-2', x: 24, z: -14, label: 'an owl feather' },
  { id: 'pines-find-3', x: -46, z: 22, label: 'a tuft of bog cotton' },
  { id: 'pines-find-4', x: -40, z: -36, label: 'a shiny beetle shell' },
  // on the Frog Stones' low stone, so one hop up
  { id: 'pines-find-5', x: -37, z: -15, y: 0.72, label: 'a mossy pebble on the low stone' },
];

// The two climb chains, two hops each, the shape the Moor's High Tor uses: a
// mossy boulder, then a tall pillar 1.41 m across and 1.18 m up from it. The
// Lightning Stump, a charred pine snapped by lightning, stands by the east
// path; the Frog Stones are in the deep swamp. A golden mouse sits on each top
// (src/goldmice.js). The colliders sit under the perches, so a cat walks round
// the rocks and up onto them. Each pillar is as wide at its foot as its
// collider, so a cat walking round it never stops short of what it sees.
const PILLAR = { y: 1.9, r: 0.9, rTop: 0.75, rBottom: 0.9, sides: 7 };
const LIGHTNING_STUMP = { x: 3, z: -29, color: 0x3e342c, surface: 'bark', name: 'lightningStump' };
const FROG_STONE = { x: -38, z: -16, color: 0x7a8270, surface: 'cobble', name: 'frogStone' };
const CHAIN_ROCKS = [
  { x: 4, z: -28, r: 0.7, name: 'lightningStumpRock' },
  { x: -37, z: -15, r: 0.7, name: 'frogStoneRock' },
];
const CHAIN_PERCHES = [
  { x: 4, z: -28, y: 0.72, kind: 'stone' },
  // 'stone', not 'tree': a 1.9 tree perch sits in Sure Claws' 1.6-2.0 band and would make the stump one hop.
  { x: LIGHTNING_STUMP.x, z: LIGHTNING_STUMP.z, y: PILLAR.y, kind: 'stone', label: 'lightning stump', vantage: true },
  { x: -37, z: -15, y: 0.72, kind: 'stone' },
  { x: FROG_STONE.x, z: FROG_STONE.z, y: PILLAR.y, kind: 'stone', label: 'frog stones', vantage: true },
];

// The fallen pine by the truce path: a seat and a first hop. Three colliders
// along it, so a cat walks round it rather than through it, and a perch on
// top at its middle.
const FALLEN_PINE = { x: -14, z: 42, length: 5, yaw: 0.4 };
const FALLEN_COLLIDERS = [[-14.58, 40.63], [-14, 42], [-13.42, 43.37]];

// The bushes the third golden mouse hides among. A bush has no collider, as
// in the park: a cat pushes through to the mouse.
const GOLD_BUSHES = [[28, -40], [32, -40], [30, -45]];

const PUDDLES = [{ x: -6, z: 38, r: 0.9 }, { x: 22, z: -6, r: 0.8 }];

// Where a fleeing frog dives into the bog: 0.4 m out from the east rim of
// bog-1, bog-2 and bog-3, on dry ground. src/propsets.js carries the same
// three as the Pines' hides.
export const FROG_HIDES = Object.freeze([
  { x: -36.1, z: 16 }, { x: -40.6, z: 30 }, { x: -34.1, z: -22 },
].map((h) => Object.freeze(h)));

// Places no scenery may stand on, nor hide: every POI (and so every race
// ring), scenic, collectible, golden mouse, chain perch, the bushes the hidden
// mouse needs, the puddles, the frog hides, the truce stones, the bridge foot
// and the spawn; then the island's own records that aren't already in that
// list (its golden mice are in GOLD_MICE.pines): its POIs, scenics, finds,
// chain perches, meeting stones, bushes and puddle. Built from the records
// themselves, so a find can never move without its clearance moving with it.
// The pines, the undergrowth and the reeds read this.
export const PINES_KEEP_CLEAR = Object.freeze([
  ...POIS, ...SCENICS, ...COLLECTIBLES, ...GOLD_MICE.pines, ...CHAIN_PERCHES,
  ...GOLD_BUSHES.map(([x, z]) => ({ x, z })), ...PUDDLES, ...FROG_HIDES, ...TRUCE_STONES,
  BRIDGE_FOOT, SPAWN,
  ...ISLAND_POIS, ...ISLAND_SCENICS, ...ISLAND_COLLECTIBLES, ...ISLAND_PERCHES, ...MEETING_STONES,
  ...ISLAND_BUSHES, ...ISLAND_PUDDLES,
].map(({ x, z }) => Object.freeze([x, z])));

// --- the scenery ----------------------------------------------------------------
// The pines, the ferns and toadstools under them, the reeds on the banks and
// the lily pads on the bogs, all seeded by name rather than drawn from the
// walk's rng, so every walk and both co-walkers get the same forest. Every
// candidate draws all its numbers whether it is kept or not, so moving one
// clearance never reshuffles the rest. Spots are rounded to the centimetre so
// they are clean data (they end up in colliders).

const r2 = (v) => Math.round(v * 100) / 100;

// Distance from (x, z) to a segment.
function segDist(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}
// Distance from (x, z) to an axis-aligned rectangle (0 inside it).
const rectDist = (d, x, z) => Math.hypot(
  Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
// The decks the fit rules keep clear of: the two mire crossings, named. Not
// every water's decks: rectDist reads a rect's minX, which the island bridge's
// strip deck doesn't have, so it would give NaN and every rule would pass.
// The bridge has its own rule (bridgeDist).
export const DECKS = Object.freeze([LOG_BRIDGE, STEPPING_STONES]);
// Distance from (x, z) to the bridge deck's centreline.
const bridgeDist = (x, z) => segDist(x, z, BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2);
// Whether (x, z) is on the island or within a metre of its rim. The island is
// ground now, so the water rules no longer keep scenery off it; this does.
// It is the meeting place, not more of the forest. The extra metre keeps the
// shore reeds' lines from running along its rim.
const onIsland = (x, z) => Math.hypot(x - ISLAND_LAND.x, z - ISLAND_LAND.z) < ISLAND_LAND.r + 1;
// The waters with their decks taken away: a deck is dry for a cat, but it is
// still the mire for a tree or a reed.
const UNDECKED = PINES_WATERS.map((w) => ({ ...w, decks: [] }));
// How far (x, z) is from the nearest water's edge, decks ignored.
const waterDist = (x, z) => Math.min(...UNDECKED.map((w) => b.waterGap(w, x, z)));
const inBounds = (x, z) => x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;
const pathDist = (x, z) => Math.min(...PINES_PATHS.map((seg) => segDist(x, z, ...seg)));
// The paths as the chase camera sees them. The far zoom step puts the camera
// about 7 m behind the cat, so where a path bends or ends the camera leaves
// the path's corridor: a cat at a segment's end looking back down it has the
// camera out past that end, and one turning at a bend has it out over the
// corner. Each segment is stretched that far at both ends, and the canopy
// rule measures from these, so no pine stands where the camera can swing.
const CAM_BACK = ZOOM_STEPS[2].dist;
function stretched([x1, z1, x2, z2]) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ux = ((x2 - x1) / len) * CAM_BACK, uz = ((z2 - z1) / len) * CAM_BACK;
  return [x1 - ux, z1 - uz, x2 + ux, z2 + uz];
}
const CAM_PATHS = PINES_PATHS.map(stretched);
const camPathDist = (x, z) => Math.min(...CAM_PATHS.map((seg) => segDist(x, z, ...seg)));

// The trail over the Moor border (owner answer 4 of the border-crossings
// plan): a 2 m deer track branching off the east path at (33, -11) and running
// due east to the border, where the Moor's own trail takes it on. It is its own
// exported constant, not part of PINES_PATHS, on purpose: PINES_PATHS feeds
// pathDist and CAM_PATHS, so adding to it would reshuffle every seeded tree,
// fern and reed this map's tests pin. It has no collider, and it is the same
// for everyone.
export const PINES_TRAIL = Object.freeze([[33, -11, 50, -11]].map((s) => Object.freeze(s)));
export const TRAIL_W = 2;
const CAM_TRAIL = PINES_TRAIL.map(stretched);
// Whether (x, z) is at least `d` from the trail: for the trees, from the trail
// stretched CAM_BACK past both ends as the paths are (`cam`), for the beds
// from the trail itself. It is the last filter in each scatter export, applied
// to the finished lists, so no rng draw, cap or spacing check changes and
// nothing but the trees and beds on the trail moves.
const trailClear = (x, z, d, cam = false) => (cam ? CAM_TRAIL : PINES_TRAIL)
  .every((seg) => segDist(x, z, ...seg) >= d);
const BED_TRAIL_CLEAR = TRAIL_W / 2 + 0.8; // the paths' 2.3 m rule less 0.5 m
const clearOf = (x, z, d) => PINES_KEEP_CLEAR.every(([px, pz]) => Math.hypot(x - px, z - pz) >= d);

// The fallen pine's two ends: it lies along its local z, turned to `yaw`. Its
// perch is not in PINES_KEEP_CLEAR, so the scenery keeps clear of its whole
// length here instead, to keep the seat and the first hop open.
function fallenPineEnds() {
  const h = FALLEN_PINE.length / 2;
  const sx = Math.sin(FALLEN_PINE.yaw), sz = Math.cos(FALLEN_PINE.yaw);
  return [FALLEN_PINE.x - sx * h, FALLEN_PINE.z - sz * h, FALLEN_PINE.x + sx * h, FALLEN_PINE.z + sz * h];
}
const FALLEN_SEG = fallenPineEnds();
const fallenDist = (x, z) => segDist(x, z, ...FALLEN_SEG);

// The pines. A 4.5 m grid over the whole map, each candidate jittered and
// kept by a roll against its zone's share: thin in the swamp west of the mire
// (thinnest in the outer swamp, south of mire-west, where the two big bogs
// lie open), thick everywhere else, so the Pines reads as a dark forest
// beside an open bog.
//
// A pine keeps the canopy rule every territory keeps (a path's half-width,
// its lowest cone's reach of 1.3 m per unit of scale, then half a metre),
// measured from each path stretched 7 m past both its ends (camPathDist), so
// the chase camera following the cat down a path, round a bend or up to a
// path's end never ends up inside a canopy. It keeps 4 m off the crossings so they stay in sight, 4 m off every
// find, 3 m off the fallen pine and 6 m off both climbs, so a kid can walk
// round each and see its golden mouse from the chase camera. Pines stand
// 3.2 m apart at least, which leaves a cat room between any two trunks.
//
// The ones a kid walks past (by a path, or round the spawn) sway, each its
// own b.pine, up to forty of them; every other pine joins the still stand,
// one merged mesh pair however many it holds (lesson 7: dense pines are a
// merged stand from the start).
const PINE_GRID = { seed: 'pines-pines', from: -48, to: 48, cell: 4.5, jitter: 1.5 };
const PINE_SPACING = 3.2;
const MAX_NEAR = 40;
const MAX_STAND = 150;
const PINE_REACH = 1.3; // builder.pine's lowest cone, per unit of scale
const canopyClearFor = (width, scale) => width / 2 + PINE_REACH * scale + 0.5;
const canopyClear = (scale) => canopyClearFor(PATH_W, scale);
// The share of candidates kept in each zone.
function pineShare(x, z) {
  if (x < -27) return z < -6 ? 0.35 : 0.25; // the deep swamp, then the outer swamp
  return 0.85;
}
function pineFits(x, z, scale, kept) {
  if (!inBounds(x, z)) return false;
  if (waterDist(x, z) < 2.5) return false;
  if (DECKS.some((d) => rectDist(d, x, z) < 4)) return false;
  if (onIsland(x, z)) return false;
  // measured from the stretched paths, not the bare ones (camPathDist)
  if (camPathDist(x, z) < canopyClear(scale)) return false;
  // the bridge as a 2 m path: the canopy rule with its half-width of 1 m
  if (bridgeDist(x, z) < 1 + PINE_REACH * scale + 0.5) return false;
  if (!clearOf(x, z, 4)) return false;
  if (fallenDist(x, z) < 3) return false;
  if ([LIGHTNING_STUMP, FROG_STONE].some((c) => Math.hypot(x - c.x, z - c.z) < 6)) return false;
  return kept.every((t) => Math.hypot(x - t.x, z - t.z) >= PINE_SPACING);
}
function placedPines() {
  const G = PINE_GRID;
  const rng = mulberry32(seedFromCode(G.seed));
  const near = [];
  const stand = [];
  const kept = [];
  for (let gz = G.from; gz <= G.to; gz += G.cell) {
    for (let gx = G.from; gx <= G.to; gx += G.cell) {
      const x = r2(gx + (rng() * 2 - 1) * G.jitter);
      const z = r2(gz + (rng() * 2 - 1) * G.jitter);
      const scale = r2(1.2 + 0.7 * rng());
      const roll = rng();
      if (roll >= pineShare(x, z) || !pineFits(x, z, scale, kept)) continue;
      const t = { x, z, scale };
      const byWalk = pathDist(x, z) < canopyClear(scale) + 4 || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 12;
      if (byWalk && near.length < MAX_NEAR) near.push(t);
      else if (stand.length < MAX_STAND) stand.push(t);
      else continue;
      kept.push(t);
    }
  }
  return { near, stand };
}
// The trail clearing: a pine whose canopy breaks the paths' rule for the 2 m
// trail comes out (clear of it by half its width, its cone's reach and half a
// metre, measured from the trail stretched like CAM_PATHS). Applied to the
// finished lists, so no cap or spacing check changes.
export function pinesTrees() {
  const { near, stand } = placedPines();
  const onTrail = (t) => !trailClear(t.x, t.z, canopyClearFor(TRAIL_W, t.scale), true);
  return { near: near.filter((t) => !onTrail(t)), stand: stand.filter((t) => !onTrail(t)) };
}

// The forest floor: ferns and toadstools, one rng between them, ferns first.
// Neither has a collider (a cat pushes through), and both keep off the water's
// edge, the paths, the crossings, every find, the spawn, the fallen pine and
// the trunks, so nothing the kids walk to or look for is hidden. The ferns
// grow under the pines and not in the swamp; the toadstools grow anywhere.
// The caps are the triangle budget (test/budget.test.js).
const FERNS = { from: -47.5, cell: 4, jitter: 1.5, keep: 0.6, cap: 220 };
const TOADSTOOLS = { from: -46.5, cell: 7, jitter: 2.5, keep: 0.5, cap: 60 };
const SWAMP_X = -27;
function floorFits(x, z, trunks) {
  if (!inBounds(x, z)) return false;
  if (waterDist(x, z) < 1.0) return false;
  if (DECKS.some((d) => rectDist(d, x, z) < 3)) return false;
  if (onIsland(x, z)) return false;
  if (pathDist(x, z) < 2.3) return false;
  if (!clearOf(x, z, 3)) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4) return false;
  if (fallenDist(x, z) < 2) return false;
  return trunks.every((t) => Math.hypot(x - t.x, z - t.z) >= 0.9 * t.scale);
}
export function pinesUndergrowth() {
  const rng = mulberry32(seedFromCode('pines-undergrowth'));
  // the trees as placed, before the trail clearing: a felled pine still keeps
  // the ferns off its old spot, so no fern appears that was not there before
  const { near, stand } = placedPines();
  const trunks = [...near, ...stand];
  const scatter = (rule, allowed) => {
    const spots = [];
    for (let gz = rule.from; gz < BOUNDS.maxZ; gz += rule.cell) {
      for (let gx = rule.from; gx < BOUNDS.maxX; gx += rule.cell) {
        const x = r2(gx + (rng() * 2 - 1) * rule.jitter);
        const z = r2(gz + (rng() * 2 - 1) * rule.jitter);
        const keep = rng() < rule.keep;
        if (keep && spots.length < rule.cap && allowed(x) && floorFits(x, z, trunks)) spots.push({ x, z });
      }
    }
    return spots.filter((s) => trailClear(s.x, s.z, BED_TRAIL_CLEAR)); // the trail clearing, last
  };
  const ferns = scatter(FERNS, (x) => x >= SWAMP_X);
  const toadstools = scatter(TOADSTOOLS, () => true);
  return { ferns, toadstools };
}

// Reeds, a clump every 2 m, half a metre out round each bog, along both banks
// of the mire, and along the bay's and the lake's shores on this side. None
// within 1.5 m of a deck (the Woods' rule), so the crossings stay clear to see
// and to walk onto, none on a path, and none on a find, the spawn or the
// bridge foot (all in PINES_KEEP_CLEAR).
const REED_STEP = 2;
export function pinesReeds() {
  const spots = [];
  const add = (x, z, shore = false) => {
    x = r2(x); z = r2(z);
    if (!inBounds(x, z)) return;
    if (shore && onIsland(x, z)) return;
    if (b.inWater(UNDECKED, x, z)) return;
    if (DECKS.some((d) => rectDist(d, x, z) < 1.5)) return;
    if (pathDist(x, z) < 2.3) return;
    if (!clearOf(x, z, 3)) return;
    spots.push({ x, z });
  };
  const along = (from, to, at, shore = false) => {
    for (let v = from; v <= to; v += REED_STEP) add(...at(v), shore);
  };
  // round each bog
  for (const bog of [BOG_1, BOG_2, BOG_3, BOG_4]) {
    const r = bog.r + 0.5;
    const n = Math.round((2 * Math.PI * r) / REED_STEP);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      add(bog.x + Math.cos(a) * r, bog.z + Math.sin(a) * r);
    }
  }
  // the mire's banks: mire-north's west and east, mire-west's north and south
  along(-50, -6, (z) => [MIRE_NORTH.minX - 0.5, z]);
  along(-50, -6, (z) => [MIRE_NORTH.maxX + 0.5, z]);
  along(-50, -27, (x) => [x, MIRE_WEST.minZ - 0.5]);
  along(-50, -27, (x) => [x, MIRE_WEST.maxZ + 0.5]);
  // the bay's west, north and south shores (kept off the island, which is
  // ground now and gets its own ring of reeds)
  along(5, 44, (z) => [LAKE_BAY.minX - 0.5, z], true);
  along(0, 30, (x) => [x, LAKE_BAY.minZ - 0.5], true);
  along(0, 26, (x) => [x, LAKE_BAY.maxZ + 0.5], true);
  // the lake's north shore, and its west shore below the bay
  along(30, 50, (x) => [x, LAKE.minZ - 0.5], true);
  along(44, 50, (z) => [LAKE.minX - 0.5, z], true);
  // and the island's own ring, inside its rim (island.js), in the same bed
  // the trail clearing, last: no reed grows on the trail
  return [...spots.filter((s) => trailClear(s.x, s.z, BED_TRAIL_CLEAR)), ...islandReeds()];
}

// Lily pads on each bog: the River's ring rule, every 1.2 m round a ring at
// 0.6 of the bog's radius, each moved in or out a little, about three in five
// kept.
export function pinesLilyPads() {
  const rng = mulberry32(seedFromCode('pines-lilies'));
  const pads = [];
  for (const c of [BOG_1, BOG_2, BOG_3, BOG_4]) {
    const ringR = 0.6 * c.r;
    const n = Math.round((2 * Math.PI * ringR) / 1.2);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / n;
      const rad = ringR + (rng() * 2 - 1) * 0.15 * c.r;
      const keep = rng() < 0.6;
      const r = r2(0.22 + 0.16 * rng());
      if (keep) pads.push({ x: r2(c.x + Math.cos(a) * rad), z: r2(c.z + Math.sin(a) * rad), r });
    }
  }
  return pads;
}

// The Pines' critters: birds in the first four near pines, frogs by the bogs
// (one in the deep swamp), squirrels in the forest, ducks on the lake and two
// mice in the undergrowth. No butterflies under the pines (too dark and wet;
// the island's open grass has its own, island.js) and no villagers: no
// Twolegs walk here.
function critterSpawns() {
  return [
    ...pinesTrees().near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })),
    // The two bog-side frogs pace dry ground east of bog-1 and bog-2, ending
    // by their frog hides, not the plan's lines through the bogs: a frog stays
    // at y 0, so in a bog it would pace half-sunk, out of a stalking cat's reach.
    { type: 'frog', x: -35, z: 21, x2: -35.5, z2: 16 },
    { type: 'frog', x: -40, z: 35, x2: -40, z2: 30 },
    { type: 'frog', x: -34, z: -26, x2: -40, z2: -30 },
    { type: 'squirrel', x: -12, z: -34 }, { type: 'squirrel', x: 20, z: -20 },
    // all three on open water, none within 2 m of the island's rim
    { type: 'duck', x: 34, z: 14 }, { type: 'duck', x: 37, z: 15 }, { type: 'duck', x: 38, z: 13 },
    { type: 'mouse', x: 10, z: -36, x2: 16, z2: -30 },
    { type: 'mouse', x: -20, z: -44, x2: -14, z2: -38 },
  ];
}

// A mossy boulder, the first step of each chain: builder.rock's shape and
// height (its top is just over the 0.72 perch). build() makes one material per
// scene and hands it to both boulders: walk.js disposes every material at the
// end of a walk, so a module-level cache would hand the next walk a disposed
// one.
const MOSSY = 0x7f8a6c;
function mossyBoulder(x, z, material) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), material);
  m.position.set(x, 0.3, z);
  return m;
}

export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, 0x9fb4c0, 0xc8d0c4);
  scene.add(b.ground(120, 0x56603e, { surface: 'grass' }));
  scene.add(b.horizonBand(PINES_HORIZON));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });
  const perches = [];

  // --- the water --------------------------------------------------------------
  // Each mesh is built from its footprint record and added to the scene root
  // directly (test/water.test.js matches against scene.children).
  const waterFx = PINES_WATERS.map((w) => {
    const fx = createWater(w, {
      color: WATER_COLOR,
      ...WATER_LOOK[w.id],
      quality: water.quality ?? 'high',
      reducedMotion: water.reducedMotion ?? false,
    });
    scene.add(fx.mesh);
    return fx;
  });

  // --- the crossings ----------------------------------------------------------
  const bridge = b.logBridge(LOG_BRIDGE.minX, LOG_Z, LOG_BRIDGE.maxX, LOG_Z, LOG_W, LOG_TOP, LOG_FLAT);
  bridge.name = 'logBridge';
  scene.add(bridge);
  const stones = b.steppingStones(STONES_X, -12, STONES_X, -5, STONES.n, STONES);
  stones.name = 'steppingStones';
  scene.add(stones);

  // --- the paths --------------------------------------------------------------
  for (const s of PINES_PATHS) scene.add(b.path(...s, PATH_W, PATH_STYLE));
  // the trail over the Moor border, in the same sand, 2 m wide (PINES_TRAIL)
  for (const s of PINES_TRAIL) scene.add(b.path(...s, TRAIL_W, PATH_STYLE));

  // --- the truce stones -------------------------------------------------------
  // Two mossy standing stones, one material between them (walk.js disposes
  // every material at the end of a walk, so it is made per build).
  const truceStones = new THREE.Group();
  truceStones.name = 'truceStones';
  const stoneMat = litMaterial(0x7a8270, surfaceProps('cobble'));
  for (const { x, z, r } of TRUCE_STONES) {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, TRUCE_STONE_H, 7), stoneMat);
    stone.position.set(x, TRUCE_STONE_H / 2, z);
    truceStones.add(stone);
    addC(x, z, r);
  }
  scene.add(truceStones);

  // --- the climb chains -------------------------------------------------------
  // Named so test/pines.test.js can find them and see past them.
  const mossy = litMaterial(MOSSY, surfaceProps('cobble'));
  for (const { x, z, r, name } of CHAIN_ROCKS) {
    const rock = mossyBoulder(x, z, mossy);
    rock.name = name;
    scene.add(rock);
    addC(x, z, r);
  }
  for (const P of [LIGHTNING_STUMP, FROG_STONE]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(PILLAR.rTop, PILLAR.rBottom, PILLAR.y, PILLAR.sides),
      litMaterial(P.color, surfaceProps(P.surface)),
    );
    pillar.name = P.name;
    pillar.position.set(P.x, PILLAR.y / 2, P.z);
    scene.add(pillar);
    addC(P.x, P.z, PILLAR.r);
  }
  perches.push(...CHAIN_PERCHES.map((p) => ({ ...p })));

  // --- the fallen pine --------------------------------------------------------
  const fallen = b.fallenLog(FALLEN_PINE.x, FALLEN_PINE.z, FALLEN_PINE.length, FALLEN_PINE.yaw);
  fallen.name = 'fallenPine';
  scene.add(fallen);
  for (const [x, z] of FALLEN_COLLIDERS) addC(x, z, 0.4);
  perches.push({ x: FALLEN_PINE.x, z: FALLEN_PINE.z, y: 0.5, kind: 'tree' });

  // --- the pines -------------------------------------------------------------
  // A collider a little wider than the trunk for every pine, near or in the
  // stand, so the still stand is as solid as the swaying pines. No fork perch:
  // a pine has no low fork. Each near pine stands at the scene root at its
  // own (x, z) (test/pines.test.js looks them up there).
  const { near, stand } = pinesTrees();
  for (const { x, z, scale } of near) scene.add(b.pine(x, z, scale, { wind }));
  const standMesh = b.pineStand(stand, seedFromCode('pines-stand'));
  standMesh.name = 'pineStand';
  scene.add(standMesh);
  for (const { x, z, scale } of [...near, ...stand]) addC(x, z, r2(0.4 * scale));

  // --- the beds ---------------------------------------------------------------
  // Each one merged mesh (two for the toadstools' stems and caps) out of the
  // shadow pass, and no colliders: a cat pushes through.
  const { ferns, toadstools } = pinesUndergrowth();
  const beds = [
    ['ferns', b.fernBed(ferns, seedFromCode('pines-ferns'))],
    ['toadstools', b.toadstools(toadstools, seedFromCode('pines-toadstools'))],
    ['reeds', b.reedBed(pinesReeds(), seedFromCode('pines-reeds'))],
    ['lilyPads', b.lilyPads(pinesLilyPads(), seedFromCode('pines-lilies'))],
  ];
  for (const [name, bed] of beds) {
    bed.name = name;
    scene.add(bed);
  }

  // --- the hidden mouse's bushes, and the puddles -----------------------------
  for (const [x, z] of GOLD_BUSHES) scene.add(b.bush(x, z, { wind }));
  for (const p of PUDDLES) scene.add(b.puddle(p.x, p.z, p.r));

  // --- the island and its bridge ---------------------------------------------
  // The island's ground needs no mesh of its own: it is a hole in the lake's
  // and the bay's water, and the ground plane shows through it, so it is the
  // same grass as the shore. The bridge is the same plank every shore draws
  // (lake.js); the bay's deck, BRIDGE_DECK, is what a cat walks on, and it
  // lies inside the plank. No collider: the water either side holds the cat
  // on it. On the island stand the Old Ash, the Meeting Ring and the Watch
  // Rock (island.js), their colliders and perches appended to the Pines'.
  scene.add(islandBridgePlank('pines'));
  const isle = buildIsland(scene, { wind });
  colliders.push(...isle.colliders);
  perches.push(...isle.perches);

  // --- the camp ---------------------------------------------------------------
  // The clan's den and the leader's rock, in the camp disc between the two camp
  // pines (camp.js), well off the truce path. Every device draws it, whatever
  // the picks, and Legacy draws it too.
  addCamp(scene, { colliders }, 'pines');

  return {
    name: 'The Pines and Swamp',
    colliders,
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made in the Pines.
    boxes: [],
    tippables: [],
    // the island's lists after the Pines' own, so secrets.js's indices into
    // the first nine POIs don't move
    pois: [...POIS, ...ISLAND_POIS].map((p) => ({ ...p })),
    collectibles: [...COLLECTIBLES, ...ISLAND_COLLECTIBLES].map((c) => ({ ...c })),
    scenics: [...SCENICS, ...ISLAND_SCENICS].map((c) => ({ ...c })),
    critterSpawns: [...critterSpawns(), ...ISLAND_CRITTERS.map((c) => ({ ...c }))],
    moments: [
      { id: 'frog-plop', type: 'frog', label: 'a frog hopping for the bog', x: FROG_HIDES[0].x, z: FROG_HIDES[0].z, from: { x: -30, z: 22 } },
      ...ISLAND_MOMENTS.map((m) => ({ ...m, from: { ...m.from } })),
    ],
    puddles: [...PUDDLES, ...ISLAND_PUDDLES].map((p) => ({ ...p })),
    waters: PINES_WATERS,
    waterFx,
    groundBounce: 0x56603e,
    skyDusk: { top: 0x22304a, horizon: 0x5e5a6e },
    perches,
    // no cat stands on the lake, the island, the bridge, the mire or a bog
    // (src/keepout.js)
    keepOut: PINES_KEEP_OUT,
  };
}
