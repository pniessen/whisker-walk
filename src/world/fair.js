import * as THREE from 'three';
import * as b from './builder.js';
import { createWater, PARK_POND_LOOK } from '../render/water.js';
import { addTrails, trailField } from './pathribbon.js';
import { sureClawsTreePerch } from '../climbing.js';
import { tintGround, rectDist, smoothField, smoothstep, lerp3, lin } from './dressing.js';
import { lawnMottle } from './park.js';
import { withLocalUuids } from './localuuids.js';
import { glowMaterial, GLOW_MAX, LAMP_LOOK } from './fairkit.js';
import * as parts from './fairparts.js';
import * as rides from './fairrides.js';
import * as edge from './fairedge.js';
import { STALL, STALL_SIGN, SIGN_POST, TINS, BELL, FORTUNE, BANDSTAND, PICNIC, RIDGE_TENT, FAIR_PAINT, POOL } from './fairparts.js';
import { MGR, FERRIS, TEACUPS, HELTER, COASTER, STATION, MUSIC_BOX } from './fairrides.js';
import { cutForGates } from '../gateways.js';

// =============================================================================
// The Fairground (docs/superpowers/specs/2026-11-18-fairground-design.md),
// step 1: THE PLACE. Everything stands still. The five rides are built the way
// step 2 will move them (world/fairrides.js), the three games are laid out
// with the pieces step 3 will move, and `anchors` and `rides` in the record
// below name every spot and every part those steps need.
//
// THE MAP, north up (north is -z, east is +x), on the same 120 m ground as the
// Park and the Farm:
//
//     HELTER-SKELTER                 BIG WHEEL (lookout behind)
//                                                               coaster hill
//         open field  (balloon cart)
//                                                               |
//     TEACUPS  ----------  MERRY-GO-ROUND  ----------  COASTER STATION
//                          (music box behind)                   |
//     picnic lawn                                               |
//     duck pool  --   stalls | M | stalls   tents' backs, juggler
//                     tin cans I D bell pole
//     BANDSTAND  --   stalls | W | stalls   -- FORTUNE TELLER    coaster turn
//                   candyfloss A
//                             Y
//                         FAIR GATE (spawn)
//
// NOTHING HERE CHASES OR FRIGHTENS THE CAT: no yard dog and no rival border
// (FAIR_REGISTRATION below says so in the shapes propsets.js uses).
//
// WHAT HAS A COLLIDER. The rides, the stalls, the tents, the bandstand and the
// trees. The fence, the coaster's supports, the bunting poles and the picnic
// tables have none: a cat walks under the coaster's track and between the
// pickets, and nothing can pen her in.
//
// THE DUCK POOL is real water, in `waters`, and all of it is shallow: every
// cat can wade right across it, and nobody can swim in it.
//
// REGISTERED (step 2). FAIR_REGISTRATION's rows are copied into the shared
// per-area tables (the catalog, walk.js, prop sets, golden mice, grass,
// clouds...). test/fair.test.js checks each row against the built area AND
// against the table it was copied into, so the two cannot drift.
// =============================================================================

// (beauty round two) a warmer, deeper summer field than the old mint 0x62ac50,
// so the rides' reds and yellows stand out on it
export const FAIR_GRASS = 0x5ea446;
// The midway, the plaza and the paths: warm trodden earth and sawdust
// (world/pathribbon.js SAWDUST_LOOK: scuffed patches, a darker trodden
// margin, sawdust chips and crumbs of earth).
export const FAIR_PATH_STYLE = Object.freeze({ surface: 'sand', color: 0xd3b98b, look: 'sawdust' });
export const FAIR_PATH_EXTEND = 17;
const FAIR_SAWDUST_DUSK = Object.freeze({ desat: 0.25, dark: 0.72, cool: Object.freeze([0.96, 1.0, 1.08]) });

// Just outside the gate, on the lane: the walk opens looking in under the
// fair's sign and up the midway to the merry-go-round.
export const SPAWN = Object.freeze({ x: 0, z: 47.8 });
export const FAIR_BOUNDS = Object.freeze({ minX: -44, maxX: 44, minZ: -44, maxZ: 50 });

const rect = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });
const pt = (x, z, more) => Object.freeze({ x, z, ...more });
const r2 = (v) => Math.round(v * 100) / 100;

// Where things stand. A yaw of -PI/2 turns a model's front (+z) to face west,
// PI/2 to face east.
const WEST = -Math.PI / 2;
const EAST = Math.PI / 2;
// A model's local point (lx, lz) in the world, for a model at `at` turned `yaw`.
const world = (at, yaw, lx, lz) => ({
  x: r2(at.x + lx * Math.cos(yaw) + lz * Math.sin(yaw)),
  z: r2(at.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)),
});

export const GATE_AT = pt(0, 45);
export const GATE_HALF = 3.3;
export const PLAZA = Object.freeze({ x: 0, z: 0, r: 11 });
export const MGR_AT = pt(0, 0);
export const MUSIC_BOX_AT = pt(0, -6.7);
export const FERRIS_AT = pt(0, -30);
export const TEACUPS_AT = pt(-26, 2);
export const HELTER_AT = pt(-33, -33);
export const HELTER_YAW = Math.PI / 4; // the door faces south-east, towards the plaza
export const STATION_DECK = rect(21, 23.3, -5.2, 5.2);
export const TRACK_X = 24;
export const DUCK_POOL = Object.freeze({ id: 'duckpool', kind: 'circle', x: -12.5, z: 19.5, r: 1.5, shallow: 1.6 });
export const BELL_AT = pt(5.9, 21.5);
export const FORTUNE_AT = pt(17.5, 31.5);
export const BANDSTAND_AT = pt(-25, 35);
export const BALLOON_CART_AT = pt(-10, -12);
export const FIELD = rect(-22, -7, -30, -14);
export const PICNIC_LAWN = rect(-34, -16, 11, 28);

// The stalls down the midway: west side facing east, east side facing west.
export const STALLS = Object.freeze([
  { id: 'candyfloss', sign: 'Candyfloss', x: -5.7, z: 40, yaw: EAST, top: 'tent', colors: [FAIR_PAINT.pink, FAIR_PAINT.cream], goods: 'floss' },
  { id: 'tinCans', sign: 'Tin Can Alley', x: -5.7, z: 34, yaw: EAST, top: 'flat', colors: [FAIR_PAINT.red, FAIR_PAINT.cream], goods: 'tins' },
  { id: 'prizes', sign: 'Prizes', x: -5.7, z: 26, yaw: EAST, top: 'tent', colors: [FAIR_PAINT.sky, FAIR_PAINT.cream], goods: 'prizes' },
  { id: 'toffeeApples', sign: 'Toffee Apples', x: -5.7, z: 15.5, yaw: EAST, top: 'flat', colors: [FAIR_PAINT.green, FAIR_PAINT.cream], goods: 'apples' },
  { id: 'popcorn', sign: 'Popcorn', x: 5.7, z: 40, yaw: WEST, top: 'flat', colors: [FAIR_PAINT.orange, FAIR_PAINT.cream], goods: 'popcorn' },
  { id: 'hoopla', sign: 'Hoopla', x: 5.7, z: 34.5, yaw: WEST, top: 'tent', colors: [FAIR_PAINT.red, FAIR_PAINT.yellow], goods: 'hoops' },
  { id: 'lemonade', sign: 'Lemonade', x: 5.7, z: 26.5, yaw: WEST, top: 'tent', colors: [FAIR_PAINT.purple, FAIR_PAINT.cream], goods: 'drinks' },
  { id: 'teddies', sign: 'Teddy Bears', x: 5.7, z: 16.5, yaw: WEST, top: 'tent', colors: [FAIR_PAINT.green, FAIR_PAINT.yellow], goods: 'prizes' },
].map((s) => Object.freeze({ ...s, colors: Object.freeze(s.colors) })));
const stallById = (id) => STALLS.find((s) => s.id === id);
// The three things on the midway that have no booth to hang a name on: a
// little sign on a post beside each, its board read from both sides.
// (Painted words, the same in every set of words, like the gate's.)
export const SIGN_POSTS = Object.freeze([
  Object.freeze({ id: 'hookADuck', sign: 'Hook a Duck', x: -10.2, z: 17.6, yaw: Math.PI / 2 }),
  Object.freeze({ id: 'ringTheBell', sign: 'Ring the Bell', x: 5.8, z: 22.6, yaw: -Math.PI / 2 }),
  Object.freeze({ id: 'fortunes', sign: 'Fortunes', x: 14.2, z: 33.2, yaw: -Math.PI / 2 }),
]);

