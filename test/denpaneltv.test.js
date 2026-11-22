// The den panel under TV mode (den shop UX M3): target sizes at 1080p and the old list card gone.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const TV = readFileSync(new URL('../src/tv/tv.css', import.meta.url), 'utf8');
const FONTS = readFileSync(new URL('../src/tv/fonts.css', import.meta.url), 'utf8');
const rule = (sel) => (TV.match(new RegExp(`html\\.tv ${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`)) ?? [])[1] ?? '';

describe('den panel under html.tv', () => {
  it('spots are at least 96 px square, tabs and chips at least 64 px tall (x --tv-s)', () => {
    expect(rule('.dp-spot')).toMatch(/min-height: calc\(96px \* var\(--tv-s, 1\)\)/);
    expect(rule('.dp-spot')).toMatch(/min-width: calc\(96px \* var\(--tv-s, 1\)\)/);
    expect(TV).toMatch(/html\.tv \.dp-chip, html\.tv \.ds-tab[^{]*\{[^}]*min-height: calc\(64px/);
  });
  it('the plan labels, chips and edges sit on the 24 px floor', () => {
    for (const c of ['.dp-label', '.dp-chip-name', '.dp-chip-at', '.dp-edge']) {
      expect(FONTS).toContain(`html.tv ${c} { font-size: calc(24px * var(--tv-s, 1)) !important; }`);
    }
  });
  it('the per-spot list card is gone, not extended', () => {
    expect(existsSync(new URL('../src/tv/spotlist.js', import.meta.url))).toBe(false);
    expect(TV).not.toContain('.ls-card');
    expect(TV).not.toContain('ds-spot-open');
  });
});
