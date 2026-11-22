import { describe, it, expect } from 'vitest';
import { topLayer, candidates } from '../src/gamepadnav.js';

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
