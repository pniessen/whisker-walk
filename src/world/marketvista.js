// =============================================================================
// PHOTOGENIC VISTAS (Market beauty pass 7). Part of the Market's story stage (marketstagelife.js, with marketweather.js): the
// game has a photo album and the children take screenshots, so five spots of the square are tuned for the play camera. No
// triangle, mesh or caster is added; the look is the weather's one pooled Points (its slots are claimed here), the existing
// grade uniforms (the cobbles' and paint's tone, the lanterns' glow, the fill's and the sun's warmth, and one new edge-dim
// uniform uMkVig that the square's own materials read), and one soft chime on the game's own audio object.
//   * the five spots: the gate looking at the fountain, the fountain with the stalls fanning out, the flower stall's corner,
//     the bakery lane (golden), and the far end looking back down the square. Each has a focal point (the fountain, a stall's
//     lantern), a colour triad, three bands of haze between the lens and beyond the focus, shafts aimed at the focus, and a few
//     pennants hung over the screen's top corners as a frame; the cat gets a warm rim (the fill's intensity and warmth) and
//     the lanterns brighten a little.
//   * THE GOLDEN MOMENT: stand still three seconds at a vista and sparkles rise over its focus and a soft chime invites a photo;
//     once per vista per visit (a walk).
// Everything is a pure function of the walk's seconds; reduced motion has the static grade only; lite has the grade and the
// edge-dim only (the weather's points are not made on those rungs).
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';

export const VSALT = 311;
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// at: where she stands; r: how near counts; look: where she faces; focus: the focal point; warm: the extra golden weight;
// tri: the colour triad (water/stone, the warm light, the awning accent)
export const VISTAS = Object.freeze([
  { id: 'gate', at: { x: 0, z: 20.5 }, r: 3.6, look: { x: 0, z: 0 }, focus: { x: 0, y: 2.1, z: 0 }, warm: 0.3, tri: [0x66c8d8, 0xffc78e, 0xf08aa0] },
  { id: 'fountain', at: { x: -2.5, z: 7.6 }, r: 3.4, look: { x: 0, z: 0 }, focus: { x: 0, y: 2.1, z: 0 }, warm: 0.3, tri: [0x66c8d8, 0xffd08a, 0xe8808c] },
  { id: 'flowers', at: { x: 9.5, z: 4.2 }, r: 3.2, look: { x: 12, z: 0 }, focus: { x: 11.5, y: 1.4, z: 0.2 }, warm: 0.35, tri: [0xf08aa8, 0xffd27a, 0x8ad08c] },
  { id: 'bakery', at: { x: -4.2, z: -6.3 }, r: 3.2, look: { x: -7, z: -10.5 }, focus: { x: -6.6, y: 1.9, z: -9.9 }, warm: 0.75, tri: [0xffb86a, 0xffe0a0, 0x9a78c8] },
  { id: 'streetback', at: { x: 2.8, z: -9.5 }, r: 3.6, look: { x: 0, z: 8 }, focus: { x: 0, y: 2.1, z: 0 }, warm: 0.35, tri: [0x66c8d8, 0xffc78e, 0xb48ad8] },
]);

export const VISTA_N = { spark: 30, haze: 12, frame: 14 };
const MOMENT_LEN = 9.5;
const STILL_FOR = 3;

const lin = (n) => (n / 255) ** 2.2; // the pool's colours are in the working (linear) space, as THREE.Color holds a hex
export const hexParts = (h) => [lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255)];

// the weights of a stand at (x,z) facing dir (dx,dz) for each vista: 1 on its spot facing it, 0 away or facing off
export function vistaTargets(x, z, dx, dz, out = []) {
  const l = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < VISTAS.length; i++) {
    const v = VISTAS[i];
    const d = Math.hypot(x - v.at.x, z - v.at.z);
    const tx = v.look.x - v.at.x; const tz = v.look.z - v.at.z; const tl = Math.hypot(tx, tz) || 1;
    const face = (dx * tx + dz * tz) / (l * tl);
    out[i] = (1 - ss(v.r * 0.6, v.r, d)) * ss(0.6, 0.85, face);
  }
  return out;
}

// the golden moment's envelope, s seconds after it began
export const momentAt = (s) => (s < 0 ? 0 : ss(0, 0.6, s) * (1 - ss(MOMENT_LEN - 2.5, MOMENT_LEN, s)));

