import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { sureClawsTreePerch } from '../climbing.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { GOLD_MICE } from '../goldmice.js';
import { addIslandView, fromWoodsDisc, islandKeepLow } from './lake.js';
import { addCamp } from './camp.js';

// =============================================================================
// The Moor.
//
// The third clan territory from her territory map: open heather moor north of
// the Woods, with tors, gorse and a rabbit warren, her river crossing it, and
// the lake on its south-west corner. Coordinates are metres, x east and z
// south, so north is -z, as the corner map draws it. The Moor sits directly
// north of the Woods in the same x frame: its south edge (z 50) is the Woods'
// north edge (z -50), so a Woods point (x, z) is the Moor point (x, z + 100).
//
// WHERE ITS EDGES FACE. Each edge looks like the place over it:
//   * south is the Woods. The river, the lake and the north path all carry
//     straight on over the border at the same x, so walking out of one map
//     and into the other looks like one place. The cat spawns on the north
//     path, 6 m in from the Woods, on the Moor's east side;
//   * west is the Pines and Swamp. Their pines reach over the border onto a
//     strip inside the edge, and the hills there are dark and pine-tinted.
//     North of the lake that strip is dry land: the only water past the edge
//     is the lake and its bay round the island;
//   * east is the open moor, and south-east the Gorge's unexplored rock, so
//     the hills that way are grey;
//   * north is more moor: heather hills;
//   * south-west is the lake, opening out past the map with the island and
//     its plank bridge out on the water (the Woods' island, seen from here).
//
// WHY THE DECKS EXIST. Water stops a cat (v19). Her river comes in from the
// Woods up the east side (river-south), turns west across the Moor south of
// the middle (river-west) and pours into the lake (river-mouth), so the land
// between the river and the lake, the lakeshore heath, is cut off from the
// spawn. Each of the two long reaches carries one dry crossing, the
// fallen-log bridge over river-west and the stepping stones over
// river-south, and those two are the ONLY ways in; either one alone is
// enough. Sea Legs is a shortcut, never a key: nothing a kid must reach is cut
// off except through a deck. test/moor.test.js floods the walkable ground from
// the spawn and proves it, and that with the decks taken away the heath can't
// be reached.
//
// Each deck record is the part of its crossing the kids can SEE above the
// water, not a wider rectangle around it, so a cat standing on a deck is
// standing on log or stone, never on water beside it. Both are at least 1.5 m
// wide, enough to steer onto with a thumb.
//
// Nothing here reads which way the game is being played: the Moor builds the
// same for everyone.
// =============================================================================

// Where a walk places the cat: on the north path, 6 m in from the Woods.
export const SPAWN = Object.freeze({ x: 46, z: 44 });

const BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });

// The log bridge over river-west: the Woods' fallen trunk, 3 m through, its
// top hewn flat and 1.9 m wide (builder.logBridge), level at LOG_TOP, moved to
// x 4. The deck is the middle 1.8 m of that flat, so a cat on the deck is on
// the log. The trunk runs 1.5 m onto each bank so the crossing starts on dry
// ground. test/moor.test.js raycasts the built log across the whole deck.
const LOG_X = 4;
const LOG_W = 3.0;
const LOG_FLAT = 1.9;
const LOG_TOP = 0.16;
const LOG_HALF = 0.9;
const LOG_BRIDGE = Object.freeze({ minX: LOG_X - LOG_HALF, maxX: LOG_X + LOG_HALF, minZ: -5.5, maxZ: 2.5 });

// The stepping stones over river-south: the Woods' shipped ford exactly
// (fourteen broad flat stones, round, close and staggered in height so they
// overlap with no open water between them), moved to z 30. The ±0.75 m deck
// sits inside about ±0.83 m of visible stone, so the deck is never wider than
// what is drawn.
const STONES_Z = 30;
const STONES = { n: 14, rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 };
const STONES_HALF = 0.75;
const STEPPING_STONES = Object.freeze({
  minX: 16.5, maxX: 24.5, minZ: STONES_Z - STONES_HALF, maxZ: STONES_Z + STONES_HALF,
});

