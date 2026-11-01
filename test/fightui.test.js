import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderChallengeHtml, renderFightHtml, createFightUi, FIGHT_TEACH } from '../src/ui/fightui.js';
import { CLUES, BUTTONS } from '../src/fight.js';
import { clanName } from '../src/clanhomes.js';
import { RANK_WORDS, OUTSIDE_WORDS, PLACE_WORDS, CLAN_SUFFIX } from '../src/clanwords.js';

// The project has no DOM: a small recording fake, enough for createFightUi.
class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.cls = new Set();
    this.listeners = {};
    this.innerHTMLWrites = 0;
    this._html = '';
    this.classList = {
      add: (c) => this.cls.add(c),
      remove: (c) => this.cls.delete(c),
      toggle: (c, on) => (on ? this.cls.add(c) : this.cls.delete(c)),
      contains: (c) => this.cls.has(c),
    };
  }
  get className() { return [...this.cls].join(' '); }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.innerHTMLWrites += 1; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  // A click on the button carrying this attribute inside the element.
  clickOn(attr, value) {
    const target = {
      closest: (sel) => (sel.includes(`[${attr}]`) || sel.includes(attr)
        ? { getAttribute: (a) => (a === attr ? value : null) } : null),
    };
    for (const fn of this.listeners.click ?? []) fn({ target, preventDefault() {} });
  }
}

function withDoc(fn) {
  const prev = globalThis.document;
  globalThis.document = { createElement: (t) => new FakeEl(t) };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.document; else globalThis.document = prev;
  }
}

