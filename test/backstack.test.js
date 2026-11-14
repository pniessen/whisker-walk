import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBackStack, walkBackAction, posOf, BACK_KEY, attachBackStack } from '../src/ui/backstack.js';

// A tab's history: entries with a state, a cursor, and popstate delivered
// only when flush() is called (as a browser delivers it later, not inside go()).
function fakeHistory({ entries = [null], index = 0 } = {}) {
  const h = {
    entries: [...entries],
    index,
    left: false, // went back past the page's own entry: the page is gone
    queue: [],
    urls: [],
    get state() { return h.entries[h.index]; },
    pushState(state, title, url) {
      h.urls.push(url);
      h.entries = h.entries.slice(0, h.index + 1);
      h.entries.push(state);
      h.index += 1;
    },
    go(n) { h.queue.push(n); },
    onpop: null,
    flush() {
      while (h.queue.length) {
        const n = h.queue.shift();
        const next = h.index + n;
        if (next < 0) { h.left = true; continue; }
        if (next >= h.entries.length) continue;
        h.index = next;
        h.onpop?.(h.state);
      }
    },
    // the browser's own Back / Forward
    back() { h.go(-1); h.flush(); },
    forward() { h.go(1); h.flush(); },
  };
  return h;
}

// A little game: a list of open layers; closing the top one pops it.
function rig(opts) {
  const h = fakeHistory(opts);
  const layers = [];
  const closed = [];
  const timers = [];
  const stack = createBackStack({
    hist: h,
    depth: () => layers.length,
    closeTop: () => { if (layers.length) closed.push(layers.pop()); },
    later: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    cancel: (id) => { timers[id - 1] = null; },
  });
  h.onpop = (state) => stack.onPop(state);
  return { h, layers, closed, stack, timers };
}

describe('posOf', () => {
  it('reads our place from an entry, and 0 from anything else', () => {
    expect(posOf({ [BACK_KEY]: 2 })).toBe(2);
    expect(posOf(null)).toBe(0);
    expect(posOf(undefined)).toBe(0);
    expect(posOf('x')).toBe(0);
    expect(posOf({ [BACK_KEY]: -1 })).toBe(0);
    expect(posOf({ [BACK_KEY]: 1.5 })).toBe(0);
    expect(posOf({ other: 3 })).toBe(0);
  });
});

