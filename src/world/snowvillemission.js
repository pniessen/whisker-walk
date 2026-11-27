// =============================================================================
// SNOWVILLE'S MISSION: THE PURE STEP MACHINE (milestone V2: chapter 1, steps 0 to 2; the later steps use the same ladder). No THREE, no clock, no random number, no save
// write: it takes the `state.snowville` record and an event and answers the next record; world/snowvillelife.js carries it out on a walk and writes it back. Modelled on
// src/crystalmission.js (the Cave's Lumi).
//
// WHAT IS SAVED (state.snowville.step 0 to 7, state.snowville.candles 3 bits; src/progression.js's sanitiser derives the candles from the step; the album is another key):
//   step 0  nothing yet: the snow hare apprentice waits by the court
//   step 1  she is met (the Interact button): she shows a picture of a lit lantern
//   step 2  candle one (the glint in the baker's window box) is carried to the Square lantern (candles bit 0): it lights. Chapter 1 is done.
//   step 3  candle two is carried to the Pond lantern (bit 1)       (milestone V5)
//   step 4  candle three is carried to the Hill lantern (bit 2)     (milestone V5)
//   steps 5 to 7: warm up, the glow, the story pays                  (milestone V5)
// (this machine never lowers a step and never raises one past STEP.rest.)
//
// A candle she is CARRYING is never saved, and is never in the walk's mouth: it is back at its own spot on the next walk, whatever ends a walk. A step done by ANYONE in the
// room is credited the same way (credit(): every step before it is taken in order). normalize() repairs whatever an old build, a merge or a hostile save leaves. Nothing here
// can fail her: no failure event exists.
// =============================================================================

export const STEP = Object.freeze({ unmet: 0, met: 1, first: 2, second: 3, third: 4, warm: 5, glow: 6, done: 7, rest: 7 });
export const CANDLE_COUNT = 3;
export const CANDLE_STEP = Object.freeze([2, 3, 4]); // the step a candle's lantern lands on
export const CANDLES_AT = Object.freeze([0, 0, 1, 3, 7, 7, 7, 7]); // the table the sanitiser holds (test/snowvillemission.test.js pins the two)

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);

// A well-formed { step, candles } from any input. Pure; idempotent. A candle bit with no step is the step it implies.
export function normalize(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  let step = int(r.step, 0, 7);
  const bits = int(r.candles, 0, 7);
  if (bits & 1) step = Math.max(step, STEP.first);
  if ((bits & 3) === 3) step = Math.max(step, STEP.second);
  if ((bits & 7) === 7) step = Math.max(step, STEP.third);
  return { step, candles: bits | CANDLES_AT[step] };
}

export const met = (rec) => normalize(rec).step >= STEP.met;
export const candleLit = (rec, i) => (normalize(rec).candles & (1 << i)) !== 0;
export const chapterOneDone = (rec) => normalize(rec).step >= STEP.first;

// Which candle Tilly is waiting for: 0, 1 or 2, or -1 (not met yet, or all three are lit).
export function wantedCandle(rec) {
  const { step } = normalize(rec);
  return step >= STEP.met && step <= STEP.second ? step - 1 : -1;
}

const LADDER = Object.freeze([Object.freeze({ kind: 'meet' }), ...[0, 1, 2].map((candle) => Object.freeze({ kind: 'light', candle }))]);
const rungOf = (ev) => LADDER.findIndex((e) => e.kind === ev.kind && e.candle === ev.candle);

// The next record after an event; `rec` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'meet' } (she said hello), { kind: 'light', candle: 0 | 1 | 2 } (a candle was set in its lantern). Anything else, a candle out of order, a candle before
// Tilly is met: no change. effect: 'met' | 'first' | 'second' | 'third' | null.
export function apply(rec, ev) {
  const cur = normalize(rec);
  const base = rec && typeof rec === 'object' ? rec : {};
  const none = { snowville: { ...base, ...cur }, changed: false, effect: null };
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  if (kind === 'meet') return cur.step >= STEP.met ? none : { snowville: { ...base, step: STEP.met, candles: cur.candles }, changed: true, effect: 'met' };
  if (kind === 'light' && (ev.candle === 0 || ev.candle === 1 || ev.candle === 2)) {
    if (wantedCandle(cur) !== ev.candle) return none;
    const step = CANDLE_STEP[ev.candle];
    return { snowville: { ...base, step, candles: cur.candles | (1 << ev.candle) | CANDLES_AT[step] }, changed: true, effect: ['first', 'second', 'third'][ev.candle] };
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
    if (r.changed) { cur = r.snowville; last = r; }
  }
  return last ?? first;
}

// The one thing to do next, for the picture bubble and the meow's ring. { kind, candle?, icon }:
//   'tilly' (say hello), 'candle' (find candle `candle`), 'deliver' (carry it to its lantern), 'rest' (nothing more to do yet).
// `carrying`: the candle in her mouth (0, 1, 2) or null. Pictures only, never text.
export const ICON = Object.freeze({ tilly: 'lantern', candle: 'spark', deliver: 'lantern', rest: 'heart' });
export function nextGoal(rec, carrying = null) {
  const { step } = normalize(rec);
  const want = wantedCandle(rec);
  if (step < STEP.met) return { kind: 'tilly', icon: ICON.tilly };
  if (want >= 0) return carrying === want ? { kind: 'deliver', candle: want, icon: ICON.deliver } : { kind: 'candle', candle: want, icon: ICON.candle };
  return { kind: 'rest', icon: ICON.rest };
}

// A candle may be picked up when it is the one Tilly wants and her mouth is empty (no fail, no stuck state).
export const canPick = (rec, candle, carrying = null) => carrying === null && wantedCandle(rec) === candle;

// The wire form of a step (the one place that reads a partner's event, `sv-` events only): { kind: 'sv-meet' } or { kind: 'sv-light', candle }; anything else is nothing.
export const wire = (step) => (step.kind === 'meet' ? { kind: 'sv-meet' } : { kind: 'sv-light', candle: step.candle });
export function toStep(ev) {
  if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'string') return null;
  if (ev.kind === 'sv-meet') return { kind: 'meet' };
  if (ev.kind === 'sv-light' && (ev.candle === 0 || ev.candle === 1 || ev.candle === 2)) return { kind: 'light', candle: ev.candle };
  return null;
}
