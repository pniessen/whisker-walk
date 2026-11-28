// =============================================================================
// THE GREENHOUSE'S WEATHER AS EVENTS (beauty pass 6, 2026-11-28). No mesh, no triangle, no caster: uniforms on materials that already exist,
// plus ONE pooled Points (pollen in a sun burst, fireflies drifting into the hall at the dusk glow).
//   * RAIN ON GLASS: heavy rain streaks the whole roof (greenhouseglass.js), the floor's light turns into wobbly caustics, the lamp pools
//     warm up (greenhouselife.js reads state.cosy), the patter drums in gusts and thunder rolls far away (greenhousesound.js reads state.rain).
//   * A SUN BURST (dry day walks, and after a rain): crisp window-pane squares of light across the beds, pollen floating, the plants perk up.
//   * A MORNING HAZE (the real clock, 5 to 11:30): the garden lies in a warm haze that lifts over the first minute and a half of the walk.
//   * A DUSK GLOW (dusk walks, and the real evening): the lamp pools swell and fireflies drift in through the hall.
//   * A RARE WIND: every plant sways in sync, a whoosh through the vents.
// Pure functions of the walk's clock, the weather the walk hands in and the hash of the walk (no random number, no clock of its own).
// Reduced motion: no timed events (a still house; only the rain itself shows, as still caustics). Lite: fewer points, no haze.
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { GH_STORY_SALT } from './greenhousestory.js';
import { DAPPLE_FX, SHAFT_SPOTS } from './greenhouseglass.js';
import { PERK, WIND } from './greenhouseplants.js';

const SALT = GH_STORY_SALT + 70;
export const SUN_SLOT = 160; // s: one chance of a sun burst per slot (the first slot always has one, early)
export const WIND_SLOT = 330;
export const SUN_LEN = 30, GLOW_LEN = 44, WIND_LEN = 14, POST_RAIN = 34, HAZE_LIFT = 95;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const env = (t, at, len, ramp = 3.5) => sm(0, ramp, t - at) * sm(0, ramp, at + len - t); // up, hold, down

// one timed event of a repeating slot: the slot's start (early in the first slot) and its envelope; slot 0 is always on
function slotEnv(clock, slot, len, salt, chance, first0, first1) {
  const n = Math.floor(clock / slot), at = n * slot + (n === 0 ? first0 + (first1 - first0) * hash01(n, 1, SALT + salt) : 25 + (slot - len - 50) * hash01(n, 1, SALT + salt));
  if (n > 0 && hash01(n, 2, SALT + salt) >= chance) return 0;
  return env(clock, at, len);
}

// what the weather is doing now, 0..1 each (a pure function; the walk smooths nothing more)
export function eventsAt(clock, { rain = 0, dusk = false, day = { morning: 0, warm: 0 }, sinceRain = 1e9, reducedMotion = false } = {}) {
  const dry = 1 - Math.min(1, rain * 1.5);
  const timed = reducedMotion ? 0 : 1;
  const sun = dusk ? 0 : Math.max(slotEnv(clock, SUN_SLOT, SUN_LEN, 1, 0.75, 22, 45) * timed, reducedMotion ? 0 : env(sinceRain, 0, POST_RAIN, 3.5)) * dry;
  const haze = dusk || reducedMotion ? 0 : Math.min(1, day.morning * 1.4) * (1 - sm(20, HAZE_LIFT, clock)) * dry;
  const evening = dusk ? 1 : sm(0.25, 0.6, day.warm);
  const glow = evening * (reducedMotion ? 0 : slotEnv(clock, 130, GLOW_LEN, 3, 0.8, 14, 34)) * dry;
  const wind = reducedMotion ? 0 : slotEnv(clock, WIND_SLOT, WIND_LEN, 4, 0.4, 60, 120) * (0.7 + 0.3 * Math.sin(clock * 0.9));
  return { rain, sun, haze, glow, wind: Math.max(0, wind), cosy: Math.max(rain * 0.45, glow * 0.5) };
}

function dotSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWeatherFx({ scene, reducedMotion = false, lite = false, dusk = false, day = { morning: 0, warm: 0 }, force = null } = {}) {
  const POL = lite ? 8 : 18, FF = lite ? 5 : 11, N = POL + FF;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const sprite = dotSprite();
  const mat = new THREE.PointsMaterial({ size: 0.36, map: sprite, vertexColors: true, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.name = 'greenhouse:weather';
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  points.castShadow = false;
  points.visible = false;
  scene?.add(points);
  const fog = scene?.fog ?? null;
  let fk = 1; // the share of the far fog reach now taken by the haze (undone by division, so the game's own changes to the fog stand)
  let clock = 0, rain = 0, sinceRain = 1e9, was = false, disposed = false;
  const state = { rain: 0, sun: 0, haze: 0, glow: 0, wind: 0, cosy: 0 };

  function swarm(t, s, g, cx, cz) {
    const rm = reducedMotion ? 0 : 1;
    for (let i = 0; i < POL; i++) { // pollen: slow loops round the sun shafts, warm gold
      const [sx, sz] = SHAFT_SPOTS[i % SHAFT_SPOTS.length], h = hash01(i, 3, SALT), a = rm * t * (0.12 + 0.1 * h) + h * 6.3;
      pos.set([sx + 2.6 * Math.sin(a) * (0.5 + h), 0.5 + 2.2 * ((h * 7 + rm * t * 0.05) % 1), sz + 2.6 * Math.cos(a * 0.8) * (0.5 + h)], i * 3);
      col.set([1, 0.86, 0.3, s * (0.8 + 0.2 * Math.sin(rm * t * 1.3 + h * 20) ** 2)], i * 4);
    }
    for (let j = 0; j < FF; j++) { // fireflies: drifting in through the hall, blinking
      const h = hash01(j, 4, SALT), a = rm * t * 0.25 + h * 6.3, i = POL + j;
      pos.set([cx - 5 + 10 * h + 1.4 * Math.sin(a), 0.6 + 1.5 * hash01(j, 5, SALT) + 0.3 * Math.sin(a * 1.7), cz - 6.5 + 7 * hash01(j, 6, SALT) + 1.4 * Math.cos(a * 0.9)], i * 3); // round her, ahead and to the sides
      col.set([0.95, 1, 0.5, g * (reducedMotion ? 0.8 : 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.2 + h * 20)) ** 2)], i * 4);
    }
  }

  return {
    points,
    state,
    update(dt, t, raining = false, cat = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      if (was && !raining) sinceRain = 0; else sinceRain += step;
      was = raining;
      rain += ((raining ? 1 : 0) - rain) * Math.min(1, step * 1.2);
      Object.assign(state, eventsAt(clock, { rain: reducedMotion ? (raining ? 1 : 0) : rain, dusk, day, sinceRain, reducedMotion }));
      if (force && typeof force === 'object') for (const k of Object.keys(force)) state[k] = force[k]; // (pictures and tests)
      void t;
      DAPPLE_FX.sun.value = Math.max(state.sun, state.glow * 0.55); DAPPLE_FX.wet.value = state.rain;
      PERK.value = Math.min(1, state.sun * 1.15); WIND.value = state.wind;
      if (fog && Number.isFinite(fog.far)) { // a haze: the garden's far reach comes in a little (at most a fifth)
        const nk = 1 - 0.2 * (lite ? 0 : Math.min(1, state.haze + state.glow * 0.4));
        fog.far = fog.far / fk * nk; fk = nk;
      }
      const dots = Math.max(state.sun, state.glow);
      points.visible = dots > 0.01;
      if (points.visible) { swarm(clock, state.sun, state.glow, cat?.x ?? 0, cat?.z ?? 0); geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      DAPPLE_FX.sun.value = 0; DAPPLE_FX.wet.value = 0; PERK.value = 0; WIND.value = 0;
      if (fog && Number.isFinite(fog.far)) fog.far /= fk;
      scene?.remove(points); geo.dispose(); mat.dispose(); sprite.dispose();
    },
  };
}
