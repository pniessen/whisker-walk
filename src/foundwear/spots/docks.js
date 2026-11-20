// The Docks' find spots (src/world/docks.js, spawn (0, -34)), read off the
// district's own records: the market stalls and crane-yard stands, the
// warehouse boxes, the net and crate piles, the container walls and a
// crate step and a quay bollard for the two raised ones. All are on the
// quays or the yards, a good way clear of the canal (none is in the water or
// on an edge she could only reach by swimming). None is within 15 m of the
// spawn, 3 m of either yarn-ball spot (src/propsets.js), 2 m of a golden
// mouse (src/goldmice.js) or a collectible, or inside a collider; none is at
// a point of interest's centre or a labelled perch. test/foundspots.test.js
// proves each one against the built district.
export const DOCKS_SPOTS = Object.freeze([
  // behind the market stall at (-25, -19), on the south-west quay
  { id: 'fw-docks-1', x: -26.6, z: -20.2, y: 0, look: 'post' },
  // beside the stall at (-13.2, -9.4), under the crane yard's lamp
  { id: 'fw-docks-2', x: -11.4, z: -8.2, y: 0, look: 'post' },
  // behind the stall at (-8.6, -13.2), in the south yard
  { id: 'fw-docks-3', x: -8.6, z: -15.5, y: 0, look: 'post' },
  // in the corner of the stalls at (-3, -9), a short way from the south bank
  { id: 'fw-docks-4', x: -1.6, z: -11.3, y: 0, look: 'post' },
  // behind the stall at (2.6, -12.6), by the south market
  { id: 'fw-docks-5', x: 3.6, z: -14.6, y: 0, look: 'post' },
  // by the stall at (10.2, -9.4), on the south quay
  { id: 'fw-docks-6', x: 11.5, z: -7.6, y: 0, look: 'post' },
  // behind the stall at (15, -13), in the south-east yard
  { id: 'fw-docks-7', x: 16.4, z: -14.8, y: 0, look: 'post' },
  // beside the stall at (20.4, -9.6), at the quay's south-east end
  { id: 'fw-docks-8', x: 22, z: -8.6, y: 0, look: 'post' },
  // behind the box at (-19, 6.8), on the north-west quay
  { id: 'fw-docks-9', x: -19.2, z: 8.5, y: 0, look: 'post' },
  // behind the box at (26, 8.5), on the north-east quay
  { id: 'fw-docks-10', x: 27.8, z: 9.6, y: 0, look: 'post' },
  // between the net piles at (22.4, -21) and (24.9, -25.5), in the net yard
  { id: 'fw-docks-11', x: 21, z: -23.5, y: 0, look: 'post' },
  // against the container wall at (-30, -10.6), on the far west quay
  { id: 'fw-docks-12', x: -32.5, z: -9, y: 0, look: 'post' },
  // between the crate stacks at (19, 22.4) and (19, 25.6), north of the warehouse
  { id: 'fw-docks-13', x: 21.5, z: 24, y: 0, look: 'post' },
  // behind the container pair at (-15.6, 30) and (-12.4, 30), up the north alley
  { id: 'fw-docks-14', x: -14, z: 32.2, y: 0, look: 'post' },
  // on the first crate step at (16.2, 9.2), at the foot of the warehouse chain
  { id: 'fw-docks-15', x: 16.2, z: 9.2, y: 1.15, look: 'perch' },
].map((s) => Object.freeze(s)));
