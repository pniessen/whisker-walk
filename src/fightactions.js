// Fight actions (2026-11-01 fight moves and scars): what each round's result
// looks like, as pure keyframes. No THREE, no DOM, no save, no rng draws:
// which action plays, which beat and which scar site are pure functions of
// the round and stable ids.
//
// A Frame is one cat's offsets from its own anchor at one moment:
//   along  m toward the other cat's anchor
//   side   m to its own right
//   lift   m up
//   pitch  rad nose-up, about its hind heels (placeFrame)
//   roll   rad about its own forward axis, about its torso centre (placeFrame)
//   pose   an animator state
//   slash, dust  cues, set on the winner's frame only, true across a short
//          window of u: the caller fires each on the frame it turns true.
//
// The shapes follow the approved sketch (spec "What the owner decided" 1):
// a leap and scratch, rearing up and swatting, a jump on top and pin, and a
// rolling tumble. R21: no action or beat frame is ever a clue pose ('stalk',
// 'swipe', 'backUp'); only the answer prelude may show one.
import { COUNTER } from './fight.js';
import { moveById } from './fightmoves.js';
import { seedFromCode } from './rng.js';

export const ACTION_KINDS = Object.freeze(['leap', 'rearUp', 'pin', 'roll']);
// R10: seconds of each action after the answer prelude. Roll is special-only.
export const ACTION_LEN = Object.freeze({ leap: 2.4, rearUp: 2.6, pin: 2.8 });
export const ACTION_LEN_BIG = Object.freeze({ leap: 3.0, rearUp: 3.2, pin: 3.2, roll: 3.4 });
export const ANSWER_PRELUDE = 0.35;
export const ANSWER_PRELUDE_REDUCED = 0.2;
export const REDUCED_ACTION = 0.6;
export const BEAT_TIME = 1.2;

// The answer prelude: today's answer and move poses (src/game/clanfight.js's
// SIDE_STEP, POUNCE_HOP and BACKUP_EASE, the same numbers).
export const PRELUDE = Object.freeze({ sideStep: 0.8, hop: 0.25, backupEase: 0.6 });

// Every height the actions put a cat at stays in [0, LIFT_MAX].
const LIFT_MAX = 0.8;
// How long (in u) a cue stays true.
const CUE = 0.04;

// Sketch a, a 2.8 s loop: crouch 0-0.3, flight 0.3-0.55, scratch 0.55-0.72,
// hop home 0.72-1. The leap lands `short` of the other cat's anchor; the
// loser flinches back while the scratch lands (the sketch's hit, 0.5-0.8).
const LEAP = {
  crouch: 0.25, fly: 0.5, scratch: 0.72, home: 0.95,
  short: 0.6, peak: 0.5, peakBig: 0.7, pitch: 0.35, scratchPitch: 0.5, hop: 0.12, slashAt: 0.55,
  hitFrom: 0.5, hitTo: 0.8, flinch: 0.3, flinchPitch: 0.15,
};
// Sketch b: both step in and rear up, boxing; the loser drops and steps back.
// The step comes from the gap (final review 5): reared about its hind heels a
// cat's front paws are only ~0.05 m ahead of its anchor, so each steps in
// (gap - meet) / 2 and the paws overlap by a few cm. A cat steps in as it
// rears and back as it comes down (its step follows the square of its pitch,
// so it lags the rear a little), because a standing cat's front reaches
// ~0.6 m ahead and two stepped-in standing cats would sink into each other.
const REAR = {
  meet: 0.05, upFrom: 0.08, upTo: 0.25, pitch: 0.9,
  boxFrom: 0.25, boxTo: 0.7, bob: 0.05, bobs: 6, bobsBig: 8,
  winDownFrom: 0.75, winDownTo: 0.88,
  loseDropFrom: 0.7, loseDropTo: 0.82, loseDownTo: 0.8, loseHomeFrom: 0.85, loseHomeTo: 0.98,
  back: 0.3, backBig: 0.5, settle: 0.95, flinchBelow: 0.1,
};
// Sketch c, a 3.4 s loop: crouch 0-0.22, flight 0.22-0.42, hold 0.42-0.82,
// hop home 0.82-1. The loser flattens just before the landing.
const PIN = {
  crouch: 0.2, land: 0.4, hold: 0.8, home: 0.95,
  arc: 0.3, arcBig: 0.4, pitch: 0.3, shake: 0.04, shakes: 5, shakesBig: 7, hop: 0.2,
  loseFlat: 0.36, loseUp: 0.86,
};
// Sketch d: they meet in the middle and roll over twice, a ball of two cats
// turning about the anchor line (`spread` each side of it, `lift` up), then
// break apart.
const ROLL = {
  meet: 0.12, rolled: 0.72, ease: 0.15, turns: 2, lift: 0.25, spread: 0.18, hop: 0.1,
  dustAt: Object.freeze([0.2, 0.5]), loseAway: 0.86, winAway: 0.92, settle: 0.96,
};
// The cue points (u of the action body) the caller fires once each, through
// cuesCrossed. The frames' slash/dust flags are short windows from them.
export const CUES = Object.freeze({
  leap: Object.freeze({ slash: Object.freeze([LEAP.slashAt]), dust: Object.freeze([]) }),
  rearUp: Object.freeze({ slash: Object.freeze([]), dust: Object.freeze([]) }),
  pin: Object.freeze({ slash: Object.freeze([]), dust: Object.freeze([PIN.land]) }),
  roll: Object.freeze({ slash: Object.freeze([]), dust: Object.freeze(ROLL.dustAt) }),
  reduced: Object.freeze({ slash: Object.freeze([]), dust: Object.freeze([0]) }),
});
// R9: the square-off beats.
const BEAT = { sideStep: 0.3, stareStep: 0.15 };

