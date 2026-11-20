// =============================================================================
// THE ROOFTOPS, THE PLAN (Rooftops step 2). The pure data of the place: its
// levels, its blocks, the raised ground they make, and every crossing, leap,
// drop and climb placed. No THREE, no randomness, no clock: the headless tests
// walk it, and roofs.js draws it. Sibling of traversalyard.js's yardArea().
//
// x east, z south (north is -z), metres. Seen from above, north up:
//
//   z -50 +-+---------------------------------------------------+------+--+
//         |s| [loft]                                            |stair |g |
//         |i|        (tank)  [lantern]       WAREHOUSE  11.1    |4 flts|i |
//         |d|                                       [ tower ]   |      |n |
//   z -13 |e+------------------------------------[  22..30 ]---+corner|n |
//         |     THE STREET BELOW  -4  (walled, never entered)  | shop |e |
//   z   3 +------+=== terrace, pitched: VOID 6.0 ==============| 9.6  |l |
//         |west  | o    o    o[dormer]o[flat]  o  [roofT]o    o|      |sh|
//   z  12 |garden| [e1][e2][e3] ... back extensions 3.6 ... [e12]+------+op|
//         |      |   outriggers 5.1 on e2 e5 e7 e10             yard   |
//   z  20 |      |   back yards 0, bunkers 1.2 at e1 e4 e8 e12          |
//   z  28 |  [st]=[============ garages 2.8 ===========][shed 2.0]      |
//   z  34 +------+---------- the back alley 0, (bin), spawn * ---------+
//   z  46
//
// LEVELS (frozen): every climb rises 0.8-1.5 m (under the 1.6 a cat with no
// skills makes) and every drop falls 0.9-3.0 m. The way up: bin, shed,
// garages; planks over the back yards; level leaps along the extensions;
// climbs to the outriggers, the flat roofs and the chimney stacks; the ridges
// from stack to stack; the corner shop, the warehouse, the tank, the loft and
// the tower's stages. Every climb is mirrored by a drop, except shed ->
// garages (0.8, under the 0.9 a drop falls; the bin bags and the alley stair
// come down from the garages).
//
// WHY THE PITCHED ROOFS ARE VOID (ruling R4): ground holds one walkable height
// per spot and no strip is steeper than 1 in 3, so a slate roof is no walkable
// face. Its footprint is ground at VOID (6.0), 0.6 m under the flat roofs and
// gutters next to it: a wall all round, and no move lands there. She walks its
// ridge (stack to stack) and its back gutter as crossings, rails in the air.
//
// WHY THE STREET IS AT -4 (ruling R3): the streets below close the place. At
// -4 they are walled on every side (the terrace's front, the warehouse, the
// corner shop, the bounds), no move lands there, and a test proves no cell of
// them is reached. ground.js takes the MAX of `base` and every shape, so
// nothing can lie under `base`: the ground spec's base is therefore STREET,
// and the five pieces of ground at 0 (GROUNDS: the alley, the west garden,
// the back yards, the shop yard, the ginnel) are strips over it.
//
// THE FLIGHTS, SIDE BY SIDE: ground holds one height per spot, so a stair's
// flights never sit over one another. The alley stair (the fire escape) is one
// flight, 0 -> 2.8 over 9 m, onto a landing at the garages' west end. The
// warehouse stair (the quick way down) is four flights of 13 m in the ginnel,
// each 1.5 m wide and 2.775 m high (1 in 4.7), turning on landings at either
// end; next to each other they differ by a wall except at their own landing:
//
//      x 38      39.5      41      42.5      44
//   z -46 +--- L3 8.325 ----+--- L1 2.775 ----+
//         | F4    | F3      | F2      | F1    |
//         | 8.3   | 8.3     | 2.8     | 2.8   |   (north end heights)
//         |  ^    |  v      |  ^      |  v    |
//         | 11.1  | 5.55    | 5.55    | 0     |   (south end heights)
//   z -31.5 +-L4-+---- L2 5.55 ----+ ginnel  |
//   z -30 11.1                         foot here
//
// THE BACK YARDS' WALLS (Task 7's review) are raised ground, not colliders: a
// strip 0.4 m wide at YARD.h on each party line between two yards, from the
// extensions' end (z 20) to the garages (z 28), open at a 2 m gateway. Ground
// holds them exactly (no slot at either end, nothing pushed off a roof's
// edge), and the flood proves every yard still opens to the alley.
//
// SHIFTS from the plan's BLOCKS table (each within the builder's 1 m / 15%):
//   * out-2, out-5, out-7, out-10 widened 0.35 m (10%) toward their washing
//     line's other end, so each line is under the 12 m a crossing may run.
//   * dormer widened 0.7 m east (14%) to x -10..-4.3 and roofTerrace 0.7 m west
//     (14%) to x 14.3..20, so their Long Leaps to stack-0 and stack-10 are
//     4.28 m (3.6-4.5).
//   * the warehouse stair's flights run z -44.5..-31.5, with their landings
//     inside the block's z -46..-30.
// =============================================================================

