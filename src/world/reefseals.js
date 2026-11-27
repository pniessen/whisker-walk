// =============================================================================
// THE REEF: ITS FRIENDLY SEA LIFE, THE PLANS (seals and octopuses). Pure data and pure functions, no THREE, no rng, no clock: every pose is a
// function of the time handed in, a hashed phase and (for the animals that keep her company) where she is. Drawing is world/reefsealsparts.js, the walk's
// life world/reefsealslive.js. All of it is decoration: none of it is a rule, a find or a danger, and none of it ever touches her or chases her.
//   * SEALS: two swim a slow loop round a point that lags her (3 to 6 m out, now and then drifting in to look at her and away again, a loop or a roll
//     now and then), a third sleeps on a rock by the Sandy Flats. They are pushed clear of the coral and the rocks, never of her path.
//   * OCTOPUSES: two, each in its own rock den (the Coral Garden's and the Kelp Garden's): eyes at the den's mouth, arms that undulate, a peek out now and
//     then with a wave and a slow change of colour (orange, red, purple); a shy step back if she comes within 1.5 m.
// docs/superpowers/plans/2026-11-26-reef.md.
// =============================================================================

import { REEF_BOUNDS, reefY, reefColliders, KEEP_OUT, REEF_POIS, ARCH, LADDER, LADDER_FOOT } from './reefplan.js';
import { storyColliders, POCKETS, MARLO, LEDGE } from './reefstory.js';
import { WING_AVOID, STAGE, CAVE } from './reefwing.js';
import { REEF_COLLECTIBLES, REEF_GOLD, REEF_FIND_MARKS, REEF_SCENICS } from './reeffindsplan.js';
import { RINGS, GLOVE_SPOTS } from './reeferrand.js';

// One salt per stream, all different from the other creatures' (test/reefseals.test.js).
export const SALTS = Object.freeze({ seal: 0x7365616c, octo: 0x6f63746f, dolphin: 0x646f6c66, tone: 0x746f6e65 });

// A whole number and a salt to a number from 0 to 1, by integer arithmetic only (the same on every device).
export function hash01(n, salt) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const bump = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 2); // 0 to 1 to 0 over u in (0, 1)
export const lerp = (a, b, k) => a + (b - a) * k;
const wrap1 = (v) => v - Math.floor(v);
const turnToward = (from, to, k) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return from + d * k; };

// 'high' | 'low' | 'lite' from the walk's quality tier (as world/reefcritters.js reads it).
export function lifeRung(tier) {
  if (tier && tier.shadows === false) return 'lite';
  if (tier && (tier.name === 'low' || (tier.rung ?? 0) >= 3)) return 'low';
  return 'high';
}
// How many of each a rung keeps: the low rungs have one swimming seal (no sleeper), one octopus, and a parent with one calf.
export const LIFE_COUNT = Object.freeze({
  high: Object.freeze({ swimmers: 2, sleeper: 1, octopuses: 2, dolphins: 0 }),
  low: Object.freeze({ swimmers: 1, sleeper: 0, octopuses: 1, dolphins: 0 }),
  lite: Object.freeze({ swimmers: 1, sleeper: 0, octopuses: 1, dolphins: 0 }),
});

