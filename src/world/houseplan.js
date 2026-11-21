// THE OLD HOUSE, THE PLAN (Old House step 1). The pure data of the place: its
// split levels, rooms, stairs, doorways and windows, the ground they make, the
// wall sections that sink when the camera needs the view, and the collider
// chains that stop the cat. No THREE, no randomness, no clock: the headless
// tests walk it, and house.js draws it. Sibling of roofsplan.js.
//
// x east, z south (north is -z), metres. Split levels (spec): no two rooms or
// stairs on different levels share any floor, so the cat's x, z names her level.
//
//   z -16 +--------+--------+ ...
//         | attic  |back st.| bedroom   (upstairs 2.4, attic 4.2)
//   z  -6 +--------+--------+----+
//                         main stair  (ground 0 -> upstairs 2.4, 8.4 m)
//   z   2 +-----------+----+-----+------+  kitchen [4,14] x [-8,2] --cellar
//         | library   |hall|parlour     |  stair east to the cellar (-1.8)
//   z  12 +-----------+--*-+------------+  * = spawn, front door on the south
//
// The lawn around it is ground at 0, so the camera beside the sunken cellar
// can never drop below the drawn grass (ruling H4).

import { createGround } from '../ground.js';

export const HOUSE_ID = 'house';
export const BASE_Y = -3;
export const LAWN_Y = 0;
export const WALL_H = 2.8;
export const WALL_T = 0.2;
export const STUB_H = 0.25;
export const DOOR_W = 2.0;
export const DOOR_H = 2.2;
export const SECTION_MAX = 4.0;
export const COLLIDER_R = 0.2;
export const COLLIDER_STEP = 0.25;
export const TALL_H = 1.6;
const LAWN_MARGIN = 12;

const freeze = Object.freeze;
const frozenAll = (list) => freeze(list.map((o) => freeze(o)));

export const HOUSE_LEVELS = frozenAll([
  { id: 'cellar', y: -1.8 },
  { id: 'ground', y: 0 },
  { id: 'upstairs', y: 2.4 },
  { id: 'attic', y: 4.2 },
]);

export const HOUSE_ROOMS = frozenAll([
  { id: 'hall', level: 'ground', minX: -4, maxX: 4, minZ: 2, maxZ: 12 },
  { id: 'library', level: 'ground', minX: -14, maxX: -4, minZ: 2, maxZ: 12 },
  { id: 'parlour', level: 'ground', minX: 4, maxX: 14, minZ: 2, maxZ: 12 },
  { id: 'kitchen', level: 'ground', minX: 4, maxX: 14, minZ: -8, maxZ: 2 },
  { id: 'bedroom', level: 'upstairs', minX: -8, maxX: 2, minZ: -16, maxZ: -6.4 },
  { id: 'attic', level: 'attic', minX: -24, maxX: -14, minZ: -16, maxZ: -6 },
  { id: 'cellar', level: 'cellar', minX: 20, maxX: 30, minZ: -10, maxZ: 0 },
]);

export const HOUSE_STAIRS = frozenAll([
  { id: 'main', from: 'ground', to: 'upstairs', x0: 0, z0: 2, x1: 0, z1: -6.4, width: 3.0 },
  { id: 'back', from: 'upstairs', to: 'attic', x0: -8, z0: -11, x1: -14, z1: -11, width: 2.4 },
  { id: 'cellar', from: 'ground', to: 'cellar', x0: 14, z0: -5, x1: 20, z1: -5, width: 2.4 },
  // step 2 (ruling D9): the hidden passage, from behind the library's shut bookcase up through
  // the courtyard to the bedroom, 5 m from the back stair's foot. 2.4 m over 8.4 m (0.286).
  { id: 'secret', from: 'ground', to: 'upstairs', x0: -6, z0: 2, x1: -6, z1: -6.4, width: 2.4 },
]);

export const LEVEL_LINKS = freeze(HOUSE_STAIRS.map((s) => freeze([s.from, s.to])));

// `axis` is the wall line's fixed coordinate: 'x' means the wall runs along z at x.
export const HOUSE_DOORWAYS = frozenAll([
  { id: 'hall-library', rooms: freeze(['hall', 'library']), x: -4, z: 7, axis: 'x', width: DOOR_W },
  { id: 'hall-parlour', rooms: freeze(['hall', 'parlour']), x: 4, z: 7, axis: 'x', width: DOOR_W },
  { id: 'parlour-kitchen', rooms: freeze(['parlour', 'kitchen']), x: 9, z: 2, axis: 'z', width: DOOR_W },
]);

