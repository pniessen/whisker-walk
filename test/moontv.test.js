// The Moon on a TV with a pad (the TV and pad pass): the telescope, the stamp picker and the binoculars are bigger inside the safe margin on a TV and name
// their buttons while the pad is the last input; every one is reachable by pad alone; every Moon line that names a key reads as a pad button through the
// same net the other places use (keysToPad), in both word sets. Real pads and a real TV are the owner's (docs/superpowers/plans/2026-11-23-moon.md).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fakePage } from './helpers/moonpage.js';
import { tvScale, makeHintBar, safeEdge } from '../src/world/moontv.js';
import { createScope } from '../src/world/moonscope.js';
import { createStampPicker, createEarthView } from '../src/world/moonstamps.js';
import { CONSTELLATIONS, createSolver, createHint, starSky, TOLERANCE } from '../src/world/moonstars.js';
import { LINES, HINTS } from '../src/world/moonwords.js';
import { setTv, resetTv, tvState } from '../src/tvseam.js';
import { glyphify, plainify, TOKENS } from '../src/tv/glyphs.js';
import { keysToPad } from '../src/tv/padwords.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { phrase } from '../src/clanphrases.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
afterEach(() => resetTv());

// a page that wears html.tv with the TV's root font size (24 px x --tv-s: 24 at 1080p, 48 at 4K)
function tvPage({ width = 1920, height = 1080, tv = true } = {}) {
  const page = fakePage({ width, height });
  const classes = new Set(tv ? ['tv'] : []);
  page.doc.documentElement = { classList: { contains: (c) => classes.has(c) } };
  page.win.getComputedStyle = () => ({ fontSize: `${24 * Math.min(2, Math.max(1, width / 1920))}px` });
  return page;
}
const pad = (over = {}) => ({ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })), ...over });
const press = (p, ...ix) => { ix.forEach((i) => { p.buttons[i] = { pressed: true }; }); };
const release = (p) => { p.buttons = Array.from({ length: 17 }, () => ({ pressed: false })); p.axes = [0, 0, 0, 0]; };
const px = (s) => parseFloat(s);

describe('the couch scale', () => {
  it('is 1 with no html.tv (a phone, a laptop, a test page): nothing changes off a TV', () => {
    expect(tvScale(fakePage().doc, null)).toEqual({ tv: false, s: 1, m: 1 });
    expect(tvScale(tvPage({ tv: false }).doc, tvPage().win)).toEqual({ tv: false, s: 1, m: 1 });
  });
  it('is 1 at 1080p and 2 at 4K on a TV (the TV\'s own --tv-s), and m is 1.5 times that', () => {
    const a = tvPage(); const b = tvPage({ width: 3840, height: 2160 });
    expect(tvScale(a.doc, a.win)).toEqual({ tv: true, s: 1, m: 1.5 });
    expect(tvScale(b.doc, b.win)).toEqual({ tv: true, s: 2, m: 3 });
  });
  it('keeps a corner button inside 5 % on a TV and 14 px elsewhere', () => {
    expect(safeEdge(true, 'top')).toContain('5vh');
    expect(safeEdge(true, 'side')).toContain('5vw');
    expect(safeEdge(false, 'top')).not.toContain('vh');
  });
});

describe('the pad bar', () => {
  const mk = (text = '⟦move⟧ look · ⟦back⟧ close') => { const p = fakePage(); const root = p.make('div'); return { root, ...makeHintBar({ doc: p.doc, root, text, scale: { tv: false, s: 1, m: 1 } }) }; };
  it('is hidden while the keyboard or a finger is the input', () => {
    const b = mk();
    expect(b.el.style.display).toBe('none');
    setTv({ input: 'touch' }); expect(b.el.style.display).toBe('none');
  });
  it('shows button pictures on a TV and plain symbols otherwise, the moment the pad is used', () => {
    const b = mk();
    setTv({ html: (s) => glyphify(s, 'ps'), text: (s) => plainify(s, 'ps'), input: 'pad' });
    expect(b.el.style.display).toBe('block');
    expect(b.el.innerHTML).toContain('pad-glyph');
    expect(b.el.innerHTML).not.toContain('⟦');
    setTv({ html: (s) => plainify(s, 'ps'), input: 'pad' });
    expect(b.el.innerHTML).toBe('L look · ○ close');
    setTv({ input: 'keys' });
    expect(b.el.style.display).toBe('none');
  });
  it('is nothing when the page has no pad line, and goes when the page does', () => {
    expect(mk('').el).toBeNull();
    const b = mk(); b.dispose();
    expect(b.root.children).toHaveLength(0);
  });
});

