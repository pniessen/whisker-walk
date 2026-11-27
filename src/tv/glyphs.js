// Button pictures for TV mode. A pad line carries tokens such as ⟦jump⟧ (the
// ids are neutral: what the button does, not what it is called) and each
// token has a picture per pad kind: PlayStation shapes for a Sony pad, Xbox
// letters for any other standard pad. glyphify() gives HTML (the text round it
// is escaped); plainify() gives plain symbols for the places that set text.
import { escapeHtml } from '../escapehtml.js';

const svg = (inner) => `<svg class="pad-glyph" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const disc = '<circle cx="12" cy="12" r="10.5" fill="#1c2431" stroke="currentColor" stroke-width="1.5"/>';
const ps = (shape) => svg(disc + shape);
// An Xbox face button: a filled disc, one letter.
const xb = (letter, fill) => svg(`<circle cx="12" cy="12" r="10.5" fill="${fill}"/><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="800" font-family="sans-serif" fill="#fff">${letter}</text>`);
// A shoulder button: a wide pill with its label.
const pill = (label) => `<svg class="pad-glyph wide" viewBox="0 0 36 24" aria-hidden="true"><rect x="1.5" y="3.5" width="33" height="17" rx="8" fill="#1c2431" stroke="currentColor" stroke-width="1.5"/><text x="18" y="16.5" text-anchor="middle" font-size="10.5" font-weight="800" font-family="sans-serif" fill="currentColor">${label}</text></svg>`;
const stick = (letter) => svg(`${disc}<circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15.8" text-anchor="middle" font-size="9" font-weight="800" font-family="sans-serif" fill="currentColor">${letter}</text>`);
const bars = (n) => svg(`${disc}<path d="${n === 2 ? 'M7.5 9.5h9M7.5 14.5h9' : 'M7.5 8.5h9M7.5 12h9M7.5 15.5h9'}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`);
const dpad = svg(`${disc}<path d="M10.2 5.5h3.6v4.7h4.7v3.6h-4.7v4.7h-3.6v-4.7H5.5v-3.6h4.7z" fill="currentColor"/>`);

export const GLYPHS = Object.freeze({
  ps: Object.freeze({
    cross: ps('<path d="M8 8l8 8M16 8l-8 8" stroke="var(--ps-cross,#6aa7ff)" stroke-width="2.4" stroke-linecap="round"/>'),
    circle: ps('<circle cx="12" cy="12" r="4.6" fill="none" stroke="var(--ps-circle,#ff6b7d)" stroke-width="2.2"/>'),
    square: ps('<rect x="7.6" y="7.6" width="8.8" height="8.8" rx="1" fill="none" stroke="var(--ps-square,#f08cc8)" stroke-width="2.2"/>'),
    triangle: ps('<path d="M12 6.6l5.2 9H6.8z" fill="none" stroke="var(--ps-triangle,#4fd18b)" stroke-width="2.2" stroke-linejoin="round"/>'),
    l1: pill('L1'),
    r1: pill('R1'),
    options: bars(3),
    create: bars(2),
    dpad,
    lstick: stick('L'),
    rstick: stick('R'),
  }),
  xbox: Object.freeze({
    a: xb('A', '#3fa34d'),
    b: xb('B', '#d9473f'),
    x: xb('X', '#3b7ddd'),
    y: xb('Y', '#e0a82e'),
    lb: pill('LB'),
    rb: pill('RB'),
    menu: bars(3),
    view: bars(2),
    dpad,
    lstick: stick('L'),
    rstick: stick('R'),
  }),
});

// token id -> the picture on each kind of pad. This is the walk's own button map
// (gamepadinput.js) and the menus' (A = press, B = back).
const XBOX_TOKENS = Object.freeze({
    confirm: 'a', jump: 'a', back: 'b', meow: 'b', interact: 'x', photo: 'y',
    zoomOut: 'lb', zoomIn: 'rb', pause: 'menu', select: 'view', move: 'lstick', look: 'rstick', dpad: 'dpad',
  });
