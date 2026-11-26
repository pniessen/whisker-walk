// =============================================================================
// THE REEF'S MISSION: THE PURE STEP MACHINE (milestones R2 and R5: chapter 1 "Shallows", chapters 2 and 3 "Coral Garden" and "Housewarming"). No THREE, no clock, no random number, no save write: it takes
// the `state.reef` record and an event and answers the next record; world/reefmarlo.js carries it out on a walk and writes it back.
//
// WHAT IS SAVED (state.reef.step 0 to 7, state.reef.shells 3 bits; src/progression.js's sanitiser derives the shells from the step):
//   step 0  nothing yet: Marlo waves on the sand by the ladder
//   step 1  Marlo is met (the Interact button): he shows his cracked shell and the picture of a new one
//   step 2  shell one is brought: the too-small shell from the Kelp Garden (shells bit 0). He sighs.
//   step 3  shell two is brought: the too-big shell from the coral ledge, reached only by floating (shells bit 1). Chapter 1 is done.
//   step 4  shell three is brought: the just-right shell from the shallow cave behind the coral, ringed by an air pocket (shells bit 2)
//   step 5  tried on: Marlo steps into it (the walk does this by itself a moment after the shell is given); his old shell is a sea snail's home
//   step 6  the coral is lit: the three lantern corals touched in order (which lantern she is on is NOT saved: a new walk starts them again)
//   step 7  the parade has passed (the manta, Sela the turtle and the shoal, 20 s, shared in a room): `reefstory` pays 40 paws once, and the pearl is given
// (this machine never lowers a step and never raises one past STEP.rest.)
//
// The shells go in order (one, then two), so the sanitiser's step-to-shells rule and this machine agree and a merge of two devices never
// leaves a shell without its step. A shell she is CARRYING is never saved: it is back at its own spot on the next walk, whatever ends a walk.
// A step done by ANYONE in the room is credited the same way (credit(): every step before it is taken in order, so two partners meet in the middle). normalize() repairs whatever an old build, a merge or a hostile save
// leaves, so there is always a next goal and no stuck state. Nothing here can fail her.
// =============================================================================

export const STEP = Object.freeze({ unmet: 0, met: 1, small: 2, big: 3, third: 4, tried: 5, lit: 6, done: 7, rest: 7 }); // `rest`: where the story stops
export const SHELL_COUNT = 3;
export const SHELL_STEP = Object.freeze([2, 3, 4]); // the step a shell's delivery lands on
export const SHELLS_AT = Object.freeze([0, 0, 1, 3, 7, 7, 7, 7]); // the same table the sanitiser holds (test/reefmission.test.js pins the two)
export const LANTERN_COUNT = 3;

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);

// A well-formed { step, shells } from any input. Pure; idempotent. A shell bit with no step is the step it implies (a shell was brought, so Marlo was met).
export function normalize(reef) {
  const r = reef && typeof reef === 'object' ? reef : {};
  let step = int(r.step, 0, 7);
  const bits = int(r.shells, 0, 7);
  if (bits & 1) step = Math.max(step, STEP.small);
  if ((bits & 3) === 3) step = Math.max(step, STEP.big);
  if ((bits & 7) === 7) step = Math.max(step, STEP.third);
  return { step, shells: bits | SHELLS_AT[step] };
}

export const met = (reef) => normalize(reef).step >= STEP.met;
export const shellBrought = (reef, i) => (normalize(reef).shells & (1 << i)) !== 0;
export const chapterOneDone = (reef) => normalize(reef).step >= STEP.big;
export const housewarmingDone = (reef) => normalize(reef).step >= STEP.done;

// Which shell is Marlo waiting for: 0, 1 or 2, or -1 (not met yet, or all three are in).
export function wantedShell(reef) {
  const { step } = normalize(reef);
  return step >= STEP.met && step <= STEP.big ? step - 1 : -1;
}

// The lantern corals, touched in order: the next number lit after she touches lantern `i` with `lit` already glowing. Out of order, again, or nonsense: no change.
export function lanternTouch(lit, i) {
  const n = Number.isInteger(lit) && lit >= 0 ? Math.min(lit, LANTERN_COUNT) : 0;
  return i === n && n < LANTERN_COUNT ? n + 1 : n;
}
export const lanternsLit = (lit) => (Number.isInteger(lit) ? lit : 0) >= LANTERN_COUNT;

// The events, in the order the story takes them (credit() walks this ladder).
const LADDER = Object.freeze([
  Object.freeze({ kind: 'meet' }), Object.freeze({ kind: 'bring', shell: 0 }), Object.freeze({ kind: 'bring', shell: 1 }), Object.freeze({ kind: 'bring', shell: 2 }),
  Object.freeze({ kind: 'tryon' }), Object.freeze({ kind: 'lit' }), Object.freeze({ kind: 'parade' }),
]);
const rungOf = (ev) => LADDER.findIndex((e) => e.kind === ev.kind && e.shell === ev.shell);
const EFFECT = Object.freeze({ meet: 'met', tryon: 'tried', lit: 'lit', parade: 'parade' });
const SHELL_EFFECT = Object.freeze(['small', 'big', 'third']);

