// DEFAULT: OFF (?jungle=1 turns it on), in a browser and in node tests alike.
// The Jungle lodge switch. Milestone J1 puts the place in the catalog and on the map, so until its release pass the lodge is OFF for everyone: ?jungle=1 turns it on (the
// catalog row, its map circle, the Greenhouse's stone ring and the walk are all behind it: src/edition.js areaShown, src/teleport.js liveTeleEnds). The release milestone flips the
// default to on (?jungle=0 then turns it off), as the Treehouse's and the Crystal Cave's were. Without an address bar (node tests) it stays off unless a test forces it.
let forced = null;
export function jungleOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('jungle') === '1';
  } catch {
    return false;
  }
}
export function setJungle(value) {
  forced = value === null || value === undefined ? null : !!value;
}

// The developer shortcut (walk.js beginWalkFromHomebase): ?jungle=1 EXPLICITLY in the address starts a solo walk in the Jungle lodge, either edition, never in a room.
export function jungleShortcut() {
  if (forced !== null) return forced;
  return jungleOn();
}
