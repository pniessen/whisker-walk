// =============================================================================
// THE CRYSTAL CAVE'S MISSION: THE PURE STEP MACHINE (milestone C2: chapter 1, steps 0 to 2; the later steps join it in milestone C5). No THREE, no clock, no random number, no
// save write: it takes the `state.crystal` record and an event and answers the next record; world/crystallife.js carries it out on a walk and writes it back. Modelled on
// src/reefmission.js (the Reef's Marlo).
//
// WHAT IS SAVED (state.crystal.step 0 to 7, state.crystal.sparks 3 bits; src/progression.js's sanitiser derives the sparks from the step):
//   step 0  nothing yet: Lumi, a baby glow-worm, peeks out near the entrance
//   step 1  Lumi is met (the Interact button): she shows a spark and a heart
//   step 2  the rose spark stone is brought to the Rose crystal (sparks bit 0): it lights, hums, and her tail glows pink. Chapter 1 is done.
//   step 3  the sky spark stone is brought (sparks bit 1)  \  milestone C5: the stones go in order, one then two then three; nothing here places
//   step 4  the gold spark stone is brought (sparks bit 2) /  them yet, so after step 2 the goal is only 'rest'
//   steps 5 to 7 (all lit, the Heart's light show, the story paid) are milestone C5's
// (this machine never lowers a step and never raises one past STEP.rest.)
//
// A stone she is CARRYING is never saved, and is never in the walk's mouth: it is back at its own spot on the next walk, whatever ends a walk (leaving, a
// teleport, a room, a reload). A step done by ANYONE in the room is credited the same way (credit(): every step before it is taken in order). normalize()
// repairs whatever an old build, a merge or a hostile save leaves. Nothing here can fail her: no failure event exists.
// =============================================================================

export const STEP = Object.freeze({ unmet: 0, met: 1, rose: 2, sky: 3, gold: 4, lit: 5, show: 6, done: 7, rest: 7 });
export const STONE_COUNT = 3;
export const STONE_STEP = Object.freeze([2, 3, 4]); // the step a stone's delivery lands on
export const SPARKS_AT = Object.freeze([0, 0, 1, 3, 7, 7, 7, 7]); // the table the sanitiser holds (test/crystalmission.test.js pins the two)

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);

// A well-formed { step, sparks } from any input. Pure; idempotent. A stone bit with no step is the step it implies.
export function normalize(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  let step = int(r.step, 0, 7);
  const bits = int(r.sparks, 0, 7);
  if (bits & 1) step = Math.max(step, STEP.rose);
  if ((bits & 3) === 3) step = Math.max(step, STEP.sky);
  if ((bits & 7) === 7) step = Math.max(step, STEP.gold);
  return { step, sparks: bits | SPARKS_AT[step] };
}

export const met = (rec) => normalize(rec).step >= STEP.met;
export const stoneBrought = (rec, i) => (normalize(rec).sparks & (1 << i)) !== 0;
export const chapterOneDone = (rec) => normalize(rec).step >= STEP.rose;

// Which stone Lumi is waiting for: 0, 1 or 2, or -1 (not met yet, or all three are in).
export function wantedStone(rec) {
  const { step } = normalize(rec);
  return step >= STEP.met && step <= STEP.sky ? step - 1 : -1;
}

const LADDER = Object.freeze([
  Object.freeze({ kind: 'meet' }), Object.freeze({ kind: 'bring', stone: 0 }), Object.freeze({ kind: 'bring', stone: 1 }), Object.freeze({ kind: 'bring', stone: 2 }),
]);
const rungOf = (ev) => LADDER.findIndex((e) => e.kind === ev.kind && e.stone === ev.stone);
const STONE_EFFECT = Object.freeze(['rose', 'sky', 'gold']);

// The next record after an event; `rec` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'meet' } (she said hello), { kind: 'bring', stone: 0 | 1 | 2 } (a stone was set on its crystal). Anything else, a stone out of order, a
// stone before Lumi is met: no change. effect: 'met' | 'rose' | 'sky' | 'gold' | null.
export function apply(rec, ev) {
  const cur = normalize(rec);
  const base = rec && typeof rec === 'object' ? rec : {};
  const none = { crystal: { ...base, ...cur }, changed: false, effect: null };
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  if (kind === 'meet') return cur.step >= STEP.met ? none : { crystal: { ...base, step: STEP.met, sparks: cur.sparks }, changed: true, effect: 'met' };
  if (kind === 'bring' && (ev.stone === 0 || ev.stone === 1 || ev.stone === 2)) {
    if (wantedStone(cur) !== ev.stone) return none;
    const step = STONE_STEP[ev.stone];
    return { crystal: { ...base, step, sparks: cur.sparks | (1 << ev.stone) | SPARKS_AT[step] }, changed: true, effect: STONE_EFFECT[ev.stone] };
  }
  return none;
}

// A step done by someone else in the room: a step she is past changes nothing; one she has not reached is taken in order after every step before it.
export function credit(rec, ev) {
  const first = apply(rec, ev);
  if (first.changed || !ev || typeof ev !== 'object') return first;
  const rung = rungOf(ev);
  if (rung < 0) return first;
  let cur = rec;
  let last = null;
  for (let i = 0; i <= rung; i++) {
    const r = apply(cur, LADDER[i]);
    if (r.changed) { cur = r.crystal; last = r; }
  }
  return last ?? first;
}

// The one thing to do next, for the picture bubble and the meow's ring. { kind, stone?, icon }:
//   'lumi' (say hello), 'stone' (find stone `stone`), 'deliver' (carry it to its crystal), 'rest' (nothing more yet).
// `carrying`: the stone in her mouth (0, 1, 2) or null. Pictures only: a spark and a heart, never text.
export const ICON = Object.freeze({ lumi: 'heart', stone: 'spark', deliver: 'heart', rest: 'heart' });
export function nextGoal(rec, carrying = null) {
  const { step } = normalize(rec);
  const want = wantedStone(rec);
  if (step < STEP.met) return { kind: 'lumi', icon: ICON.lumi };
  if (want >= 0) return carrying === want ? { kind: 'deliver', stone: want, icon: ICON.deliver } : { kind: 'stone', stone: want, icon: ICON.stone };
  return { kind: 'rest', icon: ICON.rest };
}

// A stone may be picked up when it is the one Lumi wants and her mouth is empty (no fail, no stuck state).
export const canPick = (rec, stone, carrying = null) => carrying === null && wantedStone(rec) === stone;
