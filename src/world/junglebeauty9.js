// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 9 (2026-11-28), NIGHT LIFE. The jungle's day (dayAt, 420 s) now has a deep night (day.night, 0..1, about 50 s of dark between dusk and dawn). NET ZERO triangles, no mesh, no
// caster, no light, no collider, no word, no gameplay. More points of the one `jungle:motes` Points (all dark by day), a moonlit grade of the lights the place already has, and the walk's own sounds:
//   * a glowing fungus path in rhythm with the mushrooms and night-blooms, fireflies in drifting clouds with trails, moths round the lanterns, blue mist in the moonbeams;
//   * owls on the trees' branches that watch her and turn their heads (a pair of eyes and a silver rim), bats flitting overhead, shy eyes in the shrubs that blink and fade as she nears;
//   * the lodge: warm glow at the windows, brighter lantern pools, a hammock where a sleeper's "z"s drift up;
//   * the moon: silver-blue sun, a cool bright sky-fill (a rim on her back), a deep blue haze; and the night's voice (frogs and insects, an owl's hoot, a breath of breeze).
// Draws no random number at run time and reads no clock (time arrives as `t`). Reduced motion: it all stays dark (the day's first frame is all that is drawn). Lite: a third of the points.
// =============================================================================
import * as P from './jungleplan.js';
import { VISTAS } from './junglebeauty7.js';

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2;
const FUNGUS = Object.freeze({ high: 24, low: 16, lite: 9 }); // along four paths
const PER = Object.freeze({ high: { fl: 5, mo: 4, mi: 3, ow: 3, ba: 3, ge: 5 }, low: { fl: 3, mo: 3, mi: 2, ow: 2, ba: 2, ge: 3 }, lite: { fl: 2, mo: 2, mi: 0, ow: 1, ba: 0, ge: 2 } });
const PATHS = Object.freeze([[[0, 31], [1.2, 28.5], [-1, 26], [-3.4, 23.4], [-5.6, 21]], [[0.6, -2.4], [-1.5, 2.5], [-0.8, 7], [-3.6, 11], [-5.2, 15.2]], [[-12.4, 17.8], [-17, 14], [-21, 9.5], [-25, 6]], [[-18, -2.4], [-10, -3.6], [-1, -3], [7, -2.6]]]);
const CLOUDS = Object.freeze([null, [-3.5, 22, 1.6], [-1, -1.5, 1.4]]); // 0 = the cloud that keeps her company

