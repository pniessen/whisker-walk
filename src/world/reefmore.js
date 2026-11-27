// =============================================================================
// THE REEF: SEVEN MORE FRIENDLY SEA CREATURES, THE PLANS (jellyfish, clownfish, seahorses, mantas, a whale and her calf, moray eels, squid). Pure data and pure
// functions, no THREE, no rng, no clock: every pose is a function of the time handed in and a hashed phase (hash01 with this file's own salts), so two cats
// in a room see the same sea. Drawing is world/reefmoreparts.js, the walk's life world/reefmorelive.js. All of it is decoration: none of it is a rule, a find
// or a danger, and nothing ever comes at her. The plans are clear of the finds, the story's places, the spawn court, the ladder, the ledge, the cave's mouth,
// Marlo and the stage; the jellyfish, mantas, whale and squid keep above the float ceiling (2.2 m), so they are never in her way even over the coral.
//   * JELLYFISH: soft moon jellies drifting slowly 2.6 to 6 m up, more of them over the Deep and the Glow Cave.
//   * CLOWNFISH: pairs weaving in and out of the Coral Garden's clumps (CLOWN_ANCHORS is a small list that can later be moved onto anemones).
//   * SEAHORSES: three holding on to kelp stalks in the Kelp Garden, one now and then letting go to drift a little way and back.
//   * MANTAS: two in wide slow loops in open water, off the housewarming parade's lane.
//   * WHALE: one big gentle blue-grey whale (and a calf) on a long loop, mostly out of sight, passing slow and high over the Deep every 90 seconds.
//   * MORAY EELS: two, each peeking out of its rock crack (reefseals.js EEL_DENS), swaying, with a big gentle smile; it never leaves the crack.
//   * SQUID: a school of six jetting in short bursts and gliding between, their colour pulsing from pink to pale.
// docs/superpowers/plans/2026-11-26-reef.md.
// =============================================================================

import { reefY, reefColliders, ZONES } from './reefplan.js';
import { storyColliders } from './reefstory.js';
import { STAGE } from './reefwing.js';
import { hash01, smooth, bump, lerp, TAU, lifeRung, placeAvoid, lifeColliders, EEL_DENS } from './reefseals.js';

// One salt per stream, all different from the other creatures' (test/reefmore.test.js).
export const SALTS = Object.freeze({ jelly: 0x6a656c6c, clown: 0x636c6f77, horse: 0x68727365, manta: 0x6d616e74, whale: 0x7768616c, eel: 0x6d6f7261, squid: 0x73717569 });
export { EEL_DENS, lifeRung };

const wrap1 = (v) => v - Math.floor(v);
const h01 = (n, key) => hash01(n, SALTS[key]);

// How many of each a rung keeps (the low rungs: fewer jellies, two clown pairs, two seahorses, one manta, the whale alone, one eel, four squid).
export const MORE_COUNT = Object.freeze({
  high: Object.freeze({ jellies: 8, clowns: 3, horses: 3, mantas: 2, whale: 1, calf: 1, eels: 2, squid: 6 }),
  low: Object.freeze({ jellies: 5, clowns: 2, horses: 2, mantas: 1, whale: 1, calf: 0, eels: 1, squid: 4 }),
  lite: Object.freeze({ jellies: 5, clowns: 2, horses: 2, mantas: 1, whale: 1, calf: 0, eels: 1, squid: 4 }),
});

// Everything the plans keep clear of that is NOT solid (the finds, shells, sea-glass, mice, story points, rings, the spawn court, ladder, ledge, cave mouth,
// Marlo, the stage): the swimmers' places over the coral's colliders do not matter to what flies above the float ceiling.
export function airAvoid() {
  const solid = new Set([...reefColliders(), ...storyColliders(), ...lifeColliders()].map((c) => `${c.x},${c.z},${c.r}`));
  return placeAvoid().filter((d) => !solid.has(d.join(',')));
}

