import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { GOLD_MICE } from '../goldmice.js';

// =============================================================================
// The River and Marshes.
//
// The second clan territory, drawn by the 11-year-old on her territory map:
// reedbeds and willows along a slow river, a pond on the east edge shared with
// the Woods, and a lake in the north-east corner with an island on it.
// Coordinates are metres, x east and z south, so north is -z, as the corner
// map draws it.
//
// WHERE ITS EDGES FACE. Each edge looks like the place over it:
//   * east is the Woods. The pond sits on the edge, shared with them, and the
//     river runs on east into the Woods at the same z. The long path from
//     Twolegplace comes in on this side too, by the Woods, lined up with the
//     Woods' own long path (owner decision, 2026-10-31);
//   * north is the Pines and Swamp. They overlap the River's north edge a
//     little, so the hills there are dark and pine-tinted;
//   * north-east is the lake. Its south shore is one line across the border
//     with the Woods' lake, and it opens out past the map with the island
//     and its big tree out on the water;
//   * west is the far west where the river comes from, in pale reed-green.
//
// WHY THE DECKS EXIST. Water stops a cat (v19), and her river runs along the
// north third, jogs south and runs east into the pond, so the north strip and
// the lakeshore are cut off from the spawn. Each of the two long reaches
// carries one dry crossing, the fallen-log bridge over river-west and the
// stepping stones over river-east, and those two are the ONLY ways over.
// Sea Legs is a shortcut, never a key: nothing a kid must reach is cut off
// except through a deck. test/river.test.js floods the walkable ground from
// the spawn and proves it, and that with the decks taken away the north can't
// be reached.
//
// Each deck record is the part of its crossing the kids can SEE above the
// water, not a wider rectangle around it, so a cat standing on a deck is
// standing on log or stone, never on water beside it. Both are at least 1.5 m
// wide, enough to steer onto with a thumb.
//
// Nothing here reads which way the game is being played: the River builds the
// same for everyone.
// =============================================================================

// Where a walk places the cat: on the long path where it comes in from the
// Woods' side.
export const SPAWN = Object.freeze({ x: 44, z: 40 });

const BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });

// The log bridge over river-west: a great fallen willow trunk, 3 m through,
// its top hewn flat and 1.9 m wide (builder.logBridge), level at LOG_TOP. The
// deck is the middle 1.8 m of that flat. The trunk runs 1.5 m onto each bank
// so the crossing starts on dry ground. test/river.test.js raycasts the built
// log across the whole deck.
const LOG_X = -22;
const LOG_W = 3.0;
const LOG_FLAT = 1.9;
const LOG_TOP = 0.16;
const LOG_HALF = 0.9;
const LOG_BRIDGE = Object.freeze({ minX: LOG_X - LOG_HALF, maxX: LOG_X + LOG_HALF, minZ: -35.5, maxZ: -27.5 });

// The stepping stones over river-east: the Woods' shipped ford (fourteen broad
// flat stones, round, close and staggered in height so they overlap with no
// open water between them), turned to run along z. The ±0.75 m deck sits
// inside about ±0.83 m of visible stone, so the deck is never wider than what
// is drawn.
const STONES_X = 28;
const STONES = { n: 14, rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 };
const STONES_HALF = 0.75;
const STEPPING_STONES = Object.freeze({
  minX: STONES_X - STONES_HALF, maxX: STONES_X + STONES_HALF, minZ: -15.5, maxZ: -7.5,
});

