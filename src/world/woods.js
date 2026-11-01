import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { sureClawsTreePerch } from '../climbing.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { GOLD_MICE } from '../goldmice.js';

// =============================================================================
// The Woods.
//
// The first map drawn from her own board of the clan lands (spec §3): an oak
// wood with a sunny clearing in the middle, the lake to the north-west, the
// pond on the west edge and the river running along the north. Coordinates
// are metres, x east and z south, so north is -z, as the corner map draws it.
//
// WHERE ITS EDGES FACE. Each edge looks like the place over it:
//   * east is Twolegplace. The cat spawns on the short path where it comes in
//     through the garden fence, and the horizon there carries rooftops;
//   * north is the Moor. The river turns north up the east side of the glade
//     and leaves the map there, and the hills beyond are heather-tinted;
//   * west is the River and Marshes. The pond sits on the edge, shared with
//     them, and the river runs off west out of it;
//   * north-west is the lake, opening out past the map with the island and
//     its big tree out on the water.
//
// WHY THE DECKS EXIST. Water stops a cat (v19), and the river cuts the glade
// in the north off from the rest of the Woods: river-west along its south side,
// river-north along its east, the lake on the rest. So each reach carries one
// dry crossing, the fallen-log bridge and the stepping stones, and those two
// are the ONLY ways in. Sea Legs is a shortcut, never a key: nothing a kid
// must reach is cut off except through a deck. test/woods.test.js floods the
// walkable ground from the spawn and proves it, and that with the decks taken
// away the glade can't be reached.
//
// Each deck record is the part of its crossing the kids can SEE above the
// water, not a wider rectangle around it, so a cat standing on a deck is
// standing on log or stone, never on water beside it.
//
// Nothing here reads which way the game is being played: the Woods builds the
// same for everyone (plan, Global Constraints).
// =============================================================================

// Where a walk places the cat: the short path, just inside the garden fence.
export const SPAWN = Object.freeze({ x: 44, z: 12 });

const BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });

// The log bridge over river-west: a great fallen oak, 3 m through, with its
// top hewn flat and 1.9 m wide (builder.logBridge), level at LOG_TOP. The deck
// is the middle 1.8 m of that flat, so a cat on the deck is on the log, and it
// is wide enough that a thumb on the stick doesn't bounce off the bank. The
// trunk runs 1.5 m onto each bank so the crossing starts on dry ground.
// test/woods.test.js raycasts the built log across the whole deck.
const LOG_X = -4.5;
const LOG_W = 3.0;
const LOG_FLAT = 1.9;
const LOG_TOP = 0.16;
const LOG_HALF = 0.9;
const LOG_BRIDGE = Object.freeze({ minX: LOG_X - LOG_HALF, maxX: LOG_X + LOG_HALF, minZ: -15.5, maxZ: -7.5 });

// The stepping stones over river-north: fourteen broad flat stones in a
// straight line at z -29, from bank to bank, set close and staggered in height
// so they overlap without a gap of open water anywhere along the strip the
// deck covers (1.5 m wide; test/woods.test.js raycasts it). The deck has to be
// as wide as the stones look, or a cat walking on their visible edge is
// stopped by the water. Rounder stones (16 sides, not 8), set closer and with
// no sideways jitter, keep the dry edge within about 8 cm of where the stones
// leave the water (±0.83), so the deck can reach ±0.75 and never past them.
const STONES_Z = -29;
const STONES = { n: 14, rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 };
const STONES_HALF = 0.75;
const STEPPING_STONES = Object.freeze({
  minX: 16.5, maxX: 24.5, minZ: STONES_Z - STONES_HALF, maxZ: STONES_Z + STONES_HALF,
});

