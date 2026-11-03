// polish-screens Task 4 — the friendly empty states for the home's Album and
// Social sheets: a small hand-drawn picture and one warm line. Static markup
// only (no user data, nothing to escape); the pictures are decorative, so the
// line carries the meaning for a screen reader.

const NAVY = '#1c2431';
const SLATE = '#33425e';
const CREAM = '#f1e0c2';
const PINK = '#e7a9a0';
const GOLD = '#f2c14e';
const MIST = '#8c9bb4';
const MOSS = '#5f7f68';

const svg = (body) => `<svg class="empty-pic" viewBox="0 0 120 90" width="120" height="90" `
  + `aria-hidden="true" focusable="false">${body}</svg>`;

// A photo frame with a cat's ears peeking up into the picture, and a little
// camera leaning on its corner.
const ALBUM_PIC = svg(
  `<g transform="rotate(-6 50 45)">`
    + `<rect x="16" y="8" width="70" height="74" rx="5" fill="${CREAM}"/>`
    + `<rect x="22" y="14" width="58" height="48" rx="2" fill="${SLATE}"/>`
    + `<circle cx="68" cy="25" r="5" fill="${GOLD}"/>`
    + `<path d="M22 54 Q38 44 52 50 T80 47 V62 H22 Z" fill="${MOSS}"/>`
    + `<path d="M33 62 Q33 50 37 46 L37.5 37 L45.5 44 Q51 42.5 56.5 44 L64.5 37 L65 46 Q69 50 69 62 Z" fill="${NAVY}"/>`
  + `</g>`
  + `<g transform="rotate(9 92 66)">`
    + `<rect x="82" y="49" width="10" height="6" rx="2" fill="${PINK}"/>`
    + `<rect x="75" y="53" width="35" height="25" rx="6" fill="${PINK}"/>`
    + `<circle cx="92.5" cy="65.5" r="8.5" fill="${NAVY}"/>`
    + `<circle cx="92.5" cy="65.5" r="4.5" fill="${MIST}"/>`
    + `<circle cx="90.8" cy="63.8" r="1.6" fill="${CREAM}"/>`
    + `<rect x="102" y="56" width="5" height="3.5" rx="1.2" fill="${GOLD}"/>`
  + `</g>`,
);

// One cat's head in profile, facing right; `flip` mirrors it to face left.
const catHead = (fill, flip) => `<g${flip ? ' transform="translate(120 0) scale(-1 1)"' : ''}>`
  + `<path d="M14 90 Q16 66 36 66 Q56 66 58 90 Z" fill="${fill}"/>`
  + `<path d="M22 42 L24 24 L36 35 Z" fill="${fill}"/>`
  + `<path d="M40 35 L50 22 L52 42 Z" fill="${fill}"/>`
  + `<path d="M25.5 37 L26.5 29 L32 34 Z" fill="${PINK}"/>`
  + `<circle cx="37" cy="51" r="17" fill="${fill}"/>`
  + `<ellipse cx="52" cy="57" rx="7.5" ry="6" fill="${fill}"/>`
  + `<circle cx="58.6" cy="55" r="2.1" fill="${PINK}"/>`
  + `<path d="M40 48 Q43.5 45 47 48" stroke="${NAVY}" stroke-width="2" fill="none" stroke-linecap="round"/>`
  + `<ellipse cx="41" cy="58" rx="3.5" ry="2.2" fill="${PINK}" opacity="0.6"/>`
  + `</g>`;

// Two cats touching noses, a small heart floating over them.
const FRIENDS_PIC = svg(
  catHead(CREAM, false)
  + catHead(MIST, true)
  + `<path d="M60 26 C60 20 52 18 52 24 C52 28 57 31 60 34 C63 31 68 28 68 24 C68 18 60 20 60 26 Z" fill="${PINK}"/>`,
);

// A small cat sitting beside a food bowl with a fish in it, a heart above:
// make a friend, then feed it.
const COLONY_PIC = svg(
  // tail curling round the back, then the sitting body and head
  `<path d="M30 80 Q8 80 10 62" stroke="${CREAM}" stroke-width="6" fill="none" stroke-linecap="round"/>`
  + `<path d="M22 82 Q22 58 38 58 Q54 58 54 82 Z" fill="${CREAM}"/>`
  + `<path d="M26 40 L28 25 L37 33 Z" fill="${CREAM}"/>`
  + `<path d="M40 33 L49 25 L51 40 Z" fill="${CREAM}"/>`
  + `<path d="M29 36 L29.5 30 L34 33.5 Z" fill="${PINK}"/>`
  + `<circle cx="39" cy="47" r="14" fill="${CREAM}"/>`
  + `<path d="M31 45 Q34 42.5 37 45 M42 45 Q45 42.5 48 45" stroke="${NAVY}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
  + `<ellipse cx="39.5" cy="50.5" rx="2" ry="1.4" fill="${PINK}"/>`
  // the bowl, with a fish lying in it
  + `<path d="M64 66 H108 Q106 84 86 84 Q66 84 64 66 Z" fill="${SLATE}"/>`
  + `<rect x="64" y="64" width="44" height="4" rx="2" fill="${MIST}"/>`
  + `<ellipse cx="86" cy="62" rx="12" ry="5.5" fill="${GOLD}"/>`
  + `<path d="M97 62 L106 56.5 L106 67.5 Z" fill="${GOLD}"/>`
  + `<circle cx="78" cy="61" r="1.4" fill="${NAVY}"/>`
  // a heart over the cat's side of the story
  + `<path d="M60 26 C60 20 52 18 52 24 C52 28 57 31 60 34 C63 31 68 28 68 24 C68 18 60 20 60 26 Z" fill="${PINK}"/>`,
);

const EMPTY = {
  album: { pic: ALBUM_PIC, line: 'No photos yet. Snap one on your next walk! 📸' },
  colony: {
    pic: COLONY_PIC,
    line: 'No colony cats yet — touch noses with a stray, then feed it 🐟',
    extra: ' colony-empty',
  },
  friends: { pic: FRIENDS_PIC, line: 'No cat friends yet. Go touch noses on a walk! 🐾' },
};

export function emptyStateHtml(kind) {
  const e = EMPTY[kind];
  if (!e) return '';
  return `<div class="empty-state empty-${kind}${e.extra || ''}">${e.pic}<p>${e.line}</p></div>`;
}
