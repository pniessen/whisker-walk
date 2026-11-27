// RELEASE (2026-11-26): ON for everyone in a browser; ?greenhouse=0 turns it off. Without an address bar (node tests) it stays off unless a test forces it.
// The Greenhouse switch: ?greenhouse=1 (or a test's setGreenhouse(true)) starts a solo walk there, either edition,
// never in a room. Until its milestone 4 nothing a child sees offers it. Read at call time, never at import.
let forced = null;
export function greenhouseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('greenhouse') !== '0';
  } catch {
    return false;
  }
}
// For tests and harness pages: true or false forces it, null goes back to the address bar.
export function setGreenhouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}

// The developer shortcut (walk.js beginWalkFromHomebase): ?greenhouse=1 EXPLICITLY in the address starts a solo walk here. Never true just because the area is released.
export function greenhouseShortcut() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('greenhouse') === '1';
  } catch {
    return false;
  }
}
