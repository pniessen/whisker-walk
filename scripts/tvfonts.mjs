// Writes src/tv/fonts.css: the 24 px floor for TV mode, one rule per selector
// in src/style.css that sets a font-size. At 1080p everything a child reads is
// at least 24 px (20 px on the grown-ups' sheets listed in GROWNUP_20), and
// every size grows with --tv-s on a bigger window. rem sizes of 1rem or more
// already pass (the TV root is 24 px), so they get no rule.
//
//   node scripts/tvfonts.mjs          rewrite src/tv/fonts.css
//
// test/tvcss.test.js re-runs this in memory and fails if the file is stale, so
// a new font-size in style.css cannot slip under the floor. Hand-written sizes
// (the HUD, the cards) are in src/tv/tv.css, which loads after this file.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT_PX = 24; // html.tv font-size at 1080p (16 px x 1.5)
export const FLOOR_PX = 24;
export const GROWNUP_FLOOR_PX = 20;

// The only selectors allowed under 24 px: sheets a grown-up reads, the
// diagnostics, and the touch UI (hidden on a TV). Visible here so a change
// shows up in review (test/tvcss.test.js pins this list).
export const GROWNUP_20 = Object.freeze([
  '#perf-readout', '#perf-diag',
  '.hb-usage > summary', '.hb-usage-table', '.hb-usage-table thead th',
  '.sync-col h3', '.sync-backup-line', '.code-label', '.redeem-input', '.redeem-msg',
  '.settings-advanced .settings-row', '.hb-grownups-door', '.hb-grownups-door .hb-row-icon',
  '.colony-pair-text', '.colony-pair-wait', '.colony-pair-label', '.colony-pair-input', '.colony-pair-error',
  '.wt-nearby-code, .nearby-card-code', '.wt-petname input, .wt-join-row input',
  '.walk-together .wt-heading', '.walk-together button, .friend-code-block button',
  '.tui-badge', '.tui-label',
]);

// The map's SVG words are in user units of the map's own drawing, not screen px: the map is already
// sized with the window (--tv-s would double them again on a 4K screen, and they would crowd each other).
// tv.css sets them in plain user units, from the map's measured scale; the capture audit checks the result.
export const SVG_UNITS = Object.freeze(['.territory-map .tm-line', '.territory-map .tm-icon', '.territory-map .tm-small', '.world-map .tm-line-small']);

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// [{ sel, value }] for every font-size (and font: shorthand size) in a stylesheet, media rules included.
export function fontDeclarations(css) {
  const out = [];
  const walk = (str) => {
    let pos = 0;
    while (pos < str.length) {
      const open = str.indexOf('{', pos);
      if (open < 0) break;
      const sel = str.slice(pos, open).trim().replace(/\s+/g, ' ');
      let d = 1, j = open + 1;
      while (j < str.length && d > 0) { if (str[j] === '{') d++; else if (str[j] === '}') d--; j++; }
      const body = str.slice(open + 1, j - 1);
      if (/^@(media|supports)/.test(sel)) walk(body);
      else if (!sel.startsWith('@')) {
        for (const m of body.matchAll(/(?:^|[;\s])font-size\s*:\s*([^;]+)/g)) out.push({ sel, value: m[1].trim().replace(/\s*!important$/, '') });
        // font: [weight] 11px/1.35 family: the size is the token before an optional /line-height
        for (const m of body.matchAll(/(?:^|[;\s])font\s*:\s*([^;]+)/g)) {
          const s = m[1].match(/(?:^|\s)(\d*\.?\d+(?:px|rem|em))(?:\/|\s|$)/);
          if (s) out.push({ sel, value: s[1] });
        }
      }
      pos = j;
    }
  };
  walk(strip(css));
  return out;
}

/** { px, unit } of a plain px / rem / em / % value at ui scale 1, or null for anything else. */
export function plainSize(value) {
  const m = String(value).trim().match(/^(\d*\.?\d+)(px|rem|em|%)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return { unit: m[2], px: m[2] === 'px' ? n : m[2] === '%' ? (n / 100) * ROOT_PX : n * ROOT_PX };
}

export function splitSelectors(sel) {
  const out = [];
  let d = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') d++;
    if (ch === ')' || ch === ']') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const fmt = (n) => String(Math.round(n * 100) / 100);

/** [{ sel, target }]: every selector that needs a TV rule, and its size in px at 1080p. */
export function fontFloors(styleCss) {
  const grown = new Set(GROWNUP_20);
  const bySel = new Map();
  for (const { sel, value } of fontDeclarations(styleCss)) {
    if (SVG_UNITS.includes(sel)) continue;
    const size = plainSize(value);
    if (!size) continue;
    const e = bySel.get(sel) ?? { max: 0, need: false };
    e.max = Math.max(e.max, size.px);
    // a rem of one or more is already at the floor and grows with the root; anything else is pinned in px or relative
    const floor = grown.has(sel) ? GROWNUP_FLOOR_PX : FLOOR_PX;
    if (size.unit !== 'rem' || size.px < floor) e.need = true;
    bySel.set(sel, e);
  }
  return [...bySel].filter(([, e]) => e.need)
    .map(([sel, e]) => ({ sel, target: Math.max(e.max, grown.has(sel) ? GROWNUP_FLOOR_PX : FLOOR_PX) }));
}

/** The text of src/tv/fonts.css for a given style.css. */
export function buildFontsCss(styleCss) {
  const head = '/* GENERATED by scripts/tvfonts.mjs from src/style.css: do not edit by hand. The 24 px floor\n   (20 px for the grown-ups\' sheets), scaled by --tv-s. test/tvcss.test.js fails if this is stale. */\n';
  return head + fontFloors(styleCss)
    .map(({ sel, target }) => `${splitSelectors(sel).map((x) => `html.tv ${x}`).join(', ')} { font-size: calc(${fmt(target)}px * var(--tv-s, 1)) !important; }`)
    .join('\n') + '\n';
}

const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  writeFileSync(`${root}src/tv/fonts.css`, buildFontsCss(readFileSync(`${root}src/style.css`, 'utf8')));
  console.log('wrote src/tv/fonts.css');
}