// The next record after an event; `reef` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'meet' } (she said hello), { kind: 'bring', shell: 0 | 1 | 2 } (a shell was given to Marlo), { kind: 'tryon' } (he stepped into shell three),
// { kind: 'lit' } (the third lantern coral is touched), { kind: 'parade' } (the parade has reached its pay moment). Anything else, a step out of order, a step
// before Marlo is met: no change. effect: 'met' | 'small' | 'big' | 'third' | 'tried' | 'lit' | 'parade' | null.
export function apply(reef, ev) {
  const cur = normalize(reef);
  const base = reef && typeof reef === 'object' ? reef : {};
  const none = { reef: { ...base, ...cur }, changed: false, effect: null };
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  const to = (step, effect) => ({ reef: { ...base, step, shells: cur.shells | SHELLS_AT[step] }, changed: true, effect });
  if (kind === 'meet') return cur.step >= STEP.met ? none : to(STEP.met, 'met');
  if (kind === 'bring' && (ev.shell === 0 || ev.shell === 1 || ev.shell === 2)) {
    if (wantedShell(cur) !== ev.shell) return none;
    const step = SHELL_STEP[ev.shell];
    return { reef: { ...base, step, shells: cur.shells | (1 << ev.shell) | SHELLS_AT[step] }, changed: true, effect: SHELL_EFFECT[ev.shell] };
  }
  if (kind === 'tryon') return cur.step === STEP.third ? to(STEP.tried, EFFECT.tryon) : none;
  if (kind === 'lit') return cur.step === STEP.tried ? to(STEP.lit, EFFECT.lit) : none;
  if (kind === 'parade') return cur.step === STEP.lit ? to(STEP.done, EFFECT.parade) : none;
  return none;
}

// A step done by someone else in the room: a step she is past changes nothing; one she has not reached is taken in order after every step before it, so two
// partners finishing different steps meet in the middle without a gap.
export function credit(reef, ev) {
  const first = apply(reef, ev);
  if (first.changed || !ev || typeof ev !== 'object') return first;
  const rung = rungOf(ev);
  if (rung < 0) return first;
  let cur = reef;
  let last = null;
  for (let i = 0; i <= rung; i++) {
    const r = apply(cur, LADDER[i]);
    if (r.changed) { cur = r.reef; last = r; }
  }
  return last ?? first;
}

// The one thing to do next, for the picture bubble, the meow's ring and the board. { kind, shell?, lantern?, icon }:
//   'marlo' (say hello), 'shell' (find shell `shell`), 'deliver' (carry it to Marlo), 'tryon' (he is trying it on), 'lantern' (touch lantern `lantern`),
//   'parade' (the housewarming is ready), 'rest' (the story is done).
// `carrying`: the shell in her mouth (0, 1, 2) or null. `lit`: how many lantern corals glow on this walk.
export const ICON = Object.freeze({ marlo: 'question', shell: 'shell', deliver: 'heart', tryon: 'heart', lantern: 'question', parade: 'heart', rest: 'heart' });
export function nextGoal(reef, carrying = null, lit = 0) {
  const { step } = normalize(reef);
  const want = wantedShell(reef);
  if (step < STEP.met) return { kind: 'marlo', icon: ICON.marlo };
  if (want >= 0) return carrying === want ? { kind: 'deliver', shell: want, icon: ICON.deliver } : { kind: 'shell', shell: want, icon: ICON.shell };
  if (step === STEP.third) return { kind: 'tryon', icon: ICON.tryon };
  if (step === STEP.tried) return { kind: 'lantern', lantern: Math.min(LANTERN_COUNT - 1, Math.max(0, int(lit, 0, LANTERN_COUNT))), icon: ICON.lantern };
  if (step === STEP.lit) return { kind: 'parade', icon: ICON.parade };
  return { kind: 'rest', icon: ICON.rest };
}

// A shell may be picked up when it is the one Marlo wants and her mouth is empty (the other shells are looked at, not taken): no fail, no stuck state.
export const canPick = (reef, shell, carrying = null) => carrying === null && wantedShell(reef) === shell;
// The float it takes to reach a shell's spot (metres over the seabed): the plan's ledge is reached only by floating.
export function reachable({ minLift = 0, maxLift = Infinity }, lift) {
  const l = Number.isFinite(lift) && lift > 0 ? lift : 0;
  return l >= minLift && l <= maxLift;
}
