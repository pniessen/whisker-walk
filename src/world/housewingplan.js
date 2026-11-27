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
//   ATTIC (y 4.2), the secret WONDER ROOM x 41..52, z -14..-4, over the lawn north of the kids' room. Its only way in is the secret
//   stair 'wonderstair' (x 45.2..47.6, from the kids' north wall at z 2 up to its south edge at z -4), shut by the kids' wardrobe.
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
  // the secret wonder room (milestone 3): an attic playroom over the lawn, its stair behind the kids' wardrobe
  freeze({ id: 'wonder', level: 'attic', zone: 'wonder', minX: 41, maxX: 52, minZ: -14, maxZ: -4 }),
]);

// The kids' wardrobe, shut in the kids' north wall: its leaf spans the wonder stair's mouth (x 45.2 to 47.6) and swings a quarter turn on its
// west hinge, away from her (the library's bookcase swings the same way: houseplan.js SECRET_BOOKCASE). She opens it by staying within `reach`
// for `holdS`, from either side.
export const SECRET_WARDROBE = freeze({ x: 46.4, z: 2, w: 2.4, d: 0.42, h: 2.25, hinge: freeze({ x: 45.2, z: 2 }), openS: 1.2, reach: 1.1, holdS: 0.8 });

// The wing stair: from the solarium's east wall up to the kids' room's west wall, 8.4 m, 0.286.
export const WING_STAIRS = freeze([
  freeze({ id: 'wing', from: 'ground', to: 'upstairs', x0: 30, z0: 7, x1: 38.4, z1: 7, width: 2.4 }),
  // the secret stair to the wonder room: 1.8 m up over 6.0 m (0.30), from the kids' north wall to the wonder room's south edge
  freeze({ id: 'wonderstair', from: 'upstairs', to: 'attic', x0: 46.4, z0: 2, x1: 46.4, z1: -4, width: 2.4 }),
]);

const DOOR_W = 2.0;
export const WING_DOORWAYS = freeze([
  freeze({ id: 'parlour-livingroom', rooms: freeze(['parlour', 'livingroom']), x: 14, z: 10.2, axis: 'x', width: DOOR_W }),
  freeze({ id: 'livingroom-solarium', rooms: freeze(['livingroom', 'solarium']), x: 22, z: 7, axis: 'x', width: DOOR_W }),
  freeze({ id: 'kids-bath', rooms: freeze(['kids', 'bath']), x: 41, z: 2, axis: 'z', width: DOOR_W }),
]);

const win = (room, side, at, width = 1.2, sill = 0.9, head = 2.0, round = false) => freeze({ room, side, at, width, sill, head, round });
export const WING_WINDOWS = freeze([
  win('livingroom', 's', 16), win('livingroom', 's', 20),
  // the conservatory: wide panes in the 4 m sections, low sills, glass on three sides
  win('solarium', 's', 24, 3.4, 0.3, 2.6), win('solarium', 's', 28, 3.4, 0.3, 2.6),
  win('solarium', 'n', 24, 3.4, 0.3, 2.6), win('solarium', 'n', 28, 3.4, 0.3, 2.6),
  win('solarium', 'e', 3.9, 3.4, 0.3, 2.6), win('solarium', 'e', 10.1, 3.4, 0.3, 2.6),
  win('kids', 'e', 3.7), win('kids', 'e', 10.3), win('kids', 's', 43.2, 1.5),
  win('bath', 'n', 39.8), // frosted: the kids' room keeps the clear panes
  win('wonder', 's', 50.9, 1.0, 1.2, 2.2, true), // the round porthole, seen from the lawn
]);

