// Intruders (Clan Life Part 2): now and then a warrior of a neighbouring clan
// walks across a territory, in from the edge that faces its own land and out
// by another edge. This file is the pure half: when a visit happens, who comes
// and where they are at any moment.
//
// WHY THE CLOCK. Who comes and where they are is a pure function of the area
// and the wall clock, nothing else: no walkRng, no strays' stream, no stored
// state, nothing on the wire. So both kids' devices on a co-walk see the same
// cat at the same spot at the same moment without sending a word about it, and
// a walk's own rng draws stay exactly as they were.
//
// The schedule: the clock is cut into INTRUDER_PERIOD slots. Slot k's hash
// h = seedFromCode(`${areaId}|intruder|${k}`) leaves 1 slot in 4 empty
// (h % 4 === 0); otherwise the visitor's clan is picked from the territory's
// neighbours (only those with a cast and a route here) and the visitor is one
// of that clan's warriors (RAIDER_SLOTS). It comes in ENTER_AT seconds into the
// slot and walks its route at INTRUDER_SPEED; every route is short enough
// that it has left before the next slot begins, so there is never more than
// one at a time.
//
// Only the four clan territories get intruders. The old areas (Neighborhood,
// Park, Seaside, Docks), the den and the island never do: the island is truce
// ground walked inside the Pines, and no route ever touches it.
//
// No progress lives here: this file imports nothing that stores anything.
import { seedFromCode } from './rng.js';
import { HOMES, isClanId } from './clanhomes.js';
import { castFor, clanCast, RAIDER_SLOTS } from './clancast.js';

export const INTRUDER_PERIOD = 120; // s of wall clock per visit slot
export const ENTER_AT = 10; // s into its slot that a visitor comes on the map
export const INTRUDER_SPEED = 0.9; // m/s, an unhurried walk
export const ROUTE_MAX = 90; // m; ENTER_AT + 90 / 0.9 = 110 s < INTRUDER_PERIOD
export const FLEE_SPEED = 4.5; // m/s, off to the nearer end of its route
export const CATCH_UP_SPEED = 2.5; // m/s at most, back to its clock position
export const NOTICE_RANGE = 6; // m: it puffs up and hisses
export const CHALLENGE_RANGE = 3.5; // m: the Fight / Back off pill shows
export const CHALLENGE_KEEP = 10; // m: the pill stays up this far
export const RECHALLENGE_DELAY = 20; // s after a lost fight
export const HOLD_MAX = 40; // s a remote holder may hold with no word back

const pt = (x, z) => Object.freeze({ x, z });
const route = (...pts) => Object.freeze(pts.map(([x, z]) => pt(x, z)));

// One route per neighbouring clan, hand-probed on each built map (ruling R1):
// every 0.5 m along every segment is clan ground (clanWalkableFor: walkable,
// clear of every collider and every water and wade band, out of the keep-out,
// off the Pines' truce ground), and never on a deck either, so the intruder
// always walks on the ground. Each keeps 3 m beyond its camp's edge, starts and
// ends within 1.5 m of the map's edge, and is at most ROUTE_MAX long. The
// first point is on the edge that faces the visitor's own clan, as each map's
// "WHERE ITS EDGES FACE" note has it (x east, z south, so north is -z).
export const INTRUDER_ROUTES = Object.freeze({
  woods: Object.freeze({
    // The Moor is north. In from the Moor side on the river's east bank (the
    // glade west of it holds the camp), down the open wood east of the river,
    // and out the east edge towards Twolegplace. 77.4 m.
    moor: route([40, -49.5], [33, -25], [30, -5], [49.5, 20]),
    // The River is west. In from the River side just south of the pond,
    // east across the wood, then south and out by the south edge. 78.6 m.
    river: route([-49.5, 5], [-25, 6], [-5, 25], [5, 49.5]),
  }),
  river: Object.freeze({
    // The Pines is north. In from the Pines side onto the north strip, east
    // along it between the river and the north edge, through the dry gap
    // between river-north's reach and the lake's west shore, and out the east
    // edge along the lakeshore towards the Woods. The north strip's only links
    // south are the log bridge and the stepping stones, both decks, so the
    // route stays on the strip and the lakeshore rather than cross one. 77.4 m.
    pines: route([-20, -49.5], [0, -41], [20, -37], [23, -33], [32, -25], [49.5, -20]),
    // The Woods is east. In from the Woods side north of the long path, west
    // across the open ground well south of the camp, and out the south edge.
    // 75.0 m.
    woods: route([49.5, 12], [25, 20], [10, 25], [-5, 35], [-10, 49.5]),
  }),
  moor: Object.freeze({
    // The Woods is south. In from the Woods side east of the river, north up
    // the open moor near the spawn, and out the east edge towards the Gorge.
    // 75.7 m.
    woods: route([35, 49.5], [38, 20], [35, -5], [49.5, -20]),
    // The Pines is west. In from the Pines side north of the water, east over
    // the heath, then north-west and out the north edge, wide of the camp.
    // 78.1 m.
    pines: route([-49.5, -14], [-30, -10], [-12, -14], [-20, -30], [-30, -49.5]),
  }),
  pines: Object.freeze({
    // The River is south. In from the River side west of the camp (east of the
    // camp the south edge is the truce path and the lake's pocket), north up
    // the swamp's west side, round the bog and out the west edge. Never near
    // the truce path, the bridge or the island. 78.2 m.
    river: route([-46, 49.5], [-48.5, 30], [-48.5, 24], [-35, 24], [-28, 12], [-49.5, -1]),
    // The Moor is east. In from the Moor side north of the lake, west through
    // the pines, then north and out the north edge. 71.9 m.
    moor: route([49.5, -20], [25, -15], [8, -24], [0, -38], [0, -49.5]),
  }),
});

