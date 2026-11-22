import { describe, it, expect, vi } from 'vitest';
import { createGamepad } from '../src/gamepad.js';
import { PAD_BUTTONS } from '../src/gamepadinput.js';
import { WORDS } from '../src/tutorialwords.js';

const btns = (...down) => Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 }));
const mk = (axes = [0, 0, 0, 0], ...down) => ({ axes, buttons: btns(...down), connected: true, mapping: 'standard', index: 0 });
const { A, B, X, L1, R1, START } = PAD_BUTTONS;
const DOWN = 13, RIGHT = 15;

function rig(over = {}) {
  let current = mk();
  const listeners = {};
  const classes = new Set();
  const win = {
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((g) => g !== f); },
  };
  const doc = { body: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } }, activeElement: null, dispatchEvent: vi.fn() };
  const flags = { engaged: false, fighting: false, walkingOn: false, canResume: false };
  const menuNav = { step: vi.fn(), press: vi.fn(), alt: vi.fn(), enter: vi.fn(), scroll: vi.fn(), ...(over.menuNav || {}) };
  const calls = { onAction: vi.fn(), onResume: vi.fn(), onMove: vi.fn(), padBack: vi.fn(), toast: vi.fn() };
  const g = createGamepad({
    win, doc, nav: { getGamepads: () => [current] },
    getEngaged: () => flags.engaged, getCameraMode: () => false,
    isFighting: () => flags.fighting, isWalkingOn: () => flags.walkingOn,
    canResume: () => flags.canResume,
    onMove: calls.onMove, onOrbit: vi.fn(), onAction: calls.onAction, onResume: calls.onResume,
    toast: calls.toast, menuNav, padBack: calls.padBack,
  });
  return {
    g, flags, menuNav, calls, classes, doc, fire: (t) => (listeners[t] || []).forEach((f) => f({})),
    listeners,
    set: (axes, ...down) => { current = mk(axes, ...down); },
    frame: (axes, ...down) => { current = mk(axes, ...down); g.poll(0.016); },
  };
}