// ---- the plans --------------------------------------------------------------------------------------------------------
export const SEALS = Object.freeze([
  Object.freeze({ id: 0, kind: 'swim', tone: 'spotted', r0: 4.4, w: 0.27, dir: 1, size: 1 }),
  Object.freeze({ id: 1, kind: 'swim', tone: 'pale', r0: 5.1, w: 0.2, dir: -1, size: 0.88 }),
  Object.freeze({ id: 2, kind: 'sleep', tone: 'spotted', x: -6, z: -8.5, yaw: 0.9, size: 0.95 }),
]);
// The sleeper's rock (flat topped, a little under half a metre high) and each octopus's den: a pile of rocks round a dark mouth that faces `yaw`.
export const SEAL_ROCK = Object.freeze({ x: -6, z: -8.5, r: 1.05, h: 0.46 });
export const OCTOPI = Object.freeze([
  Object.freeze({ id: 0, x: 10.5, z: -7, yaw: 0.67, r: 1.05, name: 'coral' }), // by the Coral Garden
  Object.freeze({ id: 1, x: -27.5, z: 10.5, yaw: 0.57, r: 1.05, name: 'kelp' }), // in the Kelp Garden
]);
export const SHY_RANGE = 1.5; // an octopus steps back when she is this near its den's mouth
export const SEAL_KEEP = 2.1; // a swimming seal never comes nearer to her than this (horizontally)

// What a hole in the plan's rocks and den circles looks like to everything else (the walk's colliders): the three rocks, each a small round collider.
export const lifeColliders = () => [
  { x: SEAL_ROCK.x, z: SEAL_ROCK.z, r: SEAL_ROCK.r },
  ...OCTOPI.map((o) => ({ x: o.x, z: o.z, r: o.r })),
];

// ---- what the animals keep clear of --------------------------------------------------------------------------------------
// The swimmers keep out of every collider (the coral, the rocks, the boat, the cave's boulders, the ledge) and of the few scenery pieces that are not colliders
// but are solid to look at: the arch's lintel, the ladder, the ledge, Marlo's start, the parade's stage, the cave's mouth.
export function swimAvoid() {
  const out = [...reefColliders(), ...storyColliders(), ...lifeColliders()].map((c) => [c.x, c.z, c.r]);
  out.push([ARCH.x, ARCH.z, ARCH.w * 0.5 + 0.3], [LADDER.x, LADDER.z, 1.1], [LEDGE.x, LEDGE.z, LEDGE.r + 0.6], [MARLO.start.x, MARLO.start.z, 1.2],
    [STAGE.x, STAGE.z, 2.6], [CAVE.mouth.x, CAVE.mouth.z, 2.4], [LADDER_FOOT.x, LADDER_FOOT.z, 1.2]);
  return out;
}
// The den sites and the sleeper's rock keep clear of everything else too: finds, shells, sea-glass, gold mice, the story points, the rings, the pockets of air,
// the spawn court, the scenic spots and the wing's reserved places. Every entry is [x, z, radius].
export function placeAvoid() {
  const out = swimAvoid();
  for (const [x, z, r] of KEEP_OUT) out.push([x, z, r]);
  for (const p of REEF_POIS) out.push([p.x, p.z, 1.5]);
  for (const c of REEF_COLLECTIBLES) out.push([c.x, c.z, 1.6]);
  for (const c of REEF_GOLD) out.push([c.x, c.z, 1.8]);
  for (const c of POCKETS) out.push([c.x, c.z, 1.8]);
  for (const c of Object.values(REEF_FIND_MARKS)) out.push([c.x, c.z, 2]);
  for (const c of REEF_SCENICS) out.push([c.x, c.z, 2]);
  for (const c of RINGS) out.push([c.x, c.z, 2]);
  for (const c of GLOVE_SPOTS) out.push([c.x, c.z, 1.6]);
  for (const [x, z, r] of WING_AVOID) out.push([x, z, r]);
  return out;
}

