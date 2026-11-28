// Dynamic split screen (S1): when do two couch cats share one picture, and when do they get a
// half each? Pure state machine, no DOM, no three.js (lazy: only splitview.js imports it).
//
// Rule (owner's decision: dynamic):
//   shared -> split when the cats are farther apart than SPLIT_AT x the widest gap the shared
//             camera can frame AND the shared zoom is already at its widest step, OR when they are
//             on different levels (House, Treehouse, Reef, Gorge), however close they stand.
//   split -> shared when the gap is under MERGE_AT x that widest gap AND they share a level.
//   Each state is held at least HOLD_MS (so a gap hovering at a threshold cannot flicker), and a
//   change slides a vertical divider for TRANSITION_MS (reduced motion: instantly).
export const SPLIT_AT = 0.8; // of maxSeparation
export const MERGE_AT = 0.5; // of maxSeparation
export const HOLD_MS = 1000;
export const TRANSITION_MS = 400;

const ease = (t) => t * t * (3 - 2 * t); // smoothstep

/** Where the divider stands (fraction of the screen width) at transition progress `t` (0 shared .. 1 split). Shared is 1: the right view has no width. */
export const dividerAt = (t) => 1 - 0.5 * ease(Math.min(1, Math.max(0, t)));

/**
 * The two views' rectangles (CSS px, same convention as splitPlan in splitview.js: worked out in
 * device pixels so the rectangles tile the buffer exactly, then handed back in CSS px).
 * The right view is null while the divider is at the edge (shared).
 */
export function viewRects(w, h, dpr, dividerX) {
  const bw = Math.max(2, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  const lw = Math.min(bw, Math.max(1, Math.round(bw * Math.min(1, Math.max(0, dividerX)))));
  const dev = [{ x: 0, y: 0, w: lw, h: bh }];
  if (lw < bw) dev.push({ x: lw, y: 0, w: bw - lw, h: bh });
  const css = dev.map((r) => ({ x: r.x / dpr, y: 0, w: r.w / dpr, h: bh / dpr }));
  return { dev, css, aspects: dev.map((r) => r.w / r.h) };
}

/**
 * createSplitRule() -> { step(inputs) -> { mode, t, dividerX, reason, active } , reset() }.
 * inputs: { gap, maxSep, top, sameLevel, reducedMotion, dt (s), nowMs }.
 * `mode` is the target ('shared' | 'split'); `t` is the transition progress of the picture
 * (0 = fully shared, 1 = fully split, monotone while it moves); `active` is true whenever the
 * split picture is (even partly) on screen, i.e. whenever each cat must keep its own camera.
 */
export function createSplitRule() {
  let mode = 'shared';
  let t = 0;
  let since = -Infinity; // nowMs of the last mode change
  let reason = 'start';
  function step({ gap, maxSep, top, sameLevel = true, reducedMotion = false, dt = 0, nowMs = 0 }) {
    const held = nowMs - since >= HOLD_MS;
    if (held) {
      if (mode === 'shared') {
        if (!sameLevel) { mode = 'split'; reason = 'levels'; since = nowMs; }
        else if (top && gap > SPLIT_AT * maxSep) { mode = 'split'; reason = 'apart'; since = nowMs; }
      } else if (sameLevel && gap < MERGE_AT * maxSep) { mode = 'shared'; reason = 'close'; since = nowMs; }
    }
    const goal = mode === 'split' ? 1 : 0;
    if (reducedMotion) t = goal;
    else if (t < goal) t = Math.min(goal, t + Math.max(0, dt) * 1000 / TRANSITION_MS);
    else if (t > goal) t = Math.max(goal, t - Math.max(0, dt) * 1000 / TRANSITION_MS);
    return { mode, t, dividerX: dividerAt(t), reason, active: t > 0 || mode === 'split' };
  }
  return { step, reset() { mode = 'shared'; t = 0; since = -Infinity; reason = 'start'; } };
}
