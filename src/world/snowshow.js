// =============================================================================
// LANTERN NIGHT: A PURE FUNCTION OF ONE START TIME (milestone V5, story steps 6 and 7). 20 seconds: the three lanterns flare in turn (the Square's, the Pond's, the Hill's), the cottages'
// windows light one after another along the lane, then the Great Fir lights bulb by bulb up to its star, and a spiral of warm sparks rises from it. No THREE, no clock, no random number:
// showAt(k) takes the seconds since the start (the walk's own clock minus T0) and answers what everything looks like, so two cats in a room who start from the same T0 see the same show
// whatever their frame rates, and a late joiner starts at the right second (the Crystal Cave's showAt and the Reef's paradeAt work the same way, world/crystalshow.js and
// world/reefparade.js; world/snowvillewinglive.js carries it out). The pay moment is SHOW.payAt. Reduced motion is the caller's: it holds the END state (everything lit, no sparks) for the
// show's whole length. Every number is finite for any input.
// =============================================================================

import { FIR_STAR } from './snowvillewingplan.js';

export const SHOW = Object.freeze({ secs: 20, payAt: 10.5, motes: 36, top: 7, lanterns: 3, windows: 7 });

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };
// the seconds each lantern flares (the Square's, the Pond's, the Hill's) and the first window; the other windows follow 0.9 s apart; the Great Fir climbs from FIR_FROM to FIR_TO
export const LANTERN_AT = Object.freeze([2.5, 5, 7.5]);
export const WINDOW_FIRST = 3.5;
export const WINDOW_GAP = 0.9;
export const FIR_FROM = 11;
export const FIR_TO = 16.5;
export const MOTE_HUES = Object.freeze([0xffd45a, 0xffa86a, 0xf4ecd8, 0x9ad0ff]);

// showAt(k) -> { active, k, lanterns: [3 flares 0..1], windows: [7 glows 0..1], fir: fraction of the bulbs lit 0..1, star, pay, motes: [{ x, y, z, hue }], moteOpacity }
// `active` is false before the start and after SHOW.secs (then the lanterns read as lit and the fir as lit: the village after the show). A NaN or a negative k is "not started".
export function showAt(kRaw) {
  const k = Number.isFinite(kRaw) ? kRaw : -1;
  const active = k >= 0 && k <= SHOW.secs;
  if (!active) {
    const after = k > SHOW.secs;
    return { active: false, k: Math.min(Math.max(k, -1), SHOW.secs + 1), lanterns: [after ? 1 : 0, after ? 1 : 0, after ? 1 : 0], windows: Array(SHOW.windows).fill(0), fir: after ? 1 : 0, star: after ? 1 : 0, pay: k >= SHOW.payAt, motes: [], moteOpacity: 0 };
  }
  // a lantern flares (a soft bump up to 1 and a little over) then settles to a steady 0.75 for the rest of the show
  const lanterns = LANTERN_AT.map((t0) => { const up = smooth((k - t0) / 1.2); return up === 0 ? 0 : 0.75 + 0.25 * up * (1 - smooth((k - t0 - 1.2) / 1.6)); });
  const windows = [];
  for (let i = 0; i < SHOW.windows; i++) {
    const t0 = WINDOW_FIRST + i * WINDOW_GAP;
    windows.push(smooth((k - t0) / 0.8) * (1 - 0.35 * smooth((k - 17) / 3)));
  }
  const fir = smooth((k - FIR_FROM) / (FIR_TO - FIR_FROM));
  const star = smooth((k - FIR_TO) / 1.2);
  const motes = [];
  const n = SHOW.motes;
  for (let i = 0; i < n; i++) {
    const u = (k * 0.08 + i / n) % 1; // how far up its climb: one lap takes about 12 s
    const a = i * 2.399963 + k * 0.45;
    const r = 0.5 + u * 2.6;
    motes.push({ x: FIR_STAR.x + Math.cos(a) * r, z: FIR_STAR.z + Math.sin(a) * r * 0.9, y: 0.8 + u * SHOW.top, hue: MOTE_HUES[i % 4] });
  }
  const moteOpacity = smooth((k - FIR_FROM) / 2) * smooth((SHOW.secs - k) / 3);
  return { active: true, k, lanterns, windows, fir, star, pay: k >= SHOW.payAt, motes, moteOpacity };
}
