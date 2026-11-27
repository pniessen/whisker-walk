// =============================================================================
// THE MOON: ITS FRIENDLY ROBOTS AND LIGHT (the plan and the poses). The Moon has no animals and keeps none: its life is a few small robots and some light, all of
// it decoration that moves and none of it a rule. Pure data and pure functions (no THREE, no canvas, no clock, no Math.random): every pose is a function of a time the
// live file adds up from the walk's own dt and of a phase hashed from the item's number with a salt of its own, so the same walk is the same every time. Nothing
// here ever chases her, blocks her or comes near enough to matter: the drones fly 2 to 4 m up over open dust, the cleaner bot keeps to its short lane, the convoy
// drives its own line two metres off the rover's lane and waits while her rover is near, the moths keep to the lamps, and the pixel visitor hops away from her.
//   * SURVEY DRONES: small round hoverers with a spinning ring and a blinking eye, slow loops over the base and Star Hill, a soft glow patch on the dust below;
//   * the DUSTY CLEANER BOT: a low wheeled bot on a short lane near the dome, sweeping, pausing to wave its brush with a little dust puff;
//   * the ROVER CONVOY: three mini-rovers in a line on their own line beside the track (stopping while her rover is within 4 m);
//   * LUNAR MOTHS OF LIGHT: soft glowing sprites that flutter round the lamps and beacons at the base;
//   * the PIXEL VISITOR: a tiny blocky orange creature hopping in low-gravity bounds round a quiet corner, a different one each walk.
// Everything is placed clear of the colliders, finds, pebbles, mice, story points, the hop board's lane and the rover's course (moonbeautyplan.js `clear`).
// =============================================================================

import { TRACK, MOON_BOUNDS } from './moonplan.js';

