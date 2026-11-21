// The Seaside's find spots (src/world/seaside.js, spawn (18, 42)), read off the
// beach's own records: the standing rocks, the marram and sea-holly clumps, the
// driftwood, a lamp post and the wet sand at the waterline. All are on the
// sand (the area has no raised perch that is open, unlabelled and free of
// Sure Claws, so none is raised); one lies in the surf's wading band. None is
// within 15 m of the spawn, 3 m of either yarn-ball spot (src/propsets.js), 2 m
// of a golden mouse (src/goldmice.js) or a collectible, or inside a collider;
// none is at a point of interest's centre, in the beach-hut dog's yard or in
// the rival's disc. test/foundspots.test.js proves each one against the built
// beach.
export const SEASIDE_SPOTS = Object.freeze([
  // in the lee of the boulder at (-8, 10), on the dry sand
  { id: 'fw-seaside-1', x: -9.6, z: 11.4, y: 0, look: 'grass' },
  // against the standing rock at (-20, -2), on the south-west beach
  { id: 'fw-seaside-2', x: -21.8, z: -3.2, y: 0, look: 'grass' },
  // beside the rock at (4, 24), on the north dunes' edge
  { id: 'fw-seaside-3', x: 5.9, z: 25.2, y: 0, look: 'grass' },
  // tucked in the marram at (-30, 5), on the far west beach
  { id: 'fw-seaside-4', x: -31.2, z: 6.4, y: 0, look: 'branch' },
  // in the shadow of the rock at (12, -10), on the south beach
  { id: 'fw-seaside-5', x: 13.8, z: -11, y: 0, look: 'grass' },
  // against the rocks at (-32, -10), on the sand beside the mouse's hiding place
  { id: 'fw-seaside-6', x: -30.2, z: -8.4, y: 0, look: 'grass' },
  // caught in the marram at (-14, 30), on the north-west dunes
  { id: 'fw-seaside-7', x: -15.2, z: 31.4, y: 0, look: 'branch' },
  // in the sea holly at (-2, -14), behind the beach's middle
  { id: 'fw-seaside-8', x: -3.5, z: -15.2, y: 0, look: 'branch' },
  // in the sea holly at (-24, -20), under the cliff's shadow
  { id: 'fw-seaside-9', x: -25.2, z: -21.3, y: 0, look: 'branch' },
  // in the marram at (12, 20), up the beach from the boardwalk
  { id: 'fw-seaside-10', x: 13.4, z: 21.2, y: 0, look: 'branch' },
  // in the marram at (8, 2), a long way down the sand
  { id: 'fw-seaside-11', x: 9.3, z: 3.2, y: 0, look: 'branch' },
  // at the foot of the lamp post at (20, -30), at the south end of the boardwalk
  { id: 'fw-seaside-12', x: 21.2, z: -29, y: 0, look: 'post' },
  // in the surf's wading band by the driftwood at (24, 0), at the waterline
  { id: 'fw-seaside-13', x: 25.6, z: 2, y: 0, look: 'water' },
].map((s) => Object.freeze(s)));
