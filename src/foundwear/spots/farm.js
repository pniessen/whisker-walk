// Appletree Farm's find spots (src/world/farm.js, spawn (0, 47.8)), read off
// the farm's own records: the hay bales, the sheds, the barn's walls, the
// orchard's rows, the well and the vegetable beds, the pond's rim, and one
// bale for the raised one. None is inside the goats' paddock, the hen run or
// the cow pasture (nor the strip along their fences where the animals walk),
// and none is on the duck pond's water, where the ducks paddle. The Farm has
// no dog yard. None is within 15 m of the spawn, 3 m of either yarn-ball spot
// (src/propsets.js), 2 m of a golden mouse (src/goldmice.js) or a
// collectible, or inside a collider; none is at a point of interest's centre
// or a labelled perch. test/foundspots.test.js proves each one against the
// built farm.
export const FARM_SPOTS = Object.freeze([
  // behind the hay bales by the barn's big doors, on the yard side
  { id: 'fw-farm-1', x: 8, z: -9.2, y: 0, look: 'grass' },
  // beside the lone rock at the tractor shed's east end
  { id: 'fw-farm-2', x: 22.2, z: -9.9, y: 0, look: 'grass' },
  // behind the round bales at the wheat field's edge
  { id: 'fw-farm-3', x: 19.1, z: -19.6, y: 0, look: 'post' },
  // in the scarecrow's clearing, off to its west
  { id: 'fw-farm-4', x: 4.4, z: -29.4, y: 0, look: 'grass' },
  // by the rock at the north edge, beyond the goat paddock
  { id: 'fw-farm-5', x: -19.6, z: -37.8, y: 0, look: 'grass' },
  // north of the goat paddock's fence, a long way from where the goats graze
  { id: 'fw-farm-6', x: -30, z: -38.5, y: 0, look: 'post' },
  // south of the hen run, by the flower patch
  { id: 'fw-farm-7', x: -14.2, z: 0.2, y: 0, look: 'grass' },
  // behind the well in the yard
  { id: 'fw-farm-8', x: -7.8, z: 8.4, y: 0, look: 'post' },
  // beside the vegetable beds' far end
  { id: 'fw-farm-9', x: -27, z: 21, y: 0, look: 'grass' },
  // under the apple trees at the orchard's west end
  { id: 'fw-farm-10', x: 10.4, z: 26.2, y: 0, look: 'branch' },
  // under the apple trees at the orchard's east end
  { id: 'fw-farm-11', x: 36.6, z: 34.6, y: 0, look: 'branch' },
  // at the duck pond's south-east rim, in the shallows
  { id: 'fw-farm-12', x: -24.5, z: 37, y: 0, look: 'water' },
  // on the first hay bale by the barn's doors, one hop up
  { id: 'fw-farm-13', x: 4.6, z: -9.55, y: 0.9, look: 'perch' },
]);
