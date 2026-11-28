// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 7 (2026-11-28), photogenic vistas. NET ZERO triangles, no mesh, no caster, no light, no collider, no word, nothing she can stand on.
// Five spots kids photograph (the arrival clearing, the veranda looking along its lanterns, the river bank looking back, under the mango tree, the path bend by the totems). Near each one, and only there:
//   * the place's own light is graded (the sun a warmer gold, the fill warm so the cat's sky rim glows like sunlight on her fur, the haze a blue-gold far band, the frame a little darker);
//   * three bands of haze (warm foreground, green middle, blue-gold far) and a soft glow at the focal point: pooled points of the one `jungle:motes` Points, no triangle;
//   * the cloth's leaves a touch deeper and the shafts a touch warmer and brighter;
//   * a GOLDEN MOMENT: stand still 3 s and a faint sparkle trail rises round her with one soft chime (the walk's own audio only), once per visit.
// Draws no random number at run time and reads no clock (time arrives as `t`). Reduced motion: none of it runs (the caller returns first). Lite keeps fewer points.
// =============================================================================
import * as P from './jungleplan.js';

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const frac = (v) => v - Math.floor(v);

/** the five spots: where she stands (x, z), what the camera looks at (fx, fz, fy), the warm key, the far haze, how high the focal glow hangs */
export const VISTAS = Object.freeze([
  Object.freeze({ id: 'arrival', x: 0, z: 31.5, fx: 0, fz: 26, fy: 1.6, key: [1, 0.74, 0.4], far: [0.62, 0.74, 0.95] }),
  Object.freeze({ id: 'veranda', x: -9, z: 17.4, fx: -1.5, fz: 17.4, fy: 1.8, key: [1, 0.7, 0.34], far: [0.5, 0.82, 0.9] }),
  Object.freeze({ id: 'bank', x: 0.5, z: -2.2, fx: -5, fz: 15.5, fy: 2.4, key: [1, 0.8, 0.5], far: [0.7, 0.78, 0.95] }),
  Object.freeze({ id: 'tree', x: -26, z: 6, fx: -27.4, fz: 1.2, fy: 3.2, key: [1, 0.84, 0.46], far: [0.8, 0.85, 0.7] }),
  Object.freeze({ id: 'totems', x: 3.5, z: 25, fx: 0.5, fz: 19.7, fy: 1.7, key: [1, 0.66, 0.3], far: [0.66, 0.72, 0.92] }),
]);
export const VISTA_R = 4.5;
export const GOLDEN = Object.freeze({ still: 3, hold: 9, fade: 2.5 });
export const V7 = Object.freeze({ band: Object.freeze({ high: 9, low: 6, lite: 3 }), focus: Object.freeze({ high: 2, low: 2, lite: 1 }), trail: Object.freeze({ high: 7, low: 5, lite: 3 }) });
const BAND = Object.freeze([{ d: 3.6, spread: 5, size: 4.5, g: 0.17, rgb: [1, 0.72, 0.4] }, { d: 10, spread: 9, size: 7, g: 0.15, rgb: [0.45, 0.85, 0.5] }, { d: 24, spread: 14, size: 10, g: 0.2, rgb: [0.68, 0.78, 0.98] }]);

/** The nearest vista and how strongly she is in it: fills out { v, w } (v = index or -1, w 0..1). Pure. */
export function vistaAt(x, z, out = { v: -1, w: 0 }) {
  out.v = -1; out.w = 0;
  for (let i = 0; i < VISTAS.length; i++) { const w = sstep(1 - Math.hypot(x - VISTAS[i].x, z - VISTAS[i].z) / VISTA_R); if (w > out.w) { out.w = w; out.v = i; } }
  return out;
}
/** Eases the state { v, w } toward the target: leaves one vista before taking up the next, no jump. Pure. */
export function easeVista(st, tgt, dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) / 0.6);
  if (st.v !== tgt.v && st.w > 0.02) { st.w += (0 - st.w) * k; return st; }
  if (st.v !== tgt.v) st.v = tgt.v;
  st.w += (tgt.w - st.w) * k; if (tgt.v < 0 && st.w < 0.004) { st.w = 0; st.v = -1; }
  return st;
}

/** The golden moment: st { still, age, on, armed }. Call each frame; returns true on the one frame the chime is due. Standing still 3 s inside a vista starts it; it holds, fades, and
 *  does not come again until she has left the vista. out.k (0..1) is the sparkle's strength. Pure (dt drives it). */
