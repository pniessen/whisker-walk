// RELEASE (2026-11-26): ON for everyone in a browser; ?reef=0 turns it off. Without an address bar (node tests) it stays off unless a test forces it.
// The Reef switch: ?reef=1 (or a test's setReef(true)) starts a solo walk under the sea, either edition, never in a room.
// Until the gate hand-off (milestone R6) nothing a child sees offers it. Read at call time, never at import.
let forced = null;
export function reefOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('reef') !== '0';
  } catch {
    return false;
  }
}
// For tests and harness pages: true or false forces it, null goes back to the address bar.
export function setReef(value) {
  forced = value === null || value === undefined ? null : !!value;
}
