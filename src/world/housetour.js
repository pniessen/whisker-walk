// =============================================================================
// The Old House: the shots and the tours for the film (Old House step 1, Task 7).
// Pure data and one small autopilot: no THREE, no randomness, no clock. It is
// imported only by tests and the picture page (verify-house.html), which
// photograph HOUSE_SHOTS and film HOUSE_TOURS for the owner.
//
//   HOUSE_SHOTS  { name: { at: [x, z], face: [fx, fz], zoom, caption } }: she
//                stands at `at`, heading `face`, the camera behind her at zoom
//                step `zoom` (src/camzoom.js: 0 Close, 1 Middle, 2 Far, 3 Farther).
//   HOUSE_TOURS  { name: { start: { x, z, face }, steps } }. A step is
//                { to: [x, z], caption? } (walk there with the stick) or
//                { zoom, hold, caption? } (take that zoom step, then wait
//                `hold` seconds). Walked by createHousePilot, the real player
//                with the stick alone.
//   grand        every room, up and down every stair, and it ends zoomed out
//                on the whole house (the owner's film).
//   film         the shorter one, to fit the 30 to 45 s film at real time.
//
// Captions are short plain words for a child; no series words.
// =============================================================================

import { stickToWorld, behindYaw } from '../traversal.js';

const freeze = Object.freeze;
const shot = (at, face, zoom, caption) => freeze({ at: freeze(at), face: freeze(face), zoom, caption });

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
});

// ---- the routes, through doorway centres ----

const SPAWN = freeze({ x: 0, z: 9.5, face: freeze([0, -1]) });
const t = (x, z, caption) => (caption ? freeze({ to: freeze([x, z]), caption }) : freeze({ to: freeze([x, z]) }));
const zoom = (z, hold, caption) => freeze({ zoom: z, hold, caption });
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

export const HOUSE_TOURS = freeze({
  grand: freeze({ start: SPAWN, steps: freeze(GRAND_STEPS) }),
  film: freeze({ start: SPAWN, steps: freeze(FILM_STEPS) }),
});

// ---- the pilot ----

const ARRIVE_R = 0.35;
const STEP_LIMIT = 25; // a step that takes longer fails
const VIEW_RATE = 2; // 1/s: the camera swings in behind her
const VIEW_MAX = 1.5; // rad/s
const EPS = 1e-9;

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

// Drives the stick through a tour, one call per frame BEFORE the walk's frame.
// step(dt, { player, cat }) returns the same { done, failed, caption } each
// time: failed is the index of the step that ran past STEP_LIMIT (done is then
// true), else null.
export function createHousePilot(tour) {
  const steps = tour.steps;
  const result = { done: false, failed: null, caption: null };
  const touch = { x: 0, z: 0, mag: 1 };
  const stick = { x: 0, z: 0 };
  let index = 0;
  let time = 0;
  let began = -1; // the step whose caption and zoom were taken

  function next() {
    index++;
    time = 0;
  }
  function release(player) {
    player.setTouchMove(null);
  }

  return {
    step(dt, { player, cat }) {
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
      if (s.to) {
        const dx = s.to[0] - cat.position.x;
        const dz = s.to[1] - cat.position.z;
        const d = Math.hypot(dx, dz);
        if (d <= ARRIVE_R) {
          release(player);
          next();
          return result;
        }
        // The camera swings in behind the way she faces, as the game's does.
        const ry = cat.rotation.y;
        player.setViewYaw(easeYaw(player.viewYaw(), behindYaw(-Math.sin(ry), -Math.cos(ry)), dt));
        stickToWorld(dx / d, dz / d, -player.viewYaw(), stick);
        touch.x = stick.x;
        touch.z = stick.z;
        touch.mag = 1;
        player.setTouchMove(touch);
      } else {
        release(player);
        if (time >= s.hold - EPS) next();
      }
      return result;
    },
  };
}
