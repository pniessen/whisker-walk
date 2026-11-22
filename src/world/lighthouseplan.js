// =============================================================================
// LIGHTHOUSE POINT: THE PLAN (milestone 1, the ground and the shapes).
// Pure data, no THREE: the levels, the ground, the colliders, the waters, the perches,
// the spots and the area's records. src/world/lighthouse.js draws it and hands the walk
// its record; tests read this file directly. docs/superpowers/specs/2026-11-22-lighthouse-design.md,
// docs/superpowers/plans/2026-11-22-lighthouse.md.
//
// Metres, x east, z south (north is -z). The sea is east (the cove) and west. Levels:
//   the cove, the pool shelf, the lower shore and the cave's floor: 0
//   the cliff path: two ground flights, 0 -> 3 (F1), 3 -> 6 (F2), with a landing between
//   the headland plateau: 6.0, with the cave's footprint left out of it so the cave's
//     floor stays 0 and its roof (2.6) is a ceiling, not ground
//   the tower: the gallery disc at 13.5 (its skirt: nobody walks up to the shaft but by
//     the stair, which is milestone 2's), the lamp room above it (milestone 2's)
//
// Not here yet, on purpose (the plan's milestone 2, 3 and 4): the stair, the gallery walk,
// the lever, the gallery and Gull Rock scenics (nothing in this milestone can reach them),
// the life, the golden mice, the finds, the catalog row and the gate.
// =============================================================================

import { createGround } from '../ground.js';
import { createTraversal } from '../traversal.js';
import { SURE_CLAWS_ID } from '../climbing.js';

export const LIGHTHOUSE_BOUNDS = Object.freeze({ minX: -48, maxX: 38, minZ: -44, maxZ: 44 });
// On the cove beach, facing north (a walk faces -z): the lighthouse stands in view straight ahead.
export const LIGHTHOUSE_SPAWN = Object.freeze({ x: 14, z: 36 });

export const PLATEAU_Y = 6;
export const GALLERY_Y = 13.5;
export const LANDING_Y = 3;
export const TOWER = Object.freeze({ x: -22, z: -20, collider: 3.6, gallery: 4.6, shaft: 3.4 });
// The cave under the plateau: a mouth on the cove at x -6, a back wall at x -16, 2.6 m high.
export const CAVE = Object.freeze({ minX: -16, maxX: -6, minZ: -22, maxZ: -16, roof: 2.6 });
// The plateau's footprint (its drawn cliffs run on past the bounds to the north).
export const PLATEAU = Object.freeze({ minX: -40, maxX: -6, minZ: -44, maxZ: 4 });

// The sea east of the cove and the sea west of the headland. Both are drawn from these records
// (the water on screen and the water in the data are the same rectangle).
export const SEA_EAST = Object.freeze({ id: 'sea', kind: 'rect', minX: 36, maxX: 106, minZ: -70, maxZ: 70, shallow: 1.5 });
export const SEA_WEST = Object.freeze({ id: 'sea-west', kind: 'rect', minX: -106, maxX: -40, minZ: -70, maxZ: 70, shallow: 1.5 });

// Six rock pools, each wadeable end to end (a `shallow` of at least the radius: no deep water).
const pool = (id, x, z, r) => Object.freeze({ id, kind: 'circle', x, z, r, shallow: r + 0.3 });
export const POOLS = Object.freeze([
  pool('pool-1', 12, 14, 1.8),
  pool('pool-2', 22, 12, 2.4),
  pool('pool-3', 30, 18, 1.6),
  pool('pool-4', 16, 22, 2.2),
  pool('pool-5', 26, 26, 1.9),
  pool('pool-6', 9, 29, 1.4),
]);

// The cliff path: F1 along the foot of the headland, a landing, F2 up to the plateau.
const rect = (x0, x1, z0, z1, y) => ({ x0, z0: (z0 + z1) / 2, x1, z1: (z0 + z1) / 2, width: z1 - z0, y0: y });
export const CLIFF_PATH = Object.freeze({
  width: 1.8,
  f1: Object.freeze({ x0: -2, z0: 16, x1: -23, z1: 16, y0: 0, y1: LANDING_Y }),
  landing: Object.freeze({ x: -24.4, z: 15.2, r: 1.6, y: LANDING_Y }),
  f2: Object.freeze({ x0: -24.4, z0: 15.2, x1: -24.4, z1: 3.6, y0: LANDING_Y, y1: PLATEAU_Y }),
});
const flight = (f) => ({ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, width: CLIFF_PATH.width, y0: f.y0, y1: f.y1 });