// `at` is the window's centre along its wall (x for n and s, z for e and w).
const win = (room, side, at, width = 1.2, sill = 0.9, head = 2.0, round = false) => ({ room, side, at, width, sill, head, round });
export const HOUSE_WINDOWS = frozenAll([
  win('hall', 's', -2), win('hall', 's', 2),
  win('library', 'w', 3.7), win('library', 'w', 10.3),
  win('parlour', 's', 5.7), win('parlour', 's', 12.3),
  win('kitchen', 'n', 5.7), win('kitchen', 'n', 12.3),
  win('bedroom', 'n', -3),
  win('attic', 'w', -11, 1.0, 1.2, 2.2, true),
  win('cellar', 'e', -5, 0.8, 1.6, 2.1),
]);

export const HOUSE_BOUNDS = freeze({ minX: -24, maxX: 30, minZ: -16, maxZ: 12 });

// ---- the secret bookcase (step 2, ruling D9) ----

// A bookcase stands shut in the secret stair's mouth in the library's north wall: its
// leaf spans the opening, x [-7.2, -4.8], centred on the wall line, books facing the
// library. It swings a quarter turn on its west hinge into the library (a vertical
// hinge at the opening's west jamb), standing open along z from 2 to 4.4, books
// facing west. In three.js terms the open leaf is the shut one turned by rotation.y
// = -PI/2 about the hinge (+x to +z). openS: the swing's seconds; reach and holdS:
// she opens it by staying within reach of it for holdS, from either side (house life).
export const SECRET_BOOKCASE = freeze({ x: -6, z: 2, w: 2.4, d: 0.42, h: 2.25, hinge: freeze({ x: -7.2, z: 2 }), openS: 1.2, reach: 1.1, holdS: 0.6 });
export const SECRET_OPEN_ROT_Y = -Math.PI / 2;

// The bookcase's colliders, shut or open: COLLIDER_R circles every COLLIDER_STEP (or
// less) down the leaf's centreline from the hinge, on the ground level, tagged
// `secret` so the walk can swap one row for the other. houseColliders carries the shut row.
export function secretColliders(open) {
  const b = SECRET_BOOKCASE;
  const ux = open ? 0 : 1;
  const uz = open ? 1 : 0;
  const n = Math.max(1, Math.ceil(b.w / COLLIDER_STEP - 1e-9));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = (b.w * i) / n;
    out.push({ x: b.hinge.x + ux * t, z: b.hinge.z + uz * t, r: COLLIDER_R, level: 'ground', secret: true });
  }
  return out;
}

// The shut front door on the hall's south wall, and where she lands coming in
// (yaw 0 faces -z). Data only in step 1; step 4 opens it.
export const HOUSE_FRONT_DOOR = freeze({
  x: 0,
  z: 12,
  faces: 'south',
  arrive: freeze({ x: 0, z: 9.5, yaw: 0 }),
});
export const HOUSE_SPAWN = freeze({ x: HOUSE_FRONT_DOOR.arrive.x, z: HOUSE_FRONT_DOOR.arrive.z });
// Where her kitten (Mochi, kitten stage 2) wanders, a 3 m circle round it
// (kitten.js): the hall's middle. Round the spawn, by the front door, the
// circle would cross the shut door and the hall lamp.
export const HOUSE_KITTEN_HOME = freeze({ x: 0, z: 7.5 });

const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const roomById = (id) => HOUSE_ROOMS.find((r) => r.id === id);

// ---- lamps ----

// One lamp per room, two in the cellar, clear of the doors and stairs. At dusk
// the walk paints a pool round each on its floor (render/dusk.js createLampPools,
// LAMP_LOOK.poolRadius 3.4 m, a radius), cut to its own room at the walls' inner
// faces (house.js lampPoolClip), so no light spills onto the lawn or the next
// room. house.js draws them; their colliders are in houseColliders.
export const HOUSE_LAMPS = frozenAll([
  { room: 'hall', kind: 'table', x: -2.9, z: 10.6 },
  { room: 'library', kind: 'standard', x: -12.4, z: 3.6 },
  { room: 'parlour', kind: 'standard', x: 12.4, z: 10.4 },
  { room: 'kitchen', kind: 'table', x: 5.6, z: 0.4 },
  { room: 'bedroom', kind: 'standard', x: -1.5, z: -10.0 },
  { room: 'attic', kind: 'lantern', x: -18.0, z: -9.6 },
  { room: 'cellar', kind: 'lantern', x: 21.6, z: -1.6 },
  { room: 'cellar', kind: 'lantern', x: 28.4, z: -8.4 },
]);
export const LAMP_R = 0.22; // a lamp's collider

