import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGamepad } from '../src/gamepad.js';
import { createSpin } from '../src/ui/spin.js';
import { setTv, resetTv, padTag, tvState } from '../src/tvseam.js';
import { glyphify } from '../src/tv/glyphs.js';
import { confirmCardHtml } from '../src/ui/confirmcard.js';
import { gateCardHtml } from '../src/gatecross.js';
import { crossCardHtml } from '../src/bordercross.js';
import { watchStrip, STRIP_FADE_MS } from '../src/tv/stripfade.js';

// TV clutter, round 2 (owner photos 2026-11-22). Layout needs a real browser (the capture driver measured it);
// these pin the rules that make it hold, and the code that is not CSS.
const TV = readFileSync(new URL('../src/tv/tv.css', import.meta.url), 'utf8');
const R2 = TV.slice(TV.lastIndexOf('/*', TV.indexOf('Round 2 (owner photos of round 1)')));
const rule = (sel) => {
  const i = R2.indexOf(sel + ' {');
  expect(i, sel).toBeGreaterThan(-1);
  return R2.slice(i, R2.indexOf('}', i));
};

describe('round 2 CSS is TV only', () => {
  it('every rule after the round-2 banner is under html.tv (or inside a media rule of such rules)', () => {
    const body = R2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
    const selectors = [...body.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(40);
    for (const sel of selectors) for (const part of sel.replace(/\([^)]*\)/g, '()').split(',')) expect(part.trim().startsWith('html.tv'), part).toBe(true);
  });
});

