// The guided first walk as a plain state machine (design: .claude/plans/
// guided-first-walk-design.md, section 3). No screen, no THREE, no dice, no
// clock of its own: the walk hands it what just happened (note) and the facts
// of this moment (update), and it answers with what to show (view) and what
// the guide cat should do (the effects update and note return).
//
// The rules it keeps:
//   - a step ends when the child does its thing, never on a timer;
//   - a later step's thing done early is counted, and that step is passed over
//     when its turn comes;
//   - nothing can be done wrong: any other action just works;
//   - after 10, 20 and 30 seconds of nothing, the guide (not the words) nudges.
//
// The steps: 1 walk, 2 say hello, 3 share a fish, 4 follow to a treasure,
// 5 pounce; then 6 the finish line, 7 how to go home (with the ring), 8 the
// same line as a small chip for the rest of the walk. OFF is a skipped lesson.

export const STEP = Object.freeze({ walk: 1, hello: 2, fish: 3, follow: 4, pounce: 5, finish: 6, home: 7, free: 8, off: 9 });
export const WALK_M = 2;           // step 1 ends after this many metres
export const NUDGE_S = 10;         // a nudge every this many idle seconds
export const AWAY_M = 25;          // further than this, the guide comes after the child
export const BACK_M = 10;          // back within this of the guide, the bubble opens again
export const CHIP_AFTER_S = 60;    // step 4: this long doing other things, the bubble shrinks
export const DONE_LINE_S = 4;      // the finish line stays this long
export const HOME_RING_S = 6;      // the ring round the pause button stays this long
export const GIFT_POINTS = 20;

const NUDGES = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 2 };

