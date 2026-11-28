// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 6 (2026-11-28), weather and atmosphere as EVENTS. NET ZERO triangles, no mesh, no caster, no light, no collider, no word, no new standable surface.
//   * A TROPICAL DOWNPOUR (the existing shower's strength): big drops and splash rings on the leaves, water streaming off the veranda roof's front edge, puddle sheen near her, a fast mist,
//     the leaves bowing under it, louder frogs, far-off thunder, the sky and haze graded to storm green; AFTER it, a steaming haze rises from the ground (pass 4's rainbow stays).
//   * MORNING MIST at dawn: low dense banks (kept off her camera), shafts that pierce them, dew sparkling on the foliage, the birds' calls starting up one by one.
//   * GOLDEN HOUR before dusk: warm long shafts, glowing dust, an orange rim on the leaves, fireflies waking early.
//   * A rare WIND GUST: a front sweeps the canopy along the cloth's wind, bending it, with leaves and petals streaming in it and a whoosh.
// Everything visible is more points of the one pooled `jungle:motes` Points (no triangle), the cloth's own sway, and the grade of the light the place already has. Draws no random
// number at run time and reads no clock (time arrives as `t`). Reduced motion: none of it runs (the caller returns first). The lower rungs keep fewer points. Never in front of a prompt:
// banks and mist keep clear of her, and the density stays modest (a little haze, a few drops) at the play camera.
// =============================================================================
import * as P from './jungleplan.js';
import { dayAt } from './junglereact.js';
import { WIND } from './junglebeauty5.js';

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const frac = (v) => v - Math.floor(v);

export const W6 = Object.freeze({
  bank: Object.freeze({ high: 9, low: 5, lite: 2 }), dew: Object.freeze({ high: 18, low: 10, lite: 4 }), gold: Object.freeze({ high: 18, low: 10, lite: 4 }), fly: Object.freeze({ high: 6, low: 4, lite: 2 }),
  splash: Object.freeze({ high: 14, low: 8, lite: 3 }), drop: Object.freeze({ high: 18, low: 10, lite: 4 }), eave: Object.freeze({ high: 11, low: 6, lite: 3 }), sheen: Object.freeze({ high: 5, low: 3, lite: 1 }),
  glow: Object.freeze({ high: 7, low: 4, lite: 2 }), steam: Object.freeze({ high: 8, low: 5, lite: 2 }), leaf: Object.freeze({ high: 24, low: 12, lite: 5 }),
  gust: Object.freeze({ every: 130, span: 55, dur: 8, speed: 9, reach: 7 }),
});
const SIZE = { bank: 9, dew: 0.7, gold: 0.9, fly: 1.1, splash: 0.4, drop: 0.5, eave: 0.6, sheen: 3.2, steam: 5, leaf: 1.5, glow: 11 };
const RGB = { bank: [1, 0.86, 0.8], dew: [0.9, 1, 0.9], gold: [1, 0.78, 0.36], fly: [0.95, 0.85, 0.3], splash: [0.82, 0.95, 1], drop: [0.8, 0.92, 1], eave: [0.8, 0.92, 1], sheen: [0.7, 0.85, 0.9], steam: [0.9, 0.95, 0.85], glow: [1, 0.55, 0.16] };
const LEAFS = Object.freeze([[0.4, 0.85, 0.25], [0.8, 0.95, 0.3], [1, 0.45, 0.7], [1, 0.8, 0.3]]); // leaves and petals in a gust

/** Golden hour 0..1: the warm stretch before the dusk. Pure. */
export function goldenAt(t) { const p = dayAt(t).p; const d = Math.abs(p - 0.66); return sstep(1 - d / 0.1); }

/** The rare gust: { on, age, dur, k } at walk time t; one every ~130 s (not in every slot). Pure and seeded. forcedAt (or null) is a gust the picture page asks for. */
export function gustEvent(t, forcedAt = null) {
  const G = W6.gust;
  if (forcedAt !== null && t >= forcedAt && t - forcedAt < G.dur) return { on: true, age: t - forcedAt, dur: G.dur, k: 'f' };
  const slot = Math.floor(t / G.every); const t0 = slot * G.every + 25 + G.span * hash(slot * 7 + 3);
  const on = hash(slot * 13 + 5) > 0.3 && t >= t0 && t < t0 + G.dur;
  return { on, age: on ? t - t0 : 0, dur: G.dur, k: slot };
}
/** How hard the gust's front is on a point whose coordinate along the wind is s, when the front stands at f. 0..1. Pure. */
export const gustWave = (s, f) => { const d = (s - f) / 6.5; return Math.exp(-d * d); };
/** where the front is, along the wind, for a viewer at wind-coordinate sc */
export const gustFront = (age, sc) => sc + (age - 3.2) * W6.gust.speed;

