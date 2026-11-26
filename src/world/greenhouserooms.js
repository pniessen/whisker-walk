// =============================================================================
// THE GREENHOUSE'S THREE STAGE-B ROOMS (milestone G6): the Orchid Room (west of the Palm House), the Cactus House (east) and the
// Butterfly Room (north). Pure data, no THREE, nothing drawn; greenhouseplan.js folds it into the area record. Metres; x east, z
// south. Each room is its own small glass house (greenhouseglass.js), 2.5 m clear of the Palm House's wall, joined to it by a short
// flagstone path between two aligned 3 m doors (Orchid and Cactus on the hall's west and east doors; the Butterfly Room on its
// north door). Every floor keeps 2.2 m or more clear between solid things. Cacti are soft rounded clusters (no spikes drawn) with
// a collider ring each.
// =============================================================================

const c = (x, z, r) => Object.freeze({ x, z, r });
const pt = (x, z) => Object.freeze({ x, z });
const run = (x0, z0, x1, z1, r = 0.4, gap = 0.7) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / gap));
  return Array.from({ length: n + 1 }, (_, i) => c(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, r));
};

export const ORCHID_ROOM = Object.freeze({ x0: -33.5, x1: -16.5, z0: -15, z1: -3, wallH: 3.2, ridge: 5.2, plinth: 0.4, doorH: 3, doorW: 3, arcSegments: 6 });
export const ORCHID_DOORS = Object.freeze([
  Object.freeze({ side: 'south', x: -25, z: -3 }),
  Object.freeze({ side: 'east', x: -16.5, z: -9 }),
]);
export const CACTUS_ROOM = Object.freeze({ x0: 16.5, x1: 33.5, z0: -15, z1: -3, wallH: 3.4, ridge: 5.4, plinth: 0.4, doorH: 3, doorW: 3, arcSegments: 6 });
export const CACTUS_DOORS = Object.freeze([
  Object.freeze({ side: 'south', x: 25, z: -3 }),
  Object.freeze({ side: 'west', x: 16.5, z: -9 }),
]);
export const BUTTERFLY_ROOM = Object.freeze({ x0: -10, x1: 10, z0: -32, z1: -20.5, wallH: 3.5, ridge: 8, plinth: 0.4, doorH: 3, doorW: 3, arcSegments: 6 });
export const BUTTERFLY_DOORS = Object.freeze([Object.freeze({ side: 'south', x: 0, z: -20.5 })]);
export const ROOMS = Object.freeze([
  Object.freeze({ id: 'orchid', house: ORCHID_ROOM, doors: ORCHID_DOORS }),
  Object.freeze({ id: 'cactus', house: CACTUS_ROOM, doors: CACTUS_DOORS }),
  Object.freeze({ id: 'butterfly', house: BUTTERFLY_ROOM, doors: BUTTERFLY_DOORS }),
]);

// The flagstone paths between the Palm House and each room (flat, walked over): [x0, z0, x1, z1].
export const ROOM_PATHS = Object.freeze([
  Object.freeze([-16.5, -10.5, -14, -7.5]), Object.freeze([14, -10.5, 16.5, -7.5]), Object.freeze([-1.5, -20.5, 1.5, -18]),
]);

// ORCHID ROOM. Two benches along the north wall (the Palm House's kind, 4 x 0.9, 0.75 high); the high shelf on the west wall
// (1.4 m: one hop from the floor, its perch at the shelf's middle); hibiscus in the two south corners.
export const ORCHID_BENCHES2 = Object.freeze([
  Object.freeze({ x: -29.5, z: -13.7, w: 4, d: 0.9, h: 0.75 }),
  Object.freeze({ x: -20.5, z: -13.7, w: 4, d: 0.9, h: 0.75 }),
]);
export const ORCHID_SHELF = Object.freeze({ x: -32.7, z: -9, len: 4, d: 0.5, y: 1.4 });
export const ORCHID_HIBISCUS = Object.freeze([pt(-31.8, -4.7), pt(-18.2, -4.7)]);
// the shy blue orchid on the first bench (its fifth pot): it opens when she waits beside it
export const SHY_ORCHID = Object.freeze({ x: ORCHID_BENCHES2[0].x + ORCHID_BENCHES2[0].w / 2 - 0.4, z: ORCHID_BENCHES2[0].z - 0.08, y: ORCHID_BENCHES2[0].h + 0.2 });

