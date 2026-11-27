// =============================================================================
// THE JUNGLE LODGE'S MISSION: THE PURE STEP MACHINE (milestone J2: chapter 1, steps 0 to 2; the later steps use the same ladder). No THREE, no clock, no random number, no save
// write: it takes the `state.jungle` record and an event and answers the next record; world/junglelife.js carries it out on a walk and writes it back. Modelled on
// src/world/snowvillemission.js (and the Treehouse's Nutmeg).
//
// WHAT IS SAVED (state.jungle.step 0 to 7, state.jungle.fruit 3 bits; src/progression.js's sanitiser derives the fruit from the step; the album is another key):
//   step 0  nothing yet: Mossy, the old tortoise who keeps the lodge, waits on the veranda
//   step 1  she is met (the Interact button): she shows a picture of a supper table and fruit
//   step 2  the mango (under the mango tree in the grove) is carried to the kitchen table on the veranda (fruit bit 0): the table glows. Chapter 1 is done.
//   step 3  the banana bunch is carried across the log bridge and back to the table (bit 1)      (milestone J5)
//   step 4  the cacao pod from the low branch is carried to the table (bit 2)                     (milestone J5)
//   step 5  the table is set (event 'set': Interact at the kitchen table, plates and cloth out, the lights come on along the log bridge and the eave)
//   step 6  the Rain Supper begins (event 'supper': the 20-second show, world/junglesupper.js; it can be seen again whenever she likes)
//   step 7  the supper reaches its pay moment (event 'done'): junglestory pays once and Mossy gives the Rain Lily Charm. The story is over.
// (this machine never lowers a step and never raises one past STEP.rest.)
//
// A fruit she is CARRYING is never saved, and is never in the walk's mouth: it is back where it grew on the next walk, whatever ends a walk. A step done by ANYONE in the
// room is credited the same way (credit(): every step before it is taken in order). normalize() repairs whatever an old build, a merge or a hostile save leaves. Nothing here
// can fail her: no failure event exists.
// =============================================================================

export const STEP = Object.freeze({ unmet: 0, met: 1, first: 2, second: 3, third: 4, set: 5, supper: 6, done: 7, rest: 7 });
export const FRUIT_COUNT = 3;
export const FRUIT_STEP = Object.freeze([2, 3, 4]); // the step a fruit's delivery lands on
export const FRUIT_AT = Object.freeze([0, 0, 1, 3, 7, 7, 7, 7]); // the table the sanitiser holds (test/junglemission.test.js pins the two)

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);

// A well-formed { step, fruit } from any input. Pure; idempotent. A fruit bit with no step is the step it implies.
export function normalize(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  let step = int(r.step, 0, 7);
  const bits = int(r.fruit, 0, 7);
  if (bits & 1) step = Math.max(step, STEP.first);
  if ((bits & 3) === 3) step = Math.max(step, STEP.second);
  if ((bits & 7) === 7) step = Math.max(step, STEP.third);
  return { step, fruit: bits | FRUIT_AT[step] };
}

export const met = (rec) => normalize(rec).step >= STEP.met;
export const delivered = (rec, i) => (normalize(rec).fruit & (1 << i)) !== 0;
export const chapterOneDone = (rec) => normalize(rec).step >= STEP.first;

// Which fruit Mossy is waiting to see delivered: 0, 1 or 2, or -1 (not met yet, or all three are delivered).
export function wantedFruit(rec) {
  const { step } = normalize(rec);
  return step >= STEP.met && step <= STEP.second ? step - 1 : -1;
}

const LADDER = Object.freeze([Object.freeze({ kind: 'meet' }), ...[0, 1, 2].map((fruit) => Object.freeze({ kind: 'deliver', fruit })), ...['set', 'supper', 'done'].map((kind) => Object.freeze({ kind }))]);
const rungOf = (ev) => LADDER.findIndex((e) => e.kind === ev.kind && e.fruit === ev.fruit);