describe('createBackStack', () => {
  it('holds no entry while nothing is open: Back on bare home is the browser\'s', () => {
    const { h, stack, closed } = rig();
    stack.sync();
    expect(h.entries.length).toBe(1);
    h.back();
    expect(h.left).toBe(true);
    expect(closed).toEqual([]);
  });

  it('adds one entry per open layer and never names a URL', () => {
    const { h, layers, stack } = rig();
    layers.push('menu');
    stack.sync();
    expect(h.entries.length).toBe(2);
    layers.push('journal');
    stack.sync();
    stack.sync(); // again changes nothing
    expect(h.entries.length).toBe(3);
    expect(h.index).toBe(2);
    expect(h.urls).toEqual([undefined, undefined]);
  });

  it('Back closes the top layer, one level at a time, then leaves from home', () => {
    const { h, layers, stack, closed } = rig();
    layers.push('menu'); stack.sync();
    layers.push('journal'); stack.sync();
    h.back();
    expect(closed).toEqual(['journal']);
    expect(layers).toEqual(['menu']);
    expect(h.left).toBe(false);
    h.back();
    expect(closed).toEqual(['journal', 'menu']);
    expect(h.index).toBe(0);
    expect(h.left).toBe(false);
    h.back();
    expect(h.left).toBe(true);
  });

  it('a layer closed by its own button leaves no dead entry behind', () => {
    const { h, layers, stack, closed } = rig();
    layers.push('menu'); stack.sync();
    layers.pop(); // its own Back button
    stack.sync();
    h.flush(); // our step back arrives
    expect(h.index).toBe(0);
    expect(closed).toEqual([]); // our own step closes nothing
    h.back();
    expect(h.left).toBe(true); // the very next Back leaves: nothing dead in between
  });

  it('two layers closed at once (the cat-face button) step back over both', () => {
    const { h, layers, stack, closed } = rig();
    layers.push('menu'); stack.sync();
    layers.push('journal'); stack.sync();
    layers.length = 0;
    stack.sync();
    h.flush();
    expect(h.index).toBe(0);
    expect(closed).toEqual([]);
  });

  it('a layer opened while our step back is on its way waits for it', () => {
    const { h, layers, stack } = rig();
    layers.push('menu'); stack.sync();
    layers.pop(); stack.sync(); // step back asked for, not arrived
    layers.push('dressup'); stack.sync(); // must not push yet
    expect(h.entries.length).toBe(2);
    expect(h.index).toBe(1);
    h.flush();
    expect(h.index).toBe(1); // back to 0, then one entry for Dress up
    expect(posOf(h.state)).toBe(1);
    h.back();
    expect(layers).toEqual([]);
    expect(h.left).toBe(false);
  });

  it('a layer that will not close keeps its entry (Back does not leave)', () => {
    const h = fakeHistory();
    let open = true;
    const stack = createBackStack({ hist: h, depth: () => (open ? 1 : 0), closeTop: () => {} });
    h.onpop = (s) => stack.onPop(s);
    stack.sync();
    h.back();
    expect(h.left).toBe(false);
    expect(h.index).toBe(1); // put back
    h.back();
    expect(h.left).toBe(false);
    open = false;
    stack.sync(); h.flush();
    expect(h.index).toBe(0);
  });

  it('closing the top layer may close more than one (a walk ending): history follows', () => {
    const h = fakeHistory();
    let n = 2;
    const stack = createBackStack({ hist: h, depth: () => n, closeTop: () => { n = 0; } });
    h.onpop = (s) => stack.onPop(s);
    stack.sync();
    h.back();
    h.flush();
    expect(n).toBe(0);
    expect(h.index).toBe(0);
  });

  it('Forward reopens nothing and is stepped back off', () => {
    const { h, layers, stack, closed } = rig();
    layers.push('menu'); stack.sync();
    h.back();
    expect(layers).toEqual([]);
    h.forward();
    h.flush();
    expect(layers).toEqual([]);
    expect(closed).toEqual(['menu']);
    expect(h.index).toBe(0);
  });

  it('a reload on one of our entries steps back over the leftovers', () => {
    const { h, stack, closed } = rig({ entries: [null, { [BACK_KEY]: 1 }, { [BACK_KEY]: 2 }], index: 2 });
    expect(stack.pos).toBe(2);
    stack.sync();
    h.flush();
    expect(h.index).toBe(0);
    expect(closed).toEqual([]);
  });

  it('a step back that never arrives stops being waited for', () => {
    const { h, layers, stack, timers } = rig();
    layers.push('menu'); stack.sync();
    layers.pop(); stack.sync();
    h.queue.length = 0; // the browser dropped it
    layers.push('menu'); stack.sync();
    expect(h.entries.length).toBe(2); // still waiting
    timers.at(-1).fn();
    // history says we are still on our entry, and a layer is open: it is reused
    expect(stack.pos).toBe(1);
    expect(h.entries.length).toBe(2);
    h.back();
    expect(layers).toEqual([]);
  });

  it('no history, or one that throws: switched off, and the game is untouched', () => {
    const none = createBackStack({ hist: null, depth: () => 1, closeTop: () => { throw new Error('no'); } });
    expect(none.dead).toBe(true);
    expect(() => { none.sync(); none.onPop(null); }).not.toThrow();

    const bad = { state: null, pushState() { throw new Error('SecurityError'); }, go() {} };
    let closes = 0;
    const s = createBackStack({ hist: bad, depth: () => 1, closeTop: () => { closes += 1; } });
    expect(() => s.sync()).not.toThrow();
    expect(s.dead).toBe(true);
    s.onPop(null);
    expect(closes).toBe(0);

    const worse = { get state() { throw new Error('no'); }, pushState() {}, go() {} };
    expect(createBackStack({ hist: worse, depth: () => 0, closeTop: () => {} }).dead).toBe(true);
  });

  it('a depth() that throws or lies counts as nothing open; a closeTop() that throws is survived', () => {
    const h = fakeHistory();
    const s = createBackStack({ hist: h, depth: () => { throw new Error('x'); }, closeTop: () => {} });
    s.sync();
    expect(h.entries.length).toBe(1);
    const s2 = createBackStack({ hist: h, depth: () => NaN, closeTop: () => {} });
    s2.sync();
    expect(h.entries.length).toBe(1);

    const h3 = fakeHistory();
    let open = 1;
    const s3 = createBackStack({ hist: h3, depth: () => open, closeTop: () => { open = 0; throw new Error('x'); } });
    h3.onpop = (st) => s3.onPop(st);
    s3.sync();
    const warn = console.warn;
    console.warn = () => {};
    try { expect(() => h3.back()).not.toThrow(); } finally { console.warn = warn; }
    expect(h3.index).toBe(0);
  });
});

