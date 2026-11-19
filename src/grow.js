// The "bigger areas" switch (docs/superpowers/specs/2026-11-19-bigger-areas-design.md).
//
// Off by default: the game is exactly what it was. On (the address ends in
// ?grow=1, or a test calls setGrow(true)), an area that has strips builds
// with them: the River gains its west strip (src/world/riverwest.js).
//
// Read at build time, never at import time, so one test file can build the
// same area both ways.
let forced = null;

export function growOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('grow') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setGrow(value) {
  forced = value === null || value === undefined ? null : !!value;
}
