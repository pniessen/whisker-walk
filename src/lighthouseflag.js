// DEFAULT: OFF (?lighthouse=1 turns it on); a developer shortcut only, the place itself is unlocked like any other.
// The Lighthouse Point switch (Lighthouse milestone 1; a developer shortcut since milestone 4).
//
// Lighthouse Point has its CATALOG.areas row, its world-map place and its gates now, so the switch gates
// nothing a child sees: she unlocks the place like any other (150 paws after 2 Seaside walks). On (the
// address ends in ?lighthouse=1, or a test calling setLighthouse(true)), Explore still starts a solo walk
// there in either edition, never in a room, as the owner and the picture pages use it. Read at call time,
// never at import time, like roofsflag.js and marketflag.js.
let forced = null;

export function lighthouseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('lighthouse') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the address bar.
export function setLighthouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}
