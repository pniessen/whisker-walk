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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgression } from '../src/progression.js';
import { CONFIRM_DELAY_MS } from '../src/ui/colonypanel.js';
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
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
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

function setup({ progression: prog = null } = {}) {
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
  const progression = prog ?? { state: { points: 0, den: { owned: [], placed: {} } } };
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

// Buy — 25 🐾 only asks (the shared "Get it?" card), over the paused den.
describe('den shop: buying asks first', () => {
  function shop(points = 40) {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    progression.state.points = points;
    const t = setup({ progression });
    t.view.setActive(true);
    t.view.open();
    const app = t.doc.body.children[0];
    const card = () => app.children.find((c) => c.id === 'confirm-card');
    const buyBtn = new Node('button', t.sheet);
    buyBtn.attrs['data-den-buy'] = 'bed';
    buyBtn.dataset.denBuy = 'bed';
    const tapBuy = () => dispatch(buyBtn, 'click');
    // a tap on the card's Yes / Not now; detail 2 is a double tap's second
    const answer = (a, detail = 1) => {
      const b = new Node('button', card());
      b.attrs['data-confirm'] = a;
      b.closest = (sel) => (sel === '[data-confirm]' ? { getAttribute: () => a } : null);
      dispatch(b, 'click', { detail });
    };
    return { ...t, progression, card, tapBuy, answer };
  }
  const wait = () => vi.advanceTimersByTime(CONFIRM_DELAY_MS);
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a tap on Buy opens "Get the Donut Bed for 25 🐾?" over the shop and buys nothing', () => {
    const t = shop();
    t.tapBuy();
    expect(t.card()).toBeTruthy();
    expect(t.card().cls.has('ds-confirm')).toBe(true);
    expect(t.card().innerHTML).toContain('Get the Donut Bed for 25 🐾?');
    expect(t.card().innerHTML).toContain('You’ll have 15 🐾 left.');
    expect(t.card().innerHTML).toContain('>Yes, get it</button>');
    expect(t.progression.state.points).toBe(40);
    expect(t.progression.state.den.owned).toEqual([]);
    expect(t.view.isOpen).toBe(true);
  });

  it('Not now changes nothing; Escape on the card answers Not now and keeps the shop open', () => {
    const t = shop();
    t.tapBuy();
    wait();
    t.answer('no');
    expect(t.card()).toBeUndefined();
    t.tapBuy();
    const ev = dispatch(t.card(), 'keydown', { key: 'Escape', code: 'Escape' });
    expect(ev.defaultPrevented).toBe(false);
    expect(t.card()).toBeUndefined();
    expect(t.view.isOpen).toBe(true);
    expect(t.resume).not.toHaveBeenCalled();
    expect(t.playerKeys).toEqual([]);
    expect(t.progression.state.points).toBe(40);
    expect(t.progression.state.den.owned).toEqual([]);
  });

  it('Yes buys once, even on a double tap', () => {
    const t = shop();
    t.tapBuy();
    t.answer('yes'); // too soon after the tap that asked
    t.answer('yes', 2);
    expect(t.progression.state.den.owned).toEqual([]);
    wait();
    t.answer('yes');
    expect(t.card()).toBeUndefined();
    expect(t.progression.state.den.owned).toEqual(['bed']);
    expect(t.progression.state.points).toBe(15);
    t.tapBuy(); // already hers: nothing to ask
    expect(t.card()).toBeUndefined();
    expect(t.progression.state.points).toBe(15);
  });

  it('a Yes after she can no longer afford it buys nothing; closing the shop drops the question', () => {
    const t = shop();
    t.tapBuy();
    t.progression.state.points = 10;
    wait();
    t.answer('yes');
    expect(t.progression.state.den.owned).toEqual([]);
    expect(t.progression.state.points).toBe(10);
    t.progression.state.points = 40;
    t.tapBuy();
    t.view.close();
    expect(t.card()).toBeUndefined();
    expect(t.progression.state.den.owned).toEqual([]);
  });
});
