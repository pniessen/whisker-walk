// The Crystal Cave switch: ?crystal=1 (or a test's setCrystal(true)) starts a solo walk in the cave, either edition, never in a room.
// Until the gate hand-off (milestone C6) nothing a child sees offers it. Read at call time, never at import.
let forced = null;
export function crystalOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('crystal') === '1';
  } catch {
    return false;
  }
}
// For tests and harness pages: true or false forces it, null goes back to the address bar.
export function setCrystal(value) {
  forced = value === null || value === undefined ? null : !!value;
}
