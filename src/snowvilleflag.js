// N0 seam: ON by default in a browser; ?snowville=0 turns it off. Nothing visible reads it yet. Without an address bar (node tests) it stays off unless forced.
let forced = null;
export function snowvilleOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('snowville') !== '0';
  } catch {
    return false;
  }
}
export function setSnowville(value) {
  forced = value === null || value === undefined ? null : !!value;
}
