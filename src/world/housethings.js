// THE OLD HOUSE, THE FINDS (Old House step 2, rulings D4-D6, D10-D14). Pure data
// and one pure function: where the golden mice, the knock-overs, the mice and
// their cover, the yarn ball, the special places and the six discoveries are,
// the goals the house can finish, the corner map's floor plan, and toyStop,
// which keeps a batted yarn ball out of the walls. No THREE, no randomness, no
// clock; house.js hands it all to the walk, house life runs the finds.
// Co-walk ready (D19): nothing here is drawn from any stream.

import {
  HOUSE_ROOMS, HOUSE_STAIRS, SECRET_BOOKCASE, houseSections, roomAt, stairAt,
} from './houseplan.js';

const freeze = Object.freeze;
const frozenAll = (list) => freeze(list.map((o) => freeze(o)));

// The house's three golden mice (D5), held equal to GOLD_MICE.house (goldmice.js, where the walk lays them from; test/housethings.test.js): `y` is the height over the ground
// there, so 0 on a ledge. One on the library's west bookcase (where the corner
// leap lands her), one on the wardrobe (where the leap from the shelf lands
// her), one on the cellar floor between the barrels and the crates.
export const HOUSE_GOLD_MICE = frozenAll([
  { id: 'gm-house-1', x: -13.6, z: 5.6, y: 0 },
  { id: 'gm-house-2', x: -6.8, z: -15.6, y: 0 },
  { id: 'gm-house-3', x: 27.0, z: -0.7, y: 0 },
]);

// The knock-overs (D4), in propsets.js's knockable shape: each on a perch's piece
// (housemoves.js HOUSE_PERCHES), y its top over the floor, 0.35-0.6 m off the
// perch point, clear of what the piece already carries (houseparts.js), and a
// fallTo on its own room's floor 0.6-1.6 m off.
const knock = (id, kind, x, z, y, fx, fz) => ({ id, kind, x, y, z, fallTo: freeze({ x: fx, z: fz }) });
export const HOUSE_KNOCKABLES = frozenAll([
  knock('house-cup-1', 'cup', 7.77, -7.8, 0.92, 7.9, -6.75), // counter A, by the jars
  knock('house-can-1', 'can', 10.6, -7.8, 0.92, 10.5, -6.75), // counter B, by the jug
  knock('house-cup-2', 'cup', 9.45, -3.32, 0.76, 10.4, -3.45), // the kitchen table
  knock('house-book-1', 'book', 13.6, 7.4, 1.3, 12.65, 7.75), // the parlour mantel, onto the hearth
  knock('house-flowerpot-1', 'flowerpot', -3.71, 3.82, 0.8, -2.85, 3.9), // the hall console
  knock('house-book-2', 'book', -8.65, 11.43, 0.8, -8.6, 10.5), // the library desk
]);

// The mice's cover (D10): under the pantry and the dresser in the kitchen, behind
// the barrels and under shelf A in the cellar. A mouse runs for the nearest cover
// on its own level (critters.js), and the kitchen's and the cellar's are on two.
export const HOUSE_HIDES = frozenAll([
  { x: 13.45, z: -1.6, room: 'kitchen' },
  { x: 4.5, z: -3.2, room: 'kitchen' },
  { x: 26.0, z: -0.4, room: 'cellar' },
  { x: 23.2, z: -9.55, room: 'cellar' },
]);

// Four mice, each patrolling a line in its own room (critters.js: from x, z to x2, z2).
export const HOUSE_MICE = frozenAll([
  { type: 'mouse', x: 12.4, z: -3.0, x2: 12.4, z2: -0.9, room: 'kitchen' },
  { type: 'mouse', x: 11.0, z: 0.9, x2: 12.6, z2: 0.9, room: 'kitchen' },
  { type: 'mouse', x: 22.0, z: -6.5, x2: 24.8, z2: -7.8, room: 'cellar' },
  { type: 'mouse', x: 26.5, z: -4.0, x2: 27.5, z2: -2.2, room: 'cellar' },
]);

