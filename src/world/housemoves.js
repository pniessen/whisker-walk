// THE OLD HOUSE, THE MOVES (Old House step 2, rulings D2 and D4). Pure data: the
// Rooftops' moves (src/traversal.js) that join the furniture tops she can stand on
// (houseplan.js HOUSE_LEDGES) to the floor and to each other, and the perches
// (src/climbing.js) on the pieces she knocks things from. No THREE, no randomness:
// the headless tests walk it, house.js draws its marks and its plank.
//
// Every move is hers on her first walk: no `requires`, no Long Leap, no Spring
// Paws. Climbs rise and drops fall 1.5 m or less ("drop down in short steps");
// the leaps are 1.5 to 3.0 m with a rise of 0.6 m or less. Every take-off spot on
// a ledge backed by a wall lies 0.6 m off the wall's line (the wall's colliders
// keep her centre 0.55 m off it, traversal.js SPOT_BODY), and a floor take-off a
// metre or more from the ledge it climbs to, so every spot can be walked to.
//
// THE OBVIOUS JUMP. A jump takes the hop whose take-off is nearest, less 0.4 m for
// facing along it (traversal.js spotFor). So wherever a hop of a route lands her, the
// route's next hop takes off right there, or points the way she is facing: a jump as
// she lands always does the next step, never the way back. On every ledge with two
// hops they point different ways (the bedroom's chest stands in front of the shelf,
// so the shelf's drop goes south and its leap west).
//
//   library  floor -> steps (0.9) -> bookcase n2 (2.25), along the plank to n1,
//            a leap across the corner to the west bookcase, a drop to the big
//            books (1.0) and one to the floor
//   bedroom  floor -> chest (0.6, in front of the bookshelf) -> bookshelf (1.6),
//            a leap to the wardrobe (2.05) and back, then drops by the chest
//   attic    up onto the window seat (0.55) and down
//   piano    up onto the keys (0.75) and down
//
// The library's ways back (n2 to the steps, the steps to the floor, the leap from the west
// bookcase back to n1) are on no route.

import { createTraversal } from '../traversal.js';
import { houseArea } from './houseplan.js';
import { WING_CLIMBS, WING_DROPS, WING_ROUTES, WING_PERCHES } from './housewingmoves.js';

const P = (x, z, y) => ({ x, z, y });
const S = (x, z) => ({ x, z });
const MARK = 'paw'; // house.js draws a faint paw print at every take-off
const hop = (id, from, to) => ({ id, from, to, mark: MARK });

const BOOK_TOP = 2.25; // the library's bookcases (houseplan.js)
const PLANK_T = 0.03; // the plank lies on the two tops; she walks its upper face

const crossings = [
  // a shelf plank left across the gap between the two north bookcases
  { id: 'library-plank', kind: 'plank', width: 0.28, points: [P(-9.9, 2.6, BOOK_TOP + PLANK_T), P(-11.8, 2.6, BOOK_TOP + PLANK_T)] },
];

// Rough edges 1 and 2: a floor take-off or landing lies a metre from its piece (the feet hold
// her up to 0.92 m off it, a Maine Coon), and one on a top inside its guards for every cat: on
// a tall top inside its rim (0.35 m in from its open edges, the wall holding her 0.55 m off
// its line: the bookcase tops' band is z 2.55-2.65), on a low top as far from the taller piece
// beside it as a Maine Coon's head (body, on the keys) is held (the steps 3.92-4.0, the big
// books 7.57-7.65, the chest -14.08 to -14.0, the keys 10.7-10.77).
const climbs = [
  hop('library-floor-steps', S(-8.8, 5.0), S(-8.8, 3.96)),
  hop('library-steps-n2', S(-8.8, 3.96), S(-8.8, 2.6)),
  hop('bedroom-floor-chest', S(-4.2, -13.0), S(-4.45, -14.04)),
  hop('bedroom-chest-shelf', S(-4.45, -14.04), S(-4.6, -15.4)),
  hop('attic-floor-seat', S(-22.3, -11.0), S(-23.4, -11.0)),
  hop('parlour-floor-keys', S(8.7, 9.7), S(8.7, 10.74)),
  ...WING_CLIMBS, // the east wing's: the sofa, the bunks, the tub
];

