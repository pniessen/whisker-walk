import { describe, it, expect } from 'vitest';
import { PAW } from '../src/ui/pawicon.js';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';
import { renderDenShopHtml, SPOT_LABEL, changedSpots } from '../src/ui/denshop.js';
import { PLAN_CELLS } from '../src/ui/denplan.js';

const ITEM_IDS = Object.keys(DEN_ITEMS);
const count = (html, re) => (html.match(re) ?? []).length;
const st = (over = {}) => ({ points: 0, den: { owned: [], placed: {} }, ...over });

describe('SPOT_LABEL', () => {
  it('gives every DEN_SPOTS id a short friendly label, and nothing else', () => {
    for (const spot of DEN_SPOTS) {
      expect(typeof SPOT_LABEL[spot.id]).toBe('string');
      expect(SPOT_LABEL[spot.id].length).toBeGreaterThan(0);
      expect(SPOT_LABEL[spot.id].length).toBeLessThanOrEqual(24);
      expect(SPOT_LABEL[spot.id]).not.toContain('-');
    }
    expect(Object.keys(SPOT_LABEL).length).toBe(DEN_SPOTS.length);
  });

  it('labels are all different, so two rows never read the same', () => {
    const labels = Object.values(SPOT_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('renderDenShopHtml', () => {
  it('Shop tab: one card per DEN_ITEMS entry; My things tab: one plan button per DEN_SPOTS entry', () => {
    const shop = renderDenShopHtml(st(), DEN_ITEMS, DEN_SPOTS, { tab: 'shop' });
    expect(count(shop, /class="ds-card[ "]/g)).toBe(ITEM_IDS.length);
    expect(shop).not.toContain('data-den-plan-spot');
    for (const id of ITEM_IDS) expect(shop).toContain(DEN_ITEMS[id].name);
    const things = renderDenShopHtml(st(), DEN_ITEMS, DEN_SPOTS, { tab: 'things' });
    expect(count(things, /data-den-plan-spot=/g)).toBe(DEN_SPOTS.length);
    expect(things).not.toContain('<select');
    for (const spot of DEN_SPOTS) {
      expect(things).toContain(SPOT_LABEL[spot.id]);
      expect(things).not.toContain(`>${spot.id}<`);
      const c = PLAN_CELLS[spot.id];
      expect(things).toContain(`grid-column:${c.col + 1};grid-row:${c.row + 1}`);
    }
  });

  it('owned, affordable and unaffordable cards read differently', () => {
    const byPrice = [...ITEM_IDS].sort((a, b) => DEN_ITEMS[a].price - DEN_ITEMS[b].price);
    const dear = byPrice[byPrice.length - 1];
    const ownedId = byPrice.find((id) => id !== dear);
    const cheapId = byPrice.find((id) => id !== dear && id !== ownedId);
    // enough for the cheap one, not for the dearest
    const points = DEN_ITEMS[dear].price - 1;
    expect(DEN_ITEMS[cheapId].price).toBeLessThanOrEqual(points);
    const html = renderDenShopHtml(st({ points, den: { owned: [ownedId], placed: {} } }), DEN_ITEMS, DEN_SPOTS, { tab: 'shop' });
    const card = (id) => html.match(new RegExp(`<div class="ds-card[^"]*" data-den-item="${id}">[\\s\\S]*?</div>\\s*</div>`))[0];
    expect(card(ownedId)).toContain('ds-card owned');
    expect(card(ownedId)).toContain('Yours');
    expect(card(ownedId)).not.toContain('data-den-buy');
    expect(card(cheapId)).toContain(`data-den-buy="${cheapId}"`);
    expect(card(cheapId)).toContain(`${DEN_ITEMS[cheapId].price} ${PAW}`);
    expect(card(dear)).toContain('ds-card locked');
    expect(card(dear)).not.toContain('data-den-buy');
    expect(card(dear)).toContain(`${DEN_ITEMS[dear].price} ${PAW}`);
  });

  it('a buy button appears exactly for each unowned item the points cover', () => {
    const points = 30;
    const owned = [ITEM_IDS[0]];
    const html = renderDenShopHtml(st({ points, den: { owned, placed: {} } }), DEN_ITEMS, DEN_SPOTS, { tab: 'shop' });
    const expected = ITEM_IDS.filter((id) => !owned.includes(id) && DEN_ITEMS[id].price <= points).length;
    expect(count(html, /data-den-buy="/g)).toBe(expected);
  });

  it('the plan shows each placed piece on its spot and "empty" on the rest; the shelf lists what she owns and where it stands', () => {
    const owned = ITEM_IDS.slice(0, 3);
    const [spotA, spotB] = DEN_SPOTS;
    const html = renderDenShopHtml(st({ den: { owned, placed: { [spotA.id]: owned[1] } } }), DEN_ITEMS, DEN_SPOTS, { tab: 'things' });
    expect(html).toContain(`aria-label="${SPOT_LABEL[spotA.id]}: ${DEN_ITEMS[owned[1]].name}"`);
    expect(html).toContain(`aria-label="${SPOT_LABEL[spotB.id]}: empty"`);
    expect(count(html, /data-den-hand-item=/g)).toBe(owned.length);
    expect(html).toContain(SPOT_LABEL[spotA.id]);
    expect(html).toContain('not placed');
  });

  it('the labelled grid is the fallback: forced by ui.grid, or when a spot has no plan cell', () => {
    const forced = renderDenShopHtml(st(), DEN_ITEMS, DEN_SPOTS, { tab: 'things', grid: true });
    expect(forced).toContain('class="dp-grid"');
    expect(forced).not.toContain('class="dp-plan"');
    expect(count(forced, /data-den-plan-spot=/g)).toBe(DEN_SPOTS.length);
    const extra = [...DEN_SPOTS, { id: 'future', x: 0, z: 0 }];
    const fb = renderDenShopHtml(st(), DEN_ITEMS, extra, { tab: 'things' });
    expect(fb).toContain('class="dp-grid"');
    expect(count(fb, /data-den-plan-spot=/g)).toBe(extra.length);
    expect(renderDenShopHtml(st(), DEN_ITEMS, DEN_SPOTS, { tab: 'things' })).toContain('class="dp-plan"');
  });

  it('tabs: a tablist with the current one selected; with nothing owned Shop is first, with something owned My things', () => {
    const h = renderDenShopHtml(st(), DEN_ITEMS, DEN_SPOTS);
    expect(h).toContain('role="tablist"');
    expect(h).toMatch(/data-den-tab="shop" aria-selected="true"/);
    const o = renderDenShopHtml(st({ den: { owned: [ITEM_IDS[0]], placed: {} } }), DEN_ITEMS, DEN_SPOTS);
    expect(o).toMatch(/data-den-tab="things" aria-selected="true"/);
  });

  it('shows the points through asFiniteNonNeg and a big Done button', () => {
    expect(renderDenShopHtml(st({ points: 42 }), DEN_ITEMS, DEN_SPOTS)).toContain('42');
    const html = renderDenShopHtml(st({ points: NaN }), DEN_ITEMS, DEN_SPOTS);
    expect(html).not.toContain('NaN');
    expect(html).toContain('data-den-done');
  });

  it('nothing owned yet: a warm hint and the shop', () => {
    const html = renderDenShopHtml(st({ points: 100 }), DEN_ITEMS, DEN_SPOTS);
    expect(html).toContain('ds-hint');
    expect(html).toContain('ds-cards');
  });

  it('something owned: opens on My things, no shop hint', () => {
    const html = renderDenShopHtml(st({ den: { owned: [ITEM_IDS[0]], placed: {} } }), DEN_ITEMS, DEN_SPOTS);
    expect(html).not.toContain('Buy something you like');
    expect(html).toContain('data-den-plan-spot');
  });

  it('a hostile state.den renders without throwing and drops what it does not know', () => {
    const hostile = [
      undefined, null, 7, 'x', [], { owned: 'rug', placed: 5 },
      { owned: [null, 5, '<b>', 'nope', ITEM_IDS[0]], placed: { [DEN_SPOTS[0].id]: '<script>', bogus: ITEM_IDS[0] } },
      { owned: [ITEM_IDS[0]], placed: { [DEN_SPOTS[0].id]: ITEM_IDS[1] } }, // placed but not owned
    ];
    for (const den of hostile) {
      const html = renderDenShopHtml({ points: 'lots', den }, DEN_ITEMS, DEN_SPOTS, { tab: 'shop' });
      const things = renderDenShopHtml({ points: 'lots', den }, DEN_ITEMS, DEN_SPOTS, { tab: 'things' });
      expect(count(html, /class="ds-card[ "]/g)).toBe(ITEM_IDS.length);
      expect(count(things, /data-den-plan-spot=/g)).toBe(DEN_SPOTS.length);
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>');
      expect(things).not.toContain('<script>');
    }
    expect(() => renderDenShopHtml(null, DEN_ITEMS, DEN_SPOTS)).not.toThrow();
    expect(() => renderDenShopHtml(undefined)).not.toThrow();
  });

  it('escapes item names and the note', () => {
    const items = { evil: { name: '<img src=x onerror=1>', price: 1 } };
    const html = renderDenShopHtml({ points: 5, den: { owned: [], placed: {} } }, items, [], { note: '<i>hi</i>' });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;img');
  });
});

describe('changedSpots', () => {
  it('lists every spot whose piece changed, with the new piece or null', () => {
    const [a, b, c] = DEN_SPOTS;
    const before = { [a.id]: 'rug', [b.id]: 'bed' };
    const after = { [b.id]: 'rug', [c.id]: 'lamp' };
    expect(changedSpots(before, after, DEN_SPOTS)).toEqual([
      [a.id, null], [b.id, 'rug'], [c.id, 'lamp'],
    ]);
  });

  it('nothing changed, or junk in: an empty list', () => {
    expect(changedSpots({ x: 1 }, { x: 1 }, DEN_SPOTS)).toEqual([]);
    expect(changedSpots(null, undefined, DEN_SPOTS)).toEqual([]);
    expect(changedSpots({}, {}, null)).toEqual([]);
  });
});

describe('Place it now (den shop UX M2)', () => {
  const owned = (extra = {}) => st({ points: 5, den: { owned: ['bed'], placed: {}, ...extra } });
  it('the "is yours" card has Place it now (the default) and Later, and no stage means no card', () => {
    const html = renderDenShopHtml(owned(), DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'yours', id: 'bed' } });
    expect(html).toContain(`${DEN_ITEMS.bed.name} is yours!`);
    expect(html).toMatch(/data-den-place-now data-pad-default/);
    expect(html).toContain('data-den-later');
    expect(renderDenShopHtml(owned(), DEN_ITEMS, DEN_SPOTS, {})).not.toContain('data-den-place-now');
  });
  it('a stage for a piece she does not own, or a made-up id, draws nothing', () => {
    const none = renderDenShopHtml(st(), DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'yours', id: 'bed' } });
    expect(none).not.toContain('data-den-place-now');
    const bad = renderDenShopHtml(owned(), DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'hand', id: '<img>' } });
    expect(bad).not.toContain('data-den-hand-spot');
    expect(bad).not.toContain('<img>');
  });
  it('place mode: the plan with one button per spot, the piece named, Later available, no dropdowns', () => {
    const html = renderDenShopHtml(owned(), DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'hand', id: 'bed' } });
    expect(count(html, /data-den-hand-spot=/g)).toBe(DEN_SPOTS.length);
    expect(html).toContain(`Pick a spot for ${DEN_ITEMS.bed.name}`);
    expect(html).toContain('data-den-later');
    expect(html).not.toContain('<select');
  });
  it('an owned piece with no spot says "not placed"; a placed one does not', () => {
    expect(renderDenShopHtml(owned(), DEN_ITEMS, DEN_SPOTS, { tab: 'shop' })).toContain('✓ Yours · not placed');
    expect(renderDenShopHtml(owned({ placed: { 'rug-spot': 'bed' } }), DEN_ITEMS, DEN_SPOTS, { tab: 'shop' })).not.toContain('not placed');
  });
});