// The yarn ball's two spots (D14), clear floor; `words` the phrase that says where.
export const HOUSE_YARN_SPOTS = frozenAll([
  { x: 0, z: 5.2, words: 'house.yarn.hall' },
  { x: 7.9, z: -2.0, words: 'house.yarn.kitchen' },
]);

// Three special places (D13): they pay 'scenic' and mark the corner map.
export const HOUSE_SCENICS = frozenAll([
  { id: 'clock', x: -2.6, z: 3.6, words: 'house.scenic.clock' },
  { id: 'fireside', x: 12.0, z: 7.0, words: 'house.scenic.fireside' },
  { id: 'attic-window', x: -22.3, z: -11.0, words: 'house.scenic.attic-window' },
]);

// The six discoveries' spots (D6). She pays one when, within r of (x, z):
//   stay    she stays holdS seconds;  still  she stays holdS seconds without moving;
//   arrive  she gets onto `ledge`;    along  she walks along `ledge` (the piano's keys);
//   secret  she stays holdS seconds at the shut bookcase, from either side (D9).
export const HOUSE_FINDS = frozenAll([
  { id: 'clock', room: 'hall', trigger: 'stay', x: -2.9, z: 3.1, r: 1.2, holdS: 1.0 },
  { id: 'piano', room: 'parlour', trigger: 'along', x: 8.7, z: 11.15, r: 0.65, holdS: 0, ledge: 'parlour-keys' },
  { id: 'window', room: 'attic', trigger: 'arrive', x: -23.6, z: -11.0, r: 0.8, holdS: 0, ledge: 'attic-seat' },
  { id: 'bookcase', room: 'library', trigger: 'secret', x: SECRET_BOOKCASE.x, z: SECRET_BOOKCASE.z, r: SECRET_BOOKCASE.reach, holdS: SECRET_BOOKCASE.holdS },
  { id: 'cushion', room: 'parlour', trigger: 'still', x: 12.7, z: 7.0, r: 0.35, holdS: 1.5 },
  { id: 'toys', room: 'attic', trigger: 'stay', x: -17.6, z: -14.75, r: 1.0, holdS: 0.5 },
]);

// What the daily goals may ask of the house (D11).
export const HOUSE_GOAL_TYPES = freeze(['mischief', 'photo', 'play', 'scenic']);

// ---- the corner map (D12) ----

// The lawn's green, under the floor plan.
export const HOUSE_MAP_GROUND = 0x6f9a52;
const WALL_STRIP = 0.5;
const stairRect = (s) => {
  const hw = s.width / 2;
  return Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0)
    ? { minX: s.x0 - hw, maxX: s.x0 + hw, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) }
    : { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - hw, maxZ: s.z0 + hw };
};
// A wall line as a WALL_STRIP-wide rectangle along it.
const strip = (x0, z0, x1, z1) => {
  const h = WALL_STRIP / 2;
  return Math.abs(z1 - z0) < 1e-9
    ? { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: z0 - h, maxZ: z0 + h, tone: 'rock' }
    : { minX: x0 - h, maxX: x0 + h, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), tone: 'rock' };
};
// The rooms and the stairs as 'ledge', then the walls over them as 'rock' strips, the
// doorways and stair mouths left open. The secret stair is drawn like the others, but
// its library mouth, the shut bookcase's line, is drawn as wall, so the bookcase stays
// a surprise; its bedroom end is a real way down and stays open (ruling S2-7).
export function houseMapShapes() {
  const out = [];
  for (const r of HOUSE_ROOMS) out.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, tone: 'ledge' });
  for (const s of HOUSE_STAIRS) out.push({ ...stairRect(s), tone: 'ledge' });
  for (const q of houseSections()) if (q.kind !== 'lintel') out.push(strip(q.x0, q.z0, q.x1, q.z1));
  const b = SECRET_BOOKCASE;
  out.push(strip(b.x - b.w / 2, b.z, b.x + b.w / 2, b.z));
  return out;
}