// The waters. Every footprint runs on past the bounds where its water does, so
// the lake opens out to the horizon and the river comes in from the Woods
// rather than out of a wall.
//
// The lake's north-east shore. Over the south edge it spans the Woods' lake's
// x, and its maxZ is the Woods' lake shore in Moor coordinates, so the shore
// is one line across the border.
const LAKE = Object.freeze({ id: 'lake', kind: 'rect', minX: -120, maxX: -14, minZ: 8, maxZ: 66, shallow: 1.2 });
// The bay round the island, west of the bounds: the open water the island
// bridge crosses toward the Pines' shore. It reaches 3 m north of the lake's
// shore line, so the bridge's north-west end (-89.4, 4.8) lands just north of
// it, on the Pines' shore, and it stops 20 m short of the Moor's west edge, so
// the Pines' dry strip north of the lake stays dry. It is wholly outside the
// Moor's bounds, so no cat walking the Moor reaches it; the same water is the
// Pines' lake-bay, where the bridge and the island are walked.
const LAKE_FAR = Object.freeze({ id: 'lake-far', kind: 'rect', minX: -100, maxX: -70, minZ: 5, maxZ: 44, shallow: 1.2 });
// In from the Woods at the Woods' river-north x.
const RIVER_SOUTH = Object.freeze({
  id: 'river-south', kind: 'rect', minX: 18, maxX: 23, minZ: -4, maxZ: 120, shallow: 1.2,
  decks: Object.freeze([STEPPING_STONES]),
});
// West across the Moor, south of the middle.
const RIVER_WEST = Object.freeze({
  id: 'river-west', kind: 'rect', minX: -40, maxX: 23, minZ: -4, maxZ: 1, shallow: 1.2,
  decks: Object.freeze([LOG_BRIDGE]),
});
// Pours into the lake from the north, 10 m in from the Pines' border. No deck.
const RIVER_MOUTH = Object.freeze({ id: 'river-mouth', kind: 'rect', minX: -40, maxX: -35, minZ: -4, maxZ: 10, shallow: 1.2 });

export const MOOR_WATERS = Object.freeze([LAKE, LAKE_FAR, RIVER_SOUTH, RIVER_WEST, RIVER_MOUTH]);

// How each water is drawn. One peaty green-blue, the Woods' own, because the
// river and the lake are one water across the border. Heights differ wherever
// footprints overlap (the bend, the mouth's corner, the mouth over the lake,
// the lake over its bay) so the planes never fight for a pixel; river-south
// keeps the Woods' river-north height, so the two meet level at the border.
//
// `shores` lists only the edges a cat can see: an edge out past the bounds is
// open water to the horizon, not a bank, and painting foam there would be a
// lie. The bay is all out of bounds, so it has none.
const WATER_COLOR = 0x5f98a8;
const WATER_LOOK = {
  lake: { y: 0.03, shores: ['maxX', 'minZ'] },
  'lake-far': { y: 0.025 },
  'river-south': { y: 0.02, shores: ['minX', 'maxX'] },
  'river-west': { y: 0.035, shores: ['minZ', 'maxZ', 'maxX'] },
  'river-mouth': { y: 0.045, shores: ['minX', 'maxX'] },
};

// The paths, as [x1, z1, x2, z2] centreline segments, all 3 m wide. The north
// path comes in from the Woods on the east side (lined up with the Woods' own
// north path) and climbs to the river bend; the high path runs on west over
// the moor top toward the High Tor; the bridge path goes from the bend over
// the log bridge down to the lakeshore (the bridge itself is the gap between
// its two segments); the ford path crosses the stepping stones (the gap in it)
// to meet it on the heath.
export const MOOR_PATHS = Object.freeze([
  [46, 50, 46, 22], [46, 22, 34, -8],
  [34, -8, 14, -26], [14, -26, -12, -34],
  [34, -8, 4, -7], [4, 4, -2, 24],
  [46, 30, 26.5, 30], [14.5, 30, -2, 24],
].map((s) => Object.freeze(s)));
const PATH_W = 3;
const PATH_STYLE = { surface: 'sand', color: 0x8c7a5c };

// The island out on the lake: the Woods' island, 100 m on in z (lake.js), so
// both maps show one island. A low grassy mound with one big tree and its
// plank bridge north-west to the Pines' shore. Painted scenery, wholly
// outside the bounds, so it has no collider and no perch.
export const MOOR_ISLAND = fromWoodsDisc('moor');