// CACTUS HOUSE. A sand floor; five soft clusters (a big round cactus with two small ones at its foot, one flowering cluster at the
// back), each one collider ring; a low wall (0.5 m) with pots along the north wall in two runs.
export const CACTUS_CLUSTERS = Object.freeze([
  Object.freeze({ x: 20.8, z: -12.4, r: 0.75, flower: false }),
  Object.freeze({ x: 25, z: -12.8, r: 0.7, flower: true }),
  Object.freeze({ x: 29.2, z: -12.4, r: 0.75, flower: false }),
  Object.freeze({ x: 20.6, z: -5.4, r: 0.75, flower: false }),
  Object.freeze({ x: 29.4, z: -5.4, r: 0.75, flower: false }),
]);
export const CACTUS_FLOWERING = CACTUS_CLUSTERS[1];
export const CACTUS_LOW_WALLS = Object.freeze([Object.freeze([19, -14.3, 22.6, -14.3]), Object.freeze([27.4, -14.3, 31, -14.3])]);
export const CACTUS_SAND = 0xe3cf9a;

// BUTTERFLY ROOM. A hibiscus hedge across the back, four flowering shrubs, a bench, and a decor stream bed (flat, walked over: no
// water to wade, only a blue ribbon between pebbles). The room's middle (0, -26) is kept clear for the find.
export const BUTTERFLY_HEDGE = Object.freeze([-8.4, -5.6, -2.8, 0, 2.8, 5.6, 8.4].map((x) => pt(x, -30.6)));
export const BUTTERFLY_SHRUBS = Object.freeze([pt(-7.4, -23.2), pt(7.4, -23.2), pt(-7.9, -27), pt(7.8, -27)]);
export const BUTTERFLY_BENCH = Object.freeze({ x: -5.5, z: -29.2, w: 1.6, d: 0.5, y: 0.5 });
export const STREAM_POINTS = Object.freeze([[4.2, -31.2], [5, -29], [3.9, -26.5], [5.1, -24], [4.2, -21.4]].map(([x, z]) => pt(x, z)));
export const STREAM_WIDTH = 0.7;
// where the butterflies rest: over the shrubs and the hedge (x, z, height)
export const BUTTERFLY_ANCHORS = Object.freeze([
  [-7.4, -23.2, 1.5], [7.4, -23.2, 1.5], [-7.9, -27, 1.4], [7.8, -27, 1.4], [-5.6, -30.6, 1.6], [0, -30.6, 1.7], [5.6, -30.6, 1.6], [-2.8, -30.6, 1.5],
].map((a) => Object.freeze(a)));
export const BUTTERFLY_HOME = Object.freeze([0, 3, 5, 6]); // the four chaseable ones start over these anchors

// THE ROOMS' MIST AND SHAFTS (the Palm House's kit, other places): a few sheets low over each floor; one or two shafts a room.
export const ROOM_MIST_SHEETS = Object.freeze([
  { x: -25, z: -8.5, w: 8, d: 3.5, y: 0.35 }, { x: -22, z: -5.2, w: 4, d: 1.8, y: 0.5 },
  { x: 25, z: -9, w: 6, d: 3, y: 0.3 },
  { x: 0, z: -29, w: 9, d: 3.4, y: 0.4 }, { x: -3, z: -23.4, w: 5, d: 2, y: 0.6 },
].map((s) => Object.freeze(s)));
export const ORCHID_SHAFT_SPOTS = Object.freeze([[-27, -9.5], [-21, -7]].map((p) => Object.freeze(p)));
export const CACTUS_SHAFT_SPOTS = Object.freeze([[23, -9], [28, -8]].map((p) => Object.freeze(p)));
export const BUTTERFLY_SHAFT_SPOTS = Object.freeze([[-3, -26], [3, -28]].map((p) => Object.freeze(p)));

// THE SEED PACKETS AND POTS: a room visit (a hash, GH_ROOM_SALT in greenhouselife.js) may use one of these two sets of five
// packets (a new set: the three stage-A sets are unchanged) and one of these two sets of four thirsty pots. Pot indices 0..7 are
// the stage-A pots, 8..13 the rooms' own below.
export const ROOM_SEED_SPOT_SETS = Object.freeze([
  Object.freeze([pt(-21.2, -11.6), pt(28.6, -9.6), pt(-3.2, -24.2), pt(-10.4, -14.9), pt(26, 20)]),
  Object.freeze([pt(-30.5, -6.2), pt(22.5, -9.8), pt(-2.8, -29.2), pt(7.6, -14.2), pt(-1.5, 24.5)]),
]);
export const ROOM_POT_SPOTS = Object.freeze([pt(-30.8, -5.2), pt(-18.4, -6), pt(31.5, -5.8), pt(18.6, -11.5), pt(-7.6, -24.2), pt(7.6, -24.6)]);
export const ROOM_POT_SETS = Object.freeze([Object.freeze([0, 6, 8, 12]), Object.freeze([3, 7, 10, 13])]);

