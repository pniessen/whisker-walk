// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 3 (2026-11-28), the jungle reacts to the cat and lives. Pure helpers and small pooled state (no mesh, no triangle, no light, no collider, no word):
//   * brushing: every swaying vine and giant leaf has a `react` amount that rises as she comes near and dies away slowly, so the foliage parts away from her, shivers, and swings back;
//   * ripples: rings of pooled light-points that open where she wades the river (and, in a shower, where the rain lands round her);
//   * petals: a burst of glowing petals from a flowering shrub she walks into, twice at most at once, each shrub resting a while afterwards;
//   * the day: a slow cycle (misty dawn, hot noon, humid dusk glow) read from the walk's clock `t`, steering the shafts' colour and strength, the lantern and mushroom glow, a low mist
//     of big soft points and the fireflies' brightness; and the day's own voice (which sounds are about, and how often).
// Draws no random number at run time and reads no clock. Reduced motion: none of it runs (the caller returns first).
// =============================================================================
import * as P from './jungleplan.js';

export const DAY = 420; // seconds for one full day in the jungle (dawn, noon, dusk)
export const REACT = Object.freeze({ radius: 2.1, rise: 7, fall: 1.15, leafPush: 0.95, vinePush: 1.1, wobble: 0.3, quiet: 0.22, rustleGap: 0.45, flushAt: 5 });
export const RIPPLE = Object.freeze({ life: 1.2, rise: 1.5, step: 0.45, rain: 0.2, points: 10, maxR: 1.35 });
export const PETALS = Object.freeze({ life: 2.0, count: 12, touch: 1.15, rest: 7, gravity: 3.6 });

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const TAU = Math.PI * 2;
const bump = (p, c, w) => { let d = Math.abs(p - c); d = Math.min(d, 1 - d); return Math.max(0, 1 - d / w) ** 1.5; };

/** The jungle's hour at walk time t: { dawn, noon, dusk, mist, shaft, glow, warm: [r, g, b] }, each 0..1 (shaft and glow can pass 1). Pure; the walk starts in the morning. */
export function dayAt(t) {
  const p = ((t / DAY) + 0.12) % 1;
  const dawn = bump(p, 0.05, 0.2); const noon = bump(p, 0.42, 0.22); const dusk = bump(p, 0.78, 0.2);
  return {
    p, dawn, noon, dusk,
    mist: Math.min(1, dawn * 1.05 + dusk * 0.3),
    shaft: 0.45 + 0.85 * noon + 0.35 * dawn + 0.25 * dusk,
    glow: 0.6 + 0.9 * dusk + 0.3 * dawn - 0.25 * noon,
    warm: [1, 0.97 - 0.22 * dusk - 0.1 * dawn + 0.02 * noon, 0.8 - 0.42 * dusk - 0.12 * dawn + 0.12 * noon],
  };
}

/** A brush of foliage: `react` per piece (a Float32Array the caller keeps), eased from the cat's distance; fills away-from-her unit vectors. Returns how many pieces newly stirred. */
export function brush(pieces, react, awayX, awayZ, cat, dt, moving) {
  let stirred = 0;
  const R = REACT.radius;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.cx === undefined) { react[i] = 0; continue; }
    const dx = p.cx - cat.x; const dz = p.cz - cat.z; const d = Math.hypot(dx, dz);
    const near = d < R ? (1 - d / R) ** 0.7 * (moving ? 1 : REACT.quiet) : 0;
    const was = react[i];
    if (near > react[i]) react[i] += (near - react[i]) * Math.min(1, dt * REACT.rise); else react[i] *= Math.exp(-dt * REACT.fall);
    if (was < 0.12 && react[i] >= 0.12 && moving) stirred++;
    if (d > 1e-3) { awayX[i] = dx / d; awayZ[i] = dz / d; }
  }
  return stirred;
}

/** The offset a stirred piece takes: pushed away from her, plus a quick shiver that dies with it. Fills out {x, z}. */
export function brushOffset(p, react, ax, az, t, out) {
  const r = react;
  const push = p.push * r; const sh = REACT.wobble * r * r * Math.sin(t * 11 + p.ph * 3);
  out.x = ax * push + sh; out.z = az * push - sh * 0.7;
  return out;
}

