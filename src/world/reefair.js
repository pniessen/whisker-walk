// =============================================================================
// THE REEF: THE AIR GAUGE (milestone R1), pure rules, no THREE, no clock, no DOM. Five bubbles, 90 s from full. Nothing here can fail her:
//   * the first 20 s of a first visit the gauge is hidden and does not drain;
//   * at two bubbles a soft line is said once (event 'low');
//   * at zero a warm bubble lifts her to the ladder (event 'lift'): the gauge is full again AT ONCE, nothing she owns changes, and the lift
//     always ends (event 'landed') AIR.lift seconds later;
//   * an air pocket (milestone R2) fills the gauge (refill).
// There is no failure state to reach: the state has no "out" flag, the used time stays inside [0, AIR.seconds), the bubbles shown are 1 to 5,
// and a lift always ends. test/reefair.test.js runs a property test over random frame sequences and scans every Reef string for scary words.
// =============================================================================

import { AIR } from './reefplan.js';

export { AIR };

// firstVisit: true on the very first walk here (the gauge stays hidden for the first AIR.hideFirst seconds).
export function createAir({ firstVisit = false } = {}) {
  return { t: 0, used: 0, lift: null, soft: false, firstVisit: !!firstVisit, lifts: 0 };
}

const clean = (dt) => (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0); // one frame never counts for more than a second (a hidden tab's return)

export const airHidden = (s) => s.firstVisit && s.t < AIR.hideFirst;
// The bubbles to draw: 5 when full down to 1 when nearly out (never 0: at zero she is already being lifted and the gauge is full again).
export const bubblesLeft = (s) => Math.min(AIR.bubbles, Math.max(1, Math.ceil((AIR.bubbles * (AIR.seconds - s.used)) / AIR.seconds - 1e-9)));
export const lifting = (s) => s.lift !== null;
// How far through the lift (0 to 1), for the bubble's rise.
export const liftProgress = (s) => (s.lift === null ? 0 : Math.min(1, s.lift / AIR.lift));

export function refill(s) {
  s.used = 0;
  s.soft = false;
}

// Advances the gauge by dt seconds. Returns the one event of this step ('low', 'lift', 'landed') or null. `paused` (inside the Sealab,
// riding a mount) freezes the gauge: the clock still runs but nothing is used and no event fires.
export function stepAir(s, dtRaw, paused = false) {
  const dt = clean(dtRaw);
  s.t += dt;
  if (s.lift !== null) {
    s.lift += dt;
    if (s.lift >= AIR.lift) { s.lift = null; return 'landed'; }
    return null;
  }
  if (paused || airHidden(s)) return null;
  s.used += dt;
  if (s.used >= AIR.seconds) {
    refill(s);
    s.lift = 0;
    s.lifts++;
    return 'lift';
  }
  if (!s.soft && bubblesLeft(s) <= AIR.softAt) { s.soft = true; return 'low'; }
  return null;
}
