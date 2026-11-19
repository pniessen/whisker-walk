// =============================================================================
// The Fairground's rides in the walk: what each event of src/fairlive.js says
// and sounds like.
//
// A ride pays nothing and costs nothing. The first time on each ride on a
// walk fills its journal page (its count is the walks she has ridden it on);
// the first time EVER also shows one friendly line. Like every once-a-walk
// thing it is kept in the discovery log, so a walk picked up again does not
// count the ride twice.
// =============================================================================
import { RIDE_PAGE, RIDE_TOASTS } from '../fairwords.js';

export const rideKey = (ride) => `fair-ride-${ride}`;

// noteRide(ride, { log, progression, hud }) → { fresh, first }.
//   fresh   the first time on this ride on this walk
//   first   and the first time ever
export function noteRide(ride, { log, progression, hud }) {
  const page = RIDE_PAGE[ride];
  const key = rideKey(ride);
  if (!page || log.count(key) > 0) return { fresh: false, first: false };
  const seen = progression.state?.journal?.[page];
  const first = !(Number.isFinite(seen) && seen > 0);
  log.mark(key);
  progression.recordSighting(page);
  if (first) hud.toast(RIDE_TOASTS[ride]());
  return { fresh: true, first };
}

// handleFairEvent(e, ctx): one event of the rides.
//   ctx   { hud, audio, log, progression, session }
export function handleFairEvent(e, ctx) {
  const { audio, session } = ctx;
  switch (e.type) {
    case 'note': audio.musicBoxNote?.(e.freq, e.volume); break;
    case 'ride': noteRide(e.ride, ctx); break;
    case 'slide': audio.pounceWhoosh?.(); break;
    case 'slide-end': audio.landThump?.(); break;
    case 'dismount': session?.fx?.burst(session.cat.position, 0xcbb8a0, 8); break;
    default: break;
  }
}