const KIND_BY_CLUE = Object.freeze({ charge: 'leap', swipe: 'rearUp', pounce: 'pin' });
const KIND_BY_ANSWER = Object.freeze({ swipe: 'leap', pounce: 'rearUp', dodge: 'pin' });

const clamp01 = (u) => (u > 0 ? (u < 1 ? u : 1) : 0); // NaN -> 0
const smooth = (u) => u * u * (3 - 2 * u);
const ramp = (u, a, b) => smooth(clamp01((u - a) / (b - a)));
const span = (u, a, b) => clamp01((u - a) / (b - a));
const cue = (u, at) => u >= at && u < at + CUE;
// sin(πk) that is exactly 0 at both ends (Math.sin(Math.PI) is 1.2e-16).
const arc = (k) => (k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0);

export function makeFrame() {
  return { along: 0, side: 0, lift: 0, pitch: 0, roll: 0, pose: 'cross', slash: false, dust: false };
}

// `+ 0` turns -0 into 0, so a home frame is exactly home.
function set(f, along, side, lift, pitch, roll, pose, slash = false, dust = false) {
  f.along = along + 0;
  f.side = side + 0;
  f.lift = Math.min(LIFT_MAX, Math.max(0, lift)) + 0;
  f.pitch = pitch + 0;
  f.roll = roll + 0;
  f.pose = pose;
  f.slash = slash;
  f.dust = dust;
  return f;
}

// The action a round plays (the design's table): a won round is mine, by my
// answer (a special plays its own action, big); a lost round is the
// intruder's, by the clue it showed.
export function actionFor(round) {
  const r = round || {};
  if (r.won === true) {
    if (r.special === true) {
      const m = moveById(r.answer);
      if (m) return { kind: m.action, by: 'me', big: true };
    }
    return { kind: KIND_BY_ANSWER[r.answer] ?? KIND_BY_CLUE[r.move] ?? 'leap', by: 'me', big: false };
  }
  return { kind: KIND_BY_CLUE[r.move] ?? 'leap', by: 'it', big: false };
}

// The whole round's result phase: prelude + action (R10).
export function actionTime(round, reducedMotion) {
  if (reducedMotion) return ANSWER_PRELUDE_REDUCED + REDUCED_ACTION;
  const { kind, big } = actionFor(round);
  const len = (big ? ACTION_LEN_BIG[kind] : ACTION_LEN[kind]) ?? ACTION_LEN_BIG[kind];
  return ANSWER_PRELUDE + len;
}