// createVista({ reducedMotion, force: golden moment at once for a picture }) -> { update(dt, t, cat, camera, sound), state, done }
export function createVista(ctx = {}) {
  const reduced = !!ctx.reducedMotion;
  const ws = VISTAS.map(() => 0);
  const tg = [];
  const done = new Set();
  const dir = new THREE.Vector3();
  const prev = { x: 0, z: 0, ok: false };
  let still = 0;
  let momentAt0 = -1;
  let momentId = null;
  const state = { w: 0, i: -1, v: null, warm: 0, gold: 0, glow: 0, rim: 0, fx: 0, fy: 0, fz: 0 };
  return {
    state,
    done,
    update(dt, t, cat, camera, sound) {
      state.w = 0;
      state.i = -1;
      state.v = null;
      if (!cat || !camera?.getWorldDirection) { for (let i = 0; i < ws.length; i++) ws[i] = 0; state.gold = 0; return state; }
      camera.getWorldDirection(dir);
      vistaTargets(cat.x, cat.z, dir.x, dir.z, tg);
      const k = reduced ? 1 : Math.min(1, dt * 2);
      let best = 0;
      for (let i = 0; i < ws.length; i++) {
        ws[i] += (tg[i] - ws[i]) * (tg[i] > ws[i] ? k : Math.min(1, dt * 1.1));
        if (ws[i] > ws[best]) best = i;
      }
      const w = ws[best];
      if (w > 0.004) { state.w = w; state.i = best; state.v = VISTAS[best]; }
      // still: she has barely moved
      const moved = prev.ok && dt > 0 ? Math.hypot(cat.x - prev.x, cat.z - prev.z) / dt : 0;
      prev.x = cat.x; prev.z = cat.z; prev.ok = true;
      still = moved < 0.25 && w > 0.9 ? still + dt : 0;
      if (momentId === null && !reduced && state.v && still >= (ctx.force ? 0.4 : STILL_FOR) && !done.has(state.v.id)) {
        done.add(state.v.id);
        momentId = state.v.id;
        momentAt0 = t;
        sound?.vista?.();
      }
      let g = 0;
      if (momentId !== null) {
        const s = t - momentAt0;
        if (s > MOMENT_LEN || (state.v && state.v.id !== momentId && w > 0.5)) momentId = null;
        else g = momentAt(s);
      }
      state.gold = g;
      state.momentId = momentId;
      state.warm = state.v ? state.v.warm * w : 0;
      state.glow = 0.3 * w + 0.35 * g;
      state.rim = w;
      if (state.v) { state.fx = state.v.focus.x; state.fy = state.v.focus.y; state.fz = state.v.focus.z; }
      return state;
    },
  };
}

// ---- the weather's pool: the slots this claims (defined once at build; painted every frame)
export function defVista(def) {
  const [a, b, c] = [0xfff2c8, 0xffd9a0, 0xcfe8ff];
  for (let i = 0; i < VISTA_N.spark; i++) def('spark', i, 'bulb', 0.2 + 0.12 * hash01(i, 1, VSALT), [a, b, c][i % 3]);
  for (let i = 0; i < VISTA_N.haze; i++) def('haze', i, 'soft', i < 9 ? [14, 9, 6][Math.floor(i / 3)] : 7, 0xffd8b0);
  for (let i = 0; i < VISTA_N.frame; i++) def('frame', i, 'pennant', 0.17, 0xf08aa0);
}

