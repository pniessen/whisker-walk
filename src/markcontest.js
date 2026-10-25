import { markKey, shouldContest, CONTEST_REACH } from './marks.js';
import { rivalFor } from './rivalclans.js';

// =============================================================================
// The rival clan scents over my marks near its border (v21 3b Task 12). A
// small leaf: no THREE, no DOM, no storage of its own. It is handed the
// walk's progression, its marks renderer, where the patrol cat is, whether a
// chase is on, and a toast; walk.js builds one per walk and ticks it from
// session.rival.update, the call the render loop already makes every frame.
//
// IT TAKES NOTHING. Its only write is progression.contestMark, which only
// sets `contested` on a mark: points, taming, colony cats and every other
// mark are untouched, a border or den mark is never contested (marks.js), and
// nothing goes on any wire. No randomness: the patrol's spot comes from the
// shared clock. The save is read through marksIn (eight shallow copies at
// most) only on a check, never per frame.
// =============================================================================

// How often (seconds) a check runs: 4 a second. The patrol moves about
// 0.19 m between checks, far inside the 1.5 m contest reach.
export const CONTEST_EVERY = 0.25;

// The one toast a walk shows, the first time a mark is scented over. A
// scratch can be scratched again to take it back (ruling R24); a dig or a
// drop cannot, so its toast does not say to.
export function contestToast(name, kind) {
  return kind === 'scratch'
    ? `${name} scented over your mark! Scratch it again to take it back. 🐾`
    : `${name} scented over your mark! 🐾`;
}

// createMarkContest({ areaId, progression, playerMarks, patrolPos, isChasing, toast })
//   → { tick(dt) }
//
// Each check reads patrolPos() (→ {x, z} or null) and contests every mark of
// mine that marks.shouldContest says the patrol has reached: the save flags
// it and the renderer turns it pale.
//
// A MARK MADE WHILE THE PATROL IS RIGHT THERE IS LEFT ALONE (ruling R25). If a
// mark's `at` changed since the last check (a re-scratch, or one just made)
// and the patrol is within CONTEST_REACH of it, it is immune until the patrol
// has walked out of reach; then the normal rule applies again, so the next
// lap can scent it over. Otherwise a child's E press would be taken straight
// back and look like it did nothing.
//
// NEVER ON TOP OF THE CHASE TOAST (ruling R26). While isChasing() is true the
// toast is held, and shown once the chase has settled. Still one per walk.
export function createMarkContest({
  areaId, progression, playerMarks, patrolPos, isChasing = () => false, toast,
}) {
  const rival = rivalFor(areaId);
  if (!rival) return { tick() {} };
  let clock = 0;
  let told = false;
  let held = null; // a toast waiting for the chase to settle
  let seenAt = null; // key → `at`, as of the last check (null before the first)
  const immune = new Set();

  function check(pos) {
    const marks = progression.marksIn(areaId);
    const prior = seenAt;
    seenAt = new Map();
    for (const m of marks) {
      const key = markKey(m);
      seenAt.set(key, m.at);
      const inReach = Math.hypot(m.x - pos.x, m.z - pos.z) <= CONTEST_REACH;
      if (!inReach) { immune.delete(key); continue; }
      if (prior && prior.get(key) !== m.at) immune.add(key);
      if (immune.has(key) || !shouldContest(areaId, m, pos)) continue;
      if (!progression.contestMark(areaId, key)) continue;
      playerMarks?.setContested(key);
      if (!told) {
        told = true;
        held = contestToast(rival.name, m.kind);
      }
    }
    // a key that left the save leaves the immune set too
    for (const key of immune) if (!seenAt.has(key)) immune.delete(key);
  }

  return {
    tick(dt) {
      if (typeof dt !== 'number' || !(dt > 0) || !Number.isFinite(dt)) return;
      clock += dt;
      if (clock >= CONTEST_EVERY) {
        clock = 0;
        const pos = patrolPos();
        if (pos) check(pos);
      }
      if (held && isChasing() !== true) {
        toast(held);
        held = null;
      }
    },
  };
}
