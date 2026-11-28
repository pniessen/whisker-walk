// SNOWVILLE, BEAUTY PASS 10: COHERENCE. No mesh, no new draw, no triangle: three small rules that keep passes 2 to 9 from piling up.
//   * ONE GLOW BUDGET (glowScale): the additive layers (window and lamp halos, string lights, the vista's halo, the golden moment, her voice's puffs, the aurora) add up; past GLOW.cap they ease down together.
//   * ONE EVENT RULE (eventGains): at most two event effects show at full strength; priority voice > golden moment > weather event > surprise > festival; the rest ease to 30%.
//   * (the sound cap lives in snowvillesound.js: at most four chime voices at once)
import { SHARED } from './snowvillealive.js';

export const GLOW = Object.freeze({ cap: 2.6, floor: 0.62 });
export const EVENT_ORDER = Object.freeze(['voice', 'golden', 'weather', 'surprise', 'festival']);
export const EASE_TO = 0.3;

/** Gains 1 or EASE_TO per event for the set of events now on (an object of booleans). Pure. */
export function eventGains(on, out = {}) {
  let n = 0;
  for (const k of EVENT_ORDER) { if (on[k]) { n++; out[k] = n <= 2 ? 1 : EASE_TO; } else out[k] = 1; }
  return out;
}
/** The scale for the additive layers: 1 up to the cap, then cap/sum, never below GLOW.floor. Pure. */
export function glowScale(sum) { return sum <= GLOW.cap ? 1 : Math.max(GLOW.floor, GLOW.cap / sum); }

const op = (pts, v) => { const m = pts?.material; if (m) m.opacity = v; };

/** One per walk; call apply() once a frame after every layer's own update. */
export function createCoherence({ weather, vista, rx, festival, wonder, halos = [] }) {
  const on = {}; const gains = {}; let ease = { voice: 1, golden: 1, weather: 1, surprise: 1, festival: 1 }; let scale = 1;
  return {
    get gains() { return gains; }, get scale() { return scale; },
    apply(t) {
      on.voice = (rx?.pulse?.(t) ?? 0) > 0.02;
      on.golden = (vista?.state?.gold ?? -1) >= 0;
      on.weather = !!weather?.state?.kind;
      on.surprise = !!wonder?.state?.kind;
      on.festival = !!festival?.active && (SHARED.fest ?? 0) > 0.05;
      eventGains(on, gains);
      const sm = (a, b) => a + (b - a) * 0.12; // (eased frame by frame, never a jump)
      for (const k of EVENT_ORDER) ease[k] = sm(ease[k], gains[k]);
      for (const p of weather?.points ?? []) if (weather.state.kind || ease.weather < 0.999) op({ material: p.material }, ease.weather);
      op(wonder?.points, ease.surprise); op(festival?.points, ease.festival);
      // the glow budget: what each additive layer asks for (about 1 each at its brightest)
      const sum = (halos.length ? 1.2 : 0) + (vista?.state?.w ?? 0) * 0.9 + (on.golden ? 0.9 : 0) + (on.voice ? 0.6 : 0) + (wonder?.state?.kind === 'aurora' ? 0.7 : 0) + (weather?.w?.glow ?? 1) - 1 + (on.festival ? 0.5 : 0);
      scale = sm(scale, glowScale(sum));
      for (const h of halos) op(h, scale);
      const vg = vista?.points?.[1]; if (vg) vg.material.opacity = on.golden ? 1 : scale;
    },
  };
}