// Raised rooms have no lamp (a 3.4 m pool needs a room 7 m wide: houseplan.test.js); the kids'
// room and the bathroom are lit by their wall sconces, the wonder room by its string lights and the skylight's pool (housewingparts.js wonderParts) (houseparts.js HOUSE_DECOR) and a night
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
const low = (f) => ({ ...f, nocast: true }); // a low piece that throws no shadow (the wonder room's base box)
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
  piece('kids-chest', 'kids', 'chest', 44.3, 2.45, FACE_S, 0.8, 0.5, 0.55, 0.25),
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

  // ---- the wonder room (secret, milestone 3): a cat tree of four levels in a row along z -11.35 (a base box and three
  // platforms, 0.9 m squares 0.92 m apart, each on its own sisal post, going east), a hammock shelf on the north wall above
  // the second platform (a leap north, 1.8 m, lands on it), a scratching post, a feather wand on a beam, the crinkly tunnel
  // (WING_TUNNEL: its rings fade, its side rows are the colliders), a cardboard castle she can sit in, a catnip plant and a
  // rug. The row stands 1.1 m off the west wall, so the wall's strip leads round its west end to the north
  low(ledge('wonder-tree-base', 'wonder', 'treebase', 43.53, -11.35, FACE_S, 0.9, 0.9, 0.55, 0.45)),
  ledge('wonder-tree-p1', 'wonder', 'treeplat', 45.35, -11.35, FACE_S, 0.9, 0.9, 1.15, 0.45),
  ledge('wonder-tree-p2', 'wonder', 'treeplat', 47.17, -11.35, FACE_S, 0.9, 0.9, 1.75, 0.45),
  ledge('wonder-tree-crown', 'wonder', 'treecrown', 48.99, -11.35, FACE_S, 0.9, 0.9, 2.3, 0.45),
  ledge('wonder-hammock', 'wonder', 'hammock', 46.7, -13.35, FACE_S, 1.6, 1.1, 1.75, 0.5),
  piece('wonder-post', 'wonder', 'scratchpost', 43.2, -5.4, FACE_S, 0.5, 0.5, 1.1, 0.25),
  piece('wonder-wandbeam', 'wonder', 'wandbeam', 47.0, -8.9, FACE_S, 1.8, 0.3, 2.3, 0.15),
  { ...piece('wonder-tunnel-a', 'wonder', 'tunnelseg', 50.6, -6.85, FACE_E, 1.6, 1.3, 0.7, 0.3), fade: true, free: true, nocast: true },
  { ...piece('wonder-tunnel-b', 'wonder', 'tunnelseg', 49.85, -7.6, FACE_S, 1.6, 1.3, 0.7, 0.3), fade: true, free: true, nocast: true },
  piece('wonder-castle', 'wonder', 'castle', 44.0, -6.9, FACE_S, 1.3, 1.1, 0.65, 0),
  piece('wonder-catnip', 'wonder', 'plant', 51.2, -13.2, FACE_S, 0.5, 0.5, 1.0, 0.25),
  piece('wonder-rug', 'wonder', 'rug', 46.4, -6.9, FACE_S, 3.6, 2.6, 0.012, 0, 'rugBlue'),
]);

// The crinkly tunnel: two open-topped runs in an L along the east wall, 1.5 m each (3.0 m in all), the first from its south mouth
// (50.6, -6.05) north to the bend, the second from the bend west to its west mouth (49.05, -7.6). Both mouths are open, so she is
// never trapped. `colliders` are the two side rows (0.55 m either side of the centreline, r 0.1: 0.9 m clear for her body); `inside`
// the two runs as rectangles (she moves at `pace` of her speed there, and crinkles every `crinkleEvery` m); `mouths` where a cat
// has come out: the find is a walk through from one mouth to the other.
export const WING_TUNNEL = (() => {
  const R = 0.1;
  const off = 0.55;
  const colliders = [];
  const row = (x0, z0, x1, z1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25 - 1e-9));
    for (let i = 0; i <= n; i++) colliders.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, r: R, level: 'attic' });
  };
  row(51.15, -6.05, 51.15, -8.15); row(51.15, -8.15, 49.05, -8.15); // the outer side: the east run's east wall, the west run's north wall
  row(50.05, -6.05, 50.05, -7.05); row(50.05, -7.05, 49.05, -7.05); // the inner side
  const runs = [
    { minX: 50.05, maxX: 51.15, minZ: -8.15, maxZ: -6.05 },
    { minX: 49.05, maxX: 50.05, minZ: -8.15, maxZ: -7.05 },
  ];
  return freeze({
    colliders: freeze(colliders.map((c) => freeze(c))),
    inside: freeze(runs.map((r) => freeze(r))),
    mouths: freeze([freeze({ x: 50.6, z: -5.7, r: 0.6 }), freeze({ x: 48.7, z: -7.6, r: 0.6 })]),
    pace: 0.75,
    crinkleEvery: 0.5,
  });
})();

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
  freeze({ id: 'wonder', level: 'attic', rooms: freeze(['wonder']), stairs: freeze(['wonderstair']) }),
]);
// A joined zone is drawn in full only while she (or the camera) is within ZONE_NEAR of the way into it,
// or in it, the design's 5 m. With a zone a room and the old ground kept for just the parlour, the
// worst spot with three zones drawn is still under the house's 70,000 (test/housebudget.test.js).
export const ZONE_NEAR = 5;
export const ZONE_LEAVE = 6; // m: it stays drawn until she is this far (no flicker at the line)
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
  // the secret stair (the stair's own rectangle): a join only while the kids' wardrobe stands open (houselevels.js reads `secret`), so the wonder room is never a neighbour of the kids' room before
  freeze({ id: 'wonderstair', a: 'kids', b: 'wonder', x: 46.4, z: -1, hx: 1.2, hz: 3.0, secret: true }),
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
