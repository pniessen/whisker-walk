// The two things the cats do with each other (couch play, milestone 4), as small state
// machines with no page, no cat and no clock of their own: each is handed its dt, so
// each can be tested with a fake clock. Both are gentle: nobody is hurt, nobody loses.
//
//   grooming   cats close together, both standing still: either pad's D-pad Left starts it,
//              both groom for a few seconds; a step away or a push of a stick stops it.
//   pounce-tag a playful chase: a pounce that lands beside the friend tags it; the friend
//              pounces back within the window and that is a game of tag.
export const GROOM_NEAR = 1.8; // metres apart to start (and the most a groom may stretch to)
export const GROOM_STRETCH = 2.6;
export const GROOM_S = 2.5; // seconds of unbroken grooming
export const GROOM_CALM_S = 1; // seconds both cats have stood still before the hint shows
export const TAG_REACH = 1.3; // metres: a landing this close tags (the walk's own co-walk rule)
export const TAG_WINDOW_S = 30; // the friend has this long to pounce back

/** step(dt, { near, moving }) -> { active, done }. start(near, calm) begins one (true when it did). */
export function createGroom() {
  let on = false, t = 0;
  return {
    get active() { return on; },
    start(apart, calm = true) {
      if (on || !calm || !(apart <= GROOM_NEAR)) return false;
      on = true; t = 0;
      return true;
    },
    step(dt, { apart = 0, moving = false } = {}) {
      if (!on) return { active: false, done: false };
      if (moving || !(apart <= GROOM_STRETCH)) { on = false; t = 0; return { active: false, done: false }; }
      t += Math.max(dt, 0);
      if (t >= GROOM_S) { on = false; t = 0; return { active: false, done: true }; }
      return { active: true, done: false };
    },
    cancel() { on = false; t = 0; },
  };
}

/**
 * One chain between the two cats. land(slot, apart) is a landing of cat `slot` (0 or 1) `apart` metres from its friend:
 * 'start' (a tag: the friend is "it"), 'done' (the friend tagged back within the window), or null (too far).
 */
export function createTag() {
  let clock = 0, chain = null;
  return {
    get chain() { return chain; },
    tick(dt) { clock += Math.max(dt, 0); if (chain && clock - chain.at > TAG_WINDOW_S) chain = null; },
    land(slot, apart) {
      if (!(apart <= TAG_REACH)) return null;
      if (chain && chain.by !== slot) { chain = null; return 'done'; }
      chain = { by: slot, at: clock };
      return 'start';
    },
    reset() { chain = null; },
  };
}
