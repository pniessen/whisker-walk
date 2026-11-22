// Toast timing on a TV (owner, 2026-11-22: "the grey toasts linger too long"). One toast is
// visible at a time, so each leaves sooner than on a phone: about 2.2 s and 0.04 s a character,
// 2.5 to 5 s; it may give up its slot after 1.5 s; with more than one line waiting it goes at
// once when ripe. A goal or a discovery keeps the longer end of the range. Set on the page
// by src/tv/index.js; the phone, tablet and desktop timings (ui/toastlife.js) are untouched.
export const TV_TOAST_MIN_MS = 2500;
export const TV_TOAST_MAX_MS = 5000;
export const TV_TOAST_RIPE_MS = 1500;
export const TV_MAX_TOASTS = 1;
const LONG_KIND = /^(goal complete|you )/i;

export const tvToastTiming = Object.freeze({
  cap: TV_MAX_TOASTS,
  ripe: TV_TOAST_RIPE_MS,
  /** Milliseconds a toast with these words stays up; `waiting` is how many lines queue behind it. */
  life(text, waiting = 0) {
    const t = String(text ?? '');
    if (LONG_KIND.test(t)) return TV_TOAST_MAX_MS;
    const ms = Math.min(TV_TOAST_MAX_MS, Math.max(TV_TOAST_MIN_MS, 2200 + 40 * t.length));
    return waiting > 1 ? Math.min(ms, TV_TOAST_RIPE_MS) : ms;
  },
});
