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
// Milestone 2 (the climb): the stair (three `stair` rail flights round the tower, two stone ledges
// and the top ledge on the gallery), the gallery's railing walk, the lamp room (its door, its walls
// as colliders, the lens, the lever as a tippable), two leaps (a base one and a Long Leap one) to
// two sea stacks, and two drops. The tower itself is no collider now: the gallery's rim is a 7.5 m
// wall to anyone on the plateau, and a flat collider would shut the gallery's own floor.
//
// Not here yet, on purpose (the plan's milestone 3 and 4): the life, the golden mice, the finds,
// the catalog row and the gate.
// =============================================================================

import { createGround } from '../ground.js';
import { SURE_CLAWS_ID } from '../climbing.js';
import { createTraversal, LONG_LEAP_ID } from '../traversal.js';

export const LIGHTHOUSE_BOUNDS = Object.freeze({ minX: -48, maxX: 38, minZ: -44, maxZ: 44 });
// On the cove beach, facing north (a walk faces -z): the lighthouse stands in view straight ahead.
export const LIGHTHOUSE_SPAWN = Object.freeze({ x: 14, z: 36 });

export const PLATEAU_Y = 6;
export const GALLERY_Y = 13.5;
export const LANDING_Y = 3;
export const TOWER = Object.freeze({ x: -22, z: -20, gallery: 4.6, shaft: 3.4 });
// The cave under the plateau: a mouth on the cove at x -6, a back wall at x -16, 2.6 m high.
export const CAVE = Object.freeze({ minX: -16, maxX: -6, minZ: -22, maxZ: -16, roof: 2.6 });
// The plateau's footprint (its drawn cliffs run on past the bounds to the north).
export const PLATEAU = Object.freeze({ minX: -40, maxX: -6, minZ: -44, maxZ: 4 });

// Two sea stacks off the plateau's west lip (x -40). Gull Rock is a 4.25 m leap, Long Leap's; the
// Pinnacle a 2.85 m one, the base leap's. `land` is the radius of the ground on top (a disc at the
// plateau's height) and the sea has an island under each, so she is not "in the water" up there.
export const GULL_ROCK = Object.freeze({ x: -45.5, z: -30, r: 2.2, top: PLATEAU_Y, land: 1.9 });
export const PINNACLE = Object.freeze({ x: -43.6, z: -12, r: 1.7, top: PLATEAU_Y, land: 1.4 });
const island = (k) => Object.freeze({ x: k.x, z: k.z, r: k.land + 0.1 });

// The sea east of the cove and the sea west of the headland. Both are drawn from these records
// (the water on screen and the water in the data are the same rectangle).
export const SEA_EAST = Object.freeze({ id: 'sea', kind: 'rect', minX: 36, maxX: 106, minZ: -70, maxZ: 70, shallow: 1.5 });
export const SEA_WEST = Object.freeze({ id: 'sea-west', kind: 'rect', minX: -106, maxX: -40, minZ: -70, maxZ: 70, shallow: 1.5, islands: Object.freeze([island(GULL_ROCK), island(PINNACLE)]) });

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


// -----------------------------------------------------------------------------
// The climb (milestone 2). Metres; angles in degrees round the tower, 0 east, 90 south (z grows).
// -----------------------------------------------------------------------------
const r3 = (n) => Math.round(n * 1000) / 1000;
const rad = (deg) => (deg * Math.PI) / 180;
const onTower = (deg, r, y = 0) => ({ x: r3(TOWER.x + r * Math.cos(rad(deg))), z: r3(TOWER.z + r * Math.sin(rad(deg))), y });

// The stair: radius 5.2 round the tower, three flights of 112 degrees (336 in all), so the top ledge
// stands 21 degrees short of the foot's bearing (a full turn would put it over the first flight, and
// ground holds one height per spot). Each flight is flat for 1 m at each end (a ledge) and climbs in
// six chords between: 8.2 m at a grade of 1 in 3.3. The stair kind walks in her own gait (traversal.js).
export const STAIR = Object.freeze({ r: 5.2, a0: 45, turn: 112, steps: 6, ledge: 0.95, flat: 1.0, ys: Object.freeze([PLATEAU_Y, 8.5, 11, GALLERY_Y]) });
// [0] the foot (on the plateau), [1] [2] two ledges, [3] the top ledge (on the gallery's level).
export const LANDINGS = Object.freeze(STAIR.ys.map((y, i) => Object.freeze(onTower(STAIR.a0 + STAIR.turn * i, STAIR.r, y))));
export const STAIR_TOP_DEG = STAIR.a0 + STAIR.turn * 3 - 360; // 21: where she steps off, and where the lamp room's door faces

