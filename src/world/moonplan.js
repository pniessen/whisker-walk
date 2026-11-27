// =============================================================================
// THE MOON: THE PLAN (milestone 1). Every coordinate of the ground, the craters, the ridge, the landing site and the
// return gate ring, as pure data and pure functions (no THREE, no random number, no clock). moon.js draws from these;
// the tests read them. North is -z, east is +x, heights are metres over the plain.
// docs/superpowers/specs/2026-11-23-moon-design.md section 4; the plan next to it.
// =============================================================================

import { STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL, groundTilt } from '../ground.js';

import { MOON_BOUND_ON } from './moonswitch.js';
import { LAVA_COLLIDERS, LAVA_KEEP_OUT, DEEP_CELL } from './moonlava.js';
export { MOON_BOUND_ON };
export * from './moonlava.js';

export const MOON_NAME = 'The Moon';
export const MOON_BOUNDS = Object.freeze({ minX: -54, maxX: 54, minZ: -50, maxZ: 50 });
export const MOON_SPAWN = Object.freeze({ x: 0, z: 45 });
export const GROUND_SIZE = 130; // the drawn ground reaches 65 m from the middle: the hills close the edge, the walk stops at the bounds

// Six craters (the spec's table). `d` is the depth of the bowl's floor under the plain.
export const CRATERS = Object.freeze([
  { id: 'bunny', x: -14, z: 20, r: 6, d: 1.2 },
  { id: 'echo', x: 16, z: 12, r: 8, d: 1.4 },
  { id: 'twinW', x: -2, z: 4, r: 4, d: 1.0 },
  { id: 'twinE', x: 4, z: 7, r: 3.5, d: 0.9 },
  { id: 'great', x: -20, z: -4, r: 12, d: 2.0 },
  { id: 'pit', x: 30, z: -8, r: 5, d: 1.0 },
].map(Object.freeze));

// The Earthrise Ridge: a long low ridge along the north edge that Earth stands over (its ledge chain is milestone 2's).
export const RIDGE = Object.freeze({ id: 'earthrise', x: -2, z: -47, h: 3.2, rx: 20, rz: 6.5 });

// The landing site. The lander's deck (3.0 m) and its two lower steps are a perch chain: the Moon's budget reaches the deck
// from the dust in one hop, Earth's does not.
export const LANDING = Object.freeze({ x: 0, z: 40 });
export const LANDER = Object.freeze({ x: 0, z: 40, r: 1.9, deck: 3.0 });
export const FLAG = Object.freeze({ x: 6, z: 38 });
export const POLES = Object.freeze([[-6, 36], [6.5, 33], [-6.5, 46.5], [7, 46]].map(([x, z]) => Object.freeze({ x, z })));
export const RETURN_GATE = Object.freeze({ x: -10, z: 41, r: 2.6 }); // five stones, a lintel and a soft disc: inert until the gate milestone
export const GATE_STONES = Object.freeze(Array.from({ length: 5 }, (_, i) => {
  const a = (i / 5) * Math.PI * 2 + 0.3;
  return Object.freeze({ x: RETURN_GATE.x + Math.cos(a) * RETURN_GATE.r, z: RETURN_GATE.z + Math.sin(a) * RETURN_GATE.r, a });
}));
// The boarding steps beside the lander (1.0 m, 2.1 m); the deck is the lander's own top.
export const STEP_A = Object.freeze({ x: -3.9, z: 42.7, w: 1.3, y: 1.0 });
export const STEP_B = Object.freeze({ x: -2.3, z: 41.4, w: 1.5, d: 1.1, y: 2.1 });

const c = (x, z, r) => Object.freeze({ x, z, r });
// Boulders over a metre across: ten, each a collider (the drawn boulder is a bit smaller than its circle).
export const BOULDERS = Object.freeze([
  c(-21, 38, 1.3), c(18, 28, 1.2), c(38, 12, 1.4), c(-44, -12, 1.5), c(10, -16, 1.2),
  c(-6, -12, 1.3), c(51, -14, 1.1), c(-30, 8, 1.2), c(26, -2, 1.1), c(-16, -42, 1.4),
]);

// ---- milestone 2: the base, the Old Dish, Skip Ridge, the two power cells, Pip -------------------------------------