// ---- the jellyfish --------------------------------------------------------------------------------------------------------
// { id, x, z (the middle of its drift), amp (the drift's reach, m), h (metres over the seabed), size, tone } in the order the rungs keep them: the Deep and the Glow Cave first.
export const JELLIES = Object.freeze([
  { id: 0, x: -40, z: -30, amp: 1.3, h: 4.2, size: 1.15, tone: 'cyan' }, // the Deep
  { id: 1, x: -45, z: -37, amp: 0.9, h: 4.8, size: 1.0, tone: 'violet' }, // over the Glow Cave
  { id: 2, x: -36, z: -38, amp: 1.1, h: 3.4, size: 1.3, tone: 'pink' }, // the Deep's far side
  { id: 3, x: -8, z: -20, amp: 1.8, h: 5.2, size: 1.0, tone: 'cyan' }, // the Sandy Flats
  { id: 4, x: 32, z: 10, amp: 2.0, h: 3.2, size: 1.1, tone: 'pink' }, // east of the Coral Garden
  { id: 5, x: -34, z: -26, amp: 0.9, h: 5.8, size: 0.85, tone: 'violet' }, // the Deep, by the boat
  { id: 6, x: -6, z: 12, amp: 2.5, h: 3.0, size: 0.95, tone: 'cyan' },
  { id: 7, x: 14, z: 14, amp: 2.5, h: 4.6, size: 1.05, tone: 'violet' },
].map((j) => Object.freeze(j)));
export const JELLY_TONES = Object.freeze({ // [bell, rim, tentacle] in sRGB, dim: the drawing adds them to the water
  cyan: [[60, 120, 140], [130, 220, 235], [90, 170, 200]], violet: [[90, 70, 140], [190, 160, 240], [140, 110, 200]], pink: [[140, 80, 110], [245, 170, 200], [200, 120, 160]],
});
// jellyPose(j, t, out): { x, y, z, yaw, pulse (-1 to 1), phase, size }. A slow Lissajous drift no wider than `amp`, a lazy bob, a pulse of about 1.1 s.
export function jellyPose(j, t, out = {}) {
  const T = Math.max(0, t);
  const ph = h01(j.id, 'jelly') * TAU; const ph2 = h01(j.id + 8, 'jelly') * TAU;
  const r = j.amp * 0.7;
  out.x = j.x + r * Math.sin((0.09 + 0.04 * h01(j.id + 16, 'jelly')) * T + ph);
  out.z = j.z + r * Math.sin((0.07 + 0.04 * h01(j.id + 24, 'jelly')) * T + ph2);
  const w = 1.5 + 0.4 * h01(j.id + 32, 'jelly');
  out.phase = w * T + ph;
  out.pulse = Math.sin(out.phase);
  out.y = reefY(out.x, out.z) + j.h + 0.35 * Math.sin(0.17 * T + ph2) + 0.1 * out.pulse; // a little lift on each pulse
  out.yaw = 0.12 * T + ph;
  out.size = j.size;
  return out;
}

