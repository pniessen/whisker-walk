import { describe, it, expect, vi, afterEach } from 'vitest';
import { topLayer, candidates, createNav, registerMap, activate, nudgeRange, cycleSelect } from '../src/gamepadnav.js';

// Fake DOM: just enough tree for layers and candidates (no jsdom in this project).
function el(tag, { cls = [], attrs = {}, kids = [], type } = {}) {
  const node = {
    tagName: tag.toUpperCase(),
    tag, type, attrs: { ...attrs }, cls: new Set(cls), kids, parent: null, disabled: !!attrs.disabled,
    classList: { contains: (c) => node.cls.has(c) },
    getAttribute: (k) => (k in node.attrs ? node.attrs[k] : null),
    hasAttribute: (k) => k in node.attrs,
    closest(sel) {
      const bad = sel.includes('.hidden');
      for (let n = node; n; n = n.parent) if (bad && (n.cls.has('hidden') || 'inert' in n.attrs || 'hidden' in n.attrs)) return n;
      return null;
    },
    get children() { return node.kids; },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => { for (const k of n.kids) { if (matches(k, sel)) out.push(k); walk(k); } };
      walk(node);
      return out;
    },
  };
  kids.forEach((k) => { k.parent = node; });
  return node;
}
// Matches only the selector parts the module uses; enough for these fakes.
function matches(n, sel) {
  return sel.split(',').map((s) => s.trim()).some((s) => {
    if (s === '[data-pad-layer]') return 'data-pad-layer' in n.attrs;
    if (s === 'button' || s === 'summary' || s === 'select') return n.tag === s;
    if (s === 'a[href]') return n.tag === 'a' && 'href' in n.attrs;
    if (s === '[role=button]') return n.attrs.role === 'button';
    if (s === '[tabindex]') return 'tabindex' in n.attrs;
    const m = s.match(/^input\[type=(\w+)\]$/);
    if (m) return n.tag === 'input' && n.type === m[1];
    return false;
  });
}
function fakeDoc({ layers = [], overlay = null, home = null } = {}) {
  const all = layers;
  return {
    querySelectorAll: (sel) => (sel === '[data-pad-layer]' ? all : []),
    getElementById: (id) => (id === 'overlay' ? overlay : id === 'homebase' ? home : null),
  };
}
const layer = (kids = [], extra = {}) => el('div', { attrs: { 'data-pad-layer': '', ...(extra.attrs ?? {}) }, cls: extra.cls ?? [], kids });

describe('topLayer', () => {
  it('two stacked layers: the later one wins', () => {
    const a = layer(); const b = layer();
    expect(topLayer(fakeDoc({ layers: [a, b] }))).toBe(b);
  });
  it('a hidden later layer is skipped', () => {
    const a = layer(); const b = layer([], { cls: ['hidden'] });
    expect(topLayer(fakeDoc({ layers: [a, b] }))).toBe(a);
  });
  it('an inert later layer is skipped', () => {
    const a = layer(); const b = layer([], { attrs: { inert: '' } });
    expect(topLayer(fakeDoc({ layers: [a, b] }))).toBe(a);
  });
  it('no layers: #overlay when it holds a card, else the home root', () => {
    const home = el('div');
    const full = el('div', { kids: [el('div')] });
    const empty = el('div');
    const hiddenFull = el('div', { cls: ['hidden'], kids: [el('div')] });
    expect(topLayer(fakeDoc({ overlay: full, home }))).toBe(full);
    expect(topLayer(fakeDoc({ overlay: empty, home }))).toBe(home);
    expect(topLayer(fakeDoc({ overlay: hiddenFull, home }))).toBe(home);
    expect(topLayer(fakeDoc({ home }))).toBe(home);
  });
});

