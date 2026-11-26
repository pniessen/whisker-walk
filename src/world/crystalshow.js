// =============================================================================
// THE CRYSTAL CAVE'S LIGHT SHOW: A PURE FUNCTION OF ONE START TIME (milestone C5, mission steps 6 and 7). 20 seconds: the Heart Crystal wakes and glows, a wave of
// light runs from the blue crystals to the gold ones to the rose ones and back to the Heart, and a spiral of coloured motes rises from the Heart to the dome.
// No THREE, no clock, no random number: showAt(k) takes the seconds since the start (the walk's own clock minus T0) and answers what everything looks like, so two
// cats in a room who start from the same T0 see the same show whatever their frame rates, and a late joiner starts at the right second (the Reef's parade works the
// same way, world/reefparade.js). The pay moment is SHOW.payAt. Reduced motion is the caller's: it holds the glow at its gentle peak and draws no motes.
// =============================================================================

import { HEART_GREAT } from './crystalwingplan.js';

export const SHOW = Object.freeze({ secs: 20, payAt: 11, motes: 48, top: 14 });

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const smooth = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };
// a soft bump of width `w` seconds (the sides eased) centred on `c`
const bump = (k, c, w) => smooth(1 - Math.abs(k - c) / w);
const HUE_ORDER = Object.freeze(['blue', 'gold', 'rose', 'heart']);
const HUE_AT = Object.freeze({ blue: 4, gold: 7, rose: 10, heart: 13 });
export const MOTE_HUES = Object.freeze(['rose', 'blue', 'gold', 'heart']);

// showAt(k) -> { active, k, heart, waves: { blue, gold, rose, heart }, pay, motes: [{ x, y, z, hue }], moteOpacity }
// `active` is false before the start and after SHOW.secs. Everything is finite for any input (a NaN or a negative k is "not started").
export function showAt(kRaw) {
  const k = Number.isFinite(kRaw) ? kRaw : -1;
  const active = k >= 0 && k <= SHOW.secs;
  if (!active) return { active: false, k: Math.min(Math.max(k, -1), SHOW.secs + 1), heart: k > SHOW.secs ? 1 : 0, waves: { blue: 0, gold: 0, rose: 0, heart: 0 }, pay: k >= SHOW.payAt, motes: [], moteOpacity: 0 };
  const waves = {};
  for (const h of HUE_ORDER) waves[h] = Math.max(bump(k, HUE_AT[h], 2.4), h === 'heart' ? smooth((k - 13) / 2) * smooth((SHOW.secs - k) / 4) : 0);
  const motes = [];
  const n = SHOW.motes;
  for (let i = 0; i < n; i++) {
    const u = (k * 0.09 + i / n) % 1; // how far up its climb: one lap takes about 11 s
    const a = i * 2.399963 + k * 0.5;
    const r = 0.8 + u * 7.5;
    motes.push({ x: HEART_GREAT.x + Math.cos(a) * r, z: HEART_GREAT.z + Math.sin(a) * r * 0.9, y: 1.2 + u * SHOW.top * 0.6, hue: MOTE_HUES[i % 4] });
  }
  const moteOpacity = smooth((k - 1.5) / 2) * smooth((SHOW.secs - k) / 3);
  return { active: true, k, heart: smooth(k / 3), waves, pay: k >= SHOW.payAt, motes, moteOpacity };
}