import { createGround } from '../ground.js';
import { createTraversal, LONG_LEAP_ID } from '../traversal.js';

// ---------------------------------------------------------------------------
// Levels and bounds

export const LEVELS = Object.freeze({
  STREET: -4, GROUND: 0, BIN: 0.9, BUNKER: 1.2, SHED: 2.0, GARAGE: 2.8, EXTENSION: 3.6, OUTRIGGER: 5.1, VOID: 6.0,
  FLAT: 6.6, RIDGE: 8.1, SHOP: 9.6, WAREHOUSE: 11.1, TANK: 12.6, BELFRY: 14.1, LANTERN: 15.6, TOP: 17.1,
});
export const VANE_TIP = 20.0; // drawn only
export const VANE = Object.freeze({ x: 26, z: -17 }); // the weathervane's mast, on the tower top
const VANE_R = 0.2;

const L = LEVELS;

export const ROOFS_BOUNDS = Object.freeze({ minX: -46, maxX: 46, minZ: -50, maxZ: 46 });
export const ROOFS_SPAWN = Object.freeze({ x: 4, z: 41 }); // in the back alley, facing north

// ---------------------------------------------------------------------------
// Blocks

const flat = (id, x0, x1, z0, z1, y, extra = {}) => Object.freeze({ id, kind: 'flat', x0, x1, z0, z1, y, ...extra });
const disc = (id, x, z, r, y) => Object.freeze({ id, kind: 'disc', x, z, r, y });
const flight = (x0, x1, z0, z1, y0, y1) => Object.freeze({ x0, x1, z0, z1, y0, y1 }); // y0 at z0, y1 at z1
const landing = (x0, x1, z0, z1, y) => Object.freeze({ x0, x1, z0, z1, y });

// The ground at 0 under everything that is not a street. Not blocks: the
// ground spec's base is the street (see the header).
export const GROUNDS = Object.freeze([
  landing(-46, 46, 34, 46, L.GROUND), // the back alley
  landing(-46, -30, 3, 34, L.GROUND), // the west garden
  landing(-30, 46, 12, 34, L.GROUND), // the back yards (and the open ground east of the shed)
  landing(38, 46, -13, 12, L.GROUND), // the shop yard
  landing(38, 46, -50, -13, L.GROUND), // the ginnel
].map((g, i) => Object.freeze({ id: ['alley', 'westGarden', 'backYards', 'shopYard', 'ginnel'][i], ...g })));

// The back extensions: house k's, 3.5 m wide with a 1.5 m side return between
// each and the next.
const EXT_X0 = (k) => -30 + 5 * (k - 1);
const EXT_X1 = (k) => -26.5 + 5 * (k - 1);
const EXT_CX = (k) => (EXT_X0(k) + EXT_X1(k)) / 2;
const EXT_Z = Object.freeze({ z0: 12, z1: 20 });
const OUT_Z1 = 16;
const OUT_WIDEN = 0.35; // m, toward the washing line's other end (header: shifts)
const OUTRIGGERS = Object.freeze({ 2: [0, OUT_WIDEN], 5: [-OUT_WIDEN, 0], 7: [0, OUT_WIDEN], 10: [-OUT_WIDEN, 0] });
const BUNKER_KS = Object.freeze([1, 4, 8, 12]);
const BUNKER_SIZE = 1.4;
const STACK_XS = Object.freeze([-30, -20, -10, 0, 10, 20, 29.4]);
const STACK_Z = 7.5;
const STACK_R = 0.6;
const TERRACE = Object.freeze({ x0: -30, x1: 30, z0: 3, z1: 12 }); // eaves at z 3 and 12, the ridge along STACK_Z

const ALLEY_STAIR = Object.freeze({
  id: 'alleyStair', kind: 'stair', y0: L.GROUND, y1: L.GARAGE,
  flights: Object.freeze([flight(-32, -30.4, 38.6, 29.6, L.GROUND, L.GARAGE)]),
  landings: Object.freeze([landing(-32, -30, 28, 29.6, L.GARAGE)]),
});

// Four flights side by side (header), F1 outermost, from the ginnel up.
const WS = Object.freeze({ zs: -31.5, zn: -44.5, rise: (L.WAREHOUSE - L.GROUND) / 4 });
const WAREHOUSE_STAIR = Object.freeze({
  id: 'warehouseStair', kind: 'stair', y0: L.WAREHOUSE, y1: L.GROUND,
  flights: Object.freeze([
    flight(42.5, 44, WS.zs, WS.zn, 0, WS.rise), // F1, north
    flight(41, 42.5, WS.zn, WS.zs, WS.rise, 2 * WS.rise), // F2, south
    flight(39.5, 41, WS.zs, WS.zn, 2 * WS.rise, 3 * WS.rise), // F3, north
    flight(38, 39.5, WS.zn, WS.zs, 3 * WS.rise, L.WAREHOUSE), // F4, south, beside the warehouse
  ]),
  landings: Object.freeze([
    landing(41, 44, -46, WS.zn, WS.rise), // L1
    landing(39.5, 42.5, WS.zs, -30, 2 * WS.rise), // L2
    landing(38, 41, -46, WS.zn, 3 * WS.rise), // L3
    landing(38, 39.5, WS.zs, -30, L.WAREHOUSE), // L4, onto the warehouse roof
  ]),
});