// ---- the yarn ball and the walls (D14) ----

// toy.update reads no colliders, so house life applies this after it. A step from
// (px, pz) to (x, z) that crosses a wall line anywhere but a doorway or a stair
// mouth (the secret stair's only when it is open: the shut bookcase is a wall) is
// stopped: the ball goes back to where it met the wall, STOP_IN off the line on its
// own side (and off any other wall it is then that near, in a corner). null when the
// step stays in one room or on one stair, or goes through an opening.
export const STOP_IN = 0.3;
let lines = null;
let shut = null;
function wallLines() {
  if (!lines) {
    lines = houseSections().filter((q) => q.kind !== 'lintel').map((q) => freeze({ x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1 }));
    const b = SECRET_BOOKCASE;
    shut = freeze({ x0: b.x - b.w / 2, z0: b.z, x1: b.x + b.w / 2, z1: b.z });
  }
  return lines;
}
const regionAt = (x, z) => roomAt(x, z) ?? stairAt(x, z);

// where along p->q (0..1) it meets the line a->b, or -1
function cross(px, pz, qx, qz, l) {
  const rx = qx - px, rz = qz - pz;
  const sx = l.x1 - l.x0, sz = l.z1 - l.z0;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return -1;
  const t = ((l.x0 - px) * sz - (l.z0 - pz) * sx) / den;
  const u = ((l.x0 - px) * rz - (l.z0 - pz) * rx) / den;
  return t >= 0 && t <= 1 && u >= -1e-9 && u <= 1 + 1e-9 ? t : -1;
}
// The ball's own side of a line: its unit normal pointing at p, or (p on the line)
// away from q, where the step was going.
function sideNormal(l, px, pz, qx, qz) {
  const len = Math.hypot(l.x1 - l.x0, l.z1 - l.z0);
  let nx = -(l.z1 - l.z0) / len;
  let nz = (l.x1 - l.x0) / len;
  const dp = (px - l.x0) * nx + (pz - l.z0) * nz;
  const flip = Math.abs(dp) > 1e-9 ? dp < 0 : (qx - l.x0) * nx + (qz - l.z0) * nz > 0;
  if (flip) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

export function toyStop(px, pz, x, z, { secretOpen = false } = {}) {
  if (regionAt(px, pz) === regionAt(x, z)) return null;
  const all = wallLines();
  const walls = secretOpen ? all : [...all, shut];
  let best = -1;
  let hit = null;
  for (const l of walls) {
    const t = cross(px, pz, x, z, l);
    if (t >= 0 && (best < 0 || t < best)) { best = t; hit = l; }
  }
  if (!hit) return null;
  const [nx, nz] = sideNormal(hit, px, pz, x, z);
  const out = { x: px + (x - px) * best + nx * STOP_IN, z: pz + (z - pz) * best + nz * STOP_IN };
  // in a corner: off the other wall too, on her side of it
  for (let pass = 0; pass < 2; pass++) {
    for (const l of walls) {
      if (l === hit) continue;
      const len2 = (l.x1 - l.x0) ** 2 + (l.z1 - l.z0) ** 2;
      const u = ((out.x - l.x0) * (l.x1 - l.x0) + (out.z - l.z0) * (l.z1 - l.z0)) / len2;
      if (u < 0 || u > 1) continue;
      const [mx, mz] = sideNormal(l, px, pz, x, z);
      const d = (out.x - l.x0) * mx + (out.z - l.z0) * mz;
      if (d > -STOP_IN && d < STOP_IN) {
        out.x += mx * (STOP_IN - d);
        out.z += mz * (STOP_IN - d);
      }
    }
  }
  return out;
}
