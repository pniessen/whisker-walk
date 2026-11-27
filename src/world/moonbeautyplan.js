// =============================================================================
// THE MOON: THE BEAUTY PASS, ROUND 1 (the plan). Where the small craters, the ejecta rays, the pale and dark patches, the pebble fields and the rim
// chunks stand, as pure data (no THREE, no canvas, no clock, no Math.random: a seeded stream per list, so the same Moon every walk). The painter
// (world/moonbeauty.js) draws them into the ground's one texture; moonparts.js stands the pebbles and chunks as more instances of the two rock meshes.
// Nothing here is a gameplay place: every list keeps clear of the colliders, perches, finds, pebbles, mice, story points, the boulders, the rover's track,
// the hop board's lane and the places the plan keeps clear (ROCK_KEEP_OUT, at half size), and nothing moves the ground (moonBaseY is untouched).
// =============================================================================

import { mulberry32 } from '../rng.js';
import * as P from './moonplan.js';

// The way the sun lies from any point: the game's fixed sun (render/rig.js SUN_POSITION, -36, 15, -24) is north-west and low (about 19 degrees up).
export const SUN = Object.freeze({ x: -36 / Math.hypot(36, 24), z: -24 / Math.hypot(36, 24) });

const REACH = 62; // decals reach this far from the middle (the ground is drawn to 65)

// The sun-lit regolith's colours, as sRGB bytes: the base dust, and the patches' pale and dark ends.
export const PAL = Object.freeze({ base: [124, 123, 121], pale: [196, 192, 184], dark: [58, 57, 58], ray: [214, 210, 200], floor: [50, 50, 54] });

const hyp = Math.hypot;
const L = P.JUMP_LANE;
// the mice the scatter keeps clear of: the original three, by name (a later mouse never reshuffles the beauty scatter; test/moonx0.test.js)
export const SCATTER_MICE = Object.freeze(['gm-moon-1', 'gm-moon-2', 'gm-moon-3']);
const props = [...P.MOON_COLLIDERS, ...P.MOON_PERCHES, ...P.MOON_POIS, ...P.PEBBLES, ...P.MOON_MICE.filter((m) => SCATTER_MICE.includes(m.id)), ...P.JOB_POINTS, ...P.POLES, P.FLAG, P.PIT_ROCK, P.CHEESE, P.ECHO];

// Is a disc of radius r at (x, z) clear of everything a child plays with? (`gap` is the margin over each prop's own radius; `ks` the share of the plan's keep-out
// circles kept clear: half for a flat decal, all of it for a standing rock; `trackGap` the room kept round the rover's track: the mini-rovers' line passes it.)
export function clear(x, z, r, gap = 0.7, ks = 0.5, trackGap = 2.2) {
  if (Math.abs(x) > REACH - r || Math.abs(z) > REACH - r) return false;
  if (hyp(x - P.DOME.x, z - P.DOME.z) < P.DOME.r + 1 + r) return false;
  for (const [kx, kz, kr] of P.ROCK_KEEP_OUT) if (hyp(x - kx, z - kz) < kr * ks + r) return false;
  for (const p of props) if (hyp(x - p.x, z - p.z) < (p.r ?? 0.4) + r + gap) return false;
  for (const b of P.BOULDERS) if (hyp(x - b.x, z - b.z) < b.r + r + gap) return false;
  if (P.trackDistance(x, z) < trackGap + r) return false;
  if (x > L.x0 - 4 - r && x < L.x0 + L.len + 8 + r && Math.abs(z - L.z) < L.half + 2 + r) return false; // the hop board's lane
  return true;
}

// Craters of several sizes (a few big, many small), none on another, none on a plan crater's bowl or its rim. `fresh` ones are brighter, with an
// ejecta blanket. 240 on a full device, 120 on the lower rungs.
export function smallCraters(lite = false) {
  const rng = mulberry32(0x5ca7e12);
  const want = lite ? 120 : 240;
  const out = [];
  for (let tries = 0; out.length < want && tries < 9000; tries++) {
    const r = 0.7 + 4.2 * rng() ** 3;
    const x = (rng() * 2 - 1) * REACH;
    const z = (rng() * 2 - 1) * REACH;
    const fresh = rng() < 0.16;
    if (!clear(x, z, r * 1.4)) continue;
    if (P.CRATERS.some((k) => hyp(x - k.x, z - k.z) < k.r * 1.9 + r)) continue;
    if (out.some((o) => hyp(x - o.x, z - o.z) < (o.r + r) * 1.15)) continue;
    out.push({ x, z, r, fresh });
  }
  return out;
}

