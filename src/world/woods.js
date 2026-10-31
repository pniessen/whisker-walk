import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { sureClawsTreePerch } from '../climbing.js';
import { mulberry32, seedFromCode } from '../rng.js';

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

// The log bridge over river-west. builder.logBridge sinks a trunk of diameter
// `w` so its top is at `y`, which leaves a ridge of the trunk showing above
// the water rather than its full width. LOG_W and LOG_TOP are sized so about
// 1.1 m of log shows over the river, and the deck is that strip; the trunk
// runs 1.5 m onto each bank so the crossing starts on dry ground.
// test/woods.test.js raycasts the built log across the whole deck.
const LOG_X = -4.5;
const LOG_W = 2.8;
const LOG_TOP = 0.18;
const LOG_HALF = 0.55;
const LOG_BRIDGE = Object.freeze({ minX: LOG_X - LOG_HALF, maxX: LOG_X + LOG_HALF, minZ: -15.5, maxZ: -7.5 });

// The stepping stones over river-north: seven flat stones in a line at z -29,
// from bank to bank. The deck is the strip the stones cover, about a metre.
const STONES_Z = -29;
const STEPPING_STONES = Object.freeze({ minX: 16.5, maxX: 24.5, minZ: STONES_Z - 0.5, maxZ: STONES_Z + 0.5 });

// The waters. Every footprint runs on past the bounds where its water does,
// so the lake opens out to the horizon and the river leaves the map west and
// north rather than stopping at a wall.
const LAKE = Object.freeze({ id: 'lake', kind: 'rect', minX: -120, maxX: -14, minZ: -120, maxZ: -34 });
const POND = Object.freeze({ id: 'pond', kind: 'circle', x: -44, z: -6, r: 6 });
// It runs past the west bound, so the river (not one tangent point of the
// pond) is what separates the glade from the south along the west edge.
const RIVER_WEST = Object.freeze({
  id: 'river-west', kind: 'rect', minX: -120, maxX: 23, minZ: -14, maxZ: -9,
  decks: Object.freeze([LOG_BRIDGE]),
});
// Turns north to the Moor.
const RIVER_NORTH = Object.freeze({
  id: 'river-north', kind: 'rect', minX: 18, maxX: 23, minZ: -120, maxZ: -9,
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

// Places a tree must keep 4 m from, so nothing the kids look for is hidden in
// a trunk or under a canopy: the POIs, scenics, collectibles, golden mice and
// perch chains the Woods' content is laid out on (plan, "The Woods in
// numbers"), and the spawn. The fallen log is kept clear along its length,
// below.
const KEEP_CLEAR = [
  // points of interest
  [4, 12], [-30, 2], [-20, -24], [30, -24], [36, 30], [-12, 32], [-36, 22], [16, -2], [40, -40],
  // scenics
  [-26, -30], [-34, -2], [6, 23],
  // collectibles
  [-8, 26], [30, -34], [-28, -20], [32, 24], [-22, -26],
  // golden mice, and the bushes the third one hides in
  [9.6, 21.4], [-23, -27], [-38, 30], [-36, 28], [-40, 28], [-38, 33],
  // the Great Oak and Lookout Rocks chains
  [8, 20], [-22, -26],
  [SPAWN.x, SPAWN.z],
];

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

function treeFits(x, z) {
  if (waterDist(x, z) < 3) return false;
  if (WOODS_PATHS.some((s) => segDist(x, z, ...s) < 3)) return false;
  if (KEEP_CLEAR.some(([px, pz]) => Math.hypot(x - px, z - pz) < 4)) return false;
  if (segDist(x, z, ...fallenLogEnds()) < 4) return false;
  return Math.hypot(x - CLEARING.x, z - CLEARING.z) >= CLEARING.r;
}

// Rounded so the spots are clean data (they end up in colliders and perches).
const r2 = (v) => Math.round(v * 100) / 100;

// The scenery trees: a 12 m grid, each cell's tree jittered up to 4 m, kept
// only where it fits. Seeded by name rather than drawn from the walk's rng, so
// every walk and both co-walkers get the same wood. Every cell draws its three
// numbers whether or not its tree is kept, so moving one clearance never
// reshuffles the rest of the wood.
const TREE_CELL = 12;
const TREE_JITTER = 4;
const MAX_TREES = 32;
export function woodsTreeSpots() {
  const rng = mulberry32(seedFromCode('woods-trees'));
  const spots = [];
  for (let gz = BOUNDS.minZ + TREE_CELL / 2; gz < BOUNDS.maxZ; gz += TREE_CELL) {
    for (let gx = BOUNDS.minX + TREE_CELL / 2; gx < BOUNDS.maxX; gx += TREE_CELL) {
      const x = r2(gx + (rng() * 2 - 1) * TREE_JITTER);
      const z = r2(gz + (rng() * 2 - 1) * TREE_JITTER);
      const scale = r2(1.0 + 0.6 * rng());
      if (spots.length < MAX_TREES && treeFits(x, z)) spots.push({ x, z, scale });
    }
  }
  return spots;
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
  const bridge = b.logBridge(LOG_X, LOG_BRIDGE.minZ, LOG_X, LOG_BRIDGE.maxZ, LOG_W, LOG_TOP);
  bridge.name = 'logBridge';
  scene.add(bridge);
  const stones = b.steppingStones(17.2, STONES_Z, 23.8, STONES_Z, 7);
  stones.name = 'steppingStones';
  scene.add(stones);

  // --- the paths --------------------------------------------------------------
  for (const s of WOODS_PATHS) scene.add(b.path(...s, PATH_W, PATH_STYLE));

  // --- reeds --------------------------------------------------------------------
  scene.add(b.reedBed(reedSpots(), seedFromCode('woods-reeds')));

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
    // The finds, the race's POIs and the critters land in the next step.
    pois: [],
    collectibles: [],
    scenics: [],
    critterSpawns: [],
    moments: [],
    puddles: [],
    waters: WOODS_WATERS,
    waterFx,
    groundBounce: 0x5f9a4a,
    skyDusk: { top: 0x26344f, horizon: 0x5f5a72 },
    perches,
  };
}
