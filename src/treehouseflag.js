// DEFAULT: OFF (?treehouse=1 turns it on), in a browser and in node tests alike.
// The Treehouse village switch. Milestone T1 puts the place in the catalog and on the map, so until its release pass the village is OFF for everyone: ?treehouse=1 turns it on
// (the catalog row, its map circle, the Farm's north signpost and the walk are all behind it: src/edition.js areaShown, src/gateways.js liveEndsFor). The release milestone
// flips the default to on (?treehouse=0 then turns it off), as the Crystal Cave's was. Without an address bar (node tests) it stays off unless a test forces it.
let forced = null;
export function treehouseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('treehouse') === '1';
  } catch {
    return false;
  }
}
export function setTreehouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}
