// Which places couch play is ready in. A place is "not ready" until its row
// flips here with its own tests (the plan's M3 to M5); test/coopseam.test.js
// fails if a place in CATALOG.areas has no row, so a new place is not forgotten.
export const COOP_READY = {
  neighborhood: true, // milestone 1: two pads, two cats, one shared camera (src/coop/index.js)
  woods: true, river: true, moor: true, pines: true, docks: true, den: true, // milestone 3: the open places (test/coopm3.test.js, test/coopbudget.test.js)
  park: false, seaside: false, gorge: false, farm: false, fair: false, roofs: false,
  market: false, house: false, lighthouse: false, greenhouse: false, moon: false, reef: false, crystal: false,
  snowville: false, treehouse: false, jungle: false,
};

export const coopReady = (areaId) => COOP_READY[areaId] === true;
