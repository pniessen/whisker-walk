import { BRIDGE_PLANK, ISLAND_WOODS, bridgeEnds, fromWoods } from './lake.js';

// The island in the Pines' lake, and the bridge to it, as ground a cat walks
// on. Everything here is in Pines coordinates (metres, x east, z south) and is
// derived from lake.js, so the island the Pines walks on is the very island
// the Woods, the River and the Moor paint on their horizons.
//
// It is the meeting place, under a truce: no cat stands on it, on the bridge
// or on the lake (owner's decision 4), so ISLAND_KEEP_OUT is here beside the
// ground it guards, and it is exported so a later patrol can keep off it too.

const freeze = (o) => Object.freeze(o);

// The island's ground: a disc of dry land cut out of the lake and its bay.
// No rise: it walks flat (the neighbours' low dome is horizon-only, in fog).
const centre = fromWoods('pines', ISLAND_WOODS.x, ISLAND_WOODS.z);
export const ISLAND_LAND = freeze({ x: centre.x, z: centre.z, r: ISLAND_WOODS.r });

// The bridge deck: a strip down the plank's whole length, from 0.6 m onto the
// island to 1 m past the bridge foot onto the Pines' shore, 0.1 m in from each
// side of the plank. It runs past the foot because the cat is held 0.35 m off
// the water and the foot is only 0.2 m onto land: a deck stopping at the foot
// would leave a band at the shore the cat could not cross. The extra metre is
// over land, so it adds no walkable water, and the plank covers it, so the
// deck is still exactly what the kids see.
const [islandEnd, landEnd] = bridgeEnds('pines');
export const BRIDGE_DECK = freeze({
  x1: islandEnd.x, z1: islandEnd.z, x2: landEnd.x, z2: landEnd.z,
  halfW: BRIDGE_PLANK.w / 2 - 0.1,
});

// The lake and the bay round the island, as plain boxes. pines.js builds its
// `lake` and `lake-bay` waters from these, and the keep-out below uses the
// same boxes, so the two can never disagree. They live here rather than in
// pines.js because pines.js imports this module: reading them back from it
// would be an import cycle.
export const LAKE_BOX = freeze({ minX: 26, maxX: 86, minZ: 8, maxZ: 66 });
export const BAY_BOX = freeze({ minX: 0, maxX: 30, minZ: 5, maxZ: 44 });

// Where the Pines' strays and ghosts never stand (src/keepout.js): the lake and
// the bay as solid boxes, so the island inside them is covered too, and the
// bridge as a capsule, its deck plus 0.6 m each side. The margin keeps a cat
// 0.6 m back from either box's edge, so none paces the waterline.
const KEEP_OUT_MARGIN = 0.6;
export const ISLAND_KEEP_OUT = freeze({
  rects: freeze([freeze({ ...LAKE_BOX }), freeze({ ...BAY_BOX })]),
  capsules: freeze([freeze({
    x1: BRIDGE_DECK.x1, z1: BRIDGE_DECK.z1, x2: BRIDGE_DECK.x2, z2: BRIDGE_DECK.z2,
    r: BRIDGE_DECK.halfW + KEEP_OUT_MARGIN,
  })]),
  margin: KEEP_OUT_MARGIN,
});
