import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGamepad } from '../src/gamepad.js';
import { PAD_BUTTONS } from '../src/gamepadinput.js';
import { createFightUi, answerChallenge } from '../src/ui/fightui.js';
import { tvState } from '../src/tvseam.js';

// A recording fake DOM, enough for createFightUi.
class FakeEl {
  constructor() { this.children = []; this.cls = new Set(); this.listeners = {}; this._html = ''; this.style = {}; this.offsetHeight = 0;
    this.classList = { add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), toggle: (c, on) => (on ? this.cls.add(c) : this.cls.delete(c)), contains: (c) => this.cls.has(c) }; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/)); }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  remove() {} addEventListener() {} setAttribute() {}
}
const btns = (...down) => Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 }));

// The pad exactly as main.js wires it: pad frames -> onAction -> answerChallenge(clanFight, name).
function rig({ input }) {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => new FakeEl(), body: new FakeEl() };
  tvState.on = input === 'pad'; tvState.input = input;
  const calls = { fight: vi.fn(), off: vi.fn(), fallback: vi.fn() };
  const ui = createFightUi(new FakeEl(), { onFight: calls.fight, onBackOff: calls.off });
  ui.showChallenge({ name: 'Ash', clan: 'thunder' });
  const clanFight = { uiShowing: 'challenge', key: (k) => ui.key(k) };
  let cur = btns();
  const g = createGamepad({
    win: { addEventListener() {}, removeEventListener() {} }, doc: null,
    nav: { getGamepads: () => [{ index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: cur }] },
    getEngaged: () => true, isFighting: () => clanFight.uiShowing === 'fight',
    menuNav: { enter() {}, step() {}, alt() {}, press() {}, scroll() {}, settle() {} },
    onAction: (name) => { if (answerChallenge(clanFight, name)) return; calls.fallback(name); },
  });
  const press = (i) => { cur = btns(i); g.poll(0.016); cur = btns(); g.poll(0.016); };
  return { calls, press, done: () => { globalThis.document = prev; tvState.on = false; tvState.input = 'keys'; } };
}

describe.each(['keys', 'pad'])('challenge pill by pad (input %s)', (input) => {
  it('Square is Fight! and nothing else', () => {
    const r = rig({ input });
    r.press(PAD_BUTTONS.X);
    expect(r.calls.fight).toHaveBeenCalledTimes(1);
    expect(r.calls.fallback).not.toHaveBeenCalled();
    r.done();
  });
  it('Circle is Back off and nothing else', () => {
    const r = rig({ input });
    r.press(PAD_BUTTONS.B);
    expect(r.calls.off).toHaveBeenCalledTimes(1);
    expect(r.calls.fallback).not.toHaveBeenCalled();
    r.done();
  });
  it('other buttons still reach the walk', () => {
    const r = rig({ input });
    r.press(PAD_BUTTONS.A);
    expect(r.calls.fallback).toHaveBeenCalledWith('pounce');
    expect(r.calls.fight).not.toHaveBeenCalled();
    r.done();
  });
});

describe('answerChallenge', () => {
  it('ignores a sheet, an idle fight and a missing fight', () => {
    const cf = { uiShowing: 'fight', key: vi.fn() };
    expect(answerChallenge(cf, 'interact')).toBe(false);
    expect(answerChallenge({ uiShowing: null, key: cf.key }, 'meow')).toBe(false);
    expect(answerChallenge(undefined, 'interact')).toBe(false);
    expect(cf.key).not.toHaveBeenCalled();
  });
});

describe('main.js wiring', () => {
  it('both the touch buttons and the pad route through answerChallenge', () => {
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(src.match(/answerChallenge\(session\?\.clanFight, name\)/g)?.length).toBe(2);
  });
});
