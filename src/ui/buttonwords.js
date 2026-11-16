// The small word under each touch button (pounce, meow, yarn, photo) stays
// until that button has been used twice, not for a fixed number of walks
// (guided-first-walk design, section 4). The counts are the device's own, in
// a small localStorage key of their own (the buttons are the device's, not
// the save's); main.js counts a use when a button does its thing.

export const BUTTON_USES_KEY = 'whisker-walk-buttons';

export const WORD_BUTTONS = Object.freeze(['pounce', 'meow', 'yarn', 'camera']);
export const USES_TO_KNOW = 2;

// The counts, cleaned: each button 0..USES_TO_KNOW, anything else dropped.
export function sanitizeButtonUses(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const b of WORD_BUTTONS) {
    const n = v[b];
    if (Number.isInteger(n) && n > 0) out[b] = Math.min(USES_TO_KNOW, n);
  }
  return out;
}

// buttonWords(uses) -> { pounce, meow, yarn, camera }: true while that
// button still shows its word (touchui.js setLabels takes this).
export function buttonWords(uses) {
  const u = sanitizeButtonUses(uses);
  const out = {};
  for (const b of WORD_BUTTONS) out[b] = (u[b] ?? 0) < USES_TO_KNOW;
  return out;
}

// One more use of `name`. Returns the new counts, or null when nothing
// changed (not one of the four, or already known).
export function countButtonUse(uses, name) {
  if (!WORD_BUTTONS.includes(name)) return null;
  const u = sanitizeButtonUses(uses);
  if ((u[name] ?? 0) >= USES_TO_KNOW) return null;
  return { ...u, [name]: (u[name] ?? 0) + 1 };
}

// createButtonUses(storage) -> { words(), use(name) }. Storage that is full
// or switched off just means the words stay a little longer.
export function createButtonUses(storage) {
  let uses = {};
  try { uses = sanitizeButtonUses(JSON.parse(storage.getItem(BUTTON_USES_KEY) ?? 'null')); } catch { uses = {}; }
  return {
    // Which buttons still show their word (touchui.js setLabels).
    words: () => buttonWords(uses),
    // A button was used. true when its count changed.
    use(name) {
      const next = countButtonUse(uses, name);
      if (!next) return false;
      uses = next;
      try { storage.setItem(BUTTON_USES_KEY, JSON.stringify(uses)); } catch { /* not fatal */ }
      return true;
    },
  };
}