export const BLOCKS = Object.freeze([
  // The streets below (R3).
  Object.freeze({ id: 'street', kind: 'street', x0: -46, x1: 30, z0: -13, z1: 3, y: L.STREET }),
  Object.freeze({ id: 'sideStreet', kind: 'street', x0: -46, x1: -40, z0: -50, z1: -13, y: L.STREET }),
  // The alley: a bin, the shed, the garages and their fire escape.
  disc('bin-1', 14.5, 35.2, 0.55, L.BIN),
  flat('shed', 12, 17, 29, 34, L.SHED),
  flat('garages', -30, 12, 28, 34, L.GARAGE),
  ALLEY_STAIR,
  // The back extensions, their bunkers and outriggers.
  ...BUNKER_KS.map((k) => flat(`bunker-${k}`, EXT_CX(k) - BUNKER_SIZE / 2, EXT_CX(k) + BUNKER_SIZE / 2, EXT_Z.z1, EXT_Z.z1 + BUNKER_SIZE, L.BUNKER)),
  ...Array.from({ length: 12 }, (_, i) => flat(`ext-${i + 1}`, EXT_X0(i + 1), EXT_X1(i + 1), EXT_Z.z0, EXT_Z.z1, L.EXTENSION)),
  ...Object.entries(OUTRIGGERS).map(([k, [w, e]]) => flat(`out-${k}`, EXT_X0(+k) + w, EXT_X1(+k) + e, EXT_Z.z0, OUT_Z1, L.OUTRIGGER)),
  // The terrace: pitched slates (VOID, R4), three flat roofs in it, the stacks on its party walls.
  Object.freeze({ id: 'terrace', kind: 'pitched', ...TERRACE, y: L.VOID, ridgeZ: STACK_Z, ridge: L.RIDGE }),
  flat('flatHouse', 0, 5, 3, 12, L.FLAT, { house: 7 }),
  flat('dormer', -10, -4.3, 8, 12, L.FLAT, { house: 5 }),
  flat('roofTerrace', 14.3, 20, 8, 12, L.FLAT, { house: 10 }),
  ...STACK_XS.map((x) => disc(`stack-${x}`, x, STACK_Z, STACK_R, L.RIDGE)),
  // The corner shop, the warehouse and what stands on it.
  flat('cornerShop', 30, 38, -13, 12, L.SHOP),
  flat('warehouse', -40, 38, -50, -13, L.WAREHOUSE),
  WAREHOUSE_STAIR,
  disc('tank', -26, -34, 1.3, L.TANK),
  flat('loft', -36, -30, -48, -43, L.TANK),
  flat('lantern', -21, -17, -36, -32, L.TANK), // no climb placed: Long Leap only
  // The clock tower, in 1 m rings.
  flat('tower-1', 22, 30, -21, -13, L.TANK),
  flat('belfry', 23, 29, -20, -14, L.BELFRY),
  flat('lanternStage', 24, 28, -19, -15, L.LANTERN),
  disc('towerTop', VANE.x, VANE.z, 1.0, L.TOP),
]);

const rectOf = ({ x0, x1, z0, z1, y }) => Object.freeze({ x0, x1, z0, z1, y });
export const PITCHED = Object.freeze(BLOCKS.filter((b) => b.kind === 'pitched').map(rectOf));
export const STREETS = Object.freeze(BLOCKS.filter((b) => b.kind === 'street').map(rectOf));

// ---------------------------------------------------------------------------
// The ground

// A flat rectangle, as a strip along x (traversalyard.js's rect).
const rectStrip = ({ x0, x1, z0, z1, y }) => ({ x0, z0: (z0 + z1) / 2, x1, z1: (z0 + z1) / 2, width: z1 - z0, y0: y });
// A flight, as a strip along z rising from y0 at z0 to y1 at z1.
const flightStrip = ({ x0, x1, z0, z1, y0, y1 }) => ({ x0: (x0 + x1) / 2, z0, x1: (x0 + x1) / 2, z1, width: x1 - x0, y0, y1 });

// The back yards' walls (header): two pieces on each party line, either side
// of a gateway.
export const YARD = Object.freeze({ z0: EXT_Z.z1, z1: 28, gate0: 23, gate1: 25, h: 1.7, half: 0.2 });
export const YARD_WALL_XS = Object.freeze(Array.from({ length: 11 }, (_, j) => EXT_X0(j + 2)));
export const YARD_WALLS = Object.freeze(YARD_WALL_XS.flatMap((x) => [[YARD.z0, YARD.gate0], [YARD.gate1, YARD.z1]]
  .map(([z0, z1]) => Object.freeze({ x, ...landing(x - YARD.half, x + YARD.half, z0, z1, YARD.h) }))));

