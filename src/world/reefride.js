// =============================================================================
// THE REEF RIDES: THE PURE RIDE SIM (milestone R11), a copy-and-adapt of moonrover.js. No THREE, no clock, no random number, no scene: a
// mount (the SCOOTER or the SAUCER) is a circle with a heading and a speed in the water, and one function moves it a step from a stick.
// The same input stream always gives the same ride. A live wrapper (R12) draws it and carries the cat; this file is what the tests hammer.
//
// THE STICK: input = { x, z, lift } in the world (x, z the walk's own stick already turned by the camera; lift in [-1, 1], Space up / a down
// key). The mount turns toward the stick at a rate that eases off with speed, and drives at most MAX_SPEED times the push, slower while it is
// pointed away from the wanted way.
//
// NEVER STUCK, NEVER IN A COLLIDER: the circle is pushed out of every collider, every env.keepOut rectangle and the bounds (inset), the part of
// its speed pointing into one is lost, and a step that would still leave it inside one (a pinch) is not taken. env.ground.canStep(ax, az, bx, bz)
// (the walk ground's own four-argument test) refuses a step onto forbidden ground (a raised deck, the Sealab footprint): not taken, the speed lost
// (a slide along one axis is tried first). The heading always turns, so the stick pointed away from a wall always drives away from it; and a cat
// can always hop off (dismountSpot): the way off is never the sim's business.
//
// DEPTH: the mount rides `hold` metres above the seabed (starts at the spec's seatY, never below MIN_CLEAR), RISES and DIVES with `lift` at
// LIFT_SPEED, and is clamped between seabed + MIN_CLEAR and the ceiling (CEILING m, or env.ceil(x, z) metres above the seabed when finite).
// stepRide returns the new y. env = { colliders, keepOut?, bounds?, ground?, groundY?(x, z), ceil?(x, z) }.
// =============================================================================

import { REEF_BOUNDS } from './reefplan.js';

const spec = (o) => Object.freeze({ ...o, seatsAt: Object.freeze(o.seatsAt.map((s) => Object.freeze(s))) });
// seatsAt: where each rider sits relative to the mount's middle, in the mount's frame (x right, y up from the mount's y, z forward).
export const RIDES = Object.freeze({
  scooter: spec({ id: 'scooter', radius: 0.7, maxSpeed: 7, accel: 6, brake: 9, turn: 2.2, seatY: 1.1, seats: 1, seatsAt: [{ x: 0, y: 0.3, z: -0.1 }] }),
  saucer: spec({ id: 'saucer', radius: 1.5, maxSpeed: 3.5, accel: 2.5, brake: 5, turn: 1.2, seatY: 1.6, seats: 2, seatsAt: [{ x: -0.5, y: 0.45, z: 0 }, { x: 0.5, y: 0.45, z: 0 }] }),
});
export const MAX_SEATS = 2;
export const SEAT_OFFSET = Object.freeze({ scooter: RIDES.scooter.seatsAt[0], saucer: RIDES.saucer.seatsAt[0] }); // the first (driver's) seat
export const RIDE_KINDS = Object.freeze(Object.keys(RIDES));

export const RIDE = Object.freeze({
  inset: 1.0, // m between the mount's middle and the bounds
  alignMin: 0.25, // the share of speed left when the stick points away from the heading
  turnFast: 0.4, // the share of the turn rate lost at full speed
  minClear: 0.5, // m above the seabed, never less
  ceiling: 7, // m, the highest it climbs
  liftSpeed: 1.5, // m/s up or down
  sub: 1 / 30, // s: the largest step the sim takes at once
  catPad: 0.5, // the cat's own margin when she hops off
});

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const flatY = () => 0;

export function createRide(kindId, x, z, heading = 0, seabedY = 0) {
  const k = RIDES[kindId] ?? RIDES.scooter;
  return { kind: k.id, x, z, yaw: heading, speed: 0, touch: false, hold: k.seatY, y: seabedY + k.seatY };
}

