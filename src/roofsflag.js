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