export const ROOFS_GROUND = Object.freeze({
  base: L.STREET,
  strips: [
    ...GROUNDS.map(rectStrip),
    ...YARD_WALLS.map(rectStrip),
    ...BLOCKS.filter((b) => b.kind === 'flat' || b.kind === 'pitched').map(rectStrip),
    ...BLOCKS.filter((b) => b.kind === 'stair').flatMap((b) => [...b.flights.map(flightStrip), ...b.landings.map(rectStrip)]),
  ],
  discs: BLOCKS.filter((b) => b.kind === 'disc').map(({ x, z, r, y }) => ({ x, z, r, y })),
});

// ---------------------------------------------------------------------------
// Colliders: each stands on one level (R6)

export const ALLEY_LAMP = Object.freeze({ x: -3, z: 44.5, r: 0.25 });
export const BIN_2 = Object.freeze({ x: 13.0, z: 35.6, r: 0.45 }); // a dustbin beside bin-1
export const BIN_3 = Object.freeze({ x: 16.0, z: 35.6, r: 0.45 }); // a wheelie bin
export const TELESCOPE = Object.freeze({ x: 35, z: 8, r: 0.4 }); // on the corner shop
export const VANE_MAST = Object.freeze({ x: VANE.x, z: VANE.z, r: 0.15 });
// The washing posts in four back yards: two T-posts each, a line between.
export const WASHING_POSTS = Object.freeze([3, 6, 9, 11].map((k) => Object.freeze({ x: EXT_X0(k) + 2.7, z0: 22.0, z1: 27.0 })));
// Crates stacked in the alley (Task 8 makes perches of them): { x, z, y, s, yaw }.
export const ALLEY_CRATES = Object.freeze([
  { x: -18.6, z: 35.0, y: 0, s: 0.6, yaw: 0.2 },
  { x: -17.9, z: 35.15, y: 0, s: 0.55, yaw: -0.15 },
  { x: -18.3, z: 35.05, y: 0.6, s: 0.5, yaw: 0.4 },
  { x: 9.4, z: 35.0, y: 0, s: 0.6, yaw: -0.3 },
].map(Object.freeze));

export const ROOFS_COLLIDERS = Object.freeze([
  ALLEY_LAMP, BIN_2, BIN_3, TELESCOPE, VANE_MAST,
  ...WASHING_POSTS.flatMap((p) => [p.z0, p.z1].map((z) => Object.freeze({ x: p.x, z, r: 0.12 }))),
]);

// ---------------------------------------------------------------------------
// The moves

export const HOP_MARKS = Object.freeze({
  leap: Object.freeze(['lip', 'stub']),
  drop: Object.freeze(['gutter', 'bags', 'wall', 'skylight', 'bunker']),
  climb: Object.freeze(['bin', 'crate', 'pipe', 'sill']),
});

const P = (x, z, y) => ({ x, z, y });
const S = (x, z) => ({ x, z });

const crossings = [];
const gaps = [];
const climbs = [];
const drops = [];

// A climb from `low` up to `high`, and the drop that mirrors it.
function upDown(id, low, high, climbMark, dropMark) {
  climbs.push({ id: `${id}-up`, from: low, to: high, mark: climbMark });
  if (dropMark) drops.push({ id: `${id}-down`, from: high, to: low, mark: dropMark });
}

// The alley: bin, shed, garages. Down by the bin bags, the shed's wall, the stair.
upDown('bin', S(14.5, 36.6), S(14.5, 35.35), 'bin', 'wall');
upDown('shed', S(14.5, 35.0), S(14.5, 33.4), 'bin', 'wall');
upDown('garages', S(13.2, 31.5), S(11.4, 31.5), 'crate', null); // 0.8: no drop mirrors it
drops.push({ id: 'shed-alley', from: S(16.6, 31.5), to: S(18.3, 31.5), mark: 'wall' });
drops.push({ id: 'garages-bags', from: S(-10, 33.6), to: S(-10, 35.4), mark: 'bags' });

// Planks over the back yards, left by the roofers: garages (and shed) to an extension.
const plank = (id, x, y0, zFrom) => crossings.push({
  id, kind: 'plank',
  points: [P(x, zFrom, y0), P(x, zFrom - 0.7, y0), P(x, EXT_Z.z1 + 0.1, L.EXTENSION), P(x, EXT_Z.z1 - 0.6, L.EXTENSION)],
});
plank('plank-1', -24, L.GARAGE, 28.6); // onto ext-2
plank('plank-2', 1.0, L.GARAGE, 28.6); // onto ext-7
plank('plank-3', 16, L.SHED, 29.6); // from the shed, onto ext-10

// Level leaps over the side returns, both ways; at z 18, behind the outriggers.
for (let k = 1; k < 12; k++) {
  const w = S(EXT_X1(k) - 0.4, 18);
  const e = S(EXT_X0(k + 1) + 0.4, 18);
  gaps.push({ id: `return-${k}-east`, from: w, to: e, mark: 'lip' });
  gaps.push({ id: `return-${k}-west`, from: e, to: w, mark: 'lip' });
}