// The waters. Every footprint runs on past the bounds where its water does, so
// the lake opens out to the horizon and the river leaves the map west and
// east rather than stopping at a wall.
const LAKE = Object.freeze({ id: 'lake', kind: 'rect', minX: 26, maxX: 120, minZ: -95, maxZ: -34 });
// Open water north of the bounds, round the island. Nothing a cat can walk.
const LAKE_FAR = Object.freeze({ id: 'lake-far', kind: 'rect', minX: 0, maxX: 30, minZ: -95, maxZ: -56 });
const RIVER_WEST = Object.freeze({
  id: 'river-west', kind: 'rect', minX: -120, maxX: 19, minZ: -34, maxZ: -29,
  decks: Object.freeze([LOG_BRIDGE]),
});
// Her jog south; no deck of its own.
const RIVER_BEND = Object.freeze({ id: 'river-bend', kind: 'rect', minX: 14, maxX: 19, minZ: -34, maxZ: -9 });
// On east into the Woods, at the Woods' z -14..-9.
const RIVER_EAST = Object.freeze({
  id: 'river-east', kind: 'rect', minX: 14, maxX: 120, minZ: -14, maxZ: -9,
  decks: Object.freeze([STEPPING_STONES]),
});
// 6 m inside the east edge, as the Woods' is 6 m inside its west edge.
const POND = Object.freeze({ id: 'pond', kind: 'circle', x: 44, z: -6, r: 6 });
const POOL_1 = Object.freeze({ id: 'pool-1', kind: 'circle', x: -30, z: 12, r: 3.5 });
const POOL_2 = Object.freeze({ id: 'pool-2', kind: 'circle', x: -12, z: 34, r: 2.5 });
const POOL_3 = Object.freeze({ id: 'pool-3', kind: 'circle', x: -40, z: 33, r: 3 });

export const RIVER_WATERS = Object.freeze([
  LAKE, LAKE_FAR, RIVER_WEST, RIVER_BEND, RIVER_EAST, POND, POOL_1, POOL_2, POOL_3,
]);

// How each water is drawn. One peaty green-blue for the lake, river and pond
// (they are one water), a greener one for the standing pools. Heights differ
// wherever footprints overlap so the planes never fight for a pixel.
//
// `shores` lists only the edges a cat can see: an edge out past the bounds is
// open water to the horizon, not a bank, and painting foam there would be a
// lie. Where two footprints overlap, the lower one's edge inside the upper one
// is hidden under it.
const WATER_COLOR = 0x5f98a8;
const POOL_COLOR = 0x6f8f80;
const WATER_LOOK = {
  lake: { y: 0.03, shores: ['minX', 'maxZ', 'minZ'] },
  'lake-far': { y: 0.025, shores: ['minX', 'maxZ', 'minZ'] },
  'river-west': { y: 0.035, shores: ['minZ', 'maxZ', 'maxX'] },
  'river-bend': { y: 0.02, shores: ['minX', 'maxX'] },
  'river-east': { y: 0.035, shores: ['minZ', 'maxZ', 'minX'] },
  pond: { y: 0.045 },
  'pool-1': { y: 0.03, color: POOL_COLOR },
  'pool-2': { y: 0.03, color: POOL_COLOR },
  'pool-3': { y: 0.03, color: POOL_COLOR },
};

// The paths, as [x1, z1, x2, z2] centreline segments, all 3 m wide. The long
// path comes in from the Woods' side at z 40 and climbs to the wet meadow; the
// bank path follows the west of the map up to the log bridge; the north path
// carries on beyond it; the pond path joins the long path to the pond.
export const RIVER_PATHS = Object.freeze([
  [50, 40, 28, 40], [28, 40, 4, 30],
  [4, 30, -10, 10], [-10, 10, -22, -26],
  [-22, -37, -26, -50],
  [28, 40, 34, 8], [34, 8, 28, -6],
].map((s) => Object.freeze(s)));
const PATH_W = 3;
const PATH_STYLE = { surface: 'sand', color: 0x8a7556 };

// The island out on the lake: the Woods' (-72, -72) moved 100 m east into
// River coordinates, so both maps show one island (ruling R2). A low grassy
// mound with one big tree and a plank bridge up to the Pines' shore. Painted
// scenery, wholly outside the bounds, so it has no collider and no perch.
export const RIVER_ISLAND = Object.freeze({ x: 28, z: -72, r: 9, rise: 1.4 });
const ISLAND_BRIDGE = { x1: 10.6, z1: -95.2, x2: 22.6, z2: -79.2, y: 0.3, w: 2 };

// --- the things to find ------------------------------------------------------
// Laid out before the trees and the reeds, because KEEP_CLEAR (below) is built
// from these very records: whatever a kid hunts for, nothing grows on it.

