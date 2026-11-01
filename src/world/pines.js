import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { ISLAND_BRIDGE_WOODS } from './moor.js';
import { GOLD_MICE } from '../goldmice.js';

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
// THE LAKE, THE ISLAND AND THE BRIDGE FOOT. The Woods, the River and the Moor
// all paint the lake, the island and its plank bridge on their horizons, out
// past their own bounds. In this frame all three fall inside the Pines'
// bounds, in the south-east quarter, so this is the one map that holds them as
// ground truth, and the other three are asserted against it in
// test/pines.test.js. The island is in bounds but out of reach: its whole rim
// is in the water, it has no ground, collider or perch, and the plank has no
// deck, so the cat walks the truce path to the bridge foot and stops at the
// shore. The bridge waits for the island: walking onto it is the island's own
// map to add, not this one's.
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
// its south-east corner is the Woods' lake corner.
const LAKE = Object.freeze({ id: 'lake', kind: 'rect', minX: 26, maxX: 86, minZ: 8, maxZ: 66 });
// The bay round the island: the River's far lake, +100 in z, and the Moor's,
// +100 in x. Its north shore (z 5) is where the bridge starts.
const LAKE_BAY = Object.freeze({ id: 'lake-bay', kind: 'rect', minX: 0, maxX: 30, minZ: 5, maxZ: 44 });
// The Black Mire, in from the north edge, then out to the west. The two
// reaches share their south and east edges, so the corner is watertight.
const MIRE_NORTH = Object.freeze({
  id: 'mire-north', kind: 'rect', minX: -32, maxX: -27, minZ: -120, maxZ: -6,
  decks: Object.freeze([LOG_BRIDGE]),
});
const MIRE_WEST = Object.freeze({
  id: 'mire-west', kind: 'rect', minX: -120, maxX: -27, minZ: -11, maxZ: -6,
  decks: Object.freeze([STEPPING_STONES]),
});
// Four bogs on the swamp side, two either side of the mire.
const BOG_1 = Object.freeze({ id: 'bog-1', kind: 'circle', x: -40, z: 16, r: 3.5 });
const BOG_2 = Object.freeze({ id: 'bog-2', kind: 'circle', x: -44, z: 30, r: 3 });
const BOG_3 = Object.freeze({ id: 'bog-3', kind: 'circle', x: -37, z: -22, r: 2.5 });
const BOG_4 = Object.freeze({ id: 'bog-4', kind: 'circle', x: -40, z: -44, r: 2.5 });
// The Moor's river-west and river-mouth, +100 in x: they pour into the lake
// just past the east edge, so a kid looking east sees the Moor's river arrive.
// Wholly outside the bounds.
const MOOR_RIVER = Object.freeze({ id: 'moor-river', kind: 'rect', minX: 60, maxX: 123, minZ: -4, maxZ: 1 });
const MOOR_MOUTH = Object.freeze({ id: 'moor-mouth', kind: 'rect', minX: 60, maxX: 65, minZ: -4, maxZ: 10 });

