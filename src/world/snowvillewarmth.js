// =============================================================================
// SNOWVILLE: THE CHEEKS THEME (milestone V1). A per-walk `cold` value from 0 (warm) to 1: it creeps up while she is out in the open and eases back at a hearth or the
// cocoa stall. It drives ONE thing, the pink on her cheeks (a tint, nothing else): it is never saved, never gates anything, has no number on screen and no end state.
// Pure: no THREE, no clock, no random number. The owner's choice (2026-11-27, O8): tint only, no breath puff.
// =============================================================================
import { WARM_SPOTS } from './snowvilleplan.js';

export const COLD = Object.freeze({ secsToCold: 150, secsToWarm: 8, tintFrom: 0.25, tintMax: 0.55, lineAt: 0.9, lineAgainBelow: 0.2 });
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const nearWarm = (x, z) => WARM_SPOTS.some(([wx, wz, r]) => Math.hypot(x - wx, z - wz) <= r);

/** The next cold value after dt seconds (a bad number leaves it as it was). Always inside [0, 1]. */
export function coldStep(cold, dt, warm) {
  const c = clamp01(Number.isFinite(cold) ? cold : 0);
  if (!(dt > 0) || !Number.isFinite(dt)) return c;
  return clamp01(c + (warm ? -dt / COLD.secsToWarm : dt / COLD.secsToCold));
}

/** How pink the cheeks are, 0 to tintMax: nothing until she is a little cold, then rising smoothly. */
export function cheekTint(cold) {
  const t = clamp01((clamp01(cold) - COLD.tintFrom) / (1 - COLD.tintFrom));
  return COLD.tintMax * t * t * (3 - 2 * t);
}

/** The soft "warm up" line: true once when she first gets properly cold, then again only after she has warmed right up. */
export function lineStep(state, cold) {
  if (!state.said && cold >= COLD.lineAt) { state.said = true; return true; }
  if (state.said && cold <= COLD.lineAgainBelow) state.said = false;
  return false;
}
