// The Greenhouse's find spots (src/world/greenhouseplan.js, spawn (0, 30)): four in the garden (a hedge foot, the willow, a stone and
// the pond bench), three at the pond, two by the shed (one on a cold frame) and three in the Palm House. Every one is in stage A's
// ground: adding or moving a spot changes FIND_KEY, so stage B's rooms never touch this list. None within 15 m of the spawn, 2 m of a
// golden mouse or a collectible, 3 m of either yarn-ball spot or a job's point (the seed spots, the thirsty pots, the bench), inside
// a collider or in the pond. test/foundspots.test.js proves each one against the built place. Two are raised (a bench, a cold frame:
// one hop each).
export const GREENHOUSE_SPOTS = Object.freeze([
  // the clipped hedge's north foot, between the catnip beds
  { id: 'fw-greenhouse-1', x: -12, z: 5.6, y: 0, look: 'grass' },
  // under the tall willow at the west edge
  { id: 'fw-greenhouse-2', x: -36.5, z: 10.5, y: 0, look: 'grass' },
  // by a mossy stone in the east lawn
  { id: 'fw-greenhouse-3', x: 21, z: 3.5, y: 0, look: 'grass' },
  // on the pond bench's slats
  { id: 'fw-greenhouse-4', x: -25, z: 27.5, y: 0.5, look: 'perch' },
  // the pond's east shore
  { id: 'fw-greenhouse-5', x: -18.5, z: 15.5, y: 0, look: 'water' },
  // the pond's south shore
  { id: 'fw-greenhouse-6', x: -20.5, z: 24.5, y: 0, look: 'water' },
  // the pond's west shore, by the reeds
  { id: 'fw-greenhouse-7', x: -33.5, z: 16.5, y: 0, look: 'water' },
  // on the second cold frame's glass
  { id: 'fw-greenhouse-8', x: 20.5, z: 22.7, y: 0.65, look: 'perch' },
  // behind the potting shed, in the long grass
  { id: 'fw-greenhouse-9', x: 33.5, z: 11, y: 0, look: 'grass' },
  // the Palm House's east side, under the palms
  { id: 'fw-greenhouse-10', x: 7.5, z: -8.2, y: 0, look: 'grass' },
  // the Palm House's west side, by a fern
  { id: 'fw-greenhouse-11', x: -6.5, z: -11.2, y: 0, look: 'grass' },
  // the Palm House's far east corner
  { id: 'fw-greenhouse-12', x: 10.8, z: -7.6, y: 0, look: 'grass' },
]);