// The waters. Every footprint runs on past the bounds where its water does,
// so the lake opens out to the horizon and the river leaves the map west and
// north rather than stopping at a wall.
const LAKE = Object.freeze({ id: 'lake', kind: 'rect', minX: -120, maxX: -14, minZ: -120, maxZ: -34, shallow: 1.2 });
const POND = Object.freeze({ id: 'pond', kind: 'circle', x: -44, z: -6, r: 6, shallow: 1.2 });
// It runs past the west bound, so the river (not one tangent point of the
// pond) is what separates the glade from the south along the west edge.
const RIVER_WEST = Object.freeze({
  id: 'river-west', kind: 'rect', minX: -120, maxX: 23, minZ: -14, maxZ: -9, shallow: 1.2,
  decks: Object.freeze([LOG_BRIDGE]),
});
// Turns north to the Moor.
const RIVER_NORTH = Object.freeze({
  id: 'river-north', kind: 'rect', minX: 18, maxX: 23, minZ: -120, maxZ: -9, shallow: 1.2,
  decks: Object.freeze([STEPPING_STONES]),
});

export const WOODS_WATERS = Object.freeze([LAKE, POND, RIVER_WEST, RIVER_NORTH]);

// How each water is drawn. One peaty green-blue for all of it, because the
// pond, the river and the lake are one water. The heights differ where the
// footprints overlap (the pond over the river, river-west over river-north)
// so the overlapping planes never fight for the same pixel; 1 cm apart is far
// more than the depth buffer needs at walk distances.
//
// `shores` lists only the edges a cat can see: an edge 70 m out past the
// bounds is open water to the horizon, not a bank, and painting foam on it
// would be a lie (water.js's createWater note; the Seaside does the same).
// Where two footprints overlap, the lower one's edge inside the upper one is
// hidden under it.
const WATER_COLOR = 0x5f98a8;
const WATER_LOOK = {
  lake: { y: 0.03, shores: ['maxX', 'maxZ'] },
  pond: { y: 0.04 },
  'river-west': { y: 0.03, shores: ['minZ', 'maxZ', 'maxX'] },
  'river-north': { y: 0.02, shores: ['minX', 'maxX', 'maxZ'] },
};

// The paths, as [x1, z1, x2, z2] centreline segments, all 3 m wide. The
// short path comes in from Twolegplace to the clearing; the long path runs
// along the south edge toward the River and Marshes; the north path runs up
// the east side to the Moor; the glade path goes from the clearing over the
// log bridge to the lakeshore (the bridge itself is the gap between its two
// segments).
export const WOODS_PATHS = Object.freeze([
  [50, 12, 26, 6], [26, 6, 6, 10],
  [50, 40, 0, 44], [0, 44, -50, 40],
  [46, 12, 46, -50],
  [6, 10, -4.5, -6], [-4.5, -17, -18, -24],
].map((s) => Object.freeze(s)));
const PATH_W = 3;
const PATH_STYLE = { surface: 'sand', color: 0x9c7c58 };

// The sunny clearing: no trees.
const CLEARING = { x: 4, z: 12, r: 9 };

// The fallen log on the edge of the clearing, a seat and a first hop.
const FALLEN_LOG = { x: -2, z: 16, length: 5, yaw: 0.3 };

// --- the things to find ------------------------------------------------------
// Laid out before the trees and the undergrowth, because KEEP_CLEAR (below) is
// built from these very records: whatever a kid hunts for, nothing grows on it.

// The nine points of interest the race and the quests draw on. Each stands at
// least 2 m from the water and far enough from every trunk and rock that
// spots.js's clearSpot leaves it exactly where it is, so a race ring stands on
// its POI (test/woods.test.js checks both, and floods each one from the spawn).
const POIS = [
  [4, 12], [-30, 2], [-20, -24], [30, -24], [36, 30], [-12, 32], [-36, 22], [16, -2], [40, -40],
].map(([x, z]) => ({ x, z }));

const SCENICS = [
  { id: 'lake-view', x: -26, z: -30, label: 'the lakeshore' },
  { id: 'woods-pond', x: -34, z: -2, label: 'the pond on the border' },
  { id: 'great-oak', x: 6, z: 23, label: 'the great oak' },
];