// The horizon. Hills all round, taller and longer than the Woods' (open moor
// rolls), each side tinted for the neighbour over it: heather to the north
// (the Woods paints the Moor this same colour), grey rock to the east (the
// Gorge's unexplored edge), the Woods' deep green to the south, the dark
// pines to the west. Where the lake and the river leave the map the hills come
// down to the water and rise again further out (builder.horizonBand's
// `shore`), but never over the island or its bridge (`keepLow`). No rooftops:
// Twolegplace is not next to the Moor.
export const MOOR_HORIZON = Object.freeze({
  kind: 'hills', inner: 56, outer: 116, height: 11, wavelength: 48,
  color: 0x8f7f8a, salt: 41,
  avoid: Object.freeze([LAKE, LAKE_FAR, RIVER_SOUTH]),
  keepLow: islandKeepLow('moor'),
  sideTints: Object.freeze({ north: 0x9a8a9c, east: 0x8a8478, south: 0x4f7a48, west: 0x3f5a46 }),
});

// --- the things to find ------------------------------------------------------
// Laid out before the scenery (Task 5's thorns, pines, heather, gorse and
// reeds), because MOOR_KEEP_CLEAR (below) is built from these very records:
// whatever a kid hunts for, nothing grows on it.

// The nine points of interest the race and the quests draw on. Each stands at
// least 2 m from the water and far enough from every rock and trunk that
// spots.js's clearSpot leaves it exactly where it is, so a race ring stands on
// its POI (test/moor.test.js checks both, and floods each one from the spawn).
const POIS = [
  [40, 8], [30, 24], [6, -14], [-30, -14], [-24, -40], [20, -40], [-6, 20], [8, 44], [40, -24],
].map(([x, z]) => ({ x, z }));

const SCENICS = [
  { id: 'moor-lake', x: -10, z: 12, label: 'the lake and the island' },
  { id: 'river-bend', x: 28, z: -10, label: 'where the river turns west' },
  { id: 'warren', x: 34, z: -32, label: 'the rabbit warren' },
];

const COLLECTIBLES = [
  { id: 'moor-find-1', x: 30, z: 14, label: 'a tuft of rabbit fur' },
  { id: 'moor-find-2', x: -28, z: -26, label: 'a skylark feather' },
  { id: 'moor-find-3', x: -6, z: 30, label: 'a smooth pebble from the lakeshore' },
  { id: 'moor-find-4', x: 10, z: -20, label: 'a sprig of white heather' },
  // on the High Tor's low rock, so one hop up
  { id: 'moor-find-5', x: -18, z: -34, y: 0.72, label: 'a gorse flower on the low rock' },
];

// The two climb chains, two hops each, the shape the Woods use. The High Tor
// on the moor top: a grey boulder, then a tall granite pillar 1.41 m across
// and 1.18 m up from it (the Woods' Lookout Rocks). The Old Hawthorn on the
// lakeshore heath: a grey boulder at its foot, then its low branch, 2.13 m
// across and 1.38 m up from the boulder (inside the 2.6 reach and the 1.6
// climb), and at 2.1 too high to reach from the heather (the Woods' Great Oak,
// the same offsets exactly). A golden mouse sits on each top
// (src/goldmice.js). The colliders sit under the perches, so a cat walks round
// the rocks and up onto them.
const OLD_HAWTHORN = { x: -2, z: 38, scale: 1.6, r: 0.8 };
const CHAIN_ROCKS = [
  { x: -3.6, z: 36.6, r: 0.7 },
  { x: -18, z: -34, r: 0.7, name: 'highTorRock' },
];
// The boulder sits in the hawthorn's roots. The crevice between their
// colliders is narrower than a cat, so one more collider closes it rather than
// leave a dead-end notch.
const HAWTHORN_ROOT = { x: -2.83, z: 37.27, r: 0.35 };
// The pillar is as wide at its foot as its collider, so a cat walking round it
// never stops short of the stone it sees.
const HIGH_TOR = { x: -19, z: -35, y: 1.9, r: 0.9, rTop: 0.75, rBottom: 0.9 };
const CHAIN_PERCHES = [
  { x: -3.6, z: 36.6, y: 0.72, kind: 'stone' },
  { x: OLD_HAWTHORN.x, z: OLD_HAWTHORN.z, y: 2.1, kind: 'tree', label: 'old hawthorn lookout', vantage: true },
  { x: -18, z: -34, y: 0.72, kind: 'stone' },
  { x: HIGH_TOR.x, z: HIGH_TOR.z, y: HIGH_TOR.y, kind: 'stone', label: 'high tor', vantage: true },
];