/** The points this pass adds (descriptors, dark by day): the fungus path, fireflies and their trails, moths, mist, owls, bats, shy eyes, windows, the sleeper. */
export function nightPlan(rung, plan) {
  const n = PER[rung]; const out = []; const add = (k, o) => out.push({ kind: 'ng', k, size: 0.6, rgb: [1, 1, 1], ...o });
  const f = FUNGUS[rung]; const per = Math.ceil(f / PATHS.length); let c = 0;
  PATHS.forEach((path, pi) => { for (let j = 0; j < per && c < f; j++, c++) { const u = (j + 0.5) / per * (path.length - 1); const a = path[Math.floor(u)]; const b = path[Math.min(path.length - 1, Math.floor(u) + 1)]; const w = u - Math.floor(u); add('fu', { x: a[0] + (b[0] - a[0]) * w + 0.5 * Math.sin(j * 2.3 + pi), z: a[1] + (b[1] - a[1]) * w + 0.5 * Math.cos(j * 1.9), i: c, size: 0.8, rgb: c % 2 ? [0.2, 1, 0.8] : [0.6, 0.4, 1] }); } });
  for (let q = 0; q < (rung === 'lite' ? 2 : 3); q++) for (let j = 0; j < n.fl; j++) for (const tr of [0, 1]) add('fl', { q, j, tr, size: tr ? 0.32 : 0.5, rgb: [0.85, 1, 0.4] });
  for (let i = 0; i < n.mo; i++) add('mo', { l: plan.lanterns[(i * 2) % plan.lanterns.length], i, size: 0.5, rgb: [1, 0.95, 0.8] });
  for (let i = 0; i < n.mi; i++) add('mi', { i, size: 8, rgb: [0.3, 0.5, 1] });
  const trees = P.scatterTrees().filter((k) => !k.rim && k.top > 5); const taken = [];
  for (let i = 0; i < n.ow; i++) {
    const A = [[-2, 24], [-14, 12], [-22, 6]][i]; const k = trees.filter((q) => !taken.includes(q)).sort((a, b) => Math.hypot(a.x - A[0], a.z - A[1]) - Math.hypot(b.x - A[0], b.z - A[1]))[0]; if (!k) continue; taken.push(k);
    const o = { x: k.x, z: k.z, y: P.jungleY(k.x, k.z) + k.top * 0.7, i }; add('ow', { ...o, size: 1.5, rgb: [0.4, 0.55, 1] }); add('oe', { ...o, e: -1, size: 0.55, rgb: [1, 0.75, 0.25] }); add('oe', { ...o, e: 1, size: 0.55, rgb: [1, 0.75, 0.25] });
  }
  for (let i = 0; i < n.ba; i++) add('ba', { i, size: 0.45, rgb: [0.7, 0.8, 1] });
  for (let i = 0; i < n.ge; i++) { // a pair of eyes in the shrub nearest each vista (and not under her feet)
    const V = VISTAS[i % VISTAS.length]; const s = plan.shrubs.filter((q) => Math.hypot(q.x - V.x, q.z - V.z) > 3).sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0]; if (!s) continue;
    const rgb = [[0.5, 1, 0.6], [1, 0.8, 0.3], [0.5, 0.8, 1]][i % 3];
    for (const e of [-1, 1]) add('ge', { x: s.x, z: s.z, y: P.jungleY(s.x, s.z) + 0.5, i, e, size: 0.4, rgb });
  }
  const top = P.LODGE.deck + 0.07 + 1.5;
  [[-9.5, 14.8], [-2.5, 14.8], [-11.7, 11.8], [-0.3, 11.8]].slice(0, rung === 'lite' ? 2 : 4).forEach(([x, z], i) => add('wi', { x, z, y: top, i, size: 2.6, rgb: [1, 0.62, 0.25] }));
  add('hm', { x: 3.4, z: 14.5, size: 1.7, rgb: [0.55, 0.6, 1] });
  if (rung !== 'lite') for (let i = 0; i < 3; i++) add('zz', { x: 3.4, z: 14.5, i, size: 0.4, rgb: [0.8, 0.8, 1] });
  return out;
}