/** The events at a moment: storm 0..1 (the shower), steam (after it), mist (dawn), gold, gust. Fills and returns out. Pure. */
export function eventsAt(t, rain, day, forcedGust = null, out = {}) {
  out.storm = Math.min(1, Math.max(0, rain));
  out.steam = out.storm > 0.02 ? 0 : P.rainSchedule.rainbow(t) * 0.85;
  out.mist = day.dawn * (1 - 0.7 * out.storm);
  out.gold = goldenAt(t) * (1 - out.storm);
  const g = gustEvent(t, forcedGust); out.gust = g.on ? sstep(g.age / 0.9) * sstep((g.dur - g.age) / 1.4) * (1 - out.storm) : 0; out.gustAge = g.age; out.gustK = g.k;
  return out;
}

// ---- the thunder: a far rumble some seconds into each shower (pure) -------------------------------------------------------------------------------
/** Due rumbles: state { at: -1, n: 0 } -> the next index when the shower has run long enough, else -1. Two or three rolls a shower, each a bit apart. */
export function thunderDue(state, t, storm) {
  if (storm < 0.6) { state.at = -1; return -1; }
  if (state.at < 0) { state.at = t + 4 + 5 * hash(Math.floor(t) * 3 + 1); state.n = 0; }
  if (t >= state.at && state.n < 3) { state.n++; state.at = t + 6 + 5 * hash(state.n * 5 + Math.floor(t)); return state.n; }
  return -1;
}

// ---- the weather points -----------------------------------------------------------------------------------------------------------------------
const gy = P.jungleY;
const wrap = (v, c, B) => ((((v - c) % (2 * B)) + 2 * B) % (2 * B)) - B + c;
const away = (x, z, c, r) => { const dx = x - c.x; const dz = z - c.z; const d = Math.hypot(dx, dz); if (d >= r) return [x, z]; const k = r / (d || 1); return d < 1e-3 ? [c.x + r, c.z] : [c.x + dx * k, c.z + dz * k]; };

/** The points this pass adds (descriptors for the motes list), at the rung's counts. */
export function weatherPoints(rung) {
  const pts = [];
  for (const w of ['bank', 'dew', 'gold', 'fly', 'splash', 'drop', 'eave', 'sheen', 'steam', 'glow']) for (let i = 0; i < W6[w][rung]; i++) pts.push({ kind: 'wx', w, i, size: SIZE[w], rgb: RGB[w] });
  for (let i = 0; i < W6.leaf[rung]; i++) pts.push({ kind: 'wx', w: 'leaf', i, size: SIZE.leaf, rgb: LEAFS[i % LEAFS.length] });
  return pts;
}

