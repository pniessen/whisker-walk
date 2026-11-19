import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTouchUI, CLIMB_LABEL } from '../src/ui/touchui.js';

// The lighter walk controls (controls review, 2026-11-19): no yarn button, the
// photo button named "Photo", the paw's climb badge, the zoom pair opt-in.
// No DOM in this project's tests: a small fake that remembers what it is told.
function fakeEl(name = 'el') {
  const attrs = {};
  const kids = new Map();
  const cls = new Set();
  return {
    name, attrs, cls,
    style: {}, dataset: {}, textContent: '',
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ?? !cls.has(c) ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
    set innerHTML(v) { this.html = v; },
    set className(_v) {},
    appendChild(c) { this.child = c; return c; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k],
    querySelector(sel) { if (!kids.has(sel)) kids.set(sel, fakeEl(sel)); return kids.get(sel); },
    querySelectorAll: () => [],
    addEventListener() {},
  };
}

let body;
let root;
let ui;
beforeEach(() => {
  body = fakeEl('body');
  vi.stubGlobal('document', { body, createElement: () => fakeEl('div') });
  vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });
  root = fakeEl('hud');
  ui = createTouchUI(root, { onMove() {}, onOrbit() {}, onAction() {}, onZoom() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('the touch buttons', () => {
  it('four buttons: paw, meow, photo (named "Photo") and pause; no yarn', () => {
    const html = root.child.html;
    expect([...html.matchAll(/data-action="(\w+)"/g)].map((m) => m[1])).toEqual(['pounce', 'meow', 'camera', 'zoomIn', 'zoomOut']);
    expect(html).toContain('aria-label="Photo"');
    expect(html).not.toMatch(/yarn|🧶|Toggle camera/);
    expect(html).toContain('id="tui-pause"');
  });

  it('the paw wears ⬆ or ⬇ and says "Climb up" or "Hop down"; nothing to say, no badge', () => {
    const paw = root.child.querySelector('.tui-btn[data-action="pounce"]');
    const badge = paw.querySelector('.tui-badge');
    ui.setClimb('up');
    expect([paw.dataset.climb, badge.textContent, paw.attrs['aria-label']]).toEqual(['up', '⬆', 'Climb up']);
    ui.setClimb('down');
    expect([paw.dataset.climb, badge.textContent, paw.attrs['aria-label']]).toEqual(['down', '⬇', 'Hop down']);
    ui.setClimb(null);
    expect([paw.dataset.climb, badge.textContent, paw.attrs['aria-label']]).toEqual(['', '', 'Pounce or climb']);
    ui.setClimb('sideways');
    expect(paw.attrs['aria-label']).toBe(CLIMB_LABEL[null]);
  });

  it('a new walk starts with no badge', () => {
    const paw = root.child.querySelector('.tui-btn[data-action="pounce"]');
    ui.setClimb('up');
    ui.setVisible(true);
    ui.setVisible(false);
    ui.setVisible(true);
    expect(paw.attrs['aria-label']).toBe('Pounce or climb');
  });

  it('the + / − pair is on screen only with the switch on', () => {
    ui.setZoomButtons(true);
    expect(body.cls.has('zoom-buttons')).toBe(true);
    ui.setZoomButtons(false);
    expect(body.cls.has('zoom-buttons')).toBe(false);
  });
});

describe('the chat tray', () => {
  it('closes when any other button is pressed', () => {
    const src = readFileSync(new URL('../src/ui/chatwheel.js', import.meta.url), 'utf8');
    expect(src).toMatch(/document\.addEventListener\('pointerdown', onOtherButton, true\)/);
    expect(src).toMatch(/if \(btn && !wrap\.contains\(btn\)\) closeTray\(\)/);
    expect(src).toMatch(/document\.removeEventListener\('pointerdown', onOtherButton, true\)/);
  });
  it('shows only on a walk together', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toContain('chatWheel.setVisible(!!session.net);');
    expect(src).not.toContain('chatWheel.setVisible(true);');
  });
});
