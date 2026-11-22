// The Lighthouse Point switch (Lighthouse milestone 1; a shortcut at milestone 4).
//
// Until the place has its CATALOG.areas row and its gate (milestone 4), the address ending in
// ?lighthouse=1 (or a test calling setLighthouse(true)) makes Explore start a solo walk there, in
// either edition, never in a room. Nothing a child sees offers it. Read at call time, never at
// import time, like roofsflag.js and marketflag.js.
let forced = null;

export function lighthouseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('lighthouse') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the address bar.
export function setLighthouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}
