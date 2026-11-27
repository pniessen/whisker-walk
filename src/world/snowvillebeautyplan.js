// =============================================================================
// SNOWVILLE: THE BEAUTY PASS'S PLAN (milestone V8). Pure data and pure functions (no clock, no Math.random; every scatter has its own seeded stream, so the older layouts in
// snowvilleplan.js stay put): the ground's extra tones (a cooler fir-wood floor, a pinker sled bank, a pale pond rim, a greyer trodden square), the blue shade under firs and
// round cottage walls, the paths trodden to each door, the warm light pools under the windows; and the far mountain ridge that makes the skyline. snowvilleparts.js reads the
// ground shade per vertex (free: no mesh, no triangle); snowvillebeauty.js draws the rest. No visible text here, so no word sets.
// =============================================================================

import * as P from './snowvilleplan.js';
import { mulberry32 } from '../rng.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fall = (d, r) => clamp01(1 - d / r);

let _firs = null;
const firs = () => (_firs ??= P.scatterFirs().filter((k) => !k.rim));

// A cottage's own frame: where (x, z) lies by its door (lx across, lz out from the door side), as a distance outside the footprint.
function cottageFrame(c, x, z) {
  const dx = x - c.x; const dz = z - c.z;
  const cs = Math.cos(c.yaw); const sn = Math.sin(c.yaw);
  const lx = dx * cs - dz * sn; const lz = dx * sn + dz * cs;
  return { lx, lz, out: Math.hypot(Math.max(0, Math.abs(lx) - c.w / 2), Math.max(0, Math.abs(lz) - c.d / 2)) };
}

// The path trodden from a door out toward its way (the cottage's yaw points at it), `len` m long.
function doorPath(c, x, z, len = 5.5) {
  const ux = Math.sin(c.yaw); const uz = Math.cos(c.yaw);
  const sx = c.x + ux * (c.d / 2 + 0.3); const sz = c.z + uz * (c.d / 2 + 0.3);
  const t = Math.max(0, Math.min(len, (x - sx) * ux + (z - sz) * uz));
  return Math.hypot(x - (sx + ux * t), z - (sz + uz * t));
}

/** Tints colour `c` (a THREE.Color holding the snow so far) for one ground vertex; `d` is a scratch colour. */
export function groundShade(x, z, c, d) {
  // zone tones: a cooler, greyer floor in the fir wood, a rosy-white bank on the sled hill, a pale ice-blue rim round the pond, a greyer trodden square
  c.lerp(d.setHex(0xc3d2de), 0.34 * fall(Math.hypot(x, (z + 26) * 1.35), 17));
  c.lerp(d.setHex(0xf4eaf2), 0.4 * fall(Math.hypot(x - P.HILL.x, z - P.HILL.z), P.HILL.r));
  c.lerp(d.setHex(0xcfe9f2), 0.45 * fall(Math.abs(Math.hypot(x - P.POND.x, z - P.POND.z) - P.POND.r - 1.2), 2.8));
  c.lerp(d.setHex(0xcdcdd2), 0.3 * fall(Math.hypot(x + 4, z - 8), 8));
  // the blue shade of a fir, a dark needle dusting at its foot
  for (const k of firs()) {
    const dd = Math.hypot(x - k.x, z - k.z);
    if (dd > 3.2 * k.s) continue;
    c.lerp(d.setHex(0xa9bbd0), 0.36 * fall(dd, 3.2 * k.s));
    c.lerp(d.setHex(0x8f9fa0), 0.35 * fall(dd, 1.1 * k.s));
  }
  for (const k of P.COTTAGES) {
    const f = cottageFrame(k, x, z);
    if (f.out > 4.2) continue;
    c.lerp(d.setHex(0xaebfd6), 0.38 * fall(f.out, 2.4)); // the shade against the walls
    c.lerp(d.setHex(0xc9d3e0), 0.5 * fall(doorPath(k, x, z), 1.2)); // the path to the door
    if (f.lz > 0 && f.out < 3.6) c.lerp(d.setHex(0xf6dcae), 0.42 * fall(Math.hypot(Math.abs(f.lx) - k.w * 0.32, f.out * 1.4), 2.0)); // a window's pool of warm light
  }
  return c;
}

// ---- the far ridge ------------------------------------------------------------------------------------------------------------------
// A ring of snow peaks 78 to 96 m out (the ground reaches 75 m, so each foot is buried in it and the haze softens the rest): higher to the north, lower behind the spawn.
// { x, z, r (foot radius), h (height over the snow), seg }.
export const RIDGE_COUNT = 28;
export function ridgePeaks() {
  const rng = mulberry32(0x72696467);
  const out = [];
  for (let i = 0; i < RIDGE_COUNT; i++) {
    const a = ((i + 0.15 + rng() * 0.7) / RIDGE_COUNT) * Math.PI * 2;
    const dist = 80 + rng() * 14;
    const x = Math.sin(a) * dist * 1.05; const z = -Math.cos(a) * dist * 0.95; // a = 0 is due north
    const north = 0.5 - 0.5 * Math.cos(a); // 0 north .. 1 south
    const lift = 1.25 - 0.5 * north; // the northern peaks tallest, the spawn's side low
    out.push({ x, z, r: 15 + rng() * 9, h: (13 + rng() * 15) * lift, seg: 6 + (i % 3), yaw: rng() * 6 });
  }
  return out;
}