const COLLECTIBLES = [
  { id: 'woods-find-1', x: -8, z: 26, label: 'a glossy acorn' },
  { id: 'woods-find-2', x: 30, z: -34, label: 'a jay feather' },
  { id: 'woods-find-3', x: -28, z: -20, label: 'a snail shell by the river' },
  { id: 'woods-find-4', x: 32, z: 24, label: 'a dry oak leaf, just right for a nest' },
  // on the Lookout Rocks' first rock, so one hop up
  { id: 'woods-find-5', x: -22, z: -26, y: 0.72, label: 'a ball of moss on the lookout rock' },
];

// The two climb chains, two hops each, the shape the park's oak and the
// seaside's dune use. The Great Oak: a mossy boulder at the foot of the
// biggest tree in the wood, then its low branch, 2.13 m across and 1.38 m up
// from the boulder (inside the 2.6 reach and the 1.6 climb), and at 2.1 too
// high to reach from the grass. Lookout Rocks on the lakeshore: a low rock,
// then a tall one 1.41 m across and 1.18 m up. A golden mouse sits on each top
// (src/goldmice.js). The colliders sit under the perches, so a cat walks round
// the rocks and up onto them.
const GREAT_OAK = { x: 9.6, z: 21.4, scale: 1.6, r: 0.8 };
const CHAIN_ROCKS = [
  { x: 8, z: 20, r: 0.7 },
  { x: -22, z: -26, r: 0.7 },
];
const OAK_ROOT = { x: 8.77, z: 20.67, r: 0.35 };
const LOOKOUT_TOP = { x: -23, z: -27, y: 1.9, r: 0.9, rTop: 0.75, rBottom: 1.0 };
const CHAIN_PERCHES = [
  { x: 8, z: 20, y: 0.72, kind: 'stone' },
  { x: GREAT_OAK.x, z: GREAT_OAK.z, y: 2.1, kind: 'tree', label: 'great oak lookout', vantage: true },
  { x: -22, z: -26, y: 0.72, kind: 'stone' },
  { x: LOOKOUT_TOP.x, z: LOOKOUT_TOP.z, y: LOOKOUT_TOP.y, kind: 'stone', label: 'lookout rocks', vantage: true },
];

// The bushes the third golden mouse hides among. A bush has no collider, as
// in the park: a cat pushes through to the mouse.
const GOLD_BUSHES = [[-36, 28], [-40, 28], [-38, 33]];

const PUDDLES = [{ x: 20, z: 34, r: 0.9 }, { x: -16, z: 6, r: 0.8 }];

// Places a tree must keep 4 m from, and every fern and bramble its own
// distance (FERN.clear, BRAMBLE.clear), so nothing the kids look for is
// hidden in a trunk, under a canopy or under a frond: every POI (and so every
// race ring), scenic, collectible, golden mouse, chain perch, the bushes the
// hidden mouse needs, the puddles and the spawn. Built from the records
// themselves, so a find can never move without its clearance moving with it.
// The fallen log is kept clear along its length, below.
const KEEP_CLEAR = [
  ...POIS, ...SCENICS, ...COLLECTIBLES, ...GOLD_MICE.woods, ...CHAIN_PERCHES,
  ...GOLD_BUSHES.map(([x, z]) => ({ x, z })), ...PUDDLES, SPAWN,
].map(({ x, z }) => [x, z]);

// Distance from (x, z) to a segment.
function segDist(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}

// The fallen log's two ends: it lies along its local z, turned to `yaw`.
function fallenLogEnds() {
  const h = FALLEN_LOG.length / 2;
  const sx = Math.sin(FALLEN_LOG.yaw), sz = Math.cos(FALLEN_LOG.yaw);
  return [FALLEN_LOG.x - sx * h, FALLEN_LOG.z - sz * h, FALLEN_LOG.x + sx * h, FALLEN_LOG.z + sz * h];
}

// How far (x, z) is from the nearest water's edge, decks ignored: a deck is
// dry for a cat but it is still a river for a tree.
const waterDist = (x, z) => Math.min(...WOODS_WATERS.map((w) => b.waterGap(w, x, z)));

