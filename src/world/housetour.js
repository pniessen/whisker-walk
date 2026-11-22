// =============================================================================
// The Old House: the shots and the tours for the film (Old House step 1, Task 7).
// Pure data and one small autopilot: no THREE, no randomness, no clock. It is
// imported only by tests and the picture page (verify-house.html), which
// photograph HOUSE_SHOTS and film HOUSE_TOURS for the owner.
//
//   HOUSE_SHOTS  { name: { at: [x, z], face: [fx, fz], zoom, caption, ledge?, perch?,
//                open?, hud? } }: she stands at `at`, heading `face`, the camera
//                behind her at zoom step `zoom` (src/camzoom.js: 0 Close, 1 Middle,
//                2 Far, 3 Farther). Step 2: `ledge` names the furniture top she
//                stands on (houseplan.js HOUSE_LEDGES), `perch` the knock-over perch
//                (housemoves.js HOUSE_PERCHES; `at` is its spot), `open` starts the
//                walk with the secret bookcase open, `hud` shows the daily goals and
//                the corner map.
//   HOUSE_TOURS  { name: { start: { x, z, face }, steps } }. A step is
//                { to: [x, z], caption?, near? } (walk there with the stick, until
//                within `near`, default ARRIVE_R), { zoom, hold, caption? } (take
//                that zoom step, then wait `hold` seconds), and since step 2
//                { jump: true, caption? } (press the traversal's jump button once,
//                then wait for the hop to end) or { wait: s, caption? } (stand
//                still s seconds). Walked by createHousePilot, the real player with
//                the stick and the jump button alone.
//   grand        every room, up and down every stair, and it ends zoomed out
//                on the whole house (the owner's film).
//   film         the shorter one, to fit the 30 to 45 s film at real time.
//   climb        (step 2) the library route, from the library door up the steps,
//                along the plank, across the corner to the golden mouse, and down
//                in short steps to the floor.
//   things       (step 2) the film of everything to do, 40 to 60 s: the clock
//                strikes, a tune on the piano, the hearth cushion, the library
//                climb to the golden mouse, the bookcase opens and she goes up the
//                secret stair, the bedroom leap to the wardrobe, up the back stair
//                to the window seat, the box of old toys, and a zoom out to Far.
//
// Captions are short plain words for a child; no series words.
// =============================================================================

import { stickToWorld, behindYaw } from '../traversal.js';

const freeze = Object.freeze;
const shot = (at, face, zoom, caption, opts = {}) => freeze({ at: freeze(at), face: freeze(face), zoom, caption, ...opts });

export const HOUSE_SHOTS = freeze({
  hall: shot([0, 7], [0, 1], 1, 'The hall'),
  library: shot([-9, 7], [-1, -0.5], 1, 'The library'),
  parlour: shot([8, 7], [1, 0], 1, 'The parlour'),
  kitchen: shot([7, -1], [1, -1], 1, 'The kitchen'),
  cellar: shot([25, -5], [0, -1], 1, 'Down in the cellar'),
  bedroom: shot([-3, -9], [-1, -1], 1, 'The bedroom'),
  attic: shot([-19, -10], [-1, 0], 1, 'Up in the attic'),
  'stairs-up': shot([0, -2], [0, -1], 1, 'Up the big stairs'),
  'stairs-back': shot([-11, -11], [-1, 0], 1, 'The back stairs'),
  'stairs-cellar': shot([17, -5], [1, 0], 1, 'Down to the cellar'),
  dollhouse: shot([9, 7], [0, -1], 3, 'The whole house, far away'),
  'dollhouse-far': shot([9, 7], [0, -1], 2, 'The house, a bit nearer'),
  levels: shot([0, 3], [0, -1], 3, 'The floors, one above the other'),
  'wall-sink': shot([0, 11.2], [0, -1], 1, 'The wall sinks down'),
  // step 2: the things to do. A shot of a find stands her where it goes off as she
  // waits (the picture page settles each shot for a moment, the house life running).
  clock: shot([-2.3, 4.0], [-0.5, -1], 1, 'The clock strikes'),
  piano: shot([8.4, 10.74], [0, 1], 1, 'On the piano keys', { ledge: 'parlour-keys' }),
  'attic-window': shot([-23.4, -11.0], [-1, 0], 1, 'The view from the attic', { ledge: 'attic-seat' }),
  'bookcase-open': shot([-6.0, 4.6], [0, -1], 1, 'The bookcase is open', { open: true }),
  'secret-stair': shot([-6.0, -2.0], [0, -1], 1, 'Up the secret stair', { open: true }),
  cushion: shot([12.7, 7.0], [1, 0], 1, 'Someone naps here'),
  toys: shot([-18.5, -14.6], [1, 0.15], 0, 'A box of old toys'),
  knock: shot([7.45, -7.6], [0, -1], 0, 'A cup to knock over', { perch: 'kitchen-counter-a' }),
  // the mice as a still cat sees them (the picture page has her sitting still: a mouse
  // notices a still cat at 1.2 m, critters.js PREY_NOTICE_STALKED)
  mice: shot([10.0, -1.5], [1, 0.1], 0, 'Mice by the pantry'),
  'mice-cellar': shot([23.4, -4.6], [0, -1], 0, 'Mice in the cellar'),
  // the golden mice, seen from the tops she leaps to them from (and the cellar floor)
  'gold-library': shot([-12.2, 2.6], [-0.3, 1], 1, 'A golden mouse on the bookcase', { ledge: 'library-books-n1' }),
  'gold-wardrobe': shot([-4.6, -15.4], [-1, 0.15], 1, 'A golden mouse on the wardrobe', { ledge: 'bedroom-shelf' }),
  'gold-cellar': shot([26.0, -2.0], [0.5, 1], 0, 'A golden mouse in the cellar'),
  'climb-plank': shot([-8.6, 2.6], [-1, 0.25], 1, 'Along the plank', { ledge: 'library-books-n2' }),
  hud: shot([0, 6], [0, -1], 1, 'Goals and the map', { hud: true }),
});

