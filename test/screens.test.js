import { describe, it, expect, vi, afterEach } from 'vitest';
import { portraitEntry, herCatPortrait } from '../src/thumbnails.js';
import { pauseCardHtml } from '../src/game/walk.js';
import { DEFAULT_LOOK, presetFor } from '../src/customcats.js';
import { summaryCheer, countUp, bestWalkConfetti, prefersReducedMotion, summaryStatsHtml, settingsSwitchHtml } from '../src/ui/screencards.js';
import { readFileSync } from 'node:fs';

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

describe('summary cards (screencards.js)', () => {
  const CHEERS = ['What a walk!', 'Great exploring!', 'Happy paws!', 'You did it!', 'Lovely walk!'];
  const node = (count, suffix) => ({ dataset: suffix == null ? { count: String(count) } : { count: String(count), suffix }, textContent: `${count}${suffix ?? ''}` });
  const rootOf = (nodes) => ({ querySelectorAll: (sel) => (sel === '[data-count]' ? nodes : []) });
  const fakeClock = () => {
    let t = 1000;
    const queue = [];
    return {
      raf: vi.fn((cb) => { queue.push(cb); return queue.length; }),
      now: () => t,
      step(ms) { t += ms; const cb = queue.shift(); if (cb) cb(t); return !!cb; },
      pending: () => queue.length,
    };
  };

  it('summaryCheer is a fixed, friendly pick', () => {
    const a = summaryCheer(5, 0);
    expect(CHEERS).toContain(a);
    expect(summaryCheer(5, 0)).toBe(a);
    expect(summaryCheer(0, 0)).toBe(CHEERS[0]);
    expect(summaryCheer(3, 4)).toBe(CHEERS[2]);
  });

  it('countUp steps each number up to its final value, keeping a suffix', () => {
    const a = node(12); const b = node(2, '/3'); const z = node(0);
    const c = fakeClock();
    countUp(rootOf([a, b, z]), { reduced: false, raf: c.raf, now: c.now, ms: 900 });
    c.step(0);
    expect(z.textContent).toBe('0');
    const seen = [a.textContent];
    let guard = 0;
    while (c.pending() && guard++ < 100) { c.step(100); seen.push(a.textContent); }
    expect(guard).toBeLessThan(100);
    expect(a.textContent).toBe('12');
    expect(b.textContent).toBe('2/3');
    expect(z.textContent).toBe('0');
    expect(seen[0]).toBe('0');
    expect(new Set(seen).size).toBeGreaterThan(2);
    const nums = seen.map(Number);
    expect(nums).toEqual([...nums].sort((x, y) => x - y));
  });

  it('countUp under reduced motion shows the final text at once, no frames', () => {
    const a = node(12); const b = node(2, '/3');
    a.textContent = 'x'; b.textContent = 'y';
    const c = fakeClock();
    countUp(rootOf([a, b]), { reduced: true, raf: c.raf, now: c.now });
    expect(a.textContent).toBe('12');
    expect(b.textContent).toBe('2/3');
    expect(c.raf).toHaveBeenCalledTimes(0);
  });

  it('bestWalkConfetti: none under reduced motion, else 40 seeded pieces', () => {
    expect(bestWalkConfetti(5, { reduced: true })).toBe('');
    const spy = vi.spyOn(Math, 'random');
    const one = bestWalkConfetti(5, { reduced: false });
    expect(one.match(/<i /g)).toHaveLength(40);
    expect(bestWalkConfetti(5, { reduced: false })).toBe(one);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('prefersReducedMotion: the in-game setting alone is enough, with or without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion({ get: () => true })).toBe(true);
    expect(prefersReducedMotion({ get: () => false })).toBe(false);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(prefersReducedMotion({ get: () => false })).toBe(true);
    vi.unstubAllGlobals();
  });

  it('summaryStatsHtml: tiles with an emoji and a counting number; a den walk has no goals tile', () => {
    const html = summaryStatsHtml({ earned: 7, discoveries: 2, friendsGreeted: 1, goalsDone: 2, hasGoals: true });
    expect(html).toMatch(/^<div class="summary-stats">/);
    expect(html.match(/class="stat"/g)).toHaveLength(4);
    for (const e of ['🐾', '🔍', '😺', '⭐']) expect(html).toContain(e);
    expect(html).toContain('data-count="7">7<');
    expect(html).toContain('data-count="2" data-suffix="/3">2/3<');
    const den = summaryStatsHtml({ earned: 0, discoveries: 0, friendsGreeted: 0, goalsDone: 0, hasGoals: false });
    expect(den.match(/class="stat"/g)).toHaveLength(3);
    expect(den).not.toContain('/3');
    expect(den).not.toContain('⭐');
    expect(den).toContain('data-count="0">0<');
  });
});

describe('walk summary markup (walk.js source)', () => {
  const src = () => readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  it('sits on the panel with her cat, cheer, stats, and counts up after mount', () => {
    const s = src();
    const at = s.indexOf('const summaryHtml');
    const tpl = s.slice(at, s.indexOf('</div>`;', at));
    expect(tpl).toContain('<div class="summary-card">');
    expect(tpl).toContain('bestWalkConfetti(earned, { reduced })');
    expect(tpl).toContain('<div class="screen-panel summary-panel">');
    expect(tpl).toMatch(/portrait \? `<img class="screen-cat" src="\$\{escapeHtml\(portrait\)\}" alt="">`/);
    expect(tpl).toContain('<div class="summary-cheer">${escapeHtml(summaryCheer(earned, discoveries))}</div>');
    expect(tpl).toContain('summaryStatsHtml(');
    expect(tpl).toContain('<button id="btn-summary-continue" class="primary">Continue</button>');
    expect(tpl.indexOf('bestWalkConfetti')).toBeLessThan(tpl.indexOf('screen-panel'));
    expect(s).toMatch(/overlay\.innerHTML = summaryHtml;\s*countUp\(overlay, \{ reduced \}\);/);
    expect(s).toContain('const reduced = prefersReducedMotion(settings);');
    expect(s).toContain('const portrait = session.portrait;');
  });
});

describe('Settings: switches, soft sliders, pill selects', () => {
  const css = () => readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const hb = () => readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
  // The body of the first rule whose selector list contains `sel`.
  const rule = (sel) => {
    const s = css();
    const at = s.indexOf(sel);
    expect(at, sel).toBeGreaterThan(-1);
    return s.slice(s.indexOf('{', at) + 1, s.indexOf('}', at));
  };

  it('a switch row is a whole <label>: real checkbox with role=switch, then the drawn switch', () => {
    const on = settingsSwitchHtml('set-muted', true, 'Mute all sound');
    expect(on).toBe('<label class="settings-row settings-switch"><span class="settings-label">Mute all sound</span>'
      + '<input type="checkbox" role="switch" id="set-muted" checked /><span class="switch" aria-hidden="true"></span></label>');
    const off = settingsSwitchHtml('set-hide-chat', false, 'Hide chat bubbles');
    expect(off).toContain('<input type="checkbox" role="switch" id="set-hide-chat" />');
    expect(off).not.toContain('checked');
  });

  it('every settings checkbox goes through the switch row, ids unchanged', () => {
    const s = hb();
    const at = s.indexOf('function renderSettings');
    const body = s.slice(at, s.indexOf('function renderFriendCode', at));
    expect(body).not.toContain('type="checkbox"');
    for (const id of ['set-muted', 'set-invert-y', 'set-left-handed', 'set-reduced-motion', 'set-hide-chat', 'set-perf-readout']) {
      expect(body).toMatch(new RegExp(`settingsSwitchHtml\\('${id}', `));
    }
    expect(body).toContain('<button id="btn-reset" class="danger">Start over</button>');
    expect(body).toContain('<h2>Settings ⚙️</h2>');
    expect(body).toContain('<input type="range" class="settings-range" id="set-volume" style="--fill:${pct}%" ');
    expect(body).toContain('<input type="range" class="settings-range" id="set-music-volume" style="--fill:${musicPct}%" ');
    expect(s).toContain("if (e.target.classList?.contains('settings-range')) e.target.style.setProperty('--fill', `${e.target.value}%`);");
  });

  it('the checkbox is hidden by appearance, not display:none, and its switch shows a focus ring', () => {
    const input = rule('.settings-switch input');
    expect(input).toMatch(/appearance:\s*none/);
    expect(input).not.toMatch(/display:\s*none/);
    expect(css()).toMatch(/\.settings-switch input:focus-visible \+ \.switch\s*\{[^}]*outline:\s*3px solid #fff;[^}]*outline-offset:\s*2px/);
    const track = rule('.settings-switch .switch {');
    expect(track).toMatch(/width:\s*46px/);
    expect(track).toMatch(/height:\s*26px/);
    expect(track).toContain('#33425e');
    expect(rule('.settings-switch input:checked + .switch {')).toContain('#e7a9a0');
    const knob = rule('.settings-switch .switch::after');
    expect(knob).toMatch(/width:\s*20px/);
    expect(knob).toContain('#f1e0c2');
    expect(css()).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*\.settings-switch \.switch::after[^}]*transition:\s*none/);
  });

  it('sliders are pink with a cream thumb; selects are pills', () => {
    const range = rule('.settings-section input[type="range"] {');
    expect(range).toContain('accent-color: #e7a9a0');
    expect(range).toMatch(/appearance:\s*none/);
    expect(css()).toContain('.settings-section input[type="range"]::-webkit-slider-thumb');
    expect(css()).toContain('.settings-section input[type="range"]::-moz-range-thumb');
    const sel = rule('.settings-section select {');
    expect(sel).toMatch(/appearance:\s*none/);
    expect(sel).toContain('border-radius: 999px');
    expect(sel).toContain('#2c3d58');
    expect(sel).toContain('1px solid #8c9bb4');
    expect(sel).toContain('padding-right: 34px');
    expect(sel).toContain('min-height: 40px');
    expect(sel).toContain('data:image/svg+xml');
    expect(css()).toMatch(/\.settings-section select:focus-visible[^{]*\{[^}]*outline:\s*3px solid #fff/);
    const reset = rule('.settings-section .danger {');
    expect(reset).toContain('#e98a8a');
    expect(reset).toContain('border-radius: 999px');
  });
});