// The two plain tents behind the east stalls, their doors facing east.
const RIDGE_TENTS = Object.freeze([pt(11.2, 22.9), pt(11.2, 17.5)]);
const JUGGLER_AT = pt(17, 20.5);
const PICNIC_TABLES = Object.freeze([pt(-21, 14.5, { yaw: 0 }), pt(-28.5, 20, { yaw: -0.5 }), pt(-20.5, 25, { yaw: 1.1 })]);
const BENCHES = Object.freeze([
  pt(7.3, 7.3, { yaw: -Math.PI * 0.75 }), pt(-7.3, 7.3, { yaw: Math.PI * 0.75 }), pt(-31, 27.5, { yaw: 0.64 }),
]);
// Trees: [x, z, scale, kind].
const TREES = Object.freeze([
  [-40, 41, 1.3, 'oak'], [-38, 9, 1.2, 'round'], [-41, -14, 1.25, 'oak'], [-15, -40, 1.2, 'birch'], [15, -40.5, 1.3, 'oak'],
  [31.5, -19, 1.2, 'round'], [31.5, 6, 1.3, 'oak'], [41, 40, 1.2, 'birch'], [-13, 42, 1.1, 'round'], [22, 41.5, 1.15, 'round'],
  [-32.5, 13.5, 1.15, 'round'], [34, 36.5, 1.25, 'oak'], [9.5, -25, 1.1, 'birch'], [41, -41, 1.2, 'round'],
]);
// The showmen's wagons, parked north-east of the plaza: [x, z, yaw].
const WAGONS = Object.freeze([pt(13, -18.5, { yaw: 0.55 }), pt(18.5, -12, { yaw: -0.85 })]);
const PICNIC_RUGS = Object.freeze([pt(-25, 14.6, { yaw: 0.5 }), pt(-17.6, 20.6, { yaw: -0.3 })]);
// The flower tubs: one beside each of the butterflies' corners (the lawns'
// flower patches stood on those very spots), and one by the picnic lawn.
export const FLOWER_TUBS = Object.freeze([pt(-16.4, 30.0), pt(31.9, -6.3), pt(10.5, -12.8), pt(-36, 20)]);
export const FAIR_PUDDLES = Object.freeze([pt(-39.5, -30.5, { r: 0.8 }), pt(27, -40.5, { r: 0.9 })]);
export const FAIR_HIDES = Object.freeze([
  pt(-29.5, 39.5), // under the bush behind the bandstand
  pt(15, 13.6),    // under the bush behind the tents
  pt(-36, -10.5),  // under the bush at the field's far corner
]);

// The poles the bunting and the strings of bulbs hang from: five pairs down
// the midway, and eight round the plaza.
const MIDWAY_POLE_Z = Object.freeze([43.2, 37, 30.3, 23, 13.4]);
const MIDWAY_POLE_X = 3.0;
const PLAZA_POLES = Object.freeze(Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI / 8 + (i * Math.PI) / 4;
  return pt(r2(Math.sin(a) * 11.5), r2(Math.cos(a) * 11.5));
}));
// Where the dusk pools of light fall: [x, z] under a pole top.
export const LAMP_POOLS = Object.freeze([
  ...MIDWAY_POLE_Z.map((z, i) => Object.freeze([(i % 2 ? 1 : -1) * MIDWAY_POLE_X, z])),
  ...PLAZA_POLES.map((p) => Object.freeze([p.x, p.z])),
]);
// Polish: the strings hang from 5.1 m and their pennants' tips sag no lower
// than about 4.2, so the chase camera's zoom step 2 (3.8 m up) passes under
// them instead of through a curtain of pennants and bulbs. (Tried at 5.6: no
// better at zoom 2, and at zoom 3 (6.5 m up) the strings came close enough
// under the camera to cross the whole picture.)
export const POLE_H = 5.2;

// The coaster's track: [x, y, z] the top of the rails. It leaves the station
// northwards, climbs the hill, turns at the north end, swoops down the east
// side over one hump, turns at the south end and comes home.
const COASTER_CONTROLS = Object.freeze([
  [24, 1.0, 10], [24, 1.0, 6], [24, 1.0, 0], [24, 1.0, -6], [24, 1.0, -9.5],
  [24.05, 1.25, -12.3], [24.4, 2.5, -16.5], [25.3, 4.5, -23],
  // the north turn: a quarter-circle and a bit, 6.3 m in radius, at the top of the hill
  [27.2, 6.2, -30.5], [29.05, 6.6, -34.95], [33.5, 6.5, -36.8], [37.95, 6.0, -34.95], [39.8, 5.0, -30.5],
  [39.8, 3.3, -23.5], [39, 1.8, -16],
  [38, 3.4, -7], [38.6, 1.8, 2], [39.2, 2.6, 11],
  // the south turn: half a circle, 7 m in radius
  [38.5, 3.0, 20], [36.45, 3.0, 24.95], [31.5, 2.6, 27], [26.55, 2.1, 24.95], [24.5, 1.6, 20],
  [24.1, 1.15, 15],
]);
// { points: [{ x, y, z }], length, step, closed: true }: points[i] is i * step
// metres along the track from the south end of the station.
export const COASTER_TRACK = rides.coasterTrackPoints(COASTER_CONTROLS);
// The head car stands this far along the track when the train is in the station.
export const COASTER_STATION_S = 12.4;

// The helter-skelter's numbers in the world.
const helterWorld = ([lx, y, lz]) => Object.freeze({ ...world(HELTER_AT, HELTER_YAW, lx, lz), y });
export const HELTER_STAIRS = Object.freeze(HELTER.stairs.map(helterWorld));
export const HELTER_TOP = helterWorld(HELTER.top);
// The slide's centre line, top to bottom: world points { x, y, z }.
export const HELTER_SLIDE = Object.freeze(rides.helterSlidePath(0.25).map((p) => Object.freeze({
  ...world(HELTER_AT, HELTER_YAW, p.x, p.z), y: Math.round(p.y * 1000) / 1000,
})));

// The trails: [x1, z1, x2, z2] segments by width.
export const FAIR_TRAILS = Object.freeze([
  { w: 3, segs: [[0, 50, 0, 44]] },                                    // the lane in to the gate
  { w: 5.4, segs: [[0, 44.5, 0, 10]] },                                // the midway
  { w: 22, segs: [[-0.4, 0, 0.4, 0]] },                                // the plaza
  { w: 3, segs: [[0, -10, 0, -26.6]] },                                // up to the big wheel
  { w: 2.6, segs: [[10, 0, 20, 0], [-10, 1, -20.6, 1.6]] },            // to the coaster; to the teacups
  { w: 1.8, segs: [
    [-20.2, 1.4, -24.2, -6.4], [-24.2, -6.4, -30.2, -27], [-30.2, -27, -30.6, -30.2], // round the teacups to the helter-skelter
    [-2, 19.8, -10.4, 19.6],                                           // to the duck pool
    [-2, 30, -14, 30.6], [-14, 30.6, -20.6, 34.4],                     // to the bandstand
    [2, 30.4, 13.4, 31.4],                                             // to the fortune teller
  ] },
].map((g) => Object.freeze({ w: g.w, segs: Object.freeze(g.segs.map((s) => Object.freeze(s))) })));

export const FAIR_HORIZON = Object.freeze({
  kind: 'hills', inner: 56, outer: 116, height: 7, wavelength: 36,
  color: 0x86b874, salt: 83,
  // (beauty pass) the far hills differ by side, so the country round the
  // field has depth instead of one green going on for ever: hazy blue-green
  // behind the big wheel, ripe barley gold to the east, deep summer green
  // behind the gate, olive to the west
  sideTints: Object.freeze({ north: 0x8db0a0, east: 0xb4b872, south: 0x6f9f5e, west: 0x93a46a }),
  nearColor: FAIR_GRASS,
  // The hedge runs right round, across the lane too (gateways placement
  // round, 2026-11-21: its shut field gate read as one more gate that never
  // opens, beside the real gate back to the Park).
  edge: Object.freeze({ half: 60, style: 'hedge' }),
});

// Where the lawn's tufts do not grow (for render/grass.js, once registered):
// under the rides' decks, in the booths and tents, in the pool.
const BARE_DISCS = Object.freeze([
  { ...MGR_AT, r: MGR.baseR }, { ...TEACUPS_AT, r: TEACUPS.baseR }, { ...FERRIS_AT, r: 2.2 }, { ...HELTER_AT, r: HELTER.baseR + 0.1 },
  { x: DUCK_POOL.x, z: DUCK_POOL.z, r: DUCK_POOL.r + 0.3 }, { ...BANDSTAND_AT, r: BANDSTAND.r + 0.1 }, { ...FORTUNE_AT, r: FORTUNE.r },
]);
const stallRect = (s) => rect(s.x - STALL.d / 2, s.x + STALL.d / 2, s.z - STALL.w / 2, s.z + STALL.w / 2);
const tentRect = (t) => rect(t.x - RIDGE_TENT.d / 2, t.x + RIDGE_TENT.d / 2, t.z - RIDGE_TENT.w / 2, t.z + RIDGE_TENT.w / 2);
// The ground in front of a stall's counter, from its front edge `from` to
// `to` metres out (the stalls face east or west, so this is a plain rectangle).
const stallFront = (s, from, to, wider = 0) => {
  const a = world(s, s.yaw, -STALL.w / 2 - wider, STALL.d / 2 + from);
  const c = world(s, s.yaw, STALL.w / 2 + wider, STALL.d / 2 + to);
  return rect(Math.min(a.x, c.x), Math.max(a.x, c.x), Math.min(a.z, c.z), Math.max(a.z, c.z));
};
const BARE_RECTS = Object.freeze([...STALLS.map(stallRect), ...RIDGE_TENTS.map(tentRect), STATION_DECK]);
// Trodden bare (polish): a thin strip of earth along every counter, where
// the queue stands, and a ring round the rides' and the bandstand's rims.
const TRODDEN_RECTS = Object.freeze(STALLS.map((s) => stallFront(s, 0, 0.45)));
const TRODDEN_RINGS = Object.freeze([
  { ...TEACUPS_AT, r: TEACUPS.baseR + 0.4 }, { ...HELTER_AT, r: HELTER.baseR + 0.45 },
  { ...BANDSTAND_AT, r: BANDSTAND.r + 0.35 }, { x: DUCK_POOL.x, z: DUCK_POOL.z, r: DUCK_POOL.r + 0.6 },
]);
export function fairBare(x, z) {
  for (const d of BARE_DISCS) if (Math.hypot(x - d.x, z - d.z) < d.r) return true;
  for (const d of TRODDEN_RINGS) if (Math.hypot(x - d.x, z - d.z) < d.r) return true;
  if (TRODDEN_RECTS.some((q) => rectDist(q, x, z) < 0.05)) return true;
  return BARE_RECTS.some((q) => rectDist(q, x, z) < 0.1);
}

