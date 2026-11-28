// =============================================================================
// THE OLD HOUSE: BEAUTY PASS 6 (2026-11-28), WEATHER AND ATMOSPHERE AS EVENTS. No mesh, triangle, light or caster: the real clock, the date and the rain's one-day-in-four pick a MOOD, and
// the mood is a handful of numbers (`out`) that the glow shader, the sunbeams, the creatures and the sound beds read each frame:
//   storm   a rainy night: lightning every few seconds lights the rooms through the windows (the barred patches on the floor flare), thunder rolls after it, lamps and hearth glow warmer,
//           a draught belly the curtains and dips the lamp flames, the old boards creak louder, and the panes run with streaks (under reduced motion: a steady dim, no flash);
//   sunny   a clear morning: the window squares are brighter and crawl across the floor, the motes dance bigger, steam curls from the kitchen range, more birds peep;
//   snow    a winter afternoon: soft white light, flakes drift down the panes, the garden under snow, the mantel garland twinkles harder;
//   candle  now and then, of an evening, the lamps go out for a spell: candles (the sconces) and the hearth are the only warm light, the flames wobble, one music box note marks it each way.
// Fixed patterns (no random draws), seeded by the date. Audio calls are optional-safe and only on the game's own audio object. `out` is live and allocated once.
// =============================================================================

import { hash01 } from './builder.js';
import { seasonOf } from './housestories.js';
import { gustAt } from './houseglow.js';

export const MOODS = Object.freeze(['storm', 'sunny', 'snow', 'candle']);
// moodFor(hour, season, rainy, dayKey) -> a mood or null. Pure. A rainy night is a storm; about one evening in twelve is a candle evening; a winter afternoon is snowy; a morning is sunny.
export function moodFor(h, season, rainy, dayKey) {
  const night = h >= 19 || h < 6;
  if (rainy) return night ? 'storm' : null;
  if (h >= 19 && h < 23 && hash01(dayKey, 9, 0x70c1) < 0.085) return 'candle';
  if (season === 0 && h >= 12 && h < 17.5) return 'snow';
  return h >= 6.5 && h < 11 ? 'sunny' : null;
}

const GAPS = Object.freeze([7, 5, 16, 6, 11, 19, 8]); // s between strikes
const flashAt = (a, simple) => (a < 0.9 ? (1 - a / 0.9) ** 2 * (simple ? 0.85 : 0.75 + 0.25 * Math.sin(a * 70)) : 0);
const THUNDER = Object.freeze([[58, 0, 1.3], [46, 0.35, 1.8], [66, 1.0, 1.0]].map(([freq, at, dur]) => Object.freeze({ freq, at, dur })));
export const CANDLE = Object.freeze({ every: 220, start: 12, fade: 4, hold: 100 }); // s: a cycle, when the lamps go, how long they take, how long they stay out
const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

// createHouseMood({ audio, reducedMotion, low, dayKey, rainy, force, scene, lights, part }) -> { out, pick(date), update(dt, t), dispose(), kind }
// `lights` are the walk's own sun and fill (their intensity, and the image light's, follow the mood: a storm dims the house and each flash lights it; put back at dispose); `part` is the day's live look (houseglow.js dayPart).
export function createHouseMood({ audio = null, reducedMotion = false, low = false, dayKey = 0, rainy = false, force = null, scene = null, lights = [], part = null } = {}) {
  const out = { kind: '', flash: 0, lamp: 1, sconce: 1, fire: 1, draught: 1, sun: 1, crawl: 0, snow: 0, rain: 0, wob: 0, tr: 1, tg: 1, tb: 1, creak: 1, birds: 0, motes: 1, steam: 0, lightK: 1 };
  const i0 = lights.map((l) => l.intensity), env0 = scene?.environmentIntensity;
  const rest = () => { out.flash = out.crawl = out.snow = out.rain = out.wob = out.birds = out.steam = 0; out.lamp = out.sconce = out.fire = out.draught = out.sun = out.tr = out.tg = out.tb = out.creak = out.motes = out.lightK = 1; };
  let kind = '', hour = 12, gap = 4, n = 0, age = -1, thunder = -1, since = 0, lit = true;
  return {
    out,
    get kind() { return kind; },
    pick(d) {
      hour = d.getHours() + d.getMinutes() / 60;
      const k = force ?? moodFor(hour, seasonOf(d), rainy, dayKey) ?? '';
      if (k !== kind) { kind = k; gap = 4; n = 0; age = thunder = -1; since = 0; lit = true; }
    },
    update(dt, t) {
      rest();
      out.kind = kind;
      if (kind) body(dt, t);
      const k = out.lightK + out.flash * 1.4;
      lights.forEach((l, i) => { l.intensity = i0[i] * k; });
      if (part && typeof env0 === 'number') scene.environmentIntensity = env0 * part.env * k;
      return out;
    },
    dispose() { lights.forEach((l, i) => { l.intensity = i0[i]; }); if (typeof env0 === 'number') scene.environmentIntensity = env0; },
  };
  function body(dt, t) {
      if (dt > 0) since += dt;
      const rm = reducedMotion;
      if (kind === 'storm') {
        const g = gustAt(t);
        Object.assign(out, { rain: 0.5, lamp: 1.3, sconce: 1.2, fire: 1.3, draught: 1.8 + g, creak: 2.4, wob: rm || low ? 0 : 0.18 * g * g, lightK: 0.5, tr: 0.88, tg: 0.92, tb: 1.0 });
        if (rm) { out.tr *= 0.9; out.tg *= 0.9; out.tb *= 0.9; } // the steady dim: no flash
        if (dt > 0) {
          if ((gap -= dt) <= 0) { gap += GAPS[n++ % GAPS.length]; age = 0; thunder = 0.5 + 0.6 * (n % 3); }
          if (age >= 0 && (age += dt) > 1) age = -1;
          if (thunder >= 0 && (thunder -= dt) < 0) { thunder = -1; audio?.playTune?.(THUNDER, 0.6); }
        }
        out.flash = rm || age < 0 ? 0 : flashAt(age, low);
      } else if (kind === 'sunny') {
        Object.assign(out, { sun: 1.5, lightK: 1.12, motes: 1.9, steam: 1, birds: 1, tr: 1.05, tg: 1.02, tb: 0.94, crawl: Math.max(-0.6, Math.min(0.6, (hour - 8.8) * 0.3)) + (rm || low ? 0 : 0.35 * Math.sin(t * 0.05)) });
      } else if (kind === 'snow') {
        Object.assign(out, { snow: 1, lightK: 1.1, sun: 0.75, tr: 0.98, tg: 1.02, tb: 1.12 });
      } else {
        // candle: the lamps go out a spell each cycle (steady from the start under reduced motion)
        const c = rm ? 1 : smooth((since % CANDLE.every - CANDLE.start) / CANDLE.fade) * (1 - smooth((since % CANDLE.every - CANDLE.start - CANDLE.fade - CANDLE.hold) / CANDLE.fade));
        if ((c > 0.5) !== !lit) { lit = !(c > 0.5); audio?.musicBoxNote?.(lit ? 783.99 : 659.25, 0.5); } // one note each way
        const w = rm || low ? 0.1 : 0.35;
        Object.assign(out, { lamp: 1 - 0.88 * c, sconce: 1 + 0.5 * c, fire: 1 + 0.5 * c, sun: 1 - 0.8 * c, lightK: 1 - 0.6 * c, motes: 1 - 0.5 * c, draught: 1.3, wob: w * c, tr: 1 - 0.3 * c, tg: 1 - 0.36 * c, tb: 1 - 0.42 * c });
      }
  }
}
