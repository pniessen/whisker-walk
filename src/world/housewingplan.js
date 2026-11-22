// THE OLD HOUSE'S EAST WING, THE PLAN (Old House wing, Milestone 1). Pure data, no THREE, no
// randomness, no clock: the rooms, the stair, the doorways, the windows, the lamps and the bare
// furniture of the wing east of the parlour, over what was empty lawn. houseplan.js
// concatenates these rows into the house's own lists, so every old test that walks the plan
// walks the wing too; house.js draws it; housewingmoves.js makes its climbs.
//
// x east, z south (north is -z), metres, as houseplan.js. No room is above another:
//
//   GROUND (y 0)
//    parlour | LIVING ROOM | SOLARIUM |.stair 'wing' (rises east) ........> x 38.4
//     x4..14 |   x14..22   | x22..30  |  z 5.8..8.2
//            D1 (14, 10.2) D2 (22, 7)    mouth (30, 7)
//
//   UPSTAIRS (y 2.4), over the lawn east of the stair's top
//        x 38.4 .. 44   BATH  z -3..2
//        D4 (41, 2)
//        x 38.4 .. 48   KIDS' ROOM  z 2..12   (the stair arrives in its west wall at z 7)
//
// ZONES. A zone is a set of rooms drawn together (houselevels.js): the old four levels stay
// zones as they were; `east` (the living room and the solarium) and `kids` (the kids' room and
// the bathroom) are new, joined to the old house by the parlour's east doorway D1 and by the
// wing stair. The wing's walls and furniture are drawn only while she is in a zone or near the
// way into it, so the five rooms never add their weight to the old house's worst spot.

const freeze = Object.freeze;

export const WING_ROOMS = freeze([
  freeze({ id: 'livingroom', level: 'ground', zone: 'living', minX: 14, maxX: 22, minZ: 2, maxZ: 12 }),
  freeze({ id: 'solarium', level: 'ground', zone: 'sun', minX: 22, maxX: 30, minZ: 2, maxZ: 12 }),
  // the kids' room is listed before the bathroom: the wall they share is the kids' room's to draw
  freeze({ id: 'kids', level: 'upstairs', zone: 'kids', minX: 38.4, maxX: 48, minZ: 2, maxZ: 12 }),
  freeze({ id: 'bath', level: 'upstairs', zone: 'bath', minX: 38.4, maxX: 44, minZ: -3, maxZ: 2 }),
]);

// The wing stair: from the solarium's east wall up to the kids' room's west wall, 8.4 m, 0.286.
export const WING_STAIRS = freeze([
  freeze({ id: 'wing', from: 'ground', to: 'upstairs', x0: 30, z0: 7, x1: 38.4, z1: 7, width: 2.4 }),
]);

const DOOR_W = 2.0;
export const WING_DOORWAYS = freeze([
  freeze({ id: 'parlour-livingroom', rooms: freeze(['parlour', 'livingroom']), x: 14, z: 10.2, axis: 'x', width: DOOR_W }),
  freeze({ id: 'livingroom-solarium', rooms: freeze(['livingroom', 'solarium']), x: 22, z: 7, axis: 'x', width: DOOR_W }),
  freeze({ id: 'kids-bath', rooms: freeze(['kids', 'bath']), x: 41, z: 2, axis: 'z', width: DOOR_W }),
]);

const win = (room, side, at, width = 1.2, sill = 0.9, head = 2.0) => freeze({ room, side, at, width, sill, head, round: false });
export const WING_WINDOWS = freeze([
  win('livingroom', 's', 16), win('livingroom', 's', 20),
  // the conservatory: wide panes in the 4 m sections, low sills, glass on three sides
  win('solarium', 's', 24, 3.4, 0.3, 2.6), win('solarium', 's', 28, 3.4, 0.3, 2.6),
  win('solarium', 'n', 24, 3.4, 0.3, 2.6), win('solarium', 'n', 28, 3.4, 0.3, 2.6),
  win('solarium', 'e', 3.9, 3.4, 0.3, 2.6), win('solarium', 'e', 10.1, 3.4, 0.3, 2.6),
  win('kids', 'e', 3.7), win('kids', 'e', 10.3), win('kids', 's', 43.2, 1.5),
  win('bath', 'n', 39.8), // frosted: the kids' room keeps the clear panes
]);

// Raised rooms have no lamp (a 3.4 m pool needs a room 7 m wide: houseplan.test.js); the kids'
// room and the bathroom are lit by their wall sconces (houseparts.js HOUSE_DECOR) and a night
// light, and dusk lamplight is painted in house.js drawGlow, clipped to the room.
export const WING_LAMPS = freeze([
  freeze({ room: 'livingroom', kind: 'standard', x: 20.8, z: 10.8 }),
  freeze({ room: 'solarium', kind: 'standard', x: 28.8, z: 3.2 }),
]);