// The Moonbase Dome: a glass dome on a white ring (radius 9, the wall's pillars on 8.7), the Core in the middle with two
// sockets, the Mission Board on the west wall, six glowing planters, and an airlock tunnel east (the way in, always open: its
// door only slides apart for show). Pure data; moonbase.js draws it.
export const DOME = Object.freeze({ x: -34, z: 26, r: 9, wall: 8.7, floor: 8.4, glass: 5.6 });
export const AIRLOCK = Object.freeze({ x0: -25.4, x1: -21.4, z: DOME.z, half: 1.45, front: Object.freeze({ x: -19.6, z: DOME.z }) });
export const CORE = Object.freeze({ x: DOME.x, z: DOME.z, r: 1.05, top: 1.1 });
// Socket 0 takes the Ridge cell (teal), socket 1 the Rover cell (amber); each sits on the pedestal's top, either side of the column.
export const SOCKETS = Object.freeze([
  Object.freeze({ x: CORE.x, z: CORE.z - 0.58, y: CORE.top }),
  Object.freeze({ x: CORE.x, z: CORE.z + 0.58, y: CORE.top }),
]);
export const BOARD = Object.freeze({ x: DOME.x - 7.4, z: DOME.z, w: 3.2, h: 1.7, y: 2.1 });
export const PLANTERS = Object.freeze(Array.from({ length: 6 }, (_, i) => {
  const a = ((30 + i * 60) / 180) * Math.PI;
  return Object.freeze({ x: DOME.x + Math.cos(a) * 5.6, z: DOME.z + Math.sin(a) * 5.6 });
}));
export const OLD_DISH = Object.freeze({ x: -44, z: 14, post: 4.8, bowl: 3.3 });
// (milestone 8) The Old Dish's ledge: a low stone shelf beside its post, a perch (1.1 m) she can hop up on to stand under the bowl, with a lamp on its edge.
export const DISH_LEDGE = Object.freeze({ x: -41.6, z: 15.6, y: 1.1, r: 1.3 });
// (milestone 8) The Core's third socket: the Deep Cell's, on the pedestal's top on the side toward the airlock (the two cells' sockets are north and south of the column).
export const DEEP_SOCKET = Object.freeze({ x: CORE.x + 0.62, z: CORE.z, y: CORE.top });

// Skip Ridge's chain: two rock pillars (2.6 m and 5.0 m, each step more than Earth's best climb of 2.2 and less than the Moon's
// 3.2) and the Ridge cell on the top. Only the Moon's doubled climb takes it (test/moonbase.test.js runs the real rules).
export const SKIP = Object.freeze([
  Object.freeze({ x: 7.5, z: -34.5, y: 2.6, r: 1.6 }),
  Object.freeze({ x: 9.8, z: -37.0, y: 5.0, r: 1.6 }),
]);
// (Ridge clarity) the step marker: a teal ring on the dust at the first pillar's south-west foot (a cat stands on it 2.7 m from the pillar's middle, well inside the paw button's reach)
export const RIDGE_MARK = Object.freeze({ x: 6.3, z: -32.1 });
// (the cell lies a step to the east of the pillar's middle, where she lands, so she is not standing inside it; the perch pick-up window is 1.0 m)
export const RIDGE_CELL = Object.freeze({ x: SKIP[1].x + 0.85, z: SKIP[1].z, y: SKIP[1].y });
// The Rover cell lies at the Far Beacon, 70 m from the landing on the east end of Dot's track (milestone 3: the real beacon, the real
// pick-up; she may walk the 70 m, about 20 s, or drive Dot there in about 10).
export const ROVER_CELL = Object.freeze({ x: 46, z: 0, y: 0.6 });
// Pip: asleep beside the lander; when woken he rolls ahead along these waypoints to the airlock's front and then follows her.
export const PIP_SLEEP = Object.freeze({ x: 3, z: 43 });
export const PIP_LEAD = Object.freeze([[2.5, 36.5], [-4, 34], [-17, 31], [AIRLOCK.front.x, AIRLOCK.front.z]].map(([x, z]) => Object.freeze({ x, z })));

// ---- milestone 3: Dot the rover, the Rover Depot, the track of lights and the Far Beacon ------------------------------------------

// The depot east of the landing: a shed, a charging pad and Dot parked on it, facing the way the track starts. The track is a loop of
// nine waypoints (the spec's 214 m, a little more once the corners are cut) with a lit post every 6 m; she may leave it anywhere the ground
// is walkable. Dot is NOT a collider while she drives; parked, she is a small one (a collider the life puts in the live list and takes
// out again), so a cat walks round her, not through her.
export const DEPOT = Object.freeze({ x: 30, z: 34 });
export const DOT_PARK = Object.freeze({ x: 29.4, z: 38.4, yaw: 2.43 });
export const DOT_REACH = 2.9; // m from Dot's middle: "Hop in" shows (her parked collider is 0.9 wide, so a cat can stand at 1.25)
export const DOT_PARKED_R = 0.9;
export const SHED = Object.freeze({ x: 22.4, z: 40.2, w: 3.6, d: 6.0, h: 3.1 }); // its open side faces east, toward Dot
export const FAR_BEACON = Object.freeze({ x: ROVER_CELL.x, z: ROVER_CELL.z, mast: 3.6 });
export const TRACK = Object.freeze([[30, 34], [42, 20], [42.5, 0], [38, -18], [14, -26], [-10, -24], [-30, -14], [-26, 4], [-6, 24]].map(([x, z]) => Object.freeze({ x, z })));
export const TRACK_POST_EVERY = 6; // m along the loop