// The button whose pose a round's answer shows: a basic button its own, a
// special the basic button that answers the same clue (Rolling Tumble: pounce).
function buttonOf(answer) {
  if (answer === 'pounce' || answer === 'swipe' || answer === 'dodge') return answer;
  const m = moveById(answer);
  if (!m) return null;
  return m.answers === 'any' ? 'pounce' : COUNTER[m.answers];
}

// One cat's answer prelude (u over ANSWER_PRELUDE): mine shows my answer,
// its shows its move landing. With actions the dodge goes out and back, home
// at u = 1, so the action starts from the anchors.
export function preludeFrame(round, role, u, out = makeFrame()) {
  const r = round || {};
  const k = clamp01(u);
  const a = arc(k);
  if (role === 'me') {
    const b = buttonOf(r.answer);
    if (b === 'pounce') return set(out, 0, 0, PRELUDE.hop * a, 0, 0, 'pounce');
    if (b === 'swipe') return set(out, 0, 0, 0, 0, 0, 'swipe');
    if (b === 'dodge') return set(out, 0, PRELUDE.sideStep * a, 0, 0, 0, 'land');
    return set(out, 0, 0, 0, 0, 0, 'cross');
  }
  if (r.move === 'pounce') return set(out, 0, 0, PRELUDE.hop * a, 0, 0, 'pounce');
  if (r.move === 'swipe') return set(out, 0, 0, 0, 0, 0, 'swipe');
  return set(out, -(1 - smooth(k)) * PRELUDE.backupEase, 0, 0, 0, 0, 'follow');
}

// Where a scar from this action sits on the loser (spec Scars): a roll's is on
// the side or the hindquarters, fixed per cat by its id.
export function siteFor(kind, scarredId) {
  if (kind === 'leap') return 'face';
  if (kind === 'rearUp') return 'shoulder';
  if (kind === 'pin') return 'back';
  if (kind === 'roll') return (seedFromCode(String(scarredId)) >>> 1) & 1 ? 'side' : 'hind';
  return null;
}

export function makeActionFrames() {
  return { win: makeFrame(), lose: makeFrame() };
}

function leap(big, u, gap, win, lose) {
  const L = LEAP;
  const reach = Math.max(0, gap - L.short);
  if (u < L.crouch) set(win, 0, 0, 0, 0, 0, 'land');
  else if (u < L.fly) {
    const k = span(u, L.crouch, L.fly);
    set(win, reach * k, 0, (big ? L.peakBig : L.peak) * Math.sin(Math.PI * k), L.pitch * Math.sin(2 * Math.PI * k), 0, 'pounce');
  } else if (u < L.scratch) {
    const k = span(u, L.fly, L.scratch);
    set(win, reach, 0, 0, L.scratchPitch * Math.sin(Math.PI * k), 0, 'rearUp', cue(u, L.slashAt));
  } else if (u < L.home) {
    const k = ramp(u, L.scratch, L.home);
    set(win, reach * (1 - k), 0, L.hop * Math.sin(Math.PI * k), 0, 0, 'pounce');
  } else set(win, 0, 0, 0, 0, 0, 'cross');
  const back = u > L.hitFrom && u < L.hitTo ? Math.sin(Math.PI * span(u, L.hitFrom, L.hitTo)) : 0;
  set(lose, -L.flinch * back, 0, 0, L.flinchPitch * back, 0, back > 0 ? 'flinch' : 'cross');
}

