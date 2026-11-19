// =============================================================================
// How Appletree Farm's animals LIVE: the breath, the blink, the flick of an
// ear, the order a cow's feet fall in. Pure numbers, like src/farmsim.js: no
// THREE, no DOM, no dice. src/farmanimals.js turns the models' parts by them.
//
// Nothing here changes what an animal DOES (where it is, where it goes, what
// it answers): that is farmsim.js's, and this file never writes to it. Every
// function is a function of the clock, of how far the animal has walked and
// of a whole number of its own (`seed`: so no two blink in step), and gives
// the same answer for the same question on every device. None allocates: the
// ones with more than one answer fill a record of their own and return it.
//
// Every output is bounded, and test/farmlife.test.js holds each bound:
//   blink, slowBlink, flick's size, bump, hold      0..1 (flick: -1..1)
//   breath, sway                                    -1..1
//   step.swing -1..1 (forward +), step.lift 0..1
//   lookYaw                                         within the limit given
// =============================================================================

// A whole number and a seed to a number from 0 to 1, by integer arithmetic
// only (Math.imul): the same on every device.
export function hash01(n, seed) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((seed | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Now and then: once in every `every` seconds, at a moment of its own, a thing
// `len` seconds long happens. Returns how far through it the clock is (0..1),
// or -1 between times.
export function nowAndThen(t, every, len, seed) {
  const n = Math.floor(t / every);
  const start = n * every + hash01(n, seed) * (every - len);
  const x = (t - start) / len;
  return x >= 0 && x < 1 ? x : -1;
}
// Which time this is (a whole number), for a coin of its own.
export const whichTime = (t, every) => Math.floor(t / every);

// 0 → 1 → 0, smoothly; -1 (not now) is 0.
export const bump = (x) => (x < 0 ? 0 : Math.sin(Math.PI * x) ** 2);
// 0 → 1, held, → 0: in and out over `edge` of the time each (0 before and after).
export function hold(x, edge = 0.2) {
  if (x < 0 || x >= 1) return 0;
  const k = Math.min(1, x / edge, (1 - x) / edge);
  return k * k * (3 - 2 * k);
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- every animal ----------------------------------------------------------------------------
// The lids: 0 open, 1 shut. A quick blink every few seconds.
export function blink(t, seed) {
  return bump(nowAndThen(t, 4.3, 0.2, seed * 7 + 1));
}
// A cow's or a dozing dog's slow blink: down, held shut a moment, up.
export function slowBlink(t, seed) {
  return Math.max(blink(t, seed), hold(nowAndThen(t, 13, 1.1, seed * 7 + 2), 0.35));
}
// A slow rise and fall of the ribs: -1..1.
export const breath = (t, seed, rate = 1.5) => Math.sin(t * rate + seed * 1.7);
// Weight going from one side to the other while standing: -1..1, slowly.
export const sway = (t, seed) => Math.sin(t * 0.31 + seed * 2.3) * 0.7 + Math.sin(t * 0.13 + seed) * 0.3;
// An ear flicking: a quick turn and back, one way or the other. -1..1.
export function flick(t, seed, every = 3.7) {
  const x = nowAndThen(t, every, 0.36, seed * 7 + 3);
  if (x < 0) return 0;
  return bump(x) * (hash01(whichTime(t, every), seed * 7 + 4) < 0.5 ? -1 : 1);
}
// How far to turn a head toward (x, z): the bearing from the animal, held
// inside ±limit, and fading to nothing between `near` and `far` metres away.
export function lookYaw(a, x, z, limit, near, far) {
  const dx = x - a.x, dz = z - a.z;
  const d = Math.hypot(dx, dz);
  if (d >= far || d < 0.05) return 0;
  const k = d <= near ? 1 : (far - d) / (far - near);
  return clamp(wrap(Math.atan2(dx, dz) - a.yaw), -limit, limit) * k;
}

// ---- walking ---------------------------------------------------------------------------------
// One leg, `p` cycles into its stride. While its foot is down (the first
// `duty` of the cycle) it goes steadily from forward to back, as the ground
// does under a walking animal; then it lifts and comes forward again.
const STEP = { swing: 0, lift: 0 };
export function step(p, duty) {
  const f = p - Math.floor(p);
  if (f < duty) {
    STEP.swing = 1 - (2 * f) / duty;
    STEP.lift = 0;
  } else {
    const u = (f - duty) / (1 - duty);
    STEP.swing = -Math.cos(Math.PI * u);
    STEP.lift = Math.sin(Math.PI * u);
  }
  return STEP;
}
// When each leg's stride begins, in the models' order (fore, fore, hind, hind;
// the first of each pair is the same side).
//   WALK: four beats, a cow's: hind, then the fore on the same side, then the
//         other hind, then its fore. Three feet are always down.
//   TROT: two beats: each fore with the hind opposite.
export const WALK = Object.freeze({ phase: Object.freeze([0.25, 0.75, 0, 0.5]), duty: 0.65 });
export const TROT = Object.freeze({ phase: Object.freeze([0, 0.5, 0.5, 0]), duty: 0.5 });

// A hen walking. Her head holds still in the world while her body walks on
// under it, then jumps forward to the next place: `head` is how far ahead of
// its middle place it is, -1..1, one jump a step. `feet` is the scissor of
// her legs, -1..1.
const HEN_WALK = { head: 0, feet: 0, lift: 0 };
export const HEN_STEP = 0.085; // metres a step
export function henWalk(walked) {
  const s = walked / HEN_STEP;
  const f = s - Math.floor(s);
  HEN_WALK.head = f < 0.75 ? 1 - (2 * f) / 0.75 : -1 + (2 * (f - 0.75)) / 0.25;
  HEN_WALK.feet = Math.sin(Math.PI * s);
  HEN_WALK.lift = Math.cos(Math.PI * s);
  return HEN_WALK;
}

// ---- the cow ---------------------------------------------------------------------------------
// Her jaw: `open` 0..1 and `side` -1..1, round and round as she chews, in
// bouts with a rest between them.
const CHEW = { open: 0, side: 0 };
export function chew(t, seed, rate = 5.2) {
  const k = hold(nowAndThen(t, 11, 8, seed * 7 + 5), 0.08);
  CHEW.open = k * (0.5 + 0.5 * Math.sin(t * rate + seed));
  CHEW.side = k * Math.cos(t * rate + seed);
  return CHEW;
}
// Her tail: an easy swing, and now and then a swish at a fly. `z` is side to
// side (-1..1), `x` how far it lifts off her (0..1).
const TAIL = { z: 0, x: 0 };
export function swish(t, seed) {
  const x = nowAndThen(t, 5.5, 1.0, seed * 7 + 6);
  const big = bump(x);
  TAIL.z = clamp(Math.sin(t * 1.6 + seed) * 0.25 + (x < 0 ? 0 : Math.sin(x * Math.PI * 3) * big * 0.9), -1, 1);
  TAIL.x = big * 0.6;
  return TAIL;
}
// Grazing: her muzzle tears at the grass (0..1, a quick tug about once a
// second) and she reaches to one side and the other (-1..1).
const GRAZE = { tug: 0, reach: 0 };
export function graze(t, seed) {
  const f = (t * 0.9 + seed * 0.37) % 1;
  GRAZE.tug = f < 0.25 ? Math.sin((f / 0.25) * Math.PI) : 0;
  GRAZE.reach = Math.sin(t * 0.43 + seed * 1.3);
  return GRAZE;
}
// With a cat on her back she turns right round to look at her: just after
// she comes to a stop (most stops: `stops` counts them, `still` is how long
// she has stood), and now and then while she stands. 0..1, and `side` (-1 or
// 1) is which way round.
const BACK = { k: 0, side: 1 };
export const LOOK_BACK_TIME = 2.6;
export function lookBack(t, seed, still = -1, stops = 0) {
  const every = 9;
  const later = hold(nowAndThen(t, every, 3.2, seed * 7 + 8), 0.25);
  const turn = hash01(stops, seed * 7 + 19) < 0.7 && still >= 0 ? hold((still - 0.35) / LOOK_BACK_TIME, 0.25) : 0;
  BACK.k = Math.max(later, turn);
  BACK.side = (turn > later ? hash01(stops, seed * 7 + 20) : hash01(whichTime(t, every), seed * 7 + 9)) < 0.5 ? -1 : 1;
  return BACK;
}
// A moo, `s` seconds after it began: her neck stretches and her mouth opens. 0..1.
export const MOO_TIME = 1.5;
export const moo = (s) => (s < 0 || s > MOO_TIME ? 0 : hold(s / MOO_TIME, 0.25));

// ---- the hen ---------------------------------------------------------------------------------
// What a hen does where she stands, round and round (a little differently
// each time): she scratches with a foot, steps back to look, pecks three
// quick pecks, lifts her head to look about, and now and then fluffs up or
// stretches her wings.
//   scratch -1..1  her feet, back and forth
//   bend     0..1  her body tipped to the ground (looking, pecking)
//   peck     0..1  the quick down-and-up of her head
//   gaze    -1..1  her head turned to one side, up
//   fluff    0..1  feathers out and a shake
//   stretch  0..1  wings open
const HEN = { scratch: 0, bend: 0, peck: 0, gaze: 0, fluff: 0, stretch: 0 };
export const HEN_ROUND = 6.4; // seconds
export function henIdle(t, seed) {
  const s = t + hash01(seed, 21) * HEN_ROUND;
  const n = Math.floor(s / HEN_ROUND);
  const u = s - n * HEN_ROUND;
  HEN.scratch = 0; HEN.bend = 0; HEN.peck = 0; HEN.gaze = 0; HEN.fluff = 0; HEN.stretch = 0;
  if (u < 1.2) {            // two scratches
    const x = u / 1.2;
    HEN.scratch = Math.sin(x * Math.PI * 4) * bump(x);
    HEN.bend = 0.25 * bump(x);
  } else if (u < 1.9) {     // back, and a look at what she turned up
    HEN.bend = 0.45 * hold((u - 1.2) / 0.7, 0.3);
  } else if (u < 3.2) {     // three pecks
    const x = (u - 1.9) / 1.3;
    HEN.bend = 0.55 * hold(x, 0.12);
    HEN.peck = Math.max(0, Math.sin(x * Math.PI * 6)) ** 2 * hold(x, 0.1);
  } else if (u < 4.6) {     // head up, a look to one side and the other
    const x = (u - 3.2) / 1.4;
    HEN.gaze = Math.sin(x * Math.PI * 2) * hold(x, 0.15) * (hash01(n, seed) < 0.5 ? -1 : 1);
  } else {                  // one time in three a fluff, one in three a stretch
    const x = (u - 4.6) / (HEN_ROUND - 4.6);
    const pick = hash01(n, seed + 40);
    if (pick < 0.34) HEN.fluff = hold(x, 0.25);
    else if (pick < 0.67) HEN.stretch = hold(x, 0.3);
  }
  return HEN;
}

// ---- the sheepdog ----------------------------------------------------------------------------
// Panting: his jaw, 0..1.
export const pant = (t) => 0.55 + 0.45 * Math.sin(t * 9.5);
// A wag: -1..1, quick.
export const wag = (t, slow = false) => Math.sin(t * (slow ? 5 : 12.5));
// The play bow he greets her with: elbows down, tail up. 0..1, now and then.
export function playBow(t, seed) {
  return hold(nowAndThen(t, 7.5, 1.7, seed * 7 + 10), 0.22);
}

// ---- the goat --------------------------------------------------------------------------------
// The little rear-up before the head-butt: 0..1 over the first part of the butt.
export const REAR_PART = 0.4;
export const rearUp = (u) => (u <= 0 || u >= REAR_PART ? 0 : Math.sin((u / REAR_PART) * Math.PI));
// A tail flick: a quick shake, now and then. -1..1.
export function tailFlick(t, seed) {
  const x = nowAndThen(t, 2.6, 0.45, seed * 7 + 12);
  return x < 0 ? 0 : Math.sin(x * Math.PI * 6) * bump(x);
}
// A head tilt: to one side and held, now and then. -1..1.
export function tilt(t, seed) {
  const every = 6.3;
  return hold(nowAndThen(t, every, 2.2, seed * 7 + 13), 0.2) * (hash01(whichTime(t, every), seed * 7 + 14) < 0.5 ? -1 : 1);
}
