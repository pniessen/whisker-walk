// =============================================================================
// THE REEF, THE SEALAB: THE PLAN (milestone R13). Pure data and pure functions (no THREE, no clock, no Math.random): a dry research station under the
// seabed, "Tidewell Station", entered through a round hatch beside the Sunken Boat. Four rooms (the control room, the aquarium hall, the bunk room
// and galley, the observation dome) joined by two short halls and two doorways into a ring. reeflabparts.js draws from this; reeflablive.js runs the hatch;
// the tests read it. North is -z, east is +x, heights are metres over the floor (the seabed's zero). docs/superpowers/plans/2026-11-27-reef-wave2.md, R13.
//
// WHERE IT STANDS: the building's rectangle is x -0.5 to 18.5, z -39.5 to -29.5 (the plan's "about x 0 to 20, z -41 to -31", moved 2 m south and 1.5 m
// west so the wing's coral keeps its place and the dome faces the open Sandy Flats). The footprint is the building plus an apron of 2.5 m: inside the apron
// the dunes ease down to the flat floor (reefY, reefplan.js REEF_FLATS), and on and outside its edge the seabed is byte for byte what it was.
// The dome is at the Reef-facing end (the plan said "north end"; north is the bounds' edge, with nothing to look at but the rising sand).
// Nothing is dark or lonely: every room is warm, every doorway is 2.2 m wide or more, and she can walk all of it with no skills.
// =============================================================================

export const LAB_NAME = 'Tidewell Station';
export const LAB_BUILD = Object.freeze({ minX: -0.5, maxX: 18.5, minZ: -39.5, maxZ: -29.5 });
export const LAB_APRON = 2.5;
export const LAB_FOOT = Object.freeze({ minX: -3, maxX: 21, minZ: -42, maxZ: -27 }); // the building plus the apron; every edge is on a 3 m grid line of the seabed's mesh
export const LAB_FLOOR_Y = 0.45; // the floor stands this high over the seabed's zero: half-way up the dunes, so the apron around it is never steep (reefworld.test.js)
export const LAB_CEIL = 4.5; // the rooms' ceiling, metres over the floor
export const LAB_DOME_CEIL = 7; // the dome's
export const WALL_R = 0.35; // a wall collider's radius; the chain is one every WALL_STEP metres (a gap of that size cannot be walked through)
export const WALL_STEP = 0.9;

const R = (id, minX, maxX, minZ, maxZ) => Object.freeze({ id, kind: 'rect', minX, maxX, minZ, maxZ });
export const ROOMS = Object.freeze({
  control: R('control', -0.2, 10.2, -35.0, -29.8),
  bunk: R('bunk', -0.2, 7.4, -39.2, -35.0),
  aquarium: R('aquarium', 8.8, 18.2, -39.2, -35.0),
  dome: Object.freeze({ id: 'dome', kind: 'circle', x: 15.6, z: -32.4, r: 2.6 }),
  hall1: R('hall1', 10.2, 13.3, -33.6, -31.2), // the control room to the dome
  hall2: R('hall2', 7.4, 8.8, -38.2, -36.0), // the bunk room to the aquarium hall
});
export const ROOM_IDS = Object.freeze(Object.keys(ROOMS)); // also the wall mesh's material order
const inRoom = (r, x, z, m = 0) => (r.kind === 'circle' ? Math.hypot(x - r.x, z - r.z) <= r.r + m : x >= r.minX - m && x <= r.maxX + m && z >= r.minZ - m && z <= r.maxZ + m);
// The room a point is in (the rooms' wall lines belong to both sides; the first found), or null.
export const roomAt = (x, z, m = 0) => ROOM_IDS.find((id) => inRoom(ROOMS[id], x, z, m)) ?? null;
export const insideLab = (x, z, m = 0) => roomAt(x, z, m) !== null;
// The ceiling over a point (its height over the seabed's zero, as ground.ceil is): LAB_CEIL over the floor in the rooms, LAB_DOME_CEIL in the dome, Infinity elsewhere. The margin takes in the walls' thickness, so a
// camera just behind a wall is still pulled under the roof.
export const labCeilAt = (x, z) => (inRoom(ROOMS.dome, x, z, 0.4) ? LAB_FLOOR_Y + LAB_DOME_CEIL : insideLab(x, z, 0.4) ? LAB_FLOOR_Y + LAB_CEIL : Infinity);