// ---- furniture ----

// Warm, old, cosy furniture (house.js draws it from houseparts.js). Each piece:
// its room and level, its kind, the centre of its footprint (x, z), rotY (its
// front is local +z turned by rotY: 0 faces south, PI north, PI/2 east, -PI/2
// west), the footprint w (across its front) by d (deep), its height h, and r, the
// radius of its colliders (a row of them down its long side), or 0 for anything
// walked over (rugs, the runner, cobwebs). A piece TALL_H or taller stands with
// its back to a wall, never in front of a window, and fades (ruling H8).
// Footprints keep clear of every doorway, stair mouth and the front door's
// arrival spot (houseplan.test.js walks them).
const FACE_S = 0; // faces south: back to a north wall
const FACE_N = Math.PI; // faces north: back to a south wall
const FACE_E = Math.PI / 2; // faces east: back to a west wall
const FACE_W = -Math.PI / 2; // faces west: back to an east wall
const piece = (id, room, kind, x, z, rotY, w, d, h, r, look = null) => ({ id, room, level: roomById(room).level, kind, x, z, rotY, w, d, h, r, look });
const WEB = 0.55; // a cobweb's arms along each wall from its corner
export const HOUSE_FURNITURE = frozenAll([
  // the hall: a grandfather clock by the stair, a console table, a settle, umbrellas by the door, a runner
  piece('hall-clock', 'hall', 'clock', -2.9, 2.27, FACE_S, 0.56, 0.34, 2.1, 0.3),
  piece('hall-console', 'hall', 'console', -3.71, 4.2, FACE_E, 1.2, 0.38, 0.8, 0.19),
  piece('hall-bench', 'hall', 'bench', 3.69, 9.6, FACE_W, 1.4, 0.42, 0.9, 0.21),
  piece('hall-umbrellas', 'hall', 'umbrellas', 1.0, 11.75, FACE_N, 0.3, 0.3, 0.85, 0.15),
  piece('hall-runner', 'hall', 'runner', 0, 6.9, FACE_S, 1.1, 8.6, 0.012, 0, 'rugBlue'),
  // the library: three bookcases, a rolling ladder at one, a wing chair, a desk, a globe, a rug
  piece('library-books-w', 'library', 'bookcase', -13.69, 7.0, FACE_E, 2.2, 0.42, 2.25, 0.21),
  piece('library-books-n1', 'library', 'bookcase', -12.4, 2.31, FACE_S, 2.2, 0.42, 2.25, 0.21),
  piece('library-books-n2', 'library', 'bookcase', -9.3, 2.31, FACE_S, 2.2, 0.42, 2.25, 0.21),
  piece('library-ladder', 'library', 'ladder', -8.8, 2.77, FACE_S, 0.5, 0.5, 2.05, 0.15),
  piece('library-chair', 'library', 'armchair', -11.6, 5.0, 0.92, 0.85, 0.85, 1.05, 0.42, 'library'),
  piece('library-desk', 'library', 'desk', -9.0, 11.55, FACE_N, 1.4, 0.7, 0.8, 0.35),
  piece('library-globe', 'library', 'globe', -5.2, 10.9, 0.4, 0.55, 0.55, 1.0, 0.26),
  piece('library-rug', 'library', 'rug', -9.2, 7.2, FACE_S, 3.6, 2.6, 0.012, 0, 'rugRed'),
  // the kitchen: counters, a sink and a range on the north wall, a plate dresser, a table and two chairs
  piece('kitchen-sink', 'kitchen', 'sink', 5.7, -7.6, FACE_S, 1.1, 0.6, 1.05, 0.3),
  piece('kitchen-counter-a', 'kitchen', 'counter', 7.45, -7.6, FACE_S, 2.4, 0.6, 0.92, 0.3, 'a'),
  piece('kitchen-range', 'kitchen', 'range', 9.25, -7.6, FACE_S, 1.2, 0.6, 1.0, 0.3),
  piece('kitchen-counter-b', 'kitchen', 'counter', 10.9, -7.6, FACE_S, 2.1, 0.6, 0.92, 0.3, 'b'),
  piece('kitchen-dresser', 'kitchen', 'dresser', 4.33, -3.2, FACE_E, 1.6, 0.46, 2.05, 0.23),
  piece('kitchen-table', 'kitchen', 'table', 9.0, -3.2, FACE_S, 1.5, 0.9, 0.76, 0.45),
  piece('kitchen-chair-a', 'kitchen', 'chair', 8.6, -4.0, FACE_S, 0.45, 0.45, 0.95, 0.23),
  piece('kitchen-chair-b', 'kitchen', 'chair', 9.4, -2.4, FACE_N, 0.45, 0.45, 0.95, 0.23),
  // the parlour: the fireplace on the east wall, two armchairs at it, a side table, the piano, a rug
  piece('parlour-fire', 'parlour', 'fireplace', 13.5, 7.0, FACE_W, 1.9, 0.8, 1.3, 0.28),
  piece('parlour-chair-a', 'parlour', 'armchair', 11.0, 5.5, 1.03, 0.85, 0.85, 1.05, 0.42, 'parlour'),
  piece('parlour-chair-b', 'parlour', 'armchair', 11.0, 8.5, 2.11, 0.85, 0.85, 1.05, 0.42, 'parlour'),
  piece('parlour-sidetable', 'parlour', 'sidetable', 10.5, 7.0, 0, 0.5, 0.5, 0.62, 0.25),
  piece('parlour-piano', 'parlour', 'piano', 8.7, 11.6, FACE_N, 1.5, 0.6, 1.3, 0.3),
  piece('parlour-rug', 'parlour', 'rug', 11.2, 7.0, FACE_S, 2.4, 3.2, 0.012, 0, 'rugRed'),
  // the bedroom: a big bed, a wardrobe, a chest of drawers, a bedside table, a rug
  piece('bedroom-bed', 'bedroom', 'bed', 0.85, -12.0, FACE_W, 1.6, 2.1, 1.1, 0.75),
  piece('bedroom-bedside', 'bedroom', 'bedside', 1.62, -13.25, FACE_W, 0.45, 0.45, 0.62, 0.22),
  piece('bedroom-wardrobe', 'bedroom', 'wardrobe', -6.4, -15.6, FACE_S, 1.3, 0.6, 2.05, 0.3),
  piece('bedroom-drawers', 'bedroom', 'drawers', -0.6, -15.65, FACE_S, 1.1, 0.5, 0.95, 0.25),
  piece('bedroom-rug', 'bedroom', 'rug', -2.6, -12.0, FACE_S, 2.4, 2.0, 0.012, 0, 'rugBlue'),
  // the attic: boxes stacked no higher than 1.4 m, an old trunk, an old rocking chair, a rug
  piece('attic-boxes-a', 'attic', 'boxes', -15.0, -15.3, FACE_S, 1.6, 1.0, 1.35, 0.5),
  piece('attic-boxes-b', 'attic', 'boxes', -23.2, -7.0, FACE_N, 1.2, 1.4, 1.1, 0.55),
  piece('attic-trunk', 'attic', 'trunk', -19.8, -15.58, FACE_S, 1.1, 0.64, 0.62, 0.32),
  piece('attic-chair', 'attic', 'chair', -21.9, -12.6, 1.2, 0.5, 0.7, 0.95, 0.3, 'rocking'),
  piece('attic-rug', 'attic', 'rug', -19.5, -12.2, FACE_S, 2.4, 1.8, 0.012, 0, 'rugBlue'),
  // the cellar: jar shelves, barrels, crates and cobwebs in its corners
  piece('cellar-shelf-a', 'cellar', 'jarshelf', 23.2, -9.68, FACE_S, 1.8, 0.44, 1.9, 0.22),
  piece('cellar-shelf-b', 'cellar', 'jarshelf', 25.6, -9.68, FACE_S, 1.8, 0.44, 1.9, 0.22),
  piece('cellar-barrels', 'cellar', 'barrels', 24.6, -0.52, FACE_N, 2.3, 0.84, 0.95, 0.4),
  piece('cellar-crates', 'cellar', 'crates', 28.95, -0.85, FACE_N, 1.5, 1.3, 1.25, 0.6),
  piece('cellar-web-nw', 'cellar', 'cobweb', 20.1 + WEB / 2, -9.9 + WEB / 2, 0, WEB, WEB, 0.5, 0),
  piece('cellar-web-ne', 'cellar', 'cobweb', 29.9 - WEB / 2, -9.9 + WEB / 2, -Math.PI / 2, WEB, WEB, 0.5, 0),
  piece('cellar-web-se', 'cellar', 'cobweb', 29.9 - WEB / 2, -0.1 - WEB / 2, Math.PI, WEB, WEB, 0.5, 0),
  piece('cellar-web-sw', 'cellar', 'cobweb', 20.1 + WEB / 2, -0.1 - WEB / 2, Math.PI / 2, WEB, WEB, 0.5, 0),
]);

