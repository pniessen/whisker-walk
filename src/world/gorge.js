import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import {
  WALK_SHAPES, MASSES, CEILINGS, GORGE_CAVES, GORGE_DENS, STAND_ON, WIDE_LEDGE_RECT, CAMP_DEN_RESERVE,
  gorgeGround, mapShapes,
} from './gorgeshape.js';
import { GOLD_MICE } from '../goldmice.js';
import { seedFromCode } from '../rng.js';
import { seatOnGround } from '../ground.js';

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

// --- the things to find ------------------------------------------------------
// Laid out before any scenery, because GORGE_KEEP_CLEAR (below) is built from
// these very records: whatever a kid hunts for, nothing grows on it. Every y
// here is a height above the ground under it (part 1, R4), so a perch on the
// clifftop is 0.72 over the clifftop, not over the floor.

// The nine points of interest the race and the quests draw on: in the
// Narrows, up and down the floor on both banks of the stream, and two on the
// clifftop. Each stands at least 2 m from the stream and well clear of the
// Summit Rock, so spots.js's clearSpot leaves it where it is
// (test/gorge.test.js checks both, and floods each one from the spawn).
const POIS = [
  [-34, -11], [-13, -30], [-3, -2], [-14, 14], [0, 24], [-13, 42], [-3, -44], [14, -30], [29, -30],
].map(([x, z]) => ({ x, z }));

// Three places worth stopping at: the view from the clifftop, the gorge from
// the Lookout Ledge halfway up, and the Echo Cave's mouth on the floor.
const SCENICS = [
  { id: 'gorge-view', x: 4, z: -24, label: 'the view down the gorge' },
  { id: 'lookout-ledge', x: 3.5, z: -5, label: 'the gorge from the Lookout Ledge' },
  { id: 'echo-mouth', x: -16.5, z: 23.5, label: 'the mouth of the Echo Cave' },
];

// Five finds: one at the back of each deep cave, one on the floor and one on
// the clifftop.
const COLLECTIBLES = [
  { id: 'gorge-find-1', x: -27, z: 33, label: 'a smooth white pebble' }, // the Echo Cave
  { id: 'gorge-find-2', x: 24.5, z: 8, label: 'a tuft of soft grey fur' }, // the Snug Cave
  { id: 'gorge-find-3', x: 43, z: -40, label: 'a gold-flecked stone' }, // the Glitter Cave
  { id: 'gorge-find-4', x: -4, z: 18, label: 'a curly fern frond' },
  { id: 'gorge-find-5', x: 20, z: -34, label: 'a hawk feather' },
];

// The Summit Rock, on the clifftop: the Moor's High Tor shape, a grey boulder
// and then a tall pillar 1.41 m across and 1.18 m up from it, with a golden
// mouse on top (src/goldmice.js). The colliders sit under the perches, so a
// cat walks round the rocks and up onto them; the pillar is as wide at its
// foot as its collider. It stands south of z -27, in the afternoon sun (G5),
// and 6 m and more from every rim, so a cat can always walk round it (G13).
const PILLAR = { y: 1.9, r: 0.9, rTop: 0.75, rBottom: 0.9, sides: 7 };
const SUMMIT_ROCK = { x: 25, z: -24 };
const SUMMIT_BOULDER = { x: 24, z: -23, r: 0.7 };
const ROCK_COLOR = 0x8c8478;
const CHAIN_PERCHES = [
  { x: SUMMIT_BOULDER.x, z: SUMMIT_BOULDER.z, y: 0.72, kind: 'stone' },
  { x: SUMMIT_ROCK.x, z: SUMMIT_ROCK.z, y: PILLAR.y, kind: 'stone', label: 'summit rock', vantage: true },
];

// Where the two mice dive when chased: at the foot of the west wall and of
// the clifftop's wall, on the floor. The goat's is on the shoulder (ground
// 14), where no cat goes. src/propsets.js carries the same three.
export const GORGE_HIDES = Object.freeze([
  { x: -17.4, z: 38 }, { x: 1.4, z: -38 }, { x: 8, z: -12.5 },
].map((h) => Object.freeze(h)));

// One nap in each den, at its back centre. src/propsets.js carries them as
// the Gorge's rests.
const NAPS = [[-20, 7.3], [-20, -32.7], [4, -44.7], [6.0, -10.2], [11.3, -42]].map(([x, z]) => ({ x, z }));

// The border posts (src/borderposts.js): to the Moor in the Narrows, and the
// one-way post to the town at the south edge (G14).
const POSTS = [{ x: -47.5, z: -14 }, { x: -5, z: 47.5 }];

