// Found outfits: the rules a find follows, shared by the spots, the walk and
// the tests. Nothing here is random or reads the clock.

// A find never sits within this many metres of the spawn (spec: "A find never
// sits within 15 m of the spawn").
export const SPAWN_CLEAR = 15;

// The pick-up window, the same as a golden mouse's (goldmice.js checkFind):
// under `r` metres sideways and `dy` metres up or down.
export const PICKUP = Object.freeze({ r: 1.0, dy: 0.9 });