/** One night point at time t, the night n (0..1), the cat c, the owl's hoot { t, i }: fills o { x, y, z, g, size }. Pure; g is 0 by day. */
export function nightPoint(p, t, n, c, hoot, o) {
  o.g = 0; o.size = p.size; o.x = 0; o.y = -50; o.z = 0;
  if (n <= 0.01) return o;
  const gy = (x, z) => P.jungleY(x, z); const k = p.k;
  if (k === 'fu') { o.x = p.x; o.z = p.z; o.y = gy(p.x, p.z) + 0.12; o.g = 0.7 * n * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.7 - p.i * 0.8))); } // a wave runs down the path
  else if (k === 'fl') {
    const q = CLOUDS[p.q]; const tt = t - p.tr * 0.35; const j = p.j;
    const cx = q ? q[0] + 2.6 * Math.sin(tt * 0.13 + p.q) : c.x + 4.5 * Math.cos(tt * 0.08); const cz = q ? q[1] + 2.2 * Math.cos(tt * 0.11 + p.q * 2) : c.z + 4.5 * Math.sin(tt * 0.08);
    o.x = cx + 1.4 * Math.sin(tt * (0.5 + 0.1 * j) + j * 2.1); o.z = cz + 1.4 * Math.cos(tt * (0.43 + 0.09 * j) + j * 1.7); o.y = gy(o.x, o.z) + (q ? q[2] : 1.2) + 0.8 * (0.5 + 0.5 * Math.sin(tt * 0.37 + j * 1.3));
    o.g = (p.tr ? 0.3 : 0.85) * n * Math.max(0, Math.sin(t * (1.1 + 0.2 * j) + j * 2.4 + p.q)) ** 2;
  } else if (k === 'mo') { const l = p.l; const a = t * (2.3 + 0.3 * p.i) + p.i * 2; const r = 0.4 + 0.25 * Math.sin(t * 3.1 + p.i); o.x = l.x + r * Math.cos(a); o.z = l.z + r * Math.sin(a); o.y = l.y + 0.3 * Math.sin(t * 4.4 + p.i) - 0.2; o.g = 0.6 * n * (0.6 + 0.4 * Math.sin(t * 23 + p.i)); }
  else if (k === 'mi') { o.x = c.x + 7 * Math.sin(t * 0.05 + p.i * 2.1); o.z = c.z + 7 * Math.cos(t * 0.06 + p.i * 1.7); o.y = gy(o.x, o.z) + 1.6; o.g = 0.3 * n * (0.7 + 0.3 * Math.sin(t * 0.3 + p.i)); }
  else if (k === 'ow' || k === 'oe') {
    const dx = c.x - p.x; const dz = c.z - p.z; const to = Math.atan2(dz, dx); const a = to + 1.3 * Math.tanh(3 * Math.sin(t * 0.3 + p.i * 2.2)); // she is watched, and now and then it glances away
    const fx = Math.cos(a); const fz = Math.sin(a); const seen = sm(((fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1)) * 2 + 0.3);
    o.y = p.y;
    if (k === 'ow') { o.x = p.x; o.z = p.z; o.g = 0.2 * n; } else { const w = 0.1 + 0.06 * (p.i % 2); o.x = p.x + fx * 0.3 - fz * w * p.e; o.z = p.z + fz * 0.3 + fx * w * p.e; const blink = (t * 0.23 + p.i * 0.37) % 1 > 0.965 ? 0 : 1; o.g = 0.95 * n * seen * blink * (1 + (hoot.i === p.i ? 0.7 * Math.max(0, 1 - (t - hoot.t) / 1.2) : 0)); }
  } else if (k === 'ba') { const a = t * (0.9 + 0.2 * p.i) + p.i * 2.1 + 0.6 * Math.sin(t * 2.7 + p.i); const r = 4 + 1.6 * p.i + 2 * Math.sin(t * 0.4 + p.i); o.x = c.x + r * Math.cos(a); o.z = c.z + r * Math.sin(a); o.y = gy(o.x, o.z) + 5.5 + 0.8 * p.i + Math.sin(t * 3.3 + p.i); o.size = 0.45 * (0.6 + 0.4 * Math.abs(Math.sin(t * 14 + p.i))); o.g = 0.5 * n * sm(Math.sin(t * 0.21 + p.i * 2.4) * 3 + 1); }
  else if (k === 'ge') { o.x = p.x - 0.09 * p.e; o.z = p.z; o.y = p.y; const u = (t / 7 + p.i * 0.37) % 1; const d = Math.hypot(c.x - p.x, c.z - p.z); const blink = u > 0.36 && u < 0.4 ? 0.1 : 1; o.g = 0.85 * n * sm(u * 12) * sm((0.62 - u) * 12) * blink * sm((d - 1.5) / 2); } // kind: they fade as she comes near
  else if (k === 'wi') { o.x = p.x; o.z = p.z; o.y = p.y; o.g = 0.45 * n * (0.9 + 0.1 * Math.sin(t * 2.7 + p.i * 1.9)); }
  else if (k === 'hm') { o.x = p.x; o.z = p.z; o.y = gy(p.x, p.z) + 0.8; o.g = 0.2 * n * (0.85 + 0.15 * Math.sin(t * 0.8)); } // her breathing
  else if (k === 'zz') { const u = (t / 3.2 + p.i / 3) % 1; o.x = p.x + 0.3 * u + 0.12 * Math.sin(u * 7); o.z = p.z; o.y = gy(p.x, p.z) + 1 + 1.2 * u; o.size = 0.3 + 0.35 * u; o.g = 0.55 * n * Math.sin(u * Math.PI); }
  return o;
}

/** The moonlit grade, eased by n (0..1): the sun a silver blue and dim, a cool silver sky-fill that rims her back, a deep blue haze and a darker sky. Mutates the lights the place already has. */
export function gradeNight(n, { sun, fill, scene, fog }) {
  if (n <= 0.001) return;
  const mix = (c, r, g, b, w) => { if (!c) return; c.r += (r - c.r) * w; c.g += (g - c.g) * w; c.b += (b - c.b) * w; };
  if (sun) { mix(sun.color, 0.62, 0.76, 1, 0.9 * n); sun.intensity *= 1 - 0.8 * n; }
  if (fill) { mix(fill.color, 0.45, 0.6, 1, 0.9 * n); mix(fill.groundColor, 0.08, 0.12, 0.24, 0.8 * n); fill.intensity *= 1 - 0.5 * n; }
  if (typeof scene.environmentIntensity === 'number') scene.environmentIntensity *= 1 - 0.7 * n;
  if (scene.background) scene.backgroundIntensity *= 1 - 0.93 * n;
  if (fog) { mix(fog.color, 0.004, 0.014, 0.04, 0.97 * n); fog.near *= 1 - 0.3 * n; fog.far *= 1 - 0.2 * n; }
}