// ---- the routes, through doorway centres ----

const SPAWN = freeze({ x: 0, z: 9.5, face: freeze([0, -1]) });
const t = (x, z, caption, near) => freeze({ to: freeze([x, z]), ...(caption ? { caption } : {}), ...(near ? { near } : {}) });
const zoom = (z, hold, caption) => freeze({ zoom: z, hold, caption });
const jump = (caption) => freeze(caption ? { jump: true, caption } : { jump: true });
const wait = (s, caption) => freeze(caption ? { wait: s, caption } : { wait: s });
// In the attic she has come in heading west, so the camera looks west, out
// over the lawn. Before the zoom out she loops round (north, south, then east
// across the rug), and the camera swings behind her, so at Farther it looks
// east over the whole house: the attic, the bedroom below it, the ground floor
// below that (final fix F2).
const TURN_EAST = [t(-20.5, -8), t(-20.5, -12), t(-16, -12.5)];

const GRAND_STEPS = [
  // the library and back
  t(-2, 7, 'The hall'), t(-4, 7), t(-8, 7, 'The library'), t(-4, 7), t(0, 7),
  // the parlour, the kitchen, down to the cellar and back up
  t(4, 7), t(7, 7, 'The parlour'), t(9, 4), t(9, 2), t(9, 0.5, 'The kitchen'),
  t(12, -1.5), t(12, -5), t(14, -5, 'Down the cellar stairs'), t(20, -5), t(24, -5, 'The cellar'),
  t(20, -5), t(14, -5, 'Back up'), t(12, -5), t(12, -1.5), t(9, 0.5), t(9, 2), t(9, 4), t(6, 7),
  // the hall, the big stairs, the bedroom, the back stairs, the attic
  t(4, 7), t(0, 6, 'The hall again'), t(0, 3, 'Up the big stairs'), t(0, -6), t(-1, -8, 'The bedroom'),
  t(-5, -9), t(-8, -11, 'Up the back stairs'), t(-14, -11), t(-18, -10, 'The attic'), ...TURN_EAST,
  // the whole house from far away, where the film ends
  zoom(3, 3, 'The whole house'),
];