function stairFlight(i) {
  const { turn, steps, flat, r, ys } = STAIR;
  const fa = (flat / r) * (180 / Math.PI);
  const d0 = STAIR.a0 + turn * i;
  const pts = [onTower(d0, r, ys[i]), onTower(d0 + fa, r, ys[i])];
  for (let k = 1; k < steps; k++) pts.push(onTower(d0 + fa + ((turn - 2 * fa) * k) / steps, r, r3(ys[i] + ((ys[i + 1] - ys[i]) * k) / steps)));
  pts.push(onTower(d0 + turn - fa, r, ys[i + 1]), onTower(d0 + turn, r, ys[i + 1]));
  return { id: `stair-${i + 1}`, kind: 'stair', width: 1.0, points: pts };
}

// The gallery (the disc at 13.5, a 1 m ring of floor out to the lamp room's wall) and the railing walk:
// one 9 m balance walk along the sea side's rail, from 108 to 228 degrees, rising from the floor
// (grade 0.3) to a rail 0.8 m up and down again. The handrail is drawn on it.
export const GALLERY_RAIL = Object.freeze({ r: 4.3, from: 108, to: 228, steps: 16, top: 0.8, grade: 0.3, y: 0.0 });
function railWalk() {
  const { r, from, to, steps, top, grade } = GALLERY_RAIL;
  const pts = Array.from({ length: steps + 1 }, (_, k) => onTower(from + ((to - from) * k) / steps, r));
  let len = 0;
  const us = pts.map((p, k) => { if (k) len += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z); return len; });
  pts.forEach((p, k) => { p.y = r3(GALLERY_Y + Math.min(top, us[k] * grade, (len - us[k]) * grade)); });
  return { id: 'rail-walk', kind: 'pipe', width: 0.25, follow: true, points: pts };
}

// The lamp room: a stone kerb 0.45 m high with a glass room over it, radius 2.3, a door gap 1.4 m wide
// facing the stair; its roof (a ground ceiling, 3.2 m over the floor) is a square 3.2 m across, inside the
// round roof. The lens stands on a pedestal in the middle (a collider of radius 0.7) and the lever by the
// wall opposite the door. A 0.6 m ring of floor runs round the lens.
export const LAMP_ROOM = Object.freeze({ r: 2.3, floor: GALLERY_Y, roof: 16.7, door: STAIR_TOP_DEG, doorGap: 1.4, wall: 0.3, lens: 0.7, lensY: GALLERY_Y + 1.4 });
export const LEVER = Object.freeze({ deg: STAIR_TOP_DEG + 180, r: 1.35, ...onTower(STAIR_TOP_DEG + 180, 1.35, GALLERY_Y) });
// Wall circles every 0.55 m, skipping those within 1.0 m of the door's middle (a clear gap of 1.4 m).
const lampWallCircles = () => {
  const { r, door, wall } = LAMP_ROOM;
  const n = Math.ceil((2 * Math.PI * r) / 0.55);
  const out = [];
  for (let k = 0; k < n; k++) {
    const deg = (360 * k) / n;
    let d = Math.abs(deg - door) % 360;
    if (d > 180) d = 360 - d;
    if (rad(d) * r < 1.0) continue;
    const { x, z } = onTower(deg, r);
    out.push(Object.freeze({ x, z, r: wall }));
  }
  return out;
};
export const LAMP_ROOM_WALL = Object.freeze(lampWallCircles());

const ledge = (p, r) => ({ x: p.x, z: p.z, r, y: p.y });

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
    // anyone on it; the stair is the way up.
    { x: TOWER.x, z: TOWER.z, r: TOWER.gallery, y: GALLERY_Y },
    { ...CLIFF_PATH.landing },
    // the stair's two ledges and its top ledge (which meets the gallery's disc at its own height)
    ledge(LANDINGS[1], STAIR.ledge), ledge(LANDINGS[2], STAIR.ledge), ledge(LANDINGS[3], STAIR.ledge),
    // the tops of the two stacks off the west lip
    { x: GULL_ROCK.x, z: GULL_ROCK.z, r: GULL_ROCK.land, y: PLATEAU_Y },
    { x: PINNACLE.x, z: PINNACLE.z, r: PINNACLE.land, y: PLATEAU_Y },
  ],
  // the cave's roof, 0.001 inside its footprint (the Gorge's way)
  ceilings: [
    { x0: CAVE.minX + 0.001, z0: (CAVE.minZ + CAVE.maxZ) / 2, x1: CAVE.maxX - 0.001, z1: (CAVE.minZ + CAVE.maxZ) / 2, width: CAVE.maxZ - CAVE.minZ - 0.002, y: CAVE.roof },
    // the lamp room's roof
    { x0: TOWER.x - 1.6, z0: TOWER.z, x1: TOWER.x + 1.6, z1: TOWER.z, width: 3.2, y: LAMP_ROOM.roof },
  ],
});