// The scenery tors: granite outcrops about the moor, each a collider the size
// of its foot and one hop up onto its top at h (builder.tor's top is h). Low
// enough to climb from the ground in one go, so they are places to sit and
// look out from, not chains.
export const TORS = Object.freeze([
  { x: 28, z: -44, r: 1.4, h: 1.5 },
  { x: -40, z: -22, r: 1.2, h: 1.2 },
  { x: 42, z: -6, r: 1.3, h: 1.4 },
  { x: 12, z: 18, r: 1.2, h: 1.1 },
].map((t) => Object.freeze(t)));

// The rabbit warren: seven burrows on a 3.5 m ring round the warren scenic, at
// angles 0.3 + k x 2pi/7, rounded to the centimetre. Task 5 draws them; three
// of them are the Moor's hides (src/propsets.js), where a fleeing mouse dives.
export const WARREN_BURROWS = Object.freeze([
  [37.34, -30.97], [35.28, -28.74], [32.25, -28.97], [30.54, -31.48],
  [31.44, -34.38], [34.26, -35.49], [36.89, -33.97],
].map(([x, z]) => Object.freeze({ x, z })));

// The bushes the third golden mouse hides among. A bush has no collider, as
// in the park: a cat pushes through to the mouse.
const GOLD_BUSHES = [[-36, -44], [-40, -44], [-38, -39]];

const PUDDLES = [{ x: 30, z: 40, r: 0.9 }, { x: -20, z: -18, r: 0.8 }];

// Places no scenery may stand on, nor hide: every POI (and so every race
// ring), scenic, collectible, golden mouse, chain perch, the bushes the hidden
// mouse needs, the puddles, the burrows and the spawn. Built from the records
// themselves, so a find can never move without its clearance moving with it.
// Task 5's thorns, pines, heather, gorse and reeds read this. (The tors keep
// their own clearance there, scaled to each tor.)
export const MOOR_KEEP_CLEAR = Object.freeze([
  ...POIS, ...SCENICS, ...COLLECTIBLES, ...GOLD_MICE.moor, ...CHAIN_PERCHES,
  ...GOLD_BUSHES.map(([x, z]) => ({ x, z })), ...PUDDLES, ...WARREN_BURROWS, SPAWN,
].map(({ x, z }) => Object.freeze([x, z])));

// --- the scenery ---------------------------------------------------------------
// Every spot below is seeded by name rather than drawn from the walk's rng, so
// every walk and both co-walkers get the same moor, and every candidate draws
// all its numbers whether or not it is kept, so moving one clearance never
// reshuffles the rest. Spots are rounded to the centimetre so they are clean
// data (they end up in colliders and perches).
const r2 = (v) => Math.round(v * 100) / 100;