// (beauty round 4) Craterlets: the small pits (0.25 to 0.75 m) that pepper real regolith between the larger craters. Painted only; they may lie on a bowl's wall (that is
// where they read best) but keep clear of every prop, of the small craters and of each other. 520 on a full device, 200 on the lower rungs.
export function craterlets(lite = false) {
  const rng = mulberry32(0x1e75a);
  const want = lite ? 200 : 520;
  const big = smallCraters(lite);
  const out = [];
  for (let tries = 0; out.length < want && tries < 12000; tries++) {
    const r = 0.25 + 0.5 * rng() ** 2;
    const x = (rng() * 2 - 1) * REACH;
    const z = (rng() * 2 - 1) * REACH;
    const fresh = rng() < 0.12;
    if (!clear(x, z, r, 0.25)) continue;
    if (big.some((o) => hyp(x - o.x, z - o.z) < (o.r + r) * 1.05)) continue;
    if (out.some((o) => hyp(x - o.x, z - o.z) < (o.r + r) * 1.2)) continue;
    out.push({ x, z, r, fresh });
  }
  return out;
}

// (beauty round 4) The loose blocks and specks along each plan bowl's rim and upper wall, painted: { x, z, s (m), pale (lit side) | dark }, denser at the lip and
// falling off down the wall and out onto the apron. Seeded; every bowl gets its own count by size.
export function rimDebris(lite = false) {
  const rng = mulberry32(0x9d3b1);
  const out = [];
  for (const c of P.CRATERS) {
    const n = Math.round((lite ? 26 : 70) * c.r / 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const f = 0.86 + 0.42 * rng() ** 1.4; // 0.86..1.28 of the bowl's radius: wall, lip, apron
      const x = c.x + Math.cos(a) * c.r * f;
      const z = c.z + Math.sin(a) * c.r * f;
      const s = 0.08 + 0.3 * rng() ** 3;
      if (!clear(x, z, s, 0.2, 0.3)) continue;
      out.push({ x, z, s, lit: rng() < 0.6 });
    }
  }
  return out;
}

// (beauty round 5) Where the buildings meet the dust: soft dark contact smudges (a little longer away from the sun) at the feet of the dome, tunnel, rocket stand, gantry, tanks,
// desk, dish, ridge pillars, gate stones and lander legs, and pale blown-dust aprons round the pad and the lander. Painted only: { x, z, r, a (alpha), pale }.
export function footprints() {
  const out = [];
  const put = (x, z, r, a, pale = false) => out.push({ x, z, r, a, pale });
  put(P.DOME.x, P.DOME.z, P.DOME.wall + 2.6, 0.5);
  put((P.AIRLOCK.x0 + P.AIRLOCK.x1) / 2, P.AIRLOCK.z, 3.6, 0.45);
  put(P.PAD.x, P.PAD.z, P.PAD.r + 4.5, 0.4, true);
  put(P.ROCKET.x, P.ROCKET.z, 3.4, 0.55);
  put(P.GANTRY.x, P.GANTRY.z, 2.6, 0.5);
  for (const t of P.TANKS) put(t.x, t.z, t.r + 1.5, 0.5);
  put(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z, 2.1, 0.45);
  put(P.OLD_DISH.x, P.OLD_DISH.z, 2.6, 0.45);
  put(P.LANDER.x, P.LANDER.z, 6.5, 0.4, true);
  put(P.LANDER.x, P.LANDER.z, 2.2, 0.45);
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; put(P.LANDER.x + Math.cos(a) * 3.05, P.LANDER.z + Math.sin(a) * 3.05, 1.0, 0.5); }
  for (const s of P.SKIP) put(s.x, s.z, s.r + 1.6, 0.5);
  for (const s of P.GATE_STONES) put(s.x, s.z, 1.2, 0.45);
  put(P.SHED.x, P.SHED.z, 4.2, 0.4);
  return out;
}