// ---- the doorways (a gap in a wall line: the wall's chain stops at its edges) ---------------------------------------------------------------
// Each is { x, z, w, axis }: `axis` is the way the wall runs; the gap is w metres wide round (x, z).
export const DOORS = Object.freeze([
  Object.freeze({ id: 'control-bunk', x: 3.0, z: -35.0, w: 2.4, axis: 'x' }),
  Object.freeze({ id: 'aquarium-dome', x: 15.6, z: -35.0, w: 2.4, axis: 'x' }),
  Object.freeze({ id: 'control-hall1', x: 10.2, z: -32.4, w: 2.4, axis: 'z' }),
  Object.freeze({ id: 'hall1-dome', x: 13.3, z: -32.4, w: 2.4, axis: 'z' }),
  Object.freeze({ id: 'bunk-hall2', x: 7.4, z: -37.1, w: 2.2, axis: 'z' }),
  Object.freeze({ id: 'hall2-aquarium', x: 8.8, z: -37.1, w: 2.2, axis: 'z' }),
]);

// ---- the walls: straight pieces [x0, z0, x1, z1, room id(s) whose face it is, doors] ------------------------------------------------------
// The face of a piece looks toward the room it is listed for (the drawing works the side out from the room's middle). A wall between two rooms lists both.
const doorSpans = (axis, line, x0, z0, x1, z1) => DOORS.filter((d) => (d.axis === axis) && (axis === 'x' ? d.z === line && d.x >= Math.min(x0, x1) && d.x <= Math.max(x0, x1) : d.x === line && d.z >= Math.min(z0, z1) && d.z <= Math.max(z0, z1)));
export const WALL_PIECES = Object.freeze([
  // the control room
  [-0.2, -29.8, 10.2, -29.8, ['control']], [-0.2, -35.0, -0.2, -29.8, ['control']],
  [10.2, -35.0, 10.2, -29.8, ['control']],
  // the band wall (z -35): the control room's north, the bunk room's south, the aquarium hall's south
  [-0.2, -35.0, 10.2, -35.0, ['control']], [-0.2, -35.0, 7.4, -35.0, ['bunk']], [8.8, -35.0, 18.2, -35.0, ['aquarium']],
  // the bunk room
  [-0.2, -39.2, 7.4, -39.2, ['bunk']], [-0.2, -39.2, -0.2, -35.0, ['bunk']], [7.4, -39.2, 7.4, -35.0, ['bunk']],
  // the aquarium hall
  [8.8, -39.2, 18.2, -39.2, ['aquarium']], [18.2, -39.2, 18.2, -35.0, ['aquarium']], [8.8, -39.2, 8.8, -35.0, ['aquarium']],
  // the two halls
  [10.2, -33.6, 13.3, -33.6, ['hall1']], [10.2, -31.2, 13.3, -31.2, ['hall1']],
  [7.4, -38.2, 8.8, -38.2, ['hall2']], [7.4, -36.0, 8.8, -36.0, ['hall2']],
].map((p) => Object.freeze(p)));
// The outer wall, closed (no doors): the colliders keep her out of the filling between the rooms when she is outside.
const PERIMETER = Object.freeze([[-0.2, -39.2, 18.2, -39.2], [18.2, -39.2, 18.2, -29.8], [-0.2, -29.8, 18.2, -29.8], [-0.2, -39.2, -0.2, -29.8]]);

// A line of colliders from (x0, z0) to (x1, z1): both ends and one every WALL_STEP or less, skipping the doorways' gaps.
function chain(x0, z0, x1, z1, gaps = []) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / WALL_STEP - 1e-9));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    if (gaps.some((g) => (g.axis === 'x' ? Math.abs(x - g.x) : Math.abs(z - g.z)) < g.w / 2 - 1e-6)) continue;
    out.push([Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000]);
  }
  return out;
}
// Split a wall line at its doorways: pieces that END at the door edges exactly (so a door is exactly its width, never wider).
function pieces(x0, z0, x1, z1, doors) {
  const horizontal = z0 === z1;
  const a = horizontal ? x0 : z0;
  const b = horizontal ? x1 : z1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const gaps = doors.map((d) => (horizontal ? [d.x - d.w / 2, d.x + d.w / 2] : [d.z - d.w / 2, d.z + d.w / 2])).sort((p, q) => p[0] - q[0]);
  const out = [];
  let from = lo;
  for (const [g0, g1] of gaps) { if (g0 > from) out.push([from, g0]); from = Math.max(from, g1); }
  if (hi > from) out.push([from, hi]);
  return out.map(([s, e]) => (horizontal ? [s, z0, e, z0] : [x0, s, x0, e]));
}
const doorsOn = (x0, z0, x1, z1) => (z0 === z1 ? doorSpans('x', z0, x0, z0, x1, z1) : doorSpans('z', x0, x0, z0, x1, z1));