// A piece's colliders: circles of its r down the middle of its long side, no
// further apart than r, the end ones r in from its ends (one circle if it is short).
function furnitureColliders(f) {
  if (!(f.r > 0)) return [];
  const wide = f.w >= f.d;
  const len = wide ? f.w : f.d;
  const ax = wide ? Math.cos(f.rotY) : Math.sin(f.rotY);
  const az = wide ? -Math.sin(f.rotY) : Math.cos(f.rotY);
  const half = Math.max(0, len / 2 - f.r);
  const n = half > 1e-9 ? Math.ceil((2 * half) / f.r - 1e-9) : 0;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : -half + (2 * half * i) / n;
    out.push({ x: f.x + ax * t, z: f.z + az * t, r: f.r, level: f.level });
  }
  return out;
}

// ---- ground ----

// outer minus holes, as non-overlapping rectangles: cut on the holes' edge
// coordinates, keep each cell no hole covers, and join a row's neighbours.
function rectMinus(outer, holes) {
  const xs = [...new Set([outer.minX, outer.maxX, ...holes.flatMap((h) => [h.minX, h.maxX])])]
    .filter((v) => v >= outer.minX && v <= outer.maxX).sort((a, b) => a - b);
  const zs = [...new Set([outer.minZ, outer.maxZ, ...holes.flatMap((h) => [h.minZ, h.maxZ])])]
    .filter((v) => v >= outer.minZ && v <= outer.maxZ).sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    let run = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2;
      const mz = (zs[j] + zs[j + 1]) / 2;
      const covered = holes.some((h) => mx > h.minX && mx < h.maxX && mz > h.minZ && mz < h.maxZ);
      if (covered) {
        if (run) out.push(run);
        run = null;
      } else if (run) run.maxX = xs[i + 1];
      else run = { minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] };
    }
    if (run) out.push(run);
  }
  return out;
}

