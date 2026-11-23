// Lighthouse Point's find spots (src/world/lighthouseplan.js, spawn (14, 36)): three on the cove's far corners,
// four round the rock pools, three on the plateau, one in the sea cave and one by the keeper's cottage. All on the
// ground (no hops needed), none within 15 m of the spawn, 2 m of a golden mouse or a collectible, 3 m of either
// yarn-ball spot or a job's point (the kitten's hiding places, the lever, the bell's rope, a tippable), inside a
// collider or in water. test/foundspots.test.js proves each one against the built place.
export const LIGHTHOUSE_SPOTS = Object.freeze([
  // the cove's west end, where the sand runs up under the cliff
  { id: 'fw-lighthouse-1', x: -3, z: 39, y: 0, look: 'grass' },
  // the cove's east corner, by the surf
  { id: 'fw-lighthouse-2', x: 31, z: 38, y: 0, look: 'water' },
  // the cove's west beach, below the cliff path
  { id: 'fw-lighthouse-3', x: -9, z: 30, y: 0, look: 'grass' },
  // west of the first pool, between the pools and the cliff
  { id: 'fw-lighthouse-4', x: 6, z: 20, y: 0, look: 'water' },
  // between the first and fourth pools
  { id: 'fw-lighthouse-5', x: 15, z: 17.5, y: 0, look: 'water' },
  // beside the third pool, on the sea side
  { id: 'fw-lighthouse-6', x: 27, z: 14.5, y: 0, look: 'water' },
  // the far pools' south side
  { id: 'fw-lighthouse-7', x: 30.5, z: 27, y: 0, look: 'water' },
  // on the plateau, out near the cliff's north edge
  { id: 'fw-lighthouse-8', x: -12, z: -38, y: 0, look: 'post' },
  // on the plateau, west of the tower, clear of Gull Rock's boulder
  { id: 'fw-lighthouse-9', x: -26, z: -30, y: 0, look: 'grass' },
  // on the plateau, between the bench and the tower's stair
  { id: 'fw-lighthouse-10', x: -18, z: -8, y: 0, look: 'post' },
  // in the sea cave, on the cave's quiet side
  { id: 'fw-lighthouse-11', x: -8.5, z: -20.5, y: 0, look: 'post' },
  // behind the keeper's cottage, past its west wall
  { id: 'fw-lighthouse-12', x: -38, z: -12, y: 0, look: 'grass' },
]);