// GROUND WEAR (polish). Where people stand and queue, the grass is trodden
// thin and browner: a ring round each ride's base and the bandstand, the
// grass between every counter and the midway, round the games, under the
// picnic tables. A multiplier towards WORN, `k` of the way at the base and
// fading out by `r1` (rings) or `pad` metres (rectangles), broken up by a
// slow field so it never reads as a drawn circle. Painted into the lawn's
// vertex colours and the tufts' tint: no triangles.
// trodden grass going to earth, as a multiplier on the lawn (the Farm's way)
const WORN = Object.freeze(((g, t) => [t[0] / g[0], t[1] / g[1], t[2] / g[2]])(lin(FAIR_GRASS), lin(0x9a8a52)));
// (a ring with `rin` is worn only from rin outwards: the plaza's sand covers the rest)
const wearRing = (p, r0, r1, k, rin = -1) => Object.freeze({ x: p.x, z: p.z, r0, r1, k, rin });
const WEAR_RINGS = Object.freeze([
  wearRing(PLAZA, PLAZA.r - 0.6, PLAZA.r + 2.2, 0.7, PLAZA.r - 2.5),           // where the plaza's sand meets the grass
  // (beauty round two: the rides' rings wider and more worn, a crowd's ground)
  wearRing(TEACUPS_AT, TEACUPS.baseR - 0.2, TEACUPS.baseR + 4.2, 1.0),
  wearRing(HELTER_AT, HELTER.baseR - 0.2, HELTER.baseR + 4.0, 1.0),
  wearRing(pt(FERRIS_AT.x, FERRIS_AT.z + 0.6), 2.6, 7.6, 0.95),
  wearRing(BANDSTAND_AT, BANDSTAND.r - 0.2, BANDSTAND.r + 2.4, 0.8),
  wearRing(FORTUNE_AT, FORTUNE.r - 0.2, FORTUNE.r + 1.6, 0.6),
  wearRing(DUCK_POOL, DUCK_POOL.r + 0.2, DUCK_POOL.r + 2.6, 0.9),
  wearRing(world(BELL_AT, WEST, 0, BELL.padZ), 0, 1.9, 0.8),
  wearRing(JUGGLER_AT, 0, 2.4, 0.65),
  wearRing(BALLOON_CART_AT, 0.4, 2.4, 0.55),
  ...PICNIC_TABLES.map((t) => wearRing(t, 0, 1.6, 0.5)),
]);
const wearRect = (q, pad, k) => Object.freeze({ q, pad, k });
const WEAR_RECTS = Object.freeze([
  ...STALLS.map((s) => wearRect(stallFront(s, 0, 1.0, 0.2), 1.0, 0.95)),       // the queue at every counter
  wearRect(rect(17.4, STATION_DECK.minX, -5.2, 5.2), 2.0, 0.95),                 // the foot of the coaster's steps
  wearRect(rect(-1.8, 1.8, FERRIS_AT.z + FERRIS.deckZ + FERRIS.deckD / 2, FERRIS_AT.z + FERRIS.deckZ + 1.6), 1.0, 0.8), // the big wheel's queue
  ...RIDGE_TENTS.map((t) => wearRect(rect(t.x + RIDGE_TENT.d / 2, t.x + RIDGE_TENT.d / 2 + 0.8, t.z - 0.8, t.z + 0.8), 1.0, 0.55)), // the tents' doors
]);
export function fairWear(x, z) {
  let w = 0;
  for (const r of WEAR_RINGS) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < r.r1 && d > r.rin) w = Math.max(w, r.k * (1 - smoothstep(r.r0, r.r1, d)) * (r.rin < 0 ? 1 : smoothstep(r.rin, r.r0, d)));
  }
  for (const r of WEAR_RECTS) {
    const d = rectDist(r.q, x, z);
    if (d < r.pad) w = Math.max(w, r.k * (1 - smoothstep(0, r.pad, d)));
  }
  if (w <= 0) return 0;
  return w * (0.78 + 0.22 * smoothField(x, z, 911, 3.2));
}
// The ground's colour, as a multiplier on the grass: the lawns' slow mottle,
// worn browner where the fair is trodden.
const fairMottle = lawnMottle(733);
export function fairGroundTint(x, z) {
  const m = fairMottle(x, z);
  const w = fairWear(x, z);
  return w > 0 ? lerp3(m, WORN, w) : m;
}

// A building is a rectangle and the collision system is circles: a row of
// circles as wide as the short side, and a smaller one tucked into each corner.
function blockRect(addC, minX, maxX, minZ, maxZ) {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const a = Math.min(w, d) / 2;
  const alongX = w >= d;
  const from = (alongX ? minX : minZ) + a;
  const to = (alongX ? maxX : maxZ) - a;
  const n = Math.max(1, Math.ceil((to - from) / a) + 1);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1);
    addC(alongX ? t : (minX + maxX) / 2, alongX ? (minZ + maxZ) / 2 : t, a);
  }
  const c = Math.min(1.3, a * 0.45);
  for (const cx of [minX + c, maxX - c]) for (const cz of [minZ + c, maxZ - c]) addC(cx, cz, c);
}

// ---- perches, as data (the chains are described at `perches` below) -----------------------
// A FIRST HOP NEEDS ROOM TO BE MADE FROM. A low perch is reached from 1.2 m,
// and a solid prop keeps the cat its own radius off: a perch in the middle of
// a deck leaves only a thin ring of ground to jump from, and a jump from
// anywhere else is a pounce at nothing. So a counter's perch is at its front
// edge, and each deck with steps has a perch ON its steps (the cat walks in
// among them), from which the deck is one more hop. test/fair.test.js
// measures the standing room of every one.
const COUNTER_PERCH_Z = 1.0; // the counter's top runs from 0.54 to 1.16
const stallPerches = (id, counterX, label) => {
  const s = stallById(id);
  return [
    Object.freeze({ ...world(s, s.yaw, counterX, COUNTER_PERCH_Z), y: STALL.counterY, kind: 'crate' }),
    Object.freeze({ x: s.x, z: s.z, y: STALL.roofY, kind: 'roof', ...(label ? { label, vantage: true } : {}) }),
  ];
};
const TIN_STALL = stallPerches('tinCans', 0);
const APPLE_STALL = stallPerches('toffeeApples', -1.05, 'the toffee apple stall’s roof');
const POPCORN_STALL = stallPerches('popcorn', -0.1);
const BANDSTAND_YAW = EAST;
// The bandstand's deck, at the top of its steps.
const BANDSTAND_DECK = Object.freeze({ ...world(BANDSTAND_AT, BANDSTAND_YAW, 0, 2.4), y: BANDSTAND.deckY, kind: 'roof', label: 'the bandstand', vantage: true });
const BANDSTAND_STEP = Object.freeze({ ...world(BANDSTAND_AT, BANDSTAND_YAW, 0, r2(BANDSTAND.r * Math.cos(Math.PI / 8) + 0.2)), y: r2(BANDSTAND.deckY * 0.66), kind: 'roof' });
const WHEEL_STEP = Object.freeze({ x: FERRIS_AT.x, z: FERRIS_AT.z + FERRIS.deckZ, y: FERRIS.deckY, kind: 'roof' });
const WHEEL_FOOT_STEP = Object.freeze({ x: FERRIS_AT.x, z: r2(FERRIS_AT.z + FERRIS.deckZ + FERRIS.deckD / 2 + 0.22), y: 0.2, kind: 'roof' });
const COASTER_PLATFORM = Object.freeze({ x: 21.6, z: 0, y: STATION.deckY, kind: 'roof', label: 'the coaster platform', vantage: true });
const COASTER_STEP = Object.freeze({ x: r2(STATION_DECK.minX - 0.25), z: 0, y: r2(STATION.deckY * 0.66), kind: 'roof' });
const HELTER_PERCHES = Object.freeze([
  ...HELTER_STAIRS.map((p) => Object.freeze({ ...p, kind: 'roof' })),
  Object.freeze({ ...HELTER_TOP, kind: 'roof', label: 'the top of the helter-skelter', vantage: true }),
]);
const TABLE_PERCHES = PICNIC_TABLES.map((t) => Object.freeze({ x: t.x, z: t.z, y: PICNIC.topY, kind: 'furniture' }));
const BENCH_PERCHES = BENCHES.map((t) => Object.freeze({ x: t.x, z: t.z, y: 0.54, kind: 'furniture' }));

// The tins on the tin-can alley's shelf, in the world: { x, y, z }.
const TIN_SPOTS = Object.freeze(TINS.places.map(([lx, row]) => {
  const s = stallById('tinCans');
  return Object.freeze({ ...world(s, s.yaw, lx, TINS.shelfZ), y: r2(TINS.shelfY + row * TINS.h) });
}));
// The rubber ducks: seven, bobbing round the pool. Three have a star underneath.
const DUCK_SPOTS = Object.freeze(Array.from({ length: 7 }, (_, i) => {
  const a = i * 2.4 + 0.5;
  const r = i === 0 ? 0.15 : 0.5 + 0.1 * ((i * 7) % 6);
  return Object.freeze({ x: r2(DUCK_POOL.x + Math.cos(a) * r), z: r2(DUCK_POOL.z + Math.sin(a) * r), yaw: r2(a * 1.7), star: i % 3 === 1 });
}));