// Down from the extensions: onto a bunker, then the back yard.
for (const k of BUNKER_KS) {
  drops.push({ id: `ext-${k}-bunker`, from: S(EXT_CX(k), EXT_Z.z1 - 0.6), to: S(EXT_CX(k), EXT_Z.z1 + 0.75), mark: 'bunker' });
  drops.push({ id: `bunker-${k}-yard`, from: S(EXT_CX(k), EXT_Z.z1 + 0.9), to: S(EXT_CX(k), EXT_Z.z1 + 2.6), mark: 'wall' });
}

// Extension -> outrigger, by the drainpipe.
for (const k of Object.keys(OUTRIGGERS)) upDown(`out-${k}`, S(EXT_CX(+k), 17.3), S(EXT_CX(+k), 15.4), 'pipe', 'gutter');

// Outrigger -> flat roof, by a back window's sill.
upDown('dormer', S(-8.0, 12.8), S(-8.0, 11.2), 'sill', 'gutter');
upDown('flatHouse', S(2.0, 12.8), S(2.0, 11.2), 'sill', 'skylight');
upDown('roofTerrace', S(17.0, 12.8), S(17.0, 11.2), 'sill', 'gutter');

// Washing lines between back windows, sagging 0.3 m.
const line = (id, xa, xb) => {
  const o = L.OUTRIGGER;
  crossings.push({ id, kind: 'line', points: [P(xa, 14, o), P(xa + 0.5, 14, o), P((xa + xb) / 2, 14, o - 0.3), P(xb - 0.5, 14, o), P(xb, 14, o)] });
};
line('line-1', EXT_X1(2) + OUT_WIDEN - 0.4, EXT_X0(5) - OUT_WIDEN + 0.4); // out-2 <-> out-5
line('line-2', EXT_X1(7) + OUT_WIDEN - 0.4, EXT_X0(10) - OUT_WIDEN + 0.4); // out-7 <-> out-10

// Along the back eave, flat roof to flat roof.
crossings.push({ id: 'gutter-1', kind: 'gutter', points: [P(-4.7, 11.6, L.FLAT), P(0.4, 11.6, L.FLAT)] });
crossings.push({ id: 'gutter-2', kind: 'gutter', points: [P(4.6, 11.6, L.FLAT), P(14.7, 11.6, L.FLAT)] });

// Flat roof -> chimney stack.
upDown('stack-0', S(1.5, STACK_Z), S(0.1, STACK_Z), 'pipe', 'gutter');
upDown('stack--10', S(-8.6, 8.8), S(-9.9, 7.6), 'pipe', 'gutter');
upDown('stack-20', S(18.6, 8.8), S(19.9, 7.6), 'pipe', 'gutter');

// The ridges, stack to stack.
for (let k = 1; k < STACK_XS.length; k++) {
  crossings.push({ id: `ridge-${k}`, kind: 'ridge', points: [P(STACK_XS[k - 1] + 0.15, STACK_Z, L.RIDGE), P(STACK_XS[k] - 0.15, STACK_Z, L.RIDGE)] });
}

// The last stack -> the corner shop -> the warehouse.
upDown('cornerShop', S(29.5, STACK_Z), S(30.8, STACK_Z), 'pipe', 'wall');
upDown('warehouse', S(34, -12.2), S(34, -13.8), 'pipe', 'wall');

// On the warehouse: the tank, the loft, the pipe between, the lantern.
upDown('tank', S(-26, -31.8), S(-26, -33.0), 'crate', 'wall');
upDown('loft', S(-33, -41.6), S(-33, -43.5), 'crate', 'wall');
crossings.push({ id: 'pipe-1', kind: 'pipe', points: [P(-26.2, -34.4, L.TANK), P(-30.5, -43.5, L.TANK)] });
drops.push({ id: 'lantern-down', from: S(-19, -35.6), to: S(-19, -37.3), mark: 'skylight' });

// The clock tower, stage by stage, each on its own side.
upDown('tower-1', S(20.6, -17), S(22.5, -17), 'sill', 'wall');
upDown('belfry', S(26, -20.5), S(26, -19.5), 'sill', 'wall');
upDown('lanternStage', S(28.5, -17), S(27.5, -17), 'sill', 'wall');
upDown('towerTop', S(26, -15.4), S(26, -16.4), 'sill', 'wall');

// Long Leap: the extra rooftop corner, and two short cuts to a stack that
// is reached without it (dormer -> gutter-1 -> flatHouse -> stack-0;
// roofTerrace -> stack-20 -> ridge-5 -> stack-10).
gaps.push({ id: 'long-lantern', from: S(-25.0, -34), to: S(-20.65, -34), requires: LONG_LEAP_ID, mark: 'lip' });
gaps.push({ id: 'long-dormer', from: S(-4.55, 8.4), to: S(-0.35, 7.6), requires: LONG_LEAP_ID, mark: 'stub' });
gaps.push({ id: 'long-terrace', from: S(14.55, 8.4), to: S(10.35, 7.6), requires: LONG_LEAP_ID, mark: 'stub' });

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
deepFreeze(ROOFS_GROUND);
export const ROOFS_TRAVERSAL = deepFreeze({ crossings, gaps, climbs, drops });