export const PINES_WATERS = Object.freeze([
  LAKE, LAKE_BAY, MIRE_NORTH, MIRE_WEST, BOG_1, BOG_2, BOG_3, BOG_4, MOOR_RIVER, MOOR_MOUTH,
]);

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
const WATER_COLOR = 0x5f98a8;
const MIRE_COLOR = 0x4a5a48;
const WATER_LOOK = {
  lake: { y: 0.03, shores: ['minX', 'minZ'] },
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

// The island out on the lake: the Woods' (-72, -72), the River's (28, -72) and
// the Moor's (-72, 28), each moved into this frame, so every map shows one
// island. A low grassy mound with one big tree. In bounds, but wholly in the
// bay and the lake, so it has no collider and no perch.
export const PINES_ISLAND = Object.freeze({ x: 28, z: 28, r: 9, rise: 1.4 });

// The island bridge, written once in Woods coordinates (moor.js) so no two
// maps can disagree about it. Its shore end is the bridge foot, 0.2 m onto
// the bay's north shore: the end of the walk, for now.
const [ISLAND_END, SHORE_END] = ISLAND_BRIDGE_WOODS.map(([x, z]) => [x + 100, z + 100]);
export const BRIDGE_FOOT = Object.freeze({ x: SHORE_END[0], z: SHORE_END[1] });
const ISLAND_BRIDGE = { y: 0.3, w: 2 };

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
// and the spawn. Built from the records themselves, so a find can never move
// without its clearance moving with it. The pines, the undergrowth and the
// reeds read this.
export const PINES_KEEP_CLEAR = Object.freeze([
  ...POIS, ...SCENICS, ...COLLECTIBLES, ...GOLD_MICE.pines, ...CHAIN_PERCHES,
  ...GOLD_BUSHES.map(([x, z]) => ({ x, z })), ...PUDDLES, ...FROG_HIDES, ...TRUCE_STONES,
  BRIDGE_FOOT, SPAWN,
].map(({ x, z }) => Object.freeze([x, z])));

// The Pines' trees: the near pines a kid walks past, each its own swaying
// pine, and the dense stand behind them, merged into one still mesh. Both
// come with the scenery pass; until then there are none.
export function pinesTrees() {
  return { near: [], stand: [] };
}

// The Pines' critters: birds in the first four near pines, frogs by the bogs
// (one in the deep swamp), squirrels in the forest, ducks on the lake and two
// mice in the undergrowth. No butterflies (too dark and wet under the pines)
// and no villagers: no Twolegs walk here.
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
    { type: 'duck', x: 34, z: 14 }, { type: 'duck', x: 36, z: 16 }, { type: 'duck', x: 38, z: 13 },
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

  // --- the hidden mouse's bushes, and the puddles -----------------------------
  for (const [x, z] of GOLD_BUSHES) scene.add(b.bush(x, z, { wind }));
  for (const p of PUDDLES) scene.add(b.puddle(p.x, p.z, p.r));

  // --- the island -------------------------------------------------------------
  // A flattened sphere, so only a low dome shows above the lake, and the tree
  // stood on its crown.
  const I = PINES_ISLAND;
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(I.r, 24, 8),
    litMaterial(0x6a9a50, surfaceProps('grass')),
  );
  mound.scale.y = I.rise / I.r;
  mound.position.set(I.x, 0, I.z);
  scene.add(mound);
  const islandTree = b.tree(I.x, I.z, 2.6, { wind });
  islandTree.position.y = I.rise - 0.2;
  scene.add(islandTree);

  // The island bridge: one plank box from the bridge foot to the island's
  // north-west rim, just above the lake. Scenery only: no deck, no collider.
  const [x1, z1] = SHORE_END, [x2, z2] = ISLAND_END;
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(ISLAND_BRIDGE.w, 0.12, Math.hypot(x2 - x1, z2 - z1)),
    litMaterial(0x7a5a38, surfaceProps('bark')),
  );
  plank.name = 'islandBridge';
  plank.position.set((x1 + x2) / 2, ISLAND_BRIDGE.y, (z1 + z2) / 2);
  plank.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  scene.add(plank);

  return {
    name: 'The Pines and Swamp',
    colliders,
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made in the Pines.
    boxes: [],
    tippables: [],
    pois: POIS.map((p) => ({ ...p })),
    collectibles: COLLECTIBLES.map((c) => ({ ...c })),
    scenics: SCENICS.map((c) => ({ ...c })),
    critterSpawns: critterSpawns(),
    moments: [
      { id: 'frog-plop', type: 'frog', label: 'a frog hopping for the bog', x: FROG_HIDES[0].x, z: FROG_HIDES[0].z, from: { x: -30, z: 22 } },
    ],
    puddles: PUDDLES.map((p) => ({ ...p })),
    waters: PINES_WATERS,
    waterFx,
    groundBounce: 0x56603e,
    skyDusk: { top: 0x22304a, horizon: 0x5e5a6e },
    perches,
  };
}