// The visitors' stroll: up the east side of the midway, once round the plaza
// and back down the west side. A closed loop of points on open ground.
const VISITOR_LOOP = Object.freeze([
  pt(1.5, 42.5), pt(1.5, 34), pt(1.5, 25), pt(1.5, 16), pt(2.6, 9.6),
  ...Array.from({ length: 11 }, (_, i) => {
    const a = (Math.PI * 2 * (i + 1)) / 12; // from just east of south, round by the east and north
    return pt(r2(Math.sin(a) * 8.6), r2(Math.cos(a) * 8.6));
  }),
  pt(-2.6, 9.6), pt(-1.5, 16), pt(-1.5, 25), pt(-1.5, 34), pt(-1.5, 42.5),
]);
// Where a visitor stops to watch a ride.
const VISITOR_WATCH = Object.freeze([
  pt(5.4, 7), pt(-6.2, -5.6), pt(2.6, -23.5), pt(-19, 3.6), pt(18.6, 2.4), pt(-9.6, 21.4), pt(-27.5, -27.5), pt(-20.4, 37.2),
]);

// -----------------------------------------------------------------------------
// WHAT THE SHARED TABLES HOLD. Plain data in the shapes those tables use; each
// row is copied into its table, and test/fair.test.js checks every row against
// the built area and against that table.
// -----------------------------------------------------------------------------
const QUARTER = Math.PI / 2;
export const FAIR_REGISTRATION = Object.freeze({
  id: 'fair',
  // src/progression.js CATALOG.areas (and defaultState.walks.fair: 0)
  catalog: Object.freeze({ name: 'The Fairground', price: 75, requires: Object.freeze({ area: 'park', walks: 2 }) }),
  // src/goldmice.js GOLD_MICE.fair: two on perch chains, one hidden on the ground
  goldMice: Object.freeze([
    // at the top of the helter-skelter: five landings up the stairs inside, then the gallery (6 hops)
    Object.freeze({ id: 'gm-fair-1', x: HELTER_TOP.x, z: HELTER_TOP.z, y: HELTER_TOP.y }),
    // on the toffee apple stall's striped roof: counter 0.9 -> roof 2.32 (2 hops)
    Object.freeze({ id: 'gm-fair-2', x: APPLE_STALL[1].x, z: APPLE_STALL[1].z, y: APPLE_STALL[1].y }),
    // hidden at ground level between the two tents behind the stalls
    Object.freeze({ id: 'gm-fair-3', x: 11.2, z: 20.2, y: 0 }),
  ]),
  // src/propsets.js SETS.fair
  propSet: Object.freeze({
    carryables: Object.freeze([
      Object.freeze({ id: 'fair-ribbon-1', kind: 'ribbon', x: 3.6, z: -13.5 }),    // blown off a prize, by the path to the big wheel
      Object.freeze({ id: 'fair-cap-1', kind: 'cap', x: 18.4, z: 7.4 }),            // dropped by the coaster's steps
      Object.freeze({ id: 'fair-toymouse-1', kind: 'toymouse', x: -9.6, z: 23.6 }), // a prize, behind the prize stall
      Object.freeze({ id: 'fair-stick-1', kind: 'stick', x: -9.4, z: 42.2 }),       // a candyfloss stick behind the candyfloss stall
    ]),
    // On the first picnic table (top y 0.75): a drinks can at one end, a cup
    // and a book at the other, the middle clear for the perched cat. The can
    // and the cup fall off the north side past the bench, the book off the south.
    knockables: Object.freeze([
      Object.freeze({ id: 'fair-can-1', kind: 'can', x: -21.5, z: 14.5, y: PICNIC.topY, fallTo: Object.freeze({ x: -21.5, z: 13.25 }) }),
      Object.freeze({ id: 'fair-cup-1', kind: 'cup', x: -20.62, z: 14.38, y: PICNIC.topY, fallTo: Object.freeze({ x: -20.6, z: 13.2 }) }),
      Object.freeze({ id: 'fair-book-1', kind: 'book', x: -20.48, z: 14.7, y: PICNIC.topY, fallTo: Object.freeze({ x: -20.45, z: 15.85 }) }),
    ]),
    markables: Object.freeze([
      Object.freeze({ id: 'fair-post-1', kind: 'post', x: GATE_HALF, z: GATE_AT.z, nearBorder: false, mesh: false }),         // the gate's east post
      Object.freeze({ id: 'fair-tree-1', kind: 'tree', x: -37.65, z: 9, nearBorder: false, mesh: false }),                    // the tree by the picnic lawn, east face
      Object.freeze({ id: 'fair-post-2', kind: 'post', x: PLAZA_POLES[5].x, z: PLAZA_POLES[5].z, nearBorder: false, mesh: false }), // a bunting pole on the plaza's west side
    ]),
    flaps: Object.freeze([
      // A little gate across the path to the bandstand.
      Object.freeze({ id: 'fair-flap-1', kind: 'flap', x: -11.5, z: 30.5, rotY: QUARTER, width: 1.0 }),
      // A hedge across the path up to the helter-skelter.
      Object.freeze({ id: 'fair-gap-1', kind: 'gap', x: -27.2, z: -16.7, rotY: 0.2834, width: 1.2 }),
    ]),
    rests: Object.freeze([
      Object.freeze({ id: 'fair-drink-1', kind: 'drink', x: -16.4, z: 9.6, mesh: true }),  // a water bowl by the picnic lawn
      Object.freeze({ id: 'fair-eat-1', kind: 'eat', x: 9.6, z: 36.6, mesh: true }),       // a dish behind the popcorn stall
      Object.freeze({ id: 'fair-nap-1', kind: 'nap', x: -30.4, z: 31.6, mesh: true }),     // a cushion in the sun by the bandstand
    ]),
    hides: Object.freeze(FAIR_HIDES.map((h) => Object.freeze({ x: h.x, z: h.z }))),
    dogYard: null,
    keepSlots: Object.freeze([]),
  }),
  // src/rests.js REST_LOOKS
  restLooks: Object.freeze({ 'fair-drink-1': Object.freeze({ look: 'bowl' }), 'fair-eat-1': Object.freeze({ look: 'dish' }), 'fair-nap-1': Object.freeze({ look: 'cushion' }) }),
  // src/render/clouds.js CLOUD_AREAS and AREA_SKY.fair
  sky: Object.freeze({ clouds: 10, banks: 4 }),
  // src/render/ambient.js ambientKind: the same drifting seed down as the Park
  ambient: 'fluff',
  // src/render/pawprints.js AREA_RULES.fair
  pawprints: Object.freeze({ ground: null, path: 'sand', strip: null }),
  // src/render/grass.js: GRASS_STYLES.fair is the mown LAWN (as the Park) with
  // density 0 where fairBare(x, z); GRASS_HOOKS.tint is fairGroundTint.
  grass: Object.freeze({ style: 'LAWN', bare: 'fairBare', groundTint: 'fairGroundTint' }),
  // src/marks.js MARK_AREAS and emptyMarks(): add 'fair'
  marks: true,
  // not a colony area, no legendary cat, no rival disc, no dog
  colony: false,
  legendary: false,
  // step 1's proposed ceilings: [meshes, casters, triangles] built, [meshes, casters] merged
  // (test/budget.test.js holds the real ones: tighter on meshes and casters, 75,000 triangles)
  budget: Object.freeze({ built: Object.freeze([260, 185, 70000]), merged: Object.freeze([210, 150]) }),
  // verify-places.html VIEWS.fair, and the card picture public/places/fair.jpg:
  // from the top of the midway, the last stalls either side, the merry-go-round
  // under the bunting and the big wheel behind it (step 1's view, from the gate,
  // was '0,2.6,43,0,2.6,0': the rides were specks at the far end)
  view: '1.6,2.4,24,0,4.6,-8',
});

// setFairGlow(area, t): t 0 (day) to 1 (dusk). Every bulb at the fair shares
// one material, so this one number lights them all.
// THE EDGES (polish). Round its rides and out to its boundary a village fair
// has the things nobody comes to see: tall flags at the field's corners,
// bins by the paths, a queue rail at the big wheel and the teacups, hay
// bales to sit on by the bandstand and the teacups, and bales stacked out
// of the way behind the big wheel and on the west side. All of it is built
// by world/fairedge.js into the props' lists (no mesh of its own). Bins,
// bales and flag poles are solid; the queue rails are low enough for a cat
// to walk under, and the flags' strings are high overhead but at their pegs.
const C = FAIR_PAINT;
export const CORNER_FLAGS = Object.freeze([
  Object.freeze({ x: -42.5, z: -42.5, colors: [C.red, C.white], lines: [[5.5, 0], [0, 5.5]] }),
  Object.freeze({ x: 37.5, z: -42.6, colors: [C.blue, C.yellow], lines: [[-5.5, 0]] }),
  Object.freeze({ x: -35.5, z: 43.3, colors: [C.green, C.white], lines: [[-5.5, 0], [5.5, 0]] }),
  Object.freeze({ x: 42.6, z: 43.2, colors: [C.purple, C.yellow], lines: [[-5.5, 0]] }),
]);
export const FAIR_BINS = Object.freeze([pt(2.2, -19.5), pt(-13.5, 3.3), pt(14.5, 1.9), pt(-21.5, -4.4)]);
// queue rails: [x, z, yaw, length], each beside the last few metres of a ride's path
const teacupsPathYaw = Math.atan2(0.6, 10.6);
const alongTeacupsPath = (off) => world(pt(-17.6, 1.43), teacupsPathYaw, 0, off);
export const QUEUE_RAILS = Object.freeze([
  Object.freeze([-1.65, -24.4, EAST, 4]), Object.freeze([1.65, -24.4, EAST, 4]),
  Object.freeze([alongTeacupsPath(1.45).x, alongTeacupsPath(1.45).z, teacupsPathYaw, 4]),
  Object.freeze([alongTeacupsPath(-1.45).x, alongTeacupsPath(-1.45).z, teacupsPathYaw, 4]),
]);
// hay bales: single seats facing the bandstand and the teacups; stacks put by
export const BALE_SEATS = Object.freeze([
  pt(-20.4, 39.3, { yaw: 0.45 }), pt(-23.5, 40.9, { yaw: 0.12 }),
  pt(-36.6, -0.8, { yaw: EAST }), pt(-36.7, 4.6, { yaw: EAST + 0.12 }),
]);
// (beauty round two: three more out in the empty corners, put by for later)
export const BALE_STACKS = Object.freeze([pt(-40.6, -4.5, { yaw: EAST }), pt(10.8, -38.6, { yaw: 0.1 }),
  pt(38.6, 38.4, { yaw: 0.7 }), pt(-40.4, 27.5, { yaw: EAST - 0.2 }), pt(25.2, -42.2, { yaw: -0.15 })]);
