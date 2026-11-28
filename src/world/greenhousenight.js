// =============================================================================
// THE GREENHOUSE AT NIGHT (beauty pass 9, 2026-11-28): night life. No mesh, no triangle, no caster, no new three.js symbol: it writes into
// spare slots of the creatures' ONE pooled Points (greenhousecreatures.js hands them over) and drives two uniforms on materials that
// already exist (the shafts turn to silver moonbeams, the mist to a cool blue).
//   * THE GRADE (a dusk walk only; the dusk look is the game's, this deepens it by the real clock): a night sky with stars and a moon
//     that show through the roof glass and over the garden, cool moonlight on the sun and fill, a bluer fog.
//   * THE HOUSE: night-blooming flowers glow soft and open (halos at the blooms), lantern pools on the paths, fireflies drifting in small
//     clouds with soft trails, moths with trails, the sleepy cat's slow breathing glow, a moon rim behind the cat (so she reads).
//   * VISITORS: a hedgehog snuffling along the court bed, a moth on the glass, an owl on a roof rib that hoots now and then.
// Night creatures also come out on any walk at the real night hours (21 to 5), dimmer; the grade and the stars only on a dusk walk.
// Pure functions of the walk's clock, the hash and the hour handed in: no random number, no clock of its own. Reduced motion: every
// creature still (no trails, no drift, no blink), the hoot's sound only. Lite: about half the points.
// =============================================================================
import { hash01 } from './warehouselook.js';
import { GH_STORY_SALT } from './greenhousestory.js';
import * as P from './greenhouseplan.js';
import { NIGHT } from './greenhouseglass.js';
import { skyBackground } from '../render/sky.js';

const SALT = GH_STORY_SALT + 90;
export const nightSlots = (lite = false) => (lite ? 56 : 100);
export const OWL = Object.freeze({ x: -6, y: 9.75, z: -14.5 }); // a roof rib's crown in the hall's north half
const HOOT = [14, 26];
const CLOUDS = [[2, -7, 4.5], [-21, -9, 3.5], [0, 22, 6], [22, 19, 4]]; // x, z, reach: the hall, the orchid house, the court, the shed
const MOTH_AT = [[-2, -5, 2.2], [-19, -9, 1.8], [24.5, 16, 2.2]]; // x, z, y

// how deep the night is by the clock (0..1): full from 21:00 to 05:00, dusk and dawn ramps either side
export function nightLook(hour = 12) {
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
  return h >= 21 || h < 5 ? 1 : h >= 19 ? (h - 19) / 2 : h < 6.5 ? (6.5 - h) / 1.5 : 0;
}
// how strong each part is: the grade, the stars, the glows (a dusk walk) and the creatures (a dusk walk, or the real night, dimmer)