describe('menu mode', () => {
  it('A presses once per press, not per frame', () => {
    const r = rig();
    r.frame([0, 0, 0, 0]);
    r.frame([0, 0, 0, 0], A); r.frame([0, 0, 0, 0], A); r.frame([0, 0, 0, 0], A);
    expect(r.menuNav.press).toHaveBeenCalledTimes(1);
    r.frame(); r.frame([0, 0, 0, 0], A);
    expect(r.menuNav.press).toHaveBeenCalledTimes(2);
    expect(r.calls.onAction).not.toHaveBeenCalled();
  });
  it('enters the layer when menu mode begins', () => {
    const r = rig();
    r.flags.engaged = true; r.frame();
    expect(r.menuNav.enter).not.toHaveBeenCalled();
    r.flags.engaged = false; r.frame();
    expect(r.menuNav.enter).toHaveBeenCalledTimes(1);
  });
  it('B calls padBack and never dispatches Escape', () => {
    const r = rig();
    r.frame(); r.frame([0, 0, 0, 0], B);
    expect(r.calls.padBack).toHaveBeenCalledTimes(1);
    expect(r.doc.dispatchEvent).not.toHaveBeenCalled();
    expect(r.calls.onAction).not.toHaveBeenCalled();
  });
  it('X does nothing', () => {
    const r = rig();
    r.frame(); r.frame([0, 0, 0, 0], X);
    expect(r.calls.onAction).not.toHaveBeenCalled();
    expect(r.menuNav.press).not.toHaveBeenCalled();
  });
  it('Start resumes when the pause card is up', () => {
    const r = rig();
    r.flags.canResume = true;
    r.frame(); r.frame([0, 0, 0, 0], START);
    expect(r.calls.onResume).toHaveBeenCalledTimes(1);
    expect(r.calls.onAction).not.toHaveBeenCalled();
  });
  it('stick repeat obeys the gate: at once, 400 ms, then every 140 ms', () => {
    const r = rig();
    r.frame();
    for (let i = 0; i < 10; i++) r.frame([0, 0.9, 0, 0]); // 160 ms
    expect(r.menuNav.step).toHaveBeenCalledTimes(1);
    expect(r.menuNav.step.mock.calls[0][0]).toBe('down');
    for (let i = 0; i < 17; i++) r.frame([0, 0.9, 0, 0]); // ~432 ms in
    expect(r.menuNav.step.mock.calls.length).toBe(2);
    for (let i = 0; i < 9; i++) r.frame([0, 0.9, 0, 0]); // + 144 ms
    expect(r.menuNav.step.mock.calls.length).toBe(3);
  });
  it('a stick under 0.5 does nothing; D-pad steps', () => {
    const r = rig();
    r.frame(); r.frame([0.4, 0, 0, 0]);
    expect(r.menuNav.step).not.toHaveBeenCalled();
    r.frame([0, 0, 0, 0], RIGHT);
    expect(r.menuNav.step.mock.calls[0][0]).toBe('right');
  });
  it('left/right on a focused slider nudges it instead of moving focus', () => {
    const r = rig();
    r.doc.activeElement = { type: 'range' };
    r.frame(); r.frame([0, 0, 0, 0], RIGHT);
    expect(r.menuNav.alt).toHaveBeenCalledWith('right');
    expect(r.menuNav.step).not.toHaveBeenCalled();
  });
  it('right stick scrolls scaled by dt', () => {
    const r = rig();
    r.frame(); r.frame([0, 0, 0, 1]);
    const [dx, dy] = r.menuNav.scroll.mock.calls.at(-1);
    expect(dx).toBe(0);
    expect(dy).toBeGreaterThan(0);
    const small = dy;
    r.g.poll(0.032);
    expect(r.menuNav.scroll.mock.calls.at(-1)[1]).toBeCloseTo(small * 2);
  });
  it('L1/R1 zoom only when menuNav.zoom exists', () => {
    const r = rig();
    r.frame(); r.frame([0, 0, 0, 0], L1);
    expect(r.calls.onAction).not.toHaveBeenCalled(); // no zoom: skipped, no throw
    const zoom = vi.fn();
    const r2 = rig({ menuNav: { zoom } });
    r2.frame(); r2.frame([0, 0, 0, 0], L1); r2.frame(); r2.frame([0, 0, 0, 0], R1);
    expect(zoom.mock.calls).toEqual([['out'], ['in']]);
  });
});

