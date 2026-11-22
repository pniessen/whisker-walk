// The start-up side of TV mode: a flag, the last input, and a hook for the
// chunk (src/tv/*, loaded only when the TV switch is on). No imports, and
// nothing here may import src/tv/: the build fails if the chunk joins
// start-up (scripts/buildjson.mjs). With TV mode off every function is
// identity or a no-op, so touch, mouse and keyboard play is unchanged.
export const tvState = { on: false, input: 'keys', text: null, padLine: null };

const listeners = new Set();

/** Plain text or token text in, the same out until the chunk sets `text`. */
export const padText = (s) => (tvState.text ? tvState.text(s) : s);

/** Merge a change in; listeners hear about it once, and only if something changed. */
export function setTv(partial) {
  let changed = false;
  for (const k of Object.keys(partial)) {
    if (tvState[k] !== partial[k]) { tvState[k] = partial[k]; changed = true; }
  }
  if (!changed) return;
  for (const fn of [...listeners]) {
    try { fn(tvState); } catch { /* one listener must not stop the rest */ }
  }
}

/** Hear about changes; returns the way to stop. */
export function onTv(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Back to the start (tests). */
export function resetTv() {
  Object.assign(tvState, { on: false, input: 'keys', text: null, padLine: null });
  listeners.clear();
}