// Rays thrown out of the three biggest bowls and of a few fresh craters, and the lander's scour streaks and the pad's scorch (pale and dark):
// { x, z, a (the heading), from, len, w, k (strength 0..1), dark }.
export function rays(lite = false) {
  const rng = mulberry32(0x7a95);
  const out = [];
  const burst = (x, z, n, from, lo, hi, w, k, dark = false) => {
    for (let i = 0; i < n; i++) out.push({ x, z, a: ((i + rng() * 0.8) / n) * Math.PI * 2, from, len: lo + (hi - lo) * rng(), w: w * (0.5 + rng()), k: k * (0.55 + 0.45 * rng()), dark });
  };
  const G = P.CRATERS.find((c) => c.id === 'great');
  const E = P.CRATERS.find((c) => c.id === 'echo');
  const T = P.CRATERS.find((c) => c.id === 'pit');
  burst(G.x, G.z, lite ? 14 : 22, G.r * 1.05, 16, 46, 1.5, 1);
  burst(E.x, E.z, lite ? 10 : 16, E.r * 1.05, 12, 30, 1.1, 0.9);
  burst(T.x, T.z, lite ? 8 : 12, T.r * 1.05, 9, 20, 0.8, 0.8);
  for (const c of smallCraters(lite).filter((q) => q.fresh && q.r > 1.8).slice(0, 5)) burst(c.x, c.z, 9, c.r * 1.05, 4, 10 + c.r * 3, 0.45, 0.8);
  burst(P.LANDER.x, P.LANDER.z, 26, 3.4, 4, 13, 0.55, 0.55); // the engine's scour: pale streaks fanned out from under the lander
  burst(P.PAD.x, P.PAD.z, 18, P.PAD.r + 0.5, 3, 7, 1.1, 0.7, true); // the pad's scorch
  return out;
}

// Large soft albedo patches: pale (k > 0) and dark (k < 0): { x, z, r, k }.
export function patches(lite = false) {
  const rng = mulberry32(0x9a7c4);
  return Array.from({ length: lite ? 28 : 46 }, () => ({ x: (rng() * 2 - 1) * REACH, z: (rng() * 2 - 1) * REACH, r: 5 + 12 * rng(), k: (rng() < 0.5 ? -1 : 1) * (0.35 + 0.65 * rng()) }));
}

// Pebble fields: 16 round patches of small angular pebbles, a thin sprinkle between them and a ring of them on each plan crater's rim. { x, z, s, yaw, tilt }. None on the
// lower rungs (their share is painted into the ground's texture instead), where the existing small rocks are also dropped.
export function pebbles(lite = false) {
  if (lite) return [];
  const rng = mulberry32(0x3e8b1e);
  const out = [];
  const put = (x, z, s) => { if (clear(x, z, s, 0.3, 1)) out.push({ x, z, s, yaw: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.9 }); };
  for (let f = 0; f < 16; f++) {
    const cx = (rng() * 2 - 1) * 56;
    const cz = (rng() * 2 - 1) * 56;
    const fr = 1.8 + 2.6 * rng();
    for (let i = 0; i < 20; i++) {
      const a = rng() * Math.PI * 2;
      const d = fr * Math.sqrt(rng());
      put(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.05 + 0.1 * rng() ** 2);
    }
  }
  for (let i = 0; i < 60; i++) put((rng() * 2 - 1) * 56, (rng() * 2 - 1) * 56, 0.05 + 0.08 * rng());
  for (const k of P.CRATERS) {
    const n = Math.round(k.r * 2.4);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const u = 0.92 + 0.5 * rng();
      put(k.x + Math.cos(a) * k.r * u, k.z + Math.sin(a) * k.r * u, 0.06 + 0.12 * rng() ** 2);
    }
  }
  return out;
}

// Chunks of broken rock on the rims and walls of the plan's bowls (the same stone as the medium rocks, a caster each): { x, z, s, yaw, tilt }. Never on a bowl's floor.
export function rimChunks(lite = false) {
  const rng = mulberry32(0x7c13);
  const out = [];
  for (const k of P.CRATERS) {
    const n = Math.round(k.r * (lite ? 0.6 : 1.0));
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const u = 0.74 + 0.7 * rng();
      const s = 0.16 + 0.3 * rng() * (k.r > 7 ? 1.3 : 1);
      const x = k.x + Math.cos(a) * k.r * u;
      const z = k.z + Math.sin(a) * k.r * u;
      // (Ridge clarity) never on ANOTHER bowl's floor either: a chunk of one rim can fall inside a neighbouring bowl (the keep-outs used to hide it)
      const nearest = Math.min(...P.CRATERS.map((q) => Math.hypot(x - q.x, z - q.z) / q.r));
      if (nearest >= 0.55 && clear(x, z, s, 0.4, 1)) out.push({ x, z, s, yaw: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.8 });
    }
  }
  return out;
}
