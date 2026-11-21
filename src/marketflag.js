// The Market Square switch (Market step 1).
//
// Off by default: the Market is in no list a child sees (it has no
// CATALOG.areas row and no map spot until step 4). On (the address ends in
// ?market=1, or a test calls setMarket(true)), Explore starts a solo walk
// there in Clan Edition: never in a room, never in Legacy.
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

// The places a walk note may name (main.js passes its list through this): a
// Market walk left without the switch is dropped rather than picked up.
export function marketResumable(ids) {
  return ids.filter((id) => id !== 'market' || marketOn());
}

// The Market's drawing (world/market.js, with marketplan.js, marketparts.js
// and the rest, which only it uses) is its own download, as every place's is:
// world/areas.js's `market` pack, fetched by the one area loader. A child
// without the switch never fetches it.