const A = { x: 0, y: 0, z: 0 };
// paint the vista into the pool: slot = { put, I, alpha, colour } (marketweather.js), st = state, cam the camera, cat her paws
export function paintVista(slot, st, t, camera, cat, extra = {}) {
  const { put, I, alpha, colour, size } = slot;
  const on = st.w > 0.02 && camera?.matrixWorld;
  if (!on) {
    for (const k of ['spark', 'haze', 'frame']) for (let i = 0; i < VISTA_N[k]; i++) alpha[I[k] + i] = 0;
    return;
  }
  const v = st.v;
  const e = camera.matrixWorld.elements;
  const px = e[12]; const py = e[13]; const pz = e[14];
  const rx = e[0]; const ry = e[1]; const rz = e[2];
  const ux = e[4]; const uy = e[5]; const uz = e[6];
  const fx = -e[8]; const fy = -e[9]; const fz = -e[10];
  const w = st.w;
  const tri = v.tri.map(hexParts);
  // haze in three bands: a pale cool one near the lens (kept off the cat and out of the middle), a cloudy middle one, and a warm
  // glow beyond the focus that lifts it off the street
  const hx = st.fx - px; const hz = st.fz - pz; const L = Math.hypot(hx, hz) || 1;
  const ux2 = hx / L; const uz2 = hz / L; // along the view, level
  const rhx = -uz2; const rhz = ux2; // across it
  for (let b = 0; b < 3; b++) {
    const D = b === 0 ? 0.3 * L : b === 1 ? 0.62 * L : L + 3.5;
    for (let i = 0; i < 3; i++) {
      const j = b * 3 + i;
      const side = (i - 1) * (b === 0 ? 5.2 : b === 1 ? 6.5 : 4.5) + Math.sin(t * 0.07 + j * 2.1) * 0.8;
      const y = b === 0 ? 1.7 + i * 0.3 : b === 1 ? 1.0 + 0.5 * i : 1.8;
      const c = b === 0 ? [0.86, 0.92, 1] : b === 1 ? tri[0] : tri[1];
      const a = (b === 0 ? 0.05 : b === 1 ? 0.06 : 0.14) * w * (b === 0 && i === 1 ? 0 : 1);
      put(I.haze + j, px + ux2 * D + rhx * side, y, pz + uz2 * D + rhz * side, a);
      colour(I.haze + j, c);
    }
  }
  // the glow behind the focus, brighter in the golden moment (sized by how far off it is, so it reads the same near and far)
  for (let i = 9; i < 12; i++) size[I.haze + i] = Math.max(5, 0.32 * L);
  put(I.haze + 9, st.fx, st.fy - 0.2, st.fz, 0.14 * w + 0.22 * st.gold);
  put(I.haze + 10, st.fx + 0.5, st.fy + 0.5, st.fz, 0.06 * w + 0.14 * st.gold);
  put(I.haze + 11, st.fx - 0.5, st.fy - 0.6, st.fz, 0.06 * w + 0.12 * st.gold);
  for (let i = 9; i < 12; i++) colour(I.haze + i, tri[1]);
  // shafts aimed at the focus (the weather's own are kept if brighter), the bakery's steam rising by its counter
  for (let i = 0; i < 3; i++) {
    const j = I.shaft + i;
    put(j, st.fx + (i - 1) * 1.7 + rhx * 0.4, 3.2, st.fz + (i - 1) * 1.7 * 0.3 + rhz * 0.4, Math.max(alpha[j], 0.07 * w));
  }
  if (v.id === 'bakery') for (let i = 0; i < 4; i++) alpha[I.steam + i] = Math.max(alpha[I.steam + i], 0.2 * w * (0.6 + 0.4 * Math.sin(t * 1.3 + i * 1.9)));
  // a frame: pennants over the two top corners, hung on a swag, in the triad's colours (a sway, no more)
  const th = Math.tan((camera.fov * Math.PI) / 360); const tw = th * (camera.aspect || 1.78);
  const d = 1.8;
  for (let i = 0; i < VISTA_N.frame; i++) {
    const side = i < 7 ? -1 : 1;
    const s = (i % 7 + 0.5) / 7; // 0 at the corner .. 1 inboard
    const nx = side * (1.08 - 0.62 * s);
    const ny = 0.66 + 0.34 * s - 0.1 * 4 * s * (1 - s) - 0.06 + Math.sin(t * 1.3 + i) * 0.006;
    A.x = px + fx * d + rx * nx * tw * d + ux * ny * th * d;
    A.y = py + fy * d + ry * nx * tw * d + uy * ny * th * d;
    A.z = pz + fz * d + rz * nx * tw * d + uz * ny * th * d;
    put(I.frame + i, A.x, A.y, A.z, 0.92 * ss(0.3, 0.95, w) * (1 - 0.5 * st.gold));
    colour(I.frame + i, tri[(i + (side > 0 ? 1 : 0)) % 3]);
  }
  // the golden moment's sparkles: rise over the focus, twinkling
  const g = st.gold;
  for (let i = 0; i < VISTA_N.spark; i++) {
    if (g < 0.01) { alpha[I.spark + i] = 0; continue; }
    const q = (t * (0.26 + 0.12 * hash01(i, 2, VSALT)) + hash01(i, 3, VSALT)) % 1;
    const a = hash01(i, 4, VSALT) * 6.283 + t * 0.4;
    const rad = 0.5 + 1.8 * hash01(i, 5, VSALT);
    size[I.spark + i] = (0.12 + 0.09 * hash01(i, 6, VSALT)) * Math.max(L, 8);
    put(I.spark + i, st.fx + Math.cos(a) * rad, st.fy - 0.9 + q * 2.6, st.fz + Math.sin(a) * rad, Math.min(1, 1.5 * g * Math.sin(Math.PI * q)) * (0.6 + 0.4 * Math.sin(t * 7 + i * 3.1)));
  }
  void cat; void extra;
}
