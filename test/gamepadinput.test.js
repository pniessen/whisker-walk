import { describe, it, expect } from 'vitest';
import {
  applyDeadZone, stickToMove, orbitDelta, pressedEdges, isPressed,
  createPadState, stepPad, BUTTON_ACTIONS, PAD_BUTTONS, STICK_DEAD,
} from '../src/gamepadinput.js';
import { createGamepad } from '../src/gamepad.js';

const btns = (...down) => Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 }));
const pad = (axes = [0, 0, 0, 0], ...down) => ({ axes, buttons: btns(...down), connected: true, mapping: 'standard', index: 0 });

describe('dead zone', () => {
  it('zeroes small pushes, including drift on both axes', () => {
    expect(applyDeadZone(0.1, 0.1).mag).toBe(0);
    expect(applyDeadZone(STICK_DEAD, 0).mag).toBe(0);
  });
  it('rescales so the zone edge is 0 and full push is 1', () => {
    expect(applyDeadZone(1, 0).mag).toBeCloseTo(1);
    const half = applyDeadZone((1 + STICK_DEAD) / 2, 0);
    expect(half.mag).toBeCloseTo(0.5);
    expect(half.x).toBeCloseTo(0.5);
  });
  it('keeps direction and clamps overshoot', () => {
    const v = applyDeadZone(1, 1);
    expect(v.mag).toBe(1);
    expect(v.x).toBeCloseTo(v.y);
  });
  it('survives junk input', () => {
    expect(applyDeadZone(undefined, NaN).mag).toBe(0);
  });
  it('stickToMove maps down to +z and a light push is under the stalk threshold', () => {
    const m = stickToMove(0, 1);
    expect(m.z).toBeCloseTo(1);
    expect(m.x).toBe(0);
    expect(stickToMove(0, 0.5).mag).toBeLessThan(0.45);
  });
});

