// =============================================================================
// THE GREENHOUSE'S VISTAS (beauty pass 7, 2026-11-28): five spots that photograph well (the hall's door looking down the aisle, the
// orchid house, the potting bench, the court with the fountain, the shed corner). Standing near one the picture is graded: the fill's sky
// leans warm (it is also the sky colour the cat's fur rim reads, so she gets a warm rim), the far fog draws in a little and the mist and
// shafts warm and gain (greenhouselife.js reads state.k), and a soft rim-light halo blooms on the focal point (the biggest bloom, the
// fountain...). Stand still 3+ seconds at one and the GOLDEN MOMENT comes once a walk: pollen sparkles drift up round her with a soft chime.
// All of it is ONE pooled THREE.Points (no mesh, no triangle, no caster) and numbers on lights the game already has. Pure functions of the
// walk's clock and her place: no random number, no clock of its own. Reduced motion: the grade and the halo show, the sparkles hold still
// (no drift). Lite: fewer sparkles, no fog change. Audio only on the game's own audio object, optional-safe.
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { GH_STORY_SALT } from './greenhousestory.js';
import { dotSprite } from './greenhouseweather.js';
import { voiceFree } from './greenhousebudget.js';

const SALT = GH_STORY_SALT + 80;
// x, z: where she stands; r: how near counts; focal: what the picture is about (x, y, z); size: the halo's width (m)
export const VISTAS = Object.freeze([
  { id: 'hall', x: 0, z: -3, r: 3.6, focal: { x: 0, y: 3.3, z: -9 }, size: 3.4 },
  { id: 'orchid', x: -18, z: -9, r: 3.4, focal: { x: -26, y: 1.3, z: -9 }, size: 2.2 },
  { id: 'bench', x: 20.6, z: 15.9, r: 3.4, focal: { x: 22, y: 1.15, z: 14 }, size: 2.0 },
  { id: 'court', x: 0, z: 26, r: 4.2, focal: { x: 0, y: 1.7, z: 14 }, size: 4.2 },
  { id: 'shed', x: 22, z: 20, r: 3.6, focal: { x: 26.5, y: 1.8, z: 16 }, size: 3.0 },
].map((v) => Object.freeze(v)));
export const STILL_NEEDED = 3; // s of standing still at a vista for the golden moment
export const GOLD_LEN = 7; // s the sparkles last
export const WARM = Object.freeze({ r: 0.16, g: 0.06, b: -0.15 }); // added to the fill's sky colour at a vista's full grade
export const FOG_PULL = 0.12; // the far fog comes in by this share at most
const sm = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

// which vista she is at (or null) and how strongly (0..1), by her place
export function vistaAt(x, z) {
  let best = null, bk = 0;
  for (const v of VISTAS) {
    const k = 1 - Math.hypot(x - v.x, z - v.z) / v.r;
    if (k > bk) { bk = k; best = v; }
  }
  return best ? { vista: best, k: sm(bk * 1.6) } : null;
}

export function createVistas({ scene, audio = null, reducedMotion = false, lite = false } = {}) {
  const SP = lite ? 10 : 22, N = SP + 1; // slot 0: the halo
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const sprite = dotSprite();
  const mat = new THREE.PointsMaterial({ size: 1, map: sprite, vertexColors: true, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true });
  mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;'); };
  mat.customProgramCacheKey = () => 'greenhouse-vista-v1';
  const points = new THREE.Points(geo, mat);
  points.name = 'greenhouse:vista';
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  points.castShadow = false;
  points.visible = false;
  scene?.add(points);
  const fill = scene?.children?.find?.((o) => o.isHemisphereLight) ?? null;
  const fog = scene?.fog ?? null;
  const state = { k: 0, id: null, gold: 0, golden: false, dim: 1, mayStart: true }; // (pass 10: dim and mayStart come from the shared event budget)
  let k = 0, applied = 0, fk = 1, goldAt = -1, done = false, disposed = false, clock = 0, last = null;

  const tint = (a) => { // move the fill's sky colour by `a` of the warm shift (undone exactly by the next call)
    if (!fill || a === applied) return;
    const d = a - applied;
    fill.color.r = Math.max(0, fill.color.r + WARM.r * d); fill.color.g = Math.max(0, fill.color.g + WARM.g * d); fill.color.b = Math.max(0, fill.color.b + WARM.b * d);
    applied = a;
  };
  const chime = () => { try { if (audio && audio.isMuted?.() === false && voiceFree(audio, 1.2)) audio.chime?.(); } catch { /* sound is optional */ } };

  return {
    points,
    state,
    // dt, her place (x, z) or null, how long she has stood still (s)
    update(dt, cat, still = 0) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const at = cat ? vistaAt(cat.x, cat.z) : null;
      if (at) last = at.vista;
      const want = at ? at.k : 0;
      k += (want - k) * Math.min(1, step * (want > k ? 1.6 : 0.8));
      if (Math.abs(k - want) < 0.002) k = want;
      state.k = k; state.id = last?.id ?? null;
      tint(Math.round(k * 200) / 200);
      if (fog && Number.isFinite(fog.far)) { const nk = 1 - FOG_PULL * (lite ? 0 : k); if (nk !== fk) { fog.far = fog.far / fk * nk; fk = nk; } }
      // the golden moment: still 3+ s at a vista, once a walk
      if (!done && at && at.k > 0.7 && still >= STILL_NEEDED && state.mayStart) { done = true; goldAt = clock; state.golden = true; chime(); }
      const g = goldAt < 0 ? 0 : clock - goldAt;
      state.gold = goldAt < 0 || g > GOLD_LEN ? 0 : sm(g / 1.2) * sm((GOLD_LEN - g) / 2);
      const halo = k > 0.02 && last;
      points.visible = !!halo || state.gold > 0.005;
      if (!points.visible) return;
      // slot 0: the rim-light halo on the focal point, warm, breathing a little
      const f = last?.focal ?? { x: 0, y: 0, z: 0 };
      const br = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(clock * 1.1);
      pos.set([f.x, f.y, f.z], 0);
      size[0] = (last?.size ?? 2) * (1 + 0.35 * state.gold);
      col.set([1, 0.72, 0.35, halo ? Math.min(0.75, 0.6 * k * br * (1 + 0.5 * state.gold)) * state.dim : 0], 0);
      const cx = cat?.x ?? last?.x ?? 0, cz = cat?.z ?? last?.z ?? 0;
      for (let i = 0; i < SP; i++) { // sparkles: pollen rising round her, each on its own beat
        const h = hash01(i, 1, SALT), h2 = hash01(i, 2, SALT), a = h * 6.283 + (reducedMotion ? 0 : clock * (0.3 + 0.2 * h2));
        const rise = reducedMotion ? h2 : (h2 + g * (0.07 + 0.05 * h)) % 1;
        const sx = cx + Math.sin(a) * (0.5 + 1.6 * h2), sz = cz + Math.cos(a) * (0.5 + 1.6 * h2);
        pos.set([sx, 0.2 + 2.4 * rise, sz], (i + 1) * 3);
        size[i + 1] = 0.5 + 0.5 * h;
        const tw = reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(clock * 4 + h * 40);
        col.set([1, 0.55, 0.08, Math.min(1, 1.8 * state.gold * tw * Math.sin(Math.PI * rise) ** 0.5)], (i + 1) * 4);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      tint(0);
      if (fog && Number.isFinite(fog.far)) { fog.far /= fk; fk = 1; }
      scene?.remove(points); geo.dispose(); mat.dispose(); sprite.dispose();
    },
  };
}
