// =============================================================================
// THE MOON: THE PLAN (milestone 1). Every coordinate of the ground, the craters, the ridge, the landing site and the
// return gate ring, as pure data and pure functions (no THREE, no random number, no clock). moon.js draws from these;
// the tests read them. North is -z, east is +x, heights are metres over the plain.
// docs/superpowers/specs/2026-11-23-moon-design.md section 4; the plan next to it.
// =============================================================================

import { STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL, groundTilt } from '../ground.js';

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

// Skip Ridge's chain: two rock pillars (2.6 m and 5.0 m, each step more than Earth's best climb of 2.2 and less than the Moon's
// 3.2) and the Ridge cell on the top. Only the Moon's doubled climb takes it (test/moonbase.test.js runs the real rules).
export const SKIP = Object.freeze([
  Object.freeze({ x: 7.5, z: -34.5, y: 2.6, r: 1.6 }),
  Object.freeze({ x: 9.8, z: -37.0, y: 5.0, r: 1.6 }),
]);
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
  ...SKIP.map((p) => c(p.x, p.z, p.r + 0.05)),
  c(ROVER_CELL.x, ROVER_CELL.z, 0.5),
  // the depot's shed (two circles cover its 6 m x 3.6 m footprint) and the Far Beacon's mast
  c(SHED.x, SHED.z - 1.6, 1.9), c(SHED.x, SHED.z + 1.6, 1.9),
  c(FAR_BEACON.x + 1.1, FAR_BEACON.z, 0.3),
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
]);

// Interesting spots a wanderer may head for: open dust, all reachable from the spawn on foot (the walk clears them of colliders).
export const MOON_POIS = Object.freeze([
  [14, 36], [-22, 34], [24, 22], [-6, 14], [8, 0], [-30, -16], [38, -2], [-2, -20], [22, -32], [-38, 6], [0, -40], [44, 26],
].map(([x, z]) => Object.freeze({ x, z })));

// Where the rocks may not stand: the landing site, the ring, the spawn's plain, and the places the later milestones build
// (centre x, z, radius). The scatter keeps this clear, so a later milestone never has to move a rock.
export const ROCK_KEEP_OUT = Object.freeze([
  [0, 42, 10], [-10, 41, 5.5], [-20, 46.5, 12], [0, 46, 7], [46, 0, 4],
  [-34, 26, 13], [-44, 14, 7], [30, 34, 11], [42, -34, 12], [30, -28, 6], [24, -20, 6], [-38, -32, 10], [-47, 0, 8], [8, -40, 8],
]);

// ---- the heightfield -------------------------------------------------------------------------------------------------

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// The plain's height at (x, z): the six bowls (a cosine bowl, a low raised rim), the long ridge, the hills that close the
// far edge. Smooth everywhere; steepest well under the walk's 0.5 per metre inside the bounds.
export function moonY(x, z) {
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

// 700 stars on a full device, 350 on the lite rung (the sky dress reads this).
export const STARS = Object.freeze({ full: 700, lite: 350, radius: 285 });

// Earth: one quad about 8 degrees across, 21 degrees up, 12 degrees east of north (north is -z).
export const EARTH = Object.freeze({ elevDeg: 21, bearingDeg: 12, radius: 275, size: 40 });