// A piece row without its level (houseplan.js adds it from the room): the shape of its `piece()`.
const FACE_S = 0;
const FACE_N = Math.PI;
const FACE_E = Math.PI / 2;
const FACE_W = -Math.PI / 2;
const piece = (id, room, kind, x, z, rotY, w, d, h, r, look = null) => ({ id, room, kind, x, z, rotY, w, d, h, r, look });
const ledge = (...a) => ({ ...piece(...a), ledge: true, fade: true }); // every wing top fades (the camera can come down inside one)
const TOP_D = 0.9; // a top backed by a wall: houseplan.js TOP_D

export const WING_FURNITURE = freeze([
  // ---- the living room: a big old sofa against the north wall (its seat is a nap spot), a
  // low table, a bookshelf, a fish tank, a standard lamp, a plant, a rug, a basket of knitting
  piece('living-sofaback', 'livingroom', 'sofaback', 18.6, 2.35, FACE_S, 2.0, 0.3, 0.95, 0.15),
  ledge('living-sofa', 'livingroom', 'sofa', 18.6, 3.0, FACE_S, 1.6, 0.8, 0.55, 0.4),
  ledge('living-shelf', 'livingroom', 'bookcase', 20.95, 2.55, FACE_S, 1.1, TOP_D, 1.45, 0.3),
  piece('living-coffee', 'livingroom', 'coffeetable', 18.0, 6.0, FACE_S, 1.2, 0.6, 0.42, 0.3),
  piece('living-tank', 'livingroom', 'fishtank', 18.0, 11.675, FACE_N, 1.2, 0.45, 1.15, 0.25),
  piece('living-plant', 'livingroom', 'plant', 14.85, 2.75, FACE_S, 0.5, 0.5, 1.2, 0.25),
  piece('living-basket', 'livingroom', 'basket', 15.2, 5.2, FACE_S, 0.55, 0.45, 0.4, 0.25, 'knit'),
  piece('living-rug', 'livingroom', 'rug', 18.0, 6.4, FACE_S, 4.0, 2.8, 0.012, 0, 'rugBlue'),
  piece('living-cushion', 'livingroom', 'cushion', 20.6, 4.6, FACE_W, 0.6, 0.6, 0.08, 0, 'rose'),

  // ---- the solarium: a glass room with wicker chairs, plants, a tiled floor (the sunny slots
  // come in milestone 2)
  piece('solarium-chair-a', 'solarium', 'wickerchair', 24.0, 9.6, 2.5, 0.7, 0.7, 0.95, 0.32),
  piece('solarium-chair-b', 'solarium', 'wickerchair', 26.2, 10.0, 3.6, 0.7, 0.7, 0.95, 0.32),
  piece('solarium-table', 'solarium', 'sidetable', 25.1, 9.9, 0, 0.5, 0.5, 0.62, 0.25),
  piece('solarium-plant-nw', 'solarium', 'plant', 22.9, 2.9, FACE_S, 0.55, 0.55, 1.35, 0.27),
  piece('solarium-plant-ne', 'solarium', 'plant', 29.1, 11.1, FACE_S, 0.55, 0.55, 1.35, 0.27),
  piece('solarium-plant-sw', 'solarium', 'plant', 22.9, 11.1, FACE_S, 0.55, 0.55, 1.35, 0.27),
  piece('solarium-birdbath', 'solarium', 'birdbath', 27.9, 10.3, FACE_S, 0.6, 0.6, 0.9, 0.3),
  piece('solarium-rug', 'solarium', 'rug', 26.0, 6.4, FACE_S, 4.4, 3.2, 0.012, 0, 'rugGreen'),

  // ---- the kids' room: bunk beds on the east wall between the windows (the top bunk, 1.6 m up, with the lower
  // mattress under it drawn with it; the lower bunk, a trundle bed pulled out 0.95 m in front of it, a step she
  // climbs from, the way the bedroom's chest stands off its shelf), a low bed under the south window, a desk,
  // a toy chest, a shelf, a rug and a blanket fort
  ledge('kids-bunk-low', 'kids', 'bunklow', 47.4, 8.35, FACE_W, 1.2, 1.0, 0.55, 0.5),
  ledge('kids-bunk-top', 'kids', 'bunktop', 47.425, 6.05, FACE_W, 1.5, 0.95, 1.6, 0.5),
  piece('kids-bed', 'kids', 'kidbed', 43.2, 10.9, FACE_N, 0.9, 1.9, 0.5, 0.45),
  piece('kids-desk', 'kids', 'desk', 40.4, 11.55, FACE_N, 1.4, 0.7, 0.8, 0.35),
  piece('kids-chair', 'kids', 'chair', 40.4, 10.5, FACE_S, 0.45, 0.45, 0.95, 0.23),
  piece('kids-chest', 'kids', 'chest', 44.6, 2.45, FACE_S, 0.8, 0.5, 0.55, 0.25),
  piece('kids-shelf', 'kids', 'bookcase', 38.75, 3.5, FACE_E, 1.6, 0.45, 1.3, 0.22),
  piece('kids-rug', 'kids', 'rug', 43.0, 7.0, FACE_S, 3.6, 2.8, 0.012, 0, 'rugGreen'),
  piece('kids-fort', 'kids', 'fort', 42.4, 4.7, FACE_S, 1.5, 1.2, 0.55, 0),

  // ---- the bathroom: a claw-foot bath along the west wall (its rim a top she walks), a basin
  // and a toilet on the north wall, a laundry basket, a mat
  ledge('bath-tub', 'bath', 'tub', 38.95, -1.4, FACE_E, 1.4, TOP_D, 0.6, 0.5),
  piece('bath-sink', 'bath', 'washbasin', 41.9, -2.55, FACE_S, 0.7, 0.5, 0.85, 0.25),
  piece('bath-toilet', 'bath', 'toilet', 43.4, -2.45, FACE_S, 0.5, 0.75, 0.85, 0.28),
  piece('bath-basket', 'bath', 'laundrybasket', 43.2, 1.25, FACE_S, 0.7, 0.6, 0.5, 0), // a box she sits in: walked over, no collider
  piece('bath-mat', 'bath', 'rug', 41.0, 0.4, FACE_S, 1.4, 0.8, 0.012, 0, 'rugBlue'),
]);

