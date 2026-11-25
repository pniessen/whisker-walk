// =============================================================================
// THE MOON'S IDLE RING: THE PURE SCHEDULE (no THREE, no clock, no random number, no save). A child who never thinks to meow gets no pointer, so
// the gold ring and light column at the next goal (world/moonbaselive.js, the same ring a meow or the board lights) show BY THEMSELVES
// when she has been without progress for a while. This file only answers "now?"; the live hook (world/moonlife.js) feeds it and rings.
//
//   * PROGRESS (anything at all that moved her on: a mission step, cell, plug, trace, stamp, launch; a cell or card picked up or dropped; Pip woken; Dot
//     boarded or left; a find, pebble or mouse; a meow or the board; reaching the goal) resets the stretch: the clock starts again and the waits start over.
//   * THE WAITS grow so it never nags: the first ring after 30 s without progress, the next 60 s after that one, then 90 s, and every 90 s after that
//     (each ring shows about 7 s, like a meow). Nothing is saved: a new walk starts a new stretch.
//   * THE CLOCK COUNTS only while she walks free: it HOLDS (neither runs nor resets) while a page is open (telescope, stamp picker, binoculars), during the
//     launch count and flight, during the Core's wake beat and Earth's finale, and while she rides Dot if the goal is not one Dot can reach.
//   * NOTHING TO POINT AT: no ring, and the clock holds (the story is told and the cell is in, the errand is done or not offered).
// =============================================================================

export const IDLE = Object.freeze({ waits: Object.freeze([30, 60, 90]), reach: 4 }); // seconds of no progress before each ring (the last repeats); m: standing this near the goal counts as having reached it

// the state of one stretch: seconds run since it began (or since its last ring), rings given in it, whether this walk has had its hint
export const idleStart = () => Object.freeze({ idle: 0, rung: 0, told: false });
export const waitFor = (rung) => IDLE.waits[Math.min(Math.max(0, rung | 0), IDLE.waits.length - 1)];

// nextIdleRing(state, dt, ev) -> { state, ring, first }
//   ev: { progress: bool (anything moved her on), paused: bool (an excluded state), target: bool (there is a goal to point at) }
// Pure. `first` is true on the first ring of the walk (the live hook shows its hint line then).
export function nextIdleRing(state, dt, ev = {}) {
  const s = state ?? idleStart();
  if (ev.progress) return { state: { idle: 0, rung: 0, told: s.told }, ring: false, first: false };
  if (ev.paused || !ev.target || !(dt > 0)) return { state: s, ring: false, first: false };
  const idle = s.idle + dt;
  if (idle < waitFor(s.rung)) return { state: { idle, rung: s.rung, told: s.told }, ring: false, first: false };
  return { state: { idle: 0, rung: s.rung + 1, told: true }, ring: true, first: !s.told };
}

// The goals Dot can drive to (the open plain); the cells on the ridge, the Core inside the dome and the board are for paws, and there is none when it is 'done'.
export function dotCanReach(goal) {
  const k = goal?.kind;
  if (k === 'cell') return goal.cell === 1; // the Rover cell is Dot's own errand; the Ridge cell is climbed to
  return k === 'pip' || k === 'scope' || k === 'desk' || k === 'rocket' || k === 'button' || k === 'reply' || k === 'cave' || k === 'job';
}

// Is the stretch paused? `s` is what the life reads: { open (a page is up), flight (a launch count or flight), beat (the Core's wake beat), finale, riding, goal }.
export const idlePaused = (s) => !!(s.open || s.flight || s.beat || s.finale || (s.riding && !dotCanReach(s.goal)));

// A string that changes whenever something she did moves her on (compared frame to frame by the life; a plain join, no allocation worth the name at 2 Hz).
export const progressMark = (p) => [p.step, p.cells, p.scope, p.stamp, p.carrying, p.pip, p.riding ? 1 : 0, p.card, p.flight ? 1 : 0, p.reply ? 1 : 0, p.job, p.finds, p.calls, p.hops].join('|');
