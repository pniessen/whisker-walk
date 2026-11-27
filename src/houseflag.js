// DEFAULT: OFF (?house=1 turns it on); a developer shortcut only, the place itself is unlocked like any other.
// The Old House switch (Old House step 1, ruling H7; a developer shortcut
// since Old House step 4, docs/superpowers/plans/2026-11-21-old-house-step4-into-the-game.md,
// ruling W3).
//
// The house has its CATALOG.areas row and its world-map place now (Clan
// Edition only), so the switch gates nothing a child sees: she unlocks the
// place like any other. On (the address ends in ?house=1, or a test calls
// setHouse(true)), Explore still starts a solo walk there: in Clan Edition
// only (Legacy Edition does not get it), and never in a room, as the owner and
// the picture pages use it.
//
// Read at call time, never at import time, like grow.js and roofsflag.js.
// Imports nothing of the house: the house's drawing is its own download
// (world/areas.js's `house` pack), which main.js starts at boot when
// housePrefetch says so, and every house start waits for it through walk.js's
// startWalkWhenReady, like a walk anywhere else.
import { isClanEdition } from './edition.js';

let forced = null;

export function houseOn() {
  if (forced !== null) return forced;
  try {
    const search = globalThis.location?.search;
    return typeof search === 'string' && new URLSearchParams(search).get('house') === '1';
  } catch {
    return false;
  }
}

// For tests and harness pages: true or false forces it, null goes back to the
// address bar.
export function setHouse(value) {
  forced = value === null || value === undefined ? null : !!value;
}

// The places a walk note may name (W3): in Clan Edition every id, the house
// among them, with the switch or without; in Legacy less the house, so a
// house walk left there is dropped rather than picked up. An array in
// (roofsflag.js's resumableAreaIds), an array out: main.js hands readResume
// resumableHouseIds(..., progression.state).
export function resumableHouseIds(ids, state) {
  return isClanEdition(state) ? ids : ids.filter((id) => id !== 'house');
}

// Whether main.js fetches the house's download at boot (W3): with the switch,
// in Clan Edition only. Legacy never fetches it.
export function housePrefetch(state) {
  return houseOn() && isClanEdition(state);
}