describe('owner', () => {
  it('walk mode is today\'s behaviour: B is Meow, A pounces, no menu calls', () => {
    const r = rig();
    r.flags.engaged = true;
    r.frame(); r.frame([0, 0, 0, 0], B); r.frame(); r.frame([0, 0, 0, 0], A);
    expect(r.calls.onAction.mock.calls).toEqual([['meow'], ['pounce']]);
    expect(r.calls.padBack).not.toHaveBeenCalled();
    expect(r.menuNav.press).not.toHaveBeenCalled();
  });
  it('the fight sheet keeps the walk owner', () => {
    const r = rig();
    r.flags.fighting = true;
    r.frame(); r.frame([0, 0, 0, 0], A); r.frame(); r.frame([0, 0, 0, 0], B);
    expect(r.menuNav.press).not.toHaveBeenCalled();
    expect(r.calls.padBack).not.toHaveBeenCalled();
    expect(r.calls.onAction).not.toHaveBeenCalled(); // dropped as today
    r.flags.canResume = true; r.frame(); r.frame([0, 0, 0, 0], START);
    expect(r.calls.onResume).toHaveBeenCalledTimes(1);
  });
  it('walkingOn: no calls at all', () => {
    const r = rig();
    r.flags.walkingOn = true;
    r.frame(); r.frame([0, 0, 0, 0], A, B, START, DOWN); r.frame([0, 1, 0, 1]);
    for (const f of [r.menuNav.step, r.menuNav.press, r.menuNav.scroll, r.menuNav.enter, r.calls.onAction, r.calls.onResume, r.calls.padBack, r.calls.onMove]) {
      expect(f).not.toHaveBeenCalled();
    }
    expect(r.classes.has('pad-focus')).toBe(false);
  });
  it('a button held across menu -> walk does nothing until released', () => {
    const r = rig();
    r.frame(); r.frame([0, 0, 0, 0], A);
    expect(r.menuNav.press).toHaveBeenCalledTimes(1);
    r.flags.engaged = true;
    r.frame([0, 0, 0, 0], A); r.frame([0, 0, 0, 0], A);
    expect(r.calls.onAction).not.toHaveBeenCalled();
    r.frame(); r.frame([0, 0, 0, 0], A);
    expect(r.calls.onAction).toHaveBeenCalledWith('pounce');
  });
  it('a button held across walk -> menu does nothing until released', () => {
    const r = rig();
    r.flags.engaged = true;
    r.frame(); r.frame([0, 0, 0, 0], B);
    r.flags.engaged = false;
    r.frame([0, 0, 0, 0], B); r.frame([0, 0, 0, 0], B);
    expect(r.calls.padBack).not.toHaveBeenCalled();
    r.frame(); r.frame([0, 0, 0, 0], B);
    expect(r.calls.padBack).toHaveBeenCalledTimes(1);
  });
  it('Start that pauses the walk does not resume it on the next frame', () => {
    const r = rig();
    r.flags.engaged = true;
    r.frame(); r.frame([0, 0, 0, 0], START);
    expect(r.calls.onAction).toHaveBeenCalledWith('pause');
    r.flags.engaged = false; r.flags.canResume = true;
    r.frame([0, 0, 0, 0], START);
    expect(r.calls.onResume).not.toHaveBeenCalled();
  });
});

describe('focus ring', () => {
  it('is added on the first pad input in menu mode and not before', () => {
    const r = rig();
    r.frame(); r.frame();
    expect(r.classes.has('pad-focus')).toBe(false);
    r.frame([0, 0, 0, 0], A);
    expect(r.classes.has('pad-focus')).toBe(true);
  });
  it('is not added by walk input', () => {
    const r = rig();
    r.flags.engaged = true;
    r.frame(); r.frame([0, 0, 0, 0], A);
    expect(r.classes.has('pad-focus')).toBe(false);
  });
  it('a synthetic keydown (the pad\'s own Enter on a map place) leaves the ring; a real one removes it', () => {
    const r = rig();
    r.frame(); r.frame([0, 0, 0, 0], A);
    (r.listeners.keydown || []).forEach((f) => f({ isTrusted: false }));
    expect(r.classes.has('pad-focus')).toBe(true);
    (r.listeners.keydown || []).forEach((f) => f({ isTrusted: true }));
    expect(r.classes.has('pad-focus')).toBe(false);
  });
  it('L1 and R1 reach the map api through menuNav.zoom', () => {
    const zoom = vi.fn();
    const r = rig({ menuNav: { zoom: (d) => zoom(d) } });
    r.frame(); r.frame([0, 0, 0, 0], L1); r.frame(); r.frame([0, 0, 0, 0], R1);
    expect(zoom.mock.calls).toEqual([['out'], ['in']]);
  });
  it.each(['pointerdown', 'keydown', 'touchstart'])('is removed on %s', (type) => {
    const r = rig();
    r.frame(); r.frame([0, 0, 0, 0], A);
    r.fire(type);
    expect(r.classes.has('pad-focus')).toBe(false);
  });
  it('destroy removes the listeners', () => {
    const r = rig();
    r.g.destroy();
    expect(r.listeners.pointerdown?.length ?? 0).toBe(0);
  });
});

describe('toast words', () => {
  it('comes from the word table', () => {
    expect(WORDS['pad.connected']).toBeTruthy();
    const r = rig();
    r.listeners.gamepadconnected.forEach((f) => f({ gamepad: { mapping: 'standard', index: 0 } }));
    expect(r.calls.toast).toHaveBeenCalledWith(WORDS['pad.connected'].keys);
  });
});
