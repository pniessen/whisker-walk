// The City Park's find spots (src/world/park.js, spawn (0, 45)), read off the
// park's own records: its bushes, benches, pond, lamp posts and flowers. The
// three raised ones rest on the stone or the seat at shipped perches (one hop
// up, no skill); the rest
// are on the grass or in the pond's wading band. None is within 15 m of the
// spawn, 3 m of either yarn-ball spot (src/propsets.js) or 2 m of a golden
// mouse (src/goldmice.js; the oak bench is gm-park-1's, so no find is on it). test/foundspots.test.js
// proves each one against the built park.
export const PARK_SPOTS = Object.freeze([
  // on the fountain-walk bench at (-4, 14), the seat's east end: on the
  // slats (0.54 m), a centimetre under the perch's 0.58 so it lies on them
  { id: 'fw-park-1', x: -3.45, z: 13.55, y: 0.55, look: 'perch' },
  // on the fountain basin's rounded outer lip (r 2.58 from the fountain's
  // centre, y 0.69), toward the fountain-edge lookout perch, 0.98 m from it.
  // The perch itself (2.8, 22.2) is 3.56 m out, off the stone: a find there
  // hung in the air beside the basin
  { id: 'fw-park-2', x: 2.03, z: 21.59, y: 0.69, look: 'perch' },
  // on the bench by the south-west lawn walk, at its own perch, on the slats
  { id: 'fw-park-3', x: -10, z: -20, y: 0.55, look: 'perch' },
  // caught in the bush at (-10, 26), west of the fountain walk
  { id: 'fw-park-4', x: -10.4, z: 26.4, y: 0, look: 'branch' },
  // caught in the bush at (10, 18), by the fountain's east spur
  { id: 'fw-park-5', x: 10.4, z: 18.4, y: 0, look: 'branch' },
  // caught in the bush at (4, -24), off the walk to the east corner
  { id: 'fw-park-6', x: 4.4, z: -24.4, y: 0, look: 'branch' },
  // caught in the far bush at (35, 20), on the east lawn
  { id: 'fw-park-7', x: 35.4, z: 20.4, y: 0, look: 'branch' },
  // in the grass under the bush at (-35, 35), in the south-west corner
  { id: 'fw-park-8', x: -35.4, z: 35.4, y: 0, look: 'grass' },
  // in the pond's shallows on its west side, 0.6 m in (wading, not deep)
  { id: 'fw-park-9', x: -20.4, z: 2, y: 0, look: 'water' },
  // at the water's edge on the pond's far side from the fountain, half a metre out
  { id: 'fw-park-10', x: -14, z: -5.5, y: 0, look: 'water' },
  // at the foot of the lamp post at (-4, -14), by the cardboard box
  { id: 'fw-park-11', x: -4.5, z: -14.4, y: 0, look: 'post' },
  // in the flower patch at (40, -10), by the east hedge
  { id: 'fw-park-12', x: 40.3, z: -10.3, y: 0, look: 'grass' },
  // in the leaf litter under the corner tree at (40, 40)
  { id: 'fw-park-13', x: 41.2, z: 40.8, y: 0, look: 'grass' },
].map((s) => Object.freeze(s)));