// Distance from (x, z) to an axis-aligned rectangle (0 inside it).
const rectDist = (d, x, z) => Math.hypot(
  Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
const DECKS = [LOG_BRIDGE, STEPPING_STONES];
// The waters with their decks taken away: a deck is dry for a cat, but it is
// still a river for a tree or a reed.
const UNDECKED = MOOR_WATERS.map((w) => ({ ...w, decks: [] }));
// How far (x, z) is from the nearest water's edge, decks ignored.
const waterDist = (x, z) => Math.min(...UNDECKED.map((w) => b.waterGap(w, x, z)));
const inBounds = (x, z) => x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;
const pathDist = (x, z) => Math.min(...MOOR_PATHS.map((seg) => segDist(x, z, ...seg)));
// The trail over the Pines border (owner answer 4 of the border-crossings
// plan): a 2 m deer track from the border at (-50, -11), between the two
// border pines, east past the POI at (-30, -14) to the bridge path's west end
// at the log bridge's north foot. It is its own exported constant, not part of
// MOOR_PATHS, on purpose: MOOR_PATHS feeds pathDist, so adding to it would
// reshuffle the seeded trees, heather and reeds this map's tests pin. It has
// no collider, and it is the same for everyone.
export const MOOR_TRAIL = Object.freeze([
  [-50, -11, -47, -9.6], [-47, -9.6, -30, -12], [-30, -12, 4, -7],
].map((s) => Object.freeze(s)));
// The way in to the Gorge (Gorge part 2): a 2 m track from the north path's
// bend at (34, -8) east to the border at (50, -11), where the Gorge's Narrows
// path begins (its (-50, -11): a Moor point (x, z) is the Gorge point
// (x - 100, z)). Its centreline passes 3.41 m from the moor-gorge post at
// (47.5, -14) and it keeps 1 m of edge off the tor at (42, -6). Its own constant, like MOOR_TRAIL and for the
// same reason, and filtered last in the same way.
export const MOOR_GORGE_TRAIL = Object.freeze([
  [34, -8, 50, -11],
].map((s) => Object.freeze(s)));
export const TRAIL_W = 2;
// Whether (x, z) is at least `d` from both trails. It is the last filter in
// each scatter export, applied to the finished lists, so no rng draw, cap or
// spacing check changes: the trees and beds on a trail go, and nothing else
// moves. (A bed after a removed one can be drawn as a different cushion
// shape, as the shapes are dealt down the list; its position stays.)
const TRAILS = [...MOOR_TRAIL, ...MOOR_GORGE_TRAIL];
const trailClear = (x, z, d) => TRAILS.every((seg) => segDist(x, z, ...seg) >= d);
const BED_TRAIL_CLEAR = TRAIL_W / 2 + 0.8; // the paths' 2.3 m rule less 0.5 m
const clearOf = (x, z, d) => MOOR_KEEP_CLEAR.every(([px, pz]) => Math.hypot(x - px, z - pz) >= d);

// Where a tree may stand. Its clearance from a path's centreline grows with
// its canopy: the path's half-width, then the canopy's reach, then half a
// metre, so the camera following the cat down a path never ends up inside a
// canopy. The crossings stay open to see from the paths and the banks, nothing
// a kid looks for stands under a canopy, each tor keeps room to walk round
// and climb, and the old hawthorn stands alone.
function treeFits(x, z, reach) {
  if (!inBounds(x, z)) return false;
  if (waterDist(x, z) < 3) return false;
  if (DECKS.some((d) => rectDist(d, x, z) < 4)) return false;
  if (pathDist(x, z) < PATH_W / 2 + reach + 0.5) return false;
  if (!clearOf(x, z, 4)) return false;
  if (TORS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 3)) return false;
  return Math.hypot(x - OLD_HAWTHORN.x, z - OLD_HAWTHORN.z) >= 6;
}

// The Moor's trees: lone thorns about the moor (builder.tree), and the Pines'
// pines reaching over the west border onto the strip inside it (builder.pine).
// Thorns first, each at least 6 m from every other, because a moor's thorns
// stand alone; then the pines, each 4 m from every tree already kept. The
// caps keep the Moor's shadow casters low: each tree is two meshes that cast.
const THORNS = { seed: 'moor-thorns', cell: 13, from: -43.5, jitter: 3, cap: 12, keep: 0.4, apart: 6 };
const PINES = { seed: 'moor-pines', xs: [-47, -42], zs: [-36, -30, -24, -18, -12, -6], jitter: 1.5, cap: 8, keep: 0.75, apart: 4 };
const THORN_REACH = 1.6; // builder.tree's canopy, per unit of scale
const PINE_REACH = 1.3; // builder.pine's lowest cone, per unit of scale
function placedTrees() {
  const thorns = [];
  const pines = [];
  const apart = (list, x, z, d) => list.every((t) => Math.hypot(x - t.x, z - t.z) >= d);

  const T = THORNS;
  let rng = mulberry32(seedFromCode(T.seed));
  for (let gz = T.from; gz < BOUNDS.maxZ; gz += T.cell) {
    for (let gx = T.from; gx < BOUNDS.maxX; gx += T.cell) {
      const x = r2(gx + (rng() * 2 - 1) * T.jitter);
      const z = r2(gz + (rng() * 2 - 1) * T.jitter);
      const scale = r2(0.8 + 0.35 * rng());
      const keep = rng() < T.keep;
      if (keep && thorns.length < T.cap && treeFits(x, z, THORN_REACH * scale) && apart(thorns, x, z, T.apart)) {
        thorns.push({ x, z, scale });
      }
    }
  }

  const P = PINES;
  rng = mulberry32(seedFromCode(P.seed));
  for (const gz of P.zs) {
    for (const gx of P.xs) {
      const x = r2(gx + (rng() * 2 - 1) * P.jitter);
      const z = r2(gz + (rng() * 2 - 1) * P.jitter);
      const scale = r2(1.1 + 0.4 * rng());
      const keep = rng() < P.keep;
      if (keep && pines.length < P.cap && treeFits(x, z, PINE_REACH * scale)
        && apart(thorns, x, z, P.apart) && apart(pines, x, z, P.apart)) {
        pines.push({ x, z, scale });
      }
    }
  }
  return { thorns, pines };
}
// The trail clearing, last: the bare rule of treeFits for the 2 m trail. On
// the finished lists, so no cap or spacing check changes.
export function moorTrees() {
  const { thorns, pines } = placedTrees();
  const open = (reach) => (t) => trailClear(t.x, t.z, TRAIL_W / 2 + reach * t.scale + 0.5);
  return { thorns: thorns.filter(open(THORN_REACH)), pines: pines.filter(open(PINE_REACH)) };
}

