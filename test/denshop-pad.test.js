// T13: the den shop's spots as a list card for the pad (TV mode); with TV mode off nothing changes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderDenShopHtml, spotChoices } from '../src/ui/denshop.js';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';
import { listHtml, openList } from '../src/tv/spotlist.js';
import { tvHooks, resetTv } from '../src/tvseam.js';
import { padLine } from '../src/tv/padwords.js';

const ids = Object.keys(DEN_ITEMS);
const state = (placed = {}, owned = ids.slice(0, 2)) => ({ points: 50, den: { owned, placed } });
const spot = DEN_SPOTS[0].id;

beforeEach(() => resetTv());
afterEach(() => resetTv());

describe('the spot row', () => {
  it('with TV mode off it is a select in a label, exactly as before', () => {
    const h = renderDenShopHtml(state(), DEN_ITEMS, DEN_SPOTS, {});
    expect(h).toContain(`<select data-den-spot="${spot}">`);
    expect(h).not.toContain('data-den-spot-open');
    expect(renderDenShopHtml(state(), DEN_ITEMS, DEN_SPOTS, { padSpots: null })).toBe(h);
  });
  it('with the pad list on, a button names the current piece and the select stays, hidden, as the data', () => {
    const h = renderDenShopHtml(state({ [spot]: ids[0] }), DEN_ITEMS, DEN_SPOTS, { padSpots: { none: padLine('pad.spot.none') } });
    expect(h).toContain(`data-den-spot-open="${spot}">${DEN_ITEMS[ids[0]].name} ✏️</button>`);
    expect(h).toContain(`<select data-den-spot="${spot}" hidden>`);
    expect(renderDenShopHtml(state(), DEN_ITEMS, DEN_SPOTS, { padSpots: { none: 'none' } })).toContain('none ✏️');
  });
});

describe('spotChoices', () => {
  it('is nothing first, then each owned piece, the current one marked, one elsewhere saying where', () => {
    const c = spotChoices(state({ [DEN_SPOTS[1].id]: ids[0], [spot]: ids[1] }), DEN_ITEMS, DEN_SPOTS, spot);
    expect(c.map((o) => o.value)).toEqual(['', ids[0], ids[1]]);
    expect(c[0]).toMatchObject({ label: null, current: false });
    expect(c[1].label).toMatch(/\(now: /);
    expect(c[2]).toMatchObject({ current: true });
    expect(spotChoices(state(), DEN_ITEMS, DEN_SPOTS, spot)[0].current).toBe(true);
  });
});

function rig() {
  const root = { attrs: {}, listeners: {}, removed: false, html: '', setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; }, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; } };
  const doc = { createElement: () => root, activeElement: null };
  const mounted = [];
  const click = (attr, value) => root.listeners.click({ target: { closest: () => ({ getAttribute: (a) => (a === attr ? value : null) }) } });
  const open = (o = {}) => openList({ doc, mount: (e) => mounted.push(e), titleId: 'pad.spot.title', slots: { spot: 'Window' }, options: [{ value: '', label: 'nothing', current: true }, { value: 'rug', label: 'Rug' }], ...o });
  return { root, mounted, click, open };
}

describe('the list card', () => {
  it('is a pad layer: current choice is the entry control, Close is last, nothing is chosen until a press', async () => {
    const r = rig();
    const p = r.open();
    expect(r.root.attrs['data-pad-layer']).toBe('');
    expect(r.root.html).toMatch(/data-ls-value=""[^>]*data-pad-default/);
    expect(r.root.html.indexOf('data-ls-close')).toBeGreaterThan(r.root.html.indexOf('data-ls-value="rug"'));
    expect(r.root.html).toContain('Choose for Window');
    r.click('data-ls-value', 'rug');
    await expect(p).resolves.toBe('rug');
    expect(r.root.removed).toBe(true);
  });
  it('"nothing" resolves the empty string (not null); Close and B resolve null; B is given back', async () => {
    const r = rig();
    let p = r.open();
    r.click('data-ls-value', '');
    await expect(p).resolves.toBe('');
    const prev = () => false;
    tvHooks.back = prev;
    p = r.open();
    expect(tvHooks.back()).toBe(true);
    await expect(p).resolves.toBe(null);
    expect(tvHooks.back).toBe(prev);
    p = r.open();
    r.click('data-ls-close', null);
    await expect(p).resolves.toBe(null);
  });
  it('a second list while one is up is refused', async () => {
    const r = rig();
    const p = r.open();
    await expect(r.open()).resolves.toBe(null);
    r.click('data-ls-close', null);
    await p;
  });
  it('listHtml escapes and has no raw tokens', () => {
    const h = listHtml({ title: 'T', options: [{ value: 'a"b', label: '<b>', current: false }], close: padLine('pad.list.close') });
    expect(h).not.toContain('<b>');
    expect(h).toContain('&lt;b&gt;');
  });
});