// The nine points of interest the race and the quests draw on. Each stands at
// least 2 m from the water and far enough from every trunk and rock that
// spots.js's clearSpot leaves it exactly where it is, so a race ring stands on
// its POI (test/river.test.js checks both, and floods each one from the spawn).
const POIS = [
  [2, 28], [-24, 4], [-16, -18], [-30, -42], [8, -42], [22, -22], [42, -22], [36, 24], [-40, -12],
].map(([x, z]) => ({ x, z }));

const SCENICS = [
  { id: 'lake-island', x: 29, z: -29, label: 'the lake and the island' },
  { id: 'river-pond', x: 34, z: 0, label: 'the pond on the border' },
  { id: 'old-willow', x: -13.9, z: -21.9, label: 'under the old willow' },
];

const COLLECTIBLES = [
  { id: 'river-find-1', x: -20, z: 14, label: 'a smooth pebble by the pool' },
  { id: 'river-find-2', x: 24, z: -18, label: 'a kingfisher feather' },
  { id: 'river-find-3', x: -38, z: -40, label: 'a mussel shell from the riverbank' },
  { id: 'river-find-4', x: 30, z: 30, label: 'a silver fish scale' },
  // on the Sun-warmed Rocks' first rock, so one hop up
  { id: 'river-find-5', x: 34, z: -26, y: 0.72, label: 'a sun-warmed pebble on the low rock' },
];

// The two climb chains, two hops each, the shape the Woods use. The Old
// Willow: a mossy boulder at its foot, then its low branch, 2.13 m across and
// 1.38 m up from the boulder (inside the 2.6 reach and the 1.6 climb), and at
// 2.1 too high to reach from the grass. The Sun-warmed Rocks above the lake: a
// low rock, then a tall one 1.41 m across and 1.18 m up. A golden mouse sits
// on each top (src/goldmice.js). The colliders sit under the perches, so a cat
// walks round the rocks and up onto them.
const OLD_WILLOW = { x: -12.4, z: -23.1, scale: 1.6, r: 0.8, curtainFloor: 2.0 };
const CHAIN_ROCKS = [
  { x: -14, z: -24.5, r: 0.7 },
  { x: 34, z: -26, r: 0.7 },
];
const WILLOW_ROOT = { x: -13.23, z: -23.83, r: 0.35 };
const WARM_TOP = { x: 33, z: -27, y: 1.9, r: 0.9, rTop: 0.75, rBottom: 0.9 };
const CHAIN_PERCHES = [
  { x: -14, z: -24.5, y: 0.72, kind: 'stone' },
  { x: OLD_WILLOW.x, z: OLD_WILLOW.z, y: 2.1, kind: 'tree', label: 'old willow lookout', vantage: true },
  { x: 34, z: -26, y: 0.72, kind: 'stone' },
  { x: WARM_TOP.x, z: WARM_TOP.z, y: WARM_TOP.y, kind: 'stone', label: 'sun-warmed rocks', vantage: true },
];

// The fallen log in the meadow's south: a seat and a first hop. Three
// colliders 1.49 m apart along it, and a perch on top at its middle.
const FALLEN_LOG = { x: 6, z: 20, length: 5, yaw: 1.2 };
const LOG_COLLIDERS = [[4.51, 19.42], [6, 20], [7.49, 20.58]];

// The bushes the third golden mouse hides among. A bush has no collider, as
// in the park: a cat pushes through to the mouse.
const GOLD_BUSHES = [[-30, 38], [-34, 38], [-32, 43]];

const PUDDLES = [{ x: 18, z: 34, r: 0.9 }, { x: -4, z: 2, r: 0.8 }, { x: 40, z: 12, r: 0.7 }];

