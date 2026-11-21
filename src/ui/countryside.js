// The world map's countryside (src/countryside.js) as SVG: drawn once per
// render as a handful of paths (one per field tone, the furrows, the
// hedgerows, the lanes, the ponds, the flowers, the trees), then a fade that
// softens the land past the world toward the frame. DOM-free: a string.
//
// It is decoration only: aria-hidden, never a tab stop, and pointer-events
// none (style.css), so a tap on the meadow reaches no place and a drag
// still pans.
import { COUNTRYSIDE, FIELD_TONES, FADE } from '../countryside.js';

const pt = ([x, y]) => `${x} ${y}`;
const poly = (ps) => `M${ps.map(pt).join(' L')}Z`;
const line = (ps) => `M${ps.map(pt).join(' L')}`;
const dots = (ps) => ps.map(([x, y]) => `M${x} ${y}h0`).join('');
// a circle as a path: two half arcs
const disc = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const r1 = (v) => Math.round(v * 10) / 10;

// The fade: an ellipse round the world's middle, clear inside, the pale
// meadow at its edge and past it.
export const FADE_ID = 'wm-fade';
export function countryFadeDefs() {
  const { cx, cy, rx, ry, start, end } = FADE;
  return `<radialGradient id="${FADE_ID}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${rx}"`
    + ` gradientTransform="translate(${cx} ${cy}) scale(1 ${r1(ry / rx)}) translate(${-cx} ${-cy})">`
    + `<stop offset="${start}" class="wm-fade-in"/><stop offset="${end}" class="wm-fade-out"/></radialGradient>`;
}

export function countrysideHtml(c = COUNTRYSIDE, beyond = 6000) {
  const fields = FIELD_TONES.map((fill, tone) => {
    const d = c.fields.filter((f) => f.tone === tone).map((f) => poly(f.quad)).join('');
    return d ? `<path class="wm-field" fill="${fill}" d="${d}"/>` : '';
  }).join('');
  const furrows = c.fields.flatMap((f) => f.furrows.map(([[ax, ay], [bx, by]]) => `M${Math.round(ax)} ${Math.round(ay)}l${Math.round(bx - ax)} ${Math.round(by - ay)}`)).join('');
  const hedges = c.hedges.map(([a, m, b]) => `M${pt(a)} Q${pt(m)} ${pt(b)}`).join('');
  const lanes = c.lanes.map(line).join('');
  const ponds = c.ponds.map(([x, y, rx, ry]) => `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`).join('');
  const [white, yellow, pink] = c.flowers;
  const crowns = c.trees.map(([x, y, r]) => disc(x, y, r)).join('');
  const shine = c.trees.map(([x, y, r]) => disc(r1(x - r * 0.3), r1(y - r * 0.32), r1(r * 0.45))).join('');
  const shade = c.trees.map(([x, y, r]) => disc(r1(x + 3), r1(y + 5), r)).join('');
  return '<g class="wm-country" aria-hidden="true">'
    + fields
    + (furrows ? `<path class="wm-furrows" d="${furrows}"/>` : '')
    + (lanes ? `<path class="wm-lane-edge" d="${lanes}"/><path class="wm-lane" d="${lanes}"/>` : '')
    + (hedges ? `<path class="wm-hedges" d="${hedges}"/>` : '')
    + (ponds ? `<path class="wm-pond" d="${ponds}"/>` : '')
    + (white.length ? `<path class="wm-flowers wm-flowers-white" d="${dots(white)}"/>` : '')
    + (yellow.length ? `<path class="wm-flowers wm-flowers-yellow" d="${dots(yellow)}"/>` : '')
    + (pink.length ? `<path class="wm-flowers wm-flowers-pink" d="${dots(pink)}"/>` : '')
    + (crowns ? `<path class="wm-tree-shade" d="${shade}"/><path class="wm-trees" d="${crowns}"/><path class="wm-tree-shine" d="${shine}"/>` : '')
    + `<rect class="wm-fade" x="${-beyond}" y="${-beyond}" width="${1500 + 2 * beyond}" height="${880 + 2 * beyond}" fill="url(#${FADE_ID})"/>`
    + '</g>';
}
