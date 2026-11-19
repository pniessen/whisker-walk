// The lines of the Fairground's rides, by ride.
//
// Every line is in the phrase table (src/clanphrases.js, the later table), so
// a set of words can say one differently. This file only gives each its place:
// the table's test wants every phrase() call to name its id in full, so the
// ids are spelled out here, once, and the game asks by ride id (src/fairsim.js).
import { phrase } from './clanphrases.js';

// The journal page of each ride (src/progression.js JOURNAL_TYPES).
export const RIDE_PAGE = Object.freeze({ mgr: 'ridemgr', wheel: 'ridewheel', cups: 'ridecups', slide: 'rideslide', coaster: 'ridecoaster' });

// The first time ever on a ride: one friendly line.
export const RIDE_TOASTS = Object.freeze({
  mgr: () => phrase('fair.toast.mgr'),
  wheel: () => phrase('fair.toast.wheel'),
  cups: () => phrase('fair.toast.cups'),
  slide: () => phrase('fair.toast.slide'),
  coaster: () => phrase('fair.toast.coaster'),
});

// The journal's pages (src/journal.js), by journal id.
export const RIDE_PAGE_WORDS = Object.freeze({
  ridemgr: Object.freeze({ name: () => phrase('fair.page.mgr.name'), hint: () => phrase('fair.page.mgr.hint') }),
  ridewheel: Object.freeze({ name: () => phrase('fair.page.wheel.name'), hint: () => phrase('fair.page.wheel.hint') }),
  ridecups: Object.freeze({ name: () => phrase('fair.page.cups.name'), hint: () => phrase('fair.page.cups.hint') }),
  rideslide: Object.freeze({ name: () => phrase('fair.page.slide.name'), hint: () => phrase('fair.page.slide.hint') }),
  ridecoaster: Object.freeze({ name: () => phrase('fair.page.coaster.name'), hint: () => phrase('fair.page.coaster.hint') }),
});
