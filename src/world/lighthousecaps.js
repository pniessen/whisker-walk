// LIGHTHOUSE POINT: BEAUTY PASS 10, the coherence caps (2026-11-28). One shared place, made once a walk by the sound (sound.caps), for the three things the nine passes stacked:
//   GLOW BUDGET   each additive source says its weight each frame (beam, sun glints and stars, lanterns, vista halo, golden moment, voice sprays); the sum over 1 scales every source but the beam
//                 by 1/sum (never under 0.55), eased. The lamp's beam is the hero and keeps its own opacity.
//   EVENT RULE    at most TWO event effects at once, in this priority: her voice > the golden moment > a weather event (storm, fog) > a surprise (ship, dolphins, rainbow, aurora, lightning).
//                 The two highest that are active play in full; any lower one eases to 30%. (Active = level over 0.05.)
//   SOUND RULE    at most four transient accents (gull, seal, chime, thunder or surf swell) sound at once; a fifth is skipped. The beds are not counted.
// No clock of its own (time arrives as dt and as the audio clock), no random number.
export const CAPS = Object.freeze({ budget: 1, floor: 0.55, low: 0.3, active: 0.05, voices: 4 });
const ORDER = Object.freeze(['voice', 'golden', 'weather', 'surprise']);

export function createCaps() {
  const lvl = { voice: 0, golden: 0, weather: 0, surprise: 0 }; const mul = { voice: 1, golden: 1, weather: 1, surprise: 1 };
  const w = {}; let glowK = 1; let ends = [];
  return {
    /** an event layer's level this frame, 0..1 */
    level(name, v) { lvl[name] = v > 0 ? (v > 1 ? 1 : v) : 0; },
    /** the multiplier (0.3..1) an event layer should scale its look by */
    k(name) { return mul[name] ?? 1; },
    /** an additive source's weight this frame */
    glow(name, v) { w[name] = v > 0 ? v : 0; },
    /** the scale (0.55..1) for every additive source but the beam */
    gk() { return glowK; },
    /** once a frame, before the layers update */
    frame(dt) {
      const e = 1 - Math.exp(-Math.max(0, dt) / 0.7); let n = 0;
      for (const name of ORDER) { const on = lvl[name] > CAPS.active; const tgt = on && n >= 2 ? CAPS.low : 1; if (on) n++; mul[name] += (tgt - mul[name]) * e; }
      let sum = 0; for (const k of Object.keys(w)) sum += w[k];
      glowK += (Math.max(CAPS.floor, Math.min(1, CAPS.budget / (sum || 1))) - glowK) * e;
    },
    /** claims one of the four accent slots from `now` (audio clock, s) for `dur` s; false when all four are sounding */
    slot(now, dur) { ends = ends.filter((x) => x > now); if (ends.length >= CAPS.voices) return false; ends.push(now + dur); return true; },
    get state() { return { lvl: { ...lvl }, mul: { ...mul }, glowK, accents: ends.length, glowSum: Object.values(w).reduce((a, b) => a + b, 0) }; },
  };
}
