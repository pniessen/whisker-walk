// =============================================================================
// THE MOON'S OLD RELAY STATION (wing E, milestone M1): the plan. Pure data and pure functions (no THREE, no clock, no random number). A ring of low old walls with four ways in,
// eight pillars at the ways' edges, a relay tower in the middle (a thin mast under a round ledge 3.0 m up, golden mouse 4's perch: one Moon hop from the dust), a console, a dish and
// two rows of solar panels. The roof is open to the sky: no ceiling anywhere (a finite ceiling would pull the camera in and clip a Moon hop). Everything the walk stops at is a circle
// (the walk's colliders). It stands about 12 m from Dot's track, away from the finds, the story points and the rocks' keep-out places.
// =============================================================================
import { MOON_MICE } from './moonplan.js';

export const STATION = Object.freeze({ x: 44, z: 36, r: 7, near: 26, ring: 5.6, half: 1.5, wallR: 0.45, step: 0.7, mast: 0.9, ledge: 3.0, ledgeR: 1.35 });
export const WALL_TOP = Object.freeze({ min: 0.7, max: 1.1, pier: 1.25 }); // metres over the dust: low old walls, every one under 2.2
export const CLEAR = Object.freeze({ minX: STATION.x - STATION.r, maxX: STATION.x + STATION.r, minZ: STATION.z - STATION.r, maxZ: STATION.z + STATION.r }); // rocks and pebbles are taken away here after the scatter
export const GATE = Object.freeze({ x: STATION.x, z: STATION.z, r: 8.2 }); // the closed-off disc while the stage is on its way (its ring of invisible colliders sits on the edge)
export const WAYS = Object.freeze([0, 1, 2, 3].map((q) => Object.freeze({ a: (q * Math.PI) / 2, x: Math.round((STATION.x + Math.cos((q * Math.PI) / 2) * STATION.ring) * 100) / 100, z: Math.round((STATION.z + Math.sin((q * Math.PI) / 2) * STATION.ring) * 100) / 100 })));
export const CONSOLE = Object.freeze({ x: 47.2, z: 38.4, r: 0.6, reach: 2.6 }); // the control desk (the relay milestone's prompt stands here)
export const DISH = Object.freeze({ x: 47.4, z: 33.2, r: 0.25, y: 1.7 }); // a small dish on a post
export const PANELS = Object.freeze([0, 1].flatMap((row) => [0, 1, 2].map((i) => Object.freeze({ x: 40.9 + i * 1.5, z: row ? 39.0 : 33.1, row, yaw: row ? Math.PI : 0 })))); // six panels lying low on stands: soft, nothing to bump
export const BEACONS = Object.freeze([Object.freeze({ x: STATION.x, z: STATION.z, y: 6.4 }), ...WAYS.map((w) => Object.freeze({ x: w.x, z: w.z, y: WALL_TOP.pier + 0.12 }))]); // blink lights (the mast's top, a pier at each way)
export const SPOT = Object.freeze({ x: STATION.x, z: STATION.z, y: 1.6, range: 18 }); // where the photo and the journal page look for the station

const c = (x, z, r, extra = {}) => Object.freeze({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r, ...extra });

/** The wall's circles in four arcs, between the four ways (the arcs' end circles are the pillars). Each: { x, z, r, a (angle), end: 0 | 1 | 2 (middle, first, last of its arc), i (arc) }. */
export const WALL = Object.freeze((() => {
  const S = STATION;
  const out = [];
  const gap = Math.asin(S.half / S.ring);
  for (let q = 0; q < 4; q++) {
    const a0 = (q * Math.PI) / 2 + gap;
    const a1 = ((q + 1) * Math.PI) / 2 - gap;
    const n = Math.ceil(((a1 - a0) * S.ring) / S.step) + 1;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / (n - 1);
      out.push(Object.freeze({ ...c(S.x + Math.cos(a) * S.ring, S.z + Math.sin(a) * S.ring, S.wallR), a, q, end: k === 0 ? 1 : k === n - 1 ? 2 : 0 }));
    }
  }
  return out;
})());

/** Every collider the stage adds (the walls, the mast, the console, the dish's post). */
export const STATION_COLLIDERS = Object.freeze([
  ...WALL.map(({ x, z, r }) => c(x, z, r)),
  c(STATION.x, STATION.z, STATION.mast),
  c(CONSOLE.x, CONSOLE.z, CONSOLE.r),
  c(DISH.x, DISH.z, DISH.r),
]);
/** The perch: the tower's ledge (golden mouse 4's), the lander's own kind of climb. */
export const STATION_PERCHES = Object.freeze([Object.freeze({ x: STATION.x, z: STATION.z, y: STATION.ledge, kind: 'stone' })]);
export const MOUSE = MOON_MICE.find((m) => m.id === 'gm-moon-4');