// A stair as its axis-aligned rectangle (the centreline, +- width/2 across it).
function stairRect(s) {
  const hw = s.width / 2;
  return stairAlongZ(s)
    ? { minX: s.x0 - hw, maxX: s.x0 + hw, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) }
    : { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - hw, maxZ: s.z0 + hw };
}
const stairAlongZ = (s) => Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0);

export function houseGroundSpec() {
  const strips = [];
  for (const r of HOUSE_ROOMS) {
    strips.push({ x0: r.minX, z0: (r.minZ + r.maxZ) / 2, x1: r.maxX, z1: (r.minZ + r.maxZ) / 2, width: r.maxZ - r.minZ, y: levelY(r.level) });
  }
  for (const s of HOUSE_STAIRS) {
    strips.push({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, width: s.width, y0: levelY(s.from), y1: levelY(s.to) });
  }
  const outer = {
    minX: HOUSE_BOUNDS.minX - LAWN_MARGIN, maxX: HOUSE_BOUNDS.maxX + LAWN_MARGIN,
    minZ: HOUSE_BOUNDS.minZ - LAWN_MARGIN, maxZ: HOUSE_BOUNDS.maxZ + LAWN_MARGIN,
  };
  // the lawn is cut out where the ground drops: the cellar and the stair down to it
  const holes = [roomById('cellar'), stairRect(HOUSE_STAIRS.find((s) => s.to === 'cellar'))];
  for (const r of rectMinus(outer, holes)) {
    const z = (r.minZ + r.maxZ) / 2;
    strips.push({ x0: r.minX, z0: z, x1: r.maxX, z1: z, width: r.maxZ - r.minZ, y: LAWN_Y });
  }
  strips.push(...wallFeet());
  return { base: BASE_Y, strips, discs: [], ceilings: [] };
}