// createTutorial({ step, did }) -> the machine. `step` and `did` are what a
// walk picked up again carries (snapshot()); a second try starts at step 2.
export function createTutorial({ step = STEP.walk, did = {} } = {}) {
  const done = {
    moved: !!did.moved || step > STEP.walk,
    hello: !!did.hello,
    fish: !!did.fish,
    treasure: !!did.treasure,
    pounce: !!did.pounce,
  };
  let at = Number.isInteger(step) && step >= STEP.walk && step <= STEP.off ? step : STEP.walk;
  let idle = 0;        // seconds of nothing in this step
  let stage = 0;       // nudges given in this step
  let clock = 0;       // seconds in a timed step (6 and 7 only)
  let away = 0;        // step 4: seconds spent far from the guide
  let other = false;   // step 2: said hello to a different cat first
  let grow = false;    // the ring is drawn bigger
  let thumb = null;    // 'slide' | 'tap': the thumb picture on the ring
  let more = false;    // step 1: the second line is showing
  let canFeed = true;
  let hasTreasure = true;
  let entered = false; // the current step's entry effects have been given

  const stepDone = (s) => (
    s === STEP.walk ? done.moved || done.hello
      : s === STEP.hello ? done.hello
        : s === STEP.fish ? done.fish || !canFeed
          : s === STEP.follow ? done.treasure || !hasTreasure
            : s === STEP.pounce ? done.pounce
              : false
  );

  function enter(s, out) {
    at = s;
    idle = 0; stage = 0; clock = 0; away = 0; grow = false; thumb = null; more = false;
    entered = true;
    out.push({ t: 'step', step: s });
    if (s === STEP.hello) out.push({ t: 'trail' });
    if (s === STEP.follow) out.push({ t: 'lead' });
    if (s === STEP.pounce) out.push({ t: 'demo' });
    if (s === STEP.finish) out.push({ t: 'finish' });
  }

  // Move on past every step whose thing is already done.
  function advance(out) {
    if (at > STEP.pounce) return;
    if (!entered) {
      // The first look at a step this machine was started on: its entry
      // effects, unless it is already done.
      if (!stepDone(at)) { enter(at, out); return; }
    }
    let s = at;
    while (s <= STEP.pounce && stepDone(s)) s += 1;
    if (s !== at) enter(s, out);
  }

  function nudge(out) {
    stage += 1;
    if (at === STEP.walk) {
      if (stage === 1) { out.push({ t: 'meow' }, { t: 'steps', n: 3 }); thumb = 'slide'; }
      else if (stage === 2) more = true;
      else {
        // She walks all the way over and sits: hello can happen with no walking.
        out.push({ t: 'come' });
        done.moved = true;
      }
    } else if (at === STEP.hello) {
      if (stage === 1) out.push({ t: 'steps', n: 2 }, { t: 'trail' });
      else out.push({ t: 'come' });
    } else if (at === STEP.fish) {
      out.push({ t: 'rub' });
      if (stage === 2) grow = true;
    } else if (at === STEP.follow) {
      if (stage === 1) out.push({ t: 'halfback' }, { t: 'meow' });
      else out.push({ t: 'back' });
    } else if (at === STEP.pounce) {
      if (stage === 1) out.push({ t: 'demo' });
      else { grow = true; thumb = 'tap'; }
    }
  }

  return {
    get step() { return at; },
    // Steps 1 to 5: the lesson is on, and the things in the design's
    // "switched off" table are off.
    get open() { return at <= STEP.pounce; },
    get finished() { return at >= STEP.finish && at <= STEP.free; },
    get skipped() { return at === STEP.off; },
    get did() { return { ...done }; },

    // The thing just happened. `guide` is true when it was done to the guide
    // cat (a hello, a fish). Returns the effects.
    note(what, { guide = false } = {}) {
      const out = [];
      if (at >= STEP.finish) return out;
      if (what === 'greet') {
        if (guide) done.hello = true;
        else if (at === STEP.hello) other = true;
      } else if (what === 'feed') {
        if (guide) done.fish = true;
      } else if (what === 'collect') {
        done.treasure = true;
      } else if (what === 'pounce') {
        done.pounce = true;
        if (at === STEP.walk) out.push({ t: 'meow' });
      } else if (what === 'meow') {
        if (at === STEP.walk) out.push({ t: 'meow' });
      }
      idle = 0;
      advance(out);
      return out;
    },

    // Once a frame (or a few times a second) while the walk is being played.
    //   moved        metres the cat has walked on this walk
    //   active       the child is doing something (the cat is moving)
    //   guideDist    metres from the cat to the guide
    //   canFeed      the guide can be fed on this walk
    //   hasTreasure  there is a treasure left to lead to
    update(dt, f = {}) {
      const out = [];
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (at >= STEP.off) return out;
      if (at >= STEP.finish) {
        if (!entered) { entered = true; if (at === STEP.finish) out.push({ t: 'finish' }); }
        clock += step;
        if (at === STEP.finish && clock >= DONE_LINE_S) { at = STEP.home; clock = 0; out.push({ t: 'step', step: at }); }
        else if (at === STEP.home && clock >= HOME_RING_S) { at = STEP.free; clock = 0; out.push({ t: 'step', step: at }); }
        return out;
      }
      if (typeof f.canFeed === 'boolean') canFeed = f.canFeed;
      if (typeof f.hasTreasure === 'boolean') hasTreasure = f.hasTreasure;
      if (Number.isFinite(f.moved) && f.moved >= WALK_M) done.moved = true;
      const before = at;
      advance(out);
      if (at !== before || at > STEP.pounce) return out;
      if (f.active) idle = 0;
      else idle += step;
      if (at === STEP.follow) {
        if (Number.isFinite(f.guideDist) && f.guideDist <= BACK_M) away = 0;
        else away += step;
      }
      if (stage < NUDGES[at] && idle >= NUDGE_S * (stage + 1)) {
        nudge(out);
        advance(out);
      }
      return out;
    },

    // What the bubble and the ring show now. `prompt` is what the yellow
    // button offers at this moment: 'hello' | 'fish' | 'pickup' | null.
    //   id     the tutorialwords line
    //   more   a second line under it (step 1 after 20 s)
    //   ring   'move' | 'prompt' | 'pounce' | 'pause' | null
    //   chip   null | 'paw' (picture only) | 'line' (the line, small)
    view({ prompt = null } = {}) {
      if (at === STEP.walk) return { id: 'guide.walk', more: more ? 'guide.walk-more' : null, ring: 'move', chip: null, grow, thumb };
      if (at === STEP.hello) {
        if (prompt === 'hello') return { id: 'guide.hello', more: null, ring: 'prompt', chip: null, grow, thumb };
        return { id: other ? 'guide.hello-other' : 'guide.go', more: null, ring: null, chip: null, grow, thumb };
      }
      if (at === STEP.fish) return { id: 'guide.fish', more: null, ring: prompt === 'fish' ? 'prompt' : null, chip: null, grow, thumb };
      if (at === STEP.follow) {
        if (prompt === 'pickup') return { id: 'guide.pick-up', more: null, ring: 'prompt', chip: null, grow, thumb };
        return { id: 'guide.follow', more: null, ring: null, chip: away >= CHIP_AFTER_S ? 'paw' : null, grow, thumb };
      }
      if (at === STEP.pounce) return { id: 'guide.pounce', more: null, ring: 'pounce', chip: null, grow, thumb };
      if (at === STEP.finish) return { id: 'guide.done', more: null, ring: null, chip: null, grow: false, thumb: null };
      if (at === STEP.home) return { id: 'guide.home', more: null, ring: 'pause', chip: null, grow: false, thumb: null };
      if (at === STEP.free) return { id: 'guide.home', more: null, ring: null, chip: 'line', grow: false, thumb: null };
      return null;
    },

    // "Skip the lesson": one tap, nothing asked. The walk is an ordinary walk.
    skip() {
      if (at > STEP.pounce) return false;
      at = STEP.off;
      return true;
    },

    // What a walk picked up again needs to carry on from here.
    snapshot() {
      return { step: at, did: { ...done } };
    },
  };
}

// Where the guided first walk stands for a solo walk about to start, from the
// save's tutorial.first:
//   null     never guided: the whole walk, from step 1
//   'part'   left half way once: one more try, from step 2
//   anything else: not guided
// Only on the street, never the den, never in a room (the caller's rules).
export function guidedStart(first) {
  if (first === null) return { step: STEP.walk };
  if (first === 'part') return { step: STEP.hello };
  return null;
}