const c = (x, z, r) => Object.freeze({ x, z, r });
// The tower's shaft; the keeper's cottage as three overlapping circles (7 x 5 m); the fog bell's
// post and the flagpole; boulders on the plateau, on the lower shore and on the cove.
// The garden's drystone walls (0.8 m thick): a north wall with a gate gap, a west and an east wall;
// the plateau's south cliff closes it. Each gets a row of overlapping circles so she cannot walk
// through them.
export const GARDEN_WALLS = Object.freeze([
  { x0: -37, z0: -2.2, x1: -34.2, z1: -2.2 },
  { x0: -32.6, z0: -2.2, x1: -29, z1: -2.2 },
  { x0: -37, z0: -2.2, x1: -37, z1: 3.6 },
  { x0: -29, z0: -2.2, x1: -29, z1: 3.6 },
].map(Object.freeze));
const wallCircles = (s, r = 0.4, gap = 0.8) => {
  const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
  const n = Math.max(1, Math.ceil(len / gap));
  return Array.from({ length: n + 1 }, (_, i) => c(s.x0 + ((s.x1 - s.x0) * i) / n, s.z0 + ((s.z1 - s.z0) * i) / n, r));
};

// Nine boulders (drawn big, each a collider): four on the plateau, three on the lower shore, two on the cove.
export const BOULDERS = Object.freeze([
  c(-30, -30, 1.3), c(-12, -36, 1.1), c(-37, -19, 1.2),
  c(-18, 24, 1.2), c(-34, 30, 1.4), c(-10, 36, 1.2),
  c(4, -26, 1.3), c(30, -34, 1.5), c(32, 4, 1.1),
]);

export const LIGHTHOUSE_COLLIDERS = Object.freeze([
  // the lens on its pedestal, and the lamp room's wall (the door left open); the tower's shaft is the gallery's wall
  c(TOWER.x, TOWER.z, LAMP_ROOM.lens), ...LAMP_ROOM_WALL,
  c(-35.1, -7, 2.2), c(-33, -7, 2.2), c(-30.9, -7, 2.2),
  c(-12, 0, 0.6),
  c(-9, -9, 0.3),
  ...BOULDERS,
  ...GARDEN_WALLS.flatMap((w) => wallCircles(w)),
]);

// The cottage and the garden's drawn places (lighthouse.js draws them from here).
export const COTTAGE = Object.freeze({ x: -33, z: -7, w: 7, d: 5, yaw: 0 }); // its door on the east side
export const GARDEN = Object.freeze({ minX: -37, maxX: -29, minZ: -2, maxZ: 3 });
export const BELL = Object.freeze({ x: -12, z: 0 });
export const FLAGPOLE = Object.freeze({ x: -9, z: -9 });
export const BENCH = Object.freeze({ x: -12, z: -6, yaw: -Math.PI / 2 });
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

// The five special places (the gallery is the top of the stair; Gull Rock is Long Leap's, a bonus). The
// ids are load-bearing once shipped (state.gifts stores them).
export const LIGHTHOUSE_SCENICS = Object.freeze([
  { id: 'lighthouse-cave', x: -12, z: -19, label: 'the sea cave' },
  { id: 'lighthouse-pools', x: 19, z: 27, label: 'the rock pools' },
  { id: 'lighthouse-cottage', x: -27.6, z: -7, label: 'the keeper’s porch' },
  { id: 'lighthouse-gallery', ...onTower(201, 3.6), label: 'the lighthouse balcony' },
  { id: 'lighthouse-gullrock', x: -45.2, z: -30, label: 'Gull Rock' },
].map(Object.freeze));

