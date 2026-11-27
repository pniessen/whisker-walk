// DEFAULT: OFF (?roofs=1 turns it on); a developer shortcut only, the place itself is unlocked like any other.
// The Rooftops switch (Rooftops step 2, ruling R1; a developer shortcut since
// Rooftops step 4, ruling T3).
//
// The Rooftops has its CATALOG.areas row now, so the switch gates nothing a
// child sees: she unlocks the place like any other. On (the address ends in
// ?roofs=1, or a test calls setRoofs(true)), Explore still starts a solo walk
// there, never in a room, as the owner and the picture pages use it.
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
// place in the save's walks, the Rooftops among them (step 4: a Rooftops walk
// note resumes with the switch or without).
export function resumableAreaIds(walks) {
  return Object.keys(walks);
}

// The Rooftops' drawing (world/roofs.js, with roofsplan.js, roofsparts.js and
// roofslife.js, which only it uses) is its own download, as every place's is
// (F6): world/areas.js's `roofs` pack, fetched by the one area loader
// (game/areaload.js). A child fetches it when she picks the Rooftops or
// walks to its gate; main.js also starts it at boot when the switch is on, and
// every Rooftops start waits for it through walk.js's startWalkWhenReady, like a walk anywhere else.
