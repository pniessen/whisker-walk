// Numbers per layout profile; mirrored by --pv-* on html.<profile> in style.css (test/profilevalues.test.js).
// map: corner map px, toasts: messages at once, cap: pixel-ratio cap (home base).
export const VALUES = {
  phone: { map: 110, toasts: 2, cap: 1.5 },
  tablet: { map: 110, toasts: 2, cap: 1.5 },
  laptop: { map: 150, toasts: 2, cap: 2 },
  tv: { map: 220, toasts: 1, cap: 2 },
};
