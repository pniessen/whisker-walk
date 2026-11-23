// The Greenhouse switch: ?greenhouse=1 (or a test's setGreenhouse(true)) starts a solo walk there, either edition,
// never in a room. Until its milestone 4 nothing a child sees offers it. Read at call time, never at import.
let forced = null;
export function greenhouseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('greenhouse') === '1';
  } catch {
    return false;
  }
}
// For tests and harness pages: true or false forces it, null goes back to the address bar.
export function setGreenhouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}