export const LIGHTHOUSE_GROUND = Object.freeze({
  base: 0,
  strips: [
    // the plateau, with the cave's footprint left out so its floor stays 0
    rect(PLATEAU.minX, PLATEAU.maxX, PLATEAU.minZ, CAVE.minZ, PLATEAU_Y),
    rect(PLATEAU.minX, CAVE.minX, CAVE.minZ, CAVE.maxZ, PLATEAU_Y),
    rect(PLATEAU.minX, PLATEAU.maxX, CAVE.maxZ, PLATEAU.maxZ, PLATEAU_Y),
    flight(CLIFF_PATH.f1),
    flight(CLIFF_PATH.f2),
  ],
  discs: [
    // the gallery: the tower's skirt. Seven and a half metres over the plateau, so a wall to
    // anyone on it; the stair (milestone 2) is the way up.
    { x: TOWER.x, z: TOWER.z, r: TOWER.gallery, y: GALLERY_Y },
    { ...CLIFF_PATH.landing },
  ],
  // the cave's roof, 0.001 inside its footprint (the Gorge's way)
  ceilings: [{ x0: CAVE.minX + 0.001, z0: (CAVE.minZ + CAVE.maxZ) / 2, x1: CAVE.maxX - 0.001, z1: (CAVE.minZ + CAVE.maxZ) / 2, width: CAVE.maxZ - CAVE.minZ - 0.002, y: CAVE.roof }],
});

const c = (x, z, r) => Object.freeze({ x, z, r });
// The tower's shaft; the keeper's cottage as three overlapping circles (7 x 5 m); the fog bell's
// post and the flagpole; boulders on the plateau, on the lower shore and on the cove.
export const LIGHTHOUSE_COLLIDERS = Object.freeze([
  c(TOWER.x, TOWER.z, TOWER.collider),
  c(-35.1, -7, 2.2), c(-33, -7, 2.2), c(-30.9, -7, 2.2),
  c(-12, 0, 0.6),
  c(-9, -9, 0.3),
  c(-30, -30, 1.3), c(-12, -36, 1.1), c(-37, -19, 1.2),
  c(-18, 24, 1.2), c(-34, 30, 1.4), c(-10, 36, 1.2),
  c(4, -26, 1.3), c(30, -34, 1.5), c(32, 4, 1.1),
]);

// The cottage and the garden's drawn places (lighthouse.js draws them from here).
export const COTTAGE = Object.freeze({ x: -33, z: -7, w: 7, d: 5, yaw: 0 }); // its door on the east side
export const GARDEN = Object.freeze({ minX: -37, maxX: -29, minZ: -2, maxZ: 3 });
export const BELL = Object.freeze({ x: -12, z: 0 });
export const FLAGPOLE = Object.freeze({ x: -9, z: -9 });
export const BENCH = Object.freeze({ x: -12, z: -6, yaw: -Math.PI / 2 });
// Gull Rock: a sea stack off the headland's west lip. Its top is a lookout for the Long Leap
// (milestone 2 gives it a gap, a landing and its scenic); until then it is drawn and not reachable.
export const GULL_ROCK = Object.freeze({ x: -46.1, z: -30, r: 2.2, top: PLATEAU_Y });

export const LIGHTHOUSE_WATERS = Object.freeze([SEA_EAST, SEA_WEST, ...POOLS]);

// Where the drawn pieces on the cove stand (so tests can keep them clear of the waters).
export const BOAT = Object.freeze({ x: 5.5, z: 30, yaw: 0.35 });

const P = (x, z, y, kind, extra = {}) => Object.freeze({ x, z, y, kind, ...extra });
// Stone and furniture perches, inside the base climb budget (1.6 m). Two beach boulders are for
// Sure Claws only (the Seaside's rule).
export const LIGHTHOUSE_PERCHES = Object.freeze([
  P(BOAT.x, BOAT.z, 0.62, 'furniture', { label: 'the upturned boat' }),
  P(BENCH.x, BENCH.z, 0.58, 'furniture'),
  P(6, 12, 0.72, 'stone', { label: 'the high pool ledge', vantage: true }),
  ...[[-6, 24], [28, -20]].map(([x, z]) => P(x, z, 0.72, 'stone', { requires: SURE_CLAWS_ID })),
]);