// The film: one sweep through every room in well under 45 s at real time. It
// opens at the front door, where the camera hangs outside the south wall; the
// walk's start settles the sink on that first view (houselife.js settle, as
// game/walk.js does in the game), so the wall is already down in the first
// frame and the film opens on her. Then the library and back, up the big
// stairs, the bedroom, up the back stairs, the attic, the whole house from far
// away (looking east over it), and all the way down again to the kitchen and
// the cellar.
const FILM_STEPS = [
  t(0, 7, 'Come in'), t(-4, 7), t(-8, 7, 'The library'), t(-4, 7), t(0, 6, 'The hall'),
  t(0, 3, 'Up the big stairs'), t(0, -6), t(-1, -8, 'The bedroom'),
  t(-5, -9), t(-8, -11, 'Up the back stairs'), t(-14, -11), t(-18, -10, 'The attic'), ...TURN_EAST,
  zoom(3, 3, 'The whole house'), zoom(1, 0),
  t(-14, -11, 'Back down'), t(-8, -11), t(-3, -8), t(0, -6), t(0, 3, 'Down the big stairs'),
  t(4, 7), t(7, 7, 'The parlour'), t(9, 4), t(9, 2), t(9, 0.5, 'The kitchen'),
  t(12, -1.5), t(12, -5), t(14, -5, 'Down the cellar stairs'), t(20, -5), t(23, -5, 'The cellar'),
];

// ---- step 2: the climbs and the things to do ----

// The library route (housemoves.js HOUSE_ROUTES.library): up the steps and onto the
// north bookcase, along the plank, the leap across the corner (the golden mouse), and
// down by the big books. Each jump is pressed where the last hop landed her, or at the
// plank's far end: the obvious jump takes the route's next hop (housemoves.js).
const LIBRARY_CLIMB = [
  t(-8.8, 5.0, 'Up the library shelves'), jump(), jump(),
  t(-13.1, 2.6, 'Along the plank'), jump('Leap across the corner'),
  jump('Down in short steps'), jump(),
];
const CLIMB_STEPS = [...LIBRARY_CLIMB, t(-9.5, 7.5, 'Back on the floor')];

// The film of everything to do. It opens at the clock's foot, where it strikes.
// The parlour: up onto the keys and along them, west end and back (six keys: a tune), down, round the
// armchairs to the hearth cushion and still on it. The library climb, then the
// bookcase: she waits at it, it swings open and she goes up the secret stair into the
// bedroom, up the chest and the shelf, the leap to the wardrobe (the second golden
// mouse) and back, down in steps, up the back stair to the attic, onto the window
// seat and down, the box of old toys, and the zoom out.
const THINGS_STEPS = [
  wait(1.5, 'The clock strikes the hour'),
  t(4, 7, 'Into the parlour'), t(8.7, 9.7), jump('A tune on the piano'),
  t(8.12, 10.74, null, 0.06), t(8.92, 10.74, null, 0.06), jump(),
  t(12.0, 9.6, 'A dent in an old cushion'), t(12.68, 7.3, null, 0.1), wait(2.0),
  t(10.75, 7.68), t(4, 7), t(-4, 7, 'The library'),
  ...LIBRARY_CLIMB,
  t(-6.0, 2.8, 'A bookcase that opens'), wait(1.0), t(-6.0, -1, 'A secret stair!'), t(-6.0, -6.0),
  t(-4.2, -13.0, 'Up to the wardrobe'), jump(), jump(), jump('Leap!'), jump(), jump(), jump(),
  t(-8, -11, 'Up the back stairs'), t(-14, -11), t(-22.3, -11.0, 'The view from the attic'), jump(), wait(0.2), jump(),
  t(-17.6, -14.1, 'A box of old toys'), wait(0.7),
  zoom(2, 1.2, 'The attic from farther out'),
];

export const HOUSE_TOURS = freeze({
  grand: freeze({ start: SPAWN, steps: freeze(GRAND_STEPS) }),
  film: freeze({ start: SPAWN, steps: freeze(FILM_STEPS) }),
  climb: freeze({ start: freeze({ x: -3.6, z: 7, face: freeze([-1, 0]) }), steps: freeze(CLIMB_STEPS) }),
  things: freeze({ start: freeze({ x: -2.3, z: 4.0, face: freeze([-0.5, -1]) }), steps: freeze(THINGS_STEPS) }),
});

// ---- the pilot ----

const ARRIVE_R = 0.35;
const STEP_LIMIT = 25; // a step that takes longer fails
const VIEW_RATE = 2; // 1/s: the camera swings in behind her
const VIEW_MAX = 1.5; // rad/s
const JUMP_SETTLE = 0.3; // s after a hop ends (traversalyard.js's)
const RAIL_TOL = 0.05; // m: a walk's point counts as on a crossing's rail
const EPS = 1e-9;
// No moves: the step 1 walk (and a page without the traversal runtime).
const STILL = Object.freeze({ busy: false, hop: null, crossing: null, looking: false, jump: () => false });

