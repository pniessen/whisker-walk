import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTouchUI } from '../src/ui/touchui.js';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const walkSrc = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = css.indexOf(`\n${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('hud readability pass: CSS', () => {
  it('goals are 14px with a text shadow, wrap, and respect the left safe area', () => {
    const r = rule('.hud-goals');
    expect(r).toContain('font-size: 14px');
    expect(r).toMatch(/text-shadow: 0 1px 1px/);
    expect(r).toContain('left: max(16px, env(safe-area-inset-left))');
    expect(r).toContain('max-width: 300px');
  });
  it('a finished goal is tinted green', () => {
    expect(rule('.goal.done')).toMatch(/color: #7ee2a0; background: rgba\(126,226,160/);
  });
  it('the rank pill and the area caption are at least 13px', () => {
    expect(css).toMatch(/body\.touch-mode \.hud-area \{ font-size: 0\.82rem/);
    expect(css).toMatch(/\.hud-rank \{\s*font-size: 0\.82rem/);
  });
  it('landscape touch walk toasts anchor at the top centre, under the rank pill', () => {
    for (const head of ['@media (pointer: coarse) and (max-height: 500px) {\n  #hud #hud-toasts', '@media (max-height: 500px) {\n  body.touch-mode #hud #hud-toasts']) {
      const at = css.indexOf(head);
      expect(at).toBeGreaterThan(css.indexOf('body.touch-mode .hud-toasts {'));
      const b = css.slice(at, css.indexOf('\n}\n', at));
      expect(b).toContain('top: calc(max(16px, env(safe-area-inset-top)) + 48px); bottom: auto');
      expect(b).toContain('#hud.fighting #hud-toasts');
      expect(b).toContain('.hud-objective:not(.hidden)'); // steps past the objective pill
    }
  });
  it('the resting joystick ring is faint, click-through and mirrored left-handed', () => {
    const r = rule('.tui-joystick-rest');
    expect(r).toContain('opacity: 0.3');
    expect(r).toContain('pointer-events: none');
    expect(r).toContain('env(safe-area-inset-left)');
    expect(r).toContain('env(safe-area-inset-bottom)');
    expect(rule('body.left-handed .tui-joystick-rest')).toContain('env(safe-area-inset-right)');
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.tui-joystick-rest \{ transition: none; \} \}/);
  });
  it('button labels hang under the circle and show only when labelled', () => {
    expect(rule('.tui-label')).toMatch(/display: none;[^}]*position: absolute;[^}]*font-size: 10px/);
    expect(rule('.tui-labelled .tui-label')).toContain('display: block');
  });
  it('the chat, + and − buttons have 16px between them', () => {
    expect(rule('.tui-zoom')).toContain('gap: 16px');
    // chat right edge = zoom row inset (12) + row width (44+16+44) + 16
    expect(css).toContain('max(148px, calc(132px + env(safe-area-inset-right)))');
  });
});

describe('chat hint only on the first three walks', () => {
  it('walk.js sets chatHintPending from the same walk count as the touch hint', () => {
    expect(walkSrc).toMatch(/const earlyWalk = Object\.values\(state\.walks\)\.reduce\(\(n, w\) => n \+ w, 0\) < TOUCH_HINT_WALKS;\n\s*session\.chatHintPending = earlyWalk;/);
    expect(walkSrc).not.toMatch(/chatHintPending = true/);
    expect(walkSrc).toContain('touchUI.setLabels?.(earlyWalk)');
  });
});

// A fake element that records classes, enough for createTouchUI.
function fakeEl() {
  const classes = new Set();
  const listeners = {};
  return {
    listeners, style: {}, dataset: {}, classes,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c),
    },
    set innerHTML(_v) {}, set className(_v) {},
    appendChild(c) { this.child = c; return c; },
    querySelector(sel) { return (this.kids ||= {})[sel] ||= fakeEl(); },
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  };
}

describe('resting joystick ring and labels', () => {
  let root, wrap, ui;
  const touch = (type, x, y, id = 1) => {
    const e = { changedTouches: [{ identifier: id, clientX: x, clientY: y, target: null }], preventDefault() {} };
    for (const fn of wrap.listeners[type] || []) fn(e);
  };
  const ring = () => wrap.querySelector('#tui-joystick-rest');
  beforeEach(() => {
    vi.stubGlobal('document', { body: { classList: { toggle() {} } }, createElement: () => fakeEl() });
    vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });
    root = fakeEl();
    ui = createTouchUI(root, { onMove() {}, onOrbit() {}, onAction() {} });
    wrap = root.child;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows from the start of a walk and goes on the first touch on the move side', () => {
    ui.setVisible(true);
    expect(ring().classes.has('gone')).toBe(false);
    touch('touchstart', 300, 500); // orbit side: still resting
    expect(ring().classes.has('gone')).toBe(false);
    touch('touchend', 300, 500); // lifted: not a pinch partner for the next finger
    touch('touchstart', 80, 600, 2); // move side
    expect(ring().classes.has('gone')).toBe(true);
  });
  it('comes back for the next walk, not when the touch UI merely re-shows', () => {
    ui.setVisible(true);
    touch('touchstart', 80, 600);
    ui.setVisible(true); // already visible: no change
    expect(ring().classes.has('gone')).toBe(true);
    ui.setVisible(false); // walk ends (summary)
    ui.setVisible(true); // next walk
    expect(ring().classes.has('gone')).toBe(false);
  });
  it('rides inside the touch layer, so it hides with it', () => {
    ui.setVisible(false);
    expect(wrap.classes.has('hidden')).toBe(true);
  });
  it('setLabels toggles the labelled class', () => {
    ui.setLabels(true);
    expect(wrap.classes.has('tui-labelled')).toBe(true);
    ui.setLabels(false);
    expect(wrap.classes.has('tui-labelled')).toBe(false);
  });
});