const key = (c) => `${c[0]},${c[1]}`;
// The dome's wall: a circle of colliders, open where the doorways meet it (north to the aquarium hall, west to the hall).
const DOME_DOORS = Object.freeze([{ x: 15.6, z: -35.0, w: 2.4, axis: 'x', top: true }, { x: 13.3, z: -32.4, w: 2.4, axis: 'z', west: true }]);
export function domeChain() {
  const d = ROOMS.dome;
  const n = Math.ceil((2 * Math.PI * d.r) / WALL_STEP);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = d.x + Math.cos(a) * d.r;
    const z = d.z + Math.sin(a) * d.r;
    if (z < d.z && Math.abs(x - d.x) < 1.2 - 1e-6) continue; // the doorway in the north (to the aquarium hall)
    if (x < d.x && Math.abs(z - d.z) < 1.2 - 1e-6) continue; // the doorway in the west (the hall)
    out.push([Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000]);
  }
  // the doorways' edges, exactly: the wall ends where the doorways' own walls end
  for (const [x, z] of [[14.4, -34.71], [16.8, -34.71], [13.29, -33.6], [13.29, -31.2]]) out.push([x, z]);
  return out;
}

// Every wall collider (the rooms' walls, the outer wall and the dome's ring), each a circle of WALL_R; deduplicated.
export function wallColliders() {
  const seen = new Set();
  const out = [];
  const add = (c) => { const k = key(c); if (!seen.has(k)) { seen.add(k); out.push(Object.freeze({ x: c[0], z: c[1], r: WALL_R })); } };
  for (const [x0, z0, x1, z1] of PERIMETER) for (const c of chain(x0, z0, x1, z1)) add(c);
  for (const [x0, z0, x1, z1] of WALL_PIECES) for (const [a, b, c, d] of pieces(x0, z0, x1, z1, doorsOn(x0, z0, x1, z1))) for (const q of chain(a, b, c, d)) add(q);
  for (const c of domeChain()) add(c);
  return out;
}

// ---- the furniture (every one small circles; the same list the drawing reads) ----------------------------------------------------------------------
// [x, z, r]. The control room's chart table, the bunk room's bunks, counter, table and record-player cabinet, the aquarium hall's three tanks.
const CIRCLES = (list) => list.map(([x, z, r]) => Object.freeze({ x, z, r }));
export const PROP_COLLIDERS = Object.freeze(CIRCLES([
  [3.8, -32.6, 0.55], [4.6, -32.6, 0.55], [5.4, -32.6, 0.55], // the big chart table
  [1.1, -38.5, 0.5], [1.9, -38.5, 0.5], [3.0, -38.5, 0.5], [3.8, -38.5, 0.5], // two double bunks along the north wall
  [5.0, -38.85, 0.45], [5.8, -38.85, 0.45], [6.6, -38.85, 0.45], // the galley counter
  [5.4, -36.0, 0.5], // the galley table
  [0.55, -35.9, 0.4], // the record player's cabinet
  [9.7, -38.7, 0.45], [10.6, -38.7, 0.45], [11.5, -38.7, 0.45], // the aquarium hall's three tanks
  [12.6, -38.7, 0.45], [13.5, -38.7, 0.45], [14.4, -38.7, 0.45],
  [15.5, -38.7, 0.45], [16.4, -38.7, 0.45], [17.3, -38.7, 0.45],
]));
// The hatch's collar on the seabed is solid too (a cat walks round it to the prompt).
export const HATCH_COLLIDER = Object.freeze({ x: -27.6, z: -32.0, r: 0.8 });
export const labColliders = () => [...wallColliders(), ...PROP_COLLIDERS, HATCH_COLLIDER];