const routesOf = (areaId) => (
  typeof areaId === 'string' && Object.hasOwn(INTRUDER_ROUTES, areaId) ? INTRUDER_ROUTES[areaId] : null
);

export function routeLength(r) {
  let len = 0;
  for (let i = 0; i + 1 < r.length; i++) len += Math.hypot(r[i + 1].x - r[i].x, r[i + 1].z - r[i].z);
  return len;
}

// The point s metres along the route (clamped to its two ends) and the unit
// heading of the segment it is on.
export function routePoint(r, s) {
  let left = Math.max(0, s);
  for (let i = 0; i + 1 < r.length; i++) {
    const p = r[i], q = r[i + 1];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len === 0) continue;
    const last = i + 2 === r.length;
    if (left <= len || last) {
      const f = Math.min(left, len) / len;
      return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, dx: (q.x - p.x) / len, dz: (q.z - p.z) / len };
    }
    left -= len;
  }
  const p = r[r.length - 1];
  return { x: p.x, z: p.z, dx: 0, dz: 1 };
}

// Who visits this territory in the slot that holds t, or null.
export function visitAt(areaId, t) {
  const routes = routesOf(areaId);
  if (!routes || typeof t !== 'number' || !Number.isFinite(t)) return null;
  if (castFor(areaId).length === 0) return null;
  const k = Math.floor(t / INTRUDER_PERIOD);
  const h = seedFromCode(`${areaId}|intruder|${k}`);
  if (h % 4 === 0) return null;
  // A neighbour needs a cast and a route here; it needs no camp of its own.
  const neighbours = HOMES[areaId].neighbours.filter((n) => (
    isClanId(n) && clanCast(n).length > 0 && Object.hasOwn(routes, n)
  ));
  if (neighbours.length === 0) return null;
  const clan = neighbours[(h >>> 2) % neighbours.length];
  const member = clanCast(clan)[RAIDER_SLOTS[(h >>> 4) % RAIDER_SLOTS.length]];
  if (!member) return null;
  return { visit: k, clan, member };
}

// Where this slot's visitor is at t: on the map only while 0 <= s <= length.
export function intruderAt(areaId, t) {
  const v = visitAt(areaId, t);
  if (!v) return null;
  const r = INTRUDER_ROUTES[areaId][v.clan];
  const s = (t - v.visit * INTRUDER_PERIOD - ENTER_AT) * INTRUDER_SPEED;
  if (!(s >= 0 && s <= routeLength(r))) return null;
  const p = routePoint(r, s);
  return { visit: v.visit, clan: v.clan, member: v.member, x: p.x, z: p.z, dx: p.dx, dz: p.dz, s };
}
