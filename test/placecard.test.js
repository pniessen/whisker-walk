// World map step 2: Change place is the world map only, and a tap on a place
// opens its pop-up card (src/ui/placecard.js): its picture, name, a line and
// one button. Legacy Edition keeps its picture cards and never gets a card.
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { worldMapModel } from '../src/worldmap.js';
import { placeCardFor, renderPlaceCardHtml } from '../src/ui/placecard.js';
import { buildDressingModel, renderPlacesSheetHtml } from '../src/ui/dressingroom.js';
import { withOffWords, bannedLeaks } from './helpers/offwords.js';
import { htmlText } from './helpers/serieswords.js';

// Plain canon saves.
function base(extra = {}) {
  return {
    edition: 'canon',
    points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby' },
    area: 'neighborhood',
    ...extra,
  };
}
const fresh = base();
const owned = base({ unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood', 'woods'] } });
const today = base({ unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood', 'park'] }, area: 'park' });
const woodsOpen = base({ walks: { neighborhood: 2 } });
const park60 = base({ walks: { neighborhood: 2 }, points: 60 });
const park10 = base({ walks: { neighborhood: 2 }, points: 10 });
// A camp picked, a partner's pick, the Woods and the Park owned, so the camps
// and the ally ring show.
const midSave = base({
  walks: { neighborhood: 4, woods: 3, park: 1 },
  points: 30,
  unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood', 'woods', 'park'] },
  clanPick: { mine: 'woods', partner: 'river', partnerId: 'p1' },
  colony: { partner: { playerId: 'p1', petName: 'Sam' } },
});

const cardOn = (state, id) => placeCardFor(worldMapModel(state, CATALOG), id, state.points);

describe('the place card', () => {
  it('an owned place: Go here', () => expect(cardOn(owned, 'woods')).toMatchObject({ action: 'go', label: 'Go here', line: 'tap to go here', locked: false }));
  it("today's place: Go here, and says so", () => expect(cardOn(today, 'park')).toMatchObject({ action: 'go', line: 'you’re going here' }));
  it('a free wild place that is open: Go here', () => expect(cardOn(woodsOpen, 'woods')).toMatchObject({ action: 'go', line: 'Tap to explore' }));
  it('a street place she can open: Open for 50 🐾, and how many she has', () =>
    expect(cardOn(park60, 'park')).toMatchObject({ action: 'open', label: 'Open for 50 🐾', line: 'You have 60 🐾' }));
  // The card says how many paws she still needs, in main's own words (the
  // Legacy cards' "N more 🐾 to go"); the map's own label stays short.
  it('a street place she cannot afford: no button, the paws it costs and the paws still to find', () => {
    expect(cardOn(park10, 'park')).toMatchObject({ action: null, label: null, line: '50 🐾 · 40 more 🐾 to go' });
    expect(cardOn({ ...park10, points: 0 }, 'park')).toMatchObject({ action: null, line: '50 🐾 · 50 more 🐾 to go' });
    expect(worldMapModel(park10, CATALOG).regions.find((r) => r.id === 'park').line).toBe('50 🐾 — keep exploring!');
  });
  // The owner's wording fix (2026-11-19): a name that starts with "The" reads
  // "the" mid-line.
  it('a locked place: no button, the lock line', () =>
    expect(cardOn(fresh, 'seaside')).toMatchObject({ action: null, locked: true, line: 'opens after you explore the Old Docks 2 times · 0/2' }));
  // The guard: Go here only for a place she can walk. An odd old save whose
  // today's place is still locked gets the lock line and no button; so does
  // a place that is not built (a board region coming soon, or a street place
  // the catalog does not have yet).
  it("a locked place that is today's place (an odd old save): no Go here, only the lock line", () =>
    expect(cardOn(base({ area: 'seaside' }), 'seaside')).toMatchObject({ action: null, label: null, locked: true, line: 'opens after you explore the Old Docks 2 times · 0/2' }));
  it('a place that is not built: no Go here, only its line', () => {
    const soon = { regions: [{ areaId: 'rooftops', name: 'Rooftops', status: 'soon', owned: false, selected: false, locked: false, canOpen: false, price: 0, line: 'coming soon' }] };
    expect(placeCardFor(soon, 'rooftops', 0)).toMatchObject({ action: null, label: null, line: 'coming soon' });
    const noFarm = { ...CATALOG, areas: Object.fromEntries(Object.entries(CATALOG.areas).filter(([id]) => id !== 'farm')) };
    expect(placeCardFor(worldMapModel(fresh, noFarm), 'farm', 0)).toMatchObject({ action: null, label: null, line: 'coming soon' });
  });
  it("the island's card is the Pines'", () => expect(cardOn(fresh, 'pines').id).toBe('pines'));
  it('the town\'s card is the Neighborhood\'s, by its area id', () => expect(cardOn(fresh, 'neighborhood')).toMatchObject({ id: 'neighborhood', name: 'Twolegplace', action: 'go' }));
  it('no card for a place not on the map', () => expect(placeCardFor(worldMapModel(fresh, CATALOG), 'den', 0)).toBeNull());
  it('the card markup: a labelled dialog, its picture, one button, a close', () => {
    const html = renderPlaceCardHtml(cardOn(park60, 'park'), { picture: '/places/park.jpg' });
    expect(html).toMatch(/^<div class="wm-card" role="dialog" aria-labelledby="wm-card-name" data-wm-card="park">/);
    expect(html).toContain('<img class="wm-card-pic" src="/places/park.jpg" alt=""');
    expect(html).toContain('<button type="button" class="wm-card-buy" data-dr-place-buy="park">Open for 50 🐾</button>');
    expect(html).toContain('data-dr-map-close="park" aria-label="Close"');
    expect(html).not.toContain('data-dr-place=');
    const locked = renderPlaceCardHtml(cardOn(fresh, 'seaside'), { picture: 'x' });
    expect(locked).toContain('<h3 id="wm-card-name">🔒 Seaside</h3>');
    expect(locked).not.toMatch(/wm-card-(go|buy)/);
  });
  it('Go here is a place button the dressing room already handles', () => {
    const html = renderPlaceCardHtml(cardOn(owned, 'woods'), { picture: 'x' });
    expect(html).toContain('<button type="button" class="wm-card-go" data-dr-place="woods">Go here</button>');
    expect(html).toContain('<h3 id="wm-card-name">The Woods</h3>');
    expect(html).toContain('<p class="wm-card-line">tap to go here</p>');
  });
  it('everything is escaped', () => {
    const html = renderPlaceCardHtml({ id: 'a"b', name: '<b>', line: '<i>', locked: false, action: 'go', label: 'Go here' }, { picture: '"><script>' });
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('data-wm-card="a&quot;b"');
  });
});

describe('the Clan sheet: the world map only', () => {
  it('the Clan sheet is the map only, with the card when one is open', () => {
    const html = renderPlacesSheetHtml(buildDressingModel(park60, CATALOG, { mapCard: 'park' }), { clanLineHtml: '<p id="CL">x</p>' });
    expect(html.indexOf('id="CL"')).toBeLessThan(html.indexOf('class="wm-frame"'));
    expect(html.indexOf('world-map')).toBeLessThan(html.indexOf('class="wm-card"'));
    expect((html.match(/class="wm-card"/g) || []).length).toBe(1);
    expect(html).not.toContain('More places');
    expect(html).not.toContain('class="dr-place');
    expect(html).toContain('data-wm-zoom="in"');
    expect(renderPlacesSheetHtml(buildDressingModel(park60, CATALOG))).not.toContain('wm-card"');
  });
  it('the sheet markup, as the brief pins it', () => {
    const m = buildDressingModel(park60, CATALOG);
    const html = renderPlacesSheetHtml(m, { clanLineHtml: '<p id="CL">x</p>' });
    expect(html).toMatch(/^<div class="dr-where"><p id="CL">x<\/p><div class="wm-frame"><svg /);
    expect(html.endsWith('</svg><div class="wm-zoom"><button type="button" class="wm-zoom-in" data-wm-zoom="in" aria-label="Zoom in">＋</button>'
      + '<button type="button" class="wm-zoom-out" data-wm-zoom="out" aria-label="Zoom out">－</button></div></div></div>')).toBe(true);
  });
  it('the Clan model carries the world map and the card, not the old map or other places', () => {
    const m = buildDressingModel(park60, CATALOG, { mapCard: 'park' });
    expect(m.worldMap.regions).toHaveLength(11);
    expect(m.placeCard).toMatchObject({ id: 'park', action: 'open' });
    expect(m).not.toHaveProperty('territoryMap');
    expect(m).not.toHaveProperty('otherPlaces');
    expect(buildDressingModel(park60, CATALOG).placeCard).toBeNull();
    expect(buildDressingModel(park60, CATALOG, { mapCard: 'den' }).placeCard).toBeNull();
  });
  it('Legacy keeps its picture cards, never gets a card, and an open card id changes nothing', () => {
    const s = { ...park60, edition: 'legacy' };
    expect(buildDressingModel(s, CATALOG, { mapCard: 'park' }).placeCard).toBeNull();
    expect(buildDressingModel(s, CATALOG)).not.toHaveProperty('worldMap');
    expect(renderPlacesSheetHtml(buildDressingModel(s, CATALOG, { mapCard: 'park' }))).toBe(renderPlacesSheetHtml(buildDressingModel(s, CATALOG)));
    expect(renderPlacesSheetHtml(buildDressingModel(s, CATALOG))).not.toContain('world-map');
  });
  it('the everyday-words version: every place on the map, no family word anywhere', () => {
    withOffWords(() => {
      const html = renderPlacesSheetHtml(buildDressingModel(midSave, CATALOG, { mapCard: 'neighborhood' }));
      expect(new Set([...html.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id)).size).toBe(11);
      expect(bannedLeaks(htmlText(html))).toEqual([]);
      expect(html).toContain('Peopleville');
    });
  });
});