// ---- the clownfish ---------------------------------------------------------------------------------------------------------
// The Coral Garden's clumps the pairs swim round: [x, z, s (the clump's size)]. A plain list: when the seabed's anemones are in, move these onto them.
export const CLOWN_ANCHORS = Object.freeze([[2.7, -3.1, 0.79], [24.1, 3.6, 1.15], [19.5, -4.9, 0.91]].map((a) => Object.freeze(a)));
export const CLOWNS = Object.freeze(CLOWN_ANCHORS.flatMap((a, i) => [
  Object.freeze({ id: i * 2, anchor: i, size: 1, dir: i % 2 ? 1 : -1 }), Object.freeze({ id: i * 2 + 1, anchor: i, size: 0.8, dir: i % 2 ? 1 : -1 }),
]));
// clownPose(f, t, out): { x, y, z, yaw, beat }. It circles its clump at a radius that breathes between just inside and out beyond the clump (weaving in and out).
export function clownPose(f, t, out = {}) {
  const T = Math.max(0, t);
  const a = CLOWN_ANCHORS[f.anchor];
  const ph = h01(f.id, 'clown') * TAU; const ph2 = h01(f.id + 8, 'clown') * TAU;
  const at = (u, o) => {
    const th = f.dir * (0.5 + 0.08 * (f.id % 2)) * u + ph;
    const r = a[2] * 0.8 + 0.3 + 0.35 * Math.sin(0.7 * u + ph2) + (f.id % 2 ? 0.25 : 0);
    o.x = a[0] + Math.cos(th) * r; o.z = a[1] + Math.sin(th) * r;
    return o;
  };
  at(T, out);
  const nx = at(T + 0.1, {});
  out.yaw = Math.atan2(nx.x - out.x, nx.z - out.z);
  out.y = reefY(out.x, out.z) + 0.45 + 0.3 * Math.sin(0.9 * T + ph);
  out.beat = T * 9 + ph;
  out.size = f.size;
  return out;
}

// ---- the seahorses -------------------------------------------------------------------------------------------------------------
// Three tall kelp stalks of the Kelp Garden (each is a blade of reefplan.scatterKelp): [x, z], the height of the hold, the way it faces, whether it ever lets go.
export const HORSES = Object.freeze([
  { id: 0, x: -29.05, z: 14.51, h: 1.35, yaw: 0.9, tone: 'gold', drifts: false },
  { id: 1, x: -16.06, z: 14.5, h: 1.15, yaw: -2.2, tone: 'orange', drifts: false },
  { id: 2, x: -19.73, z: 20.78, h: 1.45, yaw: 2.4, tone: 'peach', drifts: true },
].map((h) => Object.freeze(h)));
// horsePose(h, t, out): { x, y, z, yaw, sway (rad), hold (1 holding, 0 drifting), fin }. It sways with the water; the third lets go for ten seconds every 52 or so,
// drifts a loop of under a metre and takes hold again.
export function horsePose(h, t, out = {}) {
  const T = Math.max(0, t);
  const ph = h01(h.id, 'horse') * TAU;
  const v = (wrap1(T / 52 + h01(h.id + 4, 'horse')) - 0.55) / 0.2;
  const d = h.drifts ? bump(v) : 0;
  const a = TAU * Math.min(1, Math.max(0, v));
  out.x = h.x + d * 0.8 * Math.sin(a);
  out.z = h.z + d * 0.4 * (1 - Math.cos(a));
  out.y = reefY(h.x, h.z) + h.h + d * 0.35 * Math.sin(Math.PI * Math.min(1, Math.max(0, v)));
  out.sway = 0.12 * Math.sin(0.7 * T + ph) * (1 - 0.4 * d);
  out.yaw = h.yaw + 0.15 * Math.sin(0.31 * T + ph) + d * 0.5 * Math.sin(a);
  out.hold = 1 - d;
  out.fin = 16 * T + ph;
  return out;
}

