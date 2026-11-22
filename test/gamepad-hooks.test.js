import { describe, it, expect, vi } from 'vitest';
import { createGamepad } from '../src/gamepad.js';

const ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
function pad(over = {}) {
  return { index: 0, connected: true, mapping: 'standard', id: ID, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...over };
}
function rig(opts = {}) {
  const listeners = {};
  const win = { addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {} };
  let current = null;
  const nav = { getGamepads: () => [current] };
  const hooks = { onPadUse: vi.fn(), onPadConnect: vi.fn(), onPadDisconnect: vi.fn() };
  const menuNav = { enter() {}, step() {}, alt() {}, press() {}, scroll() {}, settle() {} };
  const g = createGamepad({ win, nav, doc: null, menuNav, getEngaged: () => false, toast() {}, ...hooks, ...opts });
  return {
    g, hooks, set: (p) => { current = p; },
    fire: (t, e) => (listeners[t] || []).forEach((f) => f(e)),
  };
}
const press = (i) => pad({ buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: k === i, value: k === i ? 1 : 0 })) });

describe('pad hooks', () => {
  it('padInfo is null with no pad, then the active pad\'s id and vendor', () => {
    const r = rig();
    expect(r.g.padInfo()).toBeNull();
    r.set(pad());
    r.fire('gamepadconnected', { gamepad: pad() });
    expect(r.g.padInfo()).toEqual({ id: ID, vendor: '054c' });
  });

  it('Firefox-style ids give the vendor too', () => {
    const r = rig();
    const p = pad({ id: '054c-0ce6-Wireless Controller' });
    r.set(p);
    r.fire('gamepadconnected', { gamepad: p });
    expect(r.g.padInfo().vendor).toBe('054c');
  });

  it('connect and disconnect each fire once, with the pad\'s info', () => {
    const r = rig();
    r.set(pad());
    r.fire('gamepadconnected', { gamepad: pad() });
    expect(r.hooks.onPadConnect).toHaveBeenCalledTimes(1);
    expect(r.hooks.onPadConnect.mock.calls[0][0].vendor).toBe('054c');
    r.fire('gamepaddisconnected', { gamepad: pad() });
    expect(r.hooks.onPadDisconnect).toHaveBeenCalledTimes(1);
    expect(r.g.padInfo()).toBeNull();
  });

  it('a disconnect of another pad fires nothing', () => {
    const r = rig();
    r.set(pad());
    r.fire('gamepadconnected', { gamepad: pad() });
    r.fire('gamepaddisconnected', { gamepad: pad({ index: 3 }) });
    expect(r.hooks.onPadDisconnect).not.toHaveBeenCalled();
  });

  it('connecting alone is not use; a press is, and a held press tells only now and then', () => {
    const r = rig();
    r.set(pad());
    r.fire('gamepadconnected', { gamepad: pad() });
    r.g.poll(0.016);
    expect(r.hooks.onPadUse).not.toHaveBeenCalled();
    r.set(press(0));
    r.g.poll(0.016);
    expect(r.hooks.onPadUse).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) r.g.poll(0.016);
    expect(r.hooks.onPadUse).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 40; i++) r.g.poll(0.016); // 0.7 s more
    expect(r.hooks.onPadUse.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(r.hooks.onPadUse.mock.calls[0][0].id).toBe(ID);
  });

  it('a firm stick push is use; a rest is not', () => {
    const r = rig();
    r.set(pad());
    r.g.poll(0.016);
    r.set(pad({ axes: [0.1, 0.1, 0, 0] }));
    r.g.poll(0.016);
    expect(r.hooks.onPadUse).not.toHaveBeenCalled();
    r.set(pad({ axes: [0.9, 0, 0, 0] }));
    r.g.poll(0.016);
    expect(r.hooks.onPadUse).toHaveBeenCalledTimes(1);
  });

  it('with no hooks given nothing throws', () => {
    const r = rig({ onPadUse: undefined, onPadConnect: undefined, onPadDisconnect: undefined });
    r.set(press(0));
    r.fire('gamepadconnected', { gamepad: pad() });
    expect(() => { r.g.poll(0.016); r.fire('gamepaddisconnected', { gamepad: pad() }); }).not.toThrow();
  });
});
