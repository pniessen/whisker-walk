// =============================================================================
// THE CRYSTAL CAVE, WING C: LUMI'S CART ON THE OLD TRACKS (milestone C4): THE PLAN. Pure data and pure functions (no THREE, no clock, no random number): one straight
// old mine track along the cave's west side from the forge area (north end, z 22) to the singing chamber (south end, z -14), a wooden platform with a rubber bumper at each
// end, the cart's path and spec for world/pathride.js (the spec cart: 1.0 to 3.0 m/s, bumpers; it halts on each end for a few seconds, then rolls back the way it came), every
// hop-off spot, the clear rectangle for the rim rocks and pebbles, and the rose shard's place (the forge's third ingredient: C3 reads ROSE_SHARD, this file never edits the
// forge job). North is -z. docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md decisions 4, 5, 7 and 8. Numbers are "start" values.
// The line runs at x -34.3 rather than -33: a small cluster stands at (-32.3, -6.1) and the cluster scatter never moves. The floor under it never changes: the track follows it.
// =============================================================================

import { SPECS, withStops, pathLength } from './pathride.js';
import { crystalColliders } from './crystalplan.js';

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

export const TRACK = f({ x: -34.3, zNorth: 22, zSouth: -14, railGap: 0.8, railW: 0.07, sleeperEvery: 0.9, sleeperHalf: 0.68 });
export const TRACK_PATH = f([f({ x: TRACK.x, z: TRACK.zNorth }), f({ x: TRACK.x, z: TRACK.zSouth })]);
export const TRACK_LEN = pathLength(TRACK_PATH, false);
/** The south end of the line: the forge job (C3) places or reads its rose shard from here. */
export const TRACK_END = f({ x: TRACK.x, z: TRACK.zSouth });
/** The rose shard lies on the floor near the south end, in the open beside the platform (the forge's third ingredient, bit 2 of `forge`). */
export const ROSE_SHARD = f({ x: -32.0, z: -10.8 });

export const DWELL = 7; // seconds on each end
export const STOPS = f([f({ name: 'north', s: 0 }), f({ name: 'south', s: r2(TRACK_LEN) })]);
export const CART_SPEC = withStops(SPECS.cart, STOPS.map((k) => ({ name: k.name, s: k.s, dwell: DWELL })));
export const CART = f({ reach: 3.0, seatY: 0.35, lift: 0.1, len: 1.6, half: 0.55, lanternY: 0.95 });

// the platforms: a wooden deck at each end, the bumper just past the cart's nose (the cart's centre stops at the end of the line)
export const PLATFORM = f({ minX: -35.4, maxX: -32.7, len: 4.2, behind: 1.5 }); // a deck spans `behind` m past the end and `len - behind` m along the line
export const PLATFORMS = f([
  f({ id: 'north', z0: TRACK.zNorth - (PLATFORM.len - PLATFORM.behind), z1: TRACK.zNorth + PLATFORM.behind, bumperZ: TRACK.zNorth + 0.85 }),
  f({ id: 'south', z0: TRACK.zSouth - PLATFORM.behind, z1: TRACK.zSouth + (PLATFORM.len - PLATFORM.behind), bumperZ: TRACK.zSouth - 0.85 }),
]);

// ---- every hop-off spot ------------------------------------------------------------------------------------------------------
// Two on each platform's east edge, then every 4 m along the line's east side (a spot beside a solid cluster is left out); all inside the bounds, free, reachable on foot (a test floods each).
export const PLATFORM_SPOTS = f([[-33.1, 22.0], [-33.1, 20.8], [-33.1, -12.8], [-33.1, -14.0]].map(([x, z]) => f({ x, z })));
const clear = (x, z) => crystalColliders().every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 1.0);
export const LINE_SPOTS = f([18, 14, 10, 6, 2, -2, -6, -10].map((z) => ({ x: -32.6, z })).filter((p) => clear(p.x, p.z)).map(f));
export const HOP_SPOTS = f([...PLATFORM_SPOTS, ...LINE_SPOTS]);

// the rectangle where the rim rocks and pebbles are cleared AFTER they are scattered (CRYSTAL_CLEARS; never KEEP_OUT: the clusters and every other stream stay exactly as they were)
export const CLEARS = f([f({ minX: -36.6, maxX: -32.2, minZ: -16.6, maxZ: 24.6 })]);
/** The corridor the tests keep clear of finds, mice, stones, Lumi, the arch, the pool and the wander points: the whole strip plus the platforms. */
export const CORRIDOR = f({ minX: -35.6, maxX: -32.5, minZ: -16.0, maxZ: 24.0 });
export const inCorridor = (x, z, m = 0) => x > CORRIDOR.minX - m && x < CORRIDOR.maxX + m && z > CORRIDOR.minZ - m && z < CORRIDOR.maxZ + m;

// the journal page's photo target: the cart itself (the live moves it along)
export const SPOT = f({ type: 'cccart', up: 0.8, range: 9 });
