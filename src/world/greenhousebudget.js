// =============================================================================
// THE GREENHOUSE'S BUDGETS (beauty pass 10, 2026-11-28): the one shared place that keeps the many layers of passes 3 to 9 from piling up.
// No mesh, no triangle, no caster, no three.js symbol; pure functions plus one tiny module-level voice ledger.
//   * LIGHT: GAIN_CAP caps the sun shafts' gain once every boost (sun burst, vista, noon) is summed; halo and sparkle alphas of the
//     pooled Points are scaled by lightShare() so pollen + shafts + vista halo + golden moment + puffs + moonbeams cannot together blow out.
//   * EVENTS: at most TWO event effects at full strength at once, by priority her voice > the golden moment > a weather event > the night's
//     visitors; the others dim to LOW (ambient ones) and the golden moment waits (it is once a walk and starts when a slot is free).
//   * SOUND: at most VOICES simultaneous chimes/hoots/tones (VOICES - 1 for the ambient ticks, so they never starve an event); a sound over
//     the cap is simply skipped. Audio only on the game's own audio object, optional-safe.
// =============================================================================
export const GAIN_CAP = 1.55; // the shafts' gain (1 is the plain day); the pass 6 sun burst alone reached 1.7 and with a vista and noon about 2.1
export const MAX_EVENTS = 2;
export const LOW = 0.3; // an ambient event pushed out by the two above it shows at this share
export const VOICES = 4;
export const PRIORITY = Object.freeze(['voice', 'gold', 'weather', 'night']);

export const capGain = (g) => Math.min(GAIN_CAP, Math.max(0, g));
// the share of the additive-ish layers that stays when `sum` (the layers' own alphas, 1 each at full) is more than 2.2 (soft knee)
export const lightShare = (sum) => (sum <= 2.2 ? 1 : 2.2 / sum);

// active: { voice, gold, weather, night } booleans -> { voice, gold, weather, night } shares (1 or LOW) and whether the golden moment may start
export function allocate(active) {
  const out = { voice: 1, gold: 1, weather: 1, night: 1 };
  let used = 0;
  for (const k of PRIORITY) {
    if (!active[k]) continue;
    if (used < MAX_EVENTS) used++; else out[k] = LOW;
  }
  const others = (active.voice ? 1 : 0) + (active.weather ? 1 : 0) + (active.night ? 1 : 0);
  return { ...out, goldMayStart: others < MAX_EVENTS };
}

// ---- sound ledger: end times (audio-context seconds) of the voices now sounding, one list per audio object
const ledgers = new WeakMap();
export function voiceFree(audio, len = 0.6, event = true) {
  try {
    if (!audio || typeof audio !== 'object') return true;
    let ends = ledgers.get(audio);
    if (!ends) ledgers.set(audio, ends = []);
    const ac = audio.getContext?.();
    const now = ac && Number.isFinite(ac.currentTime) ? ac.currentTime : 0;
    if (!(now > 0)) return true; // no running clock (a stand-in, or a context not yet started): nothing to ledger
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= now) ends.splice(i, 1);
    if (ends.length >= (event ? VOICES : VOICES - 1)) return false;
    ends.push(now + len);
    return true;
  } catch { return true; }
}