// The climb race's pad: part 1's spawn + (2, -3).
const RACE_PAD = { x: SPAWN.x + 2, z: SPAWN.z - 3 };

// Places no scenery may stand on, nor hide: every POI, scenic, find, golden
// mouse, chain perch, race ring, nap and hide, the spawn, both posts and the
// race pad. Built from the records themselves, so a find can never move
// without its clearance moving with it.
export const GORGE_KEEP_CLEAR = Object.freeze([
  ...POIS, ...SCENICS, ...COLLECTIBLES, ...GOLD_MICE.gorge, ...CHAIN_PERCHES, ...RACE_COURSE,
  ...NAPS, ...GORGE_HIDES, SPAWN, ...POSTS, RACE_PAD,
].map(({ x, z }) => Object.freeze([x, z])));

// And the rectangles nothing is scattered in: every cave and den, the Wide
// Ledge's south end and the den behind it (kept for the camp, part 4).
export const GORGE_KEEP_CLEAR_RECTS = Object.freeze([
  ...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS, WIDE_LEDGE_RECT, CAMP_DEN_RESERVE,
].map(({ minX, maxX, minZ, maxZ }) => Object.freeze({ minX, maxX, minZ, maxZ })));

// The Gorge's trees, which come with the scenery (Task 6). None yet, so no
// birds yet either.
export function gorgeTrees() {
  return { near: [], stand: [] };
}

// The Gorge's critters: birds in the first four near trees, a mouse at each
// end of the floor, and the goat on the shoulder, which only ever bolts (G9).
// No ducks, frogs or butterflies, and no villagers: no Twolegs walk here.
function critterSpawns() {
  return [
    ...gorgeTrees().near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })),
    { type: 'mouse', x: -15, z: 36, x2: -12, z2: 40 },
    { type: 'mouse', x: -2, z: -36, x2: -4, z2: -40 },
    { type: 'goat', x: 3.5, z: -16, x2: 7.5, z2: -16 },
  ];
}

const MOMENTS = [
  { id: 'goat-leap', type: 'goat', label: 'a goat leaping over the rocks', x: 8, z: -12.5, from: { x: 4, z: -16 } },
];

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
  const ground = gorgeGround();
  const colliders = [];
  const perches = [];
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

  // --- the Summit Rock --------------------------------------------------------
  // Named so test/gorge.test.js can find them and see past them. One material
  // for both, made per build (walk.js disposes every material at the end of a
  // walk). Each is set on the clifftop with seatOnGround.
  const rockMat = litMaterial(ROCK_COLOR, surfaceProps('cobble'));
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), rockMat);
  boulder.name = 'summitRockBoulder';
  boulder.position.set(SUMMIT_BOULDER.x, 0.3, SUMMIT_BOULDER.z);
  scene.add(seatOnGround(boulder, ground));
  colliders.push({ x: SUMMIT_BOULDER.x, z: SUMMIT_BOULDER.z, r: SUMMIT_BOULDER.r });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR.rTop, PILLAR.rBottom, PILLAR.y, PILLAR.sides), rockMat);
  pillar.name = 'summitRock';
  pillar.position.set(SUMMIT_ROCK.x, PILLAR.y / 2, SUMMIT_ROCK.z);
  scene.add(seatOnGround(pillar, ground));
  colliders.push({ x: SUMMIT_ROCK.x, z: SUMMIT_ROCK.z, r: PILLAR.r });
  perches.push(...CHAIN_PERCHES.map((p) => ({ ...p })));

  return {
    name: 'The Gorge',
    colliders,
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made in the Gorge.
    boxes: [],
    tippables: [],
    pois: POIS.map((p) => ({ ...p })),
    collectibles: COLLECTIBLES.map((c) => ({ ...c })),
    scenics: SCENICS.map((c) => ({ ...c })),
    critterSpawns: critterSpawns(),
    moments: MOMENTS.map((m) => ({ ...m, from: { ...m.from } })),
    puddles: [],
    waters: GORGE_WATERS,
    waterFx,
    groundBounce: GROUND_COLOR,
    skyDusk: { top: 0x26304a, horizon: 0x6a5a68 },
    perches,
    // Strays and ghosts stand only where a cat can walk (G7; keepout.js reads
    // onlyOn from Task 10).
    keepOut: { rects: [], capsules: [], margin: 0.4, onlyOn: STAND_ON },
    ground,
    raceCourse: RACE_COURSE.map((r) => ({ ...r })),
    mapShapes: mapShapes(),
    caves: GORGE_CAVES,
    life: noLife,
  };
}
