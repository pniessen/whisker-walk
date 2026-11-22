// THE OLD HOUSE'S EAST WING, THE MOVES (Old House wing, Milestone 1). Pure data, in housemoves.js's
// shape (it spreads these into its own lists): the climbs and drops that join the wing's furniture
// tops to the floor and to each other, the routes through them, and the perches of the wing's
// knock-overs. Every move is hers on her first walk, no skills, a climb or a drop of 1.5 m or
// less; every floor take-off is a metre or more from the piece it climbs to (the feet's guards
// hold her 0.92 m off it, a Maine Coon).
//
// THE OBVIOUS JUMP (housemoves.js): wherever a hop lands her, the route's next hop takes off right
// there. Where a ledge's two hops take off less than 0.9 m apart they point opposite ways (the
// bedroom chest's way), so the facing she lands with picks the next one, never the way back.
//
//   living room  floor -> the loveseat's seat (0.55) -> the bookshelf (1.45), back by two drops
//   bunk beds    floor -> the lower bunk's pillow end (0.55) -> the top bunk (1.6), back by two drops
//   bathroom     floor -> the tub (0.6) and down again: a flat top, towels heaped to the rim

const S = (x, z) => ({ x, z });
const hop = (id, from, to) => ({ id, from, to, mark: 'paw' });

export const WING_CLIMBS = [
  // the sofa: a hop from the floor a metre out onto the seat's east end, a hop on to the shelf
  hop('living-floor-sofa', S(19.25, 4.5), S(19.25, 3.05)),
  hop('living-sofa-shelf', S(19.25, 3.05), S(20.9, 2.7)),
  // the bunks: onto the lower bunk's pillow end, and from there onto the top bunk's band
  hop('kids-floor-bunk', S(45.6, 8.3), S(47.4, 8.3)),
  hop('kids-bunk-top', S(47.4, 8.3), S(47.4, 6.0)),
  // the bath: onto the rim, in the middle of its long side
  hop('bath-floor-tub', S(40.9, -1.4), S(39.15, -1.4)),
];

export const WING_DROPS = [
  hop('living-shelf-sofa', S(20.9, 2.7), S(18.6, 3.1)),
  hop('living-sofa-floor', S(18.6, 3.1), S(18.6, 4.5)),
  hop('kids-top-bunk', S(47.4, 6.0), S(47.3, 8.35)),
  hop('kids-bunk-floor', S(47.3, 8.35), S(45.6, 8.7)),
  hop('bath-tub-floor', S(39.15, -1.4), S(40.9, -1.4)),
];

export const WING_ROUTES = {
  living: ['living-floor-sofa', 'living-sofa-shelf', 'living-shelf-sofa', 'living-sofa-floor'],
  bunk: ['kids-floor-bunk', 'kids-bunk-top', 'kids-top-bunk', 'kids-bunk-floor'],
  bath: ['bath-floor-tub', 'bath-tub-floor'],
};

// The knock-over perches (D4): on top of each piece, `y` metres over its floor. The ids are the pieces'.
const perch = (id, x, z, y) => ({ id, x, z, y, kind: 'furniture' });
export const WING_PERCHES = [
  perch('living-coffee', 18.0, 6.0, 0.42),
  perch('kids-desk', 40.4, 11.55, 0.8),
  perch('bath-sink', 41.75, -2.55, 0.85),
  perch('bath-toilet', 43.4, -2.2, 0.85),
];
