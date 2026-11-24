// =============================================================================
// DOT THE ROVER: THE PURE DRIVING SIM (milestone 3). No THREE, no clock, no random number, no scene: a rover is a circle (1.3 m) on the
// Moon's ground with a heading and a speed, and one function moves it a step from a stick. The same input stream always gives the same
// drive. world/moonroverlive.js draws it and carries the cat; this file is what the tests hammer.
//
// THE STICK: `input` is { x, z } in the world (the walk's own stick, already turned by the camera: player.inputDirection()); its length is
// how hard it is pushed (0 to 1), its direction the heading wanted. The rover turns toward it at TURN rad/s (a spot turn is a second or
// so, never faster) and drives at most MAX_SPEED times the push, slower while it is pointed away from the wanted way (it eases round a
// turn rather than skidding) and slower up a steep slope (never stopped by one, never tipped: SLOPE_MIN of the speed is always left).
//
// NEVER STUCK, NEVER IN A COLLIDER, NEVER OUT OF THE BOUNDS: the circle is pushed out of every collider and the bounds (inset by INSET),
// the part of its speed that pointed into a wall is lost, and a step that would still leave it inside one (a pinch between two) is not
// taken at all. The heading always turns, so the stick pointed away from a wall always drives away from it; and a cat can always hop out
// (dismountSpot): the way off is never the sim's business.
//
// THE ROVER TOUR (ROVER_FREE = false) is the safe fallback of spec 6.1: Dot drives the loop of lights by herself, a pure function of the
// distance along the track; the cat rides and honks. tourPoint(s) is that function.
// =============================================================================

import { MOON_BOUNDS, TRACK } from './moonplan.js';

// The switch: free steering (true) or the on-rails Rover Tour (false). One constant, as the plan's risk list says.
export const ROVER_FREE = true;

export const ROVER = Object.freeze({
  radius: 1.3, // m: the circle that meets colliders
  inset: 1.0, // m kept between the rover's middle and the bounds
  maxSpeed: 7, accel: 5, brake: 8, // m/s, m/s2
  turn: 2.2, // rad/s
  slopeFrom: 0.28, slopeTo: 0.58, slopeMin: 0.3, // the grade (rise per metre along the heading) where she slows, where she is slowest, and the share of speed kept
  alignMin: 0.25, // the share of speed left when the stick points away from the heading
  sub: 1 / 30, // s: the largest step the sim takes at once (a long frame is several)
  tourSpeed: 6, tourCorner: 4.5, // m/s, m: the Rover Tour's pace and how round it takes the track's corners
});

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth01 = (t) => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };
const SCRATCH = { x: 0, z: 0 };

export function createRover(x, z, yaw = 0) {
  return { x, z, yaw, speed: 0, grade: 0, touch: false };
}

// Is a point of the rover's radius (or `pad` more than a cat's) clear of every collider and inside the bounds?
export function isFree(x, z, colliders, bounds = MOON_BOUNDS, radius = ROVER.radius, inset = ROVER.inset) {
  if (x < bounds.minX + inset - 1e-6 || x > bounds.maxX - inset + 1e-6 || z < bounds.minZ + inset - 1e-6 || z > bounds.maxZ - inset + 1e-6) return false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const need = c.r + radius - 1e-3;
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < need * need) return false;
  }
  return true;
}

// Push (x, z) out of the colliders and into the bounds, three passes (a corner between two settles). Returns the contact normal of the
// last collider that moved it in SCRATCH-free form: { moved, nx, nz } where (nx, nz) is the (unit) direction it was pushed.
const push = { moved: false, nx: 0, nz: 0 };
function pushOut(p, colliders, bounds, radius, inset) {
  push.moved = false;
  push.nx = 0;
  push.nz = 0;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const need = c.r + radius;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= need * need) continue;
      const d = Math.sqrt(d2);
      const ux = d > 1e-9 ? dx / d : 1;
      const uz = d > 1e-9 ? dz / d : 0;
      p.x = c.x + ux * need;
      p.z = c.z + uz * need;
      push.moved = true;
      push.nx = ux;
      push.nz = uz;
    }
    const x0 = p.x;
    const z0 = p.z;
    p.x = clamp(p.x, bounds.minX + inset, bounds.maxX - inset);
    p.z = clamp(p.z, bounds.minZ + inset, bounds.maxZ - inset);
    if (p.x !== x0 || p.z !== z0) {
      push.moved = true;
      push.nx = p.x > x0 ? 1 : p.x < x0 ? -1 : 0;
      push.nz = p.z > z0 ? 1 : p.z < z0 ? -1 : 0;
    }
  }
  return push;
}

