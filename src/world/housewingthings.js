// THE OLD HOUSE'S EAST WING, THE THINGS TO FIND (Old House wing, Milestone 2). Pure data, no THREE, no
// randomness, no clock: the solarium's four sunny slots, the wing's rest spots (the sofa seat and the slots),
// the eight discoveries the first two milestones ship, the top bunk's golden mouse, two more mice and their cover,
// the living room's yarn spot, the old cat's hints and the four outfit nooks (data only: the house has no spots
// file yet). housethings.js concatenates these into the house's own lists; housewingfinds.js runs the finds.
// The wardrobe and the wonder room's four finds come with milestone 3.

const freeze = Object.freeze;
const frozenAll = (list) => freeze(list.map((o) => freeze(o)));

// The four sunny slots (a patch of floor 1.2 m across, soft edged: housewingparts.js draws it): in the solarium, on its
// floor, clear of its furniture, its doorway and its stair's mouth. `r` is how near she must lie to count as in it.
export const HOUSE_WING_SLOTS = frozenAll([
  { id: 'slot-1', x: 24.8, z: 3.9, r: 0.6 },
  { id: 'slot-2', x: 27.6, z: 4.6, r: 0.6 },
  { id: 'slot-3', x: 24.6, z: 7.2, r: 0.6 },
  { id: 'slot-4', x: 28.0, z: 8.2, r: 0.6 },
]);
export const SLOT_SIZE = 1.2; // m across, the patch drawn

// Where she may lie down for a nap (rests.js: a nap spot, nothing drawn of its own, so `mesh: false`): the four slots,
// and the sofa's seat. `y` (rests.js): it is offered only when her paws are at least that high, so the sofa's seat is a nap
// spot on the seat and not from the floor in front of it.
export const HOUSE_WING_RESTS = frozenAll([
  { id: 'house-nap-sofa', kind: 'nap', x: 18.6, z: 3.0, mesh: false, y: 0.45 },
  ...HOUSE_WING_SLOTS.map((s) => ({ id: `house-nap-${s.id}`, kind: 'nap', x: s.x, z: s.z, mesh: false })),
]);

// The eight discoveries (housefinds.js's shape; housewingfinds.js runs them). She pays one when, within r of (x, z):
//   nap      she is still on the spot (the sofa's seat: her paws at least `minY` up) for holdS seconds;
//   slot     she is still in any slot for holdS seconds (`sunall` when she has done it in all four, in one walk);
//   stay     she stays holdS seconds;
//   arrive   she gets onto `ledge`.
export const HOUSE_WING_FINDS = frozenAll([
  { id: 'sofa', room: 'livingroom', trigger: 'nap', x: 18.6, z: 3.0, r: 0.8, holdS: 3, minY: 0.45 },
  { id: 'fishtank', room: 'livingroom', trigger: 'stay', x: 18.0, z: 10.6, r: 1.2, holdS: 1 },
  { id: 'sunslot', room: 'solarium', trigger: 'slot', x: 26.2, z: 6.0, r: 0.6, holdS: 4 },
  { id: 'sunall', room: 'solarium', trigger: 'slots', x: 26.2, z: 6.0, r: 0.6, holdS: 4 },
  { id: 'bathtub', room: 'bath', trigger: 'arrive', x: 38.95, z: -1.4, r: 0.8, holdS: 0, ledge: 'bath-tub' },
  { id: 'tap', room: 'bath', trigger: 'stay', x: 41.9, z: -1.6, r: 1.0, holdS: 1 },
  { id: 'bunk', room: 'kids', trigger: 'arrive', x: 47.425, z: 6.05, r: 0.8, holdS: 0, ledge: 'kids-bunk-top' },
  { id: 'fort', room: 'kids', trigger: 'stay', x: 42.4, z: 4.7, r: 0.55, holdS: 1.5 },
]);

// The kids' top bunk's golden mouse (goldmice.js holds the same row, test/housewingthings.test.js).
export const HOUSE_WING_GOLD = frozenAll([
  { id: 'gm-house-5', x: 47.35, z: 5.7, y: 0 },
]);

// Two more mice, each running a short line in its own room: a garden mouse by the solarium's fern and a mouse by the kids' fort.
export const HOUSE_WING_MICE = frozenAll([
  { type: 'mouse', x: 24.4, z: 3.6, x2: 25.8, z2: 3.2, room: 'solarium' },
  { type: 'mouse', x: 40.5, z: 5.8, x2: 40.7, z2: 4.2, room: 'kids' },
]);
export const HOUSE_WING_HIDES = frozenAll([
  { x: 23.6, z: 2.8, room: 'solarium' }, // under the big fern
  { x: 41.0, z: 3.4, room: 'kids' }, // behind the fort
]);

// The living room's yarn spot, clear floor on the rug's corner (appended to the house's two).
export const HOUSE_WING_YARN = frozenAll([
  { x: 16.2, z: 7.6, words: 'house.yarn.living' },
]);

// The old resident cat's hints (she is not built yet: her system will read this list). One for each wing room, pointing at
// a find that room has; `words` is the line's id (housewingwords.js).
export const HOUSE_WING_HINTS = frozenAll([
  { room: 'livingroom', find: 'sofa', words: 'house.hint.living' },
  { room: 'solarium', find: 'sunslot', words: 'house.hint.solarium' },
  { room: 'kids', find: 'bunk', words: 'house.hint.kids' },
  { room: 'bath', find: 'tap', words: 'house.hint.bath' },
]);

// Candidate nooks for a found outfit (data only, no spots file for the house yet): by the sofa, on the lower bunk's pillow (the top bunk's golden mouse is too near the top one), in the dry tub.
export const HOUSE_WING_NOOKS = frozenAll([
  { id: 'sofa-end', room: 'livingroom', x: 16.8, z: 3.3, y: 0 },
  { id: 'bunk-pillow', room: 'kids', x: 47.4, z: 8.6, y: 0.55 },
  { id: 'tub', room: 'bath', x: 39.0, z: -1.9, y: 0.6 },
]);