function rearUp(big, u, gap, win, lose) {
  const R = REAR;
  const step = Math.max(0, (gap - R.meet) / 2);
  const bobs = big ? R.bobsBig : R.bobs;
  const k = span(u, R.boxFrom, R.boxTo);
  const boxing = u > R.boxFrom && u < R.boxTo;
  const winBob = boxing ? R.bob * Math.abs(Math.sin(Math.PI * bobs * k)) : 0;
  const loseBob = boxing ? R.bob * Math.abs(Math.sin(Math.PI * (bobs * k + 0.5))) * Math.sin(Math.PI * k) : 0;
  const up = ramp(u, R.upFrom, R.upTo);
  const wUp = up - ramp(u, R.winDownFrom, R.winDownTo);
  const wPitch = R.pitch * wUp;
  const wAlong = step * wUp * wUp;
  set(win, wAlong, 0, winBob, wPitch, 0, wPitch > 0.05 ? 'rearUp' : 'cross');
  const back = big ? R.backBig : R.back;
  const drop = ramp(u, R.loseDropFrom, R.loseDropTo);
  const lUp = up - ramp(u, R.loseDropFrom, R.loseDownTo);
  const lAlong = step * lUp * lUp - back * (drop - ramp(u, R.loseHomeFrom, R.loseHomeTo));
  const lPitch = R.pitch * lUp;
  // Reared until its pitch is nearly down: 'flinch' hangs the front legs,
  // which a nose-up cat would push into the ground.
  const lPose = lPitch > R.flinchBelow ? 'rearUp'
    : u >= R.loseDropFrom ? (u < R.settle ? 'flinch' : 'cross') : 'cross';
  set(lose, lAlong, 0, loseBob, lPitch, 0, lPose);
}

function pin(big, u, gap, loseBackY, win, lose) {
  const P = PIN;
  let shake = 0;
  if (u < P.crouch) set(win, 0, 0, 0, 0, 0, 'land');
  else if (u < P.land) {
    const k = span(u, P.crouch, P.land);
    set(win, gap * k, 0, loseBackY * k + (big ? P.arcBig : P.arc) * Math.sin(Math.PI * k), P.pitch * Math.sin(2 * Math.PI * k), 0, 'pounce');
  } else if (u < P.hold) {
    const k = span(u, P.land, P.hold);
    shake = P.shake * Math.sin(2 * Math.PI * (big ? P.shakesBig : P.shakes) * k);
    set(win, gap, shake, loseBackY, 0, 0, 'pinning', false, cue(u, P.land));
  } else if (u < P.home) {
    const k = ramp(u, P.hold, P.home);
    set(win, gap * (1 - k), 0, loseBackY * (1 - k) + P.hop * Math.sin(Math.PI * k), 0, 0, 'pounce');
  } else set(win, 0, 0, 0, 0, 0, 'cross');
  // The same world shake: they face each other, so her right is its left.
  const lPose = u < P.loseFlat ? 'cross' : u < P.loseUp ? 'pinned' : u < P.home ? 'flinch' : 'cross';
  set(lose, 0, -shake, 0, 0, 0, lPose);
}

function roll(u, gap, win, lose) {
  const R = ROLL;
  const mid = gap / 2;
  if (u < R.meet) {
    const k = ramp(u, 0, R.meet);
    const hop = R.hop * Math.sin(Math.PI * k);
    set(win, mid * k, 0, hop, 0, 0, 'pounce');
    set(lose, mid * k, 0, hop, 0, 0, 'pounce');
    return;
  }
  if (u < R.rolled) {
    // One ball turning about the anchor line: the winner's torso centre
    // `spread` along its rolled up, the loser's the same distance the other
    // way, both turned by the same world angle (the loser faces the other
    // way, so its own roll is -r).
    const k = span(u, R.meet, R.rolled);
    const r = 2 * Math.PI * R.turns * smooth(k);
    const e = ramp(k, 0, R.ease) * ramp(1 - k, 0, R.ease);
    const s = -e * R.spread * Math.sin(r);
    const dust = cue(u, R.dustAt[0]) || cue(u, R.dustAt[1]);
    set(win, mid, s, e * (R.lift + R.spread * Math.cos(r)), 0, r, 'roll', false, dust);
    set(lose, mid, s, e * (R.lift - R.spread * Math.cos(r)), 0, -r, 'roll');
    return;
  }
  set(win, mid * (1 - ramp(u, R.rolled, R.winAway)), 0, 0, 0, 0, 'cross');
  set(lose, mid * (1 - ramp(u, R.rolled, R.loseAway)), 0, 0, 0, 0, u < R.settle ? 'scared' : 'cross');
}