describe('the clan pick', () => {
  it('is five tiles in a row, three and two on a narrow window, on a solid scrim inside the safe margins', () => {
    expect(rule('html.tv .join-moment .dr-homes')).toContain('repeat(5, minmax(0, 1fr))');
    expect(R2).toMatch(/@media \(max-width: 1500px\) \{ html\.tv \.join-moment \.dr-homes \{ grid-template-columns: repeat\(3/);
    expect(rule('html.tv .join-moment')).toMatch(/rgba\(14, 19, 29, 0\.96\)/);
    expect(rule('html.tv .join-moment')).toContain('var(--tv-safe-x');
  });
  it('the clan name is body size, the place and note are the small size, Not yet is a big button', () => {
    expect(rule('html.tv .join-moment .dr-home .dr-home-name')).toContain('var(--tv-body)');
    expect(rule('html.tv .join-moment-note')).toContain('var(--tv-small)');
    expect(rule('html.tv .join-moment-later')).toMatch(/min-height: calc\(64px/);
  });
});

describe('yes / no dialogs', () => {
  it('buttons are at least 84 px tall at 1080p, body-size words that never wrap, and fill the row equally', () => {
    const r = R2.slice(R2.indexOf('html.tv :is(.nearby-card-btns button'));
    const b = r.slice(0, r.indexOf('}'));
    expect(b).toMatch(/min-height: calc\(84px/);
    expect(b).toContain('font-size: var(--tv-body)');
    expect(b).toContain('white-space: nowrap');
    expect(b).toContain('flex: 1 1 0');
    expect(b).toContain('.cross-card button');
  });
  it('the question is the title size on a solid scrim inside the safe margins', () => {
    expect(rule('html.tv .colony-notice-line')).toContain('var(--tv-title)');
    expect(rule('html.tv .colony-news')).toContain('var(--tv-safe-x');
    expect(rule('html.tv .colony-news')).toMatch(/rgba\(14, 19, 29, 0\.92\)/);
  });
  it('the crossing card gets a scrim, hides the walking HUD behind it, and the glyph never takes the click', () => {
    expect(R2).toMatch(/html\.tv body:has\(#overlay:not\(\.hidden\) \.cross-card\) #hud :is\([^)]*\.hud-controls[^)]*\.hud-prompt/);
    expect(rule('html.tv button .pad-glyph')).toContain('pointer-events: none');
    expect(rule('html.tv .cross-card #btn-cross-yes')).toContain('#f2c14e');
    // no far-off grid row: it would stretch the card by a hundred gaps
    expect(R2).not.toMatch(/grid-row: \d{2}/);
    expect(R2).toContain('grid-auto-flow: row dense');
    expect(R2).toContain('grid-template-columns: repeat(2, minmax(0, calc(490px');
  });
  it('the fight ask has big buttons', () => {
    expect(rule('html.tv .fight-ask-go, html.tv .fight-ask-off')).toMatch(/min-height: calc\(72px/);
  });
});

describe('pad pictures on the dialogs', () => {
  beforeEach(() => resetTv());
  afterEach(() => resetTv());
  const padOn = () => setTv({ input: 'pad', html: (s) => glyphify(s, 'ps') });
  it('padTag is empty with TV mode off or the keyboard as the input', () => {
    expect(padTag('⟦back⟧')).toBe('');
    setTv({ html: (s) => glyphify(s, 'ps') });
    expect(tvState.input).toBe('keys');
    expect(padTag('⟦back⟧')).toBe('');
  });
  it('with the pad on, Not now carries Circle and Yes carries Cross', () => {
    padOn();
    const h = confirmCardHtml({ text: 'Open City Park for 50?', yes: 'Yes, open it', no: 'Not now' });
    const no = h.slice(h.indexOf('id="confirm-card-no"'), h.indexOf('</button>', h.indexOf('id="confirm-card-no"')));
    const yes = h.slice(h.indexOf('id="confirm-card-yes"'), h.indexOf('</button>', h.indexOf('id="confirm-card-yes"')));
    expect(no).toContain('pad-glyph');
    expect(no).toContain('<circle cx="12" cy="12" r="4.6"');
    expect(yes).toContain('pad-glyph');
    expect(yes).toContain('M8 8l8 8M16 8l-8 8');
  });
  it('the keyboard and touch cards are unchanged', () => {
    const h = confirmCardHtml({ text: 'Open City Park for 50?', yes: 'Yes, open it', no: 'Not now' });
    expect(h).not.toContain('pad-glyph');
    expect(gateCardHtml({ name: 'The Farm' })).not.toContain('pad-glyph');
    expect(crossCardHtml({ name: 'The Farm' })).not.toContain('pad-glyph');
  });
  it('the gateway and border cards carry the same two pictures', () => {
    padOn();
    for (const h of [gateCardHtml({ name: 'The Farm' }), crossCardHtml({ name: 'The Farm' })]) {
      expect((h.match(/pad-glyph/g) || []).length).toBe(2);
      expect(h).toContain('id="btn-cross-yes"');
    }
  });
});

describe('Home again!', () => {
  it('has tiles of one height in one row, with labels on one line, and two text sizes under the title', () => {
    expect(rule('html.tv .summary-stats, html.tv .summary-stats.five')).toContain('grid-auto-rows: 1fr');
    expect(rule('html.tv .summary-stats .stat-label')).toContain('white-space: nowrap');
    expect(rule('html.tv .summary-card .summary-cheer, html.tv .summary-card .best-line, html.tv .summary-card .record-banner')).toContain('var(--tv-body)');
  });
  it('Continue is a big button', () => {
    expect(rule('html.tv .summary-card .primary')).toMatch(/min-height: calc\(76px/);
  });
});

describe('Change place', () => {
  it('is a wide card with a fixed side panel for the picked place, and no close X', () => {
    expect(rule('html.tv .homebase-scroll.hb-sheet[data-sheet="places"]')).toMatch(/1760px/);
    expect(rule('html.tv .wm-frame:has(.wm-card) .world-map')).toContain('width: 66%');
    expect(rule('html.tv .wm-card')).toContain('width: 32%');
    expect(rule('html.tv .dr-where .wm-card .wm-card-close')).toContain('display: none');
  });
  it('the map keeps names only: every place line is hidden (today\'s place has its ring, the picked one its panel)', () => {
    expect(rule('html.tv .world-map .tm-line, html.tv .world-map .tm-line-small')).toContain('display: none');
  });
  it('the map\'s words are in plain user units (never --tv-s), at least 34 for the small ones', () => {
    for (const sel of ['html.tv .world-map .tm-name[font-size="28"]', 'html.tv .world-map .tm-small']) {
      const r = rule(sel);
      expect(r).not.toContain('--tv-s');
      expect(Number(r.match(/font-size:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(34);
    }
  });
  it('zoom buttons are big', () => {
    expect(rule('html.tv .wm-frame .wm-zoom button')).toMatch(/width: calc\(76px/);
  });
});

describe('the home base', () => {
  it('pills and the Menu button share a height; cat slots are big', () => {
    expect(rule('html.tv .dr-top :is(.hb-pill, .hb-points, .hb-menu-btn)')).toMatch(/min-height: calc\(64px/);
    expect(rule('html.tv .dr .dr-portrait')).toMatch(/width: calc\(84px/);
  });
  it('Today\'s place fills the right column (no empty row)', () => {
    expect(R2).toContain('grid-template-areas: "header header" "hero wearing" "hero today" "hero dock"');
    expect(rule('html.tv .dr-view-home .dr-today-frame .dr-today-card')).toContain('aspect-ratio: auto');
    expect(rule('html.tv .dr-view-home .dr-today-frame')).toContain('flex: 1 1 0');
  });
  it('one focus ring for every control, the map\'s: thick white with a dark halo, scaled; never on a card itself (tabindex -1)', () => {
    expect(R2).toContain('html.tv .pad-focus :focus:not([tabindex="-1"]), html.tv .pad-focus :focus-visible:not([tabindex="-1"]) { outline: calc(5px * var(--tv-s, 1)) solid #fff !important;');
    expect(R2).toContain('box-shadow: 0 0 0 calc(10px * var(--tv-s, 1)) rgba(20, 16, 30, 0.7)');
  });
});

describe('the key strip fades after the first minute of a walk', () => {
  function rig(hiddenAtStart = true) {
    const cls = new Set(hiddenAtStart ? ['hidden'] : []);
    const bodyCls = new Set();
    const hud = { classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) } };
    const doc = { getElementById: (id) => (id === 'hud' ? hud : null), body: { classList: { contains: (c) => bodyCls.has(c), add: (c) => bodyCls.add(c), remove: (c) => bodyCls.delete(c) } } };
    let cb = null;
    class MO { constructor(f) { cb = f; } observe() {} disconnect() { cb = null; } }
    const timers = [];
    const win = { MutationObserver: MO, setTimeout: (f, ms) => { const t = { f, ms, live: true }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.live = false; } };
    const toggle = (hidden) => { if (hidden) cls.add('hidden'); else cls.delete('hidden'); cb?.(); };
    return { doc, win, bodyCls, timers, toggle };
  }
  it('is a minute', () => { expect(STRIP_FADE_MS).toBe(60000); });
  it('waits for a walk (the HUD shown), then switches the strip off after a minute', () => {
    const r = rig();
    const w = watchStrip(r.doc, r.win);
    expect(r.timers.filter((t) => t.live)).toHaveLength(0);
    r.toggle(false);
    const live = r.timers.filter((t) => t.live);
    expect(live).toHaveLength(1);
    expect(live[0].ms).toBe(60000);
    live[0].f();
    expect(r.bodyCls.has('tv-strip-off')).toBe(true);
    w.stop();
    expect(r.bodyCls.has('tv-strip-off')).toBe(false);
  });
  it('a new walk brings the strip back and starts the minute again; the same state again does nothing', () => {
    const r = rig();
    watchStrip(r.doc, r.win);
    r.toggle(false);
    const first = r.timers.filter((t) => t.live)[0];
    first.f(); first.live = false;
    expect(r.bodyCls.has('tv-strip-off')).toBe(true);
    r.toggle(true);
    expect(r.bodyCls.has('tv-strip-off')).toBe(false);
    r.toggle(false);
    expect(r.timers.filter((t) => t.live)).toHaveLength(1);
    const n = r.timers.length;
    r.toggle(false);
    expect(r.timers.length).toBe(n);
  });
  it('the CSS fades it', () => {
    expect(R2).toContain('html.tv body.tv-strip-off .hud-controls { opacity: 0; pointer-events: none; }');
  });
});

describe('the pad\'s right stick turns the cat on the home screen', () => {
  const ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
  const pad = (axes) => ({ index: 0, connected: true, mapping: 'standard', id: ID, axes, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  function rig(onLook) {
    const listeners = {};
    const win = { addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {} };
    let current = pad([0, 0, 0, 0]);
    const menuNav = { enter() {}, step() {}, alt() {}, press() {}, scroll: vi.fn(), settle() {} };
    const g = createGamepad({ win, nav: { getGamepads: () => [current] }, doc: null, menuNav, getEngaged: () => false, toast() {}, onLook });
    (listeners.gamepadconnected || []).forEach((f) => f({ gamepad: current }));
    return { g, menuNav, set: (axes) => { current = pad(axes); } };
  }
  it('createSpin.nudge turns it without a coast', () => {
    const s = createSpin();
    const a = s.angle;
    s.nudge(0.25);
    expect(s.angle).toBeCloseTo(a + 0.25);
    expect(s.step(0.1).moving).toBe(false);
  });
  it('a push to the right turns by a positive angle, a push to the left by a negative one, and the page does not scroll when the cat took it', () => {
    const look = vi.fn(() => true);
    const r = rig(look);
    r.g.poll(0.016);
    r.set([0, 0, 1, 0]);
    r.g.poll(0.1);
    expect(look).toHaveBeenCalledTimes(1);
    expect(look.mock.calls[0][0]).toBeGreaterThan(0.2);
    r.set([0, 0, -1, 0]);
    r.g.poll(0.1);
    expect(look.mock.calls[1][0]).toBeLessThan(-0.2);
    expect(r.menuNav.scroll).not.toHaveBeenCalled();
  });
  it('with no cat to turn the stick scrolls as before', () => {
    const r = rig(() => false);
    r.g.poll(0.016);
    r.set([0, 0, 0, 1]);
    r.g.poll(0.1);
    expect(r.menuNav.scroll).toHaveBeenCalled();
  });
  it('a stick at rest asks for no turn', () => {
    const look = vi.fn(() => true);
    const r = rig(look);
    r.g.poll(0.016);
    r.g.poll(0.1);
    expect(look).not.toHaveBeenCalled();
  });
});