// ---- the hatch ---------------------------------------------------------------------------------------------------------------------------------
// OUTSIDE: a round ring set in the seabed 3 m east of the Sunken Boat's hull, a short ladder going down (a prop). Standing within `reach` of its middle offers
// "Climb down"; she comes up again at `landing`, 2 m from the ring. INSIDE: a ladder up on the control room's west wall; standing within `reach` of `exit`
// offers "Climb up"; she arrives at `arrive`, 1.6 m from it.
export const HATCH = Object.freeze({
  outside: Object.freeze({ x: -27.6, z: -32.0, r: 0.9, reach: 1.7, landing: Object.freeze({ x: -26.0, z: -33.2 }) }),
  inside: Object.freeze({ ladder: Object.freeze({ x: -0.2, z: -31.6 }), exit: Object.freeze({ x: 0.9, z: -31.6 }), reach: 1.3, arrive: Object.freeze({ x: 2.4, z: -32.2 }) }),
});

// ---- data for the milestones after this one (drawn, but nothing runs on them yet) --------------------------------------------------------------------
// The three empty fuse sockets on the control room's panel wall (R14 puts the fuses in them), and the aquarium hall's three big tanks (R14 puts creatures in).
export const FUSE_SOCKETS = Object.freeze([6.3, 7.3, 8.3].map((x, i) => Object.freeze({ id: i, x, y: 1.37, z: -30.0 })));
export const TANKS = Object.freeze([10.6, 13.5, 16.4].map((x, i) => Object.freeze({ id: i, x, z: -38.85, w: 2.5, d: 0.7, h: 2.4 })));
export const DOME_BENCH = Object.freeze({ x: 15.6, z: -31.2 }); // where she stands to sit by the dome's bench (a place for the light show to come)
export const BUNK_SPOT = Object.freeze({ x: 2.4, z: -37.1 }); // an open spot of the bunk room's floor (the golden mouse's place, R14)

// ---- the fuses (R14) -----------------------------------------------------------------------------------------------------------------------------
// Three loose fuses, found where they lie and carried to the panel in the control room in any order: one in the bunk room, one in the aquarium hall, one
// on the open sand west of the hatch (6.6 m from the ring, so the hatch's offer and the fuse's never share a spot). `inside`: its home is under the roof.
export const FUSE_SPOTS = Object.freeze([
  Object.freeze({ id: 0, x: 6.6, z: -36.9, inside: true, room: 'bunk' }),
  Object.freeze({ id: 1, x: 12.0, z: -36.6, inside: true, room: 'aquarium' }),
  Object.freeze({ id: 2, x: -20.5, z: -35.0, inside: false, room: null }),
]);
export const FUSE_REACH = 1.5;
export const PANEL = Object.freeze({ x: 7.3, z: -31.4, reach: 2.2 }); // where she stands to put a fuse in (the sockets are 1.4 m north)

// ---- the aquarium's fish (a pure pose for fish i of a tank at time t: a slow glide back and forth, turning at the ends) ---------------------------------
export const FISH_PER_TANK = 3;
const fract = (v) => v - Math.floor(v);
export function fishAt(tank, i, t, out = {}) {
  const k = tank.id * FISH_PER_TANK + i;
  const speed = 0.28 + 0.07 * (k % 4);
  const ph = fract(Math.sin((k + 1) * 12.9898) * 43758.5453) * Math.PI * 2;
  const a = t * speed + ph;
  const half = tank.w / 2 - 0.4;
  out.x = tank.x + Math.sin(a) * half;
  out.y = 1.05 + 0.18 * i + 0.07 * Math.sin(a * 1.7 + k); // over the floor; the tank's sand is at 0.9 and its glass runs to 1.7
  out.z = tank.z + (i - 1) * 0.16;
  out.dir = Math.cos(a) >= 0 ? 1 : -1; // +1 swimming toward +x
  return out;
}

