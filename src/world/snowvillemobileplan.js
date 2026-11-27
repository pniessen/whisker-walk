// =============================================================================
// SNOWVILLE: THE SNOWMOBILE (round four): THE PLAN. Pure data and pure functions (no THREE, no clock, no random number). A chunky red snowmobile waits beside a little open lean-to garage on the
// village's south-east lawn. Stand by it: "Hop on". She sits on the front seat and rides a CLOSED loop of packed lanes round the lawn by world/pathride.js (the sled's spec on a ring, 3.0 to 6.5 m/s, 1.8 m
// either side of the line), two laps, and stops back at the garage with a cheer. The stick only nudges the speed and weaves her inside the lane; there is no way off it and no way to be stuck: the ride
// always ends (even the slowest speed finishes it in under forty seconds) and the action button again, anywhere on it, is "Hop off" onto the nearest free spot (a test floods each). A second cat who
// presses the action button at the machine takes the back seat (seat 1). Nothing is saved but the find (the Snowmobile Helmet) and three paws a walk.
// North is -z. The loop is clear of every cottage, fir and drawn thing, the skis and the sled run (tests check each). Numbers marked "start" are tuned from pictures.
// =============================================================================
import { SPECS, pathLength, posAt } from './pathride.js';
import { snowY, SNOWVILLE_BOUNDS, snowvilleColliders } from './snowvilleplan.js';
import { wingColliders } from './snowvillewingplan.js';
import { detailColliders, MOBILE_KEEP } from './snowvilledetailplan.js';
import { skiColliders } from './snowvilleskisplan.js';

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

/** A CLOSED corner list smoothed `rounds` times (Chaikin), as [x, z] pairs; the last joins the first. */
export function chaikinClosed(pts, rounds) {
  let p = pts;
  for (let k = 0; k < rounds; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i]; const b = p[(i + 1) % p.length];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    p = q;
  }
  return p;
}
export const MOBILE_PATH = f(chaikinClosed(MOBILE_KEEP, 3).map(([x, z]) => f({ x: r2(x), z: r2(z) })));
export const MOBILE_LEN = r2(pathLength(MOBILE_PATH, true));
export const LAPS = 2;
// the walk's sled spec on a ring: a touch gentler and wider than the sled's
export const MOBILE_SPEC = f({ ...SPECS.sled, id: 'snowmobile', loop: true, bumpers: false, vMin: 3.0, vMax: 6.5, accel: 2.2, ease: 0.6, laneHalf: 1.8, latSpeed: 2.4, stops: f([]) });
export const RIDE_LEN = r2(MOBILE_LEN * LAPS); // the metres of one whole ride
export const FINISH = 0.1; // the ride is over within this many metres of its end
export const REACH = 3.0; // she may take the machine this near it or the garage
export const MOBILE = f({ seatY: 0.46, lift: 0.0, len: 2.3, half: 0.42, seat0: 0.22, seat1: -0.5 }); // seats are metres along the machine's heading from its middle

/** The point `s` metres round the ring and `lat` to its right, with the way it faces. */
export const mobilePos = (s, lat = 0) => posAt(MOBILE_PATH, s, lat, true);
export const START = f({ x: MOBILE_PATH[0].x, z: MOBILE_PATH[0].z, heading: r2(mobilePos(0).heading) });

/** Where seat `i` (0 front, 1 back) sits for a machine at ride state `r`: { x, z, y, yaw }. Pure, so a partner's device and the host agree. */
export function seatRecord(r, i) {
  const off = i ? MOBILE.seat1 : MOBILE.seat0;
  return { x: r.x + Math.sin(r.heading) * off, z: r.z + Math.cos(r.heading) * off, y: MOBILE.seatY, yaw: r.heading + Math.PI };
}

// ---- the garage lean-to and the things beside it ------------------------------------------------------------------------------------------
// An open lean-to on the outer side of the start (the ring's right is the inside: the garage is on the left, lat -3.9), the bench with the helmet beside it, a petrol-can-free tidy shelf of crates.
const S0 = mobilePos(0, 0);
const off = (s, lat) => { const p = mobilePos(s, lat); return f({ x: r2(p.x), z: r2(p.z) }); };
export const GARAGE = f({ ...off(0.4, -4.0), yaw: r2(S0.heading), w: 3.4, d: 2.2, r: 1.5 });
export const BENCH = f({ ...off(3.6, -3.7), yaw: r2(S0.heading + Math.PI / 2), r: 0.55 });
export const mobileColliders = () => [{ x: GARAGE.x, z: GARAGE.z, r: GARAGE.r }, { x: BENCH.x, z: BENCH.z, r: BENCH.r }].map((c) => f(c));
export const HELMET_RIDES = 3; // the bench's helmet lies out once she has ridden this many times (and has not earned it on the machine)

// ---- the lane's marks (stakes with a little flag every few metres, on both edges: orange outside, white inside) ---------------------------------
export const MARKS = f((() => {
  const out = [];
  const n = Math.floor(MOBILE_LEN / 3.4);
  for (let i = 0; i < n; i++) {
    const s = (i / n) * MOBILE_LEN + 1.2;
    for (const side of [-1, 1]) { const p = mobilePos(s, side * 2.35); out.push(f({ x: r2(p.x), z: r2(p.z), s: r2(s), side })); }
  }
  return out;
})());

// ---- every hop-off spot --------------------------------------------------------------------------------------------------------------------
// Beside the ring every 2.4 m, 3.3 m either side of the line (outside the lane and the marks) plus a few round the garage; only the free ones: no solid of the place within a metre and a bit.
const solids = () => [...snowvilleColliders(), ...wingColliders(), ...detailColliders(), ...skiColliders(), ...mobileColliders()];
const clear = (x, z) => solids().every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 1.1);
const inBounds = (x, z) => x > SNOWVILLE_BOUNDS.minX + 2 && x < SNOWVILLE_BOUNDS.maxX - 2 && z > SNOWVILLE_BOUNDS.minZ + 2 && z < SNOWVILLE_BOUNDS.maxZ - 2;
const CANDIDATES = (() => {
  const out = [];
  for (let s = 0; s < MOBILE_LEN; s += 2.4) for (const side of [-1, 1]) { const p = mobilePos(s, side * 3.3); out.push([p.x, p.z]); }
  for (const [s, lat] of [[3.5, -2.9], [-3.5, 2.9], [3.5, 2.9], [-3.5, -2.9], [0, 2.9], [0, -2.9]]) { const p = mobilePos(s, lat); out.push([p.x, p.z]); }
  return out;
})();
export const MOBILE_HOPS = f(CANDIDATES.filter(([x, z]) => clear(x, z) && inBounds(x, z)).map(([x, z]) => f({ x: r2(x), z: r2(z), y: r2(snowY(x, z)) })));

/** The metres round the ring of the point nearest (x, z): where a cat who joins a ride in progress sits. */
export function nearestS(x, z) {
  let best = 0; let bd = Infinity;
  for (let s = 0; s < MOBILE_LEN; s += 0.5) { const p = mobilePos(s); const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
export const SEAT_IDS = f(['snow-mobile', 'snow-mobile-1']); // the co-walk seat ids (remotecats.js: letters, dashes and a number), front and back
