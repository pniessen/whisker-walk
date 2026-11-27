// =============================================================================
// THE FIREFLY SUPPER: A PURE FUNCTION OF ONE START TIME (milestone T5, story steps 6 and 7). 20 seconds: the table's candles light, the ring of hanging lanterns lights one after
// another, the Bakery's, the Bookshop's and the Bell Tower's windows glow in turn, and the fireflies glide in from the leaves and settle into a slow orbit over the table. No THREE,
// no clock, no random number: supperAt(k) takes the seconds since the start (the walk's own clock minus T0) and answers what everything looks like, so two cats in a room who start from the
// same T0 see the same supper whatever their frame rates, and a late joiner starts at the right second (Snowville's showAt, world/snowshow.js, works the same way; world/treehousewinglive.js
// carries it out). The pay moment is SUPPER.payAt. Reduced motion is the caller's: it holds the END state (everything lit, no fireflies) for the supper's whole length. Every number is
// finite for any input.
// =============================================================================

import { TABLE, LAMP_RING } from './treehousewingplan.js';

export const SUPPER = Object.freeze({ secs: 20, payAt: 10.5, flies: 40, windows: 3, bulbs: LAMP_RING.n });

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };
export const CANDLES_AT = 1.5; // the table's candles are lit from here
export const BULB_FIRST = 2.5;
export const BULB_GAP = 0.45;
export const WINDOW_AT = Object.freeze([3, 4.5, 6]);
export const FLY_HUES = Object.freeze([0xfff0a0, 0xd8f08a, 0xffe08a, 0xc8f0b0]);

// supperAt(k) -> { active, k, candles 0..1, bulbs: [12 glows 0..1], windows: [3 glows 0..1], pay, flies: [{ x, y, z, hue }], flyOpacity }
// `active` is false before the start and after SUPPER.secs (then the lights read as lit: the village after the supper). A NaN or a negative k is "not started".
export function supperAt(kRaw) {
  const k = Number.isFinite(kRaw) ? kRaw : -1;
  const active = k >= 0 && k <= SUPPER.secs;
  if (!active) {
    const after = k > SUPPER.secs ? 1 : 0;
    return { active: false, k: Math.min(Math.max(k, -1), SUPPER.secs + 1), candles: after, bulbs: Array(SUPPER.bulbs).fill(after), windows: Array(SUPPER.windows).fill(after), pay: k >= SUPPER.payAt, flies: [], flyOpacity: 0 };
  }
  const candles = smooth((k - CANDLES_AT) / 1.2);
  const fade = 1 - 0.3 * smooth((k - 17) / 3); // the lights ease down a little at the very end
  const bulbs = [];
  for (let i = 0; i < SUPPER.bulbs; i++) bulbs.push(smooth((k - BULB_FIRST - i * BULB_GAP) / 0.8) * fade);
  const windows = WINDOW_AT.map((t0) => { const up = smooth((k - t0) / 1.2); return up === 0 ? 0 : (0.75 + 0.25 * up * (1 - smooth((k - t0 - 1.2) / 1.6))) * fade; });
  const flies = [];
  const n = SUPPER.flies;
  for (let i = 0; i < n; i++) {
    const g = i * 2.399963; // the golden angle: where it starts in the leaves
    const u = smooth((k - 3.5 - (i / n) * 5) / 6); // how far it has glided in
    const sr = 11 + (i % 5) * 1.4; // start radius from the table
    const orbit = 0.8 + (i % 4) * 0.4; // its orbit
    const a = g + k * (0.5 + (i % 3) * 0.12) * u; // it circles faster once it has arrived
    const r = sr + (orbit - sr) * u;
    const y0 = TABLE.y + 5 + (i % 7) * 0.9; // it starts up in the leaves
    const y1 = TABLE.y + 1.0 + (i % 6) * 0.28 + 0.12 * Math.sin(k * 1.7 + i);
    flies.push({ x: TABLE.x + Math.cos(a) * r, z: TABLE.z + Math.sin(a) * r * 0.9, y: y0 + (y1 - y0) * u, hue: FLY_HUES[i % 4] });
  }
  const flyOpacity = smooth((k - 3.5) / 2) * smooth((SUPPER.secs - k) / 3);
  return { active: true, k, candles, bulbs, windows, pay: k >= SUPPER.payAt, flies, flyOpacity };
}