// ---- the mantas -----------------------------------------------------------------------------------------------------------------
// Wide slow loops in open water, 3.2 to 4.6 m up (above the float ceiling), far from the parade's lane.
export const MANTAS = Object.freeze([
  { id: 0, cx: -2, cz: 14, a: 13, b: 8, rot: -0.3, w: 0.12, dir: 1, y: 3.6, size: 1.2 },
  { id: 1, cx: 30, cz: 24, a: 12, b: 8, rot: 0.5, w: 0.1, dir: -1, y: 4.1, size: 1.0 },
].map((m) => Object.freeze(m)));
// The housewarming parade's manta runs from here to there (world/reefparade.js; test/reefmore.test.js holds the numbers equal): the loops keep 10 m off it.
export const PARADE_LANE = Object.freeze([[STAGE.x - 28, STAGE.z - 8], [STAGE.x + 26, STAGE.z + 2]]);
// mantaPose(m, t, out): { x, y, z, yaw, roll, flap (rad, the wing's lift), size }.
export function mantaPose(m, t, out = {}) {
  const T = Math.max(0, t);
  const ph = h01(m.id, 'manta') * TAU;
  const th = m.dir * m.w * T + ph;
  const ex = m.a * Math.cos(th); const ez = m.b * Math.sin(th);
  const cs = Math.cos(m.rot); const sn = Math.sin(m.rot);
  out.x = m.cx + ex * cs - ez * sn; out.z = m.cz + ex * sn + ez * cs;
  const dx = m.dir * (-m.a * Math.sin(th)); const dz = m.dir * (m.b * Math.cos(th));
  out.yaw = Math.atan2(dx * cs - dz * sn, dx * sn + dz * cs);
  out.y = reefY(out.x, out.z) + m.y + 0.4 * Math.sin(0.3 * T + ph);
  out.roll = -m.dir * 0.16;
  out.flap = 0.3 * Math.sin(1.4 * T + ph) * (0.6 + 0.4 * Math.sin(0.13 * T + ph)); // slow beats that swell and ease
  out.size = m.size;
  return out;
}

// ---- the whale ---------------------------------------------------------------------------------------------------------------------
// A long ellipse mostly beyond the fog: it comes in from the east, passes high and slow over the Deep and goes on west, back round. 90 s a lap.
export const WHALE = Object.freeze({ cx: -30, cz: -75, a: 50, b: 44, secs: 90, start: 0.1, level: 6.2, size: 1, calf: 0.45 });
export const WHALE_PASS = (0.25 - WHALE.start) * WHALE.secs; // the second of a lap when the whale is over the Deep (the picture reduced motion keeps)
// whalePose(calf, t, out): { x, y, z, yaw, pitch, roll, beat, size }. The calf swims a little behind on the inner side, a little lower.
export function whalePose(calf, t, out = {}) {
  const T = Math.max(0, t);
  const th = TAU * (T / WHALE.secs + WHALE.start) - (calf ? 0.06 : 0);
  const k = calf ? 0.93 : 1;
  out.x = WHALE.cx + WHALE.a * k * Math.cos(th); out.z = WHALE.cz + WHALE.b * k * Math.sin(th);
  out.yaw = Math.atan2(-WHALE.a * Math.sin(th), WHALE.b * Math.cos(th));
  const w = TAU / WHALE.secs; // (whole numbers of cycles to the lap, so a lap is the same every time round)
  out.y = reefY(out.x, out.z) + WHALE.level - (calf ? 0.5 : 0) + 0.35 * Math.sin(9 * w * T + (calf ? 0.8 : 0));
  out.pitch = 0.05 * Math.cos(9 * w * T + (calf ? 0.8 : 0));
  out.roll = 0.04 * Math.sin(6 * w * T);
  out.beat = 16 * w * T + (calf ? 1.5 : 0);
  out.size = calf ? WHALE.calf : WHALE.size;
  return out;
}
export const DEEP_ZONE = ZONES.find((z) => z.id === 'deep');

// ---- the moray eels --------------------------------------------------------------------------------------------------------------------
// eelPose(e, t, out): { sway, nod, grin (0 to 1, a slow smile that widens), blink (0 to 1 closed) }. The body is eelSpine in the den's frame: it starts inside the crack and
// never leaves it.
export function eelPose(e, t, out = {}) {
  const T = Math.max(0, t);
  const ph = h01(e.id + 1, 'eel') * TAU;
  out.sway = Math.sin(1.1 * T + ph);
  out.nod = Math.sin(0.6 * T + ph * 0.7);
  out.grin = 0.7 + 0.3 * Math.sin(0.4 * T + ph);
  const u = wrap1(T / 7.3 + h01(e.id + 5, 'eel'));
  out.blink = bump((u - 0.9) / 0.08);
  return out;
}
// eelSpine(e, pose, s, out): the body at fraction s (0 inside the crack, 1 the head) in the den's frame (+z out of the mouth). { x, y, z, r }.
export function eelSpine(e, pose, s, out = {}) {
  out.z = -0.55 + 1.5 * s + 0.07 * pose.nod * s;
  out.y = 0.36 + 0.3 * smooth(s) + 0.05 * pose.nod * s * s;
  out.x = 0.14 * pose.sway * s * s;
  out.r = 0.13 + 0.03 * Math.sin(Math.PI * Math.min(1, s * 0.9));
  return out;
}