// Distance from (x, z) to an axis-aligned rectangle (0 inside it).
const rectDist = (d, x, z) => Math.hypot(
  Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
const DECKS = [LOG_BRIDGE, STEPPING_STONES];

// A tree's clearance from a path's centreline grows with the tree: the
// path's half-width, then the canopy's reach (builder.tree's 1.6 m blob,
// scaled with the tree, and low enough to be at camera height), then half a
// metre, so the camera following the cat down a path never ends up inside
// a canopy.
const pathClearance = (scale) => PATH_W / 2 + 1.6 * scale + 0.5;

function treeFits(x, z, scale) {
  if (waterDist(x, z) < 3) return false;
  // the crossings stay open to see from the paths and the banks
  if (DECKS.some((d) => rectDist(d, x, z) < 4)) return false;
  if (WOODS_PATHS.some((s) => segDist(x, z, ...s) < pathClearance(scale))) return false;
  if (KEEP_CLEAR.some(([px, pz]) => Math.hypot(x - px, z - pz) < 4)) return false;
  if (segDist(x, z, ...fallenLogEnds()) < 4) return false;
  return Math.hypot(x - CLEARING.x, z - CLEARING.z) >= CLEARING.r;
}

// Rounded so the spots are clean data (they end up in colliders and perches).
const r2 = (v) => Math.round(v * 100) / 100;

// The scenery trees: an 8 m grid, each cell's tree jittered up to 2.5 m, kept
// only where it fits, so the canopies close over the cat between the paths
// and the clearing opens to the sky. Seeded by name rather than drawn from the
// walk's rng, so every walk and both co-walkers get the same wood. Every cell
// draws its three numbers whether or not its tree is kept, so moving one
// clearance never reshuffles the rest of the wood.
//
// The cap is the budget: each tree is two meshes and two shadow casters, and
// 80 of them keeps the Woods inside the Cozy Neighborhood's merged ceiling of
// 205 casters with room to spare (test/budget.test.js).
const TREE_CELL = 8;
const TREE_JITTER = 2.5;
const MAX_TREES = 80;
export function woodsTreeSpots() {
  const rng = mulberry32(seedFromCode('woods-trees'));
  const spots = [];
  for (let gz = BOUNDS.minZ + TREE_CELL / 2; gz < BOUNDS.maxZ; gz += TREE_CELL) {
    for (let gx = BOUNDS.minX + TREE_CELL / 2; gx < BOUNDS.maxX; gx += TREE_CELL) {
      const x = r2(gx + (rng() * 2 - 1) * TREE_JITTER);
      const z = r2(gz + (rng() * 2 - 1) * TREE_JITTER);
      const scale = r2(1.0 + 0.6 * rng());
      if (spots.length < MAX_TREES && treeFits(x, z, scale)) spots.push({ x, z, scale });
    }
  }
  return spots;
}

// The undergrowth: ferns all through the wood and a few bramble thickets,
// seeded by name like the trees. None has a collider (a cat pushes through),
// and every clump keeps off the paths, the decks, the water's edge, the
// spawn, the clearing and every KEEP_CLEAR place, so nothing the kids walk to
// or look for is hidden. The brambles stand taller (under a metre), so they
// keep further back: from the paths, and well away from the crossings, so the
// log and the stones stay in sight from the path.
const FERN = { cell: 4, jitter: 1.5, keep: 0.55, path: 2.3, water: 1.5, deck: 3, clear: 3, spawn: 4, trunk: 1 };
const BRAMBLE = { cell: 9, jitter: 2.5, keep: 0.6, path: 3.8, water: 2.5, deck: 7, clear: 4.5, spawn: 7, trunk: 1.6 };
function undergrowthFits(x, z, rule, trees) {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return false;
  if (waterDist(x, z) < rule.water) return false;
  if (DECKS.some((d) => rectDist(d, x, z) < rule.deck)) return false;
  if (WOODS_PATHS.some((s) => segDist(x, z, ...s) < rule.path)) return false;
  if (KEEP_CLEAR.some(([px, pz]) => Math.hypot(x - px, z - pz) < rule.clear)) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < rule.spawn) return false;
  if (segDist(x, z, ...fallenLogEnds()) < rule.clear) return false;
  if (trees.some((t) => Math.hypot(x - t.x, z - t.z) < rule.trunk * t.scale)) return false;
  return Math.hypot(x - CLEARING.x, z - CLEARING.z) >= CLEARING.r;
}
function scatter(rng, rule, trees) {
  const spots = [];
  for (let gz = BOUNDS.minZ + rule.cell / 2; gz < BOUNDS.maxZ; gz += rule.cell) {
    for (let gx = BOUNDS.minX + rule.cell / 2; gx < BOUNDS.maxX; gx += rule.cell) {
      const x = r2(gx + (rng() * 2 - 1) * rule.jitter);
      const z = r2(gz + (rng() * 2 - 1) * rule.jitter);
      const keep = rng() < rule.keep;
      if (keep && undergrowthFits(x, z, rule, trees)) spots.push({ x, z });
    }
  }
  return spots;
}
export function woodsUndergrowth() {
  const rng = mulberry32(seedFromCode('woods-undergrowth'));
  const trees = woodsTreeSpots();
  const ferns = scatter(rng, FERN, trees);
  const brambles = scatter(rng, BRAMBLE, trees);
  return { ferns, brambles };
}

