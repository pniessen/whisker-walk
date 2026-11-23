// Which places couch play is ready in. A place is "not ready" until its row
// flips here with its own tests (the plan's M3 to M5); test/coopseam.test.js
// fails if a place in CATALOG.areas has no row, so a new place is not forgotten.
export const COOP_READY = {
  neighborhood: true, // milestone 1 builds the walk; milestone 0 only marks the place
  park: false, seaside: false, woods: false, river: false, moor: false, pines: false,
  docks: false, den: false, gorge: false, farm: false, fair: false, roofs: false,
  market: false, house: false, lighthouse: false,
};

export const coopReady = (areaId) => COOP_READY[areaId] === true;