/** One point of the weather at time t, for the cat at c (x, z) and the events ev: fills out { x, y, z, g, size }. */
export function weatherAt(p, t, ev, c, out) {
  const i = p.i; const w = p.w; out.size = p.size; out.g = 0; out.x = c.x; out.z = c.z; out.y = -50;
  const open = 1 - (P.sheltered(c.x, c.z) ? 0.9 : 0); // under the roof only a little of it reaches the lens
  if (w === 'bank') { // dense low banks of dawn mist, drifting on the wind, kept clear of her
    const B = 15; const [x, z] = away(wrap(hash(i * 5 + 11) * 2 * B + t * 0.3 * WIND.x * (0.8 + 0.4 * hash(i)), c.x, B), wrap(hash(i * 5 + 12) * 2 * B + t * 0.3 * WIND.z, c.z, B), c, 5);
    out.x = x; out.z = z; out.y = gy(x, z) + 0.9 + 0.4 * Math.sin(t * 0.17 + i); out.g = 0.4 * ev.mist * (0.75 + 0.25 * Math.sin(t * 0.3 + i * 2)) + 0.12 * ev.steam;
  } else if (w === 'dew') { // dew glints on the foliage
    const x = wrap(hash(i * 7 + 21) * 18, c.x, 9); const z = wrap(hash(i * 7 + 22) * 18, c.z, 9); out.x = x; out.z = z; out.y = gy(x, z) + 0.5 + 2.2 * hash(i * 7 + 23);
    out.g = Math.max(0, Math.sin(t * (0.9 + hash(i)) + i * 2.1)) ** 8 * ev.mist * 1.8;
  } else if (w === 'gold') { // glowing dust drifting up the long shafts
    const u = frac(t * 0.025 + hash(i * 3 + 31)); const x = wrap(hash(i * 9 + 32) * 16 + t * 0.2 * WIND.x, c.x, 8); const z = wrap(hash(i * 9 + 33) * 16 + t * 0.2 * WIND.z, c.z, 8);
    out.x = x; out.z = z; out.y = gy(x, z) + 0.6 + u * 3; out.g = ev.gold * (0.5 + 0.9 * Math.sin(u * Math.PI)) * (0.6 + 0.4 * Math.sin(t * 1.3 + i));
  } else if (w === 'fly') { // fireflies waking in the gold
    const x = wrap(hash(i * 5 + 41) * 20, c.x, 10); const z = wrap(hash(i * 5 + 42) * 20, c.z, 10);
    out.x = x + 0.8 * Math.sin(t * 0.4 + i); out.z = z + 0.8 * Math.cos(t * 0.33 + i * 2); out.y = gy(x, z) + 0.7 + 1.2 * hash(i * 5 + 43); out.g = ev.gold * Math.max(0.1, Math.sin(t * 1.6 + i * 2.7)) ** 2;
  } else if (w === 'splash') { // rings opening where the drops land on the leaves
    const per = 0.55 + 0.4 * hash(i * 3 + 51); const u = frac(t / per + hash(i * 3 + 52)); const k = Math.floor(t / per + hash(i * 3 + 52));
    const x = c.x + (hash(k * 7 + i * 5 + 53) - 0.5) * 12; const z = c.z + (hash(k * 7 + i * 5 + 54) - 0.5) * 12; const [ax, az] = away(x, z, c, 2.4);
    out.x = ax; out.z = az; out.y = gy(ax, az) + 0.25 + 1.2 * hash(i * 3 + 55) * (i % 2); out.size = 0.4 + 2.2 * u; out.g = (1 - u) * (1 - u) * ev.storm * 0.9 * open;
  } else if (w === 'drop') { // big drops, close and quick
    const u = frac(t * (1.5 + hash(i)) + hash(i * 3 + 61)); const x = c.x + (hash(i * 5 + 62) - 0.5) * 9; const z = c.z + (hash(i * 5 + 63) - 0.5) * 9; const [ax, az] = away(x, z, c, 1.8);
    out.x = ax; out.z = az; out.y = gy(ax, az) + 7 * (1 - u); out.g = ev.storm * 1.1 * open;
  } else if (w === 'eave') { // water streaming off the veranda roof's front edge
    const L = P.LODGE; const x = L.x0 + 0.6 + ((L.x1 - L.x0 - 1.2) * (i + 0.5)) / W6.eave.high; const u = frac(t * 1.7 + hash(i * 3 + 71));
    out.x = x; out.z = L.z1 + 1.1; out.y = 3.3 - u * 2.9; out.g = ev.storm * 1.3 * (0.6 + 0.4 * hash(i * 3 + 72));
  } else if (w === 'sheen') { // puddle sheen
    const x = wrap(hash(i * 5 + 81) * 24, c.x, 12); const z = wrap(hash(i * 5 + 82) * 24, c.z, 12); const [ax, az] = away(x, z, c, 3.5);
    out.x = ax; out.z = az; out.y = gy(ax, az) + 0.06; out.g = Math.max(ev.storm * 0.12, ev.steam * 0.06) * (0.7 + 0.3 * Math.sin(t * 0.9 + i * 2)) * open;
  } else if (w === 'glow') { // golden hour: warm light hanging in the air between the trunks
    const B = 16; const [x, z] = away(wrap(hash(i * 5 + 111) * 2 * B + t * 0.15 * WIND.x, c.x, B), wrap(hash(i * 5 + 112) * 2 * B + t * 0.15 * WIND.z, c.z, B), c, 5.5);
    out.x = x; out.z = z; out.y = gy(x, z) + 1.4 + 1.2 * hash(i * 5 + 113); out.g = 0.45 * ev.gold * (0.8 + 0.2 * Math.sin(t * 0.4 + i * 2));
  } else if (w === 'steam') { // the haze that steams up after the rain
    const u = frac(t * 0.07 + hash(i * 3 + 91)); const x = wrap(hash(i * 7 + 92) * 20, c.x, 10); const z = wrap(hash(i * 7 + 93) * 20, c.z, 10); const [ax, az] = away(x, z, c, 4.5);
    out.x = ax; out.z = az; out.y = gy(ax, az) + 0.3 + u * 2.4; out.g = ev.steam * 0.22 * Math.sin(u * Math.PI);
  } else { // leaves and petals streaming in the gust's front
    const f = gustFront(ev.gustAge, 0); const a = f + (hash(i * 5 + 101) - 0.5) * 14; const b = (hash(i * 5 + 102) - 0.5) * 14 + 0.8 * Math.sin(t * 2 + i);
    out.x = c.x + WIND.x * a - WIND.z * b; out.z = c.z + WIND.z * a + WIND.x * b; out.y = gy(out.x, out.z) + 1.4 + 3 * hash(i * 5 + 103) + 0.5 * Math.sin(t * 3 + i * 2);
    out.g = ev.gust * 1.6 * (0.5 + 0.5 * Math.sin(t * 5 + i));
  }
  return out;
}