// One small step. `env` = { colliders, bounds?, ground? } (ground: the walk's ground, for the slope; none is flat).
function sub(s, input, h, env) {
  const colliders = env.colliders ?? [];
  const bounds = env.bounds ?? MOON_BOUNDS;
  // inside something already (a collider that appeared round a parked rover, a bad start): put it out first, so it can never be held there
  if (!isFree(s.x, s.z, colliders, bounds)) {
    const q = { x: s.x, z: s.z };
    pushOut(q, colliders, bounds, ROVER.radius, ROVER.inset);
    // a pinch (the tunnel's narrow mouth): no push frees it, so the nearest free ground it can find, ring by ring
    for (let r = 0.5; r <= 40 && !isFree(q.x, q.z, colliders, bounds); r += 0.5) {
      for (let k = 0; k < 24; k++) {
        const x = s.x + Math.cos((k / 24) * TAU) * r;
        const z = s.z + Math.sin((k / 24) * TAU) * r;
        if (isFree(x, z, colliders, bounds)) { q.x = x; q.z = z; break; }
      }
    }
    s.x = q.x;
    s.z = q.z;
  }
  const mag = Math.min(1, Math.hypot(input.x, input.z));
  const pushed = mag > 0.05;
  let err = 0;
  if (pushed) {
    const want = Math.atan2(input.x, input.z);
    const d = wrap(want - s.yaw);
    const maxTurn = ROVER.turn * h;
    s.yaw = wrap(s.yaw + clamp(d, -maxTurn, maxTurn));
    err = Math.abs(wrap(want - s.yaw));
  }
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  // the slope along the heading: a steep climb slows her, never stops her
  let slow = 1;
  s.grade = 0;
  if (env.ground && !env.ground.flat && env.ground.gradient) {
    env.ground.gradient(s.x, s.z, SCRATCH);
    s.grade = SCRATCH.x * fx + SCRATCH.z * fz;
    slow = 1 - (1 - ROVER.slopeMin) * smooth01((s.grade - ROVER.slopeFrom) / (ROVER.slopeTo - ROVER.slopeFrom));
  }
  const align = pushed ? clamp(1 - err / 1.3, ROVER.alignMin, 1) : 1;
  const target = pushed ? ROVER.maxSpeed * mag * align * slow : 0;
  if (s.speed < target) s.speed = Math.min(target, s.speed + ROVER.accel * h);
  else s.speed = Math.max(target, s.speed - ROVER.brake * h);
  const px = s.x;
  const pz = s.z;
  const p = { x: px + fx * s.speed * h, z: pz + fz * s.speed * h };
  const n = pushOut(p, colliders, bounds, ROVER.radius, ROVER.inset);
  s.touch = n.moved;
  if (n.moved) {
    // the part of the speed that pointed into what she hit is lost; a glancing blow keeps most of it
    const into = Math.max(0, -(fx * n.nx + fz * n.nz));
    s.speed *= 1 - 0.9 * into;
  }
  // a pinch (pushed out of one into another): the step is not taken
  if (!isFree(p.x, p.z, colliders, bounds)) { p.x = px; p.z = pz; s.speed = 0; }
  s.x = p.x;
  s.z = p.z;
}

// stepRover(state, input, dt, env): moves the state in place; deterministic for a given stream. Returns the state.
export function stepRover(s, input, dt, env = {}) {
  if (!(dt > 0)) return s;
  const n = Math.max(1, Math.ceil(dt / ROVER.sub - 1e-9));
  const h = dt / n;
  const stick = input ?? { x: 0, z: 0 };
  for (let i = 0; i < n; i++) sub(s, stick, h, env);
  return s;
}