function scopeRig({ page = tvPage(), pads = [] } = {}) {
  const solver = createSolver(0); const hint = createHint(solver);
  const results = []; const closed = vi.fn(); const asked = vi.fn();
  const lines = { 'moon.pad.scope': '⟦move⟧ look · ⟦confirm⟧ pin · ⟦back⟧ close' };
  const scope = createScope({ doc: page.doc, win: page.win, solver, hint, sky: [], reducedMotion: true, line: (k) => lines[k] ?? k, pads: () => pads, onResult: (r) => results.push(r), onClose: closed, onAsk: asked });
  return { ...page, scope, solver, results, closed, asked };
}
const aim = (r, c, i) => { const s = starSky(CONSTELLATIONS[c], i); r.scope.view.b = s.b; r.scope.view.e = s.e; r.scope.place(); };

describe('the telescope on a TV', () => {
  it('has bigger round buttons inside the safe margin at 1080p and 4K, and the usual 56 px off a TV', () => {
    for (const [w, h, want] of [[1920, 1080, 84], [3840, 2160, 168]]) {
      const r = scopeRig({ page: tvPage({ width: w, height: h }) });
      r.scope.open();
      const [, close, bulb] = r.scope.element.children;
      expect(px(close.style.width)).toBe(want); expect(px(bulb.style.height)).toBe(want);
      expect(close.style.top).toContain('5vh'); expect(close.style.right).toContain('5vw'); expect(bulb.style.left).toContain('5vw');
      expect(px(close.style.fontSize)).toBeGreaterThanOrEqual(24);
    }
    const r = scopeRig({ page: tvPage({ tv: false }) });
    r.scope.open();
    const [, close] = r.scope.element.children;
    expect(close.style.width).toBe('56px'); expect(close.style.top).toBe('max(14px, env(safe-area-inset-top))'); expect(close.style.fontSize).toBe('26px');
  });
  it('carries the pad bar, which shows only while the pad is the input', () => {
    const r = scopeRig();
    r.scope.open();
    const bar = r.scope.element.children.find((c) => c.className === 'moon-padbar');
    expect(bar).toBeTruthy();
    expect(bar.style.display).toBe('none');
    setTv({ html: (s) => glyphify(s, 'ps'), input: 'pad' });
    expect(bar.style.display).toBe('block');
    expect(px(bar.style.font.match(/(\d+)px/)[1])).toBeGreaterThanOrEqual(28); // over the 24 px floor
    r.scope.close();
    expect(r.scope.element).toBeNull();
  });
  it('widens the snap and tap reach with the picture on a TV, and leaves it alone off one', () => {
    const on = scopeRig({ page: tvPage() }); on.scope.open(); aim(on, 0, 0);
    const s = starSky(CONSTELLATIONS[0], 0);
    // a star a little further than the old reach from the middle still snaps on a TV
    const k = Math.max(1, Math.min(1920 / 40, 1080 / 32));
    on.scope.view.b = s.b + (TOLERANCE.snap * 1.3) / k; on.scope.view.e = s.e; on.scope.place();
    expect(on.scope.pinSnapped()).not.toBeNull();
    const off = scopeRig({ page: tvPage({ tv: false }) }); off.scope.open();
    off.scope.view.b = s.b + (TOLERANCE.snap * 1.3) / k; off.scope.view.e = s.e; off.scope.place();
    expect(off.scope.pinSnapped()).toBeNull();
  });
});

