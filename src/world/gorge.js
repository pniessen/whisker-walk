import * as b from './builder.js';
import { createWater } from '../render/water.js';
import {
  WALK_SHAPES, MASSES, CEILINGS, GORGE_CAVES, GORGE_DENS, STAND_ON, gorgeGround, mapShapes,
} from './gorgeshape.js';
import { seedFromCode } from '../rng.js';

// =============================================================================
// The Gorge.
//
// A deep rock gorge east of the Moor: a shaded floor with a stream down it,
// and a path cut into the east wall that climbs in three legs, hairpin by
// hairpin, past the Lookout Ledge and the Wide Ledge to a bright clifftop with
// a view down the whole gorge. Its shape (every ledge, leg, lip, rock mass,
// cave and den) is data in gorgeshape.js; this file draws it and adds the
// sky, the stream, the paths and the horizon. Coordinates are metres, x east
// and z south, so north is -z.
//
// WHERE ITS EDGES FACE (G1). The Gorge sits directly east of the Moor in the
// same z frame: a Moor point (x, z) is the Gorge point (x - 100, z).
//   * west is the Moor. The Narrows (x < -18, z -16..-6) is the way in, and
//     the cat spawns in it, 6 m in from the border;
//   * south is Twolegplace. The gorge walls hide it, so the horizon shows its
//     rooftops there, past the stream leaving the map;
//   * north and east are more mountains, so the hills are rock-coloured.
//
// SHADED BELOW, BRIGHT ABOVE (G5). The rock's baked colours run from cool and
// dark at the floor to warm at the top (builder.rockTerrain), and the floor's
// ground plane is darker and cooler than any other map's, so the floor reads
// shaded from the clifftop even past the shadow map's reach. The clifftop is
// lit, and what a kid goes up there for sits south of z -27, out of the north
// rim's afternoon shade.
//
// WHY THE RIMS ARE 20 M (G6). Every mass at the map's edges is 20 m high, above
// the clifftop camera at ordinary framing, so the rims close the view. From
// the highest camera (zoom step 3, pitched right up, on the Summit Rock) she
// sees over them, onto rock tops drawn as rock and the tall horizon band
// beyond; test/gorge.test.js checks every look down from there lands on
// something. The west wall is lower (9 m), so the view from the clifftop goes
// over it towards the Moor.
//
// The three deep caves are cut into the rock here, but they are walked (lit,
// dressed, and given a camera of their own) in part 3. The Wide Ledge's south
// end and the den behind it wait for the camp: nothing is put there yet.
//
// Nothing here reads which way the game is being played: the Gorge builds the
// same for everyone.
// =============================================================================

// Where a walk places the cat: in the Narrows, 6 m in from the Moor.
export const SPAWN = Object.freeze({ x: -44, z: -11 });

const BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });

// The stepping stones over the stream, on the Narrows path's line: the Woods'
// broad flat stones, eight of them across 3.5 m, 0.5 m apart (the Woods' are
// 0.54), so they overlap with no open water between them anywhere on the deck.
// Four, as first planned, left water between the stones at the deck's edges.
// The deck is the part a cat can stand on, 1.5 m wide, and runs onto both
// banks; test/gorge.test.js raycasts the stones across all of it.
const STONES_Z = -11;
const STONES = { n: 8, rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 };
const STEPPING_STONES = Object.freeze({ minX: -10.5, maxX: -7, minZ: -11.75, maxZ: -10.25 });

// The stream: one narrow water down the floor, from the north edge to the
// south edge and on past both, wadeable everywhere (its shallow band is half
// its 1.5 m width, so it is never deep). It lies only on base ground.
const STREAM = Object.freeze({
  id: 'stream', kind: 'rect', minX: -9.5, maxX: -8, minZ: -62, maxZ: 62, shallow: 0.75,
  decks: Object.freeze([STEPPING_STONES]),
});
export const GORGE_WATERS = Object.freeze([STREAM]);

// How the stream is drawn: a grey-blue mountain water, banked on both sides.
const WATER_LOOK = { stream: { y: 0.03, color: 0x6a9aa8, shores: ['minX', 'maxX'] } };

