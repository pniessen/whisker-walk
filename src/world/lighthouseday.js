// =============================================================================
// LIGHTHOUSE POINT: ONE DAILY RHYTHM (beauty pass 5, 2026-11-28). The place keeps the real clock as well as the calendar: dawn
// is a pearl sky with a pink horizon, noon a clear blue, the golden hour is the season's own evening (what the place always
// looked like before), and the night is moon-blue with the beam as the star. `hourLook(hour, seasonData)` is the whole truth:
// the sky pair and the light that lighthouse.js hands the walk, and a colour `tone` (and a `night` 0..1) that the sea's glints,
// sheen and boat lanterns (lighthousealive.js) multiply by, so the sky, the sea and the lanterns agree in hue and timing.
// Recolouring only: no mesh, no triangle. The game reads the real clock (hourNow); only the picture page names an hour.
// =============================================================================

import * as THREE from 'three';

// a key: [hour, sky top, horizon, sun colour, sun intensity, hemi sky, hemi intensity, tone r, g, b, night]
const NIGHT = [0x141c3c, 0x39406e, 0x8fa6ff, 0.45, 0x6d7fc0, 0.52, 0.68, 0.82, 1.12, 1];
const DAWN = [0x9db4de, 0xf5d3d4, 0xffd2c4, 0.98, 0xc4cce8, 0.66, 1, 0.86, 0.92, 0.15];
const NOON = [0x6aa2e2, 0xdbe8f4, 0xfff0d8, 1.5, 0xbcd0f0, 0.7, 0.8, 0.94, 1.08, 0];
const COLOURS = [0, 1, 2, 4]; // the entries that are colours (mixed in RGB), the rest are numbers

export const hourNow = (d = new Date()) => d.getHours() + d.getMinutes() / 60;

const _a = new THREE.Color(); const _b = new THREE.Color();
export function hourLook(hour, sd) {
  const h = ((Number.isFinite(hour) ? hour : 18.5) % 24 + 24) % 24;
  const gold = [sd.sky.top, sd.sky.horizon, sd.light.sunColor, sd.light.sunIntensity, sd.light.hemiSky, sd.light.hemiIntensity, 1, 1, 1, 0];
  const ks = [[0, NIGHT], [4, NIGHT], [6.5, DAWN], [11, NOON], [15, NOON], [17.2, gold], [20, gold], [22.5, NIGHT], [24, NIGHT]];
  let i = 0;
  while (i < ks.length - 2 && h >= ks[i + 1][0]) i++;
  const [h0, a] = ks[i]; const [h1, b] = ks[i + 1];
  const t0 = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
  const t = t0 * t0 * (3 - 2 * t0);
  const m = a.map((x, q) => (COLOURS.includes(q) ? _a.set(x).lerp(_b.set(b[q]), t).getHex() : x + (b[q] - x) * t));
  return {
    sky: { top: m[0], horizon: m[1], warm: _a.set(sd.sky.warm).lerp(_b.set(0x7a78b8), m[9]).getHex() }, // (the horizon's glow goes moon-blue at night)
    light: { sunColor: m[2], sunIntensity: m[3], hemiSky: m[4], hemiIntensity: m[5] },
    tone: [m[6], m[7], m[8]],
    night: m[9],
  };
}