describe('candidates', () => {
  it('keeps buttons, links, role=button (an SVG g too), tabindex>=0, checkbox, range, select; drops the rest', () => {
    const ok = [
      el('button'), el('a', { attrs: { href: '#' } }), el('div', { attrs: { role: 'button' } }),
      el('g', { attrs: { role: 'button', tabindex: '0' } }), el('div', { attrs: { tabindex: '0' } }),
      el('summary'), el('input', { type: 'checkbox' }), el('input', { type: 'radio' }),
      el('input', { type: 'range' }), el('select'),
    ];
    const no = [
      el('input', { type: 'text' }), el('input', { type: 'text', attrs: { tabindex: '0' } }),
      el('a'), el('div', { attrs: { tabindex: '-1' } }), el('p'),
      el('button', { cls: ['hidden'] }), el('button', { attrs: { disabled: '' } }),
      el('button', { attrs: { inert: '' } }),
    ];
    const l = layer([...ok, ...no]);
    expect(candidates(l)).toEqual(ok);
  });
  it('drops a button inside a hidden or inert wrapper', () => {
    const inside = el('button');
    const wrapped = el('div', { cls: ['hidden'], kids: [inside] });
    const live = el('button');
    expect(candidates(layer([wrapped, live]))).toEqual([live]);
  });
  it('a button, link or role=button with tabindex=-1 is skipped (spec: tabindex >= 0)', () => {
    const l = layer([el('button', { attrs: { tabindex: '-1' } }), el('a', { attrs: { href: '#', tabindex: '-1' } }), el('div', { attrs: { role: 'button', tabindex: '-1' } }), el('button', { attrs: { tabindex: '0' } })]);
    expect(candidates(l)).toHaveLength(1);
  });
  it('a disabled button flagged by the property alone is dropped', () => {
    const b = el('button'); b.disabled = true;
    expect(candidates(layer([b]))).toEqual([]);
  });
});

// ---- Navigator: move, press, sliders, selects, scroll ----
class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
function pad(tag, x, y, o = {}) {
  const n = el(tag, { type: o.type, attrs: o.attrs, cls: o.cls, kids: o.kids });
  n.rect = { left: x, top: y, width: 10, height: 10 };
  n.getBoundingClientRect = () => n.rect;
  n.scrollIntoView = vi.fn();
  n.dispatchEvent = vi.fn();
  n.focus = vi.fn(() => { n.ownerDocument.activeElement = n; });
  if (o.click !== false) n.click = vi.fn();
  return n;
}
function world(kidsOfTop, { under = [] } = {}) {
  const top = layer(kidsOfTop);
  const low = layer(under);
  const body = el('body');
  const doc = {
    body, activeElement: body,
    defaultView: { KeyboardEvent: FakeEvent, Event: FakeEvent },
    querySelectorAll: (s) => (s === '[data-pad-layer]' ? [low, top] : []),
    getElementById: () => null,
  };
  [...kidsOfTop, ...under].forEach((k) => { k.ownerDocument = doc; });
  return { doc, top, low };
}

