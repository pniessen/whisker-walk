// Which places couch play is ready in. A place is "not ready" until its row
// flips here with its own tests (the plan's M3 to M5); test/coopseam.test.js
// fails if a place in CATALOG.areas has no row, so a new place is not forgotten.
export const COOP_READY = {
  neighborhood: true, // milestone 1: two pads, two cats, one shared camera (src/coop/index.js)
  woods: true, river: true, moor: true, pines: true, docks: true, den: true, // milestone 3: the open places (test/coopm3.test.js, test/coopbudget.test.js)
  farm: true, // M5(b): test/coopm5farm.test.js
  park: true, seaside: true, // M5(d): test/coopm5park.test.js, test/coopm5seaside.test.js
  fair: true, // M5(e): test/coopm5fair.test.js
  roofs: true, // M5(f): test/coopm5roofs.test.js
  gorge: true, // M5(c): test/coopm5gorge.test.js
  market: true, // M5(b): test/coopm5market.test.js
  house: true, // M5(d): test/coopm5house.test.js
  lighthouse: true, // M5(d): test/coopm5lighthouse.test.js
  greenhouse: true, moon: false, reef: false, crystal: false,
  snowville: false, treehouse: true, jungle: true,
};

export const coopReady = (areaId) => COOP_READY[areaId] === true;