// Places no tree or reed may stand on, nor hide: every POI (and so every race
// ring), scenic, collectible, golden mouse, chain perch, the bushes the hidden
// mouse needs, the puddles and the spawn. Built from the records themselves,
// so a find can never move without its clearance moving with it. Task 4's
// scenery reads this.
export const RIVER_KEEP_CLEAR = Object.freeze([
  ...POIS, ...SCENICS, ...COLLECTIBLES, ...GOLD_MICE.river, ...CHAIN_PERCHES,
  ...GOLD_BUSHES.map(([x, z]) => ({ x, z })), ...PUDDLES, SPAWN,
].map(({ x, z }) => Object.freeze([x, z])));

// The trees of the banks. Task 4 fills these lists; until then the River has
// none, and the birds (which sit in the first four willows) have none either.
export function riverTrees() {
  return { willows: [], alders: [], pines: [] };
}

// The River's critters: birds in the first four willows, ducks on the pond
// and on the first pool, butterflies over the wet meadow and two mice in the
// reeds. No squirrels, no villagers: no Twolegs walk the marshes.
function critterSpawns() {
  return [
    ...riverTrees().willows.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })),
    { type: 'duck', x: 42, z: -4 }, { type: 'duck', x: 40, z: -7 }, { type: 'duck', x: 45, z: -2 },
    { type: 'duck', x: -31, z: 11 }, { type: 'duck', x: -29, z: 13 },
    { type: 'butterfly', x: 0, z: 24 }, { type: 'butterfly', x: 5, z: 28 }, { type: 'butterfly', x: -1, z: 31 },
    { type: 'mouse', x: -36, z: -2, x2: -40, z2: 8 },
    { type: 'mouse', x: 24, z: 30, x2: 30, z2: 26 },
  ];
}

// A mossy boulder, the first step of each chain: builder.rock's shape and
// height (its top is just over the 0.72 perch), in a greener stone. One
// material shared by both boulders.
const MOSSY = 0x7f8a6c;
let mossyMaterial = null;
function mossyBoulder(x, z) {
  mossyMaterial ??= litMaterial(MOSSY, surfaceProps('cobble'));
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mossyMaterial);
  m.position.set(x, 0.3, z);
  return m;
}