// Interesting spots a wanderer may head for: all reachable from the spawn on foot.
export const LIGHTHOUSE_POIS = Object.freeze([
  [14, 30], [22, 18], [30, 10], [8, 4], [20, -8], [30, -24], [8, -30], [-3, -19],
  [-12, -19], [-14, 20], [-30, 18], [-20, 8], [-26, -4], [-16, -10], [-30, -22], [-12, -28],
].map(([x, z]) => Object.freeze({ x, z })));

// Five things to collect: a shell, sea glass, a starfish, a pearly button, a cork float.
export const LIGHTHOUSE_COLLECTIBLES = Object.freeze([
  { id: 'light-1', x: 19.5, z: 17.5, label: 'a spiral shell' },
  { id: 'light-2', x: 8, z: -12, label: 'a piece of blue sea glass' },
  { id: 'light-3', x: -4.2, z: -10, label: 'a little starfish' },
  { id: 'light-4', x: -27.5, z: -2, label: 'a pearly button' },
  { id: 'light-5', x: -14, z: 21, label: 'a bobbing cork float' },
].map(Object.freeze));

// Three special places she can reach in this milestone (the gallery's and Gull Rock's come with the
// things that reach them). The ids are load-bearing once shipped (state.gifts stores them).
export const LIGHTHOUSE_SCENICS = Object.freeze([
  { id: 'lighthouse-cave', x: -12, z: -19, label: 'the sea cave' },
  { id: 'lighthouse-pools', x: 19, z: 27, label: 'the rock pools' },
  { id: 'lighthouse-cottage', x: -27.6, z: -7, label: 'the keeper\'s porch' },
].map(Object.freeze));

// Things to knock over (the lamp lever joins them in milestone 2): two crab pots, a bucket, a lobster
// crate, a bin. `look` picks the drawing (a tippable's `build` hook).
export const LIGHTHOUSE_TIPPABLES = Object.freeze([
  { x: 16, z: 33, kind: 'pot', look: 'crabpot' },
  { x: 3, z: -22, kind: 'pot', look: 'crabpot' },
  { x: -30, z: 20, kind: 'can', look: 'bucket' },
  { x: 11, z: 26, kind: 'bin', look: 'crate' },
  { x: -26, z: -2.5, kind: 'bin', look: 'bin' },
].map(Object.freeze));
export const LIGHTHOUSE_BOXES = Object.freeze([{ x: 18, z: 38 }, { x: -20, z: 10 }].map(Object.freeze));

export const LIGHTHOUSE_NAME = 'Lighthouse Point';

// The ground and the moves (none yet: the stair, the railing walk and the leaps are milestone 2's).
export function lighthouseGround() {
  return createGround(LIGHTHOUSE_GROUND);
}

export function lighthouseArea() {
  const ground = lighthouseGround();
  return {
    name: LIGHTHOUSE_NAME,
    bounds: { ...LIGHTHOUSE_BOUNDS },
    spawn: { ...LIGHTHOUSE_SPAWN },
    colliders: LIGHTHOUSE_COLLIDERS.map((k) => ({ ...k })),
    waters: LIGHTHOUSE_WATERS.map((w) => ({ ...w })),
    perches: LIGHTHOUSE_PERCHES.map((p) => ({ ...p })),
    pois: LIGHTHOUSE_POIS.map((p) => ({ ...p })),
    collectibles: LIGHTHOUSE_COLLECTIBLES.map((k) => ({ ...k })),
    scenics: LIGHTHOUSE_SCENICS.map((k) => ({ ...k })),
    tippables: LIGHTHOUSE_TIPPABLES.map((k) => ({ ...k })),
    boxes: LIGHTHOUSE_BOXES.map((k) => ({ ...k })),
    ground,
    traversal: createTraversal({ crossings: [], gaps: [], climbs: [], drops: [] }, ground),
  };
}