// Reeds, a clump every 2.5 m: round the pond's east half, along the
// lakeshore, and along both banks of the river. Each clump stands just on the
// bank, and none within 1.5 m of a deck, so the crossings stay clear to see
// and to walk onto.
const REED_STEP = 2.5;
function reedSpots() {
  const spots = [];
  const add = (x, z) => {
    if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return;
    if (b.inWater(WOODS_WATERS.map((w) => ({ ...w, decks: [] })), x, z)) return;
    const nearDeck = [LOG_BRIDGE, STEPPING_STONES].some((d) => x > d.minX - 1.5 && x < d.maxX + 1.5
      && z > d.minZ - 1.5 && z < d.maxZ + 1.5);
    if (!nearDeck) spots.push({ x: r2(x), z: r2(z) });
  };
  // the pond's east half, half a metre out from the water
  const pr = POND.r + 0.5;
  const n = Math.round((Math.PI * pr) / REED_STEP);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    add(POND.x + Math.cos(a) * pr, POND.z + Math.sin(a) * pr);
  }
  // the lakeshore
  for (let x = -45; x <= -16; x += REED_STEP) add(x, LAKE.maxZ + 1);
  // river-west's two banks
  for (let x = BOUNDS.minX; x <= RIVER_WEST.maxX; x += REED_STEP) {
    add(x, RIVER_WEST.minZ - 0.5);
    add(x, RIVER_WEST.maxZ + 0.5);
  }
  // river-north's two banks
  for (let z = BOUNDS.minZ; z <= RIVER_NORTH.maxZ; z += REED_STEP) {
    add(RIVER_NORTH.minX - 0.5, z);
    add(RIVER_NORTH.maxX + 0.5, z);
  }
  return spots;
}

// The island out on the lake: a low grassy mound with one big tree, seen
// across the water from the lakeshore. Painted scenery, well outside the
// bounds, so it has no collider and no perch.
const ISLAND = { x: -72, z: -72, r: 9, rise: 1.4 };

// The wood's critters: birds in the first four trees, a squirrel on each
// side of the river, butterflies in the clearing, ducks on the pond and two
// mice in the leaf litter. No villagers: no Twolegs walk in the Woods.
function critterSpawns() {
  return [
    ...woodsTreeSpots().slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })),
    { type: 'squirrel', x: -24, z: 30, x2: -30, z2: 10 },
    { type: 'squirrel', x: 28, z: -10, x2: 36, z2: -30 },
    { type: 'butterfly', x: 2, z: 8 }, { type: 'butterfly', x: 8, z: 14 }, { type: 'butterfly', x: -2, z: 12 },
    { type: 'duck', x: -44, z: -6 }, { type: 'duck', x: -42, z: -4 }, { type: 'duck', x: -46, z: -8 },
    { type: 'mouse', x: -9, z: 25, x2: -4, z2: 30 },
    { type: 'mouse', x: 30, z: 26, x2: 34, z2: 20 },
  ];
}

