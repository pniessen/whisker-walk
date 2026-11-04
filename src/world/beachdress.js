// Seaside beach dressing (polish-beach). Pure helpers only: no Three objects,
// no Math.random, so tests and the ground tint can call them freely.
import { smoothField } from './dressing.js';

// Linear multipliers [r, g, b] laid over the sand's authored colour. This is an
// authored variation (warmer, a touch darker, patchy over ~40m), not a fix for
// the sand texture: the speckle tile is left alone. The dry, pale, greyer back
// beach sits west of x -20 and blends in over 15m so it reads as drift sand
// under the dune grass. Smooth on purpose: the ground's vertices are 2.2m apart
// and must interpolate it faithfully.
export function sandTint(x, z) {
  const f = smoothField(x, z, 41, 22);
  const m = 1 + 0.06 * f;
  let r = 0.965 * m + 0.015 * f;
  let g = 0.94 * m;
  let b = 0.895 * m - 0.01 * f;
  const u = Math.min(1, Math.max(0, (-20 - x) / 15));
  const t = u * u * (3 - 2 * u);
  const lift = 1 + 0.03 * t;
  r *= lift;
  g *= lift;
  b *= lift * (1 + 0.02 * t);
  return [r, g, b];
}