// ---------------------------------------------------------------------------
// Named places: a spot on each, as [x, z, y] (spread into the flood's
// regionAt(x, z, y)), with id, x, z and y on it as well.

const place = (id, x, z, y) => Object.freeze(Object.assign([x, z, y], { id, x, z, y }));
export const ROOFS_PLACES = Object.freeze(Object.fromEntries([
  place('shed', 14.5, 31.5, L.SHED),
  place('garages', -10, 31, L.GARAGE),
  place('ext-3', EXT_CX(3), 16, L.EXTENSION),
  place('out-7', EXT_CX(7), 14, L.OUTRIGGER),
  place('flatHouse', 2.5, 5, L.FLAT),
  place('dormer', -7, 10, L.FLAT),
  place('roofTerrace', 17, 10, L.FLAT),
  place('stack-0', 0, STACK_Z, L.RIDGE),
  place('cornerShop', 34, 0, L.SHOP),
  place('warehouse', 0, -30, L.WAREHOUSE),
  place('tank', -26, -34, L.TANK),
  place('loft', -33, -45.5, L.TANK),
  place('tower-1', 22.5, -17, L.TANK),
  place('belfry', 26, -19.5, L.BELFRY),
  place('lanternStage', 26, -15.5, L.LANTERN),
  place('towerTop', 26, -16.5, L.TOP),
  place('lantern', -19, -34, L.TANK),
].map((p) => [p.id, p])));

// ---------------------------------------------------------------------------
// The skyline: the drawn top at a spot. The ground, except the ridge over a
// pitched roof's slates (not over a flat roof in it), and the vane's tip.
// (The tower's stages are ground, so their roofs are the ground's.)

let skylineGround = null;
export function skylineY(x, z) {
  if (!skylineGround) skylineGround = createGround(ROOFS_GROUND);
  if (Math.hypot(x - VANE.x, z - VANE.z) <= VANE_R) return VANE_TIP;
  const g = skylineGround.y(x, z);
  for (const p of PITCHED) {
    if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && g < L.FLAT - 1e-9) return Math.max(g, L.RIDGE);
  }
  return g;
}

// ---------------------------------------------------------------------------
// The rest of the place's record (Task 8): the POIs, the golden finds, the
// view spots, the perches, the six things to discover and the street below.
// Pure data, read by roofsArea() and by roofs.js's build, so the tests flood
// against exactly what the walk is given.

// Thirteen POIs, every one on ground walked to from the spawn without a hop
// (R5): the alley, the west garden, the garage roof (up the fire escape), the
// back yards, the shop yard, the ginnel and the warehouse roof (up its stair).
// The daily race picks five; the quests walk to them. Each is clear of every
// collider and the edge by more than the walk's clearSpot asks.
export const ROOFS_POIS = Object.freeze([
  { x: -3, z: 41.5 }, // the alley, under its lamp
  { x: -24, z: 40 }, // the alley's west end, by the fire escape
  { x: 28, z: 40 }, // the alley's east end
  { x: -38, z: 18 }, // the west garden
  { x: -20, z: 31 }, // the garage roof
  { x: 4, z: 31 }, // the garage roof, its east end
  { x: -12.5, z: 24 }, // a back yard
  { x: 7.5, z: 26 }, // another back yard
  { x: 42, z: 0 }, // the shop yard
  { x: 42, z: -20 }, // the ginnel, at the warehouse stair's foot
  { x: -30, z: -24 }, // the warehouse roof, west
  { x: 0, z: -30 }, // the warehouse roof, the middle
  { x: 14, z: -32 }, // the warehouse roof, under the clock tower
].map(Object.freeze));

// Five golden finds, plain words: one in the alley, four on roofs reached
// without Long Leap (an extension, the dormer, the corner shop, the belfry's
// ring). No `y`: the walk adds the ground under each.
export const ROOFS_COLLECTIBLES = Object.freeze([
  { id: 'roofs-1', x: -12, z: 44.2, label: 'a lost bus ticket' },
  { id: 'roofs-2', x: -3.25, z: 17, label: 'a wooden clothes peg' },
  { id: 'roofs-3', x: -7.6, z: 9.6, label: 'a stub of roofer’s pencil' },
  { id: 'roofs-4', x: 33, z: -5, label: 'a shiny bottle top' },
  { id: 'roofs-5', x: 23.5, z: -15, label: 'a little brass key' },
].map(Object.freeze));

// Three view spots, each on the roof it names.
export const ROOFS_SCENICS = Object.freeze([
  { id: 'clock-tower', x: 22.5, z: -15, label: 'the clock tower' }, // on its first ring
  { id: 'warehouse-roof', x: -10, z: -30, label: 'the warehouse roof' },
  { id: 'terrace-roofs', x: 2.5, z: 4.5, label: 'the terrace roofs' }, // the flat-roofed house
].map(Object.freeze));

