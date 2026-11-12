// "Get it?" before paw points are spent from a menu: each dressing-room
// purchase (a hat, a cat, a place) goes through the real confirm card
// (confirmcard.js) and a real progression. A tap only asks; Not now changes
// nothing; Yes buys once, even on a double tap; a Yes after she can no longer
// afford it buys nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CATALOG, createProgression, STARTER_ACCESSORIES } from '../src/progression.js';
import { createDressingRoom } from '../src/ui/dressingroomview.js';
import { createConfirmCard } from '../src/ui/confirmcard.js';
import { CONFIRM_DELAY_MS } from '../src/ui/colonypanel.js';
import { renderPlacesSheetHtml, buildDressingModel } from '../src/ui/dressingroom.js';

function fakeDocument() {
  const doc = { mounted: [], focused: [] };
  doc.createElement = () => {
    const el = {
      listeners: {}, innerHTML: '', id: '', className: '',
      addEventListener(t, f) { el.listeners[t] = f; },
      remove() { doc.mounted = doc.mounted.filter((c) => c !== el); },
      querySelector: () => ({ focus() {} }),
    };
    return el;
  };
  doc.querySelector = (sel) => ({ focus: () => doc.focused.push(sel) });
  return doc;
}

let doc;
let t;
beforeEach(() => { doc = fakeDocument(); globalThis.document = doc; t = 1000; });
afterEach(() => { delete globalThis.document; });

function room(extra = {}) {
  const map = new Map();
  const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
  const sync = { autoSync: vi.fn() };
  const card = createConfirmCard({ mount: (el) => doc.mounted.push(el), now: () => t });
  const onChange = vi.fn();
  const dr = createDressingRoom({ progression, sync, thumbs: {}, onChange, confirmSpend: (o) => card.ask(o), ...extra });
  return { dr, progression, sync, card, onChange };
}
const click = (dataset) => ({ target: { closest: () => ({ dataset }) } });
const cardEl = () => doc.mounted[0];
const text = () => cardEl().innerHTML;
// a tap on the card's Yes / Not now (detail 2 = the second tap of a double tap)
const answer = (a, detail = 1) => cardEl()?.listeners.click({ target: { closest: () => ({ getAttribute: () => a }) }, detail });

const acc = Object.keys(CATALOG.accessories).find((id) => !CATALOG.accessories[id].prize && CATALOG.accessories[id].price > 0 && !STARTER_ACCESSORIES.includes(id));
const cat = Object.keys(CATALOG.cats).find((id) => CATALOG.cats[id].price > 0 && !['tabby', 'siamese', 'persian'].includes(id));

const sites = [
  {
    name: 'a dress-up item (Unlock under Try on)',
    tap: { drAcc: acc, drAct: 'buy' },
    price: CATALOG.accessories[acc].price,
    words: () => `Get the ${CATALOG.accessories[acc].name}`,
    yes: 'Yes, get it',
    owned: (p) => p.isUnlocked('accessories', acc),
  },
  {
    name: 'a cat (the hero’s Unlock)',
    tap: { drBuyCat: cat },
    price: CATALOG.cats[cat].price,
    words: () => `Get ${CATALOG.cats[cat].name}`,
    yes: 'Yes, get it',
    owned: (p) => p.isUnlocked('cats', cat),
  },
  {
    name: 'a place (Change place’s Unlock button)',
    tap: { drPlaceBuy: 'park' },
    prep: (p) => { p.setEdition('legacy'); p.state.walks.neighborhood = 2; },
    price: CATALOG.areas.park.price,
    words: () => `Open ${CATALOG.areas.park.name}`,
    yes: 'Yes, open it',
    owned: (p) => p.isUnlocked('areas', 'park'),
  },
];

