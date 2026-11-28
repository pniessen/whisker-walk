// =============================================================================
// NIGHT LIFE (Market beauty pass 8). Part of the Market's story stage (marketstagelife.js, with marketweather.js): no triangle,
// mesh or caster is added. After dark by the real clock (or ctx.night, or ?force=night on the page) the square becomes a
// lantern-lit night market: the sky goes blue with a few stars and a moon, the sun turns to moonlight with a silver rim on her
// fur (the fill's colour and strength), every lantern string glows in halos and pools its light on the cobbles, the awnings dim
// (the closing hour's dial), a stallholder's lamp is left on at three stalls, and the night visitors come: moths round the
// lanterns, an owl on the bakery's roof that turns its head and hoots, a cat sitting on the toy stall's roof, and bats.
// All of it is the weather's one pooled Points (its slots are claimed here) and a few light and sky colours put back at the end.
// A pure function of the walk's seconds (hash01, no Math.random). Reduced motion has the static grade only; lite has the grade only.
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { STALLS, awningHeight, fromStall, stallClimb } from './marketplan.js';

export const NSALT = 389;
export const NIGHT_N = { star: 24, moth: 12, pool: 10, lamp: 3, owl: 3, bat: 4, rcat: 5, moon: 2 };
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const SHOPS = STALLS.filter((s) => s.w > 0);
const LAMP_STALLS = ['baker', 'plants', 'cheese'];

// after dark by the real clock: 8 pm to 5 am
export const clockNight = (d) => { const h = d.getHours(); return h >= 20 || h < 5; };
export const nightOn = (ctx) => (ctx.force === 'night' ? true : ctx.night ?? (ctx.now ? false : clockNight(new Date())));

// the lanterns the moths and pools belong to: one lantern at each shop's awning front, then a second on the wider ones
export const lanterns = () => SHOPS.flatMap((s) => [-0.5, 0.5].map((h) => {
  const lx = h * (s.w - 0.3) * 0.9; const lz = s.d / 2 + 0.45;
  const p = fromStall(s, lx, lz);
  return { x: p.x, y: awningHeight(s, lx, lz) - 0.4, z: p.z };
}));

export function defNight(def) {
  for (let i = 0; i < NIGHT_N.star; i++) def('star', i, 'dot', 0.5 + 0.5 * hash01(i, 1, NSALT), 0xfff4d8);
  for (let i = 0; i < NIGHT_N.moth; i++) def('moth', i, 'dot', 0.07, 0xf2ecd2);
  for (let i = 0; i < NIGHT_N.pool; i++) def('pool', i, 'soft', 3.2, 0xffb860);
  for (let i = 0; i < NIGHT_N.lamp; i++) def('lamp', i, 'soft', 1.6, 0xffc070);
  def('owl', 0, 'dot', 0.5, 0x2a2420); def('owl', 1, 'dot', 0.09, 0xffd860); def('owl', 2, 'dot', 0.09, 0xffd860);
  for (let i = 0; i < NIGHT_N.bat; i++) def('bat', i, 'bird', 1.1, 0x15151c);
  def('rcat', 0, 'dot', 0.55, 0x14141c); def('rcat', 1, 'dot', 0.32, 0x14141c); def('rcat', 2, 'pennant', 0.16, 0x14141c);
  def('rcat', 3, 'pennant', 0.16, 0x14141c); def('rcat', 4, 'streak', 0.5, 0x14141c);
  def('moon', 0, 'soft', 24, 0x9ab8ff); def('moon', 1, 'dot', 4.2, 0xf4f1e2);
}

