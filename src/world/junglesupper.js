// =============================================================================
// THE RAIN SUPPER: A PURE FUNCTION OF ONE START TIME (milestone J5, story steps 6 and 7). 20 seconds on the lodge's veranda: the plates' candles light, the ring of hanging lanterns
// lights one after another, the lodge's two windows and its door glow in turn, a warm rain comes on and the frogs sing in time (the show's beat), fireflies glide in from the leaves and
// settle into a slow orbit over the yard, and a rainbow rises as the rain eases. No THREE, no clock, no random number (the fireflies' starts are a seeded stream, drawn once): supperAt(k)
// takes the seconds since the start (the walk's own clock minus T0) and answers what everything looks like, so two cats in a room who start from the same T0 see the same supper
// whatever their frame rates, and a late joiner starts at the right second (the Treehouse's supperAt, world/treeshow.js, works the same way; world/junglewinglive.js carries it out). The pay
// moment is SUPPER.payAt. Reduced motion is the caller's: it holds the END state (everything lit, no rain, no fireflies) for the supper's whole length. Every number is finite for any input.
// =============================================================================

import { mulberry32 } from '../rng.js';
import { PLATES, WINDOW_COUNT, LANTERN_COUNT, YARD } from './junglewingplan.js';

export const SUPPER = Object.freeze({ secs: 20, payAt: 10.5, flies: 36, windows: WINDOW_COUNT, bulbs: LANTERN_COUNT, plates: PLATES.length, seed: 0x73757070 });

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };
export const CANDLES_AT = 1.5; // the plates' candles are lit from here
export const BULB_FIRST = 2.5;
export const BULB_GAP = 0.45;
export const WINDOW_AT = Object.freeze([3, 4.5, 6]);
export const RAIN_FROM = 1.2; // the warm rain comes on...
export const RAIN_TO = 16.5; // ...and eases here, as the rainbow rises
export const BEAT = 1.1; // seconds between the frogs' notes (the lanterns pulse with it)
export const FLY_HUES = Object.freeze([0xfff0a0, 0xd8f08a, 0xffe08a, 0xc8f0b0]);

// The fireflies' starts, from the show's own seeded stream (so every device draws the same ones): where in the leaves each begins and how it will orbit.
const STARTS = (() => {
  const rng = mulberry32(SUPPER.seed);
  return Object.freeze([...Array(SUPPER.flies)].map((_, i) => Object.freeze({ a0: rng() * Math.PI * 2 + i * 2.399963, sr: 9 + rng() * 6, orbit: 0.9 + rng() * 1.6, y0: YARD.y + 3.5 + rng() * 3.5, y1: YARD.y + 0.2 + rng() * 1.4, spin: 0.4 + rng() * 0.3 })));
})();

// supperAt(k) -> { active, k, candles 0..1, bulbs: [10 glows 0..1], windows: [3 glows 0..1], rain 0..1, rainbow 0..1, beat 0..1, glow 0..1, pay, flies: [{ x, y, z, hue }], flyOpacity }
// `active` is false before the start and after SUPPER.secs (then the lights read as lit: the lodge after the supper). A NaN or a negative k is "not started".
export function supperAt(kRaw) {
  const k = Number.isFinite(kRaw) ? kRaw : -1;
  const active = k >= 0 && k <= SUPPER.secs;
  if (!active) {
    const after = k > SUPPER.secs ? 1 : 0;
    return { active: false, k: Math.min(Math.max(k, -1), SUPPER.secs + 1), candles: after, bulbs: Array(SUPPER.bulbs).fill(after), windows: Array(SUPPER.windows).fill(after), rain: 0, rainbow: 0, beat: 0, glow: 0, pay: k >= SUPPER.payAt, flies: [], flyOpacity: 0 };
  }
  const candles = smooth((k - CANDLES_AT) / 1.2);
  const fade = 1 - 0.25 * smooth((k - 17) / 3); // the lights ease down a little at the very end
  const bulbs = [];
  for (let i = 0; i < SUPPER.bulbs; i++) bulbs.push(smooth((k - BULB_FIRST - i * BULB_GAP) / 0.8) * fade);
  const windows = WINDOW_AT.map((t0) => { const up = smooth((k - t0) / 1.2); return up === 0 ? 0 : (0.75 + 0.25 * up * (1 - smooth((k - t0 - 1.2) / 1.6))) * fade; });
  const rain = smooth((k - RAIN_FROM) / 3) * (1 - smooth((k - RAIN_TO) / 3));
  const rainbow = smooth((k - (RAIN_TO - 0.5)) / 2) * (1 - smooth((k - 19.2) / 0.8));
  const b = (k / BEAT) % 1; // the frogs' note: a quick swell on each beat, only while the rain is on
  const beat = rain * (b < 0.25 ? Math.sin((b / 0.25) * Math.PI) : 0);
  const flies = [];
  const n = SUPPER.flies;
  for (let i = 0; i < n; i++) {
    const s = STARTS[i];
    const u = smooth((k - 3.5 - (i / n) * 5) / 6); // how far it has glided in
    const a = s.a0 + k * s.spin * u; // it circles once it has arrived
    const r = s.sr + (s.orbit - s.sr) * u;
    flies.push({ x: YARD.x + Math.cos(a) * r, z: YARD.z + Math.sin(a) * r * 0.8, y: s.y0 + (s.y1 - s.y0) * u + 0.1 * Math.sin(k * 1.7 + i), hue: FLY_HUES[i % 4] });
  }
  const flyOpacity = smooth((k - 3.5) / 2) * smooth((SUPPER.secs - k) / 3);
  const glow = smooth((k - 0.5) / 1.5) * smooth((SUPPER.secs - k) / 1.5);
  return { active: true, k, candles, bulbs, windows, rain, rainbow, beat, glow, pay: k >= SUPPER.payAt, flies, flyOpacity };
}
