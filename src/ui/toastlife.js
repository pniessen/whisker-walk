// How long a toast stays up, from its words: long enough for a young reader
// (about 0.55 s a word after a 0.6 s start), never under 3 s, never over 9 s.
// A word has a letter or a digit in it ("+5" counts; "🐾" and "—" don't).
// Shared by the walk's toasts (ui/hud.js) and the home base's cloud toast
// (game/cloudsync.js).
export const TOAST_MIN_LIFE_MS = 3000;
export const TOAST_MAX_LIFE_MS = 9000;

export function toastLifeMs(text) {
  const words = String(text ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.min(TOAST_MAX_LIFE_MS, Math.max(TOAST_MIN_LIFE_MS, 600 + 550 * words));
}