// The rooftop garden on the roof terrace (discovery A): a bench along the
// back wall, tomato pots along the east side, a watering can.
export const GARDEN = Object.freeze({
  bench: Object.freeze({ x: 15.7, z: 8.45, len: 1.4, seat: 0.45 }),
  pots: Object.freeze([[19.55, 9.6], [19.55, 10.4], [19.55, 11.2]].map(([x, z]) => Object.freeze({ x, z }))),
  can: Object.freeze({ x: 18.9, z: 11.5 }),
});
// The skylight on the flat-roofed house (discovery D), flush with its roof.
export const SKYLIGHT = Object.freeze({ x: 3.4, z: 5.0, w: 0.9, d: 1.2 });
// The crate she climbs to look through the telescope (discovery E).
export const TELESCOPE_CRATE = Object.freeze({ x: 35.85, z: 8.15, s: 0.5, yaw: 0.3 });

// Perches (src/climbing.js; `y` is metres above the ground there): the alley
// crates, the garden bench and the telescope crate. Each stands on one level.
export const ROOFS_PERCHES = Object.freeze([
  ...ALLEY_CRATES.map((c) => ({ x: c.x, z: c.z, y: c.y + c.s, kind: 'crate' })),
  { x: GARDEN.bench.x, z: GARDEN.bench.z, y: GARDEN.bench.seat, kind: 'furniture' },
  { x: TELESCOPE_CRATE.x, z: TELESCOPE_CRATE.z, y: TELESCOPE_CRATE.s, kind: 'crate' },
].map(Object.freeze));

// The six things to discover (spec, "Things to discover"): a spot on each, at
// its ground's height. Step 4 gives them life.
export const ROOFS_DISCOVERIES = Object.freeze({
  garden: Object.freeze({ x: 16.6, z: 9.4, y: L.FLAT }), // A: in front of the bench
  loft: Object.freeze({ x: -33, z: -45.5, y: L.TANK }), // B: on the pigeon loft
  vane: Object.freeze({ x: 26, z: -16.5, y: L.TOP }), // C: at the weathervane's foot
  skylight: Object.freeze({ x: SKYLIGHT.x, z: SKYLIGHT.z, y: L.FLAT }), // D
  telescope: Object.freeze({ x: 35, z: 8.85, y: L.SHOP }), // E: beside the telescope
  chimney: Object.freeze({ x: -10, z: STACK_Z, y: L.RIDGE }), // F: on the warm stack
});

// The street below (R3): its pavements, three lamps, and the bus's route. The
// bus runs east along the near lane from x0 to x1 every `every` seconds,
// taking `run` of them, and is seen while any of it is out in the street:
// from its nose at the arch under the end house (the street's west end) to
// its tail past the arch under the corner shop (`seen`, its centre's x).
export const PAVEMENT = 2; // m, along each building front
export const STREET_LAMPS = Object.freeze([[-24, 2.2], [-2, -12.2], [17, 2.2]].map(([x, z]) => Object.freeze({ x, z })));
// It stands under 4 m, so past the corner shop it is under the shop yard's
// ground; the end house is deep enough to hold it before it comes out.
export const BUS = Object.freeze({ x0: -60, x1: 60, z: -7.4, run: 14, every: 45, len: 9, width: 2.5, height: 3.9, seen: Object.freeze([-50.5, 42.5]) });

// ---------------------------------------------------------------------------
// The area

export function roofsArea() {
  const ground = createGround(ROOFS_GROUND);
  return {
    name: 'The Rooftops',
    bounds: ROOFS_BOUNDS,
    spawn: ROOFS_SPAWN,
    colliders: ROOFS_COLLIDERS,
    waters: [],
    pois: ROOFS_POIS,
    collectibles: ROOFS_COLLECTIBLES,
    scenics: ROOFS_SCENICS,
    perches: ROOFS_PERCHES,
    anchors: { discoveries: ROOFS_DISCOVERIES },
    ground,
    traversal: createTraversal(ROOFS_TRAVERSAL, ground),
  };
}

