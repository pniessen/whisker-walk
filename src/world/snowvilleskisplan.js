// =============================================================================
// SNOWVILLE: THE SKI SLOPE (round three): THE PLAN. Pure data and pure functions (no THREE, no clock, no random number). A bright flagged slope on the sled hill's WEST flank (the sled run is on
// the east; the two never cross). A rack of skis and poles stands at the top beside a gate arch; take the skis and she glides down a marked line by world/pathride.js (an OPEN run, like the sled's:
// 2.0 to 5.0 m/s, 2 m either side of the line), ending at the Finish flag at the hill's foot. The stick swings her left and right through six little gates of flags laid in a gentle slalom; each
// gate she glides through is a soft chime and a puff of snow, and it is praise only (no timer, no score shown, no fail). Clearing all six on one run earns the Ski Goggles (snowvilleskislive.js);
// a child who never does is not shut out: the goggles also lie on the rack's bench after a few runs. There is no way off the run and no way to be stuck: the run always ends (the slowest speed
// still finishes it in under twelve seconds) and the action button again, anywhere on it, is "Take the skis off" onto the nearest free spot (a test floods each).
// North is -z. The line is clear of the summit rock, the lantern, the cottages, every fir and every drawn thing (tests check each). Numbers marked "start" are tuned from pictures.
// =============================================================================
import { SPECS, pathLength, posAt } from './pathride.js';
import { snowY, SNOWVILLE_BOUNDS, snowvilleColliders } from './snowvilleplan.js';
import { wingColliders } from './snowvillewingplan.js';
import { detailColliders, SKI_KEEP } from './snowvilledetailplan.js';
import { chaikin } from './snowvillesledplan.js';

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

export const SKI_PATH = f(chaikin(SKI_KEEP, 2).map(([x, z]) => f({ x: r2(x), z: r2(z) })));
export const SKI_LEN = r2(pathLength(SKI_PATH, false));
// the walk's sled spec on an open run, a touch gentler and a touch wider: no loop, no bumpers (the end stops it)
export const SKI_SPEC = f({ ...SPECS.sled, loop: false, bumpers: false, vMin: 2.0, vMax: 5.0, accel: 2.0, ease: 0.6, laneHalf: 2.0, latSpeed: 3.2 });
export const FINISH = 0.05; // the run is over within this many metres of its end
export const REACH = 2.9; // she may take the skis this near the rack or the start
export const SKIS = f({ lift: 0.04, len: 1.1, gap: 0.1, poleLen: 0.8 }); // the skis on her feet: length, the space between the pair, a lift above the snow
export const GOGGLE_RUNS = 3; // the bench's goggles lie out once she has skied this many runs (and has not earned them on the slope)

/** The point `s` metres along the run and `lat` to its right, with the way it faces. */
export const skiPos = (s, lat = 0) => posAt(SKI_PATH, s, lat, false);
export const START = f({ x: SKI_PATH[0].x, z: SKI_PATH[0].z });
export const LANDING = f({ x: SKI_PATH[SKI_PATH.length - 1].x, z: SKI_PATH[SKI_PATH.length - 1].z });

// ---- the six gates -------------------------------------------------------------------------------------------------------------------------
// A gate is a pair of little flags across the line: its centre `lat` to the right (alternately right and left: a gentle slalom), and a width of 2 * TOL. She clears it when she glides past it with her
// lateral place within TOL of the centre. The line itself (lat 0) is just outside every gate, so she has to lean (a little or all the way: the lane is 2 m).
export const GATE_COUNT = 6;
export const GATE_TOL = 0.95;
export const GATE_C = 1.1;
export const GATES = f(Array.from({ length: GATE_COUNT }, (_, i) => {
  const s = ((i + 1.2) / (GATE_COUNT + 1.6)) * SKI_LEN;
  const lat = (i % 2 ? -1 : 1) * GATE_C;
  const p = skiPos(s, lat);
  return f({ i, s: r2(s), lat, x: r2(p.x), z: r2(p.z), heading: r2(p.heading) });
}));

/** The gates she clears between two ride states along the run: the indices whose `s` lies in (a.s, b.s] and whose lateral place she glided through (checked at b). */
export function gatesCleared(prevS, ride) {
  const out = [];
  for (const g of GATES) if (g.s > prevS && g.s <= ride.s && Math.abs(ride.lat - g.lat) <= GATE_TOL) out.push(g.i);
  return out;
}

// ---- the things at the top -----------------------------------------------------------------------------------------------------------------
// The rack of skis and poles stands left of the start, the bench with the goggles behind it, the gate arch's two stakes and pennant span the start. All of them clear of the lane (2 m) and the arch's posts.
const S0 = skiPos(0, 0);
const off = (s, lat) => { const p = skiPos(s, lat); return f({ x: r2(p.x), z: r2(p.z) }); };
export const RACK = f({ ...off(0.2, -3.4), yaw: r2(S0.heading), r: 0.55 });
export const BENCH = f({ ...off(2.4, -3.6), yaw: r2(S0.heading + Math.PI / 2), r: 0.55 });
export const ARCH = f({ left: off(0.2, -2.3), right: off(0.2, 2.3), s: 0.2 });
export const FINISH_FLAG = f({ ...off(SKI_LEN - 0.4, 2.7), yaw: r2(S0.heading) });
export const skiColliders = () => [{ x: RACK.x, z: RACK.z, r: RACK.r }, { x: BENCH.x, z: BENCH.z, r: BENCH.r }].map((c) => f(c));

// ---- the marked line (stakes along both edges, green on the left, blue on the right) -----------------------------------------------------------------
export const MARKS = f((() => {
  const out = [];
  const n = Math.floor(SKI_LEN / 3.6);
  for (let i = 1; i <= n; i++) {
    const s = (i / (n + 1)) * SKI_LEN;
    for (const side of [-1, 1]) { const p = skiPos(s, side * 2.45); out.push(f({ x: r2(p.x), z: r2(p.z), s: r2(s), side })); }
  }
  return out;
})());

// ---- every hop-off spot --------------------------------------------------------------------------------------------------------------------------------
// Beside the run every 2.4 m, 3.4 m either side of the line (outside the lane and the marks), the start and the landing; only the free ones: no solid of the place within a metre and a bit.
const solids = () => [...snowvilleColliders(), ...wingColliders(), ...detailColliders(), ...skiColliders()];
const clear = (x, z) => solids().every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 1.1);
const inBounds = (x, z) => x > SNOWVILLE_BOUNDS.minX + 2 && x < SNOWVILLE_BOUNDS.maxX - 2 && z > SNOWVILLE_BOUNDS.minZ + 2 && z < SNOWVILLE_BOUNDS.maxZ - 2;
const CANDIDATES = (() => {
  const out = [];
  for (let s = 0; s <= SKI_LEN + 1e-6; s += 2.4) for (const side of [-1, 1]) { const p = skiPos(s, side * 3.4); out.push([p.x, p.z]); }
  const a = skiPos(0, 0); const b = skiPos(SKI_LEN, 0);
  out.push([a.x + 1.6, a.z - 1.0], [a.x - 1.2, a.z - 1.5], [b.x + 0.3, b.z + 1.8], [b.x - 2.2, b.z + 0.8], [b.x + 2.4, b.z + 0.6]);
  return out;
})();
export const SKI_HOPS = f(CANDIDATES.filter(([x, z]) => clear(x, z) && inBounds(x, z)).map(([x, z]) => f({ x: r2(x), z: r2(z), y: r2(snowY(x, z)) })));