// Under every wall of a raised room or stair, its floor's ground reaches WALL_FOOT past the
// wall's line (Task 6). Why: the camera's rock rule (camzoom.js cameraClearFraction) stops a low
// camera, coming from the lawn, where raised ground starts. Ending at the wall's line, that left
// the camera inside the outer half of the wall and its skirt (the kitchen looking at the
// bedroom). From WALL_FOOT out the camera stops clear of the wall's box and the house's 0.1 m
// camera pad. Only the camera meets these strips: the walls' colliders keep her centre 0.53 m
// from their lines, and a stair's side follows its slope and stops at its ends, so every
// mouth keeps its own ramp. So ground.y reads the upper floor's height within WALL_FOOT of a
// raised wall's low side (on the lawn beside it): harmless, as nothing walks there.
export const WALL_FOOT = 0.3;
function wallFeet() {
  const out = [];
  for (const s of houseSections()) {
    if (s.kind === 'lintel') continue;
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const ux = (s.x1 - s.x0) / len;
    const uz = (s.z1 - s.z0) / len;
    if (s.kind === 'wall') {
      if (!(s.base > LAWN_Y + 1e-9)) continue;
      // past each end too, to cover its corners
      out.push({ x0: s.x0 - ux * WALL_FOOT, z0: s.z0 - uz * WALL_FOOT, x1: s.x1 + ux * WALL_FOOT, z1: s.z1 + uz * WALL_FOOT, width: 2 * WALL_FOOT, y: s.base });
      continue;
    }
    if (s.kind !== 'stair') continue; // only walls and stair sides get a foot (step 2's attic beams hang overhead)
    // a stair's side: its slope along it (no further, so the stair's own mouths keep their ramp)
    const st = HOUSE_STAIRS.find((q) => q.id === s.owner);
    const sl = Math.hypot(st.x1 - st.x0, st.z1 - st.z0);
    const at = (x, z) => ((x - st.x0) * (st.x1 - st.x0) + (z - st.z0) * (st.z1 - st.z0)) / (sl * sl);
    const ya = levelY(st.from) + (levelY(st.to) - levelY(st.from)) * at(s.x0, s.z0);
    const yb = levelY(st.from) + (levelY(st.to) - levelY(st.from)) * at(s.x1, s.z1);
    if (!(Math.max(ya, yb) > LAWN_Y + 1e-9)) continue;
    out.push({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, width: 2 * WALL_FOOT, y0: ya, y1: yb });
  }
  return out;
}

// ---- lookups ----

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
export function roomAt(x, z) {
  for (const r of HOUSE_ROOMS) if (inRect(r, x, z)) return r.id;
  return null;
}
export function stairAt(x, z) {
  for (const s of HOUSE_STAIRS) if (inRect(stairRect(s), x, z)) return s.id;
  return null;
}

// ---- the cellar's lid (owner's fix B) ----

// The cellar is sunk beside the house (split levels: no room above another), so
// from outside it read as a walled pit in the garden. A turf lid covers it and its
// stair: a flat one on the cellar's wall tops (1.0 m over the lawn) and a lean-to
// down the stair's wall tops from the kitchen's outside face. It is not ground
// (the lawn's hole and the walls' colliders stay as they were) and it is never in
// the way: house life hides it while she is in the cellar or on its stair, or the
// line to her meets it (housewalls.js createCellarLid). Each piece is a slab along
// a centreline (x0, z0) -> (x1, z1), `half` wide either side, its underside rising
// linearly from y0 to y1, `thick` deep. `owner` names the sections it caps (the
// cellar's walls and its stair's); `under` is where she is "down there": the cellar's
// rectangle and its stair's, made once (underCellarLid runs every frame).
export const LID_T = 0.16;
export const LID_OVER = 0.15; // past the walls' outer faces
function cellarLid() {
  const room = roomById('cellar');
  const st = HOUSE_STAIRS.find((q) => q.to === 'cellar');
  const h = WALL_T / 2;
  const len = Math.hypot(st.x1 - st.x0, st.z1 - st.z0);
  const ux = (st.x1 - st.x0) / len;
  const uz = (st.z1 - st.z0) / len;
  // the stair walls' tops (houseparts.js stairWall): a wall's height over the flight
  const top = (d) => levelY(st.from) + (levelY(st.to) - levelY(st.from)) * Math.min(1, Math.max(0, d / len)) + WALL_H;
  const d0 = h; // the kitchen wall's outside face
  const d1 = len - h - LID_OVER; // where the cellar's flat lid begins
  const cz = (room.minZ + room.maxZ) / 2;
  const roof = levelY(room.level) + WALL_H;
  const { minX, maxX, minZ, maxZ } = room;
  return freeze({
    owner: room.id,
    under: frozenAll([{ minX, maxX, minZ, maxZ }, stairRect(st)]),
    pieces: frozenAll([
      {
        id: 'stair', x0: st.x0 + ux * d0, z0: st.z0 + uz * d0, x1: st.x0 + ux * d1, z1: st.z0 + uz * d1,
        half: st.width / 2 + h + LID_OVER, y0: top(d0), y1: top(d1), thick: LID_T,
      },
      {
        id: 'cellar', x0: room.minX - h - LID_OVER, z0: cz, x1: room.maxX + h + LID_OVER, z1: cz,
        half: (room.maxZ - room.minZ) / 2 + h + LID_OVER, y0: roof, y1: roof, thick: LID_T,
      },
    ]),
  });
}
export const HOUSE_CELLAR_LID = cellarLid();
// She is "down there" (the lid out of the way): in the cellar or on its stair. Allocates nothing.
export function underCellarLid(x, z) {
  const under = HOUSE_CELLAR_LID.under;
  for (let i = 0; i < under.length; i++) if (inRect(under[i], x, z)) return true;
  return false;
}

