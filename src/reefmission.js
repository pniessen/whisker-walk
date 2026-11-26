// =============================================================================
// THE REEF'S MISSION: THE PURE STEP MACHINE (milestone R2: chapter 1, "Shallows"). No THREE, no clock, no random number, no save write: it takes
// the `state.reef` record and an event and answers the next record; world/reefmarlo.js carries it out on a walk and writes it back.
//
// WHAT IS SAVED (state.reef.step 0 to 7, state.reef.shells 3 bits; src/progression.js's sanitiser derives the shells from the step):
//   step 0  nothing yet: Marlo waves on the sand by the ladder
//   step 1  Marlo is met (the Interact button): he shows his cracked shell and the picture of a new one
//   step 2  shell one is brought: the too-small shell from the Kelp Garden (shells bit 0). He sighs.
//   step 3  shell two is brought: the too-big shell from the coral ledge, reached only by floating (shells bit 1). Chapter 1 is done.
//   steps 4 to 7 (milestone R5, stubbed here: the Coral Garden's just-right shell, trying it on, the lantern corals, the housewarming) are never
//   reached by this machine; a save that already holds them is kept as it is and Marlo is simply at home.
// (this machine never lowers a step and never raises one past STEP.rest.)
//
// The shells go in order (one, then two), so the sanitiser's step-to-shells rule and this machine agree and a merge of two devices never
// leaves a shell without its step. A shell she is CARRYING is never saved: it is back at its own spot on the next walk, whatever ends a walk.
// A step done by ANYONE in the room is credited the same way (credit()). normalize() repairs whatever an old build, a merge or a hostile save
// leaves, so there is always a next goal and no stuck state. Nothing here can fail her.
// =============================================================================

export const STEP = Object.freeze({ unmet: 0, met: 1, small: 2, big: 3, rest: 3 }); // `rest`: where this milestone's story stops (R5 adds the rest)
export const SHELL_COUNT = 3;
export const SHELL_STEP = Object.freeze([2, 3, 4]); // the step a shell's delivery lands on
export const SHELLS_AT = Object.freeze([0, 0, 1, 3, 7, 7, 7, 7]); // the same table the sanitiser holds (test/reefmission.test.js pins the two)

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);

// A well-formed { step, shells } from any input. Pure; idempotent. A shell bit with no step is the step it implies (a shell was brought, so Marlo was met).
export function normalize(reef) {
  const r = reef && typeof reef === 'object' ? reef : {};
  let step = int(r.step, 0, 7);
  const bits = int(r.shells, 0, 7);
  if (bits & 1) step = Math.max(step, STEP.small);
  if ((bits & 3) === 3) step = Math.max(step, STEP.big);
  return { step, shells: bits | SHELLS_AT[step] };
}

export const met = (reef) => normalize(reef).step >= STEP.met;
export const shellBrought = (reef, i) => (normalize(reef).shells & (1 << i)) !== 0;
export const chapterOneDone = (reef) => normalize(reef).step >= STEP.big;

// Which shell is Marlo waiting for: 0 or 1, or -1 (not met yet, or both are in; shell three is milestone R5's).
export function wantedShell(reef) {
  const { step } = normalize(reef);
  return step === STEP.met ? 0 : step === STEP.small ? 1 : -1;
}

// The next record after an event; `reef` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'meet' } (she said hello), { kind: 'bring', shell: 0 | 1 } (a shell was given to Marlo). Anything else, a shell out of order,
// a shell before Marlo is met, shell three (milestone R5): no change. effect: 'met' | 'small' | 'big' | null.
export function apply(reef, ev) {
  const cur = normalize(reef);
  const base = reef && typeof reef === 'object' ? reef : {};
  const none = { reef: { ...base, ...cur }, changed: false, effect: null };
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  if (kind === 'meet') {
    if (cur.step >= STEP.met) return none;
    return { reef: { ...base, step: STEP.met, shells: cur.shells }, changed: true, effect: 'met' };
  }
  if (kind === 'bring' && (ev.shell === 0 || ev.shell === 1)) {
    if (wantedShell(cur) !== ev.shell) return none;
    const step = SHELL_STEP[ev.shell];
    return { reef: { ...base, step, shells: cur.shells | (1 << ev.shell) | SHELLS_AT[step] }, changed: true, effect: ev.shell === 0 ? 'small' : 'big' };
  }
  return none;
}

// A step done by someone else in the room: a shell she is past (or a meeting already held) changes nothing; a step she has not reached is taken
// in order, so two partners finishing different shells meet in the middle without a gap.
export function credit(reef, ev) {
  const first = apply(reef, ev);
  if (first.changed || !ev || typeof ev !== 'object' || ev.kind !== 'bring' || (ev.shell !== 0 && ev.shell !== 1)) return first;
  let cur = apply(reef, { kind: 'meet' }).reef;
  if (ev.shell === 1) cur = apply(cur, { kind: 'bring', shell: 0 }).reef;
  const last = apply(cur, ev);
  return last.changed ? last : first;
}

// The one thing to do next, for the picture bubble, the meow's ring and the board. { kind, shell?, icon }:
//   'marlo' (say hello), 'shell' (find shell `shell`), 'deliver' (carry it to Marlo), 'rest' (chapter one is done; the rest is R5's).
// `carrying`: the shell in her mouth (0, 1) or null.
export const ICON = Object.freeze({ marlo: 'question', shell: 'shell', deliver: 'heart', rest: 'heart' });
export function nextGoal(reef, carrying = null) {
  const want = wantedShell(reef);
  if (!met(reef)) return { kind: 'marlo', icon: ICON.marlo };
  if (want < 0) return { kind: 'rest', icon: ICON.rest };
  if (carrying === want) return { kind: 'deliver', shell: want, icon: ICON.deliver };
  return { kind: 'shell', shell: want, icon: ICON.shell };
}

// A shell may be picked up when it is the one Marlo wants and her mouth is empty (the other shells are looked at, not taken): no fail, no stuck state.
export const canPick = (reef, shell, carrying = null) => carrying === null && wantedShell(reef) === shell;
// The float it takes to reach a shell's spot (metres over the seabed): the plan's ledge is reached only by floating.
export function reachable({ minLift = 0, maxLift = Infinity }, lift) {
  const l = Number.isFinite(lift) && lift > 0 ? lift : 0;
  return l >= minLift && l <= maxLift;
}
