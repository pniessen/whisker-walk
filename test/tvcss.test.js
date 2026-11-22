import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fontDeclarations, splitSelectors, buildFontsCss, GROWNUP_20, SVG_UNITS, ROOT_PX, FLOOR_PX, GROWNUP_FLOOR_PX,
} from '../scripts/tvfonts.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const STYLE = read('../src/style.css');
const FONTS = read('../src/tv/fonts.css');
const TV = read('../src/tv/tv.css');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Evaluates a font-size value at ui scale s: px, rem (TV root is 24 px x s), em and %
// (against that root, where simple), calc, max, min and var(--tv-s).
// The TV type-system sizes (--tv-title, --tv-body, --tv-small) are custom properties in tv.css; a font-size that names one is read through it.
const TV_VARS = Object.fromEntries([...TV.matchAll(/--tv-(title|body|small):\s*(calc\([^;]+\));/g)].map((m) => [m[1], m[2]]));
function evalSize(value, s) {
  let v = String(value).replace(/\s*!important$/, '').trim();
  v = v.replace(/var\(--tv-(title|body|small)\)/g, (_, k) => TV_VARS[k] ?? 'NaN');
  v = v.replace(/var\(--tv-s(?:,\s*[\d.]+)?\)/g, `(${s})`);
  v = v.replace(/(\d*\.?\d+)px/g, '($1)').replace(/(\d*\.?\d+)rem/g, `($1*${ROOT_PX}*${s})`)
    .replace(/(\d*\.?\d+)em/g, `($1*${ROOT_PX}*${s})`).replace(/(\d*\.?\d+)%/g, `($1/100*${ROOT_PX}*${s})`);
  v = v.replace(/\bcalc\(/g, '(').replace(/\bmax\(/g, 'Math.max(').replace(/\bmin\(/g, 'Math.min(');
  if (!/^[\d\s.()*+\-/,Mathxin]+$/.test(v)) return NaN;
  return Function(`"use strict"; return (${v});`)();
}

// selector (without the html.tv prefix) -> the size TV mode gives it; the last rule wins, fonts.css first.
function tvOverrides() {
  const map = new Map();
  for (const { sel, value } of [...fontDeclarations(FONTS), ...fontDeclarations(TV)]) {
    for (const one of splitSelectors(sel)) {
      const key = one.replace(/^html\.tv\s+/, '').trim();
      map.set(key, value);
    }
  }
  return map;
}

// Maps a style.css selector list to the keys the overrides use (a list is overridden as a list or one by one).
function overrideFor(map, sel) {
  if (map.has(sel)) return map.get(sel);
  const parts = splitSelectors(sel);
  if (parts.length > 1 && parts.every((p) => map.has(p))) return map.get(parts[0]);
  return undefined;
}

describe('the generated 24 px floor', () => {
  it('src/tv/fonts.css is what scripts/tvfonts.mjs makes from src/style.css (run: node scripts/tvfonts.mjs)', () => {
    expect(FONTS).toBe(buildFontsCss(STYLE));
  });

  it('the 20 px allow-list is visible here: only grown-up sheets, diagnostics and hidden touch labels', () => {
    expect([...GROWNUP_20]).toEqual([
      '#perf-readout', '#perf-diag',
      '.hb-usage > summary', '.hb-usage-table', '.hb-usage-table thead th',
      '.sync-col h3', '.sync-backup-line', '.code-label', '.redeem-input', '.redeem-msg',
      '.settings-advanced .settings-row', '.hb-grownups-door', '.hb-grownups-door .hb-row-icon',
      '.colony-pair-text', '.colony-pair-wait', '.colony-pair-label', '.colony-pair-input', '.colony-pair-error',
      '.wt-nearby-code, .nearby-card-code', '.wt-petname input, .wt-join-row input',
      '.walk-together .wt-heading', '.walk-together button, .friend-code-block button',
      '.tui-badge', '.tui-label',
    ]);
    expect([FLOOR_PX, GROWNUP_FLOOR_PX]).toEqual([24, 20]);
  });
});

describe('every font-size on a TV is at least 24 px at 1080p (20 on the allow-list), and grows with the window', () => {
  const overrides = tvOverrides();
  const decls = fontDeclarations(STYLE);
  it('finds the declarations', () => expect(decls.length).toBeGreaterThan(250));

  for (const s of [1, 2]) {
    it(`at ui scale ${s}`, () => {
      const bad = [];
      for (const { sel, value } of decls) {
        if (SVG_UNITS.includes(sel)) continue; // the map's own units (checked by the map's rules in test/tvclutter2.test.js)
        const size = evalSize(overrideFor(overrides, sel) ?? value, s);
        const floor = (GROWNUP_20.includes(sel) ? GROWNUP_FLOOR_PX : FLOOR_PX) * s;
        // a size that is neither px, rem, em nor % is a font shorthand with its own size: fonts.css has its rule
        if (!(size >= floor - 1e-6)) bad.push(`${sel} { ${value} } -> ${Number.isNaN(size) ? 'unreadable' : `${size.toFixed(1)} px`}, wants ${floor}`);
      }
      expect(bad).toEqual([]);
    });
  }
});

describe('the TV stylesheet', () => {
  it('has no @import: it must load with the chunk and nothing else', () => {
    expect(strip(TV)).not.toMatch(/@import/);
    expect(strip(FONTS)).not.toMatch(/@import/);
  });

  it('every rule is under html.tv', () => {
    for (const css of [TV, FONTS]) {
      const rules = strip(css).split('}').map((r) => r.split('{')[0].trim()).filter(Boolean);
      // (a media rule's own head is not a selector; its rules are checked in test/tvclutter2.test.js)
      for (const sel of rules.filter((r) => !r.startsWith('@media'))) for (const one of splitSelectors(sel)) expect(one, one).toMatch(/^html\.tv\b/);
    }
  });

  it('keeps the HUD and the screens inside the safe margins', () => {
    const t = strip(TV);
    expect(t).toMatch(/html\.tv #hud\s*\{[^}]*inset:\s*var\(--tv-safe-y[^}]*var\(--tv-safe-x/);
    expect(t).toMatch(/html\.tv #homebase, html\.tv #overlay > \*\s*\{[^}]*padding:\s*var\(--tv-safe-y[^}]*var\(--tv-safe-x/);
  });

  it('every HUD rule that places something from the bottom of the screen has a TV override', () => {
    const t = strip(TV);
    const base = strip(STYLE);
    for (const sel of ['.hud-controls', '.hud-hint', '.hud-prompt', '.hud-toasts']) {
      expect(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*bottom:`).test(base), `${sel} in style.css`).toBe(true);
      expect(new RegExp(`html\\.tv ${sel.replace('.', '\\.')}\\s*\\{[^}]*bottom:`).test(t), `${sel} in tv.css`).toBe(true);
    }
  });

  it('hides the touch controls and the idle cursor, and shows the corner map bigger', () => {
    const t = strip(TV);
    expect(t).toMatch(/body\[data-input="pad"\] \.touch-ui[^{]*\{[^}]*display:\s*none/);
    // never unconditional: touch input shows the touch controls again
    expect(t).not.toMatch(/html\.tv \.touch-ui|html\.tv \[class/);
    expect(t).toMatch(/tv-idle[^{]*\{[^}]*cursor:\s*none/);
    expect(/--map-size:\s*min\(calc\(220px \* var\(--tv-s, 1\)\), 36vw\)/.test(t)).toBe(true); // 220 px, but never over a third of a narrow window
  });
});
