import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The switch's real checkbox is opacity:0, which hides its own outline, so the
// pad ring (body.pad-focus :focus) never showed on the pause card's and the
// Settings sheet's Sound/Music switches. The ring is drawn on the whole row.
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

describe('pad ring on switch rows', () => {
  it('draws a white ring on the row when its input has focus, under .pad-focus only', () => {
    const m = css.match(/\.pad-focus \.settings-switch:has\(input:focus\)\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/outline:\s*3px solid #fff/);
    expect(m[1]).toMatch(/outline-offset/);
  });
  it('keeps the invisible input from drawing its own (invisible) ring', () => {
    expect(css).toMatch(/\.pad-focus \.settings-switch input:focus\s*\{[^}]*outline:\s*none/);
  });
  it('the row is a positioning context, so the input covers just its row', () => {
    expect(css).toMatch(/\.settings-row \{\s*position: relative;/);
  });
});
