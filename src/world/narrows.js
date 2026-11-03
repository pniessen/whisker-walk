// The Narrows: the Gorge's spawn corridor (x < -18, z -16..-6) between the
// west rim and the west wall. Its rock is recoloured here, warm and in
// visible strata with a sunlit rim, through builder.rockTerrain's `tint`
// option (colours only; no vertex moves). Outside NARROWS_ZONE the tint
// fades out over NARROWS_FADE metres and leaves the colour as it was.
import * as THREE from 'three';
import { MASSES } from './gorgeshape.js';
import { strataBand, noise3, RELIEF_DEPTH } from './rockrelief.js';
import { seedFromCode } from '../rng.js';

export const NARROWS_ZONE = Object.freeze({ minX: -62, maxX: -20, minZ: -18, maxZ: -4 });
export const NARROWS_FADE = 3; // metres of blend outside the zone
// Part of rockTerrain's cache key: bump it whenever narrowsTint changes.
export const NARROWS_TINT_KEY = 'narrows-1';

const SEED = seedFromCode('gorge-rock'); // the rock's own seed, so the bands match its shelves
const FOOT = new THREE.Color(0x8a7560); // warm umber at the wall foot
const CREST = new THREE.Color(0xd9b98c); // sunlit sandstone near the top
const SUN = new THREE.Color(0xf2d29a); // the rim's light
// Per band (mod 3): rust, cream, ochre.
const HUES = [[1.08, 0.94, 0.84], [1.04, 1.02, 0.96], [1.06, 1.0, 0.86]];
const BAND_SHADE = 0.14;
const RECESS_DARK = 0.3;
const RIM_LIFT = 0.28;
const RIM_SUN = 0.25;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// Distance in the ground plane from (x, z) to rectangle r (0 inside it).
const rectDist = (r, x, z) => Math.hypot(
  Math.max(r.minX - x, 0, x - r.maxX),
  Math.max(r.minZ - z, 0, z - r.maxZ),
);

// 1 inside the zone, easing to 0 at NARROWS_FADE outside it.
export function narrowsWeight(x, z) {
  const d = rectDist(NARROWS_ZONE, x, z);
  return d <= 0 ? 1 : 1 - smoothstep(0, NARROWS_FADE, d);
}

// The highest top of any rock mass within 1.0 m of (x, z), 0 if none.
export function localTop(x, z) {
  let top = 0;
  for (const m of MASSES) {
    if (rectDist(m, x, z) <= 1.0) top = Math.max(top, m.y0, m.y1 ?? m.y0);
  }
  return top;
}

// rockTerrain's tint: (x, y, z) the vertex before the relief, rgb its colour
// as rockColour made it, recess how deep the relief pushed it in.
export function narrowsTint(x, y, z, rgb, recess) {
  const w = narrowsWeight(x, z);
  if (w <= 0) return [rgb[0], rgb[1], rgb[2]];
  const top = localTop(x, z);
  const t = top > 0 ? clamp01(y / top) ** 0.8 : 0;
  const band = strataBand(x, y, z, SEED);
  const hue = HUES[((band % 3) + 3) % 3];
  const shade = (1 + BAND_SHADE * (2 * noise3(band, 0, 0, SEED + 5) - 1))
    * (1 - RECESS_DARK * clamp01(recess / RELIEF_DEPTH));
  // No mass near (a lip out on the floor): no rim to light.
  const rim = top > 0 ? smoothstep(top - 1.6, top - 0.2, y) : 0;
  const lift = 1 + RIM_LIFT * rim;
  const sun = RIM_SUN * rim;
  const out = [0, 0, 0];
  const keys = ['r', 'g', 'b'];
  for (let i = 0; i < 3; i++) {
    const k = keys[i];
    const c = lerp(lerp(FOOT[k], CREST[k], t) * hue[i] * shade * lift, SUN[k], sun);
    out[i] = clamp01(lerp(rgb[i], c, w));
  }
  return out;
}
