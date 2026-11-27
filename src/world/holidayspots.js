// Where the holiday decor stands (H6): hand-placed data, one block per place, in the lazy `holidaydecor` chunk with its
// drawing (nothing here is read outside a holiday window). Pure: no three.js, no clock.
//
// Every spot sits on a wall, a sill, a roof edge or the lawn BESIDE the path, and no spot has a collider (a cat walks
// through decor; nothing here needs climbing, so the reach test with no skills is trivially met). The houses' frames are
// builder.house's: front door on local +z, windows at x -1.6 and +1.6 (pane 1.35 to 2.25 high), body 5 x 3 x 4, front
// gables with their rakes from (+-2.8, 2.8) up to (0, 5) at z 2.3. A yaw turns local +z the way three.js does: local
// (lx, lz) lands at (lx cos + lz sin, -lx sin + lz cos).
//
// Snowville is NOT here yet: its branch (snowville-r2) is not merged. TODO(snowville): add a SNOWVILLE block (a lit tree in
// the square, a menorah on the inn sill) and its row in DECOR_PLACES when the village lands.

// Neighborhood: the eight lots (x, z), the two near-spawn front-gable houses that carry the strings and the windows.
export const NEIGHBORHOOD = Object.freeze({
  doors: Object.freeze([[-12, -30], [-12, -15], [-12, 15], [-12, 30], [12, -30], [12, -15], [12, 15], [12, 30]]),
  doorY: 1.3,
  strings: Object.freeze([[-12, 30], [12, 30]]), // both rakes of each front gable
  treeWindow: Object.freeze({ x: 12, z: 30, lx: 1.6 }),
  menorahWindow: Object.freeze({ x: -12, z: 30, lx: -1.6 }),
});

// City Park: the fountain is at (0, 20) with its rim at r 2.6, y 0.7. There is no bandstand in the Park (the Fairground's is
// the only one), so the lights go round the fountain's rim.
export const PARK = Object.freeze({
  tree: Object.freeze({ x: -14.5, z: 17, s: 2.4 }),
  menorah: Object.freeze({ x: -9.2, z: 8.6, yaw: 0.64, s: 2.6 }), // the pond's east shore, facing the path
  ring: Object.freeze({ x: 0, z: 20, r: 2.68, y: 0.8, bulbs: 24 }),
});

// Appletree Farm. The farmhouse is at (-20, 8) turned east; the barn's big doors face +z at z -10.5.
export const FARM = Object.freeze({
  barn: Object.freeze({ x: 0, y: 1.4, z: -10.35, r: 0.75 }),
  tree: Object.freeze({ x: -15.8, z: 11, s: 1.7 }),
  house: Object.freeze({ x: -20, z: 8, yaw: Math.PI / 2 }),
  menorahLx: 1.6, // the right window (the left has the flower box)
  stockings: Object.freeze([-0.6, 0, 0.6]), // local x along the porch beam's front (z 2.8, hung from y 2.3)
});

// Market Square: every stall's plan (copied from marketplan.js STALLS: the test holds them equal, so the decor chunk never
// imports the Market's own chunk). [id, x, z, face x, face z, w, d]. The cafe has no counter and no wreath.
export const MARKET_STALLS = Object.freeze([
  ['fish', -11, 2, 0.9839, -0.1789, 3, 2],
  ['baker', -7, -10.5, 0.5547, 0.8321, 3, 2],
  ['cheese', 7, -10.5, -0.5547, 0.8321, 2.6, 1.8],
  ['milk', 8, 11.5, -0.5711, -0.8209, 2.2, 1.4],
  ['flowers', 12, 0, -1, 0, 2.6, 1.6],
  ['fruit', 0, -17, 0, 1, 3, 1.8],
  ['toys', -19, -6, 0.9536, 0.3011, 2.8, 1.8],
  ['plants', 15, 7, -0.9062, -0.4229, 2.6, 1.6],
  ['bric', -13, 12, 0.7348, -0.6783, 2.4, 1.6],
  ['butcher', 14, -9, -0.8412, 0.5408, 2.8, 1.8],
]);
export const MARKET = Object.freeze({
  tree: Object.freeze({ x: -4.5, z: -5.5, s: 1.5 }),
  // the dreidel-and-gelt stall: decor only, nothing bought, against the east edge, its counter facing west
  stall: Object.freeze({ x: 20.2, z: -13, yaw: -Math.PI / 2 }),
});

// The Old House (world frame, the parlour is the ground-level room x 4..14, z 2..12): the fireplace on the east wall (its
// mantel's front face is at x 13.46, top 1.3), a small tree in the north-east corner, a menorah on the sill of the south
// window at x 5.7 (wall section parlour-s-0, sill 0.9).
export const HOUSE = Object.freeze({
  mantel: Object.freeze({ x: 13.43, y: 1.24, zs: Object.freeze([6.5, 6.8, 7.2, 7.5]), yaw: -Math.PI / 2 }),
  tree: Object.freeze({ x: 13.2, z: 3.3, s: 0.55 }),
  sill: Object.freeze({ section: 'parlour-s-0', x: 5.7, y: 0.92, z: 11.78, yaw: 0, s: 0.75 }),
});

// The errand's finds (H7): hand-placed ground spots, four a place (three in the Old House), of which a walk shows at most two (an
// ornament in the Christmas window, a dreidel or a gelt coin in the Hanukkah window). Ground level, on open ground a cat reaches on
// foot from the spawn with no skill, none within 15 m of the spawn, none on a collider, collectible, golden mouse or found-outfit
// spot of its place, and well clear of the decor (test/holidayfinds.test.js proves each against the built place).
export const HOLIDAY_FIND_SPOTS = Object.freeze({
  neighborhood: Object.freeze([[-7, 3], [20, 22], [-20, 12], [-14, -38]]),
  park: Object.freeze([[8, 22], [-18, 26], [-5.5, 12], [16, -16]]),
  farm: Object.freeze([[-9, 14], [10, 14], [-3, -4], [9, -18]]),
  market: Object.freeze([[5, -3], [9, 3], [-15, 5], [3, -13]]),
  house: Object.freeze([[11.5, -6], [7, -6], [12.5, -3.5]]), // the kitchen, on the ground level
});