// Things to knock over: two crab pots, a bucket, a lobster crate, a bin, and the lamp lever in the lamp
// room (its tip lights the lamp: world/lighthouselife.js; a partner's tip, by id, does the same). `look`
// picks the drawing (a tippable's `build` hook).
export const LIGHTHOUSE_TIPPABLES = Object.freeze([
  { x: 16, z: 33, kind: 'pot', look: 'crabpot' },
  { x: 3, z: -22, kind: 'pot', look: 'crabpot' },
  { x: -30, z: 20, kind: 'can', look: 'bucket' },
  { x: 11, z: 26, kind: 'bin', look: 'crate' },
  { x: -26, z: -2.5, kind: 'bin', look: 'bin' },
  { x: LEVER.x, z: LEVER.z, kind: 'lever', look: 'lever' },
  // the fog bell's rope (its tip rings the bell: world/lighthouselife.js)
  { x: BELL.x + 1.0, z: BELL.z, kind: 'bell', look: 'bellrope' },
].map(Object.freeze));
// The lever is the one tippable the life reads: its entry in the walk's list is the one of this kind.
export const LEVER_KIND = 'lever';
export const BELL_KIND = 'bell';
export const LIGHTHOUSE_BOXES = Object.freeze([{ x: 18, z: 38 }, { x: -20, z: 10 }].map(Object.freeze));

export const LIGHTHOUSE_NAME = 'Lighthouse Point';

// -----------------------------------------------------------------------------
// Milestone 3: the life. Where each of the six finds is found, the three golden mice, the keeper's cat and the
// three places her kitten hides, the gulls, the crabs and the moments. Pure data.
// -----------------------------------------------------------------------------

// The three golden mice (src/goldmice.js GOLD_MICE.lighthouse holds the same three; test/lighthousegold.test.js):
// on the gallery on the sea side opposite the lamp room's door, in the cave's back nook behind the lantern, and
// on the high pool ledge. `y` is the height over the ground at the spot.
export const LIGHTHOUSE_GOLD = Object.freeze([
  Object.freeze({ id: 'gm-light-1', ...onTower(160, 3.4), y: 0 }),
  Object.freeze({ id: 'gm-light-2', x: -14.6, z: -21.3, y: 0 }),
  Object.freeze({ id: 'gm-light-3', x: 6, z: 12, y: 0.72 }),
].map((m) => Object.freeze({ ...m, x: Math.round(m.x * 100) / 100, z: Math.round(m.z * 100) / 100 })));

// The bell's rope end is the tippable (its prompt "ring the fog bell"); the bell itself hangs over it.
export const BELL_ROPE = Object.freeze({ x: BELL.x + 1.0, z: BELL.z });

// THE SIX FINDS. Each is a list of zones; she is at a find when she is in any zone of it (horizontally between
// `rMin` and `r` of its middle, her paws within `dy` of its `y`) and its condition holds: `still` seconds of
// standing still, `meow` (a call this frame) or `belled` (the bell's rope went over this frame). Automatic: no
// prompt, no button. One spot never finds two: the lamp room's ring (r 2.0) is inside the gallery's (from 2.7).
const zone = (o) => Object.freeze(o);
export const LIGHTHOUSE_FIND_ZONES = Object.freeze({
  lamproom: Object.freeze([zone({ x: TOWER.x, z: TOWER.z, y: GALLERY_Y, r: 2.0, dy: 1.2, still: 2 })]),
  pool: Object.freeze(POOLS.map((p) => zone({ x: p.x, z: p.z, y: 0, r: p.r + 1.3, dy: 0.9, still: 2 }))),
  gull: Object.freeze([
    zone({ x: TOWER.x, z: TOWER.z, y: GALLERY_Y, rMin: 2.7, r: 4.7, dy: 1.3, still: 3 }),
    zone({ x: GULL_ROCK.x, z: GULL_ROCK.z, y: PLATEAU_Y, r: 2.4, dy: 1, still: 3 }),
  ]),
  echo: Object.freeze([zone({ x: -15, z: -19.4, y: 0, r: 3.6, dy: 1, meow: true })]),
  bell: Object.freeze([zone({ x: BELL_ROPE.x, z: BELL_ROPE.z, y: PLATEAU_Y, r: 3, dy: 1, belled: true })]),
  window: Object.freeze([zone({ x: -33.4, z: -3.6, y: PLATEAU_Y, r: 1.3, dy: 0.8, still: 2 })]),
});