// ---- wall sections ----

// Cut [lo, hi] into equal pieces no longer than SECTION_MAX.
function pieces(lo, hi) {
  const n = Math.max(1, Math.ceil((hi - lo) / SECTION_MAX - 1e-9));
  const out = [];
  for (let k = 0; k < n; k++) out.push([lo + ((hi - lo) * k) / n, lo + ((hi - lo) * (k + 1)) / n]);
  return out;
}

// The solid runs left of [lo, hi] once the openings ([a, b] pairs) are taken out.
function solidRuns(lo, hi, openings) {
  const sorted = [...openings].sort((p, q) => p[0] - q[0]);
  const runs = [];
  let at = lo;
  for (const [a, b] of sorted) {
    if (a - at > 1e-9) runs.push([at, a]);
    at = Math.max(at, b);
  }
  if (hi - at > 1e-9) runs.push([at, hi]);
  return runs;
}

const EDGES = ['n', 's', 'w', 'e'];
// A room's edge: `fixed` is the wall line's coordinate, [lo, hi] runs along it.
function edgeOf(r, side) {
  if (side === 'n') return { fixed: r.minZ, run: 'x', lo: r.minX, hi: r.maxX };
  if (side === 's') return { fixed: r.maxZ, run: 'x', lo: r.minX, hi: r.maxX };
  if (side === 'w') return { fixed: r.minX, run: 'z', lo: r.minZ, hi: r.maxZ };
  return { fixed: r.maxX, run: 'z', lo: r.minZ, hi: r.maxZ };
}
// A section along an edge from `a` to `b` (coordinates along its run).
function along(edge, a, b) {
  return edge.run === 'x'
    ? { x0: a, z0: edge.fixed, x1: b, z1: edge.fixed }
    : { x0: edge.fixed, z0: a, x1: edge.fixed, z1: b };
}

// Which of the stair's two ends meets this room's edge, as an opening [a, b].
function stairOpenings(room, edge, stairs) {
  const out = [];
  for (const s of stairs) {
    const ends = [[s.x0, s.z0, s.from], [s.x1, s.z1, s.to]];
    for (const [px, pz, level] of ends) {
      if (level !== room.level) continue;
      // the stair must run across this edge, not along it
      if (edge.run === 'x' ? stairAlongZ(s) : !stairAlongZ(s)) {
        const fixedAt = edge.run === 'x' ? pz : px;
        const alongAt = edge.run === 'x' ? px : pz;
        if (Math.abs(fixedAt - edge.fixed) < 1e-9 && alongAt > edge.lo && alongAt < edge.hi) {
          out.push([alongAt - s.width / 2, alongAt + s.width / 2]);
        }
      }
    }
  }
  return out;
}