export function goldenStep(st, dt, w, moving) {
  if (w < 0.15) { st.armed = true; st.on = false; st.still = 0; }
  else if (moving) st.still = 0; else if (dt > 0) st.still += dt;
  let chime = false;
  if (!st.on && st.armed && w > 0.5 && st.still >= GOLDEN.still) { st.on = true; st.armed = false; st.age = 0; chime = true; }
  if (st.on) { st.age += Math.max(0, dt); if (moving && st.age > 1.5) st.on = false; if (st.age > GOLDEN.hold) st.on = false; }
  const tgt = st.on ? 1 : 0; st.k += (tgt - st.k) * Math.min(1, Math.max(0, dt) / (st.on ? 0.8 : GOLDEN.fade / 3)); if (st.k < 0.003) st.k = 0;
  return chime;
}
export const newGolden = () => ({ still: 0, age: 0, on: false, armed: true, k: 0 });

/** The points this pass adds (descriptors for the motes list). */
export function vistaPoints(rung) {
  const pts = [];
  for (let i = 0; i < V7.band[rung]; i++) { const b = BAND[i % 3]; pts.push({ kind: 'vs', w: 'band', i, band: i % 3, size: b.size, rgb: b.rgb }); }
  for (let i = 0; i < V7.focus[rung]; i++) pts.push({ kind: 'vs', w: 'focus', i, size: i ? 2.4 : 6, rgb: [1, 0.8, 0.5] });
  for (let i = 0; i < V7.trail[rung]; i++) pts.push({ kind: 'vs', w: 'trail', i, n: V7.trail[rung], size: 0.5, rgb: [1, 0.85, 0.45] });
  return pts;
}
/** One of this pass's points at time t for the vista state vs { v, w }, the golden moment k, the cat c and the shower q (0..1): fills out { x, y, z, g, size }. */
export function vistaPoint(p, t, vs, k, c, q, out) {
  out.size = p.size; out.g = 0; out.x = c.x; out.z = c.z; out.y = -50;
  if (vs.v < 0 || vs.w < 0.004) return out;
  const V = VISTAS[vs.v]; const w = vs.w * (1 - 0.85 * q); const gy = P.jungleY;
  if (p.w === 'band') {
    let dx = V.fx - c.x; let dz = V.fz - c.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const b = BAND[p.band]; const lat = (hash(p.i * 7 + 3) - 0.5) * 2 * b.spread;
    out.x = c.x + dx * b.d - dz * lat; out.z = c.z + dz * b.d + dx * lat; out.y = gy(out.x, out.z) + 0.7 + 2.2 * hash(p.i * 7 + 4) + p.band * 0.8;
    out.g = b.g * w * (0.8 + 0.2 * Math.sin(t * 0.3 + p.i * 2));
  } else if (p.w === 'focus') {
    out.x = V.fx; out.z = V.fz; out.y = gy(V.fx, V.fz) + V.fy; out.g = (p.i ? 0.4 : 0.3) * w * (0.85 + 0.15 * Math.sin(t * 1.1 + p.i)) * (1 + 0.8 * k);
  } else {
    const u = frac(t * 0.3 + p.i / p.n); const a = t * 0.9 + p.i * 2.4; const r = 0.5 + 0.55 * u;
    out.x = c.x + Math.cos(a) * r; out.z = c.z + Math.sin(a) * r; out.y = gy(c.x, c.z) + 0.15 + u * 1.7; out.g = k * Math.sin(u * Math.PI) * 1.4;
  }
  return out;
}

// ---- the grade (after the day's and the weather's own) ----------------------------------------------------------------------------------------
const lerp = (c, r, g, b, k) => { c.r += (r - c.r) * k; c.g += (g - c.g) * k; c.b += (b - c.b) * k; };
export function gradeVista(vs, { fog, sun, fill, scene }) {
  if (vs.v < 0 || vs.w < 0.004) return;
  const V = VISTAS[vs.v]; const w = vs.w;
  if (sun) { lerp(sun.color, V.key[0], V.key[1], V.key[2], 0.55 * w); sun.intensity *= 1 + 0.14 * w; }
  if (fill) lerp(fill.color, V.key[0], V.key[1] * 0.95, V.key[2] * 0.8, 0.5 * w); // the cat's sky rim reads this
  if (fog) { lerp(fog.color, V.far[0], V.far[1], V.far[2], 0.4 * w); fog.near *= 1 - 0.2 * w; fog.far *= 1 + 0.1 * w; }
  if (scene) { if (scene.environmentIntensity !== undefined) scene.environmentIntensity *= 1 - 0.18 * w; if (scene.background) scene.backgroundIntensity *= 1 - 0.1 * w; }
}
/** the cloth's leaves a touch deeper in a vista (the frame at the screen's edges) */
export const vistaCloth = (vs, o) => { const w = vs.v < 0 ? 0 : vs.w; o[0] *= 1 - 0.2 * w; o[1] *= 1 - 0.05 * w; o[2] *= 1 - 0.22 * w; return o; };
export const vistaShaft = (vs) => 1 + (vs.v < 0 ? 0 : 0.5 * vs.w);