// A mossy boulder, the first step of each chain: builder.rock's shape and
// height (its top is just over the 0.72 perch), in a greener stone.
const MOSSY = 0x7f8a6c;
function mossyBoulder(x, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), litMaterial(MOSSY, surfaceProps('cobble')));
  m.position.set(x, 0.3, z);
  return m;
}

export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, 0xa8d8c0, 0xd0ead8);
  scene.add(b.ground(120, 0x5f9a4a, { surface: 'grass' }));

  // The horizon. Hills all round, as the other green areas have, but each
  // side tinted for the neighbour over it: heather to the north (the Moor),
  // the reedbeds' pale green to the west (the River and Marshes), the wood's
  // own deep green to the south, a garden green to the east, with Twolegplace's
  // rooftops over the fence on the south-east stretch. None where the lake
  // is, so the lake opens out to the sky.
  scene.add(b.horizonBand({
    kind: 'hills', inner: 56, outer: 116, height: 7, wavelength: 34,
    color: 0x5d8a55, salt: 31, avoid: [LAKE],
    sideTints: { north: 0x9a8a9c, east: 0x7e9a6e, south: 0x4f7a48, west: 0x8fa070 },
    rooftops: { from: 0.1, to: 0.25, count: 14, height: 6 },
  }));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });
  const perches = [];

  // --- the water --------------------------------------------------------------
  // Each mesh is built from its footprint record and added to the scene root
  // directly (test/water.test.js matches against scene.children).
  const waterFx = WOODS_WATERS.map((w) => {
    const fx = createWater(w, {
      ...WATER_LOOK[w.id],
      color: WATER_COLOR,
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
  const stones = b.steppingStones(17.0, STONES_Z, 24.0, STONES_Z, STONES.n, STONES);
  stones.name = 'steppingStones';
  scene.add(stones);

  // --- the paths --------------------------------------------------------------
  for (const s of WOODS_PATHS) scene.add(b.path(...s, PATH_W, PATH_STYLE));

  // --- reeds --------------------------------------------------------------------
  scene.add(b.reedBed(reedSpots(), seedFromCode('woods-reeds')));

  // --- the undergrowth ----------------------------------------------------------
  const { ferns, brambles } = woodsUndergrowth();
  const fernMesh = b.fernBed(ferns, seedFromCode('woods-ferns'));
  fernMesh.name = 'ferns';
  scene.add(fernMesh);
  const brambleMesh = b.brambleBed(brambles, seedFromCode('woods-brambles'));
  brambleMesh.name = 'brambles';
  scene.add(brambleMesh);

  // --- the trees ----------------------------------------------------------------
  // A collider a little wider than the trunk, growing with it, and a Sure
  // Claws fork on every one (climbing.js caps the fork at 1.9, so no scenery
  // tree out-tops the Great Oak's branch).
  for (const { x, z, scale } of woodsTreeSpots()) {
    scene.add(b.tree(x, z, scale, { wind }));
    addC(x, z, r2(0.5 * scale));
    perches.push(sureClawsTreePerch(x, z, scale));
  }

  // --- the fallen log -----------------------------------------------------------
  // Three colliders 1.6 m apart along it, so a cat walks round it rather than
  // through it, and a perch on top at its middle.
  scene.add(b.fallenLog(FALLEN_LOG.x, FALLEN_LOG.z, FALLEN_LOG.length, FALLEN_LOG.yaw));
  for (const k of [-1, 0, 1]) {
    addC(r2(FALLEN_LOG.x + k * 1.6 * Math.sin(FALLEN_LOG.yaw)), r2(FALLEN_LOG.z + k * 1.6 * Math.cos(FALLEN_LOG.yaw)), 0.4);
  }
  perches.push({ x: FALLEN_LOG.x, z: FALLEN_LOG.z, y: 0.5, kind: 'tree' });

  // --- the climb chains -----------------------------------------------------------
  // The Great Oak, with its mossy boulder at the foot, and Lookout Rocks on
  // the lakeshore: a low rock and a tall flat-topped one, its top at the 1.9
  // perch. Named so test/woods.test.js can find the oak and see past it.
  const oak = b.tree(GREAT_OAK.x, GREAT_OAK.z, GREAT_OAK.scale, { wind });
  oak.name = 'greatOak';
  // The low branch the golden mouse sits out on (src/goldmice.js), reaching
  // west from the trunk to just past the mouse, its top under the mouse's
  // belly. A child of the oak, in its scaled frame, so it sways with it.
  const s = GREAT_OAK.scale;
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 / s, 0.12 / s, 0.75 / s, 6),
    litMaterial(0x7a5230, surfaceProps('bark')),
  );
  limb.rotation.z = Math.PI / 2;
  limb.position.set(-0.6 / s, 1.9 / s, 0);
  oak.add(limb);
  scene.add(oak);
  addC(GREAT_OAK.x, GREAT_OAK.z, GREAT_OAK.r);
  for (const { x, z, r } of CHAIN_ROCKS) {
    scene.add(mossyBoulder(x, z));
    addC(x, z, r);
  }
  // The boulder sits in the oak's roots. The crevice between their colliders
  // is 0.63 m, narrower than a cat, so one more collider closes it rather than
  // leave a dead-end notch (test/water.test.js finds it as a stranded cell).
  addC(OAK_ROOT.x, OAK_ROOT.z, OAK_ROOT.r);
  const lookout = new THREE.Mesh(
    new THREE.CylinderGeometry(LOOKOUT_TOP.rTop, LOOKOUT_TOP.rBottom, LOOKOUT_TOP.y, 7),
    litMaterial(0x8e8c88, surfaceProps('cobble')),
  );
  lookout.position.set(LOOKOUT_TOP.x, LOOKOUT_TOP.y / 2, LOOKOUT_TOP.z);
  scene.add(lookout);
  addC(LOOKOUT_TOP.x, LOOKOUT_TOP.z, LOOKOUT_TOP.r);
  perches.push(...CHAIN_PERCHES.map((p) => ({ ...p })));

  // --- the hidden mouse's bushes, and the puddles ---------------------------------
  for (const [x, z] of GOLD_BUSHES) scene.add(b.bush(x, z, { wind }));
  for (const p of PUDDLES) scene.add(b.puddle(p.x, p.z, p.r));

  // --- the island -----------------------------------------------------------------
  // A flattened sphere, so only a low dome shows above the lake, and the
  // tree stood on its crown.
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(ISLAND.r, 24, 8),
    litMaterial(0x6a9a50, surfaceProps('grass')),
  );
  mound.scale.y = ISLAND.rise / ISLAND.r;
  mound.position.set(ISLAND.x, 0, ISLAND.z);
  scene.add(mound);
  const islandTree = b.tree(ISLAND.x, ISLAND.z, 2.6, { wind });
  islandTree.position.y = ISLAND.rise - 0.2;
  scene.add(islandTree);

  return {
    name: 'The Woods',
    colliders,
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made in the Woods.
    boxes: [],
    tippables: [],
    pois: POIS.map((p) => ({ ...p })),
    collectibles: COLLECTIBLES.map((c) => ({ ...c })),
    scenics: SCENICS.map((c) => ({ ...c })),
    critterSpawns: critterSpawns(),
    moments: [
      { id: 'squirrel-dash', label: 'two squirrels racing up the great oak', x: 9, z: 24, from: { x: 20, z: 30 } },
    ],
    puddles: PUDDLES.map((p) => ({ ...p })),
    waters: WOODS_WATERS,
    waterFx,
    groundBounce: 0x5f9a4a,
    skyDusk: { top: 0x26344f, horizon: 0x5f5a72 },
    perches,
  };
}