/** The sway cloth's extra push this frame: rain bows the leaves, a gust bends them in a travelling front. Returns the multiplier added to the cloth's own gust. */
export function swayBoost(ev, cx, cz, catAt) {
  let k = 0.9 * ev.storm;
  if (ev.gust > 0.01) { const s = cx * WIND.x + cz * WIND.z; const sc = catAt.x * WIND.x + catAt.z * WIND.z; k += 3.6 * ev.gust * gustWave(s, gustFront(ev.gustAge, sc)); }
  return k;
}

// ---- the light's grade (applied after the day's own, on the same fog, sun, fill and background) ----------------------------------------------
const lerp = (c, r, g, b, k) => { c.r += (r - c.r) * k; c.g += (g - c.g) * k; c.b += (b - c.b) * k; };
export function gradeWeather(ev, { fog, sun, fill, scene }) {
  const s = ev.storm; const g = ev.gold; const m = ev.mist; const st = ev.steam;
  if (fog) {
    lerp(fog.color, 0.3, 0.5, 0.36, 0.85 * s); lerp(fog.color, 1, 0.62, 0.26, 0.6 * g); lerp(fog.color, 0.9, 0.95, 0.88, 0.3 * st + 0.15 * m);
    fog.near *= 1 - 0.22 * s - 0.22 * m - 0.1 * st; fog.far *= 1 - 0.2 * s - 0.15 * m - 0.1 * st;
  }
  if (sun) { lerp(sun.color, 1, 0.55, 0.18, 0.9 * g); lerp(sun.color, 0.5, 0.85, 0.6, 0.6 * s); sun.intensity *= 1 - 0.55 * s + 0.45 * g + 0.1 * m; }
  if (fill) { lerp(fill.color, 0.55, 0.8, 0.65, 0.4 * s); lerp(fill.color, 1, 0.6, 0.3, 0.5 * g); fill.intensity *= 1 - 0.3 * s; }
  if (scene) { if (scene.environmentIntensity !== undefined) scene.environmentIntensity *= 1 - 0.35 * s; if (scene.background) scene.backgroundIntensity *= 1 - 0.4 * s + 0.06 * g; }
}
/** the cloth's colour multipliers for the weather: [r, g, b] (an orange rim at the golden hour, deeper green in the storm, bright with dew at dawn) */
export const clothTint = (ev, out = [1, 1, 1]) => { out[0] = 1 + 0.35 * ev.gold - 0.2 * ev.storm; out[1] = 1 - 0.04 * ev.gold + 0.02 * ev.storm + 0.05 * ev.mist; out[2] = 1 - 0.45 * ev.gold - 0.15 * ev.storm; return out; };
export const shaftBoost = (ev) => 1 + 1.4 * ev.gold + 0.6 * ev.mist;
export const shaftTint = (ev) => [1, 1 - 0.18 * ev.gold, 1 - 0.45 * ev.gold];

export const MIST_FAST = (ev) => 1 + 2.5 * ev.storm; // the low mist runs fast in a downpour
export const MIST_MORE = (ev) => 0.25 * ev.storm;