// The next record after an event; `rec` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'meet' } (she said hello), { kind: 'deliver', fruit: 0 | 1 | 2 } (a fruit was set down on the table). Anything else, a fruit out of order, a fruit
// before Mossy is met: no change. Also { kind: 'set' } (the table), { kind: 'supper' } (the supper began) and { kind: 'done' } (its pay moment), each only in its turn.
// effect: 'met' | 'first' | 'second' | 'third' | 'set' | 'supper' | 'done' | null.
export function apply(rec, ev) {
  const cur = normalize(rec);
  const base = rec && typeof rec === 'object' ? rec : {};
  const none = { jungle: { ...base, ...cur }, changed: false, effect: null };
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  if (kind === 'meet') return cur.step >= STEP.met ? none : { jungle: { ...base, step: STEP.met, fruit: cur.fruit }, changed: true, effect: 'met' };
  if (kind === 'deliver' && (ev.fruit === 0 || ev.fruit === 1 || ev.fruit === 2)) {
    if (wantedFruit(cur) !== ev.fruit) return none;
    const step = FRUIT_STEP[ev.fruit];
    return { jungle: { ...base, step, fruit: cur.fruit | (1 << ev.fruit) | FRUIT_AT[step] }, changed: true, effect: ['first', 'second', 'third'][ev.fruit] };
  }
  const to = { set: [STEP.third, STEP.set], supper: [STEP.set, STEP.supper], done: [STEP.supper, STEP.done] }[kind];
  if (to && cur.step === to[0]) return { jungle: { ...base, step: to[1], fruit: cur.fruit | FRUIT_AT[to[1]] }, changed: true, effect: kind };
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
    if (r.changed) { cur = r.jungle; last = r; }
  }
  return last ?? first;
}

// The one thing to do next, for the picture bubble and the meow's ring. { kind, fruit?, icon }:
//   'mossy' (say hello), 'fruit' (fetch fruit `fruit`), 'deliver' (carry it to the table), 'set' (set the table), 'supper' (begin the supper), 'rest' (nothing more to do).
// `carrying`: the fruit in her mouth (0, 1, 2) or null. Pictures only, never text.
export const ICON = Object.freeze({ mossy: 'fruit', fruit: 'fruit', deliver: 'table', set: 'table', supper: 'spark', rest: 'heart' });
export function nextGoal(rec, carrying = null) {
  const { step } = normalize(rec);
  const want = wantedFruit(rec);
  if (step < STEP.met) return { kind: 'mossy', icon: ICON.mossy };
  if (want >= 0) return carrying === want ? { kind: 'deliver', fruit: want, icon: ICON.deliver } : { kind: 'fruit', fruit: want, icon: ICON.fruit };
  if (step === STEP.third) return { kind: 'set', icon: ICON.set };
  if (step === STEP.set || step === STEP.supper) return { kind: 'supper', icon: ICON.supper };
  return { kind: 'rest', icon: ICON.rest };
}

// A fruit may be picked up when it is the one Mossy wants and her mouth is empty (no fail, no stuck state).
export const canPick = (rec, fruit, carrying = null) => carrying === null && wantedFruit(rec) === fruit;

// The wire form of a step (the one place that reads a partner's event, `jl-` events only): { kind: 'jl-meet' }, { kind: 'jl-set' } or { kind: 'jl-deliver', fruit }; the supper goes as
// { kind: 'jl-supper', elapsed } (world/junglewinglive.js); anything else is nothing.
export const wire = (step) => (step.kind === 'meet' ? { kind: 'jl-meet' } : step.kind === 'set' ? { kind: 'jl-set' } : { kind: 'jl-deliver', fruit: step.fruit });
export function toStep(ev) {
  if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'string') return null;
  if (ev.kind === 'jl-meet') return { kind: 'meet' };
  if (ev.kind === 'jl-set') return { kind: 'set' };
  if (ev.kind === 'jl-deliver' && (ev.fruit === 0 || ev.fruit === 1 || ev.fruit === 2)) return { kind: 'deliver', fruit: ev.fruit };
  return null;
}