describe('plan view in hand mode (den shop UX M3)', () => {
  const placedBed = st({ points: 5, den: { owned: ['bed', 'lamp'], placed: { 'corner-a': 'bed' } } });
  it('a piece picked up from a spot shows Put away and marks its old spot', () => {
    const h = renderDenShopHtml(placedBed, DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'hand', id: 'bed', from: 'corner-a' } });
    expect(h).toContain('data-den-put-away');
    expect(h).toMatch(/class="dp-spot filled from"[^>]*data-den-plan-spot="corner-a"/);
    expect(h).toContain('Donut Bed is in your hand');
  });
  it('a piece from the shelf has no Put away; the "from" is checked against the save', () => {
    expect(renderDenShopHtml(placedBed, DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'hand', id: 'lamp', from: null } })).not.toContain('data-den-put-away');
    expect(renderDenShopHtml(placedBed, DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'hand', id: 'lamp', from: 'corner-a' } })).not.toContain('data-den-put-away');
  });
  it('empty spots pulse (open) only with something in hand', () => {
    expect(renderDenShopHtml(placedBed, DEN_ITEMS, DEN_SPOTS, { tab: 'things' })).not.toContain('dp-spot empty open');
    expect(renderDenShopHtml(placedBed, DEN_ITEMS, DEN_SPOTS, { stage: { kind: 'hand', id: 'lamp' } })).toContain('dp-spot empty open');
  });
});