describe.each(sites)('spending on $name asks first', (site) => {
  function ready() {
    const r = room();
    site.prep?.(r.progression);
    r.progression.state.points = site.price + 7;
    return r;
  }

  it('a tap opens the card and spends nothing', () => {
    const { dr, progression, card } = ready();
    expect(dr.handleClick(click(site.tap))).toBe(true);
    expect(card.isOpen()).toBe(true);
    expect(text()).toContain(`${site.words()} for ${site.price} 🐾?`);
    expect(text()).toContain('You’ll have 7 🐾 left.');
    expect(text()).toContain(`>${site.yes}</button>`);
    expect(text()).not.toContain('confirm-card-danger');
    expect(progression.state.points).toBe(site.price + 7);
    expect(site.owned(progression)).toBe(false);
  });

  it('Not now leaves points and ownership as they were, and focus goes back', () => {
    const { dr, progression, card, sync } = ready();
    dr.handleClick(click(site.tap));
    t += CONFIRM_DELAY_MS;
    answer('no');
    expect(card.isOpen()).toBe(false);
    expect(progression.state.points).toBe(site.price + 7);
    expect(site.owned(progression)).toBe(false);
    expect(sync.autoSync).not.toHaveBeenCalled();
    expect(doc.focused).toHaveLength(1); // the control that asked
  });

  it('Yes buys exactly once, even on a double tap, then renders', () => {
    const { dr, progression, card, onChange, sync } = ready();
    dr.handleClick(click(site.tap));
    answer('yes'); // the tail of the tap that opened it: refused
    answer('yes', 2);
    expect(site.owned(progression)).toBe(false);
    t += CONFIRM_DELAY_MS;
    onChange.mockClear();
    answer('yes');
    answer('yes'); // the card is gone: a second tap lands on nothing
    expect(card.isOpen()).toBe(false);
    expect(site.owned(progression)).toBe(true);
    expect(progression.state.points).toBe(7);
    expect(sync.autoSync).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a Yes after she can no longer afford it buys nothing', () => {
    const { dr, progression, card } = ready();
    dr.handleClick(click(site.tap));
    progression.state.points = site.price - 1; // spent elsewhere meanwhile
    t += CONFIRM_DELAY_MS;
    answer('yes');
    expect(card.isOpen()).toBe(false);
    expect(site.owned(progression)).toBe(false);
    expect(progression.state.points).toBe(site.price - 1);
  });

  it('without a confirm card nothing is ever bought', () => {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    site.prep?.(progression);
    progression.state.points = site.price + 7;
    const dr = createDressingRoom({ progression, sync: { autoSync() {} }, thumbs: {}, onChange() {} });
    dr.handleClick(click(site.tap));
    expect(site.owned(progression)).toBe(false);
    expect(progression.state.points).toBe(site.price + 7);
  });
});

describe('Change place: the card itself never buys', () => {
  it('a place she can buy is a plain picture with an Unlock button, not a tappable card', () => {
    const s = { points: 500, walks: { neighborhood: 2 }, unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] }, equipped: { cat: 'tabby' }, area: 'neighborhood', edition: 'legacy' };
    const html = renderPlacesSheetHtml(buildDressingModel(s, CATALOG));
    expect(html).not.toContain('data-dr-place="park"');
    expect(html).toMatch(/<div class="dr-place can-buy">[\s\S]*?data-dr-place-buy="park">Unlock — 50 🐾<\/button>/);
    // places she owns still walk on a tap
    expect(html).toMatch(/<button class="dr-place[^"]*" data-dr-place="neighborhood">/);
  });

  it('a stray place tap on a place that costs paws only asks; a confirmed one is chosen and reported', () => {
    const onPlaced = vi.fn();
    const { dr, progression, card } = room({ onPlaced });
    progression.setEdition('legacy');
    progression.state.walks.neighborhood = 2;
    progression.state.points = 60;
    dr.handleClick(click({ drPlace: 'park' }));
    expect(card.isOpen()).toBe(true);
    expect(onPlaced).not.toHaveBeenCalled();
    expect(progression.state.area).toBe('neighborhood');
    t += CONFIRM_DELAY_MS;
    answer('yes');
    expect(progression.state.area).toBe('park');
    expect(progression.state.points).toBe(10);
    expect(onPlaced).toHaveBeenCalledWith('park', 'bought');
  });

  it('a place she can no longer afford at Yes is refused the usual way (onPlaced with no outcome)', () => {
    const onPlaced = vi.fn();
    const { dr, progression } = room({ onPlaced });
    progression.setEdition('legacy');
    progression.state.walks.neighborhood = 2;
    progression.state.points = 60;
    dr.handleClick(click({ drPlaceBuy: 'park' }));
    progression.state.points = 10;
    t += CONFIRM_DELAY_MS;
    answer('yes');
    expect(progression.state.area).toBe('neighborhood');
    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(onPlaced.mock.calls[0]).toEqual(['park', false]);
  });

  it('a free place (a territory on the map) is still picked on one tap', () => {
    const { dr, progression, card } = room();
    progression.state.walks.neighborhood = 2;
    dr.handleClick(click({ drPlace: 'woods' }));
    expect(card.isOpen()).toBe(false);
    expect(progression.state.area).toBe('woods');
  });
});

describe('the dress-up tile keeps Try on and Unlock apart', () => {
  it('12px between the two buttons; Unlock and the place Unlock at least 44px tall', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.dr-pick\.locked \{ gap: 12px; \}/);
    expect(css).toMatch(/\.dr \.dr-pick-buy \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.dr-where \.dr-place-buy \{[^}]*min-height: 44px/);
  });
});
