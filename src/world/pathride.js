// =============================================================================
// PATH RIDES: THE PURE PATH SIM (milestone P1), a sibling of reefride.js. No THREE, no clock, no random number, no scene, no imports. A mount (the
// BOAT, the CART or the SLED) rides a polyline; the same input stream always gives the same ride. The live wrappers (C1, C4, M2) draw it and carry the cat.
//
// A path is an array of {x, z}. Ride state: { s, v, lat, dir, x, z, heading, stop, dwell, lastStop } (s = metres along the path, v = speed >= 0, lat = metres
// sideways, dir = +1 or -1, x/z/heading = where that puts the mount, filled by createPathRide and every step). A step returns a NEW state.
//
// THE STICK: input = { fwd, side } in [-1, 1] (fwd: forward/back, side: right/left). The mount paces itself: it eases toward the middle of
// spec.vMin..spec.vMax and the stick's forward/back only nudges the speed, always clamped inside the two. side steers lat within +/- spec.laneHalf
// (0 means the mount rides the line and lat is always 0); with no side input lat eases back to the line.
//
// ENDS: spec.loop wraps s round a CLOSED path (the last point joins the first). spec.bumpers makes an open path whose ends bounce: the ride reverses
// direction there and rolls back, never leaving [0, length]. Stops: spec.stops = [{ name, s, dwell }] (distance along the path; dwell in seconds, 0 = a
// pass-through that only reports its name for one step). The mount halts on the stop for dwell seconds, then pulls away.
//
// HEADING: h = atan2(dx, dz) of the travelling direction (forward = (sin h, cos h)); lat is positive to the mount's RIGHT, (-cos h, sin h) in world.
// A cat can always hop off: hopOffSpot picks the nearest of the precomputed free spots.
// =============================================================================

