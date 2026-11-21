// The Market Square switch (Market step 1; a developer shortcut since Market
// step 4, ruling V17).
//
// The Market has its CATALOG.areas row and its world-map place now, so the
// switch gates nothing a child sees: she unlocks the place like any other. On
// (the address ends in ?market=1, or a test calls setMarket(true)), Explore
// still starts a solo walk there in Clan Edition, never in a room, never in
// Legacy, as the owner and the picture pages use it.
//
// Read at call time, never at import time, like roofsflag.js and grow.js.
let forced = null;

export function marketOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('market') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setMarket(value) {
  forced = value === null || value === undefined ? null : !!value;
}

// The places a walk note may name (main.js passes its list through this):
// every id, the Market among them (step 4: a Market walk note resumes with the
// switch or without).
export function marketResumable(ids) {
  return ids;
}
