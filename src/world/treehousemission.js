// =============================================================================
// THE TREEHOUSE'S MISSION: THE PURE STEP MACHINE (milestone T2: chapter 1, steps 0 to 2; the later steps use the same ladder). No THREE, no clock, no random number, no save
// write: it takes the `state.treehouse` record and an event and answers the next record; world/treehouselife.js carries it out on a walk and writes it back. Modelled on
// src/world/snowvillemission.js (and the Cave's Lumi).
//
// WHAT IS SAVED (state.treehouse.step 0 to 7, state.treehouse.letters 3 bits; src/progression.js's sanitiser derives the letters from the step; the album is another key):
//   step 0  nothing yet: the red squirrel postmistress waits by the post box at the roots
//   step 1  she is met (the Interact button): she shows a picture of a letter
//   step 2  letter one (in the post box) is carried up to the Bakery on the low deck (letters bit 0): its window lights. Chapter 1 is done.
//   step 3  letter two is carried to the Bookshop over the rope bridge (bit 1)      (milestone T5)
//   step 4  letter three is carried to the Bell Tower at the crown (bit 2)          (milestone T5)
//   steps 5 to 7: ring the bell, the firefly supper, the story pays                 (milestone T5)
// (this machine never lowers a step and never raises one past STEP.rest.)
//
// A letter she is CARRYING is never saved, and is never in the walk's mouth: it is back in the post box on the next walk, whatever ends a walk. A step done by ANYONE in the
// room is credited the same way (credit(): every step before it is taken in order). normalize() repairs whatever an old build, a merge or a hostile save leaves. Nothing here
// can fail her: no failure event exists.
// =============================================================================

export const STEP = Object.freeze({ unmet: 0, met: 1, first: 2, second: 3, third: 4, bell: 5, supper: 6, done: 7, rest: 7 });
export const LETTER_COUNT = 3;
export const LETTER_STEP = Object.freeze([2, 3, 4]); // the step a letter's house lands on
export const LETTERS_AT = Object.freeze([0, 0, 1, 3, 7, 7, 7, 7]); // the table the sanitiser holds (test/treehousemission.test.js pins the two)

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);

// A well-formed { step, letters } from any input. Pure; idempotent. A letter bit with no step is the step it implies.
export function normalize(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  let step = int(r.step, 0, 7);
  const bits = int(r.letters, 0, 7);
  if (bits & 1) step = Math.max(step, STEP.first);
  if ((bits & 3) === 3) step = Math.max(step, STEP.second);
  if ((bits & 7) === 7) step = Math.max(step, STEP.third);
  return { step, letters: bits | LETTERS_AT[step] };
}

export const met = (rec) => normalize(rec).step >= STEP.met;
export const delivered = (rec, i) => (normalize(rec).letters & (1 << i)) !== 0;
export const chapterOneDone = (rec) => normalize(rec).step >= STEP.first;

// Which letter the squirrel is waiting to see delivered: 0, 1 or 2, or -1 (not met yet, or all three are delivered).
export function wantedLetter(rec) {
  const { step } = normalize(rec);
  return step >= STEP.met && step <= STEP.second ? step - 1 : -1;
}

const LADDER = Object.freeze([Object.freeze({ kind: 'meet' }), ...[0, 1, 2].map((letter) => Object.freeze({ kind: 'deliver', letter }))]);
const rungOf = (ev) => LADDER.findIndex((e) => e.kind === ev.kind && e.letter === ev.letter);

// The next record after an event; `rec` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'meet' } (she said hello), { kind: 'deliver', letter: 0 | 1 | 2 } (a letter was set down at its house). Anything else, a letter out of order, a letter
// before the squirrel is met: no change. effect: 'met' | 'first' | 'second' | 'third' | null.
export function apply(rec, ev) {
  const cur = normalize(rec);
  const base = rec && typeof rec === 'object' ? rec : {};
  const none = { treehouse: { ...base, ...cur }, changed: false, effect: null };
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  if (kind === 'meet') return cur.step >= STEP.met ? none : { treehouse: { ...base, step: STEP.met, letters: cur.letters }, changed: true, effect: 'met' };
  if (kind === 'deliver' && (ev.letter === 0 || ev.letter === 1 || ev.letter === 2)) {
    if (wantedLetter(cur) !== ev.letter) return none;
    const step = LETTER_STEP[ev.letter];
    return { treehouse: { ...base, step, letters: cur.letters | (1 << ev.letter) | LETTERS_AT[step] }, changed: true, effect: ['first', 'second', 'third'][ev.letter] };
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
    if (r.changed) { cur = r.treehouse; last = r; }
  }
  return last ?? first;
}

// The one thing to do next, for the picture bubble and the meow's ring. { kind, letter?, icon }:
//   'nutmeg' (say hello), 'letter' (fetch letter `letter`), 'deliver' (carry it up to its house), 'rest' (nothing more to do yet).
// `carrying`: the letter in her mouth (0, 1, 2) or null. Pictures only, never text.
export const ICON = Object.freeze({ nutmeg: 'letter', letter: 'letter', deliver: 'house', rest: 'heart' });
export function nextGoal(rec, carrying = null) {
  const { step } = normalize(rec);
  const want = wantedLetter(rec);
  if (step < STEP.met) return { kind: 'nutmeg', icon: ICON.nutmeg };
  if (want >= 0) return carrying === want ? { kind: 'deliver', letter: want, icon: ICON.deliver } : { kind: 'letter', letter: want, icon: ICON.letter };
  return { kind: 'rest', icon: ICON.rest };
}

// A letter may be picked up when it is the one the squirrel wants and her mouth is empty (no fail, no stuck state).
export const canPick = (rec, letter, carrying = null) => carrying === null && wantedLetter(rec) === letter;

// The wire form of a step (the one place that reads a partner's event, `th-` events only): { kind: 'th-meet' } or { kind: 'th-deliver', letter }; anything else is nothing.
export const wire = (step) => (step.kind === 'meet' ? { kind: 'th-meet' } : { kind: 'th-deliver', letter: step.letter });
export function toStep(ev) {
  if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'string') return null;
  if (ev.kind === 'th-meet') return { kind: 'meet' };
  if (ev.kind === 'th-deliver' && (ev.letter === 0 || ev.letter === 1 || ev.letter === 2)) return { kind: 'deliver', letter: ev.letter };
  return null;
}