export function createNight({ pool, scene = null, sun = null, fill = null, reducedMotion = false, lite = false, dusk = false, hour = 12, mist = [], hoot = null, enabled = true } = {}) {
  const d = nightLook(hour), st = enabled ? { grade: dusk ? 0.6 + 0.4 * d : 0, life: dusk ? 1 : d >= 0.5 ? 0.7 * d : 0 } : { grade: 0, life: 0 }; // (enabled: false is the 'before' of the pictures)
  const rm = reducedMotion;
  let dim = 1;
  let clock = 0, disposed = false, nextHoot = 7 + 6 * hash01(0, 1, SALT), hoots = 0, hootAt = -9;
  if (!enabled) nextHoot = 1e9;
  let n = 0;
  const take = (k) => { const s = n; n += k; return s; };
  const NS = lite ? 10 : 26, NF = lite ? 4 : 12, NM = lite ? 2 : 3;
  const S0 = take(NS), MOON = take(2), F0 = take(NF * 2), M0 = take(NM), LP = take(4), BL = take(5), CATG = take(2), HG = take(4), OW = take(4), GM = take(2);
  const mistWas = mist.map((m) => m.userData.mist.uColor.value.clone());

  // the grade: once, when the walk is made (the dusk look is already on); the stars and the moon are points
  function grade() {
    const g = st.grade;
    if (g <= 0) return;
    NIGHT.value = g;
    const k = Math.min(1, g);
    if (scene) {
      scene.background = skyBackground(0x0a1230, k > 0.8 ? 0x3a4c82 : 0x6a6a96);
      scene.fog?.color?.lerp?.({ r: 0.16, g: 0.22, b: 0.4 }, 0.7 * k);
      if (Number.isFinite(scene.environmentIntensity)) scene.environmentIntensity *= 1 - 0.55 * k;
    }
    if (sun) { sun.intensity *= 1 - 0.62 * k; sun.color.lerp({ r: 0.62, g: 0.74, b: 1 }, 0.8 * k); }
    if (fill) { fill.intensity *= 1 - 0.45 * k; fill.color.lerp({ r: 0.4, g: 0.52, b: 0.85 }, 0.55 * k); fill.groundColor.lerp({ r: 0.1, g: 0.14, b: 0.26 }, 0.5 * k); }
    for (const m of mist) m.userData.mist.uColor.value.set(0x9fc0ee);
  }
  grade();

  if (n > pool.count) throw new Error('night: not enough slots');
  const { put, hide } = pool;
  const hideAll = () => { for (let i = 0; i < n; i++) hide(i); };
  hideAll();

  function sky(T, g) {
    for (let i = 0; i < NS; i++) { // stars on a dome (fixed), twinkling a little; the moon with a halo
      const az = hash01(i, 1, SALT) * 6.2832, el = i % 2 ? 0.3 + 0.9 * hash01(i, 2, SALT) : 0.02 + 0.12 * hash01(i, 2, SALT), r = 130;
      const tw = rm ? 0.8 : 0.55 + 0.45 * Math.sin(T * (0.6 + hash01(i, 3, SALT)) + i * 7);
      const b = 0.75 + 0.25 * hash01(i, 4, SALT);
      put(S0 + i, Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, -9 + Math.sin(az) * Math.cos(el) * r, 0.8 + 0.5 * hash01(i, 5, SALT), b * 0.9, b * 0.95, b, g * tw);
    }
    put(MOON, -72, 14, -132, 6, 0.95, 0.97, 1, g * 0.95);
    put(MOON + 1, -72, 14, -132, 20, 0.55, 0.68, 1, g * 0.2);
  }

  function house(T, g, l, cat, cam) {
    // lantern pools on the paths (the court lamps, the shed door, the Palm House door), breathing very slightly
    const pools = [[P.COURT_LAMPS[0].x, P.COURT_LAMPS[0].z], [P.COURT_LAMPS[1].x, P.COURT_LAMPS[1].z], [P.SHED.door.x - 0.6, P.SHED.door.z], [0, 1.6]];
    pools.forEach(([x, z], i) => put(LP + i, x, 0.09, z, 1.1, 1, 0.72, 0.36, g * (0.38 + 0.04 * Math.sin(T * 1.7 + i))));
    // night-blooming flowers: glowing halos that open (swell) with the night
    const spots = [[P.CATNIP_BEDS[0].x, 0.55, P.CATNIP_BEDS[0].z], [P.CATNIP_BEDS[1].x, 0.55, P.CATNIP_BEDS[1].z], [P.HIBISCUS_SPOTS[0][0], 1.4, P.HIBISCUS_SPOTS[0][1]], [P.HIBISCUS_SPOTS[1][0], 1.4, P.HIBISCUS_SPOTS[1][1]], [P.FOUNTAIN.x, 1.05, P.FOUNTAIN.z]];
    spots.forEach(([x, y, z], i) => { const p = rm ? 0.85 : 0.75 + 0.25 * Math.sin(T * 0.9 + i * 1.9); put(BL + i, x, y, z, (0.3 + 0.07 * i % 2 + 0.06 * p) * (0.8 + 0.4 * g), i % 2 ? 0.7 : 0.55, i % 2 ? 0.8 : 0.9, 1, g * 0.55 * p); });
    // the sleepy cat's slow breathing glow, and a moon rim behind the cat so she reads against the dark
    const bed = P.POTTING, br = rm ? 0.5 : 0.5 + 0.5 * Math.sin(T * 1.5);
    put(CATG, bed.x + 0.3, 0.3, bed.z + bed.d / 2 + 0.12, 0.38 + 0.08 * br, 0.62, 0.76, 1, g * (0.12 + 0.12 * br));
    if (cat && cam) {
      const dx = cat.x - cam.x, dz = cat.z - cam.z, d = Math.hypot(dx, dz) || 1;
      put(CATG + 1, cat.x + (dx / d) * 0.28, (cat.y ?? 0) + 0.38, cat.z + (dz / d) * 0.28, 0.5, 0.6, 0.76, 1, g * 0.2);
    } else hide(CATG + 1);
    // fireflies in small clouds with two-step trails; moths with a trail
    for (let j = 0; j < NF; j++) {
      const c = CLOUDS[j % 4], h = hash01(j, 6, SALT), ph = h * 6.3, base = F0 + j * 2;
      for (let k = 0; k < 2; k++) {
        const t = T - k * 0.28;
        const x = c[0] + c[2] * (0.5 + 0.5 * h) * Math.sin(0.23 * t + ph) + 0.7 * Math.sin(0.9 * t + ph * 2), z = c[1] + c[2] * 0.7 * Math.cos(0.19 * t + ph * 1.3) + 0.7 * Math.cos(0.8 * t + ph);
        const y = 0.7 + 0.9 * hash01(j, 7, SALT) + 0.35 * Math.sin(0.5 * t + ph);
        const bl = rm ? 0.8 : 0.12 + 0.88 * Math.max(0, Math.sin(1.1 * T + ph * 3)) ** 2;
        if (k && rm) { hide(base + k); continue; }
        put(base + k, x, y, z, (0.16 - 0.04 * k) * (1 + 0.3 * l), 0.85, 1, 0.45, bl * l * (k ? 0.35 : 0.9));
      }
    }
    for (let j = 0; j < NM; j++) { // moths loop round their lantern, wings fluttering
      const m = MOTH_AT[j % 3], a = T * (1.3 + 0.3 * j) + j * 2.1 + 1, r = 0.55 + 0.25 * Math.sin(0.6 * T + j);
      put(M0 + j, m[0] + Math.cos(a) * r, m[2] + 0.35 * Math.sin(a * 1.4 + j), m[1] + Math.sin(a) * r, 0.15 * (rm || Math.sin(T * 24 + j) > -0.3 ? 1 : 0.55), 0.92, 0.94, 1, l * 0.9);
    }
  }

  function visitors(T, l) {
    // the hedgehog: along the court bed's edge and back, nose down, snuffling
    const run = rm ? 0 : T * 0.05, dir = Math.cos(run) >= 0 || rm ? 1 : -1, hz = 22.2 + (rm ? 0.6 : 1.8 * Math.sin(run)), hx = -3.7;
    const bob = rm ? 0 : 0.025 * Math.sin(T * 9);
    put(HG, hx, 0.17, hz, 0.15, 0.24, 0.16, 0.1, l);
    put(HG + 1, hx, 0.28, hz - dir * 0.02, 0.12, 0.5, 0.4, 0.28, l); // spines
    put(HG + 2, hx, 0.14 + bob, hz + dir * 0.17, 0.07, 0.62, 0.48, 0.36, l);
    put(HG + 3, hx, 0.13 + bob, hz + dir * 0.24, 0.03, 0.12, 0.08, 0.07, l);
    // the owl on its rib: a dark body, a head, two eyes that open wide while she hoots
    const hooting = !rm && T - hootAt < 1.3 ? Math.sin(Math.PI * (T - hootAt) / 1.3) : 0;
    put(OW, OWL.x, OWL.y, OWL.z, 0.95, 0.3, 0.26, 0.22, l);
    put(OW + 1, OWL.x, OWL.y + 0.55, OWL.z, 0.62 * (1 + 0.15 * hooting), 0.38, 0.32, 0.27, l);
    put(OW + 2, OWL.x - 0.15, OWL.y + 0.62, OWL.z + 0.2, 0.2 + 0.07 * hooting, 1, 0.9, 0.2, l * (0.8 + 0.2 * hooting));
    put(OW + 3, OWL.x + 0.15, OWL.y + 0.62, OWL.z + 0.2, 0.2 + 0.07 * hooting, 1, 0.9, 0.2, l * (0.8 + 0.2 * hooting));
    // the moth on the glass (the Palm House's south pane): its wings open and close
    const op = rm ? 0.8 : 0.35 + 0.65 * Math.abs(Math.sin(T * 0.8));
    put(GM, -2.3 - 0.2 * op, 2.5, 0.12, 0.42, 1, 0.96, 0.8, l * 0.95);
    put(GM + 1, -2.3 + 0.2 * op, 2.5, 0.12, 0.42, 1, 0.96, 0.8, l * 0.95);
  }

  return {
    get active() { return st.life > 0; },
    setDim(v) { dim = v; }, // pass 10: the shared event budget (greenhousebudget.js) may dim the visitors
    update(dt, t, cat = null, cam = null) {
      if (disposed) return;
      clock += dt > 0 ? dt : 0;
      void t;
      const T = rm ? 0 : clock, g = st.grade, l = st.life * dim;
      if (g > 0) sky(T, g); else for (let i = 0; i < NS + 2; i++) hide(S0 + i);
      if (l <= 0) { hideAll(); return; }
      house(T, g, l, cat, cam);
      visitors(T, l);
      if (clock >= nextHoot) { // the owl hoots (a soft sound by the game's own audio; the eyes open wide); the next one is 14 to 26 s on
        hoots++; hootAt = clock;
        const d = cat ? Math.hypot(cat.x - OWL.x, cat.z - OWL.z) : 30;
        try { hoot?.(Math.max(0.3, Math.min(1, 1.25 - d / 30))); } catch { /* sound is optional */ }
        nextHoot = clock + HOOT[0] + (HOOT[1] - HOOT[0]) * hash01(hoots, 2, SALT);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      NIGHT.value = 0;
      hideAll();
      mist.forEach((m, i) => m.userData.mist.uColor.value.copy(mistWas[i]));
    },
  };
}