// The paths, as [x1, z1, x2, z2] centreline segments, all 3 m wide, all on
// the floor. The Narrows path comes in from the Moor's border and stops short
// of the stream (the stones are the gap after its end); the floor path takes
// it on from the far bank, south past the foot of leg A and on to the south
// edge, and north to the north edge.
export const GORGE_PATHS = Object.freeze([
  // the Narrows path
  [-50, -11, -11.5, -11],
  // the floor path, south
  [-6, -11, -3, 10], [-3, 10, -1, 30],
  // to the foot of leg A, ending on its centreline 3 m south of it. Not
  // 36.5: a line to there clips the south-west corner of leg A's lip by 2 cm.
  [-1, 30, 3.9, 37],
  // to the south edge
  [-1, 30, -2, 50],
  // the floor path, north
  [-6, -11, -4, -30], [-4, -30, -3, -50],
].map((s) => Object.freeze(s)));
const PATH_W = 3;
const PATH_STYLE = { surface: 'sand', color: 0x8a7a64 };

// The horizon: tall hills (40 m, over the 20 m rims), tinted for what is over
// each edge: more rock north and east, the town's warm brick to the south past
// the gorge's mouth with its rooftops on the south arc, the Moor's heather to
// the west. The hills come down to the stream where it leaves the map.
export const GORGE_HORIZON = Object.freeze({
  kind: 'hills', inner: 56, outer: 116, height: 40, wavelength: 40,
  color: 0x8a8478, salt: 53,
  avoid: Object.freeze([STREAM]),
  sideTints: Object.freeze({ north: 0x8a8478, east: 0x7d7a74, south: 0x9a7f6e, west: 0x9a8a9c }),
  rooftops: Object.freeze({ from: 0.28, to: 0.47, count: 10, height: 6 }),
});

// The climb race: five rings from the floor, up the legs, to a clifftop
// finish, always in this order (G8).
const RACE_COURSE = Object.freeze([
  [-3, 6], [3.9, 28], [5.6, -5], [10.5, 33.5], [16, -24],
].map(([x, z]) => Object.freeze({ x, z })));

// What the rock is drawn from: the walkable shapes and every cave and den
// floor, the masses and the ceilings. The same records the ground is built
// from, so what she stops at is what she sees.
const ROCK_WALKS = Object.freeze([...WALK_SHAPES, ...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS]);

const GROUND_COLOR = 0x5f5d52;

// The run-time hook for what only the Gorge does on a walk (Task 8). Nothing
// yet.
const noLife = () => ({ update() {}, dispose() {} });

// `wind` is for the swaying scenery, which comes later.
// eslint-disable-next-line no-unused-vars
export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, 0x9fb6c8, 0xd2d4cc);
  const plane = b.ground(120, GROUND_COLOR, { surface: 'grass' });
  plane.name = 'groundPlane';
  scene.add(plane);
  scene.add(b.horizonBand(GORGE_HORIZON));

  // --- the rock ---------------------------------------------------------------
  const rock = b.rockTerrain({
    walks: ROCK_WALKS, masses: MASSES, ceilings: CEILINGS, seed: seedFromCode('gorge-rock'),
  });
  rock.name = 'gorgeRock';
  scene.add(rock);

  // --- the stream -------------------------------------------------------------
  // Built from its footprint record and added to the scene root directly
  // (test/water.test.js matches against scene.children).
  const waterFx = GORGE_WATERS.map((w) => {
    const fx = createWater(w, {
      ...WATER_LOOK[w.id],
      quality: water.quality ?? 'high',
      reducedMotion: water.reducedMotion ?? false,
      waters: GORGE_WATERS,
    });
    scene.add(fx.mesh);
    return fx;
  });
  const stones = b.steppingStones(STEPPING_STONES.minX, STONES_Z, STEPPING_STONES.maxX, STONES_Z, STONES.n, STONES);
  stones.name = 'steppingStones';
  scene.add(stones);

  // --- the paths --------------------------------------------------------------
  for (const s of GORGE_PATHS) scene.add(b.path(...s, PATH_W, PATH_STYLE));

  return {
    name: 'The Gorge',
    colliders: [],
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made in the Gorge.
    boxes: [],
    tippables: [],
    pois: [],
    collectibles: [],
    scenics: [],
    critterSpawns: [],
    moments: [],
    puddles: [],
    waters: GORGE_WATERS,
    waterFx,
    groundBounce: GROUND_COLOR,
    skyDusk: { top: 0x26304a, horizon: 0x6a5a68 },
    perches: [],
    // Strays and ghosts stand only where a cat can walk (G7; keepout.js reads
    // onlyOn from Task 10).
    keepOut: { rects: [], capsules: [], margin: 0.4, onlyOn: STAND_ON },
    ground: gorgeGround(),
    raceCourse: RACE_COURSE.map((r) => ({ ...r })),
    mapShapes: mapShapes(),
    caves: GORGE_CAVES,
    life: noLife,
  };
}