describe('the telescope with a pad alone', () => {
  it('left stick pans, the d-pad pans, Cross pins the snapped star, Square asks for the next star, Circle closes', () => {
    const p = pad();
    const r = scopeRig({ pads: [p] });
    r.scope.open();
    release(p); r.scope.update(0.016, 0); // let go of whatever opened it
    const b0 = r.scope.view.b;
    p.axes = [1, 0, 0, 0]; r.scope.update(0.1, 0.1);
    expect(r.scope.view.b).toBeGreaterThan(b0);
    release(p);
    const e0 = r.scope.view.e;
    press(p, 12); r.scope.update(0.1, 0.2); // d-pad up
    expect(r.scope.view.e).toBeGreaterThan(e0);
    release(p); r.scope.update(0.016, 0.3);
    aim(r, 0, 0);
    press(p, 0); r.scope.update(0.016, 0.4);
    expect(r.results.some((x) => x.kind === 'pin')).toBe(true);
    release(p); r.scope.update(0.016, 0.5);
    press(p, 2); r.scope.update(0.016, 0.6);
    expect(r.asked).toHaveBeenCalled();
    release(p); r.scope.update(0.016, 0.7);
    press(p, 1); r.scope.update(0.016, 0.8);
    expect(r.scope.isOpen).toBe(false);
    expect(r.closed).toHaveBeenCalledTimes(1);
  });
  it('a pad alone traces a whole picture: five Cross presses on the five stars of the Mouse', () => {
    const p = pad();
    const r = scopeRig({ pads: [p] });
    r.scope.open(); release(p); r.scope.update(0.016, 0);
    const n = CONSTELLATIONS[0].pts.length;
    for (let i = 0; i < n; i++) { aim(r, 0, i); press(p, 0); r.scope.update(0.016, i); release(p); r.scope.update(0.016, i + 0.1); }
    expect(r.results.at(-1).kind).toBe('done');
    expect(r.solver.bits & 1).toBe(1);
  });
});

describe('the stamp picker and the binoculars on a TV with a pad', () => {
  const lines = { 'moon.pad.stamp': '⟦dpad⟧ choose · ⟦confirm⟧ pick · ⟦back⟧ close', 'moon.pad.binoc': '⟦confirm⟧ or ⟦back⟧ close' };
  it('draws big buttons (200 px at 1080p, 400 at 4K), a close button in the safe margin and the pad bar; 120 px off a TV', () => {
    for (const [w, h, box] of [[1920, 1080, 200], [3840, 2160, 400]]) {
      const page = tvPage({ width: w, height: h });
      const pk = createStampPicker({ doc: page.doc, win: page.win, line: (k) => lines[k] ?? k, pads: () => [] });
      pk.open();
      expect(pk.buttons.map((b) => px(b.style.width))).toEqual([box, box, box]);
      expect(px(page.doc.body.children[0].children[0].style.fontSize)).toBeGreaterThanOrEqual(36);
      const root = page.doc.body.children[0];
      expect(root.children.some((c) => c.className === 'moon-padbar')).toBe(true);
      expect(root.children.find((c) => c.tag === 'button' && c.style.top.includes('5vh'))).toBeTruthy();
      pk.close();
    }
    const page = tvPage({ tv: false });
    const pk = createStampPicker({ doc: page.doc, win: page.win, line: (k) => k, pads: () => [] });
    pk.open();
    expect(pk.buttons[0].style.width).toBe('120px');
    expect(page.doc.body.children[0].style.background).toBe('rgba(2,4,10,.62)');
  });
  it('is opaque enough on a TV that the walk\'s HUD does not show through', () => {
    const page = tvPage();
    const pk = createStampPicker({ doc: page.doc, win: page.win, line: (k) => k, pads: () => [] });
    pk.open();
    expect(page.doc.body.children[0].style.background).toBe('rgba(2,4,10,.94)');
  });
  it('a pad alone picks the heart: d-pad right twice, Cross; Circle closes without a pick', () => {
    const p = pad(); const picked = []; const closed = vi.fn();
    const page = tvPage();
    const pk = createStampPicker({ doc: page.doc, win: page.win, line: (k) => k, pads: () => [p], selected: 0, onPick: (i) => picked.push(i), onClose: closed });
    pk.open(); release(p); pk.update();
    for (let n = 0; n < 2; n++) { press(p, 15); pk.update(); release(p); pk.update(); }
    expect(pk.focus).toBe(2);
    press(p, 0); pk.update();
    expect(picked).toEqual([2]);
    const again = createStampPicker({ doc: page.doc, win: page.win, line: (k) => k, pads: () => [p], onPick: (i) => picked.push(i), onClose: closed });
    release(p); again.open(); again.update(); press(p, 1); again.update();
    expect(again.isOpen).toBe(false); expect(picked).toEqual([2]);
  });
  it('the binoculars close with Circle or Cross (as Esc and Space do), and a press that opened them does not close them', () => {
    const p = pad();
    const page = tvPage();
    const ev = createEarthView({ doc: page.doc, win: page.win, line: (k) => lines[k] ?? k, pads: () => [p], stamp: 1, reducedMotion: true });
    press(p, 0); ev.open(); ev.update(0.016, 0);
    expect(ev.isOpen).toBe(true);
    release(p); ev.update(0.016, 0.1);
    press(p, 0); ev.update(0.016, 0.2);
    expect(ev.isOpen).toBe(false);
    release(p); ev.open(); ev.update(0.016, 0); release(p); ev.update(0.016, 0.1);
    press(p, 1); ev.update(0.016, 0.2);
    expect(ev.isOpen).toBe(false);
  });
});