// Move (x, z) out of every disc (plus `margin`), a few passes (the coral is thick in places), then back inside the walk's bounds. Returns the pair in `out`.
export function settle(x, z, discs, margin, out = {}, passes = 6, extra = null) {
  const lox = REEF_BOUNDS.minX + 1.5; const hix = REEF_BOUNDS.maxX - 1.5; const loz = REEF_BOUNDS.minZ + 1.5; const hiz = REEF_BOUNDS.maxZ - 1.5;
  for (let p = 0; p < passes; p++) {
    let moved = false;
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i];
      const dx = x - d[0]; const dz = z - d[1];
      const need = d[2] + margin;
      const dist = Math.hypot(dx, dz);
      if (dist < need) {
        const ux = dist > 1e-6 ? dx / dist : 1; const uz = dist > 1e-6 ? dz / dist : 0;
        x = d[0] + ux * need; z = d[1] + uz * need; moved = true;
      }
    }
    if (extra) { // one more disc, with no margin (her keep)
      const dx = x - extra[0]; const dz = z - extra[1]; const dist = Math.hypot(dx, dz);
      if (dist < extra[2]) { const ux = dist > 1e-6 ? dx / dist : 1; const uz = dist > 1e-6 ? dz / dist : 0; x = extra[0] + ux * extra[2]; z = extra[1] + uz * extra[2]; moved = true; }
    }
    x = clamp(x, lox, hix); z = clamp(z, loz, hiz);
    if (!moved) break;
  }
  out.x = x; out.z = z;
  return out;
}
const SWIM_DISCS = swimAvoid();

// ---- the swimming seals -------------------------------------------------------------------------------------------------
// sealPose(seal, t, anchor, cat, out): where a swimming seal is at time t and how it holds itself. `anchor` is the point it circles (the walk's life lags it
// behind her), `cat` her real place (a seal is never nearer than SEAL_KEEP). { x, y, z, yaw, pitch (nose up), roll, paddle, beat, look }.
export function sealPose(s, t, anchor, cat = null, out = {}) {
  const T = Math.max(0, t);
  const id = s.id;
  const ph = hash01(id, SALTS.seal) * TAU;
  const ph2 = hash01(id + 10, SALTS.seal);
  const a = s.dir * s.w * T + ph;
  const per = 26 + 8 * hash01(id + 20, SALTS.seal);
  const look = bump((wrap1(T / per + ph2) - 0.6) / 0.24); // now and then it drifts in to look at her, and away again
  const r = (s.r0 + 0.7 * Math.sin(T * 0.31 + ph)) * (1 - 0.42 * look);
  const tx = -Math.sin(a) * s.dir; const tz = Math.cos(a) * s.dir;
  const px = anchor.x + Math.cos(a) * r; const pz = anchor.z + Math.sin(a) * r;
  let yaw = Math.atan2(tx, tz);
  yaw = turnToward(yaw, Math.atan2(anchor.x - px, anchor.z - pz), 0.7 * look);
  settle(px, pz, SWIM_DISCS, 0.7, out, 8, cat ? [cat.x, cat.z, SEAL_KEEP] : null); // out of the coral and rocks, and never nearer to her than its keep
  const x = out.x; const z = out.z;
  const bob = T * 0.42 + ph;
  let h = 1.25 + 0.8 * Math.sin(bob);
  let pitch = 0.28 * Math.cos(bob);
  const loopU = smooth((wrap1(T / (17 + 3 * id) + ph2) - 0.82) / 0.16); // a loop, nose up and over, once in a while
  const rollU = smooth((wrap1(T / (23 + 2 * id) + ph2 * 0.7) - 0.84) / 0.12); // and a roll
  if (loopU > 0 && loopU < 1) { pitch += TAU * loopU; h += 0.85 * Math.sin(Math.PI * loopU); }
  out.x = x; out.z = z;
  out.y = reefY(x, z) + Math.max(0.5, h);
  out.yaw = yaw; out.pitch = pitch;
  out.roll = TAU * rollU + 0.14 * s.dir * Math.sin(bob * 0.5);
  out.paddle = T * 3.6 + ph;
  out.beat = T * 3.1 + ph;
  out.look = look;
  return out;
}
// The sleeper: lying on its rock, breathing slowly. { x, y, z, yaw, breathe (-1 to 1) }.
export function sleeperPose(s, t, out = {}) {
  out.x = SEAL_ROCK.x; out.z = SEAL_ROCK.z;
  out.y = reefY(SEAL_ROCK.x, SEAL_ROCK.z) + SEAL_ROCK.h + 0.2;
  out.yaw = s.yaw;
  out.breathe = Math.sin(Math.max(0, t) * 0.9);
  return out;
}