// Is a point of this radius clear of every collider and keepOut rectangle, and inside the bounds?
export function isFree(x, z, env = {}, radius = RIDES.scooter.radius, inset = RIDE.inset) {
  const b = env.bounds ?? REEF_BOUNDS;
  if (x < b.minX + inset - 1e-6 || x > b.maxX - inset + 1e-6 || z < b.minZ + inset - 1e-6 || z > b.maxZ - inset + 1e-6) return false;
  const cs = env.colliders ?? [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const need = c.r + radius - 1e-3;
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < need * need) return false;
  }
  const ks = env.keepOut ?? [];
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    const r = radius - 1e-3;
    const dx = x - clamp(x, k.minX, k.maxX);
    const dz = z - clamp(z, k.minZ, k.maxZ);
    if (dx * dx + dz * dz < r * r || (x > k.minX && x < k.maxX && z > k.minZ && z < k.maxZ)) return false;
  }
  return true;
}

// Push p out of the colliders, keepOut rectangles and into the bounds, three passes. Returns { moved, nx, nz } (the last push direction).
const push = { moved: false, nx: 0, nz: 0 };
function pushOut(p, env, radius, inset) {
  const cs = env.colliders ?? [];
  const ks = env.keepOut ?? [];
  const b = env.bounds ?? REEF_BOUNDS;
  push.moved = false;
  push.nx = 0;
  push.nz = 0;
  const done = (ux, uz) => { push.moved = true; push.nx = ux; push.nz = uz; };
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
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
      done(ux, uz);
    }
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const qx = clamp(p.x, k.minX, k.maxX);
      const qz = clamp(p.z, k.minZ, k.maxZ);
      const dx = p.x - qx;
      const dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius && d2 > 0) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        p.x = qx + (dx / d) * radius;
        p.z = qz + (dz / d) * radius;
        done(dx / d, dz / d);
      } else {
        // the middle is inside the rectangle: out through the nearest edge
        const l = p.x - k.minX, r = k.maxX - p.x, t = p.z - k.minZ, u = k.maxZ - p.z;
        const m = Math.min(l, r, t, u);
        if (m === l) { p.x = k.minX - radius; done(-1, 0); }
        else if (m === r) { p.x = k.maxX + radius; done(1, 0); }
        else if (m === t) { p.z = k.minZ - radius; done(0, -1); }
        else { p.z = k.maxZ + radius; done(0, 1); }
      }
    }
    const x0 = p.x;
    const z0 = p.z;
    p.x = clamp(p.x, b.minX + inset, b.maxX - inset);
    p.z = clamp(p.z, b.minZ + inset, b.maxZ - inset);
    if (p.x !== x0 || p.z !== z0) done(p.x > x0 ? 1 : p.x < x0 ? -1 : 0, p.z > z0 ? 1 : p.z < z0 ? -1 : 0);
  }
  return push;
}

