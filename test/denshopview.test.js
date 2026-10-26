// The den shop overlay's input guards (Task 6 review, fix round 1). While the
// sheet is open the walk is paused, and two things in player.js must not
// reach through it:
//   * a click on the visible room (player.js requests pointer lock on any
//     canvas click while enabled) — that would re-engage the walk under the
//     sheet with the cursor captured;
//   * its Arrow/Space preventDefault on document keydown — that would stop a
//     focused <select> stepping and a focused button pressing.
// The project has no DOM library, so this installs a tiny tree with real
// capture/target/bubble propagation, which is all these guards depend on.
import { describe, it, expect, vi } from 'vitest';
import { createEmitter } from '../src/events.js';
import { createDenShopView } from '../src/ui/denshopview.js';

class Node {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = null;
    this.children = [];
    this.listeners = [];
    this.dataset = {};
    this.attrs = {};
    this.cls = new Set();
    this.classList = {
      add: (c) => this.cls.add(c),
      remove: (c) => this.cls.delete(c),
      toggle: (c, on) => { if (on ?? !this.cls.has(c)) this.cls.add(c); else this.cls.delete(c); },
      contains: (c) => this.cls.has(c),
    };
    this.innerHTML = '';
    if (parent) parent.appendChild(this);
  }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  querySelector() { return null; }
  closest(sel) {
    for (let n = this; n; n = n.parent) {
      const m = sel.match(/^\[data-([a-z-]+)\]$/);
      if (m && Object.hasOwn(n.attrs, `data-${m[1]}`)) return n;
    }
    return null;
  }
  addEventListener(type, fn, opts) {
    this.listeners.push({ type, fn, capture: opts === true || !!opts?.capture });
  }
}

function dispatch(target, type, props = {}) {
  let stopped = false;
  let immediate = false;
  const ev = {
    type, target, defaultPrevented: false, ...props,
    stopPropagation() { stopped = true; },
    stopImmediatePropagation() { stopped = true; immediate = true; },
    preventDefault() { this.defaultPrevented = true; },
  };
  const path = [];
  for (let n = target; n; n = n.parent) path.push(n);
  const run = (node, pick) => {
    for (const l of node.listeners) {
      if (l.type !== type || !pick(l)) continue;
      l.fn(ev);
      if (immediate) return;
    }
  };
  for (let i = path.length - 1; i >= 1 && !stopped; i--) run(path[i], (l) => l.capture);
  if (!stopped) run(target, () => true);
  for (let i = 1; i < path.length && !stopped; i++) run(path[i], (l) => !l.capture);
  return ev;
}

function setup() {
  const doc = new Node('document');
  doc.body = new Node('body', doc);
  const app = new Node('app', doc.body);
  const canvas = new Node('canvas', app);
  const hud = new Node('hud', app);
  doc.createElement = (tag) => new Node(tag);
  // Stand-ins for player.js's own listeners.
  const locks = [];
  canvas.addEventListener('click', () => locks.push('lock'));
  const playerKeys = [];
  doc.addEventListener('keydown', (e) => {
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    playerKeys.push(e.code);
  });
  const bus = createEmitter();
  const pause = vi.fn();
  const resume = vi.fn();
  const progression = { state: { points: 0, den: { owned: [], placed: {} } } };
  const view = createDenShopView({
    progression, pause, resume, bus, canvas, doc, hudRoot: hud, mountRoot: app,
  });
  const sheet = app.children.find((c) => c.attrs.role === 'dialog');
  const hint = app.children.find((c) => c.attrs.id === 'den-shop-hint');
  return { doc, canvas, sheet, hint, bus, view, locks, playerKeys, pause, resume };
}

describe('den shop overlay input guards', () => {
  it('a click on the room while the sheet is open never reaches player.js', () => {
    const t = setup();
    t.view.setActive(true);
    t.view.open();
    dispatch(t.canvas, 'click');
    expect(t.locks).toEqual([]);
    expect(t.view.isOpen).toBe(true);
  });

  it('closed (or not a den walk), a canvas click works as before', () => {
    const t = setup();
    dispatch(t.canvas, 'click');
    t.view.setActive(true);
    dispatch(t.canvas, 'click');
    t.view.open();
    t.view.close();
    dispatch(t.canvas, 'click');
    expect(t.locks).toEqual(['lock', 'lock', 'lock']);
  });

  it('if a lock is gained while open anyway, the sheet closes without walking on again', () => {
    const t = setup();
    t.view.setActive(true);
    t.view.open();
    t.bus.emit('player:lockchange', { locked: false }); // the pause itself
    expect(t.view.isOpen).toBe(true);
    t.bus.emit('player:lockchange', { locked: true });
    expect(t.view.isOpen).toBe(false);
    expect(t.resume).not.toHaveBeenCalled();
    expect(t.doc.body.classList.contains('den-shop-open')).toBe(false);
  });

  it('keys inside the sheet stay with the form control; Escape still closes', () => {
    const t = setup();
    t.view.setActive(true);
    t.view.open();
    const select = new Node('select', t.sheet);
    for (const code of ['ArrowDown', 'Space', 'KeyM']) {
      const ev = dispatch(select, 'keydown', { code });
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(t.playerKeys).toEqual([]);
    dispatch(select, 'keydown', { code: 'Escape' });
    expect(t.view.isOpen).toBe(false);
    expect(t.resume).toHaveBeenCalledTimes(1);
  });

  it('a hint says how to reach the shop; the den-walk class is on only during a den walk', () => {
    const t = setup();
    expect(t.hint).toBeTruthy();
    expect(t.hint.textContent).toMatch(/Esc/);
    expect(t.hint.textContent).toContain('Den shop');
    expect(t.doc.body.classList.contains('den-walk')).toBe(false);
    t.view.setActive(true);
    expect(t.doc.body.classList.contains('den-walk')).toBe(true);
    t.view.setActive(false);
    expect(t.doc.body.classList.contains('den-walk')).toBe(false);
  });

  it('keys outside the sheet are untouched', () => {
    const t = setup();
    t.view.setActive(true);
    dispatch(t.canvas, 'keydown', { code: 'ArrowUp' });
    expect(t.playerKeys).toEqual(['ArrowUp']);
  });
});