// ---- the squid -------------------------------------------------------------------------------------------------------------------------
export const SQUID = Object.freeze({ cx: -20, cz: 1, a: 8, b: 5, rot: 0.4, cycle: 5.2, turn: 0.52, level: 3.1 });
export const SQUIDS = Object.freeze(Array.from({ length: 6 }, (_, i) => Object.freeze({
  id: i, ox: Math.cos(i * 2.4) * (0.7 + 0.28 * i), oz: Math.sin(i * 2.4) * (0.7 + 0.28 * i), dy: ((i * 5) % 6) * 0.14 - 0.35,
})));
// How far through its cycle's distance a squid is: a quick jet (the first 0.3 of a cycle) takes three quarters of it, the glide the last quarter.
const jetProgress = (u) => (u < 0.3 ? 0.75 * smooth(u / 0.3) : 0.75 + 0.25 * ((u - 0.3) / 0.7));
// squidPose(q, t, out): { x, y, z, yaw, pitch, jet (0 to 1, the squeeze), tone [r,g,b] (pink at the jet, pale in the glide) }.
export const SQUID_PINK = Object.freeze([238, 142, 166]); export const SQUID_PALE = Object.freeze([250, 232, 228]);
export function squidPose(q, t, out = {}) {
  const T = Math.max(0, t);
  const lagT = T + 0.25 * h01(q.id, 'squid'); // each a quarter second out of step: a school, not a drill
  const c = lagT / SQUID.cycle;
  const u = c - Math.floor(c);
  const P = Math.floor(c) + jetProgress(u);
  const th = P * SQUID.turn + h01(99, 'squid') * TAU;
  const at = (th2, o) => {
    const ex = SQUID.a * Math.cos(th2); const ez = SQUID.b * Math.sin(th2);
    const cs = Math.cos(SQUID.rot); const sn = Math.sin(SQUID.rot);
    o.x = SQUID.cx + ex * cs - ez * sn; o.z = SQUID.cz + ex * sn + ez * cs;
    o.tx = -SQUID.a * Math.sin(th2) * cs - SQUID.b * Math.cos(th2) * sn; o.tz = -SQUID.a * Math.sin(th2) * sn + SQUID.b * Math.cos(th2) * cs;
    return o;
  };
  const p = at(th, {});
  out.yaw = Math.atan2(p.tx, p.tz);
  const cy = Math.cos(out.yaw); const sy = Math.sin(out.yaw);
  out.x = p.x + q.ox * cy + q.oz * sy; out.z = p.z - q.ox * sy + q.oz * cy; // the formation turns with the school
  out.y = reefY(out.x, out.z) + SQUID.level + q.dy + 0.12 * Math.sin(0.6 * T + q.id);
  out.jet = u < 0.3 ? Math.sin(Math.PI * u / 0.3) : 0;
  out.pitch = 0.1 * out.jet;
  const k = Math.min(1, 0.8 * out.jet + 0.2 * Math.sin(0.3 * T + q.id) ** 2);
  out.tone = out.tone || [0, 0, 0];
  for (let i = 0; i < 3; i++) out.tone[i] = lerp(SQUID_PALE[i], SQUID_PINK[i], k);
  return out;
}
