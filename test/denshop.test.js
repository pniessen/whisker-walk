import { describe, it, expect } from 'vitest';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';
import { renderDenShopHtml, SPOT_LABEL, changedSpots } from '../src/ui/denshop.js';

const ITEM_IDS = Object.keys(DEN_ITEMS);
const count = (html, re) => (html.match(re) ?? []).length;
const st = (over = {}) => ({ points: 0, den: { owned: [], placed: {} }, ...over });

// The <select> for one spot, as a string, so option checks stay per spot.
function selectFor(html, spotId) {
  const m = html.match(new RegExp(`<select[^>]*data-den-spot="${spotId}"[^>]*>([\\s\\S]*?)</select>`));
  return m ? m[1] : null;
}

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
  it('one card per DEN_ITEMS entry and one spot row per DEN_SPOTS entry', () => {
    const html = renderDenShopHtml(st(), DEN_ITEMS, DEN_SPOTS);
    expect(count(html, /class="ds-card[ "]/g)).toBe(ITEM_IDS.length);
    expect(count(html, /class="ds-spot"/g)).toBe(DEN_SPOTS.length);
    for (const id of ITEM_IDS) expect(html).toContain(DEN_ITEMS[id].name);
    for (const spot of DEN_SPOTS) {
      expect(html).toContain(`data-den-spot="${spot.id}"`);
      expect(html).toContain(SPOT_LABEL[spot.id]);
      expect(html).not.toContain(`>${spot.id}<`);
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
    const html = renderDenShopHtml(st({ points, den: { owned: [ownedId], placed: {} } }), DEN_ITEMS, DEN_SPOTS);
    const card = (id) => html.match(new RegExp(`<div class="ds-card[^"]*" data-den-item="${id}">[\\s\\S]*?</div>\\s*</div>`))[0];
    expect(card(ownedId)).toContain('ds-card owned');
    expect(card(ownedId)).toContain('Yours');
    expect(card(ownedId)).not.toContain('data-den-buy');
    expect(card(cheapId)).toContain(`data-den-buy="${cheapId}"`);
    expect(card(cheapId)).toContain(`${DEN_ITEMS[cheapId].price} 🐾`);
    expect(card(dear)).toContain('ds-card locked');
    expect(card(dear)).not.toContain('data-den-buy');
    expect(card(dear)).toContain(`${DEN_ITEMS[dear].price} 🐾`);
  });

  it('a buy button appears exactly for each unowned item the points cover', () => {
    const points = 30;
    const owned = [ITEM_IDS[0]];
    const html = renderDenShopHtml(st({ points, den: { owned, placed: {} } }), DEN_ITEMS, DEN_SPOTS);
    const expected = ITEM_IDS.filter((id) => !owned.includes(id) && DEN_ITEMS[id].price <= points).length;
    expect(count(html, /data-den-buy="/g)).toBe(expected);
  });

  it('each select offers empty plus every owned item, with the placed one selected', () => {
    const owned = ITEM_IDS.slice(0, 3);
    const [spotA, spotB] = DEN_SPOTS;
    const html = renderDenShopHtml(
      st({ den: { owned, placed: { [spotA.id]: owned[1] } } }), DEN_ITEMS, DEN_SPOTS,
    );
    for (const spot of DEN_SPOTS) {
      const sel = selectFor(html, spot.id);
      expect(sel).not.toBeNull();
      expect(count(sel, /<option /g)).toBe(owned.length + 1);
      expect(sel).toContain('<option value=""');
      for (const id of owned) expect(sel).toContain(`value="${id}"`);
    }
    expect(selectFor(html, spotA.id)).toMatch(new RegExp(`value="${owned[1]}" selected`));
    expect(selectFor(html, spotB.id)).toMatch(/value="" selected/);
    // the piece standing elsewhere says where it is now, so a pick reads as a move
    expect(selectFor(html, spotB.id)).toContain(SPOT_LABEL[spotA.id]);
  });

  it('shows the points through asFiniteNonNeg and a big Done button', () => {
    expect(renderDenShopHtml(st({ points: 42 }), DEN_ITEMS, DEN_SPOTS)).toContain('42');
    const html = renderDenShopHtml(st({ points: NaN }), DEN_ITEMS, DEN_SPOTS);
    expect(html).not.toContain('NaN');
    expect(html).toContain('data-den-done');
  });

  it('nothing owned yet: a warm hint, and the shop comes first', () => {
    const html = renderDenShopHtml(st({ points: 100 }), DEN_ITEMS, DEN_SPOTS);
    expect(html).toContain('ds-hint');
    expect(html.indexOf('ds-cards')).toBeLessThan(html.indexOf('ds-spots'));
  });

  it('something owned: arranging comes first, no hint', () => {
    const html = renderDenShopHtml(st({ den: { owned: [ITEM_IDS[0]], placed: {} } }), DEN_ITEMS, DEN_SPOTS);
    expect(html).not.toContain('ds-hint');
    expect(html.indexOf('ds-spots')).toBeLessThan(html.indexOf('ds-cards'));
  });

  it('a hostile state.den renders without throwing and drops what it does not know', () => {
    const hostile = [
      undefined, null, 7, 'x', [], { owned: 'rug', placed: 5 },
      { owned: [null, 5, '<b>', 'nope', ITEM_IDS[0]], placed: { [DEN_SPOTS[0].id]: '<script>', bogus: ITEM_IDS[0] } },
      { owned: [ITEM_IDS[0]], placed: { [DEN_SPOTS[0].id]: ITEM_IDS[1] } }, // placed but not owned
    ];
    for (const den of hostile) {
      const html = renderDenShopHtml({ points: 'lots', den }, DEN_ITEMS, DEN_SPOTS);
      expect(count(html, /class="ds-card[ "]/g)).toBe(ITEM_IDS.length);
      expect(count(html, /class="ds-spot"/g)).toBe(DEN_SPOTS.length);
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>');
      expect(html).not.toContain('value="nope"');
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
