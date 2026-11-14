// Sideways phones, tiny windows and enlarged text (UX review, finding 11).
// The fix is CSS only, in one section at the end of style.css. These tests
// pin what makes it safe: every rule in the section sits behind a media query
// that an upright phone (390x844), a tablet (768x1024, 1024x768) and a laptop
// (1280x800) can never match, and the handful of rules that carry the fix are
// still there.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const START = '/* ===== Sideways phones, tiny windows and enlarged text';
const section = css.slice(css.indexOf(START));

// The section's top-level blocks: [{ query, body }].
function blocks(text) {
  const out = [];
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0; let head = ''; let body = ''; let stray = '';
  for (const ch of bare) {
    if (ch === '{') { if (depth === 0) { head = stray.trim(); stray = ''; body = ''; } else body += ch; depth += 1; continue; }
    if (ch === '}') { depth -= 1; if (depth === 0) out.push({ query: head, body }); else body += ch; continue; }
    if (depth === 0) stray += ch; else body += ch;
  }
  return { out, stray: stray.trim() };
}

// Does one media query list match a screen? Only the features the section uses.
function matches(query, { w, h }) {
  const list = query.replace(/^@media\s*/, '').split(',');
  return list.some((q) => q.split(/\s+and\s+/).every((part) => {
    const m = part.trim().match(/^\(([a-z-]+):\s*([a-z0-9]+)\)$/);
    if (!m) throw new Error(`unknown media feature: ${part}`);
    const [, feature, value] = m;
    const px = parseInt(value, 10);
    if (feature === 'max-width') return w <= px;
    if (feature === 'min-width') return w >= px;
    if (feature === 'max-height') return h <= px;
    if (feature === 'min-height') return h >= px;
    if (feature === 'orientation') return value === (w > h ? 'landscape' : 'portrait');
    throw new Error(`unknown media feature: ${feature}`);
  }));
}

const WORKS_TODAY = [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1280, h: 800 }, { w: 375, h: 667 }, { w: 360, h: 640 }];
const SIDEWAYS = [{ w: 844, h: 390 }, { w: 667, h: 375 }, { w: 932, h: 430 }];

describe('small screens: the section at the end of style.css', () => {
  const { out, stray } = blocks(section);

  it('is the last thing in the file and holds nothing outside a media query', () => {
    expect(css.indexOf(START)).toBeGreaterThan(0);
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(stray).toBe('');
    for (const b of out) expect(b.query).toMatch(/^@media /);
  });

  it('never reaches an upright phone, a tablet or a laptop', () => {
    for (const b of out) for (const screen of WORKS_TODAY) expect(matches(b.query, screen), `${b.query} at ${screen.w}x${screen.h}`).toBe(false);
  });

  const at = (screen) => out.filter((b) => matches(b.query, screen)).map((b) => b.body).join('\n');

  it('a phone on its side: home fits one screen, with the notch sides kept clear', () => {
    for (const screen of SIDEWAYS) {
      const rules = at(screen);
      expect(rules).toMatch(/\.dr:not\(\.dr-building\) \{ min-height: 0; \}/);
      expect(rules).toMatch(/grid-template-areas: "header header" "hero wearing" "hero today" "hero dock"/);
      expect(rules).toMatch(/\.dr \{[^}]*env\(safe-area-inset-left\)[^}]*\}/);
      expect(rules).toMatch(/\.dr \{[^}]*env\(safe-area-inset-right\)[^}]*\}/);
      expect(rules).toMatch(/\.homebase-scroll \{[^}]*env\(safe-area-inset-left\)/);
    }
  });

  it('a phone on its side: the builder puts the cat beside its rows', () => {
    const rules = at(SIDEWAYS[0]);
    expect(rules).toMatch(/\.dr\.dr-building \{[^}]*grid-template-areas: "header header" "hero cb"/);
    expect(rules).toMatch(/\.dr-building \.dr-stage \{[^}]*100dvh/);
  });

  it('a card over a short screen scrolls inside itself (its row is the screen, not the card)', () => {
    for (const screen of [...SIDEWAYS, { w: 320, h: 256 }, { w: 195, h: 422 }]) {
      const rules = at(screen);
      expect(rules).toMatch(/\.colony-news \{ grid-template-rows: minmax\(0, 1fr\);/);
      expect(rules).toMatch(/\.visit-cel:not\(\.style-c\) \.visit-cel-card \{[^}]*overflow-y: auto/);
    }
    // the cards themselves already scroll: these are the rules the row relies on
    expect(css).toMatch(/\.colony-news-card \{[^}]*max-height: 100%; overflow-y: auto/);
    expect(css).toMatch(/\.join-moment \.join-moment-card \{[^}]*max-height: 100%; overflow-y: auto/);
  });

  it('a tiny or zoomed window: home scrolls and Start stays stuck to the bottom', () => {
    for (const screen of [{ w: 320, h: 256 }, { w: 195, h: 422 }]) {
      const rules = at(screen);
      expect(rules).toMatch(/\.dr:not\(\.dr-building\) \{ height: auto; min-height: 100%; \}/);
      expect(rules).toMatch(/\.dr-dock \{ position: sticky; bottom: 0;/);
    }
  });

  it('a narrow window: Dress up and the place get a row each, and words wrap whole', () => {
    for (const screen of [{ w: 320, h: 568 }, { w: 320, h: 256 }, { w: 195, h: 422 }]) {
      const rules = at(screen);
      expect(rules).toMatch(/grid-template-areas: "header" "hero" "wearing" "today" "dock"/);
      expect(rules).toMatch(/\.dr-today-name, \.dr-slot span \{ overflow-wrap: break-word; \}/);
    }
    const narrow = at({ w: 195, h: 422 });
    expect(narrow).toMatch(/\.dr-slots \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(narrow).toMatch(/\.cb-foot \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});