describe('every Moon line that names a key reads as a pad button', () => {
  const RAW = /\b(E|Space|Esc|Enter|WASD|click|Click|tap|Tap|swipe|arrow keys|[Pp]ress (E|Space|Esc|V|C|Enter))\b(?!\w)/; // ('press the big red button' is the Moon's own button, not a key)
  const all = () => Object.entries(LINES).map(([id]) => [id, phrase(id)]);
  const check = () => {
    for (const [id, text] of all()) {
      if (text.includes('⟦')) {
        for (const tok of text.match(/⟦(\w+)⟧/g)) expect(TOKENS, id).toContain(tok.slice(1, -1));
        continue;
      }
      const fixed = keysToPad(text);
      if (/^E — /.test(text)) expect(fixed, id).toMatch(/^⟦interact⟧ — /); // the net turns the walk's "E" into the pad's Square
      else expect(RAW.test(text), `${id}: "${text}"`).toBe(false); // no other raw key, mouse or touch word
      expect(RAW.test(fixed.replace(/^⟦interact⟧ — /, '')), id).toBe(false);
    }
  };
  it('in the family set', check);
  it('in the everyday set', () => { withOffWords(check); });
  it('the journal hints name no key either', () => {
    for (const [id, t] of Object.entries(HINTS)) expect(RAW.test(t), id).toBe(false);
  });
  it('every prompt is an E line (one Square press), and no Moon line asks for a key a pad has not got', () => {
    for (const [id, text] of all()) if (/\.prompt$/.test(id)) expect(text, id).toMatch(/^E — /);
  });
  it('the three pad lines are short, plain and say the same in both sets', () => {
    for (const id of ['moon.pad.scope', 'moon.pad.stamp', 'moon.pad.binoc']) {
      const a = phrase(id); const b = withOffWords(() => phrase(id));
      expect(a).toBe(b); expect(a.length).toBeLessThanOrEqual(90); expect(bannedIn(a)).toBeNull();
      expect(plainify(a, 'xbox')).not.toContain('⟦');
    }
  });
  it('the pages are handed those lines (the lives are not the only place a line must be wired)', () => {
    expect(read('src/world/moonstarlive.js')).toContain("'moon.pad.scope': () => phrase('moon.pad.scope')");
    const l = read('src/world/moonlaunchlive.js');
    expect(l).toContain("phrase('moon.pad.stamp')"); expect(l).toContain("phrase('moon.pad.binoc')");
  });
});

describe('the Moon\'s pages have no hard-coded pixel size a TV cannot grow', () => {
  it('the telescope and stamp pages read the couch scale and the safe margin', () => {
    for (const f of ['src/world/moonscope.js', 'src/world/moonstamps.js']) { const s = read(f); expect(s, f).toContain('tvScale'); expect(s, f).toContain('safeEdge'); expect(s, f).toContain('makeHintBar'); }
  });
  it('nothing here is start-up: the new file is only reached from the Moon\'s own files', () => {
    for (const f of ['src/main.js', 'src/ui/hud.js', 'src/tvseam.js', 'src/tv/tv.css']) expect(read(f)).not.toContain('moontv');
    expect(tvState.on).toBe(false);
  });
});
