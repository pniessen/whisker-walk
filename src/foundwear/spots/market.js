// The Market Square's find spots (src/world/marketplan.js, spawn (0, 20.5)),
// read off the square's own plan: behind the stalls' counters, beside the
// barrows and the flower tubs, out at the corners, and two up on a crate
// stack's top (each one hop off the cobbles, no skill). None is in a treat
// counter's watch zone, by a hide, a treat or the apple crate (test/foundspots.test.js's
// job points), by a labelled awning or a point of interest; none is within 15 m of
// the spawn, 3 m of either yarn-ball spot (src/propsets.js), 2 m of a golden
// mouse (src/goldmice.js) or a collectible, or inside a collider.
// test/foundspots.test.js proves each one against the built square.
export const MARKET_SPOTS = Object.freeze([
  // behind the fish stall, between its back and the west shop fronts: walk round it
  { id: 'fw-market-1', x: -14.2, z: 1.5, y: 0, look: 'post' },
  // in the north-west corner, beside the tub of flowers there
  { id: 'fw-market-2', x: -17.5, z: -19.3, y: 0, look: 'grass' },
  // behind the baker's stall, past its back shelf
  { id: 'fw-market-3', x: -9.5, z: -14.5, y: 0, look: 'post' },
  // behind the fruit stall, by the north shop fronts
  { id: 'fw-market-4', x: -3.4, z: -19.4, y: 0, look: 'post' },
  // behind the east barrow, on the side away from the fountain
  { id: 'fw-market-5', x: 17.5, z: -7.5, y: 0, look: 'post' },
  // in the north-east corner, beside the tub of flowers there
  { id: 'fw-market-6', x: 17.2, z: -17, y: 0, look: 'grass' },
  // behind the flower stall, between its back and the east shop fronts
  { id: 'fw-market-7', x: 14.8, z: 0.5, y: 0, look: 'grass' },
  // between the west barrow and the baker's stall
  { id: 'fw-market-8', x: -12.6, z: -13.4, y: 0, look: 'post' },
  // out on the east edge, between the flower stall and the milk cart
  { id: 'fw-market-9', x: 18.6, z: 10.6, y: 0, look: 'post' },
  // up on the flower stall's crates (0.95): one hop off the cobbles
  { id: 'fw-market-10', x: 12.2, z: 1.85, y: 0.95, look: 'perch' },
  // in the south-west corner, beside the tub of flowers there
  { id: 'fw-market-11', x: -17.8, z: 20.2, y: 0, look: 'grass' },
  // up on the apples on top of stack-w, the west crate stack (1.04): one hop off the cobbles
  { id: 'fw-market-12', x: -17.65, z: 12.05, y: 1.04, look: 'perch' },
]);