// The distance from (x, z) to the track's loop (the plain polyline): the rocks keep clear of it, the tests measure it.
export function trackDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < TRACK.length; i++) {
    const a = TRACK[i];
    const b = TRACK[(i + 1) % TRACK.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}


// ---- milestone 4: Earthrise Rock, the Sample Pit, the Echo Crater, the Great Bowl's cheese, the Quiet Plain, the pebbles ------------

// Earthrise Rock: a three-ledge climb on the Earthrise Ridge's south flank (1.1, 2.05 and 3.0 m over the dust under each; each step is
// within the Moon's plainest climb of 3.2 m and the top holds golden mouse 2). Collider and perch share a centre, as Skip Ridge's do.
export const ROCK_LEDGES = Object.freeze([
  Object.freeze({ x: -7.0, z: -43.3, y: 1.1, r: 1.4 }),
  Object.freeze({ x: -4.4, z: -44.9, y: 2.05, r: 1.3 }),
  Object.freeze({ x: -2.0, z: -46.4, y: 3.0, r: 1.3 }),
]);
// The Sample Pit's rock: the boulder golden mouse 3 hides behind, on the side the walk comes from (the spawn is to the south-west: the rock is
// between). A collider; not one of the loose boulders, which are kept out of the bowls.
export const PIT_ROCK = Object.freeze({ x: 30.0, z: -8.1, r: 1.0 });
// The golden mice, as goldmice.js holds them (a test keeps the two equal): the lander's deck (one hop), Earthrise Rock's top, the pit's floor.
export const MOON_MICE = Object.freeze([
  Object.freeze({ id: 'gm-moon-1', x: 0, z: 40.6, y: 3 }),
  Object.freeze({ id: 'gm-moon-2', x: -2, z: -46, y: 3 }),
  Object.freeze({ id: 'gm-moon-3', x: 30.8, z: -9.6, y: 0 }),
  // wing E stub (milestone X0; the position is a first guess, tuned in M1): the Old Relay Station's tower ledge, one Moon hop up. NOT in ROCK_KEEP_OUT; the beauty scatter reads the first three by name.
  Object.freeze({ id: 'gm-moon-4', x: 44, z: 36, y: 3 }),
]);
// The three finds that stand on ground (the first three are milestone 2's). Echo: stand in the crater's middle (the floor is `d` under the dust) and meow.
export const ECHO = Object.freeze({ x: 16, z: 12, r: 3.2 });
// The Great Bowl's golden wedge (the Moon Cheese) lies on the bowl's floor; reaching it finds it.
export const CHEESE = Object.freeze({ x: -20, z: -4, r: 1.7 });
// The Quiet Plain: untouched dust west of the landing site, bounded by four lamp posts; 20 m of walking across it finds Quiet Dust.
export const QUIET_PLAIN = Object.freeze({ x0: -30, x1: -10, z0: 44, z1: 49, walk: 20 });
export const PLAIN_POSTS = Object.freeze([[-9.2, 43.2], [-9.2, 49.2], [-30.8, 43.2], [-30.8, 49.2]].map(([x, z]) => Object.freeze({ x, z })));
// Eight glowing pebbles (the walk's own collectibles, ids moon-1 to moon-8): out on the open dust, none near a mouse, a find spot or a job.
export const PEBBLES = Object.freeze([
  [-14, 14], [22, 4], [-8, -4], [36, -14], [-36, 12], [6, 22], [-24, 38], [-30, -2],
].map(([x, z], i) => Object.freeze({ id: `moon-${i + 1}`, x, z })));
// The scripted points of the story (a find never sits within 3 m of one): Pip's bed, the cells, the sockets, the board, Dot's pad.
export const JOB_POINTS = Object.freeze([PIP_SLEEP, RIDGE_CELL, ROVER_CELL, DEEP_CELL, ...SOCKETS, { x: BOARD.x + 1.5, z: BOARD.z }, DOT_PARK]);


// ---- milestone 5: Star Hill (wing B): the tower, its spiral ramp, the observatory, the Star Table ---------------------------------

// Star Hill is a stone tower 5 m high and 12 m across with a ramp wound once and a half round it (the ground rules of this game
// are strips and discs with square edges, a rim of 0.3 m or more is a wall: a smooth cone steeper than 1 in 1 is still climbed by short
// steps, so the tower's side is a true wall and the ramp, which rises 1 in 6 or so, is the one way up). The ramp's inner edge lies against the tower; it
// starts on the dust at bearing `a0` (south-south-east, toward the spawn) and winds round to the west, the north and the east, ending
// in a flat landing that joins the top. Pure data and one pure function; moonY adds it to the plain's own height.
export const STAR_HILL = Object.freeze({
  x: -38, z: -32, h: 5, top: 6.0, // the top's radius (a disc); its height over the dust
  rs: 7.3, w: 2.8, // the ramp's middle radius and its width (from 5.9 to 8.7: it overlaps the tower's wall a little)
  a0: (70 * Math.PI) / 180, turn: 1.5 * Math.PI, // where the ramp starts (angle in x, z) and how far round it goes
  flat: 0.12, // the last share of the ramp is level (a landing)
});
// The ramp's height at a fraction t (0 at the dust, h on the landing) and where the ramp's middle stands at that fraction.
export const rampHeight = (t) => STAR_HILL.h * Math.min(1, Math.max(0, t) / (1 - STAR_HILL.flat));
export const rampAngle = (t) => STAR_HILL.a0 + STAR_HILL.turn * t;
export const rampPoint = (t, k = 0) => {
  const a = rampAngle(t);
  const r = STAR_HILL.rs + k;
  return { x: STAR_HILL.x + Math.cos(a) * r, z: STAR_HILL.z + Math.sin(a) * r, y: rampHeight(t) };
};
const HILL_OUT = STAR_HILL.rs + STAR_HILL.w / 2;
// How much Star Hill lifts the ground at (x, z): the top's disc, the ramp's band, else 0.
export function hillAdd(x, z) {
  const H = STAR_HILL;
  const dx = x - H.x;
  const dz = z - H.z;
  const r2 = dx * dx + dz * dz;
  if (r2 > HILL_OUT * HILL_OUT) return 0;
  const r = Math.sqrt(r2);
  if (r <= H.top) return H.h;
  if (r >= H.rs - H.w / 2) {
    const a = (((Math.atan2(dz, dx) - H.a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const t = a / H.turn;
    if (t <= 1 + 1e-9) return rampHeight(t);
  }
  return 0;
}
// The observatory on the top: eight pillars round a level floor, a shallow dome with a slit, the telescope in the middle. The pillars
// stand on a ring (the way in is between any two); the telescope's base is the one collider in the middle.
export const OBSERVATORY = Object.freeze({
  x: STAR_HILL.x, z: STAR_HILL.z, floor: 5.6, ring: 3.7, pillars: 8, pillarH: 3.4, pillarR: 0.3, dome: 4.1, domeRise: 1.4,
  scopeR: 0.8, reach: 2.9, level: 1.4, // the telescope's collider; how near her paws the prompt shows and how far from the floor's height
});
export const PILLAR_SPOTS = Object.freeze(Array.from({ length: OBSERVATORY.pillars }, (_, i) => {
  const a = ((i + 0.5) / OBSERVATORY.pillars) * Math.PI * 2;
  return Object.freeze({ x: OBSERVATORY.x + Math.cos(a) * OBSERVATORY.ring, z: OBSERVATORY.z + Math.sin(a) * OBSERVATORY.ring });
}));
// The Star Table at the hill's foot (the spec's plaza was (-30, -26): that is 10 m from the hill, inside the ramp's reach, so it stands 4 m farther out).
export const STAR_TABLE = Object.freeze({ x: -27, z: -24, r: 1.35, top: 0.95, reach: 3.2 });
export const STAR_COLLIDERS = Object.freeze([
  ...PILLAR_SPOTS.map((p) => c(p.x, p.z, OBSERVATORY.pillarR)),
  c(OBSERVATORY.x, OBSERVATORY.z, OBSERVATORY.scopeR),
  c(STAR_TABLE.x, STAR_TABLE.z, STAR_TABLE.r),
]);

// ---- milestone 6: Wing C, the Launch Complex (the pad, the gantry, the rocket, the Launch Desk, the Viewing Mound, the tanks), the Message
// Desk in the dome and the binocular stand on Earthrise Rock --------------------------------------------------------------------------

// The pad (a flat disc of radius 8) with the 16 m rocket on it. The gantry tower stands north of the rocket (behind it from the mound) and its
// arm swings away at T-1 s; the two fuel spheres stand on the pad's north-east edge. The rocket's mailbox slot faces the Launch Desk (south-west).
export const PAD = Object.freeze({ x: 42, z: -34, r: 8 });
export const ROCKET = Object.freeze({ x: PAD.x, z: PAD.z, r: 1.55, h: 16, stand: 1.2, reach: 3.5 }); // the stand under its feet lets the plume show below it
export const ROCKET_SLOT = Object.freeze({ x: PAD.x - 1.0, z: PAD.z + 1.0 }); // where the postcard goes in (the body's face toward the desk)
// The countdown board: a post with a screen at the pad's near edge, facing the Launch Desk and the mound.
export const COUNT_BOARD = Object.freeze({ x: PAD.x - 5.5, z: PAD.z + 4.5, y: 4.6, size: 3.2 });
export const GANTRY = Object.freeze({ x: PAD.x, z: PAD.z - 5.6, h: 13, armY: 9.5, armLen: 4.6, swing: 1.25 }); // `swing` radians the arm turns away
export const TANKS = Object.freeze([Object.freeze({ x: 46.8, z: -39.0, r: 1.7 }), Object.freeze({ x: 49.6, z: -35.6, r: 1.7 })]);
// The Launch Desk: a console with the big red button, between the pad and the mound.
export const LAUNCH_DESK = Object.freeze({ x: 30, z: -28, reach: 2.7 });
// The Viewing Mound: a low, gentle hill, 2 m high, for watching from. The spec put it at (24, -20); Dot's track runs 2.5 m from that
// point, so it stands 20 m north-west at (24, -40) (19 m from the pad) where nothing drives over it.
export const MOUND = Object.freeze({ x: 24, z: -40, r: 7.5, h: 2 });
export const BENCHES = Object.freeze([Object.freeze({ x: 22.6, z: -40.8, yaw: 0.5 }), Object.freeze({ x: 25.8, z: -39.2, yaw: 0.5 })]);
// The Message Desk in the dome (between two planters, on the side away from the board and the door): where the postcard's stamp is chosen.
export const MESSAGE_DESK = Object.freeze({ x: DOME.x + Math.cos((240 * Math.PI) / 180) * 6.0, z: DOME.z + Math.sin((240 * Math.PI) / 180) * 6.0, reach: 2.7 });
// The binocular stand on Earthrise Rock's top ledge, a step from golden mouse 2: a stone post with a pair of binoculars on it.
export const BINOCULARS = Object.freeze({ x: -1.1, z: -46.9, y: 3.0, reach: 2.4, level: 1.4 });
export const REPLY_NEAR = 6; // m of Earthrise Rock's top: near enough to wait for Earth's answer
export const LAUNCH_COLLIDERS = Object.freeze([
  Object.freeze({ x: ROCKET.x, z: ROCKET.z, r: ROCKET.r }),
  Object.freeze({ x: GANTRY.x - 0.8, z: GANTRY.z, r: 0.9 }), Object.freeze({ x: GANTRY.x + 0.8, z: GANTRY.z, r: 0.9 }),
  ...TANKS.map((t) => Object.freeze({ x: t.x, z: t.z, r: t.r })),
  Object.freeze({ x: LAUNCH_DESK.x, z: LAUNCH_DESK.z, r: 0.85 }),
  Object.freeze({ x: MESSAGE_DESK.x, z: MESSAGE_DESK.z, r: 0.75 }),
]);


// ---- milestone 7a: Bounce Park's Beam Hops, the hop board's strip, the course lamps ---------------------------------------------

// Eight Beam Hops: stone beams in a gentle wave on the open plain in the east (2026-11-25, the Ridge clarity fix: they used to lie at z -30 right next to Skip Ridge's
// pillars and read as one more staircase to the Ridge cell; they are now about 50 m from the pillars, off the way from the lander and the track to them). The wave's
// middle is BEAM_MID, its line runs `ang` degrees from east (120: toward the north-west, so the first beam is the south-eastern one), 24 m long, rising to
// 3.0 m and coming down again. Each beam is 0.7 m (at most) above the last, and about 3.45 m (centre to centre) from its neighbours: more than Earth's very best
// reach (3.2 m, Sure Claws) and less than the Moon's plainest (3.9 m), so the crossing is the Moon's alone. Every beam is a perch AND a collider (as Skip Ridge's pillars).
const BEAM_HEIGHTS = [0.6, 1.3, 2.0, 2.7, 3.0, 2.4, 1.6, 0.8];
export const BEAM_MID = Object.freeze({ x: 31, z: 11, ang: 120 });
export const BEAMS = Object.freeze(BEAM_HEIGHTS.map((y, i) => {
  const a = (BEAM_MID.ang * Math.PI) / 180;
  const d = -12 + (i * 24) / 7; // along the line
  const o = 0.7 * Math.sin(i * 0.9); // across it: the wave
  return Object.freeze({
    x: Math.round((BEAM_MID.x + Math.cos(a) * d - Math.sin(a) * o) * 100) / 100,
    z: Math.round((BEAM_MID.z + Math.sin(a) * d + Math.cos(a) * o) * 100) / 100, y, r: 1.25,
  });
}));

// The hop board's strip: a lane of level dust running east from a start line (x0), 16 m long and 4 m wide, a post every metre. She takes off behind the line
// (at most `back` m before it, a hand's width past it) on the ground inside the lane and lands on level ground inside it: the board reads the metres from
// the line to where she lands. Nothing is lost for a hop that does not count: the board simply does not move.
export const JUMP_LANE = Object.freeze({ x0: 0, z: -9, len: 16, half: 2.0, back: 1.2, over: 0.15, slack: 0.4, level: 0.2 });
// The board: a post with a screen beside the start line, facing the lane. (Dot's track is 14 m away; the rocks keep clear of the lane.)
export const JUMP_BOARD = Object.freeze({ x: 0.6, z: JUMP_LANE.z + 3.9, y: 2.5, size: 2.6, near: 45 });
export const JUMP_RECORD_MAX = 2000; // cm: the save's ceiling (state.moon.jump)

// The course lamps: a ring (outer radius `r`) round the top of every perch of the three ring-free courses (Skip Ridge, Earthrise Rock, the Beam Hops) that lights when she stands on it.
export const COURSE_LAMPS = Object.freeze([...SKIP, ...ROCK_LEDGES, ...BEAMS].map((p) => Object.freeze({ x: p.x, z: p.z, y: p.y, r: Math.round(p.r * 75) / 100 })));
export const BEAM_COLLIDERS = Object.freeze(BEAMS.map((b) => c(b.x, b.z, b.r + 0.05)));

// ---- milestone 7b: the bound's courses (Tier 2). All empty when MOON_BOUND_ON is false (world/moonswitch.js), so the Moon is then exactly milestone 7a's. -------------
// Three RIFTS: shallow trenches (a stadium: a straight axis from (x0, z0) to (x1, z1) and a width w, 3.5 to 6.5 m) that only a bound crosses; nothing the story, the rover,
// the rocket or the mice need lies beyond one, and each can be walked round at its ends. Her walk is stopped at the lips by a row of overlapping colliders along the axis
// (flagged `rift`: the bound flies over those and no other); the bound never lands inside one (world/moonbound.js).
const RIFT_DEFS = [[23, -17, 23, -8, 3.5], [-20, -35, -20, -25, 5], [48.5, 7, 48.5, 16, 6.5]]; // (milestone 8: the third rift moved from (-46, -4..7), where the Cave Massif now stands, across the plain to the east edge)
export const RIFTS = Object.freeze(MOON_BOUND_ON ? RIFT_DEFS.map(([x0, z0, x1, z1, w]) => Object.freeze({ x0, z0, x1, z1, w })) : []);
export const RIFT_LIP = 0.3; // m beyond a rift's half width inside which no landing stands: her body's 0.35 less the 0.05 the colliders' scallops dip
// Five lit RING GATES in a row west to east along the park's south field (each a hoop of radius R standing in the north-south plane, its centre y metres over the
// dust, on a short post at its south side): a ring lights when she bounds through it (the walk's own record of this walk, nothing is saved).
const RING_DEFS = [[-14, -16, 1.6], [-7, -17.5, 1.8], [0, -17, 2.0], [7, -18, 2.25], [14, -17.5, 2.5]];
export const RING_R = 1.2;
export const RING_GATES = Object.freeze(MOON_BOUND_ON ? RING_DEFS.map(([x, z, y]) => Object.freeze({ x, z, y, r: RING_R, post: Object.freeze({ x, z: z + RING_R + 0.4 }) })) : []);
const riftCircles = RIFTS.flatMap((f) => {
  const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
  const r = f.w / 2;
  const n = Math.ceil(len / (2 * Math.sqrt(0.1 * r - 0.0025))) + 1; // the lip's scallops dip at most 0.05 m
  return Array.from({ length: n }, (_, i) => ({ ...c(f.x0 + ((f.x1 - f.x0) * i) / (n - 1), f.z0 + ((f.z1 - f.z0) * i) / (n - 1), r), rift: true }));
});
export const RIFT_COLLIDERS = Object.freeze(riftCircles.map((q) => Object.freeze(q)));
export const RING_COLLIDERS = Object.freeze(RING_GATES.map((g) => c(g.post.x, g.post.z, 0.25)));

const ring = [];
for (let i = 0; i < 40; i++) {
  const a = (i / 40) * Math.PI * 2;
  const x = DOME.x + Math.cos(a) * DOME.wall;
  const z = DOME.z + Math.sin(a) * DOME.wall;
  if (Math.cos(a) > 0 && Math.abs(z - DOME.z) < 2.0) continue; // the airlock's mouth
  ring.push(c(x, z, 0.7));
}
export const DOME_RING = Object.freeze(ring.slice());
const tunnel = [];
for (let i = 0; i < 5; i++) for (const s of [-1, 1]) tunnel.push(c(AIRLOCK.x0 + 0.4 + i * 0.8, AIRLOCK.z + s * AIRLOCK.half, 0.45));
export const BASE_COLLIDERS = Object.freeze([
  ...ring, ...tunnel, c(CORE.x, CORE.z, CORE.r),
  ...[-1.1, 0, 1.1].map((dz) => c(BOARD.x + 0.1, BOARD.z + dz, 0.6)),
  ...PLANTERS.map((p) => c(p.x, p.z, 0.55)),
  c(OLD_DISH.x, OLD_DISH.z, 0.8),
  c(DISH_LEDGE.x, DISH_LEDGE.z, DISH_LEDGE.r + 0.05),
  ...LAVA_COLLIDERS,
  ...SKIP.map((p) => c(p.x, p.z, p.r + 0.05)),
  c(ROVER_CELL.x, ROVER_CELL.z, 0.5),
  // the depot's shed (two circles cover its 6 m x 3.6 m footprint) and the Far Beacon's mast
  c(SHED.x, SHED.z - 1.6, 1.9), c(SHED.x, SHED.z + 1.6, 1.9),
  c(FAR_BEACON.x + 1.1, FAR_BEACON.z, 0.3),
  ...ROCK_LEDGES.map((p) => c(p.x, p.z, p.r + 0.05)),
  c(PIT_ROCK.x, PIT_ROCK.z, PIT_ROCK.r),
  ...PLAIN_POSTS.map((p) => c(p.x, p.z, 0.2)),
  ...STAR_COLLIDERS,
  ...LAUNCH_COLLIDERS,
  ...BEAM_COLLIDERS,
  ...RIFT_COLLIDERS,
  ...RING_COLLIDERS,
]);

export const MOON_COLLIDERS = Object.freeze([
  c(LANDER.x, LANDER.z, LANDER.r + 0.2),
  c(STEP_A.x, STEP_A.z, 0.95),
  ...GATE_STONES.map((s) => c(s.x, s.z, 0.45)),
  c(FLAG.x, FLAG.z, 0.2),
  ...POLES.map((p) => c(p.x, p.z, 0.25)),
  ...BOULDERS,
  ...BASE_COLLIDERS,
]);

// Perches (heights over the ground under each). No labels: nothing here is a discovery yet.
const P = (x, z, y, kind) => Object.freeze({ x, z, y, kind });
export const MOON_PERCHES = Object.freeze([
  P(STEP_A.x, STEP_A.z, STEP_A.y, 'crate'),
  P(STEP_B.x, STEP_B.z, STEP_B.y, 'crate'),
  P(LANDER.x, LANDER.z, LANDER.deck, 'roof'),
  ...SKIP.map((p) => P(p.x, p.z, p.y, 'stone')),
  ...ROCK_LEDGES.map((p) => P(p.x, p.z, p.y, 'stone')),
  P(DISH_LEDGE.x, DISH_LEDGE.z, DISH_LEDGE.y, 'stone'),
  ...BEAMS.map((p) => P(p.x, p.z, p.y, 'stone')),
]);

// Interesting spots a wanderer may head for: open dust, all reachable from the spawn on foot (the walk clears them of colliders).
export const MOON_POIS = Object.freeze([
  [14, 36], [-22, 34], [21, 26], [-6, 14], [8, 0], [-30, -16], [38, -2], [-2, -20], [22, -32], [-33, 8], [0, -40], [44, 26],
].map(([x, z]) => Object.freeze({ x, z })));

// Where the rocks may not stand: the landing site, the ring, the spawn's plain, and the places the later milestones build
// (centre x, z, radius). The scatter keeps this clear, so a later milestone never has to move a rock.
export const ROCK_KEEP_OUT = Object.freeze([
  [0, 42, 10], [-10, 41, 5.5], [-20, 46.5, 12], [0, 46, 7], [46, 0, 4],
  [-34, 26, 13], [-44, 14, 7], [30, 34, 11], [42, -34, 12], [30, -28, 6], [24, -20, 6], [-38, -32, 14], [-27, -24, 4.5], [8, -40, 8],
  [-4.5, -44.8, 6.5], [31, -10, 4],
  [42, -34, 9.5], [24, -40, 8.6], [-37, 20.8, 2],
  [BEAM_MID.x, BEAM_MID.z, 15.6], [10, -9, 13], [0.6, -5.1, 2.4], // (milestone 7a) the Beam Hops (moved east 2026-11-25), the hop board's strip and its board
  ...LAVA_KEEP_OUT, [-41.6, 15.6, 3.2], // (milestone 8) the Cave Massif, its mouth and the Old Dish's ledge
  ...(MOON_BOUND_ON ? [[23, -12.5, 7.5], [-20, -30, 7.5], [48.5, 11.5, 9], [0, -17.5, 16.5]] : []), // (milestone 7b) the rifts and the ring gates' row
]);

// Rectangles { minX, maxX, minZ, maxZ } where the rocks, pebbles and rim chunks are taken away AFTER they are scattered (a stage pushes its footprint here; never through ROCK_KEEP_OUT, which
// would move every rock): every stream and every other item stays exactly as it was. Empty until a wing fills it (X0 only reserves the hook, as the Reef and the Crystal Cave do).
export const MOON_CLEARS = [];

// ---- the heightfield -------------------------------------------------------------------------------------------------

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// The plain's height at (x, z): the six bowls (a cosine bowl, a low raised rim), the long ridge, the hills that close the
// far edge. Smooth everywhere; steepest well under the walk's 0.5 per metre inside the bounds.
export function moonBaseY(x, z) {
  let y = 0;
  let bowl = 0; // the deepest bowl at the point, not the sum: the twin bowls overlap and must not double their slope
  for (const k of CRATERS) {
    const u = Math.hypot(x - k.x, z - k.z) / k.r;
    if (u < 1) bowl = Math.min(bowl, -k.d * 0.5 * (1 + Math.cos(Math.PI * u)));
    if (u < 2.2) y += k.d * 0.14 * Math.exp(-(((u - 1.1) / 0.26) ** 2));
  }
  y += bowl;
  const rx = (x - RIDGE.x) / RIDGE.rx;
  const rz = (z - RIDGE.z) / RIDGE.rz;
  y += RIDGE.h * (0.88 + 0.12 * Math.sin(x * 0.33)) * Math.exp(-(rx ** 4) - rz * rz);
  const mu = Math.hypot(x - MOUND.x, z - MOUND.z) / MOUND.r; // the Viewing Mound (milestone 6): a cosine bump, 2 m high, slope at most 0.42
  if (mu < 1) y += MOUND.h * 0.5 * (1 + Math.cos(Math.PI * mu));
  const dx = Math.max(MOON_BOUNDS.minX - x, 0, x - MOON_BOUNDS.maxX);
  const dz = Math.max(MOON_BOUNDS.minZ - z, 0, z - MOON_BOUNDS.maxZ);
  const d = Math.hypot(dx, dz);
  if (d > 0) {
    // far hills: a wall of low hills round the plain, higher and lower as you go round (the skyline is never a straight line)
    const th = Math.atan2(z, x);
    const n = 1 + 0.3 * Math.sin(3 * th + 0.7) + 0.2 * Math.sin(7 * th + 2.1) + 0.12 * Math.sin(13 * th + 0.4);
    y += 6.5 * n * smooth(d / 11);
  }
  return y;
}

// The plain's height with Star Hill on it (milestone 5): what she walks on and what everything stands on.
export const moonY = (x, z) => moonBaseY(x, z) + hillAdd(x, z);

// The Moon's ground in the shape the walk reads (src/ground.js's: y, ceil, canStep, slide, sameLevel, gradient, tilt), made
// from the heightfield above. A step is legal under the same rule as every raised ground (STEP_MAX plus MAX_GRADE a metre).
const EPS = 0.25;
export function createMoonGround() {
  const y = moonY;
  function canStep(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len === 0) return true;
    const n = Math.max(1, Math.ceil(len / SUBSTEP - 1e-9));
    const seg = len / n;
    const tol = STEP_MAX + MAX_GRADE * seg;
    let prev = y(ax, az);
    for (let i = 1; i <= n; i++) {
      const cur = y(ax + (dx * i) / n, az + (dz * i) / n);
      if (Math.abs(cur - prev) > tol) return false;
      prev = cur;
    }
    return true;
  }
  function slide(px, pz, pos) {
    if (canStep(px, pz, pos.x, pos.z)) return false;
    if (canStep(px, pz, pos.x, pz)) pos.z = pz;
    else if (canStep(px, pz, px, pos.z)) pos.x = px;
    else { pos.x = px; pos.z = pz; }
    return true;
  }
  const self = Object.freeze({
    flat: false,
    y,
    ceil: () => Infinity,
    canStep,
    slide,
    sameLevel: (ax, az, bx, bz) => Math.abs(y(ax, az) - y(bx, bz)) <= LEVEL_TOL,
    gradient(x, z, out) {
      out.x = (y(x + EPS, z) - y(x - EPS, z)) / (2 * EPS);
      out.z = (y(x, z + EPS) - y(x, z - EPS)) / (2 * EPS);
      return out;
    },
    tilt: (x, z, yaw, out) => groundTilt(self, x, z, yaw, out),
  });
  return self;
}

// ---- the rocks -------------------------------------------------------------------------------------------------------

// Rock classes: how many, their size range (metres, the radius), and whether they cast a shadow. Positions come from the
// seeded scatter in moonparts.js, held clear of ROCK_KEEP_OUT, the boulders' own spots (the colliders above) and the craters' floors.
export const ROCK_CLASSES = Object.freeze({
  small: Object.freeze({ count: 70, min: 0.18, max: 0.4, cast: false }),
  medium: Object.freeze({ count: 40, min: 0.45, max: 0.8, cast: true }),
  large: Object.freeze({ count: 20, min: 0.9, max: 1.4, cast: true }),
});

// 1,800 stars on a full device, 900 on the lite rung (the sky dress reads this; beauty round 1 made the sky dense, a third of them along a faint Milky Way).
export const STARS = Object.freeze({ full: 1800, lite: 900, radius: 285 });

// Earth: one quad about 8 degrees across, 21 degrees up, 12 degrees east of north (north is -z).
export const EARTH = Object.freeze({ elevDeg: 21, bearingDeg: 12, radius: 275, size: 40 });