// Every trunk a bed keeps off, scaled: the thorns, the pines and the old
// hawthorn.
// Uses the trees as placed, before the trail clearing: a felled border pine
// still keeps the beds off its old spot, so no heather appears that was not
// there before (the 12 cushions on the trail itself go in the beds' own
// filter, as measured: R15's "7" counted only those within 1 m).
function trunks() {
  const { thorns, pines } = placedTrees();
  return [...thorns, ...pines, { x: OLD_HAWTHORN.x, z: OLD_HAWTHORN.z, scale: OLD_HAWTHORN.scale }];
}

// The low beds: heather all over the moor and a few clumps of gorse, each on
// its own jittered grid. None has a collider (a cat pushes through), and every
// cushion and clump keeps off the water's edge, the paths, the crossings, the
// spawn, every MOOR_KEEP_CLEAR place, the tors and the trunks, so nothing the
// kids walk to or look for is hidden. The gorse stands taller (under a metre),
// so it keeps further back, and well away from the crossings so the log and
// the stones stay in sight from the paths. The heather's cap is the triangle
// budget (test/budget.test.js).
const HEATHER = { seed: 'moor-heather', cell: 2.6, jitter: 0.9, keep: 0.5, cap: 420,
  water: 1.0, deck: 3, path: 2.3, clear: 3, spawn: 4, tor: 0.6, trunk: 1.0 };
const GORSE = { seed: 'moor-gorse', cell: 11, jitter: 3, keep: 0.5, cap: 30,
  water: 2.5, deck: 7, path: 3.8, clear: 4.5, spawn: 7, tor: 1.5, trunk: 1.6 };
function bedFits(x, z, rule, trees) {
  if (!inBounds(x, z)) return false;
  if (waterDist(x, z) < rule.water) return false;
  if (DECKS.some((d) => rectDist(d, x, z) < rule.deck)) return false;
  if (pathDist(x, z) < rule.path) return false;
  if (!clearOf(x, z, rule.clear)) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < rule.spawn) return false;
  if (TORS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + rule.tor)) return false;
  return trees.every((t) => Math.hypot(x - t.x, z - t.z) >= rule.trunk * t.scale);
}
function scatter(rule) {
  const rng = mulberry32(seedFromCode(rule.seed));
  const trees = trunks();
  const spots = [];
  for (let gz = BOUNDS.minZ + rule.cell / 2; gz < BOUNDS.maxZ; gz += rule.cell) {
    for (let gx = BOUNDS.minX + rule.cell / 2; gx < BOUNDS.maxX; gx += rule.cell) {
      const x = r2(gx + (rng() * 2 - 1) * rule.jitter);
      const z = r2(gz + (rng() * 2 - 1) * rule.jitter);
      const keep = rng() < rule.keep;
      if (keep && spots.length < rule.cap && bedFits(x, z, rule, trees)) spots.push({ x, z });
    }
  }
  return spots.filter((s) => trailClear(s.x, s.z, BED_TRAIL_CLEAR)); // the trail clearing, last
}
export const moorHeather = () => scatter(HEATHER);
export const moorGorse = () => scatter(GORSE);