describe('walkBackAction', () => {
  it('nothing to do when no walk is on and no summary is up', () => {
    expect(walkBackAction()).toBe(null);
    expect(walkBackAction({ engaged: true })).toBe(null);
  });
  it('the summary: Back is Continue', () => {
    expect(walkBackAction({ summary: true })).toBe('continue');
  });
  it('a walk being played: Back pauses it', () => {
    expect(walkBackAction({ walking: true, engaged: true, started: true, touch: true })).toBe('pause');
    expect(walkBackAction({ walking: true, engaged: true, started: true })).toBe('pause');
  });
  it('photo mode: Back puts the camera away first', () => {
    expect(walkBackAction({ walking: true, engaged: true, photo: true })).toBe('photo-off');
  });
  it('Paused: Back walks on, on touch only', () => {
    expect(walkBackAction({ walking: true, started: true, touch: true })).toBe('resume');
    expect(walkBackAction({ walking: true, started: true, touch: false })).toBe(null);
  });
  it('Ready? and Welcome back!: Back never starts the walk', () => {
    expect(walkBackAction({ walking: true, started: false, touch: true })).toBe(null);
  });
  it('the den shop: its question first, then the shop', () => {
    expect(walkBackAction({ walking: true, shop: true, shopAsk: true })).toBe('shop-not-now');
    expect(walkBackAction({ walking: true, shop: true })).toBe('shop-done');
  });
  it('the border post\'s card: Back is "not now"', () => {
    expect(walkBackAction({ walking: true, crossing: true, started: true, touch: true })).toBe('cross-no');
  });
});

describe('attachBackStack', () => {
  function fakeWin(hist) {
    const on = {};
    return {
      history: hist,
      on,
      timeouts: [],
      addEventListener(type, fn) { (on[type] ??= []).push(fn); },
      setTimeout(fn) { this.timeouts.push(fn); return this.timeouts.length; },
      clearTimeout() {},
      setInterval(fn) { this.tick = fn; return 1; },
    };
  }

  it('without history it wires nothing', () => {
    const win = fakeWin(undefined);
    const s = attachBackStack({ win, depth: () => 1, closeTop: () => {} });
    expect(s.dead).toBe(true);
    expect(win.on).toEqual({});
  });

  it('popstate closes the top layer; a tap and the tick keep history in step', () => {
    const h = fakeHistory();
    const win = fakeWin(h);
    const layers = [];
    attachBackStack({ win, depth: () => layers.length, closeTop: () => layers.pop() });
    h.onpop = (state) => win.on.popstate[0]({ state });
    layers.push('menu');
    win.on.click[0]();
    win.timeouts.pop()();
    expect(h.index).toBe(1);
    layers.push('journal');
    win.tick();
    expect(h.index).toBe(2);
    h.back();
    expect(layers).toEqual(['menu']);
  });

  it('Escape asks the home screen; when it closed a layer the key goes no further', () => {
    const h = fakeHistory();
    const win = fakeWin(h);
    let open = 1;
    attachBackStack({ win, depth: () => open, closeTop: () => {}, escape: () => { if (!open) return false; open = 0; return true; } });
    const key = (over = {}) => {
      const e = { key: 'Escape', stopped: false, prevented: false, target: { tagName: 'BUTTON' }, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...over };
      win.on.keydown[0](e);
      return e;
    };
    expect(key({ key: 'a' }).stopped).toBe(false);
    expect(open).toBe(1);
    expect(key({ target: { tagName: 'SELECT' } }).stopped).toBe(false);
    expect(open).toBe(1);
    const e = key();
    expect(open).toBe(0);
    expect(e.stopped && e.prevented).toBe(true);
    // nothing open (or a walk is on): the key is left alone
    const e2 = key();
    expect(e2.stopped || e2.prevented).toBe(false);
  });
});

describe('wiring', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
  it('main.js attaches the stack to the home screen and the walk', () => {
    expect(main).toMatch(/attachBackStack\(\{/);
    expect(main).toMatch(/homebase\.depth\(\)/);
    expect(main).toMatch(/homebase\.back\(\)/);
    expect(main).toMatch(/walkBackAction\(/);
  });
  it('the sheet\'s Back button and the browser\'s Back share one handler', () => {
    expect(home).toMatch(/closest\?\.\('#hb-back'\)\) \{\s*sheetBack\(\);/);
    expect(home).toMatch(/if \(openSheet\) \{ sheetBack\(\); return true; \}/);
  });
  it('nothing in src changes the address', () => {
    const src = readFileSync(new URL('../src/ui/backstack.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/location\.(hash|href|assign|replace)/);
    expect(src).not.toMatch(/replaceState/);
    expect(src).toMatch(/pushState\(\{ \[BACK_KEY\]: pos \+ 1 \}, ''\)/);
  });
});