function easeYaw(cur, target, dt) {
  const TWO_PI = Math.PI * 2;
  let d = (target - cur) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  let step = d * (1 - Math.exp(-VIEW_RATE * dt));
  const cap = VIEW_MAX * dt;
  if (step > cap) step = cap;
  else if (step < -cap) step = -cap;
  return cur + step;
}

// True when (x, z) lies on the crossing's rail, seen from above (traversalyard.js's):
// on the plank, a walk to a point of it is done there; any other point only off it.
function onRail(crossing, x, z) {
  for (const s of crossing.segs) {
    if (s.len <= 0) continue;
    const k = Math.min(Math.max((x - s.x0) * s.tx + (z - s.z0) * s.tz, 0), s.len);
    if (Math.hypot(x - (s.x0 + s.tx * k), z - (s.z0 + s.tz * k)) <= RAIL_TOL) return true;
  }
  return false;
}

// Drives the stick and the jump button through a tour, one call per frame BEFORE the
// walk's frame. step(dt, { player, cat, live?, ctx? }) returns the same { done,
// failed, caption } each time: failed is the index of the step that ran past
// STEP_LIMIT (done is then true), else null. `live` is the traversal runtime
// (traversallive.js) and `ctx` its context; without them there are no moves, as in
// step 1. On a crossing the stick is turned by the view's yaw of the frame she got
// on, as the runtime holds it, and the camera is left alone while a move runs.
export function createHousePilot(tour) {
  const steps = tour.steps;
  const result = { done: false, failed: null, caption: null };
  const touch = { x: 0, z: 0, mag: 1 };
  const stick = { x: 0, z: 0 };
  let index = 0;
  let time = 0;
  let began = -1; // the step whose caption and zoom were taken
  let pressed = false; // a jump step's press was taken
  let settle = -1; // a jump step's time since its hop ended; -1 until then
  let holding = false; // the stick is pushed, unbroken since holdYaw was taken
  let frozen = false; // she has been on a crossing during this push: holdYaw stays
  let holdYaw = 0;

  function next() {
    index++;
    time = 0;
    pressed = false;
    settle = -1;
  }
  function release(player) {
    player.setTouchMove(null);
    holding = false;
    frozen = false;
  }

  function walk(s, dt, cat, player, live) {
    const dx = s.to[0] - cat.position.x;
    const dz = s.to[1] - cat.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= (s.near ?? ARRIVE_R) && !live.hop && (!live.crossing || onRail(live.crossing, s.to[0], s.to[1]))) {
      release(player);
      return true;
    }
    // The camera swings in behind the way she faces, as the game's does.
    if (!live.busy) {
      const ry = cat.rotation.y;
      player.setViewYaw(easeYaw(player.viewYaw(), behindYaw(-Math.sin(ry), -Math.cos(ry)), dt));
    }
    if (d < EPS) return false;
    if (live.crossing) frozen = true;
    if (!holding || !frozen) holdYaw = player.viewYaw();
    holding = true;
    stickToWorld(dx / d, dz / d, -holdYaw, stick);
    touch.x = stick.x;
    touch.z = stick.z;
    touch.mag = 1;
    player.setTouchMove(touch);
    return false;
  }

  function press(dt, live, player, ctx) {
    if (!pressed) {
      release(player);
      pressed = live.jump(ctx) === true;
      return false;
    }
    if (settle < 0) {
      if (live.busy || live.looking) return false;
      settle = 0;
    }
    settle += dt;
    return settle >= JUMP_SETTLE - EPS;
  }

  return {
    step(dt, { player, cat, live = STILL, ctx = null }) {
      if (result.done) return result;
      if (index >= steps.length) {
        release(player);
        result.done = true;
        return result;
      }
      time += dt > 0 ? dt : 0;
      if (time > STEP_LIMIT + EPS) {
        release(player);
        result.done = true;
        result.failed = index;
        return result;
      }
      const s = steps[index];
      if (began !== index) {
        began = index;
        if (s.caption) result.caption = s.caption;
        if (s.zoom !== undefined) player.setCameraZoom(s.zoom);
      }
      let over;
      if (s.to) over = walk(s, dt, cat, player, live);
      else if (s.jump) over = press(dt, live, player, ctx);
      else if (s.wait !== undefined) {
        release(player);
        over = time >= s.wait - EPS;
      } else {
        release(player);
        over = time >= s.hold - EPS;
      }
      if (over) next();
      return result;
    },
  };
}
