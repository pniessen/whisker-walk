// =============================================================================
// THE CRYSTAL CAVE: ITS FRIENDLY LIFE, THE PLANS AND POSES (layer 4). Cave fish in the Blue Pool, a bat colony (a few hang from the dome, a few make a slow loop), fireflies
// round the mushroom clumps, moths round the great crystals, one cave salamander on the pool's rim, crystal beetles and a small cave crab in the shallows. Pure data and pure
// functions (no THREE, no Math.random, no clock): every pose is a function of the time handed in and of a hashed phase, and none of them looks at the cat. All of it is
// decoration that moves: none is a rule, a find or a danger; none comes at her, blocks her or needs her. Drawing is cavelifeparts.js, the walk's life cavelifelive.js.
// docs/superpowers/plans/2026-11-26-crystal-cave-enrichment.md layer 4. North is -z; a pose's yaw turns +z toward (sin yaw, cos yaw).
// =============================================================================

import * as P from './crystalplan.js';
import * as W from './crystalwingplan.js';
import { planDecor } from './crystaldecor.js';

export const SALTS = Object.freeze({ fish: 0x66697368, hang: 0x68616e67, fly: 0x666c7969, fire: 0x66697265, moth: 0x6d6f7468, sal: 0x73616c61, beetle: 0x62656574, crab: 0x63726162 });
export function hash01(n, salt) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const TAU = Math.PI * 2;
const fr = (v) => v - Math.floor(v);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const yawOf = (dx, dz) => Math.atan2(dx, dz);

// 'high' | 'low' | 'lite' from the walk's quality tier (as the Reef and the cave's critters read it)
export function lifeRung(tier) {
  if (tier && tier.shadows === false) return 'lite';
  if (tier && (tier.name === 'low' || (tier.rung ?? 0) >= 3)) return 'low';
  return 'high';
}
// How many of each a rung keeps. Hanging bats go colony by colony round the three colonies, so every rung has a bat over each chamber it draws.
export const LIFE_COUNT = Object.freeze({
  high: Object.freeze({ fish: 9, hang: 9, fly: 3, fire: 36, moth: 4, sal: 1, beetle: 5, crab: 1 }),
  low: Object.freeze({ fish: 6, hang: 6, fly: 2, fire: 18, moth: 3, sal: 1, beetle: 3, crab: 1 }),
  lite: Object.freeze({ fish: 5, hang: 3, fly: 1, fire: 12, moth: 2, sal: 1, beetle: 3, crab: 1 }),
});
// The journal id of each kind and how near she must be (and facing it) to spot one.
export const KIND_RANGE = Object.freeze({ clfish: 6, clbat: 9, clfirefly: 6, clmoth: 6, clsalamander: 6, clbeetle: 4, clcrab: 6 });
export const KIND_IDS = Object.freeze(Object.keys(KIND_RANGE));

const floor = P.crystalY;

// ---- the cave fish: a school looping slowly in the pool's south half (clear of the stepping crystals, the mouse is only a pickup they glide over) ---------------------------------------
export const FISH_HOME = Object.freeze({ x: W.POOL.x, z: W.POOL.z + 1, rx: 1.3, rz: 1.0, orbit: 0.9 });
export function fishPose(i, t, out = {}) {
  const ph = hash01(i, SALTS.fish) * TAU; const sp = 0.55 + 0.35 * hash01(i + 40, SALTS.fish);
  const at = (u) => {
    const sa = 0.11 * u + 0.7; // the school's own slow loop
    return [FISH_HOME.x + Math.cos(sa) * FISH_HOME.rx + Math.cos(sp * u + ph) * FISH_HOME.orbit * (0.55 + 0.45 * hash01(i + 9, SALTS.fish)),
      FISH_HOME.z + Math.sin(sa) * FISH_HOME.rz + Math.sin(sp * u + ph) * FISH_HOME.orbit * 0.8];
  };
  const [x, z] = at(t); const [x2, z2] = at(t + 0.12);
  out.x = x; out.z = z; out.yaw = yawOf(x2 - x, z2 - z);
  out.y = floor(x, z) + 0.2 + 0.07 * Math.sin(t * 0.8 + ph);
  out.tail = Math.sin(t * 7 + ph * 3) * 0.5; // the tail's sway (radians)
  out.size = 0.9 + 0.3 * hash01(i + 70, SALTS.fish);
  out.tone = i % 3;
  return out;
}