export const SPECS = Object.freeze({
  boat: Object.freeze({ id: 'boat', vMin: 0.6, vMax: 2.0, laneHalf: 0, loop: true, bumpers: false, accel: 0.8, ease: 0.3, latSpeed: 0, stops: Object.freeze([]) }),
  cart: Object.freeze({ id: 'cart', vMin: 1.0, vMax: 3.0, laneHalf: 0, loop: false, bumpers: true, accel: 1.2, ease: 0.4, latSpeed: 0, stops: Object.freeze([]) }),
  sled: Object.freeze({ id: 'sled', vMin: 3, vMax: 8, laneHalf: 1.5, loop: true, bumpers: false, accel: 3, ease: 0.8, latSpeed: 3, stops: Object.freeze([]) }),
});
export const PATH_RIDE = Object.freeze({ sub: 1 / 30 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

// The closed flag is the spec's loop. Segment i runs from path[i] to path[(i + 1) % n] (the last only when closed).
const segCount = (path, closed) => (path.length < 2 ? 0 : closed ? path.length : path.length - 1);
export function pathLength(path, closed = false) {
  let L = 0;
  const m = segCount(path, closed);
  for (let i = 0; i < m; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    L += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return L;
}

// Where is distance s (and lat sideways) on the path? A closed path wraps s; an open one clamps it.
export function posAt(path, s, lat = 0, closed = false) {
  const m = segCount(path, closed);
  if (m === 0) return { x: path[0] ? path[0].x : 0, z: path[0] ? path[0].z : 0, heading: 0 };
  const L = pathLength(path, closed);
  let d = closed && L > 0 ? ((s % L) + L) % L : clamp(num(s), 0, L);
  let h = 0;
  for (let i = 0; i < m; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > 0) h = Math.atan2(b.x - a.x, b.z - a.z);
    if (d <= len || i === m - 1) {
      const t = len > 0 ? clamp(d / len, 0, 1) : 0;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      return { x: x + -Math.cos(h) * lat, z: z + Math.sin(h) * lat, heading: h };
    }
    d -= len;
  }
  return { x: path[0].x, z: path[0].z, heading: h };
}

const place = (path, r, spec) => {
  const p = posAt(path, r.s, r.lat, !!spec.loop);
  // facing the way it travels: a reversed cart looks back along the line
  const heading = r.dir < 0 ? p.heading + Math.PI : p.heading;
  return { ...r, x: p.x, z: p.z, heading };
};

export function createPathRide(path, spec = SPECS.boat, s = 0) {
  const closed = !!spec.loop;
  const L = pathLength(path, closed);
  const s0 = closed && L > 0 ? ((s % L) + L) % L : clamp(num(s), 0, L);
  return place(path, { s: s0, v: spec.vMin, lat: 0, dir: 1, x: 0, z: 0, heading: 0, stop: null, dwell: 0, lastStop: null }, spec);
}

// Did a move from distance a to b (a < b or a > b) cross or reach the stop at distance q, ignoring where it starts?
const crosses = (a, b, q) => (a <= b ? q > a && q <= b : q < a && q >= b);

function subStep(r, input, dt, spec, path, L) {
  const closed = !!spec.loop;
  const fwd = clamp(num(input && input.fwd), -1, 1);
  const side = clamp(num(input && input.side), -1, 1);
  let { s, v, lat, dir, stop, dwell, lastStop } = r;
  stop = null;

  // sideways: the lane only
  if (spec.laneHalf > 0) {
    const target = side * spec.laneHalf;
    const rate = (spec.latSpeed || 2) * dt;
    lat = lat + clamp(target - lat, -rate, rate);
    lat = clamp(lat, -spec.laneHalf, spec.laneHalf);
  } else lat = 0;

  // dwelling at a stop: no travel, lat still steers
  if (dwell > 0) {
    dwell = Math.max(0, dwell - dt);
    return { ...r, lat, v: 0, dwell, stop: r.stop };
  }

  // speed: eases toward the middle, the stick nudges
  const mid = (spec.vMin + spec.vMax) / 2;
  v += clamp(mid - v, -spec.ease * dt, spec.ease * dt);
  v += fwd * spec.accel * dt;
  v = clamp(v, spec.vMin, spec.vMax);

  let ns = s + dir * v * dt;
  if (L <= 0) return { ...r, s: 0, v, lat, stop: null };

  // stops, in the order they lie along this move
  const stops = spec.stops || [];
  let hit = -1;
  let best = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const q = closed ? ((stops[i].s % L) + L) % L : clamp(stops[i].s, 0, L);
    let c = false;
    let dist = 0;
    if (closed) {
      // measure ahead in the travelling direction, round the ring
      const ahead = dir > 0 ? (((q - s) % L) + L) % L : (((s - q) % L) + L) % L;
      c = ahead > 0 && ahead <= v * dt && lastStop !== i;
      dist = ahead;
    } else {
      c = crosses(s, ns, q) && lastStop !== i;
      dist = Math.abs(q - s);
    }
    if (c && dist < best) { best = dist; hit = i; }
  }
  if (lastStop !== null && stops[lastStop]) {
    // re-arm once the mount has left the stop behind
    const q = closed ? ((stops[lastStop].s % L) + L) % L : clamp(stops[lastStop].s, 0, L);
    const away = closed ? Math.min(Math.abs(s - q), L - Math.abs(s - q)) : Math.abs(s - q);
    if (away > 0.5 + v * dt) lastStop = null;
  }
  if (hit >= 0) {
    const q = closed ? ((stops[hit].s % L) + L) % L : clamp(stops[hit].s, 0, L);
    return { s: q, v: 0, lat, dir, stop: stops[hit].name ?? null, dwell: Math.max(0, num(stops[hit].dwell)), lastStop: hit, x: r.x, z: r.z, heading: r.heading };
  }

  if (closed) ns = ((ns % L) + L) % L;
  else if (ns > L) { ns = L; if (spec.bumpers) dir = -1; else v = 0; }
  else if (ns < 0) { ns = 0; if (spec.bumpers) dir = 1; else v = 0; }
  return { s: ns, v, lat, dir, stop, dwell, lastStop, x: r.x, z: r.z, heading: r.heading };
}

export function stepPath(r, input, dt, spec = SPECS.boat, path = []) {
  const L = pathLength(path, !!spec.loop);
  const total = Math.max(0, num(dt));
  const n = Math.max(1, Math.ceil(total / PATH_RIDE.sub - 1e-9));
  const h = total / n;
  let cur = r;
  if (total > 0) for (let i = 0; i < n; i++) cur = subStep(cur, input, h, spec, path, L);
  return place(path, cur, spec);
}

// Named stops: a spec with these stops (the SPECS themselves stay frozen and stop-free).
export const withStops = (spec, stops) => Object.freeze({ ...spec, stops: Object.freeze(stops.map((s) => Object.freeze({ name: s.name, s: s.s, dwell: s.dwell ?? 0 }))) });

// The nearest of the precomputed free spots ({x, z, ...}) to the mount; with none, the mount's own place so the cat is never left without one.
export function hopOffSpot(r, spots) {
  let best = null;
  let bd = Infinity;
  for (let i = 0; spots && i < spots.length; i++) {
    const d = (spots[i].x - r.x) ** 2 + (spots[i].z - r.z) ** 2;
    if (d < bd) { bd = d; best = spots[i]; }
  }
  return best ?? { x: r.x, z: r.z };
}
