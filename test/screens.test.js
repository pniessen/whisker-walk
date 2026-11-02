import { describe, it, expect, vi, afterEach } from 'vitest';
import { portraitEntry, herCatPortrait } from '../src/thumbnails.js';
import { pauseCardHtml } from '../src/game/walk.js';
import { DEFAULT_LOOK, presetFor } from '../src/customcats.js';

afterEach(() => vi.restoreAllMocks());

describe('portraitEntry', () => {
  it('a ready-made cat: its breed, no look, only what she wears', () => {
    const e = portraitEntry({ equipped: { cat: 'siamese', collar: 'bell', head: null } });
    expect(e.breed).toBe('siamese');
    expect(e.look).toBeNull();
    expect(e.wear).toEqual({ collar: 'bell' });
    expect(e.key).toBe(`her:siamese:null:${JSON.stringify({ collar: 'bell' })}`);
  });

  it('a custom cat: its own look on its preset breed', () => {
    const look = { ...DEFAULT_LOOK, coat: 'black', eyes: 'blue' };
    const state = {
      equipped: { cat: 'tabby', custom: 'mine1', collar: null, head: 'flower' },
      customCats: [{ id: 'mine1', name: 'Ember', personality: 'keenNose', look }],
    };
    const e = portraitEntry(state);
    expect(e.breed).toBe(presetFor('keenNose'));
    expect(e.look).toEqual(look);
    expect(e.wear).toEqual({ head: 'flower' });
    expect(e.key).toContain(JSON.stringify(e.look));
  });
});

describe('herCatPortrait', () => {
  it('without WebGL returns null, never throws, and draws nothing from Math.random', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.spyOn(Math, 'random');
    let out;
    expect(() => { out = herCatPortrait({ equipped: { cat: 'tabby', collar: 'bell' } }); }).not.toThrow();
    expect(out).toBeNull();
    expect(spy).toHaveBeenCalledTimes(0);
    warn.mockRestore();
  });
});

describe('pauseCardHtml', () => {
  // No DOM in these tests: read the markup as a string.
  const button = (html, id) => {
    const m = html.match(new RegExp(`<button([^>]*\\bid="${id}"[^>]*)>([\\s\\S]*?)</button>`));
    expect(m, id).not.toBeNull();
    return { attrs: m[1], inner: m[2] };
  };

  it('puts the card on a panel with her cat on top', () => {
    const html = pauseCardHtml({ welcome: 'Hi', touch: false, portrait: 'data:image/png;base64,AA' });
    expect(html).toMatch(/^<div class="pause-card"><div class="screen-panel">/);
    const img = html.match(/<img class="screen-cat"[^>]*>/);
    expect(img).not.toBeNull();
    expect(img[0]).toContain('src="data:image/png;base64,AA"');
    expect(img[0]).toContain('alt=""');
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<h1>Ready?</h1>'));
  });

  it('no portrait, no img', () => {
    const html = pauseCardHtml({ welcome: 'Hi', touch: true });
    expect(html).toContain('class="screen-panel"');
    expect(html).not.toContain('<img');
  });

  it('buttons are pills holding plain text only', () => {
    for (const touch of [true, false]) {
      const html = pauseCardHtml({ welcome: null, touch, portrait: 'data:image/png;base64,AA' });
      const resume = button(html, 'btn-resume');
      const end = button(html, 'btn-end');
      expect(resume.attrs).toMatch(/class="primary"/);
      expect(end.attrs).toMatch(/class="secondary"/);
      expect(resume.inner).not.toContain('<');
      expect(end.inner).not.toContain('<');
      expect(html).toMatch(/<div class="screen-actions">\s*<button[^>]*id="btn-resume"/);
    }
  });
});