// ---- the bat colony --------------------------------------------------------------------------------------------------------------------
// Three colonies hang from the dome out by the walls, one behind each of the Rose hall, the Blue Pool and the Gold Gallery: the stalactite root nearest the chamber's bearing at 44 m.
export const COLONY_COUNT = 3;
let _colonies = null;
export function colonies() {
  if (_colonies) return _colonies;
  const stal = P.scatterStalactites();
  const out = [W.POOL, { x: -18, z: 4 }, { x: -6, z: -22 }].map((c) => {
    const a = Math.atan2(c.z, c.x); const tx = Math.cos(a) * 44; const tz = Math.sin(a) * 44;
    let best = stal[0];
    for (const s of stal) if (Math.hypot(s.x - tx, s.z - tz) < Math.hypot(best.x - tx, best.z - tz)) best = s;
    return Object.freeze({ x: best.x, z: best.z, y: best.y });
  });
  return (_colonies = Object.freeze(out));
}
// A hanging bat i (the colony is i % 3): feet on the dome, head down, wings wrapped; now and then a soft twitch of the wings.
export function hangPose(i, t, out = {}) {
  const c = colonies()[i % COLONY_COUNT]; const slot = Math.floor(i / COLONY_COUNT);
  const a = slot * 2.4 + hash01(i, SALTS.hang) * 0.8; const r = 0.28 + 0.25 * hash01(i + 5, SALTS.hang);
  const ph = hash01(i + 11, SALTS.hang);
  out.x = c.x + Math.cos(a) * r; out.z = c.z + Math.sin(a) * r; out.y = c.y - 0.05;
  out.yaw = hash01(i + 21, SALTS.hang) * TAU;
  const u = fr(t / (6 + 5 * ph) + ph) / 0.1; // a twitch lasts a tenth of its period
  out.twitch = u < 1 ? Math.sin(u * Math.PI) * (0.5 + 0.5 * Math.sin(t * 24 + ph * 50)) : 0; // 0..1: how far the wings open
  out.sway = 0.05 * Math.sin(t * 0.6 + ph * 9); // a gentle swing (radians)
  return out;
}
// A flying bat i: a slow loop high over the floor, about a minute round (the three a third of the loop apart).
export const FLY = Object.freeze({ cx: 0, cz: -2, ax: 24, az: 18, period: 60, high: 6.5 });
export function flyPose(i, t, out = {}) {
  const dir = i % 2 ? -1 : 1; const k = 0.85 + 0.15 * hash01(i, SALTS.fly);
  const at = (u) => { const a = TAU * (u / FLY.period + i / 3) * dir; return [FLY.cx + Math.cos(a) * FLY.ax * k, FLY.cz + Math.sin(a) * FLY.az * k]; };
  const [x, z] = at(t); const [x2, z2] = at(t + 0.2);
  out.x = x; out.z = z; out.yaw = yawOf(x2 - x, z2 - z);
  out.y = floor(x, z) + FLY.high + 0.9 * Math.sin(TAU * (t / FLY.period) * 3 + i * 2);
  out.flap = 0.7 * Math.sin(t * 11 + i * 1.7); // the wings' beat (radians)
  out.bank = -0.22 * dir;
  return out;
}

// ---- the fireflies: a soft cloud over each of the first three mushroom clumps (the rose, blue and gold ones) -----------------------------------------------------------
export const CLOUDS = 3;
let _clouds = null;
export function cloudCentres() {
  if (_clouds) return _clouds;
  const m = planDecor('high').mush;
  return (_clouds = Object.freeze([0, 1, 2].map((i) => Object.freeze({ x: m[i].x, z: m[i].z, hue: m[i].hue }))));
}
export function firePos(i, t, out = {}) {
  const c = cloudCentres()[i % CLOUDS]; const j = Math.floor(i / CLOUDS);
  const h = (n) => hash01(j * 7 + (i % CLOUDS) + n, SALTS.fire);
  const a = h(0) * TAU + t * (0.2 + 0.3 * h(1)) * (h(2) < 0.5 ? 1 : -1); const r = 0.3 + 1.1 * h(3);
  out.x = c.x + Math.cos(a) * r + Math.sin(t * 0.4 + j) * 0.2;
  out.z = c.z + Math.sin(a) * r + Math.cos(t * 0.35 + j * 1.3) * 0.2;
  out.y = floor(c.x, c.z) + 0.45 + 1.4 * h(4) + Math.sin(t * 0.6 + j * 1.7) * 0.2;
  out.glow = Math.max(0, Math.sin(t * (0.8 + h(5)) + j * 2.3)) ** 2 * 0.9 + 0.1;
  return out;
}

// ---- the moths: one round each great crystal (rose, blue, gold, Heart), fluttering ---------------------------------------------------------------------------------------
export const MOTH_AT = Object.freeze([P.ROSE_GREAT, W.BLUE_GREAT, W.GOLD_GREAT, W.HEART_GREAT].map((g) => Object.freeze({ x: g.x, z: g.z, hue: g.hue, r: g.s * 0.5 + 1.3 })));
export function mothPose(i, t, out = {}) {
  const g = MOTH_AT[i % MOTH_AT.length]; const ph = hash01(i, SALTS.moth) * TAU; const dir = i % 2 ? -1 : 1;
  const at = (u) => {
    const a = ph + dir * u * (0.45 + 0.15 * hash01(i + 3, SALTS.moth));
    const r = g.r + 0.3 * Math.sin(u * 0.7 + ph);
    return [g.x + Math.cos(a) * r + 0.18 * Math.sin(u * 2.3 + ph * 4), g.z + Math.sin(a) * r + 0.18 * Math.cos(u * 1.9 + ph * 3)];
  };
  const [x, z] = at(t); const [x2, z2] = at(t + 0.15);
  out.x = x; out.z = z; out.yaw = yawOf(x2 - x, z2 - z);
  out.y = floor(g.x, g.z) + 1.5 + 0.5 * (i % 2) + 0.35 * Math.sin(t * 1.6 + ph) + 0.12 * Math.sin(t * 6 + ph);
  out.flap = 0.85 * Math.sin(t * 26 + ph * 5);
  out.hue = g.hue;
  return out;
}

