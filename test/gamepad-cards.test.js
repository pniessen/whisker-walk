// T12: the pad's B on cards, and the clan-fight sheet and pill answered by pad.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { padBackAction, walkBackAction } from '../src/ui/backstack.js';
import { createFightUi, renderChallengeHtml } from '../src/ui/fightui.js';
import { setTv, resetTv } from '../src/tvseam.js';
import { padLine } from '../src/tv/padwords.js';
import { glyphify, plainify } from '../src/tv/glyphs.js';
import { BUTTONS } from '../src/fight.js';

afterEach(() => resetTv());

describe('padBackAction (B with no home-base layer up)', () => {
  it('on the Ready? or pause card it walks on, exactly as Start does', () => {
    expect(padBackAction({ walking: true, cardUp: true })).toBe('resume');
  });
  it('not while a walk-on, the den shop (or its question), the find card or a crossing is up: those have their own Back', () => {
    for (const k of ['walkingOn', 'shopAsk', 'shop', 'findCard', 'crossing']) {
      expect(padBackAction({ walking: true, cardUp: true, [k]: true }), k).toBe('back');
    }
  });
  it('on the summary it does nothing (A presses Continue; B never does it by accident)', () => {
    expect(padBackAction({ summary: true })).toBe('none');
    // the browser\'s Back still continues it
    expect(walkBackAction({ summary: true })).toBe('continue');
  });
  it('under the fight sheet it does nothing: Back off is the pill\'s', () => {
    expect(padBackAction({ fight: true, walking: true, cardUp: true })).toBe('none');
  });
  it('mid-walk or at the home base it is the usual Back', () => {
    expect(padBackAction({ walking: true })).toBe('back');
    expect(padBackAction({})).toBe('back');
  });
});

// A recording fake, enough for createFightUi (no DOM in this project).
class El {
  constructor() { this.cls = new Set(); this.attrs = {}; this.children = []; this.listeners = {}; this._html = ''; this.parent = null;
    this.classList = { add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), toggle: (c, on) => (on ? this.cls.add(c) : this.cls.delete(c)), contains: (c) => this.cls.has(c) }; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.cls].join(' '); }
  set innerHTML(v) { this._html = v; } get innerHTML() { return this._html; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { c.parent = this; this.children.push(c); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  addEventListener(t, f) { this.listeners[t] = f; }
  querySelector(sel) { return sel === '.fight-move' ? this.first : null; }
}
function withDoc(fn) {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => new El(), body: new El() };
  try { return fn(); } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
}
const PHASE = { phase: 'clue', clue: { icon: '🐾', text: 'Paw up' }, round: 1, wins: 0, losses: 0, line: null };

describe('the fight sheet for the pad', () => {
  it('is a pad layer with the first move as its entry control, and a tap on a move still answers', () => withDoc(() => {
    const root = new El();
    const onMove = vi.fn();
    const ui = createFightUi(root, { onMove });
    ui.showChallenge({ name: 'Mossjaw', clan: 'moor' });
    // the sheet\'s first move, as the navigator would find it
    const firstMove = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const orig = El.prototype.querySelector;
    El.prototype.querySelector = function q(sel) { return sel === '.fight-move' ? firstMove : orig.call(this, sel); };
    try { ui.showFight(PHASE); } finally { El.prototype.querySelector = orig; }
    const sheet = root.children.find((c) => c.cls.has('hud-fight'));
    expect(sheet.attrs['data-pad-layer']).toBe('');
    expect(firstMove.attrs['data-pad-default']).toBe('');
    // the pad presses a button: a click on a move
    sheet.listeners.click({ target: { closest: () => ({ getAttribute: (a) => (a === 'data-move' ? BUTTONS[1] : null) }) } });
    expect(onMove).toHaveBeenCalledWith(BUTTONS[1]);
  }));
});

describe('the challenge pill\'s keys', () => {
  it('keyboard play: E and Q, exactly as before (TV off, or TV on with the keyboard as the input)', () => {
    const off = renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' });
    expect(off).toContain('<span class="fight-key">E</span>');
    expect(off).toContain('<span class="fight-key">Q</span>');
    setTv({ on: true, input: 'keys', padLine, html: (s) => glyphify(s, 'ps'), text: (s) => plainify(s, 'ps') });
    expect(renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' })).toBe(off);
  });
  it('with the pad as the input the pill shows Square and Circle pictures, and no E or Q', () => {
    setTv({ on: true, input: 'pad', padLine, html: (s) => glyphify(s, 'ps'), text: (s) => plainify(s, 'ps') });
    const h = renderChallengeHtml({ name: 'Mossjaw', clan: 'moor' });
    expect(h).not.toMatch(/fight-key/);
    expect((h.match(/<svg/g) || [])).toHaveLength(2);
    expect(h).not.toMatch(/⟦/);
  });
});
