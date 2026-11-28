// Split screen S4: what each pad's camera controls do while the picture is split. Pure (no DOM, no
// three.js, no clock); src/coop/index.js feeds it the split rule's answer and uses what it says.
//
// Two states, 'shared' and 'split' (the CONTROL mapping, not the picture's mode):
//   shared  today's couch rules: pad one's right stick and L1/R1 are the couch view's (padForWalk
//           takes them out), pad two's right stick does nothing, L1/R1 turn the shared heading a quarter.
//   split   each cat has its own camera: right stick orbits that cat's camera (pad one through the
//           walk's own pad code, pad two through mover.player.addOrbit), L1/R1 zoom that cat's camera.
// The mapping follows the PICTURE with a latch, so a slide never lurches: it goes to 'split' only when
// the slide into the split is finished (t >= 1), and back to 'shared' only when the slide back has
// finished (the split picture is gone). Mid-slide the previous mapping stays.
import { clampZoomStep } from '../camzoom.js';

export function createSplitControl() {
  let ctl = 'shared';
  return {
    /** res: the split rule's answer { t, active } or null/undefined (flag off, one cat). Returns { ctl, changed }. */
    step(res) {
      const was = ctl;
      if (!res || !res.active) ctl = 'shared';
      else if (res.t >= 1) ctl = 'split';
      return { ctl, changed: ctl !== was };
    },
    get ctl() { return ctl; },
    reset() { ctl = 'shared'; },
  };
}

/** Pad two's right stick as an addOrbit(dx, dy) delta: only in the split mapping, only with a pad (a lost pad is null). */
export const orbitFor = (ctl, pad2) => (ctl === 'split' && pad2?.orbit && (pad2.orbit.dx || pad2.orbit.dy) ? pad2.orbit : null);

/** A hub 'turn' event (L1 dir +1 = zoom out, R1 dir -1 = zoom in) as cat two's new zoom step in the split mapping, else null (shared: the event turns the shared heading). */
export function zoomFor(ctl, ev, cur, max) {
  if (ctl !== 'split' || ev?.type !== 'turn' || ev.slot !== 1) return null;
  return clampZoomStep(cur + ev.dir, max);
}

/** In the split mapping a 'turn' event of either pad never turns the shared heading. */
export const turnsHeading = (ctl) => ctl !== 'split';