function sub(s, k, input, h, env) {
  const bounds = env.bounds ?? REEF_BOUNDS;
  const e = env.bounds ? env : { ...env, bounds };
  // inside something already (a bad start, a collider that appeared round a parked mount): put it out first
  if (!isFree(s.x, s.z, e, k.radius)) {
    const q = { x: s.x, z: s.z };
    pushOut(q, e, k.radius, RIDE.inset);
    for (let r = 0.5; r <= 40 && !isFree(q.x, q.z, e, k.radius); r += 0.5) {
      for (let i = 0; i < 24; i++) {
        const x = s.x + Math.cos((i / 24) * TAU) * r;
        const z = s.z + Math.sin((i / 24) * TAU) * r;
        if (isFree(x, z, e, k.radius)) { q.x = x; q.z = z; break; }
      }
    }
    s.x = q.x;
    s.z = q.z;
  }
  const mag = Math.min(1, Math.hypot(input.x || 0, input.z || 0));
  const pushed = mag > 0.05;
  let err = 0;
  if (pushed) {
    const want = Math.atan2(input.x, input.z);
    const maxTurn = k.turn * (1 - RIDE.turnFast * clamp(s.speed / k.maxSpeed, 0, 1)) * h; // slower round at speed
    s.yaw = wrap(s.yaw + clamp(wrap(want - s.yaw), -maxTurn, maxTurn));
    err = Math.abs(wrap(want - s.yaw));
  }
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const align = pushed ? clamp(1 - err / 1.3, RIDE.alignMin, 1) : 1;
  const target = pushed ? k.maxSpeed * mag * align : 0;
  if (s.speed < target) s.speed = Math.min(target, s.speed + k.accel * h);
  else s.speed = Math.max(target, s.speed - k.brake * h);
  const px = s.x;
  const pz = s.z;
  const p = { x: px + fx * s.speed * h, z: pz + fz * s.speed * h };
  const n = pushOut(p, e, k.radius, RIDE.inset);
  s.touch = n.moved;
  if (n.moved) s.speed *= 1 - 0.9 * Math.max(0, -(fx * n.nx + fz * n.nz));
  // forbidden ground (a raised deck, the Sealab footprint): the step is not taken (a slide along one axis first), the speed lost
  const cs = env.ground && env.ground.canStep;
  if (cs && !env.ground.canStep(px, pz, p.x, p.z)) {
    if (env.ground.canStep(px, pz, p.x, pz)) p.z = pz;
    else if (env.ground.canStep(px, pz, px, p.z)) p.x = px;
    else { p.x = px; p.z = pz; }
    s.speed *= 0.3;
    s.touch = true;
  }
  // a pinch (pushed out of one into another): the step is not taken
  if (!isFree(p.x, p.z, e, k.radius)) { p.x = px; p.z = pz; s.speed = 0; }
  s.x = p.x;
  s.z = p.z;
  // depth: rise and dive with lift, held above the seabed, between seabed + minClear and the ceiling
  const gy = env.groundY ? env.groundY(s.x, s.z) : 0;
  const rawCeil = env.ceil ? env.ceil(s.x, s.z) : Infinity;
  const top = Math.max(gy + RIDE.minClear, Math.min(RIDE.ceiling, Number.isFinite(rawCeil) ? gy + rawCeil : Infinity));
  const lift = clamp(input.lift || 0, -1, 1);
  s.hold = clamp(s.hold + lift * RIDE.liftSpeed * h, RIDE.minClear, Math.max(RIDE.minClear, top - gy));
  const want = clamp(gy + s.hold, gy + RIDE.minClear, top);
  s.y = clamp(s.y + clamp(want - s.y, -RIDE.liftSpeed * h * 2, RIDE.liftSpeed * h * 2), gy + RIDE.minClear, top); // smooth, never through the seabed
}

// stepRide(ride, input, dt, env): moves the ride in place, deterministic for a given stream. Returns the new y.
export function stepRide(s, input, dt, env = {}) {
  if (!(dt > 0)) return s.y;
  const k = RIDES[s.kind] ?? RIDES.scooter;
  const n = Math.max(1, Math.ceil(dt / RIDE.sub - 1e-9));
  const h = dt / n;
  const stick = input ?? { x: 0, z: 0, lift: 0 };
  for (let i = 0; i < n; i++) sub(s, k, stick, h, env);
  return s.y;
}

// Where the cat hops off: free ground beside the mount (her stick's way first, else the mount's right), clear of every collider and keepOut by the
// cat's margin, inside the bounds, outside the mount's circle, on ground the walk can step to when there is any. Always answers; ONE reused object.
const spot = { x: 0, z: 0, ok: false };
export function dismountSpot(s, env = {}, toward = null) {
  const k = RIDES[s.kind] ?? RIDES.scooter;
  const e = env.bounds ? env : { ...env, bounds: REEF_BOUNDS };
  const base = toward && Math.hypot(toward.x, toward.z) > 0.2 ? Math.atan2(toward.x, toward.z) : s.yaw + Math.PI / 2;
  const cs = env.ground && env.ground.canStep;
  for (let pass = cs ? 0 : 1; pass < 2; pass++) {
    for (let r = k.radius + 0.9; r <= 24; r += 0.45) {
      for (let i = 0; i < 24; i++) {
        const a = base + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12));
        const x = s.x + Math.sin(a) * r;
        const z = s.z + Math.cos(a) * r;
        if (!isFree(x, z, e, RIDE.catPad, 0.3)) continue;
        if (pass === 0 && !env.ground.canStep(s.x, s.z, x, z)) continue;
        spot.x = x; spot.z = z; spot.ok = true;
        return spot;
      }
    }
  }
  spot.x = s.x;
  spot.z = s.z;
  pushOut(spot, e, RIDE.catPad, 0.3);
  spot.ok = false;
  return spot;
}
