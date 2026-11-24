// =============================================================================
// THE MOON'S MISSION: THE PURE STEP MACHINE (milestone 2: chapter 1, "Power"). No THREE, no clock, no random number, no
// save write: it takes the `state.moon` record and an event and answers the next record; world/moonbaselive.js carries it
// out on a walk and writes it back.
//
// WHAT IS SAVED (state.moon.step, state.moon.cells; src/progression.js sanitises both):
//   step 0  nothing yet: Pip is asleep by the lander
//   step 1  Pip is awake (the Interact button woke him)
//   step 2  one power cell is in the Core (cells bit 0 = the Ridge cell, bit 1 = the Rover cell, either order)
//   step 3  both cells are in the Core, the wake-up beat not yet seen (it plays the next time she is near the dome)
//   step 4  the base is awake: lights, dome glow, the board lit. Chapter 1 is done.
//   step 5  (milestone 5, "Aim") Earth is found: the Mouse and the Cat are traced in the telescope on Star Hill (state.moon.scope bits 0 and 1;
//           the other three star pictures are for the finding and change no step). The Old Dish turns to Earth.
// (steps 6 to 8 are chapter 3's, milestone 6; this machine never lowers a step and never raises one past 5.)
// A cell she is CARRYING is never saved: an unplugged cell is always back at its own spot on the next walk.
//
// ANY ORDER: Pip first, then the two cells in either order, then the Core. normalize() repairs whatever a merge of two
// devices, an old build or a hostile save leaves (a cell in the Core with Pip asleep is Pip awake; step 4 is both cells in), so
// there is always a next goal and no stuck state. A step done by ANYONE in the room is credited the same way (credit()).
// =============================================================================

export const STEP = Object.freeze({ asleep: 0, pip: 1, one: 2, both: 3, awake: 4, aimed: 5 });
export const STORY_SCOPE = 3; // scope bits 0 and 1: the Mouse and the Cat
export const CELLS = Object.freeze([Object.freeze({ id: 0, name: 'ridge' }), Object.freeze({ id: 1, name: 'rover' })]);
export const CELL_BITS = 3;

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);
const bits = (n) => (n & 1) + ((n >> 1) & 1);

// A well-formed record from any input. Pure; idempotent (normalize(normalize(x)) equals normalize(x)).
export function normalize(moon) {
  const m = moon && typeof moon === 'object' ? moon : {};
  let step = int(m.step, 0, 9);
  let cells = int(m.cells, 0, 7); // bits 0 and 1 are this chapter's two cells; bit 2 is the Deep Cell's (chapter 4), kept as it is
  if (step >= STEP.awake) cells |= CELL_BITS; // the base is awake: both cells are in
  else {
    const n = bits(cells & CELL_BITS);
    if (n > 0) step = Math.max(step, n === 2 ? STEP.both : STEP.one); // a cell in the Core means Pip is awake
  }
  return { step, cells };
}

export const pipAwake = (moon) => normalize(moon).step >= STEP.pip;
export const baseAwake = (moon) => normalize(moon).step >= STEP.awake;
export const cellIn = (moon, id) => (normalize(moon).cells & (1 << id)) !== 0;
export const scopeBits = (moon) => (Number.isInteger(moon?.scope) && moon.scope >= 0 ? moon.scope & 31 : 0);
export const storyTraced = (moon) => (scopeBits(moon) & STORY_SCOPE) === STORY_SCOPE;
export const earthFound = (moon) => normalize(moon).step >= STEP.aimed;

// The next record after an event; `moon` itself is never touched and the other keys of the save record come back as they were.
// events: { kind: 'wake' } (Pip woke), { kind: 'plug', cell: 0 | 1 } (a cell went into the Core), { kind: 'beat' } (the wake-up
// beat was seen). Anything else, a cell that does not exist, a plug before Pip is awake: no change (changed false).
export function apply(moon, ev) {
  const cur = normalize(moon);
  const base = moon && typeof moon === 'object' ? moon : {};
  let { step, cells } = cur;
  let scope = scopeBits(base);
  const kind = ev && typeof ev === 'object' ? ev.kind : null;
  if (kind === 'wake') {
    if (step < STEP.pip) step = STEP.pip;
  } else if (kind === 'plug' && (ev.cell === 0 || ev.cell === 1)) {
    if (step < STEP.pip) return { moon: { ...base, ...cur }, changed: false, effect: null };
    cells |= 1 << ev.cell;
  } else if (kind === 'beat') {
    if (step === STEP.both) step = STEP.awake;
  } else if (kind === 'trace' && Number.isInteger(ev.id) && ev.id >= 0 && ev.id < 5) {
    scope |= 1 << ev.id; // a star picture traced (any time: the stars are free to everyone)
  } else if (kind === 'aim') {
    // nothing to add: the lift below does it when the base is awake and the Mouse and the Cat are traced
  } else {
    return { moon: { ...base, ...cur }, changed: false, effect: null };
  }
  const next = normalize({ step, cells });
  if (next.step === STEP.awake && (scope & STORY_SCOPE) === STORY_SCOPE) next.step = STEP.aimed; // the base is awake and Earth was found in the stars
  const was = scopeBits(base);
  const changed = next.step !== cur.step || next.cells !== cur.cells || scope !== was;
  const effect = !changed ? null
    : kind === 'trace' ? (next.step === STEP.aimed && cur.step < STEP.aimed ? 'earth' : 'trace')
    : kind === 'aim' ? 'earth'
    : kind === 'wake' ? 'wake' : kind === 'plug' ? (next.step === STEP.both ? 'both' : 'plug') : next.step === STEP.aimed ? 'aimed' : 'awake';
  return { moon: { ...base, ...next, ...(scope || 'scope' in base ? { scope } : {}) }, changed, effect };
}

// A step done by anyone in the room, as the Market's treat teamwork credits the partner: the same events, from the wire. A hostile or
// future event (an unknown kind, a cell that is not 0 or 1, a prototype key) is ignored. Pure.
export function credit(moon, ev) {
  if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'string') return apply(moon, null);
  if (ev.kind === 'wake') return apply(moon, { kind: 'wake' });
  if (ev.kind === 'plug' && (ev.cell === 0 || ev.cell === 1)) return apply(moon, { kind: 'plug', cell: ev.cell });
  return apply(moon, null);
}

// What the gold ring points at next: { kind: 'pip' | 'cell' | 'core' | 'scope' | 'done', cell? }. `carrying` is the cell in her mouth (0, 1) or
// null. Always answers; 'done' only when the base is awake or the wake-up beat is all that is left.
export function nextGoal(moon, carrying = null) {
  const cur = normalize(moon);
  if (cur.step < STEP.pip) return { kind: 'pip' };
  if (cur.step === STEP.awake) return { kind: 'scope' }; // the base is awake: the telescope on Star Hill is next
  if (cur.step >= STEP.both) return { kind: 'done' };
  if ((carrying === 0 || carrying === 1) && !(cur.cells & (1 << carrying))) return { kind: 'core', cell: carrying };
  const missing = CELLS.find((c) => !(cur.cells & (1 << c.id)));
  return missing ? { kind: 'cell', cell: missing.id } : { kind: 'done' };
}

// The board's four pictures, each done or not (the Mission Board draws them): Pip, the Ridge cell, the Rover cell, the base.
export function boardMarks(moon) {
  const cur = normalize(moon);
  return [cur.step >= STEP.pip, !!(cur.cells & 1), !!(cur.cells & 2), cur.step >= STEP.awake];
}