// ---- the octopuses ----------------------------------------------------------------------------------------------------
export const OCTO_TONES = Object.freeze([[232, 134, 64], [196, 62, 48], [140, 92, 170]].map((c) => Object.freeze(c))); // orange, red, purple (sRGB)
// octopusPose(o, t, hide, out): `hide` (0 to 1) is how far it has stepped back from her. { peek, wave, bz, tone [r,g,b], eyes (0 to 1 open) }. The body sits
// in the den's mouth; bz is the head's forward place in the den's own frame (+z out of the mouth).
export function octopusPose(o, t, hide = 0, out = {}) {
  const T = Math.max(0, t);
  const ph = hash01(o.id + 1, SALTS.octo);
  const per = 21 + 5 * ph;
  const u = wrap1(T / per + ph);
  const calm = 1 - clamp(hide, 0, 1);
  out.peek = bump((u - 0.18) / 0.5) * calm;
  out.wave = bump((u - 0.36) / 0.22) * calm;
  out.bz = 0.05 + 0.55 * out.peek - 0.4 * (1 - calm);
  out.hide = 1 - calm;
  out.eyes = 1 - 0.85 * out.hide;
  const q = T / 8 + ph * 3;
  const i = Math.floor(q) % 3;
  const f = smooth((q - Math.floor(q) - 0.55) / 0.45); // a slow cycle: an eight second hold on each, a gentle turn to the next
  const A = OCTO_TONES[i]; const B = OCTO_TONES[(i + 1) % 3];
  out.tone = out.tone || [0, 0, 0];
  for (let c = 0; c < 3; c++) out.tone[c] = lerp(A[c], B[c], f) + 14 * out.wave;
  return out;
}
export const ARM_COUNT = 8;
export const WAVER = 3; // the arm that waves
// armSpine(o, pose, i, s, t, out): arm i at fraction s (0 base, 1 tip) of its length, in the den's frame. A pure function: the undulation is its own phase.
export function armSpine(o, pose, i, s, t, out = {}) {
  const T = Math.max(0, t);
  const th = ((i - 3.5) / 3.5) * 1.25;
  const L = (0.5 + 0.42 * pose.peek + 0.12 * hash01(o.id * 8 + i, SALTS.octo)) * (1 - 0.35 * pose.hide);
  const ph = i * 0.9 + o.id * 1.7;
  const dist = L * s;
  const amp = (0.1 + 0.05 * pose.peek) * s ** 1.3 * Math.sin(2.4 * s * 3 - 1.5 * T + ph);
  const bx = 0.17 * Math.sin(th); const bz = pose.bz - 0.05 + 0.1 * Math.cos(th);
  let y = 0.06 + 0.22 * (1 - smooth(s / 0.35)) + 0.04 * s * Math.sin(1.2 * T + ph) + 0.2 * s ** 3 * (0.6 + 0.4 * Math.sin(0.7 * T + ph * 1.3));
  let x = bx + Math.sin(th) * dist + Math.cos(th) * amp;
  const z = bz + Math.cos(th) * dist - Math.sin(th) * amp;
  if (i === WAVER) { y += pose.wave * 0.62 * s ** 1.2; x += pose.wave * 0.14 * s * Math.sin(T * 5 + o.id); }
  out.x = x; out.y = y; out.z = z;
  out.r = 0.065 * (1 - s) ** 0.9 + 0.012;
  return out;
}
// How far she is from an octopus's mouth (the place to measure shyness from): a metre out along the den's facing.
export const denMouth = (o) => ({ x: o.x + Math.sin(o.yaw) * 0.9, z: o.z + Math.cos(o.yaw) * 0.9 });
