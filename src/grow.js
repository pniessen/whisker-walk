// The "bigger areas" switch (docs/superpowers/specs/2026-11-19-bigger-areas-design.md).
//
// DEFAULT: ON in a browser (?grow=0 turns it off); OFF in node tests unless forced.
// Switched on 2026-11-27 (owner). An area that has strips builds with them: the River
// gains its west and south strips (src/world/riverwest.js), the Pines, Woods and Moor their own.
//
// Read at build time, never at import time, so one test file can build the
// same area both ways.
let forced = null;

export function growOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('grow') !== '0';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setGrow(value) {
  forced = value === null || value === undefined ? null : !!value;
}
