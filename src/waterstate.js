import { waterClearance, shallowExcess, deckDistance } from './world/builder.js';

// =============================================================================
// THE WATER STATE MACHINE (swimming). Pure, no THREE.
//
// One small object per cat says whether it is dry, wading in the shallow band
// at the shore, or swimming in deep water, read from where it stands. Each
// line it can cross carries a hysteresis, so a cat standing on a line never
// flickers between looks:
//   * the band line (shallow/deep): DEEP_HYST either side;
//   * the waterline: a cat is in the water as soon as it is wet, and out only
//     once it is DRY_HYST clear of it;
//   * every deck edge: water starts DRY_HYST off a deck and ends DRY_HYST
//     onto one, and in between the mode holds.
//
// Leaving the water starts a shake when the cat was in long enough: a swim of
// SHAKE_AFTER_SWIM, or any SHAKE_AFTER_WADE. The swim threshold is what keeps
// a cat hopping along a pier's edge from shaking on every step.
// =============================================================================

export const WADE_SPEED = 0.8; // fraction of pace while wading
export const SHAKE_TIME = 0.8; // seconds; the shake cannot be skipped
export const SHAKE_PACE = 0.6; // fraction of pace while shaking
export const SHAKE_AFTER_WADE = 3; // seconds in the water before a shake
export const SHAKE_AFTER_SWIM = 1.0; // ...or this, if the cat swam (Polish 2: was 0.5)
export const DEEP_HYST = 0.1; // metres either side of the band line
export const DRY_HYST = 0.1; // metres at the waterline and every deck edge

export function createWaterState() {
  return {
    mode: 'dry', wetTime: 0, swam: false, shake: 0, entered: false, shook: false,
    sink: 0, fxClock: 0, ringClock: 0, entryPending: false, placed: true,
  };
}

// stepWaterState(st, waters, x, z, dt) -> st, mutated. `waters` is null (or
// empty) for a perched cat and for an area with no water: the cat is dry, and
// a cat that climbed straight out of the water onto a perch gets no shake.
export function stepWaterState(st, waters, x, z, dt) {
  st.entered = false;
  st.shook = false;
  st.shake = Math.max(0, st.shake - dt);
  if (!waters || waters.length === 0) {
    st.mode = 'dry';
    return st;
  }
  const c = waterClearance(waters, x, z);
  const d = deckDistance(waters, x, z);
  if (st.mode === 'dry') {
    if (c < 0 && d >= DRY_HYST) {
      st.entered = true;
      st.wetTime = 0;
      st.swam = false;
      st.shake = 0;
      st.mode = shallowExcess(waters, x, z) > DEEP_HYST ? 'swim' : 'wade';
    }
    return st;
  }
  // On a deck waterClearance is Infinity, so "open ground" means off every deck.
  if ((d > 0 && c > DRY_HYST) || d <= -DRY_HYST) {
    st.mode = 'dry';
    if ((st.swam && st.wetTime >= SHAKE_AFTER_SWIM) || st.wetTime >= SHAKE_AFTER_WADE) {
      st.shake = SHAKE_TIME;
      st.shook = true;
    }
    return st;
  }
  st.wetTime += dt;
  if (d > 0) {
    const excess = shallowExcess(waters, x, z);
    if (st.mode === 'wade' && excess > DEEP_HYST) st.mode = 'swim';
    else if (st.mode === 'swim' && excess < -DEEP_HYST) st.mode = 'wade';
  }
  if (st.mode === 'swim') st.swam = true;
  return st;
}

// 0 at the start of a shake, rising to 1 as it ends; 0 when not shaking.
export function shakeProgress(st) {
  return st.shake > 0 ? 1 - st.shake / SHAKE_TIME : 0;
}