// Both cats at u (0..1) of an action's body (after the prelude). `gap` is the
// distance between the anchors; `loseBackY` the loser's catBackY(…, 'pinned')
// (the pin lands on it). `winBackY` is accepted for symmetry and unused by
// these shapes. Writes into `out` (pass one to avoid allocating).
export function actionFrame(kind, big, u, { gap = 1.6, winBackY = 0, loseBackY = 0, reducedMotion = false } = {}, out = makeActionFrames()) {
  void winBackY;
  const k = clamp01(u);
  const g = Number.isFinite(gap) && gap > 0 ? gap : 0;
  const back = Number.isFinite(loseBackY) && loseBackY > 0 ? loseBackY : 0;
  const { win, lose } = out;
  if (reducedMotion) {
    // The winner stands tall, the loser crouches (R21: 'flinch'), one dust puff.
    set(win, 0, 0, 0, 0, 0, 'cross', false, k < CUE);
    set(lose, 0, 0, 0, 0, 0, 'flinch');
    return out;
  }
  if (kind === 'rearUp') rearUp(big, k, g, win, lose);
  else if (kind === 'pin') pin(big, k, g, back, win, lose);
  else if (kind === 'roll') roll(k, g, win, lose);
  else leap(big, k, g, win, lose);
  return out;
}

// R20: a frame as a group placement. The pitch turns the cat about its hind
// heels (`hindZ` behind its origin) so they stay put; the roll about its torso
// centre (`pivotY` up); `lift` raises the lot. Returns the group's full offsets
// from its anchor: `dAlong` toward the other cat, `dSide` to its right, and
// `y`. The caller sets rotation.x = pitch and rotation.z = roll, with the
// rotation order 'YXZ' (yaw outermost). The actions never pitch and roll at
// once; the two corrections simply add.
export function placeFrame(frame, { hindZ = 0, pivotY = 0 } = {}, out = { dAlong: 0, dSide: 0, y: 0 }) {
  const p = frame.pitch || 0;
  const r = frame.roll || 0;
  out.dAlong = (frame.along || 0) - hindZ * (1 - Math.cos(p)) + 0;
  out.dSide = (frame.side || 0) + pivotY * Math.sin(r) + 0;
  out.y = (frame.lift || 0) + hindZ * Math.sin(p) + pivotY * (1 - Math.cos(r)) + 0;
  return out;
}

// R9: the square-off beat by round number, no draw. The first square-off is 0.
export function beatFor(round) {
  const n = Number.isFinite(round) ? Math.floor(round) : 0;
  return ((n % 3) + 3) % 3;
}

// Both cats' frame at u of a beat: 0 arch (a hiss), 1 a sidestep out and
// back, 2 a stare, stepping in and back. No circling.
export function beatFrame(beat, u, out = makeFrame()) {
  const s = arc(clamp01(u));
  if (beat === 1) return set(out, 0, BEAT.sideStep * s, 0, 0, 0, 'cross');
  if (beat === 2) return set(out, BEAT.stareStep * s, 0, 0, 0, 0, 'cross');
  return set(out, 0, 0, 0, 0, 0, 'arch');
}

// R8: the new fight states go over the wire as states every build knows.
export const WIRE_POSE = Object.freeze({ arch: 'cross', rearUp: 'swipe', flinch: 'scared', pinned: 'scared', pinning: 'stalk', roll: 'pounce' });

export function wirePose(state) {
  return Object.hasOwn(WIRE_POSE, state) ? WIRE_POSE[state] : state;
}

// How many of an action's cues fall in (prevU, u]: the caller passes the
// previous frame's u (-1 on an action's first frame, so a cue at 0 fires) and
// fires each counted cue once. However long a frame is, every cue is crossed
// exactly once over an action. Writes into `out` when given.
export function cuesCrossed(kind, big, reducedMotion, prevU, u, out = { slash: 0, dust: 0 }) {
  void big; // the big variants share their cue points
  const c = reducedMotion ? CUES.reduced : (Object.hasOwn(CUES, kind) && kind !== 'reduced' ? CUES[kind] : CUES.leap);
  let slash = 0, dust = 0;
  for (let i = 0; i < c.slash.length; i++) if (prevU < c.slash[i] && c.slash[i] <= u) slash++;
  for (let i = 0; i < c.dust.length; i++) if (prevU < c.dust[i] && c.dust[i] <= u) dust++;
  out.slash = slash;
  out.dust = dust;
  return out;
}