export const TAU = Math.PI * 2;
const hyp = Math.hypot;
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// A hash of (i, salt) in [0, 1): a seeded stream per salt, with no state to keep (so a pose can be asked for at any time, in any order).
export function hash01(i, salt) {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// New salts, none shared with any other Moon or place stream.
export const SALTS = Object.freeze({ drone: 0x4d4c0d01, cleaner: 0x4d4c0c02, convoy: 0x4d4c0e03, moth: 0x4d4c0f04, pixel: 0x4d4c0a05, spot: 0x4d4c0b06, blink: 0x4d4c0907, moonling: 0x4d4c0808 });

// 'high' | 'low' | 'lite' from the walk's quality tier (as the Reef's sea life reads it).
export function lifeRung(tier) {
  if (tier && tier.shadows === false) return 'lite';
  if (tier && (tier.name === 'low' || (tier.rung ?? 0) >= 3)) return 'low';
  return 'high';
}
// What each rung keeps (the pixel visitor and the cleaner bot are one each everywhere).
export const LIFE_COUNT = Object.freeze({
  high: Object.freeze({ drones: 4, convoy: 3, moths: 6 }),
  low: Object.freeze({ drones: 3, convoy: 2, moths: 4 }),
  lite: Object.freeze({ drones: 2, convoy: 2, moths: 4 }),
});

// ---- the survey drones --------------------------------------------------------------------------------------------------------------
// A loop is an ellipse (centre, semi-axes a and b, turned by rot) over dust that is open at the drone's height: two over the base, two round Star Hill (the same
// circle, one each way). period: seconds a lap; h0: metres over the ground (2.2 to 3.6, bobbing 0.35); dir: 1 or -1.
const DR = (cx, cz, a, b, rot, period, h0, dir, tag) => Object.freeze({ cx, cz, a, b, rot, period, h0, dir, tag, bob: 0, ring: 0, blinkP: 0, phase: 0 });
const DRONE_LOOPS = [DR(-14, 29, 6, 6, 0, 52, 2.6, 1, 'base'), DR(0, 12, 10, 8, 0, 74, 3.2, -1, 'base'), DR(-40, -33, 8, 8, 0, 60, 3.0, 1, 'hill'), DR(-40, -33, 8, 8, 0, 66, 2.3, -1, 'hill')];
export const DRONES = Object.freeze(DRONE_LOOPS.map((d, i) => Object.freeze({
  ...d, id: i,
  phase: hash01(i, SALTS.drone) * TAU, bob: hash01(i + 9, SALTS.drone) * TAU, ring: 3.2 + hash01(i + 17, SALTS.drone) * 1.6,
  blinkP: 1.7 + hash01(i + 25, SALTS.drone) * 1.1,
})));

// dronePose(d, t, out) -> { x, z, h, yaw, ring, eye (0 to 1: a quick blink every blinkP seconds), glow (0.7 to 1) }; h is metres over the ground under it.
export function dronePose(d, t, out = {}) {
  const ang = d.phase + (d.dir * TAU * t) / d.period;
  const c = Math.cos(ang); const s = Math.sin(ang);
  const u = c * d.a; const v = s * d.b;
  const cr = Math.cos(d.rot); const sr = Math.sin(d.rot);
  out.x = d.cx + u * cr - v * sr;
  out.z = d.cz + u * sr + v * cr;
  // the way it is going: the loop's tangent (turned by rot), the model's front is +z
  const tu = -s * d.a * d.dir; const tv = c * d.b * d.dir;
  const tx = tu * cr - tv * sr; const tz = tu * sr + tv * cr;
  out.yaw = Math.atan2(tx, tz);
  out.h = d.h0 + 0.35 * Math.sin(t * 0.9 + d.bob);
  out.ring = t * d.ring + d.phase;
  const k = ((t + d.phase) % d.blinkP) / d.blinkP;
  out.eye = k < 0.1 ? 1 : 0.18;
  out.glow = 0.85 + 0.15 * Math.sin(t * 1.3 + d.bob);
  return out;
}

// ---- the dusty cleaner bot ---------------------------------------------------------------------------------------------------------
// A lane two ends and 6.5 m long, east of the airlock's way; it trundles one way, waves its brush while a puff of dust lifts, trundles back and waves again.
export const CLEANER = Object.freeze({ ax: -13, az: 22.5, bx: -13, bz: 29, speed: 0.55, pause: 4.2, wave: 2.6 });
const cleanerLen = hyp(CLEANER.bx - CLEANER.ax, CLEANER.bz - CLEANER.az);
export const CLEANER_LEG = cleanerLen / CLEANER.speed; // seconds on the lane, one way
export const CLEANER_CYCLE = 2 * (CLEANER_LEG + CLEANER.pause);

// cleanerPose(t, out) -> { x, z, yaw, wheel (turns of the wheels), brush (-1 to 1, the brush's swing), puff (0 to 1 while the puff lifts, else -1), sweep (0 or 1: the brush is down, sweeping) }
export function cleanerPose(t, out = {}) {
  const C = CLEANER;
  const u = ((t % CLEANER_CYCLE) + CLEANER_CYCLE) % CLEANER_CYCLE;
  const dx = (C.bx - C.ax) / cleanerLen; const dz = (C.bz - C.az) / cleanerLen;
  let along; let dir; let waiting = -1;
  if (u < CLEANER_LEG) { along = (u / CLEANER_LEG) * cleanerLen; dir = 1; } else if (u < CLEANER_LEG + C.pause) { along = cleanerLen; dir = 1; waiting = u - CLEANER_LEG; } else if (u < 2 * CLEANER_LEG + C.pause) { along = (1 - (u - CLEANER_LEG - C.pause) / CLEANER_LEG) * cleanerLen; dir = -1; } else { along = 0; dir = -1; waiting = u - 2 * CLEANER_LEG - C.pause; }
  // a turn on the spot while it waits: it faces the other way by the end of the pause
  const turn = waiting < 0 ? 0 : smooth((waiting - (C.pause - 1.2)) / 1.2);
  const face = dir > 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
  out.x = C.ax + dx * along;
  out.z = C.az + dz * along;
  out.yaw = face + Math.PI * turn;
  out.wheel = along / 0.18;
  out.sweep = waiting < 0 ? 1 : 0;
  out.brush = waiting >= 0 && waiting < C.wave ? Math.sin((waiting / C.wave) * TAU * 3) * (1 - 0.3 * (waiting / C.wave)) : waiting < 0 ? Math.sin(t * 6) * 0.35 : 0;
  out.puff = waiting >= 0 && waiting < C.wave ? waiting / C.wave : -1;
  return out;
}

// ---- the rover convoy --------------------------------------------------------------------------------------------------------------------
// Three mini-rovers drive a slow line on their own line two metres to one side of the rover's track (so never on her lane): the track's loop pushed out by 2 m at
// each corner, the stretch from Skip Ridge's side round the east and the north-east to the rock field. They go the length of it, turn on the spot, and come back.
export const CONVOY_OFFSET = 2;
const side = (p, q) => { const dx = q.x - p.x; const dz = q.z - p.z; const l = hyp(dx, dz); return [-dz / l, dx / l]; };
export const TRACK_LINE = Object.freeze(TRACK.map((b, i, a) => {
  const p = a[(i + a.length - 1) % a.length]; const q = a[(i + 1) % a.length];
  const n1 = side(p, b); const n2 = side(b, q);
  let mx = n1[0] + n2[0]; let mz = n1[1] + n2[1]; const ml = hyp(mx, mz); mx /= ml; mz /= ml;
  const k = CONVOY_OFFSET / Math.max(0.5, mx * n1[0] + mz * n1[1]);
  return Object.freeze({ x: Math.round((b.x + mx * k) * 10) / 10, z: Math.round((b.z + mz * k) * 10) / 10 });
}));
// the stretch that is open on its whole length: the loop's corners 7, 8, 0, 1, 2, 3, 4, 5 (the corners 6 and 7's way holds a find and a story point)
export const CONVOY_PATH = Object.freeze([7, 8, 0, 1, 2, 3, 4, 5].map((i) => TRACK_LINE[i]));
const CUM = [0];
for (let i = 1; i < CONVOY_PATH.length; i++) CUM.push(CUM[i - 1] + hyp(CONVOY_PATH[i].x - CONVOY_PATH[i - 1].x, CONVOY_PATH[i].z - CONVOY_PATH[i - 1].z));
export const CONVOY_LENGTH = CUM[CUM.length - 1];
export const CONVOY = Object.freeze({ speed: 1.5, gap: 2.6, turn: 3.2, stopNear: 4, count: 3 }); // m/s, m between mini-rovers, m of road a turn on the spot takes, m

// The point on the path `s` metres along it (clamped), and its heading (the way it goes, forward).
function pathAt(s, out) {
  const q = Math.min(CONVOY_LENGTH, Math.max(0, s));
  let i = 1;
  while (i < CUM.length - 1 && CUM[i] < q) i++;
  const a = CONVOY_PATH[i - 1]; const b = CONVOY_PATH[i];
  const f = (q - CUM[i - 1]) / (CUM[i] - CUM[i - 1]);
  out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f;
  out.dx = (b.x - a.x) / (CUM[i] - CUM[i - 1]); out.dz = (b.z - a.z) / (CUM[i] - CUM[i - 1]);
  return out;
}
const PA = {};
// convoyPose(i, d, out) -> { x, z, yaw, wheel }: mini-rover i when the convoy has driven d metres (d only grows while the convoy is rolling): it goes the length of the
// path, turns round at the end (a turn on the spot, CONVOY.turn metres of d), comes back and turns again. Mini-rover i follows the leader by i * gap.
export function convoyPose(i, d, out = {}) {
  const T = CONVOY.turn;
  const cycle = 2 * (CONVOY_LENGTH + T);
  const u = (((d - i * CONVOY.gap) % cycle) + cycle) % cycle;
  let s; let sign; let turn = 0;
  if (u < CONVOY_LENGTH) { s = u; sign = 1; } else if (u < CONVOY_LENGTH + T) { s = CONVOY_LENGTH; sign = 1; turn = smooth((u - CONVOY_LENGTH) / T); } else if (u < 2 * CONVOY_LENGTH + T) { s = CONVOY_LENGTH - (u - CONVOY_LENGTH - T); sign = -1; } else { s = 0; sign = -1; turn = smooth((u - 2 * CONVOY_LENGTH - T) / T); }
  pathAt(s, PA);
  // the heading: the path's, smoothed over a metre so the corners are rounded
  const ahead = {}; const back = {};
  pathAt(s + 0.9, ahead); pathAt(s - 0.9, back);
  let hx = ahead.x - back.x; let hz = ahead.z - back.z;
  if (hyp(hx, hz) < 1e-6) { hx = PA.dx; hz = PA.dz; }
  const yaw0 = Math.atan2(hx, hz);
  out.x = PA.x; out.z = PA.z;
  out.yaw = yaw0 + (sign > 0 ? 0 : Math.PI) + Math.PI * turn;
  out.wheel = s / 0.2;
  out.turn = turn;
  return out;
}

// ---- the lunar moths of light ----------------------------------------------------------------------------------------------------------
// The lamps and beacons at the base (the decor rows' own places: world/moondecorbase.js): two moths to some, one to others.
export const MOTH_HOMES = Object.freeze([[12.8, 40], [-3, 47], [-23.4, 22], [-23.4, 30], [4.6, 48], [-34, 15]].map(([x, z]) => Object.freeze({ x, z })));
export const MOTHS = Object.freeze(Array.from({ length: 6 }, (_, i) => Object.freeze({
  id: i, home: MOTH_HOMES[i % MOTH_HOMES.length],
  r: 0.55 + hash01(i, SALTS.moth) * 0.55, w: 0.7 + hash01(i + 7, SALTS.moth) * 0.6, phase: hash01(i + 13, SALTS.moth) * TAU, y0: 1.5 + hash01(i + 19, SALTS.moth) * 1.1,
  wob: 2.2 + hash01(i + 29, SALTS.moth) * 1.6, tone: hash01(i + 37, SALTS.moth),
})));
// mothPose(m, t, out) -> { x, z, h (metres over the ground), glow (0.4 to 1: the pulse of its light), tone (0 to 1) }
export function mothPose(m, t, out = {}) {
  const a = m.phase + t * m.w;
  out.x = m.home.x + Math.cos(a) * m.r + 0.12 * Math.sin(t * m.wob * 1.7 + m.phase);
  out.z = m.home.z + Math.sin(a * 1.3) * m.r * 0.8 + 0.12 * Math.cos(t * m.wob + m.phase);
  out.h = m.y0 + 0.28 * Math.sin(t * m.wob + m.phase * 2) + 0.12 * Math.sin(t * 5.1 + m.phase);
  out.glow = 0.7 + 0.3 * Math.sin(t * 2.1 + m.phase * 3);
  out.tone = m.tone;
  return out;
}

// ---- the pixel visitor ----------------------------------------------------------------------------------------------------------------------
// Four quiet corners, each an open disc 4.2 m across clear of everything; the walk's seed and its visit count pick the corner, so she meets it somewhere else on another walk.
export const PIXEL_SPOTS = Object.freeze([[-13, 2], [41, 39], [-30, -42], [-5, -33]].map(([x, z]) => Object.freeze({ x, z })));
export const PIXEL = Object.freeze({ reach: 3.0, hop: 1.7, rest: 1.4, apex: 1.7, look: 12, flee: 3.0, lookCos: 0.8 }); // the hops stay within `reach` m of the spot's middle
// the corner for this walk: from the walk's seed (a co-walk's room agrees) and the visit count (a solo walk's change)
export function pixelSpotIndex(seed = 0, visits = 0) {
  return Math.floor(hash01((((seed >>> 0) + Math.imul(visits | 0, 7919)) >>> 0), SALTS.spot) * PIXEL_SPOTS.length) % PIXEL_SPOTS.length;
}
// where the visitor rests after its k-th hop (a hashed point of the disc round the spot's middle)
export function pixelStop(spot, k, out = {}) {
  const a = hash01(k, SALTS.pixel) * TAU;
  const r = 0.9 + 2.1 * hash01(k + 5003, SALTS.pixel);
  out.x = spot.x + Math.cos(a) * r; out.z = spot.z + Math.sin(a) * r;
  return out;
}
// the point of the disc farthest from `cat` that a hop away may land on (never beyond reach of the spot's middle)
export function pixelFlee(spot, cat, out = {}) {
  let best = -1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    for (const r of [1.6, 2.9]) {
      const x = spot.x + Math.cos(a) * r; const z = spot.z + Math.sin(a) * r;
      const d = hyp(x - cat.x, z - cat.z);
      if (d > best) { best = d; out.x = x; out.z = z; }
    }
  }
  return out;
}
// pixelHop(from, to, p, out) -> { x, z, h, squash }: a hop at progress p (0 to 1): a floaty parabola, a squat as it lands and as it leaves
export function pixelHop(from, to, p, out = {}) {
  const q = Math.min(1, Math.max(0, p));
  out.x = from.x + (to.x - from.x) * q; out.z = from.z + (to.z - from.z) * q; // a straight run along the ground; the height does the floating
  out.h = PIXEL.apex * 4 * q * (1 - q);
  out.squash = 1 - 0.22 * Math.max(0, 1 - Math.min(q, 1 - q) * 9);
  return out;
}
// the sprite's blink: 1 shown, 0 not. It flickers in, stays about 16 s, flickers out, is gone for about 2 s, and again (a different beat for each walk's phase).
export const BLINK = Object.freeze({ cycle: 20, flicker: 0.8, shown: 16.8, step: 0.1 });
export function pixelShown(t, phase = 0) {
  const u = (((t + phase) % BLINK.cycle) + BLINK.cycle) % BLINK.cycle;
  if (u < BLINK.flicker) return Math.floor(u / BLINK.step) % 2 === 0 ? 0 : 1;
  if (u < BLINK.shown) return 1;
  if (u < BLINK.shown + BLINK.flicker) return Math.floor((u - BLINK.shown) / BLINK.step) % 2 === 0 ? 1 : 0;
  return 0;
}
export const PIXEL_PHASE = (seed = 0, visits = 0) => hash01((((seed >>> 0) + Math.imul(visits | 0, 31)) >>> 0), SALTS.blink) * BLINK.cycle;

