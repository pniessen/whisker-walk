// =============================================================================
// THE MOON'S SLED LANE (milestone M2): THE PLAN. Pure data and pure functions (no THREE, no clock, no random number). A friendly hover sled waits in a rack at about (14, 46.7), south of the
// base; a closed lane (a long loop, 1.5 m either side of its line) runs east along z 45.3 to the Old Relay Station's south side and comes back along z 48.1. The sled follows the lane by
// world/pathride.js (the spec sled: 3 to 8 m/s, laneHalf 1.5, loops); the stick nudges the speed and steers her side to side inside the lane. Marker lamps stand along the lane's two outer edges.
// North is -z. docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md decisions 4, 6, 7 and 8. Numbers are "start" values.
// The lane's ground is flat dust (moonY = 0 there), clear of the landing, the shed, Dot's depot and track, the finds, the mice, the story points and the station's walls (tests check each).
// =============================================================================
import { SPECS, pathLength } from './pathride.js';
import { MOON_COLLIDERS, MOON_BOUNDS } from './moonplan.js';
import { STATION_COLLIDERS } from './moonstationplan.js';

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

export const LANE = f({ zOut: 45.3, zBack: 48.1, xWest: 15.4, xEast: 50.0, half: 1.5, lampEvery: 4.2 }); // two straight legs 2.8 m apart (their corridors overlap a little), joined by two half circles (radius 1.4)
const R = (LANE.zBack - LANE.zOut) / 2;
const ZC = (LANE.zOut + LANE.zBack) / 2;
const arc = (cx, from, to, n) => Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return f({ x: r2(cx + R * Math.cos(a)), z: r2(ZC + R * Math.sin(a)) }); });
const PI = Math.PI;
/** The lane's line: from the rack's tip (14.0, 46.7) round the west end (a quarter circle), east along z 45, round the east end (a half circle), back west along z 48.1, and round the west end's last quarter. */
export const LANE_PATH = f([
  ...arc(LANE.xWest, PI, 1.5 * PI, 4), // the rack's tip to the start of the out leg
  ...arc(LANE.xEast, -0.5 * PI, 0.5 * PI, 8).slice(0), // the east end
  ...arc(LANE.xWest, 0.5 * PI, PI, 4).slice(0, -1), // the last quarter, back to (just short of) the rack
]);
export const LANE_LEN = r2(pathLength(LANE_PATH, true));
export const SLED_SPEC = SPECS.sled;

/** The rack: two low posts and a crossbar round the sled's bay; the sled waits on the lane's own first point, facing out along the lane. */
export const RACK = f({ x: LANE_PATH[0].x, z: LANE_PATH[0].z, postGap: 1.35, postR: 0.22, reach: 2.9, park: 0.8 });
export const SLED = f({ seatY: 0.42, lift: 0.2, bob: 0.05, len: 1.7, half: 0.65 });
export const SPOT = f({ type: 'mnsled', up: 0.7, range: 11 });

/** Distance from (x, z) to the lane's line (the closed polyline). */
export function laneDistance(x, z, path = LANE_PATH) {
  let best = Infinity;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}
/** Is (x, z) inside the lane's corridor (within `half` of the line), `m` metres wider? The tests keep every find, mouse, story point and collider out of it. */
export const inLane = (x, z, m = 0) => laneDistance(x, z) <= LANE.half + m;

// the rectangle where the rocks and pebbles are cleared AFTER they are scattered (MOON_CLEARS; never ROCK_KEEP_OUT: every stream and every other rock stays exactly as it was)
export const CLEAR = f({ minX: 12.2, maxX: 53.4, minZ: 43.3, maxZ: 49.95 });

// ---- every hop-off spot ------------------------------------------------------------------------------------------------------
// North of the out leg (every 6 m: the lane's 1.5 m, then a metre of dust), beside the rack and past the east end; only the free ones (no collider of the Moon or the station within a metre and a half), inside the bounds.
const clearOfSolids = (x, z) => [...MOON_COLLIDERS, ...STATION_COLLIDERS].every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 1.2);
const inBounds = (x, z) => x > MOON_BOUNDS.minX + 2 && x < MOON_BOUNDS.maxX - 2 && z > MOON_BOUNDS.minZ + 2 && z < MOON_BOUNDS.maxZ - 2;
const CANDIDATES = [
  ...[16, 22, 28, 34, 40, 46, 50].map((x) => [x, LANE.zOut - LANE.half - 1.0]),
  [11.4, 45.4], [11.4, 47.8], [10.6, 46.6], [52.9, 44.6], [52.6, 41.9],
];
export const HOP_SPOTS = f(CANDIDATES.filter(([x, z]) => clearOfSolids(x, z) && inBounds(x, z) && !inLane(x, z, 0.4)).map(([x, z]) => f({ x: r2(x), z: r2(z) })));

/** The marker lamps: along the lane's two outer edges every `lampEvery` metres of the line (one more at the rack). Each { x, z }. */
export const LAMPS = f((() => {
  const out = [];
  const L = LANE_LEN;
  const n = Math.floor(L / LANE.lampEvery);
  for (let i = 0; i < n; i++) {
    const s = (i / n) * L;
    // a point on the line, and the outside of the loop: straight out from the nearer end's centre, or north or south along a leg
    const p = pointAt(s);
    const cx = p.x < LANE.xWest ? LANE.xWest : p.x > LANE.xEast ? LANE.xEast : null;
    const dx = cx === null ? 0 : p.x - cx;
    const dz = cx === null ? (p.z < ZC ? -1 : 1) * R : p.z - ZC;
    const m = Math.hypot(dx, dz) || 1;
    const ox = (dx / m) * (LANE.half + 0.15);
    const oz = (dz / m) * (LANE.half + 0.15);
    out.push(f({ x: r2(p.x + ox), z: r2(p.z + oz), s: r2(s) }));
  }
  return out;
})());
function pointAt(s) {
  let d = ((s % LANE_LEN) + LANE_LEN) % LANE_LEN;
  for (let i = 0; i < LANE_PATH.length; i++) {
    const a = LANE_PATH[i];
    const b = LANE_PATH[(i + 1) % LANE_PATH.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= len || i === LANE_PATH.length - 1) { const t = len > 0 ? Math.min(1, d / len) : 0; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
    d -= len;
  }
  return { x: LANE_PATH[0].x, z: LANE_PATH[0].z };
}