// THE BACK OF THE FAIR: behind the big wheel, out of the way, the showmen's
// box lorry and living van, and the generator that runs the rides with its
// cable over the grass to the wheel's west foot.
export const LORRY_AT = pt(3.6, -40.6, { yaw: -0.08 });
export const VAN_AT = pt(-8.2, -40.0, { yaw: 0.15 });
export const GENERATOR_AT = pt(-4.6, -36.6, { yaw: 0.35 });

// a bale's (or a stack's) colliders: circles along its length
const baleCircles = (t, us) => us.map((u) => ({ ...world(t, t.yaw, u, 0), r: 0.3 }));

// THE SQUEEZE GAP (propsets' fair-gap-1, a clipped hedge with sprigs over
// its opening) used to stand alone in the open field. Now a stack of hay
// bales runs on from each end of its hedge, square to the path, so the cat
// squeezes through a gap in a row of bales. Each stack starts just past the
// hedge's last frame circle (propsets.js frameColliders: 2.1 m out from the
// middle) and is held by a row of circles along it.
const GAP = FAIR_REGISTRATION.propSet.flaps.find((f) => f.id === 'fair-gap-1');
const GAP_STACK_FROM = 2.15;
const GAP_STACK_LEN = 2 * edge.BALE.l + 0.04;
const gapAlong = (s) => ({ x: r2(GAP.x + Math.cos(GAP.rotY) * s), z: r2(GAP.z - Math.sin(GAP.rotY) * s) });
const GAP_BALES = Object.freeze([-1, 1].map((side, i) => Object.freeze({
  ...gapAlong(side * (GAP_STACK_FROM + GAP_STACK_LEN / 2)), yaw: GAP.rotY, salt: 41 + i * 5,
})));
const GAP_BALE_COLLIDERS = Object.freeze([-1, 1].flatMap((side) => [0.3, 0.75, 1.2, 1.65]
  .map((u) => Object.freeze({ ...gapAlong(side * (GAP_STACK_FROM + u)), r: 0.3 }))));

export function setFairGlow(area, t) {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  if (area?.glow?.material) area.glow.material.emissiveIntensity = GLOW_MAX * k;
  // the stalls' counters and goods, lit from inside (fairkit.js LAMP_LOOK)
  for (const m of area?.glow?.lamps ?? []) m.emissiveIntensity = LAMP_LOOK.max * k;
  if (area?.glow) area.glow.level = k;
  return k;
}

