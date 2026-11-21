// The Rooftops switch (Rooftops step 2, ruling R1).
//
// Off by default: the Rooftops is in no list a child sees (it has no
// CATALOG.areas row until step 4). On (the address ends in ?roofs=1, or a test
// calls setRoofs(true)), Explore starts a solo walk there: never in a room.
//
// Read at call time, never at import time, like grow.js.
let forced = null;

export function roofsOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('roofs') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setRoofs(value) {
  forced = value === null || value === undefined ? null : !!value;
}

// The places a walk note may name (main.js hands this to readResume): every
// place in the save's walks, the Rooftops only while the switch is on, so a
// Rooftops walk left without it is dropped rather than picked up.
export function resumableAreaIds(walks) {
  return Object.keys(walks).filter((id) => id !== 'roofs' || roofsOn());
}

// The Rooftops' drawing (world/roofs.js, with roofsplan.js, roofsparts.js and
// roofslife.js, which only it uses) is its own download, as every place's is
// (F6): world/areas.js's `roofs` pack, fetched by the one area loader
// (game/areaload.js). A child without the switch never fetches it. main.js
// starts it at boot when the switch is on, and every Rooftops start waits for
// it through walk.js's startWalkWhenReady, like a walk anywhere else.
