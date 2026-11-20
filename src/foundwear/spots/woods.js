// The Woods' find spots (src/world/woods.js, spawn (44, 12)), read off the
// wood's own records. woods.js is NOT edited for these, and none is in its
// KEEP_CLEAR: that list moves the seeded trees and ferns, and with them the
// area's pinned budgets. So every spot is somewhere the layout already leaves
// open (test/foundspots.test.js checks it against woodsTreeSpots and
// woodsUndergrowth), and every one is inside the old core (x and z within
// 50), so it is the same with the ?grow=1 south strip on or off. None is
// within 15 m of the spawn, in the camp, within 3 m of either yarn-ball spot
// (src/propsets.js) or within 2 m of a golden mouse at its own height
// (src/goldmice.js). The bluebell patches are woodsFloor()'s.
export const WOODS_SPOTS = Object.freeze([
  // on top of the mossy boulder (8, 20), the first step of the Great Oak
  // chain: on its ridge (the dodecahedron's top edge, 0.767 m), sunk a little
  // into the moss so it rests on the stone. gm-woods-1 on the branch is 1.6 m
  // off sideways but 1.36 m higher, so their pick-up windows never meet
  { id: 'fw-woods-1', x: 8, z: 20, y: 0.74, look: 'perch' },
  // tucked against the fallen log's north end, at the clearing's edge
  { id: 'fw-woods-2', x: -3, z: 12.9, y: 0, look: 'post' },
  // among the bluebells south of the Great Oak
  { id: 'fw-woods-3', x: 7.1, z: 30.2, y: 0, look: 'grass' },
  // among the bluebells on the west side, toward the River and Marshes
  { id: 'fw-woods-4', x: -42, z: 14.6, y: 0, look: 'grass' },
  // among the bluebells in the glade, over the river
  { id: 'fw-woods-5', x: -11.3, z: -36.2, y: 0, look: 'grass' },
  // in the lake's shallows below the lakeshore, half a metre in (wading)
  { id: 'fw-woods-6', x: -30, z: -34.5, y: 0, look: 'water' },
  // in the reeds along the lakeshore, west of the lookout
  { id: 'fw-woods-7', x: -40.8, z: -33.6, y: 0, look: 'grass' },
  // on the bank beside the log bridge's south foot
  { id: 'fw-woods-8', x: -6.6, z: -7.6, y: 0, look: 'water' },
  // on the glade's bank at the west end of the stepping stones
  { id: 'fw-woods-9', x: 16.9, z: -30.4, y: 0, look: 'water' },
  // at the edge of the pond on the border, by its reeds
  { id: 'fw-woods-10', x: -37.4, z: -3.5, y: 0, look: 'water' },
  // beside the puddle at (20, 34), off the long path
  { id: 'fw-woods-11', x: 21.3, z: 34.5, y: 0, look: 'water' },
  // among the bluebells south-west of the spawn, near the long path
  { id: 'fw-woods-12', x: 40.3, z: 31, y: 0, look: 'grass' },
  // among the bluebells in the glade's north, east of the camp
  { id: 'fw-woods-13', x: 15.6, z: -44.3, y: 0, look: 'grass' },
].map((s) => Object.freeze(s)));