const gaps = [
  // she lands nearer the drop to the big books (ahead of her) than the leap back
  hop('library-n1-w', S(-13.1, 2.6), S(-13.4, 5.3)),
  hop('library-w-n1', S(-13.4, 4.85), S(-13.1, 2.6)),
  // the shelf: the leap west from its west end, the drop south to the chest from its east
  // end; each lands her on the other's take-off, the route's next step
  hop('bedroom-shelf-wardrobe', S(-4.6, -15.4), S(-6.4, -15.4)),
  hop('bedroom-wardrobe-shelf', S(-6.4, -15.4), S(-4.15, -15.4)),
];

const drops = [
  hop('library-w-bigbooks', S(-13.4, 6.0), S(-13.4, 7.6)),
  hop('library-bigbooks-floor', S(-13.4, 7.6), S(-12.2, 7.6)),
  hop('library-n2-steps', S(-9.0, 2.6), S(-8.8, 3.96)),
  hop('library-steps-floor', S(-8.8, 3.96), S(-8.8, 5.0)),
  hop('bedroom-shelf-chest', S(-4.15, -15.4), S(-4.2, -14.04)),
  hop('bedroom-chest-floor', S(-4.2, -14.04), S(-4.2, -13.0)),
  hop('attic-seat-floor', S(-23.4, -11.0), S(-22.3, -11.0)),
  hop('parlour-keys-floor', S(8.7, 10.74), S(8.7, 9.7)),
  ...WING_DROPS,
];

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

export const HOUSE_MOVES = deepFreeze({ crossings, climbs, drops, gaps });

// The routes, in walking order, from the floor back to it.
export const HOUSE_ROUTES = deepFreeze({
  library: ['library-floor-steps', 'library-steps-n2', 'library-plank', 'library-n1-w', 'library-w-bigbooks', 'library-bigbooks-floor'],
  bedroom: ['bedroom-floor-chest', 'bedroom-chest-shelf', 'bedroom-shelf-wardrobe', 'bedroom-wardrobe-shelf', 'bedroom-shelf-chest', 'bedroom-chest-floor'],
  attic: ['attic-floor-seat', 'attic-seat-floor'],
  piano: ['parlour-floor-keys', 'parlour-keys-floor'],
  ...WING_ROUTES, // the east wing's three: the sofa, the bunks, the tub
});

// The knock-over perches (D4): on top of each piece, `y` metres over its floor. The ids are
// the pieces'. The bed is there just for the jump.
const perch = (id, x, z, y) => ({ id, x, z, y, kind: 'furniture' });
export const HOUSE_PERCHES = deepFreeze([
  perch('kitchen-counter-a', 7.45, -7.6, 0.92),
  perch('kitchen-counter-b', 10.9, -7.6, 0.92),
  perch('kitchen-table', 9.0, -3.2, 0.76),
  perch('parlour-fire', 13.6, 7.0, 1.3),
  perch('hall-console', -3.71, 4.2, 0.8),
  perch('library-desk', -9.0, 11.55, 0.8),
  perch('bedroom-bed', 0.3, -12.0, 0.6),
  ...WING_PERCHES,
]);

// The plan's area with its moves and perches, for the walk (house.js) and the tests.
export function houseMovesArea(area = houseArea()) {
  return { ...area, traversal: createTraversal(HOUSE_MOVES, area.ground), perches: HOUSE_PERCHES };
}

// A plan with no moves of its own (houseplan.js): the traversal runtime sees no climbs, drops or perches.
export function bareMovesArea(area) {
  return { ...area, traversal: createTraversal({}, area.ground), perches: [] };
}