// ---------------------------------------------------------------------------
// WHAT THE SHARED TABLES HOLD (Task 10). Plain data in the shapes those tables
// use, as FAIR_REGISTRATION is: each row is copied into its table, and
// test/roofs.test.js checks every row against the built area and against the
// table it was copied into. Not a colony area, no strays, no dog (R8). Every
// prop stands on one level, clear of the colliders, in the region walked from
// the spawn with no Long Leap.
const QUARTER = Math.PI / 2;
const crate = (i) => ALLEY_CRATES[i];
export const ROOFS_REGISTRATION = Object.freeze({
  id: 'roofs',
  // src/progression.js CATALOG.areas: held back (R1). Task 11 fills it, and
  // step 4 copies it into the catalog once co-walkers can see height.
  catalog: Object.freeze({ name: 'The Rooftops', price: 100, requires: Object.freeze({ area: 'fair', walks: 2 }) }),
  // src/propsets.js SETS.roofs
  propSet: Object.freeze({
    carryables: Object.freeze([
      Object.freeze({ id: 'roofs-sock-1', kind: 'sock', x: -15.9, z: 24.5 }), // a sock off the washing line, in a back yard
      Object.freeze({ id: 'roofs-cap-1', kind: 'cap', x: -6, z: 30.5 }), // a cap left on the garage roof
      Object.freeze({ id: 'roofs-glove-1', kind: 'glove', x: -13.25, z: 18 }), // a roofer's glove on a back extension
      Object.freeze({ id: 'roofs-rope-1', kind: 'rope', x: -10, z: -22 }), // a coil of rope on the warehouse roof
    ]),
    // On the alley crates (src/world/roofsplan.js ALLEY_CRATES, the perches):
    // a can on the top of the stack, a cup on the second crate, a book on the
    // lone crate by the shed. Each falls south, onto the alley. `y` is metres
    // above the ground there (the alley is 0).
    knockables: Object.freeze([
      Object.freeze({ id: 'roofs-can-1', kind: 'can', x: crate(2).x, z: crate(2).z, y: crate(2).y + crate(2).s, fallTo: Object.freeze({ x: -18.3, z: 36.4 }) }),
      Object.freeze({ id: 'roofs-cup-1', kind: 'cup', x: -17.75, z: crate(1).z, y: crate(1).y + crate(1).s, fallTo: Object.freeze({ x: -17.4, z: 36.3 }) }),
      Object.freeze({ id: 'roofs-book-1', kind: 'book', x: crate(3).x, z: crate(3).z, y: crate(3).y + crate(3).s, fallTo: Object.freeze({ x: 9.4, z: 36.4 }) }),
    ]),
    markables: Object.freeze([
      Object.freeze({ id: 'roofs-post-1', kind: 'post', x: ALLEY_LAMP.x, z: ALLEY_LAMP.z, nearBorder: false, mesh: false }), // the alley lamp post
      Object.freeze({ id: 'roofs-post-2', kind: 'post', x: WASHING_POSTS[1].x, z: WASHING_POSTS[1].z1, nearBorder: false, mesh: false }), // a washing post in a back yard
      Object.freeze({ id: 'roofs-post-3', kind: 'post', x: WASHING_POSTS[3].x, z: WASHING_POSTS[3].z0, nearBorder: false, mesh: false }), // another, further east
    ]),
    flaps: Object.freeze([
      // A loose fence board at the alley's west end.
      Object.freeze({ id: 'roofs-flap-1', kind: 'flap', x: -28, z: 42, rotY: QUARTER, width: 1.0 }),
    ]),
    rests: Object.freeze([
      Object.freeze({ id: 'roofs-drink-1', kind: 'drink', x: -8, z: 42, mesh: true }), // a water bowl in the alley
      Object.freeze({ id: 'roofs-eat-1', kind: 'eat', x: 22, z: 38, mesh: true }), // a dish at the alley's east end
      Object.freeze({ id: 'roofs-nap-1', kind: 'nap', x: 14.5, z: 31.5, mesh: true }), // a cushion on the shed roof
    ]),
    // Behind the bins, on the garage roof by the fire escape, at the tank's foot.
    hides: Object.freeze([{ x: 14.5, z: 37 }, { x: -24, z: 30.5 }, { x: -26, z: -31.3 }].map((h) => Object.freeze(h))),
    dogYard: null,
    keepSlots: Object.freeze([]),
  }),
  // src/propsets.js YARN_SPOTS.roofs: one in the alley, one up on the garages
  yarnSpots: Object.freeze([
    Object.freeze({ x: -12, z: 37, where: 'in the back alley' }),
    Object.freeze({ x: -12, z: 31, where: 'on the garage roof' }),
  ]),
  // src/rests.js REST_LOOKS
  restLooks: Object.freeze({
    'roofs-drink-1': Object.freeze({ look: 'bowl' }),
    'roofs-eat-1': Object.freeze({ look: 'dish' }),
    'roofs-nap-1': Object.freeze({ look: 'cushion' }),
  }),
  // src/render/clouds.js CLOUD_AREAS and AREA_SKY.roofs: the stars and the moon
  // come with the dusk sky
  clouds: Object.freeze({ clouds: 6, banks: 4 }),
  // src/render/ambient.js ambientKind: the alley lamp is the lamp
  ambient: 'moths',
  // src/render/pawprints.js AREA_RULES.roofs: gravel and slate, no grass
  pawprints: Object.freeze({ ground: null, path: 'gravel', strip: null }),
  // The measured counts test/budget.test.js and test/roofs.test.js pin:
  // [meshes, casters, triangles] built, [meshes, casters] merged
  budget: Object.freeze({ built: Object.freeze([113, 67, 32202]), merged: Object.freeze([57, 30]) }),
  // verify-places.html VIEWS.roofs and the card picture: Task 13's
  view: null,
  // src/marks.js MARK_AREAS and emptyMarks(): add 'roofs'
  marks: true,
  // not a colony area, no strays (R8)
  colony: false,
  strays: false,
});

// ---------------------------------------------------------------------------
// Later tasks add here: ROOFS_SHOTS and ROOFS_TOURS.
