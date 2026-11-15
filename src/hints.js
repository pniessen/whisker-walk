// Hints: one short line the first time something comes up (design section 4,
// .claude/plans/guided-first-walk-design.md, 2026-11-15). Plain logic: no
// DOM, no THREE, no network, no dice. The words are in tutorialwords.js
// (hint.<id>); the screen is whoever is handed in as show / hide.
//
// The rules:
//   - one hint at a time, never two;
//   - a hint goes away when the child does the thing, or after HINT_SHOW_S;
//   - at most one new hint every HINT_GAP_S;
//   - each hint is shown at most `max` times, counted on the save
//     (tutorial.hints), so a child is told once or twice and then left alone;
//   - none while a guided step is open (setBlocked, for the guided walk);
//   - none at all with "Show tips" off.
//
// A hint is offered in one of two ways. A POLLED hint has a `when(f)` over
// the facts the walk gathers a few times a second (game/tips.js builds them).
// An EVENT hint has none: the game offers it by name the moment the thing
// happens (offer(id, slots)). Either may have an `until(f)`: true once the
// child has done the thing, which puts the hint away early. done(id) does the
// same for a thing that is an event (a meow, a chat line).
//
// `ring` names the control the line is about, for the guided walk's ring
// (step 3 of the build); nothing here draws it.

export const HINT_SHOW_S = 12;
export const HINT_GAP_S = 60;
// The save keeps each count in 0..HINT_COUNT_MAX (progression.js cleans it).
export const HINT_COUNT_MAX = 3;

// "Walk two" in the design's table: any walk but the very first.
const later = (f) => f.walkNo >= 2;

export const HINTS = Object.freeze([
  { id: 'look', max: 2, ring: 'look', when: (f) => later(f) && f.t >= 15 && !f.looked, until: (f) => f.looked },
  { id: 'creep', max: 2, ring: 'move', until: (f) => f.stalking },
  { id: 'jump', max: 2, ring: 'pounce', when: (f) => f.canJump && !f.perched, until: (f) => f.perched },
  { id: 'hop', max: 1, ring: 'pounce', when: (f) => f.perched, until: (f) => !f.perched },
  { id: 'photo', max: 2, ring: 'camera', when: (f) => later(f) && f.critterNear && !f.camera, until: (f) => f.camera },
  { id: 'frame', max: 2, ring: null, when: (f) => f.camera, until: (f) => !f.camera },
  { id: 'yarn', max: 1, ring: 'yarn', when: (f) => later(f) && f.idleOpen >= 5 && !f.toy, until: (f) => f.toy },
  { id: 'bat', max: 1, ring: null, when: (f) => f.toy && f.bats === 0, until: (f) => !f.toy || f.bats > 0 },
  { id: 'call', max: 1, ring: 'meow', when: (f) => later(f) && f.strayFar },
  { id: 'sniff', max: 2, ring: null },
  { id: 'box', max: 1, ring: null, when: (f) => f.nearBox && !f.inBox, until: (f) => f.inBox },
  { id: 'help', max: 1, ring: 'prompt', when: (f) => f.helpInView, until: (f) => !f.helpInView },
  { id: 'hiss', max: 1, ring: null },
  { id: 'dog', max: 1, ring: null },
  { id: 'swim', max: 1, ring: null, when: (f) => f.inWater, until: (f) => !f.inWater },
  { id: 'carry', max: 1, ring: null, when: (f) => f.carrying, until: (f) => !f.carrying },
  { id: 'home', max: 2, ring: 'pause', when: (f) => later(f) && f.t >= 90 },
  { id: 'chat', max: 1, ring: 'chat', when: (f) => f.room && f.t >= 20 },
  { id: 'rival', max: 1, ring: null },
  { id: 'stranger', max: 1, ring: null, when: (f) => f.challenge, until: (f) => !f.challenge },
].map((h) => Object.freeze(h)));

export const HINT_IDS = Object.freeze(HINTS.map((h) => h.id));
const BY_ID = new Map(HINTS.map((h) => [h.id, h]));

export function hintMax(id) {
  return BY_ID.get(id)?.max ?? 0;
}

// createHints({ count, countUp, enabled, show, hide })
//   count(id)      -> times this hint has been shown (the save's number)
//   countUp(id)    -> called once each time a hint goes up
//   enabled()      -> false with "Show tips" off
//   show({ id, ring, slots }), hide()  -> the screen
// Every one is optional, so a test can hand in only what it looks at.
export function createHints({ count = () => 0, countUp = () => {}, enabled = () => true, show = () => {}, hide = () => {} } = {}) {
  let showing = null; // { hint, left }
  let sinceLast = Infinity; // seconds since a hint last went up
  let blocked = false;

  const putAway = () => {
    if (!showing) return;
    showing = null;
    hide();
  };
  const mayShow = (hint) => !!hint && !showing && !blocked && enabled() && sinceLast >= HINT_GAP_S && count(hint.id) < hint.max;
  const putUp = (hint, slots) => {
    showing = { hint, left: HINT_SHOW_S };
    sinceLast = 0;
    countUp(hint.id);
    show({ id: hint.id, ring: hint.ring, slots: slots || {} });
  };

  return {
    get showing() {
      return showing ? showing.hint.id : null;
    },
    get blocked() {
      return blocked;
    },
    // The guided walk holds the hints back while one of its steps is open.
    setBlocked(v) {
      blocked = !!v;
      if (blocked) putAway();
    },
    // The thing just happened: show its hint if the rules allow. true when it
    // went up. A hint that could not go up is not counted, so the next time
    // the thing happens it is offered again.
    offer(id, slots) {
      const hint = BY_ID.get(id);
      if (!mayShow(hint)) return false;
      putUp(hint, slots);
      return true;
    },
    // The child did the thing this hint is about.
    done(id) {
      if (showing && showing.hint.id === id) putAway();
    },
    // Once a frame (or a few times a second) with the walk's facts. With
    // "Show tips" switched off mid-walk the hint on screen goes at once.
    update(dt, facts) {
      if (Number.isFinite(dt) && dt > 0) sinceLast += dt;
      if (showing) {
        if (!enabled()) { putAway(); return; }
        showing.left -= Number.isFinite(dt) && dt > 0 ? dt : 0;
        const did = !!facts && !!showing.hint.until && !!showing.hint.until(facts);
        if (did || showing.left <= 0) putAway();
        return;
      }
      if (!facts || blocked || !enabled() || sinceLast < HINT_GAP_S) return;
      for (const hint of HINTS) {
        if (hint.when && count(hint.id) < hint.max && hint.when(facts)) {
          putUp(hint, null);
          return;
        }
      }
    },
    // The walk is over: nothing stays on screen.
    end() {
      putAway();
    },
  };
}