export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, 0xa9d4e0, 0xdde8dc);
  scene.add(b.ground(120, 0x7d9c55, { surface: 'grass' }));

  // The horizon. Hills all round, each side tinted for the neighbour over it:
  // dark pine to the north, the Woods' oak green to the east, a drier green
  // to the south, the reedbeds' pale straw-green to the west. None where the
  // lake and the river leave the map, so the water opens out to the sky.
  scene.add(b.horizonBand({
    kind: 'hills', inner: 56, outer: 116, height: 4, wavelength: 40,
    color: 0x7f9a66, salt: 37, avoid: [LAKE, LAKE_FAR, RIVER_WEST, RIVER_EAST],
    sideTints: { north: 0x3f5a46, east: 0x4f7a48, south: 0x8a9a62, west: 0xa3a878 },
  }));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });
  const perches = [];

  // --- the water --------------------------------------------------------------
  // Each mesh is built from its footprint record and added to the scene root
  // directly (test/water.test.js matches against scene.children).
  const waterFx = RIVER_WATERS.map((w) => {
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
  const bridge = b.logBridge(LOG_X, LOG_BRIDGE.minZ, LOG_X, LOG_BRIDGE.maxZ, LOG_W, LOG_TOP, LOG_FLAT);
  bridge.name = 'logBridge';
  scene.add(bridge);
  const stones = b.steppingStones(STONES_X, -15, STONES_X, -8, STONES.n, STONES);
  stones.name = 'steppingStones';
  scene.add(stones);

  // --- the paths --------------------------------------------------------------
  for (const s of RIVER_PATHS) scene.add(b.path(...s, PATH_W, PATH_STYLE));

  // --- the fallen log -----------------------------------------------------------
  scene.add(b.fallenLog(FALLEN_LOG.x, FALLEN_LOG.z, FALLEN_LOG.length, FALLEN_LOG.yaw));
  for (const [x, z] of LOG_COLLIDERS) addC(x, z, 0.4);
  perches.push({ x: FALLEN_LOG.x, z: FALLEN_LOG.z, y: 0.5, kind: 'tree' });

  // --- the climb chains ---------------------------------------------------------
  // The Old Willow, with its mossy boulder at the foot, and the Sun-warmed
  // Rocks above the lake. It is built with no wind, so the limb and the mouse
  // on it never part, and its curtain is trimmed up so the chase camera sees
  // under it. Named so test/river.test.js can find it and see past it.
  const W = OLD_WILLOW;
  const willow = b.willow(W.x, W.z, W.scale, { curtainFloor: W.curtainFloor });
  willow.name = 'oldWillow';
  // The low limb the golden mouse sits out on (src/goldmice.js), reaching west
  // from the trunk to just past the mouse. A child of the willow, in its
  // scaled frame.
  const s = W.scale;
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 / s, 0.12 / s, 0.75 / s, 6),
    litMaterial(0x7a5230, surfaceProps('bark')),
  );
  limb.rotation.z = Math.PI / 2;
  limb.position.set(-0.6 / s, 1.9 / s, 0);
  willow.add(limb);
  scene.add(willow);
  addC(W.x, W.z, W.r);
  for (const { x, z, r } of CHAIN_ROCKS) {
    scene.add(mossyBoulder(x, z));
    addC(x, z, r);
  }
  // The boulder sits in the willow's roots. The crevice between their
  // colliders is narrower than a cat, so one more collider closes it rather
  // than leave a dead-end notch.
  addC(WILLOW_ROOT.x, WILLOW_ROOT.z, WILLOW_ROOT.r);
  const warm = new THREE.Mesh(
    new THREE.CylinderGeometry(WARM_TOP.rTop, WARM_TOP.rBottom, WARM_TOP.y, 7),
    litMaterial(0x9a9288, surfaceProps('cobble')),
  );
  warm.position.set(WARM_TOP.x, WARM_TOP.y / 2, WARM_TOP.z);
  scene.add(warm);
  addC(WARM_TOP.x, WARM_TOP.z, WARM_TOP.r);
  perches.push(...CHAIN_PERCHES.map((p) => ({ ...p })));

  // --- the hidden mouse's bushes, and the puddles ---------------------------------
  for (const [x, z] of GOLD_BUSHES) scene.add(b.bush(x, z, { wind }));
  for (const p of PUDDLES) scene.add(b.puddle(p.x, p.z, p.r));

  // --- the island -------------------------------------------------------------
  // A flattened sphere, so only a low dome shows above the lake, and the tree
  // stood on its crown.
  const I = RIVER_ISLAND;
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

  // The island bridge: one plank box from the Pines' shore to the island's
  // north-west rim, just above the lake. Out of reach and out of the colliders.
  const B = ISLAND_BRIDGE;
  const len = Math.hypot(B.x2 - B.x1, B.z2 - B.z1);
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(B.w, 0.12, len),
    litMaterial(0x7a5a38, surfaceProps('bark')),
  );
  plank.name = 'islandBridge';
  plank.position.set((B.x1 + B.x2) / 2, B.y, (B.z1 + B.z2) / 2);
  plank.rotation.y = Math.atan2(B.x2 - B.x1, B.z2 - B.z1);
  scene.add(plank);

  return {
    name: 'The River and Marshes',
    colliders,
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made in the River.
    boxes: [],
    tippables: [],
    pois: POIS.map((p) => ({ ...p })),
    collectibles: COLLECTIBLES.map((c) => ({ ...c })),
    scenics: SCENICS.map((c) => ({ ...c })),
    critterSpawns: critterSpawns(),
    moments: [
      { id: 'duck-parade', type: 'duck', label: 'a duck leading her ducklings out of the pond', x: 36, z: 4, from: { x: 44, z: -6 } },
      { id: 'mouse-dash', type: 'mouse', label: 'a harvest mouse dashing through the reeds', x: -28, z: -6, from: { x: -44, z: 2 } },
    ],
    puddles: PUDDLES.map((p) => ({ ...p })),
    waters: RIVER_WATERS,
    waterFx,
    groundBounce: 0x7d9c55,
    skyDusk: { top: 0x283652, horizon: 0x6a6478 },
    perches,
  };
}