// THE FACES NOBODY SEES (polish). Every box, post and drum the fair stands
// on the ground has a bottom face lying flat on the grass, facing down: no
// camera can ever look at it. Once everything is built, these are dropped
// from the fair's own static meshes, named here. Nothing under a ride's
// turning group, the coaster's train or the games' moving pieces is named.
export const GROUND_CULL = Object.freeze([
  'fairProps', 'fairFence', 'coasterSupports', 'coasterStation', 'fortuneTableBody', 'bellBoard', 'fairGateFrame',
  'ferrisFrame', 'musicBoxBody', 'helterStairs', 'helterTrim', 'helterBrackets',
]);
const UNDER_Y = 0.03;
// Drops each triangle of the named meshes whose three corners lie below
// UNDER_Y in the world and whose face points down. Returns how many went.
export function cullGroundFaces(scene, names) {
  scene.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b2 = new THREE.Vector3();
  const c = new THREE.Vector3();
  const u = new THREE.Vector3();
  const n = new THREE.Vector3();
  let dropped = 0;
  for (const name of names) {
    const mesh = scene.getObjectByName(name);
    const g = mesh?.isMesh ? mesh.geometry : null;
    if (!g || g.index || g.groups.length) continue; // the kit's meshes are plain triangle soups
    const pos = g.attributes.position;
    const tris = pos.count / 3;
    const keep = [];
    for (let t = 0; t < tris; t++) {
      a.fromBufferAttribute(pos, t * 3).applyMatrix4(mesh.matrixWorld);
      b2.fromBufferAttribute(pos, t * 3 + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, t * 3 + 2).applyMatrix4(mesh.matrixWorld);
      n.subVectors(b2, a).cross(u.subVectors(c, a)).normalize();
      if (Math.max(a.y, b2.y, c.y) < UNDER_Y && n.y < -0.9) continue;
      keep.push(t);
    }
    if (keep.length === tris) continue;
    for (const key of Object.keys(g.attributes)) {
      const at = g.attributes[key];
      const k = at.itemSize * 3;
      const out = new at.array.constructor(keep.length * k);
      keep.forEach((t, i) => out.set(at.array.subarray(t * k, t * k + k), i * k));
      g.setAttribute(key, new THREE.BufferAttribute(out, at.itemSize, at.normalized));
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    dropped += tris - keep.length;
  }
  return dropped;
}

// THE GROUND'S BEAUTY (world/fairground.js): where its scuffs may lie. Trodden grass (fairWear) that is open: off the sawdust, the rides' rings, the buildings, the big flat things
// and the pool; none east of x = 20 (the coaster's side, and the Viking boat's).
import { groundPlan, drawGround } from './fairground.js';
function groundOpenCheck(segs) {
  const circles = [...WAGONS, FORTUNE_AT, BANDSTAND_AT, MUSIC_BOX_AT, ...PICNIC_RUGS, DUCK_POOL].map((t) => [t.x, t.z, 3.5]); // the big and the flat: a tuft keeps 3.5 m off each
  const blocks = [...STALLS.map(stallRect), ...RIDGE_TENTS.map(tentRect), STATION_DECK];
  return (x, z, m) => {
    if (x > 20 || x < -56 || Math.abs(z) > 56) return false; // (the east is the coaster's and the Viking boat's)
    if (fairBare(x, z) || fairWear(x, z) < 0.35) return false;
    for (const [cx, cz, r] of circles) if (Math.hypot(x - cx, z - cz) < r + m) return false;
    for (const q of blocks) if (rectDist(q, x, z) < m) return false;
    if (trailField(segs, x, z, 'sawdust').sd < m + 0.4) return false;
    return true;
  };
}
export function build(scene, { water = {}, wind, gateEnds = [] } = {}) {
  // A bright fair day: a clear blue over a pale horizon.
  b.applySky(scene, 0x8fcbf0, 0xe4f1e2);
  const lawn = b.ground(120, FAIR_GRASS, { surface: 'grass' });
  lawn.updateMatrix();
  tintGround(lawn, fairGroundTint);
  scene.add(lawn);
  scene.add(b.horizonBand(FAIR_HORIZON));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x: r2(x), z: r2(z), r });
  const clawPerches = [];

  const trails = addTrails(scene, FAIR_TRAILS.map((g) => ({ w: g.w, segs: g.segs })), FAIR_PATH_STYLE, 'fair',
    { waters: [DUCK_POOL], extend: FAIR_PATH_EXTEND });
  // the sawdust keeps a street's dusk tint (render/dusk.js DUSK.lawnTint), warm
  // under the lamps, while the field round it goes deeper and bluer (duskLight below)
  if (trails.mesh) trails.mesh.userData.duskLawnTint = FAIR_SAWDUST_DUSK;

  // --- the duck pool's water -------------------------------------------------------
  const pool = createWater(DUCK_POOL, {
    y: POOL.waterY,
    ...PARK_POND_LOOK,
    color: 0x6fc4e0,
    quality: water.quality ?? 'high',
    reducedMotion: water.reducedMotion ?? false,
    foamStrength: 0.1,
  });
  scene.add(pool.mesh);

  // --- everything the fair builds for itself, on a local uuid stream ---------------------
  const made = withLocalUuids('fair-models', () => {
    const glow = glowMaterial();
    const out = [];
    const K = parts.lists();

    out.push(parts.gateArch(GATE_AT.x, GATE_AT.z, GATE_HALF, glow));
    // The front fence, cut where a gate walk.js draws after the build is set
    // into it (`gateEnds`: the gate ends this walk draws; a walk that draws no
    // gates, and a bare build, keep the fence whole). Visual only:
    // the fence has no collider, so nothing anyone shares depends on it.
    parts.fence(K, cutForGates([
      { a: [-44, GATE_AT.z], b: [-GATE_HALF - 0.5, GATE_AT.z] },
      { a: [GATE_HALF + 0.5, GATE_AT.z], b: [44, GATE_AT.z] },
    ], gateEnds));
    for (const s of [-1, 1]) parts.balloonBunch(K, s * (GATE_HALF + 0.3), 3.3, GATE_AT.z + 0.15, 4, s + 3);

    // the midway's stalls
    STALLS.forEach((s, i) => parts.into(K, s.x, s.z, s.yaw, (L) => {
      parts.stall(L, { top: s.top, colors: s.colors, goods: s.goods, salt: i });
      if (s.id === 'tinCans') parts.tinCanShelf(L);
    }));
    // every painted word but the gate's: one texture, one mesh
    const signs = parts.signWriter();
    for (const s of STALLS) {
      const q = STALL_SIGN[s.top === 'flat' ? 'flat' : 'tent'];
      const at = world(s, s.yaw, 0, q.z);
      signs.add(s.sign, at.x, q.y, at.z, s.yaw, q.w, q.h);
    }
    for (const p of SIGN_POSTS) {
      parts.into(K, p.x, p.z, p.yaw, (L) => parts.signPost(L));
      for (const side of [1, -1]) {
        const at = world(p, p.yaw, 0, side * 0.04);
        signs.add(p.sign, at.x, SIGN_POST.y, at.z, p.yaw + (side > 0 ? 0 : Math.PI), SIGN_POST.w, SIGN_POST.h);
      }
    }
    out.push(signs.mesh());
    const tins = parts.tinCans(TIN_SPOTS);
    out.push(tins);
    parts.balloonBunch(K, -4.3, 2.2, 41.5, 4, 11);
    parts.balloonBunch(K, 4.3, 2.3, 38.5, 4, 17);

    // bunting and bulbs over the midway, and round the plaza
    const top = POLE_H - 0.1;
    for (const z of MIDWAY_POLE_Z) for (const s of [-1, 1]) parts.pole(K, s * MIDWAY_POLE_X, z, POLE_H);
    for (let i = 0; i < MIDWAY_POLE_Z.length - 1; i++) {
      const z0 = MIDWAY_POLE_Z[i];
      const z1 = MIDWAY_POLE_Z[i + 1];
      for (const s of [-1, 1]) parts.bunting(K.flags, [s * MIDWAY_POLE_X, top, z0], [s * MIDWAY_POLE_X, top, z1], { sag: 0.5, salt: i });
      parts.bulbString(K.bulbs, K.flags, [-MIDWAY_POLE_X, top + 0.1, z0], [MIDWAY_POLE_X, top + 0.1, z1], { sag: 0.5, salt: i });
      parts.bulbString(K.bulbs, K.flags, [MIDWAY_POLE_X, top + 0.1, z0], [-MIDWAY_POLE_X, top + 0.1, z1], { sag: 0.5, salt: i + 3 });
    }
    for (const s of [-1, 1]) parts.bunting(K.flags, [s * GATE_HALF, 4.0, GATE_AT.z], [s * MIDWAY_POLE_X, top, MIDWAY_POLE_Z[0]], { sag: 0.15, salt: 2 });
    // the ground's beauty: an earth footing under every pole and scuffs of bare earth where the queues stand, on the fence's own non-casting list
    drawGround(K.fence, groundPlan({
      poles: [...MIDWAY_POLE_Z.flatMap((z) => [[-MIDWAY_POLE_X, z], [MIDWAY_POLE_X, z]]), ...PLAZA_POLES.map((p) => [p.x, p.z])],
      ok: groundOpenCheck(trails.segs),
    }));
    // At dusk the pole tops light soft warm pools on the ground under them
    // (render/dusk.js createLampPools finds anything tagged lampGlobeY): every
    // pole round the plaza, and one of each pair down the midway, side to
    // side in turn (both of a pair flood the midway). The anchors are empty:
    // no mesh, no triangle, nothing to merge.
    const lamps = new THREE.Group();
    lamps.name = 'fairLampAnchors';
    for (const [x, z] of LAMP_POOLS) {
      const a = new THREE.Object3D();
      a.position.set(x, 0, z);
      a.userData.lampGlobeY = POLE_H;
      lamps.add(a);
    }
    out.push(lamps);
    PLAZA_POLES.forEach((p, i) => {
      const q = PLAZA_POLES[(i + 1) % PLAZA_POLES.length];
      parts.pole(K, p.x, p.z, POLE_H);
      parts.bunting(K.flags, [p.x, top, p.z], [q.x, top, q.z], { sag: 0.55, salt: i });
      parts.bulbString(K.bulbs, K.flags, [p.x, top - 0.35, p.z], [q.x, top - 0.35, q.z], { sag: 0.55, salt: i, every: 0.8 });
    });

    // the three games
    parts.duckPoolTub(K, DUCK_POOL.x, DUCK_POOL.z, DUCK_POOL.r);
    const ducks = parts.rubberDucks(DUCK_SPOTS);
    out.push(ducks);
    const bell = parts.ringTheBell(BELL_AT.x, BELL_AT.z, WEST, K);
    out.push(bell.group);

    // the fortune teller, the tents' backs and the juggler's corner
    out.push(parts.fortuneTent(FORTUNE_AT.x, FORTUNE_AT.z, WEST, glow));
    const fortune = parts.fortuneTable(FORTUNE_AT.x, FORTUNE_AT.z, WEST);
    out.push(fortune.group);
    RIDGE_TENTS.forEach((t, i) => parts.into(K, t.x, t.z, EAST, (L) => parts.ridgeTent(L, i ? [FAIR_PAINT.cream, FAIR_PAINT.sky] : [FAIR_PAINT.cream, FAIR_PAINT.red])));
    parts.into(K, JUGGLER_AT.x, JUGGLER_AT.z, -0.4, (L) => parts.jugglerSpot(L));
    parts.washingLine(K, [14.4, 25.2], [20.2, 26.4]);

    // the bandstand and the picnic lawn
    parts.bandstand(K, BANDSTAND_AT.x, BANDSTAND_AT.z, BANDSTAND_YAW);
    out.push(parts.bandstandRoof(BANDSTAND_AT.x, BANDSTAND_AT.z, BANDSTAND_YAW, glow));
    for (const t of PICNIC_TABLES) parts.into(K, t.x, t.z, t.yaw, (L) => parts.picnicTable(L));
    PICNIC_RUGS.forEach((t, i) => parts.into(K, t.x, t.z, t.yaw, (L) => parts.picnicRug(L, i ? [FAIR_PAINT.sky, FAIR_PAINT.white] : [FAIR_PAINT.red, FAIR_PAINT.white])));
    WAGONS.forEach((t, i) => parts.into(K, t.x, t.z, t.yaw, (L) => parts.wagon(L, i ? [FAIR_PAINT.green, FAIR_PAINT.gold] : [FAIR_PAINT.red, FAIR_PAINT.gold])));
    parts.into(K, BALLOON_CART_AT.x, BALLOON_CART_AT.z, 0.5, (L) => {
      parts.balloonCart(L);
      parts.balloonBunch(L, 0.3, 2.5, 0, 7, 23);
    });

    // the rides
    const mgr = rides.merryGoRound(MGR_AT.x, MGR_AT.z, glow);
    const music = rides.musicBox(MUSIC_BOX_AT.x, MUSIC_BOX_AT.z, Math.PI);
    const wheel = rides.ferrisWheel(FERRIS_AT.x, FERRIS_AT.z, glow, 0);
    const cups = rides.teacups(TEACUPS_AT.x, TEACUPS_AT.z, glow, EAST);
    const helter = rides.helterSkelter(HELTER_AT.x, HELTER_AT.z, glow, HELTER_YAW);
    const track = rides.coasterTrack(COASTER_TRACK, { glow });
    const station = rides.coasterStation(STATION_DECK, TRACK_X, glow);
    const train = rides.coasterTrain(COASTER_TRACK, COASTER_STATION_S);
    out.push(mgr.group, music.group, wheel.group, cups.group, helter.tower, helter.roof, helter.stairs, helter.slide, helter.brackets,
      helter.bulbs, track.rails, track.supports, track.lights, station.deck, station.roof, station.bulbs, train.group);
    parts.balloonBunch(K, STATION_DECK.minX + 0.06, STATION.deckY + 0.8, STATION_DECK.minZ + 0.1, 4, 31);

    // the edges: corner flags, bins, queue rails, bales
    CORNER_FLAGS.forEach((f, i) => parts.into(K, f.x, f.z, 0, (L) => edge.cornerFlag(L, f.colors, f.lines, i * 3)));
    for (const t of FAIR_BINS) parts.into(K, t.x, t.z, 0, (L) => edge.litterBin(L));
    for (const [x, z, yaw, len] of QUEUE_RAILS) parts.into(K, x, z, yaw, (L) => edge.queueRail(L, len));
    BALE_SEATS.forEach((t, i) => edge.hayBale(K.solid, t.x, 0, t.z, t.yaw, 60 + i));
    BALE_STACKS.forEach((t, i) => parts.into(K, t.x, t.z, t.yaw, (L) => edge.baleStack(L, 2, 70 + i * 4)));
    parts.into(K, LORRY_AT.x, LORRY_AT.z, LORRY_AT.yaw, (L) => edge.showLorry(L, [FAIR_PAINT.blue, FAIR_PAINT.gold]));
    parts.into(K, VAN_AT.x, VAN_AT.z, VAN_AT.yaw, (L) => edge.livingVan(L, [FAIR_PAINT.red, FAIR_PAINT.cream]));
    {
      // the cable runs to the big wheel's west foot, in the generator's frame
      const foot = { x: FERRIS_AT.x - FERRIS.legX + 0.5, z: FERRIS_AT.z - FERRIS.frameZ - 0.6 };
      const dx = foot.x - GENERATOR_AT.x;
      const dz = foot.z - GENERATOR_AT.z;
      const c = Math.cos(GENERATOR_AT.yaw);
      const s = Math.sin(GENERATOR_AT.yaw);
      parts.into(K, GENERATOR_AT.x, GENERATOR_AT.z, GENERATOR_AT.yaw, (L) => edge.generator(L, [dx * c - dz * s, dx * s + dz * c]));
    }
    // the hedge gap on the path to the helter-skelter stands between two
    // stacks of hay bales, so it reads as a way through them
    for (const st of GAP_BALES) parts.into(K, st.x, st.z, st.yaw, (L) => edge.baleStack(L, 2, st.salt));
    // a half barrel of flowers beside each of the butterflies' corners
    FLOWER_TUBS.forEach((t, i) => parts.into(K, t.x, t.z, 0, (L) => edge.flowerTub(L, i * 1.7)));

    out.push(...parts.meshesOf(K, glow));
    return { out, glow, mgr, music, wheel, cups, helter, train, tins, ducks, bell, fortune };
  });
  for (const m of made.out) scene.add(m);

  // --- colliders -----------------------------------------------------------------------------
  addC(MGR_AT.x, MGR_AT.z, MGR.baseR);
  addC(MUSIC_BOX_AT.x, MUSIC_BOX_AT.z, 0.85);
  addC(TEACUPS_AT.x, TEACUPS_AT.z, TEACUPS.baseR);
  // the big wheel: its four feet, the boarding deck, the ground under the wheel, the lookout's mast
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addC(FERRIS_AT.x + sx * FERRIS.legX, FERRIS_AT.z + sz * FERRIS.frameZ, 0.45);
  blockRect(addC, FERRIS_AT.x - FERRIS.deckW / 2, FERRIS_AT.x + FERRIS.deckW / 2, FERRIS_AT.z + FERRIS.deckZ - FERRIS.deckD / 2, FERRIS_AT.z + FERRIS.deckZ + FERRIS.deckD / 2);
  for (const dx of [-1.2, 0, 1.2]) addC(FERRIS_AT.x + dx, FERRIS_AT.z, 0.7);
  addC(FERRIS_AT.x, FERRIS_AT.z + FERRIS.mastZ, 0.5);
  // the helter-skelter: the tower, and the foot of the slide where it comes down to the ground
  addC(HELTER_AT.x, HELTER_AT.z, HELTER.baseR + 0.1);
  let lastLow = null;
  for (const p of HELTER_SLIDE) {
    if (p.y > 1.1) continue;
    if (lastLow && Math.hypot(p.x - lastLow.x, p.z - lastLow.z) < 1.0) continue;
    addC(p.x, p.z, 0.5);
    lastLow = p;
  }
  // the coaster's station: the deck and the track beside it
  blockRect(addC, STATION_DECK.minX, TRACK_X + 0.7, STATION_DECK.minZ, STATION_DECK.maxZ);
  // the stalls, the tents, the fortune teller's wall and table, the bandstand
  for (const s of STALLS) { const q = stallRect(s); blockRect(addC, q.minX, q.maxX, q.minZ, q.maxZ); }
  for (const t of RIDGE_TENTS) { const q = tentRect(t); blockRect(addC, q.minX, q.maxX, q.minZ, q.maxZ); }
  {
    // local +z is the door; the wall runs round the rest
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const a = FORTUNE.doorHalf + 0.16 + (i / n) * (Math.PI * 2 - 2 * FORTUNE.doorHalf - 0.32);
      const w = world(FORTUNE_AT, WEST, Math.sin(a) * FORTUNE.r, Math.cos(a) * FORTUNE.r);
      addC(w.x, w.z, 0.3);
    }
    const t = world(FORTUNE_AT, WEST, FORTUNE.tableX, FORTUNE.tableZ);
    addC(t.x, t.z, 0.62);
  }
  addC(BANDSTAND_AT.x, BANDSTAND_AT.z, BANDSTAND.r + 0.05);
  addC(BELL_AT.x, BELL_AT.z, 0.4);
  for (const t of WAGONS) for (const lx of [-0.9, 0.9]) { const c = world(t, t.yaw, lx, 0); addC(c.x, c.z, 1.05); }
  for (const t of FLOWER_TUBS) addC(t.x, t.z, edge.TUB.r + 0.03);
  for (const c of GAP_BALE_COLLIDERS) addC(c.x, c.z, c.r);
  for (const f of CORNER_FLAGS) addC(f.x, f.z, 0.2);
  for (const t of FAIR_BINS) addC(t.x, t.z, edge.BIN.r + 0.03);
  for (const t of BALE_SEATS) for (const c of baleCircles(t, [-0.25, 0.25])) addC(c.x, c.z, c.r);
  for (const t of BALE_STACKS) for (const c of baleCircles(t, [-0.75, -0.3, 0.3, 0.75])) addC(c.x, c.z, c.r);
  for (const u of [-1.55, 0, 1.55]) { const c = world(LORRY_AT, LORRY_AT.yaw, u, 0); addC(c.x, c.z, edge.LORRY.w / 2 + 0.05); }
  for (const u of [-0.75, 0.75]) { const c = world(VAN_AT, VAN_AT.yaw, u, 0); addC(c.x, c.z, edge.VAN.w / 2 + 0.05); }
  for (const u of [-0.3, 0.3]) { const c = world(GENERATOR_AT, GENERATOR_AT.yaw, u, 0); addC(c.x, c.z, 0.5); }
  {
    const c = world(BALLOON_CART_AT, 0.5, 0, 0);
    addC(c.x, c.z, 0.8);
  }

  // --- benches, trees and small green things -------------------------------------------------
  for (const t of BENCHES) scene.add(b.bench(t.x, t.z, t.yaw));
  for (const [x, z, scale, kind] of TREES) {
    scene.add(b.tree(x, z, scale, { wind, kind }));
    addC(x, z, 0.7);
    clawPerches.push(sureClawsTreePerch(x, z, scale));
  }
  for (const [x, z] of [...FAIR_HIDES.map((h) => [h.x, h.z]), [40, -8], [-41, 24], [8, -41.5], [29.5, 14.5], [-9, 44], [36, 36]]) {
    scene.add(b.bush(x, z, { wind }));
  }
  for (const [x, z] of [[41, 20], [-40, -37]]) scene.add(b.rock(x, z));

  // Two puddles out on the lawn's edges, where the grass is longest and the
  // ground lowest; none on the midway or the plaza on a fair day.
  const puddles = FAIR_PUDDLES.map((p) => ({ ...p }));
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));
  const boxes = [{ x: 9.4, z: 41.6 }, { x: -9.4, z: 27.4 }];
  for (const bx of boxes) scene.add(b.cardboardBox(bx.x, bx.z));

  cullGroundFaces(scene, GROUND_CULL);

  const fortuneBall = world(FORTUNE_AT, WEST, FORTUNE.tableX, FORTUNE.tableZ);
  const candy = stallById('candyfloss');
  const tinStall = stallById('tinCans');
  // the bulbs' one material, and the lamp-lit ones (the props' counters and
  // goods, and the tins on their shelf): setFairGlow drives them all
  const lamps = [made.out.find((m) => m.name === 'fairProps')?.material, made.tins.userData.lamp].filter(Boolean);
  const glowState = { material: made.glow, lamps, level: 0 };
  return {
    name: 'The Fairground',
    colliders,
    bounds: { ...FAIR_BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    boxes,
    waters: [DUCK_POOL],
    waterFx: [pool],
    // Thirteen, in every corner of the fair and all on open dry ground: the
    // daily race picks five, and the quests walk to them. None is within 4 m
    // of the inside of a booth or a tent (scent.js scatters buried treats that
    // far and then pushes them clear of colliders).
    pois: [
      { x: 0, z: 38 },        // the midway, among the stalls
      { x: 0, z: 14.5 },      // the top of the midway
      { x: 0, z: -17 },       // the path up to the big wheel
      { x: 10.5, z: -30 },    // beside the big wheel
      { x: 17.4, z: 0 },      // the foot of the coaster's steps
      { x: 33, z: 12 },       // inside the coaster's loop
      { x: -17.5, z: 2 },     // the teacups
      { x: -15, z: -22 },     // the open field
      { x: -27, z: -27 },     // the helter-skelter
      { x: -16.5, z: 20 },    // the duck pool and the picnic lawn
      { x: -19.6, z: 35.4 },  // the bandstand's steps
      { x: 12.6, z: 31.4 },   // the fortune teller's door
      { x: 17.4, z: 22.6 },   // where the juggler practises
    ],
    collectibles: [
      { id: 'fair-1', x: -9, z: 36.8, label: 'a striped paper straw' },
      { id: 'fair-2', x: 34, z: -22, label: 'a shiny brass token' },
      { id: 'fair-3', x: -39, z: -24, label: 'a red clown nose' },
      { id: 'fair-4', x: 21, z: 16.4, label: 'a lost juggling ball' },
      // On the bandstand's deck, one hop up.
      { id: 'fair-5', x: BANDSTAND_DECK.x, z: BANDSTAND_DECK.z, y: BANDSTAND_DECK.y, label: 'a silver whistle left on the bandstand' },
    ],
    scenics: [
      { id: 'merry-go-round', x: 0, z: 7.6, label: 'the merry-go-round' },
      { id: 'big-wheel', x: 0, z: -22.5, label: 'the big wheel' },
      { id: 'caterpillar-coaster', x: 18.4, z: 3, label: 'the caterpillar coaster' },
    ],
    critterSpawns: [
      { type: 'bird', x: -14, z: -20 }, { type: 'bird', x: 9, z: 36.5 }, { type: 'bird', x: -27, z: 16 }, { type: 'bird', x: 31, z: -12 },
      { type: 'butterfly', x: -16.5, z: 31.5 }, { type: 'butterfly', x: 31, z: -6 }, { type: 'butterfly', x: 9.6, z: -12.4 },
      // A squirrel between the trees on the west side; a mouse behind the tents.
      { type: 'squirrel', x: -38, z: 12.5, x2: -31, z2: 24 },
      { type: 'mouse', x: 14, z: 14.4, x2: 14.6, z2: 26.6 },
    ],
    moments: [
      { id: 'popcorn-thief', type: 'squirrel', label: 'a squirrel running off with a piece of popcorn!', x: -13, z: 36.5, from: { x: -9.6, z: 44 } },
      { id: 'crumb-dash', type: 'mouse', label: 'a mouse scurrying off with a crumb of toffee apple', x: 9.4, z: 20.4, from: { x: 14.6, z: 14.2 } },
    ],
    puddles,
    groundBounce: FAIR_GRASS,
    skyDusk: { top: 0x2b3560, horizon: 0x9a6a78 },
    // (beauty round two) at dusk the field goes deeper and bluer than a
    // street's lawn, so the fair's lights stand out on it
    duskLight: { lawnTint: { dark: 0.6, desat: 0.3, cool: [0.93, 0.99, 1.12] } },
    tippables: [
      { x: 3.5, z: 31.2, kind: 'bin' }, { x: -3.5, z: 12.4, kind: 'bin' }, { x: 9.6, z: 9.4, kind: 'bin' },
      { x: -18.6, z: 17, kind: 'can' }, { x: -21.4, z: 31.6, kind: 'pot' }, { x: 19.2, z: -3.4, kind: 'can' },
    ],
    // =======================================================================
    // PERCH CHAINS (the rule is src/climbing.js: one hop gains at most 1.6,
    // or 2.2 with Spring Paws; it reaches 1.2 across to a perch at or below
    // y 1 and 2.6 across to one above).
    //
    // A — THE HELTER-SKELTER. In at the door and up the stairs inside: five
    //   landings 1.2 apart in height round the newel post (each 1.03 across
    //   from the last), then out onto the gallery at 7.0. Six hops. The tower
    //   fades round her as she climbs; the stairs do not.
    // B — THREE STALL ROOFS (tin-can alley, toffee apples, popcorn): the
    //   counter 0.9, then the flat striped awning 2.32.
    // C — single hops: the bandstand's deck 0.6, the coaster's platform 0.85, the big wheel's boarding
    //   deck 0.4, three picnic tables 0.75, three benches 0.54. Each of the
    //   three decks also has a perch on its top step (0.4, 0.56, 0.2): a jump
    //   from in among the steps lands there, and the deck is the next hop.
    //
    // The rides' own seats (a horse, a gondola, a cup, a coaster car) and the
    // lookout at the top of the big wheel are NOT here: they are reached by
    // riding, and step 2 adds them as moving perches (`rides`, below).
    // =======================================================================
    perches: [
      ...HELTER_PERCHES,
      ...TIN_STALL, ...APPLE_STALL, ...POPCORN_STALL,
      BANDSTAND_STEP, BANDSTAND_DECK,
      COASTER_STEP, COASTER_PLATFORM, WHEEL_FOOT_STEP, WHEEL_STEP,
      ...TABLE_PERCHES, ...BENCH_PERCHES,
      // Sure Claws only: ten trees.
      ...clawPerches,
    ],
    // -----------------------------------------------------------------------
    // ANCHORS for steps 2 and 3. Each is a spot on this map: a point { x, z }
    // (with `y` when it is up on something), a disc { x, z, r }, a rectangle,
    // or a list of points. test/fair.test.js checks every one.
    // -----------------------------------------------------------------------
    anchors: {
      gate: pt(GATE_AT.x, GATE_AT.z),
      midway: rect(-2.5, 2.5, 11.5, 44),
      plaza: Object.freeze({ x: PLAZA.x, z: PLAZA.z, r: PLAZA.r }),
      // the merry-go-round and its music box
      merryGoRound: Object.freeze({ x: MGR_AT.x, z: MGR_AT.z, r: MGR.baseR }),
      merryGoRoundBoard: pt(0, 5.6),
      musicBox: pt(MUSIC_BOX_AT.x, MUSIC_BOX_AT.z - 1.5),                // in front of it, on the far side from the ride
      musicBoxDrum: Object.freeze({ x: MUSIC_BOX_AT.x, z: r2(MUSIC_BOX_AT.z - MUSIC_BOX.d / 2 - 0.2), y: MUSIC_BOX.drumY }),
      // the big wheel
      wheel: pt(FERRIS_AT.x, FERRIS_AT.z),
      wheelBoard: pt(FERRIS_AT.x, FERRIS_AT.z + 3.0),
      wheelStep: Object.freeze({ x: WHEEL_STEP.x, z: WHEEL_STEP.z, y: WHEEL_STEP.y }),
      wheelHub: Object.freeze({ x: FERRIS_AT.x, z: FERRIS_AT.z, y: FERRIS.hubY }),
      wheelTopPlatform: Object.freeze({ x: FERRIS_AT.x, z: r2(FERRIS_AT.z + FERRIS.platZ), y: FERRIS.topY }),
      // the teacups
      teacups: Object.freeze({ x: TEACUPS_AT.x, z: TEACUPS_AT.z, r: TEACUPS.baseR }),
      teacupsBoard: pt(TEACUPS_AT.x + TEACUPS.baseR + 0.7, TEACUPS_AT.z),
      // the helter-skelter
      helterSkelter: pt(HELTER_AT.x, HELTER_AT.z),
      helterDoor: Object.freeze(world(HELTER_AT, HELTER_YAW, 0, HELTER.baseR + 0.75)),
      helterStairs: HELTER_STAIRS,
      helterTop: HELTER_TOP,
      helterSlideEnd: pt(HELTER_SLIDE[HELTER_SLIDE.length - 1].x, HELTER_SLIDE[HELTER_SLIDE.length - 1].z),
      helterSlideOff: Object.freeze(world(HELTER_AT, HELTER_YAW, 3.0, 4.6)),       // where the cat steps off the mat
      // the coaster
      coasterStation: STATION_DECK,
      coasterBoard: pt(19.6, 0),
      coasterPlatform: Object.freeze({ x: COASTER_PLATFORM.x, z: COASTER_PLATFORM.z, y: COASTER_PLATFORM.y }),
      // the games
      tinCanPlay: Object.freeze(world(tinStall, tinStall.yaw, 0, STALL.d / 2 + 0.75)),
      tinCanCounter: Object.freeze({ x: TIN_STALL[0].x, z: TIN_STALL[0].z, y: TIN_STALL[0].y }),
      tinCans: TIN_SPOTS,
      duckPool: Object.freeze({ x: DUCK_POOL.x, z: DUCK_POOL.z, r: DUCK_POOL.r }),
      duckPoolSide: pt(DUCK_POOL.x + DUCK_POOL.r + 0.9, DUCK_POOL.z),
      bellPad: Object.freeze(world(BELL_AT, WEST, 0, BELL.padZ)),
      bellPole: pt(BELL_AT.x, BELL_AT.z),
      bellTop: Object.freeze({ x: BELL_AT.x, z: BELL_AT.z, y: BELL.bellY }),
      // the things to discover
      fortuneDoor: Object.freeze(world(FORTUNE_AT, WEST, 0, FORTUNE.r + 0.8)),
      fortuneSeat: Object.freeze(world(FORTUNE_AT, WEST, FORTUNE.seatX, FORTUNE.seatZ)),       // the visitor's cushion, facing the ball
      fortuneBall: Object.freeze({ x: fortuneBall.x, z: fortuneBall.z, y: r2(FORTUNE.tableY + 0.05 + FORTUNE.ballR) }),
      candyfloss: Object.freeze(world(candy, candy.yaw, -0.75, STALL.d / 2 + 0.75)),
      candyflossPan: Object.freeze({ ...world(candy, candy.yaw, -0.75, STALL.counterZ), y: STALL.counterY + 0.4 }),
      juggler: pt(JUGGLER_AT.x, JUGGLER_AT.z),
      jugglerWatch: pt(JUGGLER_AT.x + 0.4, JUGGLER_AT.z + 2.1),
      tentsBack: rect(13.6, 21, 14, 27),
      balloonField: FIELD,
      balloonCart: pt(BALLOON_CART_AT.x + 1.6, BALLOON_CART_AT.z + 0.6),
      // the south-west corner
      bandstand: Object.freeze({ x: BANDSTAND_AT.x, z: BANDSTAND_AT.z, r: BANDSTAND.r }),
      bandstandSteps: Object.freeze(world(BANDSTAND_AT, BANDSTAND_YAW, 0, BANDSTAND.r + 1.3)),
      picnicLawn: PICNIC_LAWN,
      // the visitors
      visitorLoop: VISITOR_LOOP,
      visitorWatch: VISITOR_WATCH,
    },
    // -----------------------------------------------------------------------
    // THE RIDES AND THE GAMES' MOVING PIECES, for steps 2 and 3. Each `turn`
    // is the Group to rotate, about its own origin; each seat is a Group with
    // userData.seat = where the cat sits, in the seat's own frame.
    // -----------------------------------------------------------------------
    rides: {
      merryGoRound: { group: made.mgr.group, turn: made.mgr.turn, axis: 'y', horses: made.mgr.horses, bob: MGR.bob, musicBoxDrum: made.music.drum },
      wheel: { group: made.wheel.group, turn: made.wheel.turn, axis: 'z', gondolas: made.wheel.gondolas, hubY: FERRIS.hubY, radius: FERRIS.R },
      teacups: { group: made.cups.group, turn: made.cups.turn, axis: 'y', cups: made.cups.cups },
      helterSkelter: { tower: made.helter.tower, stairs: HELTER_STAIRS, top: HELTER_TOP, slide: HELTER_SLIDE, slideMeshes: [made.helter.slide, made.helter.brackets] },
      coaster: { train: made.train.group, cars: made.train.cars, track: COASTER_TRACK, stationS: COASTER_STATION_S, carGap: COASTER.carGap },
      tinCans: made.tins.children.slice(),
      ducks: made.ducks.children.slice(),
      bell: { marker: made.bell.marker, from: BELL.markerFrom, to: BELL.markerTo },
      crystalBall: made.fortune.ball,
    },
    // The one material every bulb shares; setFairGlow(area, t) drives it.
    glow: glowState,
  };
}

// What the grass asks this area for (render/grass.js grassStyle, createGrass).
export const GRASS_HOOKS = Object.freeze({ tint: fairGroundTint, bare: fairBare });