// createNight(ctx) -> { on, w, hoot (true on the frame the owl calls), grade(...), paint(slot, ...), restore() }
export function createNight(ctx = {}) {
  const on = nightOn(ctx);
  const reduced = !!ctx.reducedMotion;
  const L = on ? lanterns() : [];
  const sun = ctx.sun ?? null; const fill = ctx.fill ?? null;
  const sunC = sun?.color ? sun.color.clone() : null; const sunI = sun?.intensity ?? 0;
  const fillC = fill?.color ? fill.color.clone() : null; const fillI = fill?.intensity ?? 0;
  const bg = ctx.scene?.background?.isColor ? ctx.scene.background : null; const bg0 = bg ? bg.clone() : null;
  const moonlight = new THREE.Color(0x8fb4ff); const silver = new THREE.Color(0xbcd0ff); const sky = new THREE.Color(0x14224a);
  const roof = (id) => stallClimb(id)?.roof ?? { x: 0, y: 4, z: 0 };
  const state = { w: on ? 1 : 0, hootAt: 4, hoot: false };
  let w = on ? (reduced ? 1 : 0) : 0;
  return {
    on,
    state,
    // the light and the sky, every frame (dt for the fade-in), before the points
    grade(dt, react, lite) {
      if (!on) return 0;
      w += ((1 - w) * Math.min(1, dt * 0.8));
      state.w = w;
      if (react) {
        react.uMkTone.value.x *= 1 - 0.3 * w; react.uMkTone.value.y *= 1 - 0.2 * w; react.uMkTone.value.z *= 1 + 0.12 * w;
        if (!lite) react.uMkDay.value.set(0, 1); // the awnings dimmed: it is past closing
      }
      if (sun && sunC) { sun.color.copy(sunC).lerp(moonlight, 0.8 * w); sun.intensity = sunI * (1 - 0.5 * w); }
      if (fill && fillC) { fill.color.copy(fillC).lerp(silver, 0.5 * w); fill.intensity = fillI * (1 + 0.4 * w); } // a silver rim on her fur and a readable cat
      if (bg) bg.copy(bg0).lerp(sky, 0.7 * w);
      return w;
    },
    // paint the night's slots: slot = { put, I, size, alpha, colour } (marketweather.js), cat her paws, sound the game's own
    paint(slot, t, cat, sound) {
      const { put, I } = slot;
      const k = w;
      state.hoot = false;
      // the sky: a moon over the fountain's side and a few stars, twinkling
      put(I.moon, -26, 30, -34, 0.3 * k); put(I.moon + 1, -26, 30, -34, 0.9 * k);
      for (let i = 0; i < NIGHT_N.star; i++) {
        const a = hash01(i, 2, NSALT) * 6.283; const e = 0.35 + 0.55 * hash01(i, 3, NSALT);
        put(I.star + i, Math.cos(a) * 70 * (1 - e * 0.4), 18 + 40 * e, Math.sin(a) * 70 * (1 - e * 0.4) - 10, k * (0.5 + 0.5 * Math.sin(t * (0.6 + hash01(i, 4, NSALT)) + i * 2.3)) * 0.9);
      }
      // moths round the lanterns, the pools of light under them
      for (let i = 0; i < NIGHT_N.moth; i++) {
        const l = L[(i * 3) % L.length]; const a = t * (1.1 + 0.5 * hash01(i, 5, NSALT)) + i * 2.1;
        const r = 0.35 + 0.25 * Math.sin(t * 0.7 + i);
        put(I.moth + i, l.x + Math.cos(a) * r, l.y + Math.sin(a * 1.7) * 0.25, l.z + Math.sin(a) * r, k * 0.85 * (0.6 + 0.4 * Math.sin(t * 9 + i * 3)));
      }
      for (let i = 0; i < NIGHT_N.pool; i++) {
        const l = L[(i * 2 + 1) % L.length];
        put(I.pool + i, l.x, 0.06, l.z, k * 0.2 * (0.85 + 0.15 * Math.sin(t * 2.1 + i)));
      }
      // a stallholder's lamp left on
      LAMP_STALLS.forEach((id, i) => {
        const s = SHOPS.find((q) => q.id === id); if (!s) return;
        const p = fromStall(s, 0, 0);
        put(I.lamp + i, p.x, 1.35, p.z, k * 0.3 * (0.92 + 0.08 * Math.sin(t * 1.4 + i)));
      });
      // the owl on the bakery's roof: its head turns, it blinks, it hoots now and then
      const o = roof('baker');
      const turn = Math.sin(t * 0.35) * (Math.sin(t * 0.17) > 0.3 ? 1 : 0.2);
      const blink = (t % 6) < 0.15 ? 0 : 1;
      put(I.owl, o.x, o.y + 0.3, o.z, k * 0.9);
      put(I.owl + 1, o.x - 0.07 + turn * 0.06, o.y + 0.42, o.z + 0.12, k * blink);
      put(I.owl + 2, o.x + 0.07 + turn * 0.06, o.y + 0.42, o.z + 0.12, k * blink);
      if (k > 0.8 && t > state.hootAt) { state.hoot = true; state.hootAt = t + 16 + 10 * hash01(Math.floor(t), 6, NSALT); if (sound) sound.hoot?.(); }
      // a cat sitting on the toy stall's roof, a dark shape against the sky, its tail curling
      const c = roof('toys');
      put(I.rcat, c.x, c.y + 0.3, c.z, k * 0.9); put(I.rcat + 1, c.x + 0.05, c.y + 0.62, c.z, k * 0.9);
      put(I.rcat + 2, c.x - 0.06, c.y + 0.82, c.z, k * 0.9, -0.1); put(I.rcat + 3, c.x + 0.16, c.y + 0.82, c.z, k * 0.9, 0.1);
      put(I.rcat + 4, c.x + 0.35, c.y + 0.2, c.z, k * 0.8, 1.2 + Math.sin(t * 0.9) * 0.4);
      // bats flitting over the roofs
      for (let i = 0; i < NIGHT_N.bat; i++) {
        const a = t * (0.5 + 0.2 * hash01(i, 7, NSALT)) + i * 1.9;
        put(I.bat + i, Math.cos(a) * (9 + 4 * i), 7 + Math.sin(a * 2.3 + i) * 1.5, Math.sin(a * 1.3) * 11 - 3, k * 0.85, 0.5 + 0.5 * Math.sin(t * 14 + i));
      }
      void cat;
    },
    restore() {
      if (sun && sunC) { sun.color.copy(sunC); sun.intensity = sunI; }
      if (fill && fillC) { fill.color.copy(fillC); fill.intensity = fillI; }
      if (bg && bg0) bg.copy(bg0);
    },
  };
}
export { ss as nightSs };