export const TOKEN_GLYPH = Object.freeze({
  // A Nintendo pad (vendor 057e) is laid out like an Xbox one but labelled the other way round:
  // the bottom button is B, the right one A, the left Y, the top X. Xbox pictures, each token
  // showing the letter at its own position.
  nin: Object.freeze({ ...XBOX_TOKENS, confirm: 'b', jump: 'b', back: 'a', meow: 'a', interact: 'y', photo: 'x' }),
  ps: Object.freeze({
    confirm: 'cross', jump: 'cross', back: 'circle', meow: 'circle', interact: 'square', photo: 'triangle',
    zoomOut: 'l1', zoomIn: 'r1', pause: 'options', select: 'create', move: 'lstick', look: 'rstick', dpad: 'dpad',
  }),
  xbox: Object.freeze({
    confirm: 'a', jump: 'a', back: 'b', meow: 'b', interact: 'x', photo: 'y',
    zoomOut: 'lb', zoomIn: 'rb', pause: 'menu', select: 'view', move: 'lstick', look: 'rstick', dpad: 'dpad',
  }),
});

export const TOKENS = Object.freeze(Object.keys(TOKEN_GLYPH.ps));

// Plain symbols for text that cannot hold a picture (a toast, a button label).
const PLAIN = Object.freeze({
  nin: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'L', rb: 'R', menu: '+', view: '−', dpad: '✚', lstick: 'L', rstick: 'R' },
  ps: { cross: '✕', circle: '○', square: '□', triangle: '△', l1: 'L1', r1: 'R1', options: '☰', create: '▭', dpad: '✚', lstick: 'L', rstick: 'R' },
  xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', menu: '☰', view: '▭', dpad: '✚', lstick: 'L', rstick: 'R' },
});

/** 'nin' for a Nintendo pad (letters swapped), 'ps' for a Sony pad (vendor 054c, or a DualSense / DualShock / "Wireless Controller" id); 'xbox' for any other pad. No pad: 'ps'. */
export function padKind(info) {
  if (!info) return 'ps';
  const id = typeof info === 'string' ? info : String(info.id ?? '');
  const vendor = typeof info === 'string' ? '' : String(info.vendor ?? '');
  if (/^057e$/i.test(vendor) || /\b057e\b|pro controller|nintendo/i.test(id)) return 'nin';
  if (/^045e$/i.test(vendor) || /\bxbox\b|\b045e\b/i.test(id)) return 'xbox';
  if (/^0?54c$/i.test(vendor) || /\b054c\b|dualsense|dualshock|wireless controller|playstation/i.test(id)) return 'ps';
  return 'xbox';
}

const TOKEN_RE = /⟦(\w+)⟧/g;
const kindOf = (kind) => (kind === 'xbox' || kind === 'nin' ? kind : 'ps');

/** Text with ⟦tokens⟧ -> HTML: each token a picture, everything else escaped. An unknown token shows its plain name. */
export function glyphify(text, kind = 'ps') {
  const k = kindOf(kind);
  let out = '';
  let last = 0;
  const s = String(text ?? '');
  for (const m of s.matchAll(TOKEN_RE)) {
    out += escapeHtml(s.slice(last, m.index));
    const g = TOKEN_GLYPH[k][m[1]];
    out += g ? (GLYPHS[k] ?? GLYPHS.xbox)[g] : escapeHtml(m[1]);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(s.slice(last));
}

/** Text with ⟦tokens⟧ -> plain text: ✕ ○ □ △ for a PlayStation pad, A B X Y for an Xbox one. */
export function plainify(text, kind = 'ps') {
  const k = kindOf(kind);
  return String(text ?? '').replace(TOKEN_RE, (_, id) => {
    const g = TOKEN_GLYPH[k][id];
    return g ? PLAIN[k][g] : id;
  });
}