// Reeds, a clump every 2.5 m, half a metre out on each bank of the river and
// its mouth, and along the lake's north and east shores. None within 1.5 m of
// a deck (the Woods' rule), so the crossings stay clear to see and to walk
// onto, and none on a path or a place a kid looks for.
const REED_STEP = 2.5;
export function moorReeds() {
  const spots = [];
  const add = (x, z) => {
    if (!inBounds(x, z)) return;
    if (b.inWater(UNDECKED, x, z)) return;
    if (DECKS.some((d) => x > d.minX - 1.5 && x < d.maxX + 1.5 && z > d.minZ - 1.5 && z < d.maxZ + 1.5)) return;
    if (pathDist(x, z) < 2.3) return;
    if (!clearOf(x, z, 3)) return;
    if (!trailClear(x, z, BED_TRAIL_CLEAR)) return; // the trail clearing, last
    spots.push({ x: r2(x), z: r2(z) });
  };
  // river-south's two banks, in from the Woods
  for (let z = RIVER_SOUTH.minZ; z <= BOUNDS.maxZ; z += REED_STEP) {
    add(RIVER_SOUTH.minX - 0.5, z);
    add(RIVER_SOUTH.maxX + 0.5, z);
  }
  // river-west's two banks
  for (let x = BOUNDS.minX; x <= RIVER_WEST.maxX; x += REED_STEP) {
    add(x, RIVER_WEST.minZ - 0.5);
    add(x, RIVER_WEST.maxZ + 0.5);
  }
  // the mouth's two banks
  for (let z = RIVER_MOUTH.minZ; z <= RIVER_MOUTH.maxZ; z += REED_STEP) {
    add(RIVER_MOUTH.minX - 0.5, z);
    add(RIVER_MOUTH.maxX + 0.5, z);
  }
  // the lake's north shore, then its east shore
  for (let x = -35; x <= -14; x += REED_STEP) add(x, LAKE.minZ - 0.5);
  for (let z = 8; z <= 50; z += REED_STEP) add(LAKE.maxX + 0.5, z);
  return spots;
}

// The Moor's critters: birds in the first four thorns, rabbits at the warren
// and on the heath, butterflies on the heath, ducks on the lake and two mice in
// the heather. No squirrels (no wood for them) and no villagers: no Twolegs
// walk the moor.
function critterSpawns() {
  return [
    ...moorTrees().thorns.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })),
    { type: 'rabbit', x: 32, z: -30, x2: 37, z2: -35 },
    { type: 'rabbit', x: 36, z: -29, x2: 30, z2: -24 },
    { type: 'rabbit', x: 4, z: 40, x2: 10, z2: 34 },
    { type: 'butterfly', x: -4, z: 24 }, { type: 'butterfly', x: 0, z: 26 }, { type: 'butterfly', x: -8, z: 26 },
    { type: 'duck', x: -20, z: 14 }, { type: 'duck', x: -18, z: 16 }, { type: 'duck', x: -22, z: 17 },
    { type: 'mouse', x: -26, z: -20, x2: -22, z2: -26 },
    { type: 'mouse', x: 10, z: -36, x2: 14, z2: -30 },
  ];
}

// A grey boulder, the first step of each chain: builder.rock's shape and
// height (its top is just over the 0.72 perch). build() makes one material per
// scene and hands it to both boulders: walk.js disposes every material at the
// end of a walk, so a module-level cache would hand the next walk a disposed
// one.
const BOULDER_GREY = 0x9a9aa2;
function greyBoulder(x, z, material) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), material);
  m.position.set(x, 0.3, z);
  return m;
}

