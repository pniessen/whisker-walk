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

describe('pad layers: the den shop sheet', () => {
  it('carries data-pad-layer (hidden until opened, so it only counts while shown)', () => {
    const t = setup();
    expect(t.sheet.attrs['data-pad-layer']).toBe('');
    expect(t.sheet.cls.has('hidden')).toBe(true);
  });
});

describe('TV mode: the den walk\'s note', () => {
  it('says the keys with TV mode off, the pad\'s words (pictures) while the pad is the input, the keys again after', async () => {
    const tv = await import('../src/tvseam.js');
    const { padLine } = await import('../src/tv/padwords.js');
    const { glyphify, plainify } = await import('../src/tv/glyphs.js');
    tv.resetTv();
    try {
      const t = setup();
      expect(t.hint.textContent).toBe('Press Esc, then 🛋️ Den shop to decorate');
      tv.setTv({ on: true, padLine, text: (s) => plainify(s, 'ps'), html: (s) => glyphify(s, 'ps') });
      tv.setTv({ input: 'pad' });
      expect(t.hint.innerHTML).toContain('<svg');
      expect(t.hint.innerHTML).toContain('Den shop to decorate');
      expect(t.hint.innerHTML).not.toContain('Esc');
      tv.setTv({ input: 'keys' });
      expect(t.hint.textContent).toBe('Press Esc, then 🛋️ Den shop to decorate');
    } finally {
      tv.resetTv();
    }
  });
});

// Buy, then "Place it now": the sequence over the real progression.
describe('den shop: buy then Place it now (M2)', () => {
  const wait = () => vi.advanceTimersByTime(CONFIRM_DELAY_MS);
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function flow(points = 40) {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    progression.state.points = points;
    const applied = [];
    const doc = new Node('document');
    doc.body = new Node('body', doc);
    const app = new Node('app', doc.body);
    const canvas = new Node('canvas', app);
    const hud = new Node('hud', app);
    doc.createElement = (tag) => new Node(tag);
    const view = createDenShopView({
      progression, pause: vi.fn(), resume: vi.fn(), bus: createEmitter(), canvas, doc, hudRoot: hud, mountRoot: app,
      applyDenSpot: (s, id, now) => applied.push([id, now]),
    });
    const sheet = app.children.find((c) => c.attrs.role === 'dialog');
    view.setActive(true);
    view.open();
    const tapAttr = (attr, key, value) => {
      const b = new Node('button', sheet);
      b.attrs[attr] = value ?? '';
      if (key) b.dataset[key] = value;
      dispatch(b, 'click');
      b.remove();
    };
    const buy = (id = 'bed') => {
      tapAttr('data-den-buy', 'denBuy', id);
      const card = app.children.find((c) => c.id === 'confirm-card');
      wait();
      const y = new Node('button', card);
      y.closest = (sel) => (sel === '[data-confirm]' ? { getAttribute: () => 'yes' } : null);
      dispatch(y, 'click', { detail: 1 });
    };
    return { progression, view, sheet, applied, buy, tapAttr, doc };
  }

  it('Yes buys and shows "is yours" with Place it now; Back is Later, the piece stays hers and unplaced', () => {
    const t = flow();
    t.buy();
    expect(t.progression.state.den.owned).toEqual(['bed']);
    expect(t.sheet.innerHTML).toContain('Donut Bed is yours!');
    expect(t.view.isPlacing).toBe(true);
    t.view.stopPlacing();
    expect(t.view.isPlacing).toBe(false);
    expect(t.view.isOpen).toBe(true);
    expect(t.sheet.innerHTML).not.toContain('data-den-place-now');
    expect(t.sheet.innerHTML).toContain('not placed');
    expect(t.progression.state.den.placed).toEqual({});
    expect(t.applied).toEqual([]);
  });

  it('Place it now puts the piece in hand; a spot places it once, live, and ends place mode', () => {
    const t = flow();
    t.buy();
    t.tapAttr('data-den-place-now');
    expect(t.sheet.innerHTML).toContain('data-den-hand-spot');
    expect(t.sheet.innerHTML).toContain('Pick a spot for Donut Bed');
    t.tapAttr('data-den-plan-spot', 'denPlanSpot', 'corner-a');
    expect(t.progression.state.den.placed).toEqual({ 'corner-a': 'bed' });
    expect(t.applied).toEqual([['corner-a', 'bed']]);
    expect(t.view.isPlacing).toBe(false);
    expect(Object.keys(t.progression.state.den).sort()).toEqual(['owned', 'placed']);
  });

  it('Escape in place mode is Later, not close; a second Escape closes the shop', () => {
    const t = flow();
    t.buy();
    t.tapAttr('data-den-place-now');
    dispatch(t.doc.body.children[0], 'keydown', { code: 'Escape' });
    expect(t.view.isPlacing).toBe(false);
    expect(t.view.isOpen).toBe(true);
    dispatch(t.doc.body.children[0], 'keydown', { code: 'Escape' });
    expect(t.view.isOpen).toBe(false);
  });

  it('closing the shop in place mode drops the hand; nothing is lost or placed', () => {
    const t = flow();
    t.buy();
    t.tapAttr('data-den-place-now');
    t.view.close();
    expect(t.view.isPlacing).toBe(false);
    expect(t.progression.state.den).toEqual({ owned: ['bed'], placed: {} });
  });

  it('a stray spot tap with nothing in hand places nothing', () => {
    const t = flow();
    t.buy();
    t.tapAttr('data-den-later');
    t.tapAttr('data-den-plan-spot', 'denPlanSpot', 'corner-a');
    expect(t.progression.state.den.placed).toEqual({});
  });
});

