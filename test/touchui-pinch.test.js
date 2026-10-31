import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTouchUI, PINCH_PAIR_MS } from '../src/ui/touchui.js';

// No DOM in this project's tests, so this is a small recording fake: just
// enough element for createTouchUI to build itself, and a way to fire the
// touch events it listens for on its layer.
function fakeEl() {
  const listeners = {};
  return {
    listeners,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    set innerHTML(_v) {},
    set className(_v) {},
    appendChild(c) { this.child = c; return c; },
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  };
}

let now = 0;
let root;
let wrap;
let calls;

function fire(type, touches) {
  const e = {
    changedTouches: touches.map(([id, x, y]) => ({ identifier: id, clientX: x, clientY: y, target: null })),
    preventDefault: vi.fn(),
  };
  for (const fn of wrap.listeners[type] || []) fn(e);
  return e;
}

beforeEach(() => {
  now = 0;
  vi.stubGlobal('document', { body: { classList: { toggle() {} } }, createElement: () => fakeEl() });
  vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  calls = { move: [], orbit: [], action: [], zoom: [] };
  root = fakeEl();
  const ui = createTouchUI(root, {
    onMove: (v) => calls.move.push(v),
    onOrbit: (dx, dy) => calls.orbit.push([dx, dy]),
    onAction: (n) => calls.action.push(n),
    onZoom: (d) => calls.zoom.push(d),
  });
  wrap = root.child;
  ui.setVisible(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 390 px wide: the joystick zone is x < 156 (right-handed).
describe('touch pinch', () => {
  it('a pinch whose second finger lands in the joystick zone zooms, and the cat never moves', () => {
    fire('touchstart', [[1, 220, 400]]); // orbit area
    now = 60;
    fire('touchstart', [[2, 140, 420]]); // joystick zone, 60 ms later
    expect(calls.move).toEqual([]);
    now = 120;
    fire('touchmove', [[1, 300, 400], [2, 60, 420]]); // spread apart
    expect(calls.zoom).toEqual([-1]);
    expect(calls.move).toEqual([]);
    expect(calls.orbit).toEqual([]);
  });

  it('a pinch whose FIRST finger lands in the joystick zone drops the joystick and zooms', () => {
    fire('touchstart', [[1, 140, 400]]); // joystick zone: shows the joystick (no movement)
    expect(calls.move).toEqual([{ x: 0, z: 0, mag: 0 }]);
    now = 80;
    fire('touchstart', [[2, 220, 400]]);
    expect(calls.move.at(-1)).toBe(null); // joystick released
    now = 140;
    fire('touchmove', [[1, 150, 400], [2, 210, 400]]); // pinch together
    expect(calls.zoom).toEqual([1]);
    expect(calls.move.filter((v) => v && v.mag > 0)).toEqual([]);
  });

  it('a second finger long after the first still works as before: joystick in its zone', () => {
    fire('touchstart', [[1, 220, 400]]);
    now = PINCH_PAIR_MS + 200;
    fire('touchstart', [[2, 100, 600]]);
    fire('touchmove', [[2, 100, 540]]); // push the stick up
    expect(calls.move.some((v) => v && v.mag > 0)).toBe(true);
    expect(calls.zoom).toEqual([]);
  });

  it('after a pinch the finger left down does not orbit or tap, whichever finger lifts first', () => {
    fire('touchstart', [[1, 220, 400]]);
    now = 50;
    fire('touchstart', [[2, 300, 400]]);
    now = 100;
    fire('touchmove', [[2, 360, 400]]);
    fire('touchend', [[2, 360, 400]]); // pinch finger lifts first
    fire('touchmove', [[1, 260, 380]]);
    fire('touchmove', [[1, 300, 360]]);
    expect(calls.orbit).toEqual([]);
    fire('touchend', [[1, 300, 360]]);
    expect(calls.action).toEqual([]);
    // the next ordinary drag orbits again
    now = 2000;
    fire('touchstart', [[3, 220, 400]]);
    fire('touchmove', [[3, 240, 400]]);
    expect(calls.orbit).toEqual([[20, 0]]);
  });

  it('cancels Safari page pinch on the whole HUD, not only the touch layer', () => {
    expect(root.listeners.gesturestart).toHaveLength(1);
    expect(root.listeners.gesturechange).toHaveLength(1);
    const e = { preventDefault: vi.fn() };
    root.listeners.gesturestart[0](e);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