/** A pool of ripple rings and petal bursts, all light-points. Pure state; the caller reads `points(fn)` once a frame. */
export function createPool({ ripples = 3, bursts = 2 } = {}) {
  const rings = Array.from({ length: ripples }, () => ({ on: false, x: 0, y: 0, z: 0, age: 0, big: 1 }));
  const burstSet = Array.from({ length: bursts }, () => ({ on: false, age: 0, x: 0, y: 0, z: 0, rgb: [1, 1, 1], seed: 0 }));
  const rest = new Map(); // shrub index -> time it may bloom again
  let ringNext = 0; let burstNext = 0; let seeds = 0; let lastRing = { x: 1e9, z: 1e9 }; let nextRain = 0;
  return {
    rings, burstSet,
    ripple(x, y, z, big = 1) { const r = rings[ringNext++ % rings.length]; Object.assign(r, { on: true, x, y, z, age: 0, big }); },
    burst(x, y, z, rgb) { const b = burstSet[burstNext++ % burstSet.length]; Object.assign(b, { on: true, age: 0, x, y, z, rgb, seed: ++seeds }); },
    /** wading: a ring each step in the river; in a shower, drops land round her */
    step(t, cat, rain, dt, moving) {
      const wet = P.riverDist(cat.x, cat.z) < P.RIVER_W + 0.25;
      if (wet && moving && Math.hypot(cat.x - lastRing.x, cat.z - lastRing.z) > RIPPLE.step) {
        this.ripple(cat.x, P.jungleY(cat.x, cat.z) + P.RIVER_DEPTH + 0.02, cat.z, 1); lastRing = { x: cat.x, z: cat.z };
        return 'splash';
      }
      if (rain > 0.3 && t >= nextRain) {
        nextRain = t + RIPPLE.rain / Math.max(0.3, rain); const k = Math.floor(t * 7);
        const x = cat.x + (hash(k * 3 + 1) - 0.5) * 7; const z = cat.z + (hash(k * 3 + 2) - 0.5) * 7;
        const w = P.riverDist(x, z) < P.RIVER_W;
        this.ripple(x, P.jungleY(x, z) + (w ? P.RIVER_DEPTH + 0.02 : 0.06), z, 0.55);
      }
      return null;
    },
    /** touching a flowering shrub: its petals burst (each shrub rests afterwards) */
    touch(t, cat, shrubs, hexRgb) {
      for (let i = 0; i < shrubs.length; i++) {
        const s = shrubs[i];
        if (Math.hypot(s.x - cat.x, s.z - cat.z) > PETALS.touch * s.s) continue;
        if (t < (rest.get(i) ?? 0)) continue;
        rest.set(i, t + PETALS.rest); this.burst(s.x, P.jungleY(s.x, s.z) + 0.8 * s.s, s.z, hexRgb(s.pal)); return true;
      }
      return false;
    },
    advance(dt) { for (const r of rings) if (r.on && (r.age += dt) > RIPPLE.life) r.on = false; for (const b of burstSet) if (b.on && (b.age += dt) > PETALS.life) b.on = false; },
    /** one ring's point k (0..RIPPLE.points-1): { x, y, z, g } with g the brightness 0..1 (0 when idle) */
    ringPoint(r, k, out) {
      if (!r.on) { out.g = 0; return out; }
      const u = r.age / RIPPLE.life; const rad = (0.15 + RIPPLE.maxR * (1 - (1 - u) ** 2)) * r.big;
      const a = (k / RIPPLE.points) * TAU + r.age * 0.4;
      out.x = r.x + Math.cos(a) * rad; out.z = r.z + Math.sin(a) * rad; out.y = r.y; out.g = (1 - u) ** 1.3 * (0.4 + 0.6 * r.big);
      return out;
    },
    /** one burst petal k (0..PETALS.count-1) */
    petalPoint(b, k, out) {
      if (!b.on) { out.g = 0; return out; }
      const a = hash(b.seed * 31 + k * 7) * TAU; const sp = 0.8 + 1.6 * hash(b.seed * 17 + k * 3 + 1); const up = 1.2 + 1.8 * hash(b.seed * 13 + k * 5 + 2);
      const t = b.age; const swirl = 0.5 * Math.sin(t * 3 + k);
      out.x = b.x + Math.cos(a) * sp * t + swirl * 0.3; out.z = b.z + Math.sin(a) * sp * t; out.y = Math.max(P.jungleY(out.x, out.z) + 0.05, b.y + up * t - 0.5 * PETALS.gravity * t * t * 0.45);
      out.g = Math.min(1, (1 - t / PETALS.life) * 1.6) * 0.95; return out;
    },
  };
}