describe('orbit', () => {
  it('scales with dt', () => {
    const a = orbitDelta(1, 0, 0.016);
    const b = orbitDelta(1, 0, 0.032);
    expect(b.dx).toBeCloseTo(a.dx * 2);
  });
  it('is zero inside the dead zone or with no time', () => {
    expect(orbitDelta(0.1, 0.1, 0.016)).toEqual({ dx: 0, dy: 0 });
    expect(orbitDelta(1, 1, 0)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('edges and buttons', () => {
  it('detects press edges once, not while held', () => {
    expect(pressedEdges([false], [true])).toEqual([0]);
    expect(pressedEdges([true], [true])).toEqual([]);
    expect(pressedEdges([true], [false])).toEqual([]);
  });
  it('isPressed accepts objects and numbers', () => {
    expect(isPressed({ pressed: true })).toBe(true);
    expect(isPressed({ value: 0.9 })).toBe(true);
    expect(isPressed(0.2)).toBe(false);
    expect(isPressed(undefined)).toBe(false);
  });
  it('maps the standard layout', () => {
    expect(BUTTON_ACTIONS[0]).toBe('pounce');
    expect(BUTTON_ACTIONS[1]).toBe('meow');
    expect(BUTTON_ACTIONS[2]).toBe('interact');
    expect(BUTTON_ACTIONS[3]).toBe('camera');
    expect(BUTTON_ACTIONS[4]).toBe('zoomOut');
    expect(BUTTON_ACTIONS[5]).toBe('zoomIn');
    expect(BUTTON_ACTIONS[9]).toBe('pause');
  });
});

describe('stepPad', () => {
  it('fires an action once per press', () => {
    const s = createPadState();
    expect(stepPad(s, pad([0, 0, 0, 0], PAD_BUTTONS.X), 0.016).actions).toEqual(['interact']);
    expect(stepPad(s, pad([0, 0, 0, 0], PAD_BUTTONS.X), 0.016).actions).toEqual([]);
    expect(stepPad(s, pad(), 0.016).actions).toEqual([]);
    expect(stepPad(s, pad([0, 0, 0, 0], PAD_BUTTONS.X), 0.016).actions).toEqual(['interact']);
  });
  it('idle stick never touches the move path', () => {
    const s = createPadState();
    for (let i = 0; i < 5; i++) expect(stepPad(s, pad(), 0.016).move).toBeUndefined();
  });
  it('sends exactly one null on the transition to idle', () => {
    const s = createPadState();
    expect(stepPad(s, pad([0, -1, 0, 0]), 0.016).move.mag).toBeCloseTo(1);
    expect(stepPad(s, pad([0, -1, 0, 0]), 0.016).move).toBeTruthy();
    expect(stepPad(s, pad(), 0.016).move).toBeNull();
    for (let i = 0; i < 5; i++) expect(stepPad(s, pad(), 0.016).move).toBeUndefined();
  });
  it('orbit only when the right stick is past its dead zone', () => {
    const s = createPadState();
    expect(stepPad(s, pad([0, 0, 0.05, 0]), 0.016).orbit).toBeNull();
    expect(stepPad(s, pad([0, 0, 1, 0]), 0.016).orbit.dx).toBeGreaterThan(0);
  });
  it('A takes the photo in camera mode', () => {
    expect(stepPad(createPadState(), pad([0, 0, 0, 0], 0), 0.016, { cameraMode: true }).actions).toEqual(['tapWorld']);
  });
  it('drops action buttons during a clan fight but Start still pauses', () => {
    const r = stepPad(createPadState(), pad([0, 0, 0, 0], 0, 2, 9), 0.016, { fighting: true });
    expect(r.actions).toEqual(['pause']);
  });
  it('when not engaged only Start acts and sticks are ignored', () => {
    const r = stepPad(createPadState(), pad([1, 0, 1, 0], 0, 9), 0.016, { engaged: false });
    expect(r.actions).toEqual(['pause']);
    expect(r.move).toBeUndefined();
    expect(r.orbit).toBeNull();
  });
});

describe('createGamepad glue', () => {
  const mk = (padsRef, extra = {}) => {
    const listeners = {};
    const calls = { move: [], act: [], resume: 0, toast: [] };
    const g = createGamepad({
      win: { addEventListener: (k, f) => { listeners[k] = f; } },
      nav: { getGamepads: () => padsRef.pads },
      getEngaged: () => padsRef.engaged ?? true, getCameraMode: () => false, isFighting: () => false,
      canResume: () => true,
      onMove: (v) => calls.move.push(v), onOrbit: () => {}, onAction: (n) => calls.act.push(n),
      onResume: () => { calls.resume++; }, toast: (m) => calls.toast.push(m), ...extra,
    });
    return { g, listeners, calls };
  };
  it('is a safe no-op without getGamepads', () => {
    const g = createGamepad({ win: { addEventListener() {} }, nav: {} });
    expect(g.supported).toBe(false);
    expect(() => g.poll(0.016)).not.toThrow();
  });
  it('toasts once on connect and sends one null when the stick goes idle', () => {
    const ref = { pads: [pad([0, 1, 0, 0])] };
    const { g, listeners, calls } = mk(ref);
    listeners.gamepadconnected({ gamepad: ref.pads[0] });
    listeners.gamepadconnected({ gamepad: ref.pads[0] });
    expect(calls.toast).toEqual(['Controller connected 🎮']);
    g.poll(0.016);
    ref.pads = [pad()];
    g.poll(0.016); g.poll(0.016);
    expect(calls.move.filter((m) => m === null)).toHaveLength(1);
  });
  it('Start resumes while paused instead of pausing', () => {
    const ref = { pads: [pad([0, 0, 0, 0], 9)], engaged: false };
    const { g, calls } = mk(ref);
    g.poll(0.016);
    expect(calls.resume).toBe(1);
    expect(calls.act).toEqual([]);
  });
  it('ignores non-standard pads', () => {
    const p = { ...pad([0, 1, 0, 0]), mapping: '' };
    const { g, calls } = mk({ pads: [p] });
    g.poll(0.016);
    expect(calls.move).toEqual([]);
  });
});

describe('Y / Triangle on a den walk (den shop UX M4)', () => {
  it('opens the den panel only on a den walk with no viewfinder; photo mode everywhere else', async () => {
    const { yOpensDen } = await import('../src/gamepadinput.js');
    expect(yOpensDen('camera', true, false)).toBe(true);
    expect(yOpensDen('camera', false, false)).toBe(false);
    expect(yOpensDen('camera', true, true)).toBe(false);
    expect(yOpensDen('pounce', true, false)).toBe(false);
  });
});
