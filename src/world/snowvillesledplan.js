// =============================================================================
// SNOWVILLE: THE SLED RUN (round two): THE PLAN. Pure data and pure functions (no THREE, no clock, no random number). A friendly wooden sled waits at the top of the sled hill (the summit
// rock's south side). Take it and it runs down a winding packed-snow track on the hill's east flank by world/pathride.js (the sled spec, here an OPEN run: 2.4 to 5.6 m/s, 1.5 m either side
// of the line), ending at the landing at the hill's foot (the pond is 45 m west, across the village: the hill's own foot is where a run can end). The stick only nudges the speed and steers her
// side to side inside the track; there is no way off it and no way to be stuck: the run always ends (the slowest speed still finishes it in under ten seconds) and the action button again, anywhere on
// it, is "Hop off" onto the nearest free spot (a test floods each). After the run the sled slides itself back up to the top. Numbers marked "start" are tuned from pictures.
// North is -z. The track is clear of the hill's lantern, rock and summit rock, every cottage, fir and drawn thing (tests check each).
// =============================================================================
import { SPECS, pathLength, posAt } from './pathride.js';
import { snowY, SNOWVILLE_BOUNDS, snowvilleColliders } from './snowvilleplan.js';
import { wingColliders } from './snowvillewingplan.js';
import { detailColliders, SLED_KEEP } from './snowvilledetailplan.js';

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

// The track's corner points, summit to foot (a gentle S down the east flank), then smoothed twice (Chaikin) into the line the sled follows.
const CORNERS = SLED_KEEP;
export function chaikin(pts, rounds) {
  let p = pts;
  for (let k = 0; k < rounds; k++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i]; const b = p[i + 1];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
export const RUN_PATH = f(chaikin(CORNERS, 2).map(([x, z]) => f({ x: r2(x), z: r2(z) })));
export const RUN_LEN = r2(pathLength(RUN_PATH, false));
// the walk's sled spec on an open run: no loop, no bumpers (the end stops it), gentle speed limits
export const RUN_SPEC = f({ ...SPECS.sled, loop: false, bumpers: false, vMin: 2.4, vMax: 5.6, accel: 2.2, ease: 0.6 });
export const START = f({ x: RUN_PATH[0].x, z: RUN_PATH[0].z }); // where it waits, facing down the run
export const LANDING = f({ x: RUN_PATH[RUN_PATH.length - 1].x, z: RUN_PATH[RUN_PATH.length - 1].z });
export const SLED = f({ seatY: 0.34, lift: 0.1, len: 1.3, half: 0.3 });
export const REACH = 2.8; // she may take the sled this near it
export const RETURN_SPEED = 6; // the sled slides itself back up at this many m/s
export const FINISH = 0.05; // the run is over within this many metres of its end
export const TRACK = f({ half: 0.95, stakeEvery: 4.2 }); // the packed-snow track's half width and the stakes along its edges
export const SPEED_LINES = f({ count: 10, high: 10, low: 5 });

/** The point `s` metres along the run and `lat` to its right, with the way it faces. */
export const runPos = (s, lat = 0) => posAt(RUN_PATH, s, lat, false);

// ---- every hop-off spot ------------------------------------------------------------------------------------------------------
// Beside the run every 2.4 m, 2.7 m either side of the line (outside the track), the start and the landing; only the free ones: no solid of the place within a metre and a bit, inside the bounds.
const solids = () => [...snowvilleColliders(), ...wingColliders(), ...detailColliders()];
const clear = (x, z) => solids().every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 1.1);
const inBounds = (x, z) => x > SNOWVILLE_BOUNDS.minX + 2 && x < SNOWVILLE_BOUNDS.maxX - 2 && z > SNOWVILLE_BOUNDS.minZ + 2 && z < SNOWVILLE_BOUNDS.maxZ - 2;
const CANDIDATES = (() => {
  const out = [];
  for (let s = 0; s <= RUN_LEN + 1e-6; s += 2.4) for (const side of [-1, 1]) { const p = runPos(s, side * 2.7); out.push([p.x, p.z]); }
  const a = runPos(0, 0); const b = runPos(RUN_LEN, 0);
  out.push([a.x - 1.8, a.z - 0.6], [a.x + 1.9, a.z - 0.4], [b.x + 0.3, b.z + 1.8], [b.x - 2.2, b.z + 0.8], [b.x + 2.4, b.z + 0.6]);
  return out;
})();
export const HOP_SPOTS = f(CANDIDATES.filter(([x, z]) => clear(x, z) && inBounds(x, z)).map(([x, z]) => f({ x: r2(x), z: r2(z), y: r2(snowY(x, z)) })));

/** The stakes along the track's two edges: { x, z, s }. */
export const STAKES = f((() => {
  const out = [];
  const n = Math.floor(RUN_LEN / TRACK.stakeEvery);
  for (let i = 1; i <= n; i++) for (const side of [-1, 1]) { const s = (i / (n + 1)) * RUN_LEN; const p = runPos(s, side * (TRACK.half + 0.1)); out.push(f({ x: r2(p.x), z: r2(p.z), s: r2(s), side })); }
  return out;
})());