// THE KEEPER'S CAT (a ginger tabby, "Biscuit" until the owner's daughter picks) paces at the cottage door and
// looks down at the shore; her kitten ("Pebble") waits in one of three hiding places, which the room seed (a
// solo walk: how many times she has walked here) picks. `from` is where the paw prints start, 14 m or so back.
export const KEEPER_DOOR = Object.freeze({ x: -28, z: -7 });
export const KEEPER_PACE = Object.freeze({ a: Object.freeze({ x: -27, z: -8 }), b: Object.freeze({ x: -27, z: -6 }) });
export const KITTEN_SPOTS = Object.freeze([
  Object.freeze({ id: 'pool', label: 'lighthouse.perch.pool', x: 24, z: 18.5, from: Object.freeze({ x: 14, z: 36 }) }),
  Object.freeze({ id: 'cave', x: -14.6, z: -17.3, from: Object.freeze({ x: 2, z: -17.4 }) }),
  Object.freeze({ id: 'boat', label: 'lighthouse.perch.boat', x: 5, z: 31.4, from: Object.freeze({ x: 14, z: 36 }) }),
]);

// Gulls and crabs (the game's own critters), in the open on the sand and the rocks, none in water or a wall.
export const LIGHTHOUSE_CRITTERS = Object.freeze([
  { type: 'seagull', x: -45.4, z: -30 }, { type: 'seagull', x: -36, z: -35 }, { type: 'seagull', x: -10, z: -31 },
  { type: 'seagull', x: 24, z: 34 }, { type: 'seagull', x: 30, z: 6 },
  { type: 'crab', x: 10.4, z: 17.6 }, { type: 'crab', x: 25.5, z: 19.5 }, { type: 'crab', x: 19, z: 27.2 }, { type: 'crab', x: 31.8, z: 13.5 },
  { type: 'crab', x: -4, z: -14 },
].map(Object.freeze));
// Two moments (the Seaside's kind): a crab scuttles out of a rock pool, a gull steals a chip. Their words are
// `lighthouse.moment.*` (src/world/lighthousewords.js), put in by world/lighthouse.js.
export const LIGHTHOUSE_MOMENTS = Object.freeze([
  { id: 'crab-pool', type: 'crab', x: 16, z: 18, from: { x: 19, z: 27.2 } },
  { id: 'gull-chip', type: 'seagull', x: 20, z: 30, from: { x: 24, z: 34 } },
].map(Object.freeze));

// The tippables gain the bell's rope (drawn by tippableLook('bellrope')): the lever and this are the two that
// the place's life reads.

const S = (x, z) => ({ x, z });
const out = (p, d) => {
  const a = Math.atan2(p.z - TOWER.z, p.x - TOWER.x);
  return S(r3(TOWER.x + (STAIR.r + d) * Math.cos(a)), r3(TOWER.z + (STAIR.r + d) * Math.sin(a)));
};
// Both ways of every leap (a leap is one way), and a mark (the chalk ring the drawing puts at a take-off).
const leap = (id, from, to, requires = null) => ({ id, from, to, mark: 'chalk', ...(requires ? { requires } : {}) });
// The moves: the stair's three flights (walked, not a feat) and the railing walk (a Tightrope crossing);
// a base leap to the Pinnacle and a Long Leap to Gull Rock, each back again; two drops, the quick ways
// down. No fall that looks like a fall: both end on a ledge or on the plateau and are 2.5 m.
export const LIGHTHOUSE_TRAVERSAL = Object.freeze({
  crossings: [stairFlight(0), stairFlight(1), stairFlight(2), railWalk()],
  gaps: [
    leap('leap-pinnacle-out', S(-39.65, PINNACLE.z), S(-42.5, PINNACLE.z)),
    leap('leap-pinnacle-back', S(-42.5, PINNACLE.z), S(-39.65, PINNACLE.z)),
    leap('long-gull-out', S(-39.65, GULL_ROCK.z), S(-43.9, GULL_ROCK.z), LONG_LEAP_ID),
    leap('long-gull-back', S(-43.9, GULL_ROCK.z), S(-39.65, GULL_ROCK.z), LONG_LEAP_ID),
  ],
  climbs: [],
  drops: [
    // off the first ledge, outwards, onto the plateau (8.5 to 6)
    { id: 'drop-landing-1', from: out(LANDINGS[1], 0.5), to: out(LANDINGS[1], 1.9), mark: 'chalk' },
    // off the gallery's rim, through a gap in the handrail, onto the second ledge (13.5 to 11)
    { id: 'drop-gallery', from: onTower(269, 4.2), to: onTower(269, 5.4), mark: 'chalk' },
  ],
});

// The ground and the moves.
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
    traversal: createTraversal(LIGHTHOUSE_TRAVERSAL, ground),
  };
}
