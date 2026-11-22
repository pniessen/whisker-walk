// The on-screen letter picker: a name typed with a pad (or a finger). The model
// here is DOM-free, like ui/catbuilder.js; letterpickerview.js is the card.
// Rules for a name come from the caller (`valid`), so a cat's name and the
// walking name can differ. No English in this file: the view reads every word
// from padwords.js (ids pad.picker.*).

export const COLS = 9;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SPLIT = new Set([' ', '-']);

/** { alphabet: a regex character-class body, max, min, initial, valid(text) -> bool }. */
export function newPicker({ alphabet = 'A-Za-z -', max = 16, min = 2, initial = '', valid = null } = {}) {
  const allow = new RegExp(`^[${alphabet}]$`);
  const ok = (t) => (typeof valid === 'function' ? !!valid(t) : t.length >= min);
  const start = [...String(initial ?? '')].filter((c) => allow.test(c)).join('').slice(0, max);
  return { text: start, max, min, shift: false, allow, ok, done: null, message: null };
}

// The next letter starts a word: at the start, or after a space or hyphen.
const startsWord = (t) => t === '' || SPLIT.has(t[t.length - 1]);
const capital = (p) => p.shift || startsWord(p.text);

export function reducePicker(p, action) {
  if (!action || typeof action !== 'object' || p.done) return p;
  switch (action.type) {
    case 'add': {
      const ch = typeof action.ch === 'string' ? action.ch : '';
      if (ch.length !== 1 || !p.allow.test(ch)) return p;
      if (p.text.length >= p.max) return p;
      if (SPLIT.has(ch)) {
        if (startsWord(p.text)) return p; // no space or hyphen first, none twice in a row
        return { ...p, text: p.text + ch, shift: false, message: null };
      }
      const c = capital(p) ? ch.toUpperCase() : ch.toLowerCase();
      return { ...p, text: p.text + c, shift: false, message: null };
    }
    case 'back': return p.text ? { ...p, text: p.text.slice(0, -1), shift: false, message: null } : p;
    case 'clear': return p.text ? { ...p, text: '', shift: false, message: null } : p;
    case 'shift': return { ...p, shift: !p.shift };
    case 'ok':
      if (p.ok(p.text)) return { ...p, done: 'ok', message: null };
      return { ...p, message: p.text.length < p.min ? 'short' : 'blocked' };
    case 'cancel': return { ...p, done: 'cancel' };
    default: return p;
  }
}

/** The key grid: 3 rows of 9 (A-Z and the hyphen), then Shift / Space / Back / Cancel / OK. `col` and `span` are grid columns (1-based). */
export function pickerKeys() {
  const keys = [];
  const glyphs = [...LETTERS, '-'];
  glyphs.forEach((g, i) => keys.push({ id: g === '-' ? 'hyphen' : g, kind: 'letter', ch: g, row: Math.floor(i / COLS), col: (i % COLS) + 1, span: 1 }));
  const bottom = [['shift', 2, { type: 'shift' }], ['space', 2, { type: 'add', ch: ' ' }], ['back', 1, { type: 'back' }], ['cancel', 2, { type: 'cancel' }], ['ok', 2, { type: 'ok' }]];
  let col = 1;
  for (const [id, span, action] of bottom) {
    keys.push({ id, kind: 'func', action, row: 3, col, span });
    col += span;
  }
  return keys;
}

export function pickerModel(p) {
  return {
    text: p.text,
    canOk: p.ok(p.text),
    message: p.message,
    shift: p.shift,
    capital: capital(p),
    full: p.text.length >= p.max,
    keys: pickerKeys(),
  };
}

/** The action a key id stands for. */
export function actionFor(id) {
  const k = pickerKeys().find((x) => x.id === id);
  if (!k) return null;
  return k.kind === 'letter' ? { type: 'add', ch: k.ch } : k.action;
}