// ---- the shy shark (a pure pose: a slow loop on the sea side of the dome's glass; when she is outside and near it keeps away) ----------------------------
// Offsets over the seabed (the live adds reefY). It never comes nearer than x 21.5, so it is never in the building; a cat outside within SHY.r pushes it off
// by up to SHY.push metres and it rises a little. It is never fast and never turns on her.
export const SHARK = Object.freeze({ cx: 26, cz: -31, rx: 5, rz: 7, y: 2.3, period: 80, spots: 7 });
export const SHY = Object.freeze({ r: 9, ease: 4, push: 6, rise: 0.9, minX: 21.5 });
const smooth01 = (v) => { const t = Math.min(1, Math.max(0, v)); return t * t * (3 - 2 * t); };
export function sharkAt(t, cat = null, out = {}) {
  const a = (t * Math.PI * 2) / SHARK.period;
  let x = SHARK.cx + SHARK.rx * Math.cos(a);
  let z = SHARK.cz + SHARK.rz * Math.sin(a);
  let y = SHARK.y + 0.3 * Math.sin(a * 3);
  let hx = -SHARK.rx * Math.sin(a);
  let hz = SHARK.rz * Math.cos(a);
  if (cat && !insideLab(cat.x, cat.z, 1.0)) {
    const d = Math.hypot(x - cat.x, z - cat.z);
    const f = smooth01((SHY.r - d) / SHY.ease);
    if (f > 0 && d > 1e-6) {
      x += ((x - cat.x) / d) * f * SHY.push; z += ((z - cat.z) / d) * f * SHY.push; y += f * SHY.rise;
      if (x < SHY.minX) { z += (z >= cat.z ? 1 : -1) * (SHY.minX - x); x = SHY.minX; } // the wall of the building is in the way: what is left of the push goes sideways
    }
  }
  out.x = Math.max(SHY.minX, x); out.y = y; out.z = z;
  out.yaw = Math.atan2(-hz, hx); // the three.js yaw that turns +x toward the way it swims
  return out;
}

// What each room shows of itself: the rooms whose wall faces are drawn while she stands at (x, z): her own, plus any room whose doorway is within 1.8 m
// (so the room beyond a doorway shows when she is in it). The camera sits behind her; a neighbouring room's faces would stand between it and her.
export function visibleRooms(x, z) {
  const here = roomAt(x, z);
  const out = new Set(here ? [here] : []);
  for (const d of DOORS) {
    if (Math.hypot(x - d.x, z - d.z) > 1.8) continue;
    for (const [a, b] of [['control', 'bunk'], ['aquarium', 'dome'], ['control', 'hall1'], ['hall1', 'dome'], ['bunk', 'hall2'], ['hall2', 'aquarium']]) {
      if (d.id === `${a}-${b}`) { out.add(a); out.add(b); }
    }
  }
  return ROOM_IDS.filter((id) => out.has(id));
}

// The piece lists the drawing reads (the pure part of the walls).
export const wallLines = () => WALL_PIECES.flatMap(([x0, z0, x1, z1, rooms]) => pieces(x0, z0, x1, z1, doorsOn(x0, z0, x1, z1)).map(([a, b, c, d]) => ({ x0: a, z0: b, x1: c, z1: d, rooms })));

// ---- what the Reef's plan is told: the flat floor, the plants taken away, the roof ---------------------------------------------------------------------
export const labFlat = () => ({ ...LAB_FOOT, apron: LAB_APRON, y: LAB_FLOOR_Y });
export const labClears = () => [{ ...LAB_FOOT }, { minX: HATCH.outside.x - 1.8, maxX: HATCH.outside.x + 1.8, minZ: HATCH.outside.z - 1.8, maxZ: HATCH.outside.z + 1.8 }];
export const labCeilRegion = () => ({ contains: (x, z) => labCeilAt(x, z) !== Infinity, ceil: labCeilAt });

// ---- the lights (the glow mesh's blinking cells on the panel wall; a pure level for each, 0.2 to 1) -------------------------------------------------------
export const PANEL_LIGHTS = Object.freeze(Array.from({ length: 24 }, (_, i) => Object.freeze({ x: 4.4 + (i % 8) * 0.62, y: [1.12, 1.62, 2.0][Math.floor(i / 8)], z: -30.12 })));
// Whether blink cell i is up at time t (seconds): each its own rate and offset; every eighth cell is steady, so the panel is never all dark.
export const blinkLevel = (i, t) => (i % 8 === 0 || Math.sin(t * (0.9 + 0.31 * (i % 7)) + i * 1.7) > -0.15 ? 1 : 0.25);
