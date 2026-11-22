import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The TV type system and card rules (owner photos 2026-11-22). Layout itself needs a real browser
// (the capture driver in the branch notes); these pin the rules that make it hold.
const TV = readFileSync(new URL('../src/tv/tv.css', import.meta.url), 'utf8');
const block = (sel) => {
  const i = TV.indexOf(sel + ' {');
  expect(i, sel).toBeGreaterThan(-1);
  return TV.slice(i, TV.indexOf('}', i));
};

describe('TV type system', () => {
  it('has three sizes only for the cards: title 52, body 28, small 24 (x --tv-s)', () => {
    const sec = TV.slice(TV.indexOf('The TV type system'), TV.indexOf('The boot splash'));
    const sizes = new Set([...sec.matchAll(/font-size:\s*calc\((\d+)px \* var\(--tv-s, 1\)\)/g)].map((m) => Number(m[1])));
    expect([...sizes].sort((a, b) => a - b)).toEqual([24, 28, 52]);
  });
  it('body text is weight 500 and 1.4 line height; only titles and buttons are 700', () => {
    expect(TV).toMatch(/\.screen-panel[^{]*\{ font-weight: 500; line-height: 1\.4; text-wrap: pretty; \}/);
  });
});

describe('the pause card on a TV', () => {
  it('chips are as wide as their text and never wrap or overlap', () => {
    expect(block('html.tv .pause-view-chips')).toContain('repeat(4, max-content)');
    expect(block('html.tv .pause-view-chip')).toContain('white-space: nowrap');
    expect(block('html.tv .pause-view-chips')).toMatch(/gap: var\(--tv-gap\)/);
  });
  it('the card is wide, and its key list is a two-column grid', () => {
    expect(block('html.tv .pause-card .screen-panel')).toMatch(/width: min\(calc\(980px/);
    expect(block('html.tv .screen-panel .controls-hint')).toContain('grid-template-columns: repeat(2');
  });
  it('a card hides every walking-HUD layer behind it, with a solid scrim', () => {
    const rule = TV.slice(TV.indexOf('html.tv body:has(#overlay:not(.hidden)'));
    for (const c of ['.hud-controls', '.hud-hint', '.hud-prompt', '.hud-toasts', '.hud-goals', '.hud-objective', '.hud-top', '.hud-map']) expect(rule.slice(0, rule.indexOf('}'))).toContain(c);
    expect(block('html.tv .pause-card, html.tv .summary-card')).toMatch(/rgba\(14, 19, 29, 0\.88\)/);
  });
  it('the key strip gives way to a tip, a toast and a context pill', () => {
    expect(block('html.tv #hud.hinting .hud-controls')).toContain('display: none');
    expect(TV).toMatch(/html\.tv #hud:has\(\.toast, \.hud-prompt:not\(\.hidden\)\) \.hud-controls \{ display: none; \}/);
  });
  it('a card never grows past the safe area', () => {
    expect(block('html.tv .screen-panel')).toMatch(/max-height: calc\(100vh - 2 \* var\(--tv-safe-y/);
  });
});

describe('the splash on a TV', () => {
  it('is about a third of the width, with the edition line at the floor, and the card waits for it', () => {
    expect(TV).toMatch(/html\.tv \.splash-word \{ font-size: calc\(75px/);
    expect(TV).toMatch(/html\.tv \.splash-edition \{ font-size: calc\(30px/);
    expect(TV).toMatch(/html\.tv body:has\(#splash:not\(\[style\*="none"\]\)\) #overlay \{ visibility: hidden; \}/);
  });
});
