// The Cozy Neighborhood's find spots (src/world/neighborhood.js, spawn (0, 45)),
// read off the street's own records: back gardens, bushes, flowerbeds, the lamp
// posts, the scatter rocks and the two shipped climbs. The two raised ones rest
// on the lean-to porch roof (one hop up, no skill);
// the rest are on the lawn. None is within 15 m of the spawn, 3 m of either
// yarn-ball spot (src/propsets.js), 2 m of a golden mouse (src/goldmice.js) or
// a collectible, or inside a house, tree or car; none is at a point of
// interest's centre, in the dog's yard or in the rival's disc.
// test/foundspots.test.js proves each one against the built street.
export const NEIGHBORHOOD_SPOTS = Object.freeze([
  // in the mint house's back garden, behind the house at (-12, 30)
  { id: 'fw-neighborhood-1', x: -15.5, z: 36.5, y: 0, look: 'grass' },
  // caught in the bush at (5, 25), on the east side of the street
  { id: 'fw-neighborhood-2', x: 6.4, z: 26.6, y: 0, look: 'branch' },
  // at the foot of the lamp post at (-3, 10), on the pavement's edge
  { id: 'fw-neighborhood-3', x: -3.6, z: 9.2, y: 0, look: 'post' },
  // in the leaf litter under the west scatter tree at (-30, -12)
  { id: 'fw-neighborhood-4', x: -31.2, z: -10.8, y: 0, look: 'grass' },
  // in the grass beside the east scatter tree at (30, 12)
  { id: 'fw-neighborhood-5', x: 31.4, z: 10.8, y: 0, look: 'grass' },
  // caught in the bush at (-6, -22), behind the cardboard box
  { id: 'fw-neighborhood-6', x: -6.9, z: -21.1, y: 0, look: 'branch' },
  // caught in the bush at (9, -24), by the peach house's side
  { id: 'fw-neighborhood-7', x: 10.2, z: -24.9, y: 0, look: 'branch' },
  // in the flowerbeds behind the cream house at (-12, -30), by the birdbath
  { id: 'fw-neighborhood-8', x: -18, z: -30, y: 0, look: 'grass' },
  // in the flowerbed at (16, 32), behind the brick house
  { id: 'fw-neighborhood-9', x: 17.2, z: 33.6, y: 0, look: 'grass' },
  // caught in the bush at (-24, 5), on the west back lawn
  { id: 'fw-neighborhood-10', x: -24.8, z: 6.4, y: 0, look: 'branch' },
  // against the rock at (-30, 20), on the west lawn
  { id: 'fw-neighborhood-11', x: -31.2, z: 21.3, y: 0, look: 'grass' },
  // against the rock at (6, -45), at the far south end of the street
  { id: 'fw-neighborhood-12', x: 7.2, z: -46.2, y: 0, look: 'grass' },
  // behind the mailbox at (-8, -13), in the cream house's front garden
  { id: 'fw-neighborhood-13', x: -7.6, z: -11.6, y: 0, look: 'post' },
  // on the lean-to porch roof at (-9, 17.5), by the fence corner
  { id: 'fw-neighborhood-14', x: -9.4, z: 17, y: 1.3, look: 'perch' },
].map((s) => Object.freeze(s)));