// Plan view: pick up, move, swap, put away (den shop UX M3). Real progression, tapped like a finger.
describe('den shop: the plan view (M3)', () => {
  function plan(owned = ['bed', 'lamp'], placed = {}) {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    progression.state.den.owned = [...owned];
    progression.state.den.placed = { ...placed };
    const applied = [];
    const doc = new Node('document');
    doc.body = new Node('body', doc);
    const app = new Node('app', doc.body);
    const canvas = new Node('canvas', app);
    const hud = new Node('hud', app);
    doc.createElement = (tag) => new Node(tag);
    const view = createDenShopView({
      progression, pause: vi.fn(), resume: vi.fn(), bus: createEmitter(), canvas, doc, hudRoot: hud, mountRoot: app,
      applyDenSpot: (s, id, now) => applied.push([id, now]),
    });
    const sheet = app.children.find((c) => c.attrs.role === 'dialog');
    view.setActive(true);
    view.open();
    const tap = (attr, key, value) => {
      const b = new Node('button', sheet);
      b.attrs[attr] = value ?? '';
      if (key) b.dataset[key] = value;
      const ev = dispatch(b, 'click');
      b.remove();
      return ev;
    };
    const spot = (id) => tap('data-den-plan-spot', 'denPlanSpot', id);
    const chip = (id) => tap('data-den-hand-item', 'denHandItem', id);
    const key = (target, code) => dispatch(target, 'keydown', { code });
    return { progression, view, sheet, applied, tap, spot, chip, key, doc, app };
  }
  const den = (t) => t.progression.state.den;

  it('opens on My things when she owns something; the tab strip switches and is remembered on this device only', () => {
    const t = plan();
    expect(t.sheet.innerHTML).toContain('data-den-plan-spot');
    t.tap('data-den-tab', 'denTab', 'shop');
    expect(t.sheet.innerHTML).toContain('data-den-item');
    expect(t.sheet.innerHTML).not.toContain('data-den-plan-spot');
    expect(Object.keys(den(t)).sort()).toEqual(['owned', 'placed']);
  });

  it('a shelf chip takes a piece in hand; a spot places it once, live; nothing else changes', () => {
    const t = plan();
    t.chip('lamp');
    expect(t.view.isPlacing).toBe(true);
    t.spot('window');
    expect(den(t).placed).toEqual({ window: 'lamp' });
    expect(t.applied).toEqual([['window', 'lamp']]);
    expect(t.view.isPlacing).toBe(false);
    expect(t.sheet.innerHTML).toContain('Looks cosy');
  });

  it('tapping a standing piece picks it up; another spot moves it (two live updates)', () => {
    const t = plan(['bed'], { 'corner-a': 'bed' });
    t.spot('corner-a');
    expect(t.view.isPlacing).toBe(true);
    expect(t.sheet.innerHTML).toContain('data-den-put-away');
    t.spot('shelf');
    expect(den(t).placed).toEqual({ shelf: 'bed' });
    expect(t.applied).toEqual([['corner-a', null], ['shelf', 'bed']]);
  });

  it('dropping a picked-up piece on an occupied spot swaps the two', () => {
    const t = plan(['bed', 'lamp'], { 'corner-a': 'bed', shelf: 'lamp' });
    t.spot('corner-a');
    t.spot('shelf');
    expect(den(t).placed).toEqual({ 'corner-a': 'lamp', shelf: 'bed' });
    expect(t.sheet.innerHTML).toContain('swapped');
  });

  it('a shelf piece dropped on an occupied spot puts the old one back on the shelf', () => {
    const t = plan(['bed', 'lamp'], { shelf: 'lamp' });
    t.chip('bed');
    t.spot('shelf');
    expect(den(t).placed).toEqual({ shelf: 'bed' });
  });

  it('Put away clears the spot and keeps the piece owned', () => {
    const t = plan(['bed'], { 'corner-a': 'bed' });
    t.spot('corner-a');
    t.tap('data-den-put-away');
    expect(den(t)).toEqual({ owned: ['bed'], placed: {} });
    expect(t.applied).toEqual([['corner-a', null]]);
    expect(t.view.isPlacing).toBe(false);
  });

  it('Later drops the hand and changes nothing; an empty spot with nothing in hand only says what to do', () => {
    const t = plan(['bed'], { 'corner-a': 'bed' });
    t.spot('corner-a');
    t.tap('data-den-later');
    expect(den(t).placed).toEqual({ 'corner-a': 'bed' });
    t.spot('window');
    expect(den(t).placed).toEqual({ 'corner-a': 'bed' });
    expect(t.sheet.innerHTML).toContain('Pick a piece from Your things first');
    expect(t.applied).toEqual([]);
  });

  it('keyboard: Delete on a focused standing piece puts it away; arrows move between tabs; keys stay in the sheet', () => {
    const t = plan(['bed'], { 'corner-a': 'bed' });
    const b = new Node('button', t.sheet);
    b.attrs['data-den-plan-spot'] = 'corner-a';
    b.dataset.denPlanSpot = 'corner-a';
    const ev = t.key(b, 'Delete');
    expect(ev.defaultPrevented).toBe(true);
    expect(den(t).placed).toEqual({});
    const tabBtn = new Node('button', t.sheet);
    tabBtn.attrs['data-den-tab'] = 'things';
    tabBtn.dataset.denTab = 'things';
    t.key(tabBtn, 'ArrowLeft');
    expect(t.sheet.innerHTML).toContain('data-den-item');
  });

  it('a piece she does not own cannot be taken in hand', () => {
    const t = plan(['bed']);
    t.chip('lamp');
    expect(t.view.isPlacing).toBe(false);
  });

  it('Escape ladder: hand, then the panel', () => {
    const t = plan(['bed']);
    t.chip('bed');
    dispatch(t.app, 'keydown', { code: 'Escape' });
    expect(t.view.isPlacing).toBe(false);
    expect(t.view.isOpen).toBe(true);
    dispatch(t.app, 'keydown', { code: 'Escape' });
    expect(t.view.isOpen).toBe(false);
  });

  it('the save keeps its two keys and only valid ids after every action', () => {
    const t = plan(['bed', 'lamp']);
    t.chip('bed'); t.spot('window'); t.spot('window'); t.spot('shelf'); t.tap('data-den-put-away');
    expect(Object.keys(den(t)).sort()).toEqual(['owned', 'placed']);
    for (const [s, i] of Object.entries(den(t).placed)) expect(den(t).owned).toContain(i);
  });
});
