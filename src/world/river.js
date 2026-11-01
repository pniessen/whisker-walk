import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';

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
    pois: [],
    collectibles: [],
    scenics: [],
    critterSpawns: [],
    moments: [],
    puddles: [],
    waters: RIVER_WATERS,
    waterFx,
    groundBounce: 0x7d9c55,
    skyDusk: { top: 0x283652, horizon: 0x6a6478 },
    perches,
  };
}