// SCENICS, PERCHES, POIS, FINDS. Ids are load-bearing once shipped (gifts persist them).
export const ROOM_SCENICS = Object.freeze([
  Object.freeze({ id: 'greenhouse-orchids', x: -23, z: -9, label: 'the Orchid Room' }),
  Object.freeze({ id: 'greenhouse-cactus', x: 25, z: -8.5, label: 'the Cactus House' }),
  Object.freeze({ id: 'greenhouse-butterflies', x: 0, z: -26, label: 'the Butterfly Room' }),
]);
export const ROOM_PERCHES = Object.freeze([
  Object.freeze({ x: ORCHID_SHELF.x, z: ORCHID_SHELF.z, y: ORCHID_SHELF.y, kind: 'furniture', label: 'the orchid shelf' }),
  Object.freeze({ x: BUTTERFLY_BENCH.x, z: BUTTERFLY_BENCH.z, y: BUTTERFLY_BENCH.y, kind: 'furniture' }),
]);
export const ROOM_POIS = Object.freeze([pt(-25, -6.5), pt(25, -9), pt(0, -24)]);
export const ROOM_FIND_ZONES = Object.freeze({
  orchid: Object.freeze([Object.freeze({ x: SHY_ORCHID.x, z: SHY_ORCHID.z, r: 1.5, y: 0, dy: 0.6, still: 2 })]),
  cactus: Object.freeze([Object.freeze({ x: CACTUS_FLOWERING.x, z: CACTUS_FLOWERING.z, r: 1.9, y: 0, dy: 0.6, still: 2 })]),
  butterfly: Object.freeze([Object.freeze({ x: 0, z: -26, r: 2.4, y: 0, dy: 0.6, still: 3 })]),
});

// Under any of the rooms' glass the rain stays out.
export const underRoomGlass = (x, y, z) => ROOMS.some(({ house: h }) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1 && y < h.ridge + 1);

// THE COLLIDERS (circles only). Each house's walls at the plinth with its doors left open (the frame is solid, the doors are gaps).
function wallsOf(h, doors) {
  const half = h.doorW / 2 + 0.4;
  const zc = (h.z0 + h.z1) / 2;
  const out = [];
  const door = (side) => doors.find((d) => d.side === side);
  for (const [side, z] of [['north', h.z0], ['south', h.z1]]) {
    const d = door(side);
    if (d) out.push(...run(h.x0, z, d.x - half, z), ...run(d.x + half, z, h.x1, z));
    else out.push(...run(h.x0, z, h.x1, z));
  }
  for (const [side, x] of [['west', h.x0], ['east', h.x1]]) {
    if (door(side)) out.push(...run(x, h.z0, x, zc - half), ...run(x, zc + half, x, h.z1));
    else out.push(...run(x, h.z0, x, h.z1));
  }
  return out;
}
export const ROOM_COLLIDERS = Object.freeze([
  ...ROOMS.flatMap((r) => wallsOf(r.house, r.doors)),
  // orchid room: two benches, the shelf's wall is the room's, hibiscus
  ...ORCHID_BENCHES2.flatMap((b) => run(b.x - b.w / 2 + 0.45, b.z, b.x + b.w / 2 - 0.45, b.z, 0.5, 0.9)),
  ...ORCHID_HIBISCUS.map((h) => c(h.x, h.z, 0.5)),
  // cactus house: a ring per cluster, the low walls
  ...CACTUS_CLUSTERS.map((k) => c(k.x, k.z, k.r)),
  ...CACTUS_LOW_WALLS.flatMap((w) => run(w[0], w[1], w[2], w[3], 0.4, 0.7)),
  // butterfly room: the hedge, the shrubs, the bench
  ...BUTTERFLY_HEDGE.map((h) => c(h.x, h.z, 0.5)),
  ...BUTTERFLY_SHRUBS.map((h) => c(h.x, h.z, 0.6)),
  ...run(BUTTERFLY_BENCH.x - 0.5, BUTTERFLY_BENCH.z, BUTTERFLY_BENCH.x + 0.5, BUTTERFLY_BENCH.z, 0.35, 1),
]);