// Where she gets out: the free ground beside the rover (her side first, then the other, then further round), clear of every collider by
// the cat's own margin and inside the bounds, never inside the rover's circle. Always answers: failing everything, the rover's own spot
// pushed out of what it touches. ONE reused object (the Fairground's rule).
const spot = { x: 0, z: 0, ok: false };
const CAT_PAD = 0.5;
export function dismountSpot(s, env = {}, toward = null) {
  const colliders = env.colliders ?? [];
  const bounds = env.bounds ?? MOON_BOUNDS;
  const base = toward && Math.hypot(toward.x, toward.z) > 0.2 ? Math.atan2(toward.x, toward.z) : s.yaw + Math.PI / 2; // her stick's way, else the rover's right
  for (let r = ROVER.radius + 0.9; r <= 12; r += 0.45) {
    for (let k = 0; k < 24; k++) {
      // 0, +15, -15, +30 ... so the nearest to the preferred way wins
      const a = base + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12));
      const x = s.x + Math.sin(a) * r;
      const z = s.z + Math.cos(a) * r;
      if (isFree(x, z, colliders, bounds, CAT_PAD, 0.3)) { spot.x = x; spot.z = z; spot.ok = true; return spot; }
    }
  }
  spot.x = s.x;
  spot.z = s.z;
  pushOut(spot, colliders, bounds, CAT_PAD, 0.3);
  spot.ok = false;
  return spot;
}

// ---- the Rover Tour --------------------------------------------------------------------------------------------------

// The track's loop with its corners cut: each waypoint's corner is replaced by a quadratic curve that starts and ends `corner` metres
// short of it (never more than half a leg), sampled about every metre. Built once, a pure function of the plan.
let loop = null;
export function tourLoop() {
  if (loop) return loop;
  const pts = [];
  const n = TRACK.length;
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  for (let i = 0; i < n; i++) {
    const a = TRACK[(i + n - 1) % n];
    const b = TRACK[i];
    const c = TRACK[(i + 1) % n];
    const la = Math.hypot(b.x - a.x, b.z - a.z);
    const lc = Math.hypot(c.x - b.x, c.z - b.z);
    const k1 = Math.min(ROVER.tourCorner, la / 2);
    const k2 = Math.min(ROVER.tourCorner, lc / 2);
    const p0 = lerp(b, a, k1 / la);
    const p2 = lerp(b, c, k2 / lc);
    const steps = 8;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const u = 1 - t;
      pts.push({ x: u * u * p0.x + 2 * u * t * b.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * b.z + t * t * p2.z });
    }
  }
  const acc = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    acc.push(acc[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  loop = { pts, acc, length: acc[acc.length - 1] };
  return loop;
}
export const tourLength = () => tourLoop().length;

// tourPoint(s) -> { x, z, yaw } at distance s along the loop (s wraps). Pure.
export function tourPoint(s, out = { x: 0, z: 0, yaw: 0 }) {
  const L = tourLoop();
  const d = ((s % L.length) + L.length) % L.length;
  let lo = 0;
  let hi = L.pts.length;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L.acc[mid] <= d) lo = mid; else hi = mid; }
  const a = L.pts[lo];
  const b = L.pts[(lo + 1) % L.pts.length];
  const seg = L.acc[lo + 1] - L.acc[lo];
  const t = seg > 1e-9 ? (d - L.acc[lo]) / seg : 0;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  return out;
}

// The loop's distance nearest to (x, z): where the Tour picks up from when she hops in somewhere off the track (the nearest point).
export function tourNearest(x, z) {
  const L = tourLoop();
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < L.pts.length; i++) {
    const d = Math.hypot(L.pts[i].x - x, L.pts[i].z - z);
    if (d < bd) { bd = d; best = L.acc[i]; }
  }
  return best;
}

// The track's lit posts: a point every `every` metres along the (plain, un-cut) polyline, closed. Pure.
export function trackPosts(every = 6) {
  const out = [];
  let next = 0;
  let at = 0;
  for (let i = 0; i < TRACK.length; i++) {
    const a = TRACK[i];
    const b = TRACK[(i + 1) % TRACK.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (; next < at + len - 1e-9; next += every) {
      const t = (next - at) / len;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
    at += len;
  }
  return out;
}
