// The Fairground's find spots (src/world/fair.js, spawn (0, 47.8)), read off
// the fair's own records: behind the stalls' counters, beside the hay-bale
// seats, under the bunting by the picnic lawn, out at the edges and round the
// back of the fair. None is in a ride's footprint (the merry-go-round, the
// teacups, the helter-skelter, the big wheel, the coaster's track and
// station) or a game's play ground (tin-can alley's front, the duck pool, the
// bell's pad, the balloon field), and none is on a showman's job: the
// juggler, the fortune teller, the candyfloss pan or a hide. All of them are on
// the ground: the stalls' counters and the bales' tops are the games' and the
// mice's perches. None is within 15 m of the spawn, 3 m of either yarn-ball
// spot (src/propsets.js), 2 m of a golden mouse (src/goldmice.js) or a
// collectible, or inside a collider; none is at a point of interest's centre
// or a labelled perch. test/foundspots.test.js proves each one against the
// built fair.
export const FAIR_SPOTS = Object.freeze([
  // behind Tin Can Alley, between its back wall and the bandstand path
  { id: 'fw-fair-1', x: -9.8, z: 33.2, y: 0, look: 'post' },
  // behind the toffee apple stall
  { id: 'fw-fair-2', x: -9.2, z: 14, y: 0, look: 'grass' },
  // behind the lemonade stall, where the crates are stacked
  { id: 'fw-fair-3', x: 9, z: 30.5, y: 0, look: 'post' },
  // in the grass behind the popcorn and hoopla stalls
  { id: 'fw-fair-4', x: 14.5, z: 37, y: 0, look: 'grass' },
  // on the picnic lawn, beyond the far table
  { id: 'fw-fair-5', x: -33, z: 24, y: 0, look: 'grass' },
  // under the bunting between the picnic tables and the bench
  { id: 'fw-fair-6', x: -24, z: 28, y: 0, look: 'grass' },
  // beside the hay-bale seats by the bandstand
  { id: 'fw-fair-7', x: -18.5, z: 41.5, y: 0, look: 'grass' },
  // out past the hay-bale seats at the teacups' west edge
  { id: 'fw-fair-8', x: -39.5, z: 1.2, y: 0, look: 'grass' },
  // on the grass south of the helter-skelter, off its path
  { id: 'fw-fair-9', x: -38.5, z: -22, y: 0, look: 'grass' },
  // behind the showmen's van and lorry, in the gap
  { id: 'fw-fair-10', x: -2, z: -41.8, y: 0, look: 'post' },
  // by the hay-bale stack behind the big wheel
  { id: 'fw-fair-11', x: 13.6, z: -35.5, y: 0, look: 'grass' },
  // behind the showmen's wagons
  { id: 'fw-fair-12', x: 16, z: -23.5, y: 0, look: 'grass' },
  // east of the plaza, off the path to the coaster
  { id: 'fw-fair-13', x: 15.5, z: 4.5, y: 0, look: 'post' },
  // in the south-east corner, under the oak and the round tree
  { id: 'fw-fair-14', x: 28, z: 38, y: 0, look: 'branch' },
]);
