// N0 seam: ON by default in a browser; ?treehouse=0 turns it off. Nothing visible reads it yet. Without an address bar (node tests) it stays off unless forced.
let forced = null;
export function treehouseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('treehouse') !== '0';
  } catch {
    return false;
  }
}
export function setTreehouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}