let sectionCache = null;
function buildSections(stairs) {
  const sections = [];
  const make = (o) => freeze({ window: null, ...o });
  HOUSE_ROOMS.forEach((room, ri) => {
    const y = levelY(room.level);
    for (const side of EDGES) {
      const edge = edgeOf(room, side);
      // an edge shared with an earlier room on this level is that room's to draw
      const shared = HOUSE_ROOMS.slice(0, ri).some((q) => q.level === room.level && EDGES.some((sd) => {
        const o = edgeOf(q, sd);
        return o.run === edge.run && Math.abs(o.fixed - edge.fixed) < 1e-9 && Math.min(o.hi, edge.hi) - Math.max(o.lo, edge.lo) > 1e-9;
      }));
      if (shared) continue;
      const doors = HOUSE_DOORWAYS.filter((d) => d.rooms.includes(room.id) && (edge.run === 'z' ? d.axis === 'x' && Math.abs(d.x - edge.fixed) < 1e-9 : d.axis === 'z' && Math.abs(d.z - edge.fixed) < 1e-9));
      const doorSpans = doors.map((d) => { const c = edge.run === 'z' ? d.z : d.x; return [c - d.width / 2, c + d.width / 2]; });
      const openings = [...doorSpans, ...stairOpenings(room, edge, stairs)];
      let k = 0;
      for (const [a, b] of solidRuns(edge.lo, edge.hi, openings)) {
        for (const [pa, pb] of pieces(a, b)) {
          const seg = along(edge, pa, pb);
          const probe = side === 'n' ? [(seg.x0 + seg.x1) / 2, seg.z0 - 0.5] : side === 's' ? [(seg.x0 + seg.x1) / 2, seg.z0 + 0.5]
            : side === 'w' ? [seg.x0 - 0.5, (seg.z0 + seg.z1) / 2] : [seg.x0 + 0.5, (seg.z0 + seg.z1) / 2];
          const farRoom = roomAt(probe[0], probe[1]);
          const outer = !(farRoom && roomById(farRoom).level === room.level);
          const window = HOUSE_WINDOWS.find((w) => w.room === room.id && w.side === side && w.at - w.width / 2 >= pa - 1e-9 && w.at + w.width / 2 <= pb + 1e-9) ?? null;
          sections.push(make({ id: `${room.id}-${side}-${k++}`, kind: 'wall', level: room.level, owner: room.id, side, ...seg, base: y, height: WALL_H, stub: STUB_H, outer, window }));
        }
      }
      for (const d of doors) {
        const c = edge.run === 'z' ? d.z : d.x;
        const seg = along(edge, c - d.width / 2, c + d.width / 2);
        sections.push(make({ id: `${room.id}-${side}-${k++}`, kind: 'lintel', level: room.level, owner: room.id, side, ...seg, base: y + DOOR_H, height: WALL_H - DOOR_H, stub: 0, outer: false }));
      }
    }
  });
  for (const s of stairs) {
    const y0 = levelY(s.from);
    const y1 = levelY(s.to);
    const hw = s.width / 2;
    const alongZ = stairAlongZ(s);
    // a stair named like a room (the cellar stair) gets its own id stem
    const stem = roomById(s.id) ? `${s.id}stair` : s.id;
    // the two long edges, named by the side they face
    const edges = alongZ
      ? [['w', s.x0 - hw, -1], ['e', s.x0 + hw, 1]]
      : [['n', s.z0 - hw, -1], ['s', s.z0 + hw, 1]];
    for (const [side, fixed, dir] of edges) {
      const n = Math.max(1, Math.ceil(Math.hypot(s.x1 - s.x0, s.z1 - s.z0) / SECTION_MAX - 1e-9));
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const lerp = (a, b, t) => a + (b - a) * t;
        const seg = alongZ
          ? { x0: fixed, z0: lerp(s.z0, s.z1, t0), x1: fixed, z1: lerp(s.z0, s.z1, t1) }
          : { x0: lerp(s.x0, s.x1, t0), z0: fixed, x1: lerp(s.x0, s.x1, t1), z1: fixed };
        const mx = (seg.x0 + seg.x1) / 2 + (alongZ ? dir * 0.5 : 0);
        const mz = (seg.z0 + seg.z1) / 2 + (alongZ ? 0 : dir * 0.5);
        const far = roomAt(mx, mz);
        const outer = !(far && roomById(far).level === s.from);
        sections.push(make({ id: `${stem}-${side}-${k}`, kind: 'stair', level: s.from, owner: s.id, side, ...seg, base: Math.min(y0, y1), height: Math.abs(y1 - y0) + WALL_H, stub: STUB_H, outer }));
      }
    }
  }
  return freeze(sections);
}

// The house's wall sections. `stairs` is for tests only (the walls as they would
// stand with a stair left out): any other list is built fresh, never cached.
export function houseSections(stairs = HOUSE_STAIRS) {
  if (stairs !== HOUSE_STAIRS) return buildSections(stairs);
  if (!sectionCache) sectionCache = buildSections(HOUSE_STAIRS);
  return sectionCache;
}

// ---- colliders ----

export function houseColliders() {
  const out = [];
  for (const s of houseSections()) {
    if (s.kind === 'lintel') continue;
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const n = Math.max(1, Math.ceil(len / COLLIDER_STEP - 1e-9));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ x: s.x0 + (s.x1 - s.x0) * t, z: s.z0 + (s.z1 - s.z0) * t, r: COLLIDER_R, level: s.level });
    }
  }
  for (const f of HOUSE_FURNITURE) out.push(...furnitureColliders(f));
  for (const l of HOUSE_LAMPS) out.push({ x: l.x, z: l.z, r: LAMP_R, level: roomById(l.room).level });
  out.push(...secretColliders(false)); // the bookcase shut (house life swaps in the open row)
  return out;
}

export function houseArea() {
  return {
    ground: createGround(houseGroundSpec()),
    colliders: houseColliders(),
    bounds: HOUSE_BOUNDS,
    spawn: HOUSE_SPAWN,
    levels: HOUSE_LEVELS,
    links: LEVEL_LINKS,
    rooms: HOUSE_ROOMS,
    stairs: HOUSE_STAIRS,
    sections: houseSections(),
    lid: HOUSE_CELLAR_LID,
  };
}