const BORROWED = [...Object.values(OUTSIDE_WORDS), ...Object.values(RANK_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX];
const borrowed = (text) => BORROWED.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
const movesOf = (html) => [...html.matchAll(/data-move="([a-z]+)"/g)].map((m) => m[1]);
const PHASES = [
  { phase: 'squareOff', clue: null, round: 0, wins: 0, losses: 0, line: null },
  { phase: 'clue', clue: CLUES.pounce, round: 1, wins: 0, losses: 0, line: null },
  { phase: 'clue', clue: CLUES.charge, round: 2, wins: 1, losses: 0, line: 'Steady… look again 👀' },
  { phase: 'tumble', clue: null, round: 2, wins: 1, losses: 1, line: 'It got that one!' },
  { phase: 'beat', clue: null, round: 2, wins: 2, losses: 1, line: 'Nice one! 🐾' },
];

describe('the challenge pill', () => {
  test('names the cat and its clan, with the two buttons', () => {
    const html = renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' });
    expect(html).toContain(`Mossjaw of ${clanName('moor')} is on your land!`);
    expect(html).toMatch(/data-fight="go"[^>]*>Fight! 🐾</);
    expect(html).toMatch(/data-fight="off"[^>]*>Back off</);
  });

  test('escapes a hostile name', () => {
    const html = renderChallengeHtml({ name: '<img src=x onerror=alert(1)>', clan: 'moor' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('only the composed clan name is a borrowed word', () => {
    const html = renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' });
    expect(borrowed(html.replace(clanName('moor'), ''))).toEqual([]);
  });

  test('its root is a hud-prompt, so touch lets taps through, and E / Q answer it', () => withDoc(() => {
    const root = new FakeEl();
    const onFight = vi.fn(), onBackOff = vi.fn(), onMove = vi.fn();
    const ui = createFightUi(root, { onFight, onBackOff, onMove });
    expect(ui.showing).toBeNull();
    expect(ui.key('e')).toBe(false); // nothing up: not mine
    expect(onFight).not.toHaveBeenCalled();
    ui.showChallenge({ name: 'Mossjaw', clan: 'moor' });
    expect(ui.showing).toBe('challenge');
    const pill = root.children.find((c) => c.cls.has('hud-fight-ask'));
    expect(pill.cls.has('hud-prompt')).toBe(true);
    pill.clickOn('data-fight', 'go');
    expect(onFight).toHaveBeenCalledTimes(1);
    pill.clickOn('data-fight', 'off');
    expect(onBackOff).toHaveBeenCalledTimes(1);
    expect(ui.key('E')).toBe(true);
    expect(ui.key('q')).toBe(true);
    expect(onFight).toHaveBeenCalledTimes(2);
    expect(onBackOff).toHaveBeenCalledTimes(2);
    expect(ui.key('1')).toBe(false); // move keys are the sheet's only
    expect(onMove).not.toHaveBeenCalled();
    ui.hide();
    expect(ui.showing).toBeNull();
    expect(root.children).toHaveLength(0);
  }));
});

describe('the fight sheet', () => {
  test('always has the three moves, in order Pounce, Swipe, Dodge', () => {
    for (const m of PHASES) {
      const html = renderFightHtml(m);
      expect(movesOf(html)).toEqual(['pounce', 'swipe', 'dodge']);
      expect(movesOf(html)).toEqual(BUTTONS);
      expect(html).toMatch(/>Pounce</);
      expect(html).toMatch(/>Swipe</);
      expect(html).toMatch(/>Dodge</);
    }
  });

  test('the teach line is there in every phase', () => {
    expect(FIGHT_TEACH).toBe('Crouch → Dodge · Paw up → Pounce · Backs up → Swipe');
    for (const m of PHASES) expect(renderFightHtml(m)).toContain(FIGHT_TEACH);
  });

  test('the square-off says read its move; the clue shows its icon and text', () => {
    expect(renderFightHtml(PHASES[0])).toContain('Read its move!');
    for (const c of Object.values(CLUES)) {
      const html = renderFightHtml({ phase: 'clue', clue: c, round: 1, wins: 0, losses: 0, line: null });
      expect(html).toContain(c.icon);
      expect(html).toContain(c.text);
    }
  });

  test('round lines and paw pips', () => {
    expect(renderFightHtml(PHASES[2])).toContain('Steady… look again 👀');
    expect(renderFightHtml(PHASES[3])).toContain('It got that one!');
    expect(renderFightHtml(PHASES[4])).toContain('Nice one! 🐾');
    const html = renderFightHtml({ phase: 'beat', clue: null, round: 2, wins: 1, losses: 1, line: null });
    expect((html.match(/class="pip on"/g) ?? []).length).toBe(2);
    expect((html.match(/class="pip"/g) ?? []).length).toBe(2);
    const fresh = renderFightHtml(PHASES[0]);
    expect((fresh.match(/class="pip on"/g) ?? []).length).toBe(0);
    expect((fresh.match(/class="pip"/g) ?? []).length).toBe(4);
  });

  test('nothing in it spells a borrowed word', () => {
    for (const m of PHASES) expect(borrowed(renderFightHtml(m))).toEqual([]);
  });

  test('the sheet: moves by tap and by 1 / 2 / 3, #hud marked fighting, redrawn only when it changes', () => withDoc(() => {
    const root = new FakeEl();
    const onMove = vi.fn(), onFight = vi.fn();
    const ui = createFightUi(root, { onFight, onBackOff() {}, onMove });
    ui.showChallenge({ name: 'Mossjaw', clan: 'moor' });
    ui.showFight(PHASES[1]);
    expect(ui.showing).toBe('fight');
    expect(root.children.filter((c) => c.cls.has('hud-fight-ask'))).toHaveLength(0);
    const sheet = root.children.find((c) => c.cls.has('hud-fight'));
    expect(sheet).toBeTruthy();
    expect(root.cls.has('fighting')).toBe(true);
    ui.showFight(PHASES[1]);
    expect(sheet.innerHTMLWrites).toBe(1);
    sheet.clickOn('data-move', 'swipe');
    expect(onMove).toHaveBeenLastCalledWith('swipe');
    ui.key('1'); ui.key('2'); ui.key('3');
    expect(onMove.mock.calls.slice(1).map((c) => c[0])).toEqual(['pounce', 'swipe', 'dodge']);
    ui.key('e');
    expect(onFight).not.toHaveBeenCalled();
    ui.hide();
    expect(root.cls.has('fighting')).toBe(false);
    expect(root.children).toHaveLength(0);
    expect(ui.showing).toBeNull();
  }));
});

describe('the sheet on a phone (style.css)', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  test('the sheet takes taps, sits over the touch layer, and hides the action buttons', () => {
    expect(rule('.hud-fight')).toContain('pointer-events: auto');
    expect(rule('.hud-fight')).toMatch(/z-index: [3-9]/);
    expect(css).toMatch(/#hud\.fighting \.tui-actions[^{]*#hud\.fighting \.tui-zoom[^{]*\{[^}]*display: none/);
    expect(css).toMatch(/#hud\.fighting \.hud-toasts\s*\{[^}]*bottom:/);
  });

  test('the three buttons: one row, at least 88 px tall and 30% wide, above the safe area', () => {
    const btn = rule('.fight-move');
    expect(btn).toMatch(/min-height: (8[89]|9\d|1\d\d)px/);
    expect(btn).toMatch(/min-width: 30%/);
    expect(rule('.hud-fight')).toContain('env(safe-area-inset-bottom)');
    expect(rule('.fight-clue-icon')).toMatch(/font-size: (6[4-9]|[7-9]\d)px/);
  });

  test('short screens and landscape: the buttons stack in a column on the right', () => {
    const at = css.indexOf('@media (max-height: 500px) {\n  .hud-fight');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('\n}', at));
    expect(block).toContain('.fight-moves');
    expect(block).toContain('flex-direction: column');
    expect(block).toMatch(/min-height: 6[4-9]px/);
  });
});