export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, 0x9cc4e4, 0xe4e6d8);
  scene.add(b.ground(120, 0x8a9558, { surface: 'grass' }));
  scene.add(b.horizonBand(MOOR_HORIZON));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });
  const perches = [];

  // --- the water --------------------------------------------------------------
  // Each mesh is built from its footprint record and added to the scene root
  // directly (test/water.test.js matches against scene.children).
  const waterFx = MOOR_WATERS.map((w) => {
    const fx = createWater(w, {
      color: WATER_COLOR,
      ...WATER_LOOK[w.id],
      quality: water.quality ?? 'high',
      reducedMotion: water.reducedMotion ?? false,
      waters: MOOR_WATERS,
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
  for (const s of MOOR_PATHS) scene.add(b.path(...s, PATH_W, PATH_STYLE));
  // the trail over the Pines border, in the same sand, 2 m wide (MOOR_TRAIL)
  for (const s of MOOR_TRAIL) scene.add(b.path(...s, TRAIL_W, PATH_STYLE));
  // and the trail to the Gorge, the same (MOOR_GORGE_TRAIL)
  for (const s of MOOR_GORGE_TRAIL) scene.add(b.path(...s, TRAIL_W, PATH_STYLE));

  // --- the climb chains -------------------------------------------------------
  // The Old Hawthorn, with its grey boulder at the foot, and the High Tor on
  // the moor top. The hawthorn is built with no wind, so the limb and the mouse
  // on it never part. Named so test/moor.test.js can find them and see past
  // them.
  const H = OLD_HAWTHORN;
  const hawthorn = b.tree(H.x, H.z, H.scale);
  hawthorn.name = 'oldHawthorn';
  // The low limb the golden mouse sits out on (src/goldmice.js), reaching west
  // from the trunk to just past the mouse, its top under the mouse's belly. A
  // child of the tree, in its scaled frame.
  const s = H.scale;
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 / s, 0.12 / s, 0.75 / s, 6),
    litMaterial(0x7a5230, surfaceProps('bark')),
  );
  limb.rotation.z = Math.PI / 2;
  limb.position.set(-0.6 / s, 1.9 / s, 0);
  hawthorn.add(limb);
  scene.add(hawthorn);
  addC(H.x, H.z, H.r);
  const grey = litMaterial(BOULDER_GREY, surfaceProps('cobble'));
  for (const { x, z, r, name } of CHAIN_ROCKS) {
    const rock = greyBoulder(x, z, grey);
    if (name) rock.name = name;
    scene.add(rock);
    addC(x, z, r);
  }
  addC(HAWTHORN_ROOT.x, HAWTHORN_ROOT.z, HAWTHORN_ROOT.r);
  const T = HIGH_TOR;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(T.rTop, T.rBottom, T.y, 7),
    litMaterial(0x8e8c88, surfaceProps('cobble')),
  );
  pillar.name = 'highTor';
  pillar.position.set(T.x, T.y / 2, T.z);
  scene.add(pillar);
  addC(T.x, T.z, T.r);
  perches.push(...CHAIN_PERCHES.map((p) => ({ ...p })));

  // --- the tors ---------------------------------------------------------------
  TORS.forEach(({ x, z, r, h }, i) => {
    const t = b.tor(x, z, { r, h, seed: i });
    t.name = `tor-${i}`;
    scene.add(t);
    addC(x, z, r);
    perches.push({ x, z, y: h, kind: 'stone' });
  });

  // --- the trees ----------------------------------------------------------------
  // A thorn has a low fork (Sure Claws); a pine has none.
  const { thorns, pines } = moorTrees();
  for (const { x, z, scale } of thorns) {
    scene.add(b.tree(x, z, scale, { wind }));
    addC(x, z, r2(0.5 * scale));
    perches.push(sureClawsTreePerch(x, z, scale));
  }
  for (const { x, z, scale } of pines) {
    scene.add(b.pine(x, z, scale, { wind }));
    addC(x, z, r2(0.4 * scale));
  }

  // --- the beds -----------------------------------------------------------------
  // Each one merged mesh (or two, for two colours) out of the shadow pass, and
  // no colliders: a cat pushes through.
  const beds = [
    ['heather', b.heatherBed(moorHeather(), seedFromCode('moor-heather'))],
    ['gorse', b.gorseBed(moorGorse(), seedFromCode('moor-gorse'))],
    ['reeds', b.reedBed(moorReeds(), seedFromCode('moor-reeds'))],
    ['burrows', b.burrows(WARREN_BURROWS, seedFromCode('moor-warren'))],
  ];
  for (const [name, bed] of beds) {
    bed.name = name;
    scene.add(bed);
  }

  // --- the hidden mouse's bushes, and the puddles -------------------------------
  for (const [x, z] of GOLD_BUSHES) scene.add(b.bush(x, z, { wind }));
  for (const p of PUDDLES) scene.add(b.puddle(p.x, p.z, p.r));

  // --- the island -------------------------------------------------------------
  // The mound, its tree and the plank bridge, drawn by lake.js the same way
  // every shore draws them. Out of reach and out of the colliders.
  addIslandView(scene, 'moor', { wind });

  // --- the camp -------------------------------------------------------------------
  // The clan's den and the leader's rock, in the camp disc (camp.js). Every
  // device draws it, Legacy too, whatever the picks.
  addCamp(scene, { colliders }, 'moor');

  return {
    name: 'The Moor',
    colliders,
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made on the Moor.
    boxes: [],
    tippables: [],
    pois: POIS.map((p) => ({ ...p })),
    collectibles: COLLECTIBLES.map((c) => ({ ...c })),
    scenics: SCENICS.map((c) => ({ ...c })),
    critterSpawns: critterSpawns(),
    moments: [
      { id: 'rabbit-bolt', type: 'rabbit', label: 'a rabbit bolting for its burrow', x: 34, z: -32, from: { x: 26, z: -22 } },
    ],
    puddles: PUDDLES.map((p) => ({ ...p })),
    waters: MOOR_WATERS,
    waterFx,
    groundBounce: 0x8a9558,
    skyDusk: { top: 0x2a3554, horizon: 0x70647a },
    perches,
  };
}
