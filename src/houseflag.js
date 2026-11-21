// The Old House switch (Old House step 1, ruling H7).
//
// Off by default: the house is in no list a child sees (it has no
// CATALOG.areas row until step 4). On (the address ends in ?house=1, or a test
// calls setHouse(true)), Explore starts a solo walk there: in Clan Edition
// only (Legacy Edition does not get it), and never in a room.
//
// Read at call time, never at import time, like grow.js and roofsflag.js.
// Imports nothing of the house: the house's drawing is its own download
// (world/areas.js's `house` pack), which main.js starts at boot when the
// switch is on, and every house start waits for it through walk.js's
// startWalkWhenReady, like a walk anywhere else.
let forced = null;

export function houseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('house') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setHouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}

// The places a walk note may name, less the house while the switch is off, so
// a house walk left without it is dropped rather than picked up. An array in
// (roofsflag.js's resumableAreaIds), an array out: main.js hands readResume
// resumableHouseIds(resumableAreaIds(progression.state.walks)).
export function resumableHouseIds(ids) {
  return ids.filter((id) => id !== 'house' || houseOn());
}
