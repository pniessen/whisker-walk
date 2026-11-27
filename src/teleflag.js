// DEFAULT: ON in a browser (?gates=0 turns it off); OFF in node tests unless forced.
// RELEASE (2026-11-26): ON for everyone in a browser; ?gates=0 turns it off. Without an address bar (node tests) it stays off unless a test forces it.
// The teleport-gate switch (teleport gates, milestone 0): ?gates=1 (or a test's setTele(true)) shows the spike's one
// pair of gates, Park and Greenhouse (the Greenhouse also wants ?greenhouse=1). Nothing a child sees offers it until
// the plan's milestone 5. Read at call time, never at import time, like lighthouseflag.js.
let forced = null;

export function teleOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('gates') !== '0';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the address bar.
export function setTele(value) {
  forced = value === null || value === undefined ? null : !!value;
}