// ---- the cave salamander: strolls slowly on the pool's south-west rim, then pauses (never near the sky stone, the find ring or the great crystal) ---------------------------------
export const SAL = Object.freeze({ r: W.POOL.r + 0.5, a0: 1.4, a1: 2.5, speed: 0.17, walk: 11, rest: 9 }); // metres a second; seconds walking, seconds still
export function salamanderPose(t, out = {}) {
  const cyc = SAL.walk + SAL.rest; const k = Math.floor(t / cyc); const w = t - k * cyc;
  const dist = 0.17 * (k * SAL.walk + Math.min(w, SAL.walk)); // metres walked along the rim
  const len = (SAL.a1 - SAL.a0) * SAL.r;
  const m = dist % (2 * len); const fwd = m < len; const along = fwd ? m : 2 * len - m;
  const a = SAL.a0 + along / SAL.r; const walking = w < SAL.walk;
  out.x = W.POOL.x + Math.cos(a) * SAL.r; out.z = W.POOL.z + Math.sin(a) * SAL.r; out.y = floor(out.x, out.z) + 0.03;
  const sgn = fwd ? 1 : -1; // along the rim: d(angle) is the direction of travel
  out.yaw = yawOf(-Math.sin(a) * sgn, Math.cos(a) * sgn);
  out.walk = walking ? Math.min(1, w / 0.8, (SAL.walk - w) / 0.8 + 0.001) : 0; // 0 still, 1 striding (eased in and out)
  out.phase = dist * 9; // the body's wave runs with the distance walked
  out.gill = Math.sin(t * 2.2) * 0.25; // the gills' soft wave, always
  return out;
}

// ---- the crystal beetles: a few tiny jewel-shelled beetles crawling short loops by the first crystal gardens -----------------------------------------------------------------------
export const BEETLE_HUES = Object.freeze([0xff5fa0, 0x4fb4ff, 0xffb83c, 0xc77bff, 0x4fe0b0]);
let _beetleHomes = null;
export function beetleHomes() {
  if (_beetleHomes) return _beetleHomes;
  const g = planDecor('high').garden;
  return (_beetleHomes = Object.freeze([0, 1, 2, 3, 4].map((i) => Object.freeze({ x: g[i % g.length].x, z: g[i % g.length].z, hue: g[i % g.length].hue }))));
}
export function beetlePose(i, t, out = {}) {
  const h = beetleHomes()[i % beetleHomes().length]; const ph = hash01(i, SALTS.beetle) * TAU; const dir = i % 2 ? -1 : 1;
  const rx = 0.45 + 0.25 * hash01(i + 4, SALTS.beetle); const rz = 0.35 + 0.2 * hash01(i + 8, SALTS.beetle); const w = 0.28;
  const a = ph + dir * w * t;
  out.x = h.x + Math.cos(a) * rx; out.z = h.z + Math.sin(a) * rz; out.y = floor(out.x, out.z) + 0.04;
  out.yaw = yawOf(-Math.sin(a) * rx * dir, Math.cos(a) * rz * dir);
  out.leg = Math.sin(t * 9 + ph); // the legs' scurry
  out.colour = BEETLE_HUES[i % BEETLE_HUES.length];
  return out;
}

// ---- the cave crab: one in the pool's south-west shallows, scuttling sideways a little way and back, then resting -----------------------------------------------------------------------
export const CRAB = Object.freeze({ x: 11.7, z: -0.6, span: 0.9, period: 15 });
export function crabPose(t, out = {}) {
  const c = fr(t / CRAB.period);
  const u = c < 0.25 ? 0 : c < 0.4 ? smooth((c - 0.25) / 0.15) : c < 0.75 ? 1 : smooth(1 - (c - 0.75) / 0.15);
  const moving = (c >= 0.25 && c < 0.4) || c >= 0.75 ? 1 : 0;
  // its sideways axis runs along the rim (perpendicular to the way to the pool's middle)
  const ax = -(CRAB.z - W.POOL.z); const az = CRAB.x - W.POOL.x; const l = Math.hypot(ax, az);
  out.x = CRAB.x + (ax / l) * CRAB.span * (u - 0.5); out.z = CRAB.z + (az / l) * CRAB.span * (u - 0.5);
  out.y = floor(out.x, out.z) + 0.06;
  out.yaw = yawOf(W.POOL.x - CRAB.x, W.POOL.z - CRAB.z) + Math.PI; // facing outward from the water, so its face is toward her side of the pool
  out.leg = moving * Math.sin(t * 14); out.claw = Math.sin(t * 2.4) * (moving ? 0.25 : 0.5);
  return out;
}