// ---- the moonling ------------------------------------------------------------------------------------------------------------------------
// A small round soft-teal alien, shy and curious: it peeks from beside a rock in one of the same four quiet corners (never the pixel visitor's, the walk's seed picks).
// The rock stands at the corner's middle; the moonling slides out from behind it to the side, waves and hops when she sits still near, drifts back when she runs at it.
export const MOONLING = Object.freeze({ near: 14, sit: 7, runSpeed: 3.2, runReach: 6, sitFor: 1.2, wave: 3, hop: 1.3, cooldown: 25, rock: 0.75 });
export function moonlingSpotIndex(seed = 0, visits = 0, pixelIdx = 0) {
  const k = 1 + Math.floor(hash01((((seed >>> 0) + Math.imul(visits | 0, 4099)) >>> 0), SALTS.moonling) * (PIXEL_SPOTS.length - 1));
  return (pixelIdx + k) % PIXEL_SPOTS.length;
}
// moonlingPose(t, out) -> { bob (m), ant1, ant2 (antenna sway, radians), blink (0 to 1: the eyes shut), dots (0.5 to 1: the belly's glow) }; t is the walk's clock
export function moonlingPose(t, out = {}) {
  out.bob = 0.035 * Math.sin(t * 2.1);
  out.ant1 = 0.28 * Math.sin(t * 3.1);
  out.ant2 = 0.28 * Math.sin(t * 3.1 + 1.9);
  const k = (t % 4.3) / 4.3;
  out.blink = k < 0.04 ? 1 : 0;
  out.dots = 0.75 + 0.25 * Math.sin(t * 2.6);
  return out;
}

// Is the whole plan inside the walk's bounds (the tests ask)?
export const inBounds = (x, z, m = 0) => x > MOON_BOUNDS.minX + m && x < MOON_BOUNDS.maxX - m && z > MOON_BOUNDS.minZ + m && z < MOON_BOUNDS.maxZ - m;