// What the wing's zones are (houselevels.js): one a room, the wing stair drawn with the solarium (`sun`),
// so only the room she is in and the rooms within 2 m of the way into them are drawn in full. (The
// design's two zones, east and kids, drew 8,600 and 7,200 triangles at once; a room alone is 3,000 to
// 4,700, which is what keeps the wing's worst spot, standing at a door with its two rooms drawn, under
// the house's 70,000.) `level` is the floor height's name (the zone reads her position, not her paws,
// because a wing floor shares its height with an old level).
export const WING_ZONES = freeze([
  freeze({ id: 'living', level: 'ground', rooms: freeze(['livingroom']) }),
  freeze({ id: 'sun', level: 'ground', rooms: freeze(['solarium']), stairs: freeze(['wing']) }),
  freeze({ id: 'kids', level: 'upstairs', rooms: freeze(['kids']) }),
  freeze({ id: 'bath', level: 'upstairs', rooms: freeze(['bath']) }),
]);
// A joined zone is drawn in full only while she is within ZONE_NEAR of the way into it (or in
// it). The old worst spot has only 2.5k triangles of headroom (Task 1 of the plan), so 2 m,
// not 5: the doorway, not the room beyond it.
export const ZONE_NEAR = 2;
export const ZONE_LEAVE = 2.6; // m: it stays drawn until she is this far (no flicker at the line)
export const OUT_NEAR = 5; // m: out on the lawn, a wing room is drawn within this of its walls
export const OUT_LEAVE = 6;
// Each join: the two zones, and the opening as a rectangle (centre, half-extents): a doorway, or the
// stair's own rectangle (standing on the stair is standing in it). `keep`: from an old level, the
// rooms of that level drawn in full while the join is near (the rest are the level's far stand-in).
export const WING_JOINS = freeze([
  freeze({ id: 'parlour-livingroom', a: 'ground', b: 'living', x: 14, z: 10.2, hx: 0.4, hz: 1.0, keep: freeze(['parlour']) }),
  freeze({ id: 'livingroom-solarium', a: 'living', b: 'sun', x: 22, z: 7, hx: 0.4, hz: 1.0 }),
  freeze({ id: 'wing', a: 'sun', b: 'kids', x: 34.2, z: 7, hx: 4.2, hz: 1.2 }),
  freeze({ id: 'kids-bath', a: 'kids', b: 'bath', x: 41, z: 2, hx: 1.0, hz: 0.4 }),
  // Out on the lawn she sees each room's glass and walls from outside: a room is drawn in full while she is
  // outdoors (in no room, on no stair) and within OUT_NEAR of it (OUT_LEAVE to leave). The old ground then
  // keeps no room in full: furniture indoors is out of view from the lawn, and its far stand-in stands for it.
  ...[
    ['living', 18, 7, 4, 5],
    ['sun', 26, 7, 4, 5],
    ['sun', 34.2, 7, 4.2, 1.2], // the stair gallery, drawn with the solarium
    ['kids', 43.2, 7, 4.8, 5],
    ['bath', 41.2, -0.5, 2.8, 2.5],
  ].map(([b, x, z, hx, hz], i) => freeze({ id: `outside-${b}${i === 2 ? '-stair' : ''}`, a: 'ground', b, x, z, hx, hz, keep: freeze([]), outside: true, near: OUT_NEAR, leave: OUT_LEAVE })),
]);