describe('createNav step', () => {
  it('moves to the next candidate in the pushed direction, top layer only', () => {
    const a = pad('button', 0, 0); const b = pad('button', 100, 0);
    const under = pad('button', 30, 0);
    const { doc } = world([a, b], { under: [under] });
    const nav = createNav({ doc, back: () => false });
    doc.activeElement = a;
    expect(nav.step('right', 0)).toBe(true);
    expect(doc.activeElement).toBe(b);
    expect(under.focus).not.toHaveBeenCalled();
    expect(nav.step('right', 1)).toBe(false); // edge: no wrap
    expect(doc.activeElement).toBe(b);
  });
  it('scrolls the new focus into view once', () => {
    const a = pad('button', 0, 0); const b = pad('button', 100, 0);
    const { doc } = world([a, b]); doc.activeElement = a;
    createNav({ doc, back: () => false }).step('right', 0);
    expect(b.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(b.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
  it('null direction does nothing', () => {
    const a = pad('button', 0, 0); const { doc } = world([a]); doc.activeElement = a;
    expect(createNav({ doc, back: () => false }).step(null, 0)).toBe(false);
    expect(a.focus).not.toHaveBeenCalled();
  });
  it('focus dropped to body: picks the candidate nearest the last centre, not candidate 0', () => {
    const a = pad('button', 0, 0); const b = pad('button', 200, 0); const c = pad('button', 400, 0);
    const { doc, top } = world([a, b, c]); doc.activeElement = c;
    const nav = createNav({ doc, back: () => false });
    nav.step('left', 0); // c -> b
    expect(doc.activeElement).toBe(b);
    doc.activeElement = doc.body; // re-render dropped focus; b is rebuilt a little to the right
    const b2 = pad('button', 210, 0); b2.ownerDocument = doc; b2.parent = top;
    top.kids.splice(1, 1, b2); // same layer element, one child rebuilt (a rebuilt layer is a new screen)
    nav.step('right', 1);
    expect(doc.activeElement).toBe(b2);
  });
  it('focused element removed (activeElement outside the layer) recovers the same way', () => {
    const a = pad('button', 0, 0); const b = pad('button', 200, 0);
    const { doc } = world([a, b]); doc.activeElement = b;
    const nav = createNav({ doc, back: () => false });
    nav.step('left', 0); expect(doc.activeElement).toBe(a);
    doc.activeElement = pad('button', 0, 0); // detached stranger
    nav.step('down', 1);
    expect(doc.activeElement).toBe(a);
  });
  it('empty layer: nothing happens', () => {
    const { doc } = world([]);
    const nav = createNav({ doc, back: () => false });
    expect(nav.step('right', 0)).toBe(false);
    expect(nav.press()).toBe(false);
    expect(nav.enter()).toBe(false);
  });
  it('calls onActive when pad input is handled', () => {
    const a = pad('button', 0, 0); const { doc } = world([a]);
    const onActive = vi.fn();
    createNav({ doc, back: () => false, onActive }).enter();
    expect(onActive).toHaveBeenCalled();
  });
  it('caches candidates until the observer fires', () => {
    const a = pad('button', 0, 0); const b = pad('button', 100, 0);
    const { doc, top } = world([a]);
    let fire; let made = 0;
    doc.documentElement = el('html');
    doc.defaultView.MutationObserver = class { constructor(cb) { fire = cb; made++; } observe() {} };
    const nav = createNav({ doc, back: () => false });
    const spy = vi.spyOn(top, 'querySelectorAll');
    doc.activeElement = a;
    nav.step('right', 0); nav.step('right', 1);
    expect(made).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    top.kids.push(b); b.parent = top; b.ownerDocument = doc; fire();
    nav.step('right', 2);
    expect(doc.activeElement).toBe(b);
  });
  it('works without MutationObserver', () => {
    const a = pad('button', 0, 0); const b = pad('button', 100, 0);
    const { doc } = world([a, b]); doc.activeElement = a;
    expect(createNav({ doc, back: () => false }).step('right', 0)).toBe(true);
  });
});

describe('entry focus after a screen change', () => {
  const swapLayer = (doc, kids) => { const l = layer(kids); kids.forEach((k) => { k.ownerDocument = doc; k.parent = l; }); doc.querySelectorAll = (s) => (s === '[data-pad-layer]' ? [l] : []); return l; };
  it('a new top layer with nothing focused gets entry focus, not the control nearest the stale rect', () => {
    const a = pad('button', 0, 0); const b = pad('button', 200, 0);
    const { doc } = world([a, b]); doc.activeElement = b;
    const nav = createNav({ doc, back: () => false });
    nav.step('left', 0); // remembers a layer and a centre
    expect(doc.activeElement).toBe(a);
    doc.activeElement = doc.body; // A pressed: the old card went, a new one is up
    const near = pad('button', 5, 0); const def = pad('button', 300, 0, { attrs: { 'data-pad-default': '' } });
    swapLayer(doc, [near, def]);
    nav.step('down', 1);
    expect(doc.activeElement).toBe(def);
    expect(near.focus).not.toHaveBeenCalled();
  });
  it('same layer, but the focused element is gone and none of the old controls survive: entry focus', () => {
    const a = pad('button', 0, 0); const b = pad('button', 200, 0);
    const { doc, top } = world([a, b]); doc.activeElement = b;
    const nav = createNav({ doc, back: () => false });
    nav.step('left', 0);
    doc.activeElement = doc.body;
    const n1 = pad('button', 190, 0); const n2 = pad('button', 400, 0, { cls: ['primary'] });
    [n1, n2].forEach((k) => { k.ownerDocument = doc; k.parent = top; });
    top.kids.splice(0, top.kids.length, n1, n2); // the card's content was replaced in place
    nav.step('down', 1);
    expect(doc.activeElement).toBe(n2);
  });
  it('same-screen re-render where most siblings survive keeps the nearest-to-last rule', () => {
    const a = pad('button', 0, 0); const b = pad('button', 200, 0); const c = pad('button', 400, 0);
    const { doc, top } = world([a, b, c]); doc.activeElement = c;
    const nav = createNav({ doc, back: () => false });
    nav.step('left', 0); expect(doc.activeElement).toBe(b);
    doc.activeElement = doc.body;
    const b2 = pad('button', 205, 0); b2.ownerDocument = doc; b2.parent = top;
    top.kids.splice(1, 1, b2); // only b is rebuilt
    nav.step('right', 1);
    expect(doc.activeElement).toBe(b2);
  });
});

describe('enter leaves a text field alone', () => {
  it('a focused text input or textarea is not stolen; a checkbox focus is not a text field', () => {
    for (const [tag, type] of [['input', 'text'], ['textarea', undefined], ['input', 'search']]) {
      const t = pad(tag, 0, 0, { type }); const b = pad('button', 50, 0);
      const { doc } = world([b]); t.ownerDocument = doc; doc.activeElement = t;
      expect(createNav({ doc, back: () => false }).enter()).toBe(false);
      expect(b.focus).not.toHaveBeenCalled();
    }
    const cb = pad('input', 0, 0, { type: 'checkbox' }); const b = pad('button', 50, 0);
    const { doc } = world([b]); doc.activeElement = cb;
    expect(createNav({ doc, back: () => false }).enter()).toBe(true);
  });
});

describe('createNav enter (entry focus)', () => {
  it('prefers data-pad-default, then a .primary, then the first candidate', () => {
    const a = pad('button', 0, 0); const p = pad('button', 50, 0, { cls: ['primary'] });
    const d = pad('button', 100, 0, { attrs: { 'data-pad-default': '' } });
    let w = world([a, p, d]); createNav({ doc: w.doc, back: () => false }).enter();
    expect(w.doc.activeElement).toBe(d);
    const a2 = pad('button', 0, 0); const p2 = pad('button', 50, 0, { cls: ['primary'] });
    w = world([a2, p2]); createNav({ doc: w.doc, back: () => false }).enter();
    expect(w.doc.activeElement).toBe(p2);
    const a3 = pad('button', 0, 0); const b3 = pad('button', 50, 0);
    w = world([a3, b3]); createNav({ doc: w.doc, back: () => false }).enter();
    expect(w.doc.activeElement).toBe(a3);
  });
  it('leaves an already focused candidate alone', () => {
    const a = pad('button', 0, 0); const b = pad('button', 50, 0, { attrs: { 'data-pad-default': '' } });
    const { doc } = world([a, b]); doc.activeElement = a;
    expect(createNav({ doc, back: () => false }).enter()).toBe(false);
    expect(b.focus).not.toHaveBeenCalled();
  });
  it('step with nothing focused and no memory falls back to entry focus', () => {
    const a = pad('button', 0, 0); const b = pad('button', 50, 0);
    const { doc } = world([a, b]);
    createNav({ doc, back: () => false }).step('right', 0);
    expect(doc.activeElement).toBe(a);
  });
});

describe('press and activate', () => {
  it('HTML button: click() exactly once, no key events', () => {
    const a = pad('button', 0, 0); const { doc } = world([a]); doc.activeElement = a;
    expect(createNav({ doc, back: () => false }).press()).toBe(true);
    expect(a.click).toHaveBeenCalledTimes(1);
    expect(a.dispatchEvent).not.toHaveBeenCalled();
  });
  it('SVG role=button without click(): Enter keydown then keyup, no click', () => {
    const g = pad('g', 0, 0, { attrs: { role: 'button', tabindex: '0' }, click: false });
    const { doc } = world([g]); doc.activeElement = g;
    createNav({ doc, back: () => false }).press();
    const evs = g.dispatchEvent.mock.calls.map((c) => c[0]);
    expect(evs.map((e) => e.type)).toEqual(['keydown', 'keyup']);
    expect(evs.every((e) => e.key === 'Enter' && e.bubbles)).toBe(true);
  });
  it('checkbox and radio toggle via click', () => {
    const c = pad('input', 0, 0, { type: 'checkbox' }); const r = pad('input', 20, 0, { type: 'radio' });
    activate(c); activate(r);
    expect(c.click).toHaveBeenCalledTimes(1); expect(r.click).toHaveBeenCalledTimes(1);
  });
  it('select: press cycles instead of clicking', () => {
    const s = pad('select', 0, 0); s.options = [{}, {}]; s.selectedIndex = 0;
    s.ownerDocument = { defaultView: { Event: FakeEvent } };
    activate(s);
    expect(s.selectedIndex).toBe(1);
    expect(s.click).not.toHaveBeenCalled();
  });
  it('press with no focus does nothing', () => {
    const a = pad('button', 0, 0); const { doc } = world([a]);
    expect(createNav({ doc, back: () => false }).press()).toBe(false);
    expect(a.click).not.toHaveBeenCalled();
  });
  it('press on something under the top layer is ignored', () => {
    const a = pad('button', 0, 0); const u = pad('button', 5, 5);
    const { doc } = world([a], { under: [u] }); doc.activeElement = u;
    expect(createNav({ doc, back: () => false }).press()).toBe(false);
    expect(u.click).not.toHaveBeenCalled();
  });
});

describe('sliders and selects', () => {
  const range = (v, o = {}) => {
    const r = pad('input', 0, 0, { type: 'range' });
    Object.assign(r, { value: String(v), min: '0', max: '10', step: '2' }, o);
    r.ownerDocument = { defaultView: { Event: FakeEvent } };
    return r;
  };
  it('alt right/left changes by one step and fires input and change', () => {
    const r = range(4);
    expect(nudgeRange(r, 'right')).toBe(true);
    expect(r.value).toBe('6');
    expect(r.dispatchEvent.mock.calls.map((c) => c[0].type)).toEqual(['input', 'change']);
    nudgeRange(r, 'left'); nudgeRange(r, 'left');
    expect(r.value).toBe('2');
  });
  it('clamps at min and max, with no events when unchanged', () => {
    const lo = range(0); const hi = range(10);
    expect(nudgeRange(lo, 'left')).toBe(false); expect(lo.value).toBe('0');
    expect(nudgeRange(hi, 'right')).toBe(false); expect(hi.value).toBe('10');
    expect(lo.dispatchEvent).not.toHaveBeenCalled();
    const odd = range(9); nudgeRange(odd, 'right'); expect(odd.value).toBe('10');
  });
  it('fractional steps stay clean', () => {
    const r = range(0.1, { step: '0.1', max: '1' });
    nudgeRange(r, 'right'); nudgeRange(r, 'right');
    expect(r.value).toBe('0.3');
  });
  it('nav.alt works on a focused range, ignores other elements', () => {
    const r = range(2); const b = pad('button', 50, 0);
    const { doc } = world([r, b]); [r, b].forEach((k) => { k.ownerDocument = doc; });
    doc.activeElement = r;
    const nav = createNav({ doc, back: () => false });
    expect(nav.alt('right')).toBe(true); expect(r.value).toBe('4');
    doc.activeElement = b;
    expect(nav.alt('right')).toBe(false);
  });
  it('cycleSelect goes to the next option, wraps, and fires change', () => {
    const s = pad('select', 0, 0); s.options = [{}, {}, {}]; s.selectedIndex = 1;
    s.ownerDocument = { defaultView: { Event: FakeEvent } };
    expect(cycleSelect(s)).toBe(true); expect(s.selectedIndex).toBe(2);
    cycleSelect(s); expect(s.selectedIndex).toBe(0);
    expect(s.dispatchEvent.mock.calls.every((c) => c[0].type === 'change')).toBe(true);
    expect(s.dispatchEvent).toHaveBeenCalledTimes(2);
  });
  it('cycleSelect(el, -1) goes backwards, wraps, skips disabled and hidden options', () => {
    const s = pad('select', 0, 0); s.options = [{}, { disabled: true }, { hidden: true }, {}, {}]; s.selectedIndex = 3;
    s.ownerDocument = { defaultView: { Event: FakeEvent } };
    expect(cycleSelect(s, -1)).toBe(true); expect(s.selectedIndex).toBe(0); // 2 and 1 skipped
    cycleSelect(s, -1); expect(s.selectedIndex).toBe(4); // wraps
    cycleSelect(s); expect(s.selectedIndex).toBe(0); // default stays forward
    expect(s.dispatchEvent).toHaveBeenCalledTimes(3);
  });
  it('alt(left/right) on a focused select cycles it backward/forward; A (press) still cycles forward', () => {
    const s = pad('select', 0, 0); s.options = [{}, {}, {}]; s.selectedIndex = 1;
    const { doc } = world([s]); doc.activeElement = s;
    s.ownerDocument = doc;
    const nav = createNav({ doc, back: () => false });
    expect(nav.alt('left')).toBe(true); expect(s.selectedIndex).toBe(0);
    expect(nav.alt('left')).toBe(true); expect(s.selectedIndex).toBe(2);
    expect(nav.alt('right')).toBe(true); expect(s.selectedIndex).toBe(0);
    nav.press(); expect(s.selectedIndex).toBe(1);
  });
  it('select with one option: no change, no event', () => {
    const s = pad('select', 0, 0); s.options = [{}]; s.selectedIndex = 0;
    expect(cycleSelect(s)).toBe(false);
    expect(s.dispatchEvent).not.toHaveBeenCalled();
  });
});

describe('scroll', () => {
  it('scrolls the nearest scrollable ancestor of the focus by pixels', () => {
    const a = pad('button', 0, 0);
    const strip = pad('div', 0, 0, { kids: [a] });
    Object.assign(strip, { scrollWidth: 500, clientWidth: 100, scrollHeight: 50, clientHeight: 50, scrollBy: vi.fn() });
    strip.parentElement = null; a.parentElement = strip;
    const { doc } = world([strip]); doc.activeElement = a;
    expect(createNav({ doc, back: () => false }).scroll(30, 0)).toBe(true);
    expect(strip.scrollBy).toHaveBeenCalledWith({ left: 30, top: 0 });
  });
  it('zero scroll reads no layout; nothing scrollable returns false', () => {
    const a = pad('button', 0, 0); const wrap = pad('div', 0, 0, { kids: [a] });
    let reads = 0;
    Object.defineProperty(wrap, 'scrollHeight', { get() { reads++; return 10; } });
    a.parentElement = wrap; wrap.parentElement = null; wrap.scrollBy = vi.fn();
    const { doc } = world([wrap]); doc.activeElement = a;
    const nav = createNav({ doc, back: () => false });
    expect(nav.scroll(0, 0)).toBe(false); expect(reads).toBe(0);
    expect(nav.scroll(0, 20)).toBe(false); expect(wrap.scrollBy).not.toHaveBeenCalled();
  });
});

describe('scroll: real scrollers only', () => {
  const box = (o) => { const b = pad('div', 0, 0); Object.assign(b, { scrollWidth: 100, clientWidth: 100, scrollHeight: 50, clientHeight: 50, scrollBy: vi.fn(), parentElement: null }, o); return b; };
  const setup = (chain, styles) => {
    const a = pad('button', 0, 0);
    let child = a;
    chain.forEach((n) => { child.parentElement = n; child = n; });
    const { doc } = world([a]); doc.activeElement = a;
    doc.defaultView.getComputedStyle = (n) => styles.get(n) ?? { overflowX: 'visible', overflowY: 'visible' };
    return { a, doc, nav: createNav({ doc, back: () => false }) };
  };
  it('overflow:visible with overflowing content is skipped for an auto ancestor above', () => {
    const vis = box({ scrollHeight: 300 }); const auto = box({ scrollHeight: 300 });
    const { nav } = setup([vis, auto], new Map([[auto, { overflowY: 'auto', overflowX: 'hidden' }]]));
    expect(nav.scroll(0, 20)).toBe(true);
    expect(vis.scrollBy).not.toHaveBeenCalled();
    expect(auto.scrollBy).toHaveBeenCalledWith({ left: 0, top: 20 });
  });
  it('an auto ancestor with nothing to scroll is skipped', () => {
    const flat = box({}); 
    const { nav, doc } = setup([flat], new Map([[flat, { overflowY: 'auto', overflowX: 'auto' }]]));
    doc.scrollingElement = null; doc.documentElement = null;
    expect(nav.scroll(0, 20)).toBe(false);
    expect(flat.scrollBy).not.toHaveBeenCalled();
  });
  it('falls back to the document scrolling element', () => {
    const vis = box({ scrollHeight: 300 }); const root = box({ scrollHeight: 900, clientHeight: 400 });
    const { nav, doc } = setup([vis], new Map());
    doc.scrollingElement = root;
    expect(nav.scroll(0, 20)).toBe(true);
    expect(vis.scrollBy).not.toHaveBeenCalled();
    expect(root.scrollBy).toHaveBeenCalledWith({ left: 0, top: 20 });
  });
  it('scroll calls onActive', () => {
    const a = pad('button', 0, 0); const { doc } = world([a]);
    const onActive = vi.fn(); createNav({ doc, back: () => false, onActive }).scroll(5, 0);
    expect(onActive).toHaveBeenCalled();
  });
});

describe('cycleSelect skips unusable options; observer hygiene', () => {
  const sel = (opts, i) => { const s = pad('select', 0, 0); s.options = opts; s.selectedIndex = i; s.ownerDocument = { defaultView: { Event: FakeEvent } }; return s; };
  it('skips disabled and hidden options, wrapping', () => {
    const s = sel([{}, { disabled: true }, { hidden: true }, {}], 0);
    expect(cycleSelect(s)).toBe(true); expect(s.selectedIndex).toBe(3);
    cycleSelect(s); expect(s.selectedIndex).toBe(0);
  });
  it('a single enabled option: no change', () => {
    const s = sel([{}, { disabled: true }], 0);
    expect(cycleSelect(s)).toBe(false); expect(s.dispatchEvent).not.toHaveBeenCalled();
  });
  it('observer is filtered and destroy() disconnects it', () => {
    const { doc } = world([pad('button', 0, 0)]);
    doc.documentElement = el('html');
    const seen = {};
    doc.defaultView.MutationObserver = class { observe(r, o) { seen.o = o; } disconnect() { seen.off = true; } };
    createNav({ doc, back: () => false }).destroy();
    expect(seen.o.attributeFilter).toEqual(['class', 'hidden', 'inert', 'disabled', 'tabindex', 'style']);
    expect(seen.off).toBe(true);
  });
});

// ---- the world map: hop recentre, scroll pans, zoom ----
describe('map hooks', () => {
  const mapApi = (view) => ({ view, pan: vi.fn(), zoom: vi.fn(), scale: () => 2 });
  const placeG = (x, y, dx, dy) => pad('g', x, y, { attrs: { role: 'button', tabindex: '0', 'data-dr-map-place': '', 'data-x': String(dx), 'data-y': String(dy) }, click: false });
  afterEach(() => registerMap(null));

  it('a map registered before the navigator exists is still used (registerMap is module-level)', () => {
    const a = placeG(0, 0, 100, 100); const b = placeG(100, 0, 700, 300);
    const { doc } = world([a, b]);
    const api = mapApi({ x: 0, y: 0, w: 400, h: 300 });
    registerMap(api); // attached while no nav exists yet
    const nav = createNav({ doc, back: () => false }); // built later (first pad)
    doc.activeElement = a;
    expect(nav.step('right', 0)).toBe(true);
    expect(api.pan).toHaveBeenCalledTimes(1);
    expect(nav.zoom('in')).toBe(true);
    expect(api.zoom).toHaveBeenCalledWith('in');
  });

  it('hopping onto an off-screen place recentres through api.pan, with no :focus-visible involved', () => {
    const a = placeG(0, 0, 100, 100); const b = placeG(100, 0, 700, 300);
    const { doc } = world([a, b]);
    const api = mapApi({ x: 0, y: 0, w: 400, h: 300 });
    registerMap(api);
    doc.activeElement = a;
    expect(createNav({ doc, back: () => false }).step('right', 0)).toBe(true);
    expect(api.pan).toHaveBeenCalledTimes(1);
    expect(api.pan).toHaveBeenCalledWith((700 - 200) * 2, (300 - 150) * 2);
  });
  it('a place already on screen is left alone; no map registered is a no-op', () => {
    const a = placeG(0, 0, 100, 100); const b = placeG(100, 0, 300, 200);
    const { doc } = world([a, b]);
    const api = mapApi({ x: 0, y: 0, w: 400, h: 300 });
    registerMap(api);
    doc.activeElement = a;
    createNav({ doc, back: () => false }).step('right', 0);
    expect(api.pan).not.toHaveBeenCalled();
    registerMap(null);
    doc.activeElement = a;
    expect(() => createNav({ doc, back: () => false }).step('right', 0)).not.toThrow();
  });
  it('right-stick scroll pans the map when focus is inside its frame, scrolls normally otherwise', () => {
    const a = placeG(0, 0, 100, 100);
    a.closest = (sel) => (sel === '.wm-frame' ? {} : null);
    const strip = pad('div', 0, 0); Object.assign(strip, { scrollWidth: 500, clientWidth: 100, scrollHeight: 50, clientHeight: 50, scrollBy: vi.fn() });
    const out = pad('button', 50, 50); out.parentElement = strip; strip.parentElement = null;
    const { doc } = world([a, out]);
    const api = mapApi({ x: 0, y: 0, w: 400, h: 300 });
    registerMap(api);
    const nav = createNav({ doc, back: () => false });
    doc.activeElement = a;
    expect(nav.scroll(30, -10)).toBe(true);
    expect(api.pan).toHaveBeenCalledWith(30, -10);
    expect(strip.scrollBy).not.toHaveBeenCalled();
    doc.activeElement = out;
    expect(nav.scroll(30, 0)).toBe(true);
    expect(api.pan).toHaveBeenCalledTimes(1);
    expect(strip.scrollBy).toHaveBeenCalledWith({ left: 30, top: 0 });
  });
  it('zoom reaches the registered map; without one it does nothing', () => {
    const { doc } = world([pad('button', 0, 0)]);
    const nav = createNav({ doc, back: () => false });
    expect(nav.zoom('in')).toBe(false);
    const api = mapApi({ x: 0, y: 0, w: 1, h: 1 });
    registerMap(api);
    expect(nav.zoom('in')).toBe(true);
    expect(nav.zoom('out')).toBe(true);
    expect(api.zoom.mock.calls).toEqual([['in'], ['out']]);
  });
});
