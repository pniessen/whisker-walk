import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { SKILLS } from '../src/skills.js';
import { CLAN_SUFFIX } from '../src/clanwords.js';
import { CAT_BLURBS, ACC_BLURBS } from '../src/ui/catblurbs.js';
import { PAW } from '../src/ui/pawicon.js';
import { clanName } from '../src/clanhomes.js';
import {
  HOME_SHEETS, SHEET_LABEL, resolveSheet, PLACE_PICTURE,
  MENU_TILES, GROWNUP_SHEETS,
  buildDressingModel, renderSlotPickerHtml, renderDressingRoomHtml, renderPlacesSheetHtml, poseToggleHtml,
} from '../src/ui/dressingroom.js';

function defaultishState() {
  return {
    points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0 },
    unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
    equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
    area: 'neighborhood',
  };
}
const count = (s, re) => (s.match(re) || []).length;

describe('dressing-room model', () => {
  it('one portrait per catalog cat, in catalog order', () => {
    const m = buildDressingModel(defaultishState(), CATALOG);
    expect(m.cats.map((c) => c.id)).toEqual(Object.keys(CATALOG.cats));
  });
  it('slot count and wearing count come from the catalog and save', () => {
    const s = defaultishState(); s.equipped.collar = 'bell'; s.equipped.neck = 'bandana';
    const m = buildDressingModel(s, CATALOG);
    expect(m.slotCount).toBe(new Set(Object.values(CATALOG.accessories).map((a) => a.slot)).size);
    expect(m.wearingCount).toBe(2);
  });
  it('previewing a locked cat changes the hero, never the save', () => {
    const s = defaultishState(); const before = JSON.stringify(s);
    const m = buildDressingModel(s, CATALOG, { previewCat: 'hagrid' });
    expect(m.hero).toMatchObject({ id: 'hagrid', owned: false });
    expect(JSON.stringify(s)).toBe(before);
  });
  it('an unknown preview id falls back to the equipped cat', () => {
    const m = buildDressingModel(defaultishState(), CATALOG, { previewCat: 'nope' });
    expect(m.hero.id).toBe('tabby');
    expect(m.hero.owned).toBe(true);
  });
  it('canBuy follows points', () => {
    const s = defaultishState(); s.points = 60;
    expect(buildDressingModel(s, CATALOG, { previewCat: 'hagrid' }).hero.canBuy).toBe(true);
    s.points = 59;
    expect(buildDressingModel(s, CATALOG, { previewCat: 'hagrid' }).hero.canBuy).toBe(false);
  });
  it('tryOn overrides one slot for display only', () => {
    const s = defaultishState(); const before = JSON.stringify(s);
    const m = buildDressingModel(s, CATALOG, { tryOn: { slot: 'head', id: 'crown' } });
    expect(m.slots.find((x) => x.slot === 'head')).toMatchObject({ itemId: 'crown', trying: true });
    expect(m.wearingCount).toBe(0);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('a gated area says how to open it', () => {
    const m = buildDressingModel({ ...defaultishState(), edition: 'legacy' }, CATALOG);
    expect(m.places.find((p) => p.id === 'seaside').lockLine).toContain('opens after 2 walks in City Park');
    expect(m.places.find((p) => p.id === 'park').lockLine).toBe('opens after 2 walks in Cozy Neighborhood · 0/2 so far');
  });
  it('an unlocked-by-gate but unbought area shows its price', () => {
    const s = defaultishState(); s.walks.neighborhood = 2;
    const park = buildDressingModel(s, CATALOG).places.find((p) => p.id === 'park');
    const price = CATALOG.areas.park.price;
    expect(park.lockLine).toBe(`${price} 🐾 — keep walking!`);
    expect(park.canBuy).toBe(false);
    s.points = price;
    const afford = buildDressingModel(s, CATALOG).places.find((p) => p.id === 'park');
    expect(afford.canBuy).toBe(true);
    expect(afford.lockLine).toBe(`Tap to unlock — ${price} 🐾`);
  });
  it('abilities are counted from the live skill list', () => {
    expect(buildDressingModel(defaultishState(), CATALOG).abilities.total).toBe(SKILLS.length);
  });
});

describe('slot picker', () => {
  it('lists every accessory in the slot', () => {
    const want = Object.values(CATALOG.accessories).filter((a) => a.slot === 'head').length;
    const html = renderSlotPickerHtml(defaultishState(), CATALOG, 'head', null);
    expect(count(html, /class="dr-pick[ "]/g)).toBe(want);
  });
  it('an unwon prize is a wrapped surprise: no price, no try-on, not buyable', () => {
    const slot = CATALOG.accessories.leafcrown.slot;
    const s = defaultishState(); s.points = 9999;
    const html = renderSlotPickerHtml(s, CATALOG, slot, null);
    expect(html).toContain('prize-surprise');
    expect(html).toContain('A surprise at visit 20');
    const tile = html.match(/<div class="dr-pick[^"]*prize-surprise[^>]*>.*?<\/div>/)[0];
    expect(tile).not.toContain('data-dr-acc');
    expect(tile).not.toContain('🐾');
    expect(tile).not.toContain('Try on');
    expect(html).not.toContain('data-dr-acc="leafcrown"');
  });
  it('the surprise tile sizes its 🎁 with a span (::first-line does not apply to a flex box)', async () => {
    const slot = CATALOG.accessories.leafcrown.slot;
    const html = renderSlotPickerHtml(defaultishState(), CATALOG, slot, null);
    expect(html).toContain('<span class="gift" aria-hidden="true">🎁</span><span>A surprise at visit 20</span>');
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/prize-surprise::first-line/);
    expect(css).toMatch(/\.dr-pick\.prize-surprise \.gift\s*\{[^}]*font-size:\s*30px/);
  });
  it('on a phone the leave question has its own row, so Leave and Keep going stay side by side (Polish 3)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.dr \.cb-leave button\s*\{[^}]*white-space: nowrap/);
    expect(css).toMatch(/@media \(max-width: 480px\)\s*\{\s*\.cb-leave > span\s*\{[^}]*flex-basis: 100%/);
  });
  it('a won prize behaves like any owned item', () => {
    const slot = CATALOG.accessories.leafcrown.slot;
    const s = defaultishState(); s.unlocked.accessories.push('leafcrown');
    const wear = renderSlotPickerHtml(s, CATALOG, slot, null);
    expect(wear).toContain('data-dr-acc="leafcrown" data-dr-act="wear"');
    expect(wear).not.toContain('A surprise at visit 20');
    s.equipped[slot] = 'leafcrown';
    const on = renderSlotPickerHtml(s, CATALOG, slot, null);
    expect(on).toContain('data-dr-acc="leafcrown" data-dr-act="off"');
    expect(on).toContain('On ✓');
  });
  it('totals leave the prizes out', () => {
    const shop = Object.values(CATALOG.accessories).filter((a) => !a.prize).length;
    const s = defaultishState();
    s.unlocked.accessories.push(...Object.keys(CATALOG.accessories).filter((id) => CATALOG.accessories[id].prize));
    const m = buildDressingModel(s, CATALOG);
    expect(m.accessoryTotal).toBe(shop);
    expect(m.ownedAccessories).toBe(2);
  });
  it('labels owned, worn, affordable and unaffordable items', () => {
    const s = defaultishState(); s.equipped.collar = 'bell'; s.points = 25;
    const html = renderSlotPickerHtml(s, CATALOG, 'collar', null);
    expect(html).toContain('data-dr-acc="bell" data-dr-act="off"');
    expect(html).toContain('On ✓');
    expect(html).toContain('Take off');
    expect(html).toContain('data-dr-acc="heart" data-dr-act="buy"');
    expect(html).toContain(`Unlock — 25 ${PAW}`);
    expect(html).toContain("30 🐾 (can't afford)");
    const owned = renderSlotPickerHtml(defaultishState(), CATALOG, 'neck', null);
    expect(owned).toContain('data-dr-acc="bandana" data-dr-act="wear"');
  });
});

describe('dressing-room renderer', () => {
  const render = (over = {}, state = defaultishState(), mopts) => renderDressingRoomHtml({
    model: buildDressingModel(state, CATALOG, mopts), headerHtml: '<h1>HDR</h1>',
    startHtml: '<button id="start">GO</button>', extrasHtml: '<b>EXTRAS</b>',
    ui: { wardrobe: false, moreCats: false, openSlot: null, pickerHtml: '' }, ...over,
  });

  it('renders the regions once, in order, with caller HTML verbatim', () => {
    const html = render();
    const order = ['<header class="dr-top"', 'class="dr-hero"', 'class="dr-strip"', 'class="dr-wearing"', 'class="dr-today"',
      '<footer class="dr-dock"'].map((c) => html.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const t of ['<h1>HDR</h1>', '<b>EXTRAS</b>', '<button id="start">GO</button>']) expect(count(html, new RegExp(t.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toBe(1);
    expect(html).toContain('id="dr-stage"');
    expect(html).toContain('data-view="home"');
    expect(html).toContain('dr dr-view-home');
    expect(html).toContain('drag to spin');
    // home: the extras (the day/dusk switch) ride on the Today's walk card,
    // beside the card's button, never inside it
    const today = html.slice(html.indexOf('class="dr-today"'), html.indexOf('<footer class="dr-dock"'));
    expect(today).toContain('<div class="dr-today-extras"><b>EXTRAS</b></div>');
    expect(today.indexOf('</button>')).toBeLessThan(today.indexOf('EXTRAS'));
  });
  it('the wardrobe hides the walk card, so the extras move to the dock, before Start', () => {
    const html = render({ ui: { wardrobe: true, moreCats: false } });
    expect(html).not.toContain('class="dr-today"');
    expect(count(html, /EXTRAS/g)).toBe(1);
    const dock = html.slice(html.indexOf('<footer class="dr-dock"'));
    expect(dock.indexOf('EXTRAS')).toBeGreaterThan(-1);
    expect(dock.indexOf('EXTRAS')).toBeLessThan(dock.indexOf('id="start"'));
  });
  it('no extras, no empty corner on the card', () => {
    const html = render({ extrasHtml: '' });
    expect(html).not.toContain('dr-today-extras');
  });
  it('home shows the owned cats only (the rest wait behind "N more"); the wardrobe has one slot per slot; no phone pills', () => {
    const owned = defaultishState().unlocked.cats.length;
    const home = render();
    expect(count(home, /data-dr-cat=/g)).toBe(owned);
    expect(count(home, /data-dr-slot=/g)).toBe(0);
    const open = render({ ui: { wardrobe: true, moreCats: true } });
    expect(count(open, /data-dr-cat=/g)).toBe(Object.keys(CATALOG.cats).length);
    expect(count(open, /data-dr-slot=/g)).toBe(new Set(Object.values(CATALOG.accessories).map((a) => a.slot)).size);
    expect(home).not.toContain('data-dr-pill');
    expect(open).not.toContain('data-dr-pill');
    expect(home).toContain('aria-pressed="true"');
  });
  it('the home screen carries no place cards (the places sheet does) and no count labels', () => {
    const html = render();
    expect(html).not.toContain('data-dr-place=');
    expect(html).not.toMatch(/OF \d+ SLOTS/i);
    expect(html).not.toMatch(/\d+ of \d+ slots/i);
    expect(html).not.toContain('nothing yet');
    expect(html).not.toContain('Wearing 0');
  });
  it('exactly one start in the markup: the startHtml, once, in the dock', () => {
    for (const ui of [{ wardrobe: false }, { wardrobe: true }]) {
      const html = render({ ui });
      expect(count(html, /id="start"/g)).toBe(1);
      expect(count(html, /<button id="start">GO<\/button>/g)).toBe(1);
    }
  });
  it('a place card in the places sheet says whether it can be unlocked now, and looks not-yet when it cannot', () => {
    const price = CATALOG.areas.park.price;
    const s = { ...defaultishState(), edition: 'legacy' }; s.walks.neighborhood = 2;
    const sheet = (st) => renderPlacesSheetHtml(buildDressingModel(st, CATALOG));
    const card = (html) => html.match(/<button class="dr-place[^"]*" data-dr-place="park">[\s\S]*?<\/button>/)[0];
    const poor = card(sheet(s));
    expect(poor).toContain(`${price} 🐾 — keep walking!`);
    expect(poor).toMatch(/class="dr-place [^"]*\bcant\b/);
    s.points = price;
    const rich = card(sheet(s));
    expect(rich).toContain(`Tap to unlock — ${price} 🐾`);
    expect(rich).not.toMatch(/\bcant\b/);
    const gated = card(sheet({ ...defaultishState(), edition: 'legacy' }));
    expect(gated).toContain('opens after 2 walks');
    expect(gated).not.toMatch(/\bcant\b/);
  });
  it('the cats-more and Dress up controls are toggle buttons, not a tablist', () => {
    const home = render({ ui: { wardrobe: false, moreCats: false } });
    expect(home).not.toContain('role="tablist"');
    // Dress up swaps the panel for the wardrobe (it is replaced, not expanded): no aria-expanded
    expect(home).toMatch(/<button class="dr-dressup" data-dr-wardrobe>/);
    expect(home).toMatch(/<button[^>]*data-dr-more-cats aria-expanded="false"/);
    expect(render({ ui: { moreCats: true } })).toMatch(/<button[^>]*data-dr-more-cats aria-expanded="true"/);
  });
  it('shows the hero unlock button only for a buyable locked cat', () => {
    const s = defaultishState(); s.points = 60;
    expect(render({}, s, { previewCat: 'hagrid' })).toContain('data-dr-buy-cat="hagrid"');
    expect(render()).not.toContain('data-dr-buy-cat');
  });
  it('puts the picker under the open slot only', () => {
    const html = render({ ui: { wardrobe: true, openSlot: 'head', pickerHtml: '<p>PICK</p>' } });
    expect(count(html, /<p>PICK<\/p>/g)).toBe(1);
    expect(html).toContain('data-view="wardrobe"');
    // no slot open, or a slot that is not there: no picker
    expect(render({ ui: { wardrobe: true, openSlot: null, pickerHtml: '<p>PICK</p>' } })).not.toContain('PICK');
    expect(render({ ui: { wardrobe: true, openSlot: 'nope', pickerHtml: '<p>PICK</p>' } })).not.toContain('PICK');
    // and not on the home screen at all
    expect(render({ ui: { wardrobe: false, openSlot: 'head', pickerHtml: '<p>PICK</p>' } })).not.toContain('PICK');
  });
  it('home holds only the places door; every other sheet is opened from the Menu', () => {
    const html = render();
    expect(html).toContain('data-dr-sheet="places"');
    for (const id of HOME_SHEETS.filter((x) => x !== 'places')) expect(html).not.toContain(`data-dr-sheet="${id}"`);
    expect(count(html, /data-dr-sheet=/g)).toBe(1);
  });
  it('place pictures fall back to a gradient when the image fails', () => {
    expect(render()).toContain(`onerror="this.style.display='none'"`);
  });
  it('thumbs are optional and used when given', () => {
    expect(render()).not.toContain('<img src="data:');
    const html = render({ thumbs: { cats: { tabby: 'data:x' }, accessories: {} } });
    expect(html).toContain('<img src="data:x"');
  });
  it('escapes hostile catalog text', () => {
    const cat = { cats: { evil: { name: '<img src=x onerror=alert(1)>', price: 5 } }, accessories: { a: { name: '"><script>', slot: 'head', price: 1 } }, areas: { z: { name: '<b>z</b>', price: 0 } } };
    const state = { points: 9, unlocked: { cats: [], accessories: [], areas: [] }, equipped: { cat: 'evil' }, area: 'z', walks: {} };
    const html = renderDressingRoomHtml({
      model: buildDressingModel(state, cat), ui: { wardrobe: true, openSlot: 'head', pickerHtml: renderSlotPickerHtml(state, cat, 'head', null) },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>z</b>');
    expect(html).toContain('&lt;img src=x');
  });
  it('hostile save values never throw and render 0', () => {
    const bad = { points: NaN, walks: 'x', unlocked: 'no', equipped: 7, area: {}, skills: 5 };
    let html;
    expect(() => { html = render({}, bad); }).not.toThrow();
    expect(html).toContain('Nothing on yet');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
    expect(() => renderSlotPickerHtml(bad, CATALOG, 'head', { slot: 1, id: {} })).not.toThrow();
    expect(() => buildDressingModel(null, CATALOG)).not.toThrow();
  });
});

describe('sheets and pictures', () => {
  it('resolveSheet clamps unknown ids to null', () => {
    for (const id of HOME_SHEETS) expect(resolveSheet(id)).toBe(id);
    expect(resolveSheet('nope')).toBeNull();
    expect(resolveSheet(undefined)).toBeNull();
    expect(resolveSheet('__proto__')).toBeNull();
  });
  // Task 6: the den shop moved inside the den (ui/denshopview.js), so the
  // home screen has no den-shop sheet any more.
  it('the den shop is not a home sheet', () => {
    expect(resolveSheet('den-shop')).toBeNull();
    expect(HOME_SHEETS).not.toContain('den-shop');
    expect(SHEET_LABEL['den-shop']).toBeUndefined();
  });
  it('labels name the two doors, the Menu tiles and the grown-ups sheets, in that order', () => {
    expect(HOME_SHEETS.map((id) => SHEET_LABEL[id])).toEqual(['☰ Menu', '🗺️ Change place', '👫 Play together', '🐈 Colony', '📖 Journal', '📸 Album', '⭐ Skills', '👥 Friends', '🔊 Sound & controls', '⚙️ Game settings', '☁️ Cloud save', '🎁 Secret code']);
  });
  it('Play together is a sheet of its own', () => {
    expect(resolveSheet('together')).toBe('together');
  });
  it('place pictures use the base url', () => expect(PLACE_PICTURE('park')).toBe('/places/park.jpg'));
  it('blurbs cover every cat', () => {
    for (const id of Object.keys(CATALOG.cats)) expect(CAT_BLURBS[id]).toBeTruthy();
    expect(Object.keys(ACC_BLURBS).length).toBeGreaterThan(0);
  });
});

describe('dressing-room places by edition', () => {
  it('Legacy lists today\'s four places and never the Woods', () => {
    const m = buildDressingModel({ ...defaultishState(), edition: 'legacy' }, CATALOG);
    expect(m.places.map((p) => p.id)).toEqual(['neighborhood', 'park', 'seaside', 'docks']);
  });
  it('Legacy lists today\'s four places and never the River', () => {
    const s = { ...defaultishState(), edition: 'legacy' };
    s.walks.woods = 5;
    const m = buildDressingModel(s, CATALOG);
    expect(m.places.map((p) => p.id)).toEqual(['neighborhood', 'park', 'seaside', 'docks']);
    expect(m.places.map((p) => p.id)).not.toContain('river');
  });
  it('Legacy lists today\'s four places and never the Moor', () => {
    const s = { ...defaultishState(), edition: 'legacy' };
    s.walks.woods = 5;
    const m = buildDressingModel(s, CATALOG);
    expect(m.places.map((p) => p.id)).toEqual(['neighborhood', 'park', 'seaside', 'docks']);
    expect(m.places.map((p) => p.id)).not.toContain('moor');
  });
  it('dressingroom: Legacy lists today\'s four places and never the Pines', () => {
    const s = { ...defaultishState(), edition: 'legacy' };
    s.walks.river = 5;
    const m = buildDressingModel(s, CATALOG);
    expect(m.places.map((p) => p.id)).toEqual(['neighborhood', 'park', 'seaside', 'docks']);
    expect(m.places.map((p) => p.id)).not.toContain('pines');
  });
  it('Clan lists the Woods, locked behind two Twolegplace walks', () => {
    const s = { ...defaultishState(), edition: 'canon' };
    s.walks.neighborhood = 1;
    const woods = buildDressingModel(s, CATALOG).places.find((p) => p.id === 'woods');
    expect(woods).toMatchObject({ name: 'The Woods', locked: true, price: 0 });
    expect(woods.lockLine).toBe('opens after 2 walks in Twolegplace · 1/2 so far');
  });
});

describe('the territory map in the dressing room', () => {
  it('dressingroom: Clan shows the map and the Park, Seaside and Docks under More places', () => {
    const s = { ...defaultishState(), edition: 'canon' };
    const m = buildDressingModel(s, CATALOG);
    expect(m.territoryMap.regions.map((r) => r.id)).toEqual(['town', 'woods', 'moor', 'river', 'pines', 'gorge']);
    expect(m.otherPlaces.map((p) => p.id)).toEqual(['park', 'seaside', 'docks']);
    expect(m.otherPlaces.find((p) => p.id === 'park').lockLine).toBe('opens after 2 walks in Twolegplace · 0/2 so far');
    const where = renderPlacesSheetHtml(m);
    expect(where).toContain('class="territory-map"');
    expect(where.indexOf('class="territory-map"')).toBeLessThan(where.indexOf('More places'));
    expect(where).toContain('<p class="dr-label">More places</p>');
    expect(where).not.toContain('Other places');
    for (const id of ['park', 'seaside', 'docks']) expect(where).toMatch(new RegExp(`<button class="dr-place[^"]*" data-dr-place="${id}"`));
    expect(where).not.toMatch(/<button class="dr-place[^"]*" data-dr-place="(neighborhood|woods)"/);
    expect(where).not.toContain('Cozy Neighborhood');
    expect(where).toContain('Twolegplace');
    expect(renderDressingRoomHtml({ model: m })).toContain('Walking in <b>Twolegplace</b>');
  });
  it('Legacy keeps the picture cards and no map', () => {
    const m = buildDressingModel({ ...defaultishState(), edition: 'legacy' }, CATALOG);
    expect(m.territoryMap).toBeUndefined();
    expect(m.otherPlaces).toBeUndefined();
    const html = renderPlacesSheetHtml(m);
    expect(html).not.toContain('territory-map');
    expect(html).not.toContain('More places');
    expect(html).toMatch(/data-dr-place="neighborhood">[\s\S]*?Cozy Neighborhood/);
    expect(count(html, /data-dr-place=/g)).toBe(4);
  });
});

describe('the clan picker data in the dressing-room model', () => {
  it('Clan Edition has picker cards in the model (the clan line and the moment draw them, not the home screen)', () => {
    const m = buildDressingModel({ ...defaultishState(), edition: 'canon' }, CATALOG);
    expect(m.clanPicker.cards.length).toBeGreaterThan(0);
    expect(renderDressingRoomHtml({ model: m })).not.toContain('data-clan-pick');
    expect(renderPlacesSheetHtml(m)).not.toContain('data-clan-pick');
  });
  it('Legacy has no picker', () => {
    const s = { ...defaultishState(), edition: 'legacy', clanPick: { mine: 'woods', partner: null, partnerId: null } };
    const m = buildDressingModel(s, CATALOG);
    expect(m.clanPicker).toBeUndefined();
    expect(renderDressingRoomHtml({ model: m })).not.toContain('data-clan-pick');
  });
});

describe('the dressing room in each edition', () => {
  it('dressingroom: Legacy names the war paint without the clan word', () => {
    const s = defaultishState();
    s.unlocked.accessories.push('warpaint');
    s.edition = 'legacy';
    const legacy = renderSlotPickerHtml(s, CATALOG, 'face', null);
    expect(legacy).toContain('War Paint');
    expect(legacy).not.toContain(`${CLAN_SUFFIX} War Paint`);
    s.edition = 'canon';
    expect(renderSlotPickerHtml(s, CATALOG, 'face', null)).toContain(`${CLAN_SUFFIX} War Paint`);
  });

  it('the face slot label names the worn war paint by edition', () => {
    const s = defaultishState();
    s.unlocked.accessories.push('warpaint');
    s.equipped.face = 'warpaint';
    s.edition = 'legacy';
    expect(buildDressingModel(s, CATALOG).slots.find((x) => x.slot === 'face').itemName).toBe('War Paint');
    s.edition = 'canon';
    expect(buildDressingModel(s, CATALOG).slots.find((x) => x.slot === 'face').itemName).toBe(`${CLAN_SUFFIX} War Paint`);
  });

  it("Legacy's dock says Cozy Neighborhood when the chosen place is the Woods", () => {
    const s = defaultishState();
    s.unlocked.areas.push('woods');
    s.area = 'woods';
    expect(buildDressingModel(s, CATALOG).currentPlace).toMatchObject({ id: 'woods', name: 'The Woods' });
    s.edition = 'legacy';
    const m = buildDressingModel(s, CATALOG);
    expect(m.currentPlace).toMatchObject({ id: 'neighborhood', name: 'Cozy Neighborhood', clan: null, line: '' });
    const html = renderDressingRoomHtml({ model: m });
    expect(html).toContain('Walking in <b>Cozy Neighborhood</b>');
    expect(html).toContain('Today’s walk: Cozy Neighborhood. Change place');
    expect(html).not.toContain('The Woods');
    expect(s.area).toBe('woods');
  });

  it("Legacy marks the Neighborhood card as today's walk when the chosen place is the Woods", () => {
    const s = defaultishState();
    s.unlocked.areas.push('woods');
    s.area = 'woods';
    s.edition = 'legacy';
    const m = buildDressingModel(s, CATALOG);
    expect(m.places.filter((p) => p.selected).map((p) => p.id)).toEqual(['neighborhood']);
    expect(renderPlacesSheetHtml(m)).toContain('today’s walk');
    expect(s.area).toBe('woods');
  });

  it("Legacy with the Moor chosen marks the Cozy Neighborhood card \"today's walk\"", () => {
    const s = defaultishState();
    s.unlocked.areas.push('moor');
    s.area = 'moor';
    s.edition = 'legacy';
    const m = buildDressingModel(s, CATALOG);
    expect(m.places.filter((p) => p.selected).map((p) => p.id)).toEqual(['neighborhood']);
    expect(renderPlacesSheetHtml(m)).toContain('today’s walk');
    expect(s.area).toBe('moor');
  });

  it("Legacy with the Pines chosen marks the Cozy Neighborhood card \"today's walk\"", () => {
    const s = defaultishState();
    s.unlocked.areas.push('pines');
    s.area = 'pines';
    s.edition = 'legacy';
    const m = buildDressingModel(s, CATALOG);
    expect(m.places.filter((p) => p.selected).map((p) => p.id)).toEqual(['neighborhood']);
    expect(renderPlacesSheetHtml(m)).toContain('today’s walk');
    expect(s.area).toBe('pines');
  });

  it("Legacy with the River chosen marks the Cozy Neighborhood card \"today's walk\"", () => {
    const s = defaultishState();
    s.unlocked.areas.push('river');
    s.area = 'river';
    s.edition = 'legacy';
    const m = buildDressingModel(s, CATALOG);
    expect(m.places.filter((p) => p.selected).map((p) => p.id)).toEqual(['neighborhood']);
    expect(renderPlacesSheetHtml(m)).toContain('today’s walk');
    expect(s.area).toBe('river');
  });
});

describe('camps in the places sheet', () => {
  it('Clan Edition with a woods pick shows tm-camp mine', () => {
    const s = { ...defaultishState(), edition: 'canon', clanPick: { mine: 'woods', partner: null, partnerId: null } };
    expect(renderPlacesSheetHtml(buildDressingModel(s, CATALOG))).toContain('tm-camp mine');
  });
  it('Legacy shows no camps', () => {
    const s = { ...defaultishState(), edition: 'legacy' };
    expect(renderPlacesSheetHtml(buildDressingModel(s, CATALOG))).not.toContain('tm-camp');
    expect(renderDressingRoomHtml({ model: buildDressingModel(s, CATALOG) })).not.toContain('tm-camp');
  });
});

describe('her own cats in the dressing room', () => {
  const LOOK = { coat: 'cream', marks: 'grey', pattern: 'patches', fur: 'fluffy', eyes: 'blue', size: 1 };
  const BASE_STATE = defaultishState();
  const withMine = (n, custom = null) => ({ ...BASE_STATE, customCats: ['mine1', 'mine2', 'mine3'].slice(0, n).map((id, i) => ({ id, name: ['Ember', 'Ash', 'Fern'][i], personality: 'fearless', look: LOOK })), equipped: { ...BASE_STATE.equipped, custom } });

  it('her cats follow the ready-made portraits, then the ＋ tile', () => {
    const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(1), CATALOG) });
    expect(h.indexOf('data-dr-cat="hagrid"')).toBeLessThan(h.indexOf('data-dr-mine="mine1"'));
    expect(h.indexOf('data-dr-mine="mine1"')).toBeLessThan(h.indexOf('data-dr-make'));
    expect(h).toContain('aria-label="Make a cat">＋ Make');
  });
  it('at three cats the tile is greyed with the agreed words and nothing deletes', () => {
    const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(3), CATALOG) });
    expect(h).toContain('3 of 3 — change one of yours for a new look');
    expect(h).not.toMatch(/<button[^>]*data-dr-make/);
    expect(h).not.toMatch(/delete|remove|let this cat go/i);
  });
  it('walking a custom cat: her tile is selected, no preset is, the hero is hers with Change my cat', () => {
    const m = buildDressingModel(withMine(2, 'mine2'), CATALOG);
    expect(m.cats.some((c) => c.selected)).toBe(false);
    expect(m.mine.find((c) => c.id === 'mine2').selected).toBe(true);
    expect(m.hero).toMatchObject({ custom: true, name: 'Ash', breed: 'black', blurb: 'Brave — nothing spooks this cat', look: LOOK });
    expect(renderDressingRoomHtml({ model: m })).toContain('data-dr-edit="mine2"');
  });
  it('builder mode replaces the strip, panels and dock but keeps the one stage', () => {
    const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(0), CATALOG), startHtml: '<button id="btn-start">', ui: { builderHtml: '<section class="cb">B</section>' } });
    expect(h).toContain('id="dr-stage"');
    expect(h).toContain('<section class="cb">B</section>');
    expect(h).not.toContain('dr-strip');
    expect(h).not.toContain('btn-start');
  });
  it('builder mode shows the draft name and no buy or edit button', () => {
    const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(1, 'mine1'), CATALOG), ui: { builderHtml: '<section class="cb"></section>', heroName: 'Ember', heroBlurb: 'x' } });
    expect(h).toContain('Ember');
    expect(h).not.toContain('data-dr-edit');
    expect(h).not.toContain('data-dr-buy-cat');
  });
  it('builder mode puts the 🐾 Sit toggle in the hero text, beside the name; the room has none', () => {
    const mk = (ui) => renderDressingRoomHtml({ model: buildDressingModel(withMine(0), CATALOG), ui });
    const stand = mk({ builderHtml: '<i></i>', heroName: 'Ember', pose: 'stand' });
    const text = stand.slice(stand.indexOf('dr-hero-text'), stand.indexOf('</section>'));
    expect(text).toContain(`<button class="dr-pose" data-dr-pose="sit">${PAW} Sit</button>`);
    expect(text).toContain('<div class="dr-hero-row"><div class="dr-hero-name">Ember</div><button class="dr-pose"');
    expect(mk({ builderHtml: '<i></i>', pose: 'sit' })).toContain(`data-dr-pose="stand">${PAW} Stand</button>`);
    expect(mk({ builderHtml: '<i></i>' })).not.toContain('data-dr-pose');
    expect(mk({ pose: 'stand' })).not.toContain('data-dr-pose');
    expect(poseToggleHtml('nap')).toBe('');
  });
  it('the hero name and builder hero name are escaped', () => {
    const h = renderDressingRoomHtml({ model: buildDressingModel(withMine(0), CATALOG), ui: { builderHtml: '<i></i>', heroName: '<img src=x>' } });
    expect(h).not.toContain('<img src=x>');
  });
  it('the same in both editions apart from the places', () => {
    const strip = (h) => h.slice(h.indexOf('dr-strip'), h.indexOf('class="dr-wearing"'));
    const a = renderDressingRoomHtml({ model: buildDressingModel({ ...withMine(1), edition: 'legacy' }, CATALOG) });
    const b = renderDressingRoomHtml({ model: buildDressingModel({ ...withMine(1), edition: 'canon' }, CATALOG) });
    expect(strip(a)).toBe(strip(b));
  });
});

describe('Launch A: the home screen (cat, place, go)', () => {
  const home = (state = defaultishState(), ui = {}, over = {}) => renderDressingRoomHtml({
    model: buildDressingModel(state, CATALOG), startHtml: '<button id="start">GO</button>', ui, ...over,
  });
  const section = (html, cls) => html.slice(html.indexOf(`class="${cls}"`), html.indexOf('</section>', html.indexOf(`class="${cls}"`)));
  const lockedN = Object.keys(CATALOG.cats).length - defaultishState().unlocked.cats.length;

  describe('the strip', () => {
    it('shows the owned cats, then ＋ Make, then a "🔒 N more" tile; the locked cats stay out of sight', () => {
      const h = home();
      const strip = section(h, 'dr-strip');
      for (const id of defaultishState().unlocked.cats) expect(strip).toContain(`data-dr-cat="${id}"`);
      expect(strip).not.toContain('data-dr-cat="hagrid"');
      expect(strip).toContain('data-dr-make');
      expect(strip).toContain(`🔒</span> ${lockedN} more`);
      expect(strip.indexOf('data-dr-cat="persian"')).toBeLessThan(strip.indexOf('data-dr-make'));
      expect(strip.indexOf('data-dr-make')).toBeLessThan(strip.indexOf('data-dr-more-cats'));
    });
    it('moreCats opens the locked cats (after Make) and the tile says Fewer', () => {
      const strip = section(home(defaultishState(), { moreCats: true }), 'dr-strip');
      expect(count(strip, /data-dr-cat=/g)).toBe(Object.keys(CATALOG.cats).length);
      expect(strip.indexOf('data-dr-make')).toBeLessThan(strip.indexOf('data-dr-cat="hagrid"'));
      expect(strip).toMatch(/data-dr-more-cats aria-expanded="true">Fewer</);
      expect(strip).not.toContain('more<');
    });
    it('a locked cat she is previewing stays in view with the tile closed', () => {
      const state = defaultishState();
      const h = renderDressingRoomHtml({ model: buildDressingModel(state, CATALOG, { previewCat: 'hagrid' }), ui: {} });
      const strip = section(h, 'dr-strip');
      expect(strip).toContain('data-dr-cat="hagrid"');
      expect(count(strip, /data-dr-cat=/g)).toBe(defaultishState().unlocked.cats.length + 1);
      expect(strip).toContain(`${lockedN} more`);
    });
    it('no locked cats, no "more" tile', () => {
      const s = defaultishState(); s.unlocked.cats = Object.keys(CATALOG.cats);
      const m = buildDressingModel(s, CATALOG);
      expect(m.lockedCount).toBe(0);
      expect(renderDressingRoomHtml({ model: m, ui: {} })).not.toContain('data-dr-more-cats');
    });
    it('the model counts the locked cats', () => {
      expect(buildDressingModel(defaultishState(), CATALOG).lockedCount).toBe(lockedN);
    });
  });

  describe('Wearing', () => {
    it('lists what she has on, in slot order, with one Dress up door', () => {
      const s = defaultishState(); s.equipped.collar = 'bell'; s.equipped.neck = 'bandana';
      const m = buildDressingModel(s, CATALOG);
      expect(m.worn.map((w) => w.id)).toEqual(['bell', 'bandana']);
      const w = section(home(s), 'dr-wearing');
      expect(w).toContain('Bell Collar');
      expect(w).toContain('Bandana');
      expect(w.indexOf('Bell Collar')).toBeLessThan(w.indexOf('Bandana'));
      expect(count(w, /data-dr-wardrobe(?![-\w])/g)).toBe(1);
      expect(w).toContain('Dress up');
      expect(w).toContain('2 things on');
      expect(w).not.toContain('data-dr-slot=');
    });
    it('says Nothing on yet and "try something on" when bare, and "1 thing on" for one item', () => {
      const w = section(home(), 'dr-wearing');
      expect(w).toContain('Nothing on yet');
      expect(w).toContain('try something on');
      const s = defaultishState(); s.equipped.collar = 'bell';
      expect(section(home(s), 'dr-wearing')).toContain('1 thing on');
    });
    it('a worn prize shows too', () => {
      const s = defaultishState(); const slot = CATALOG.accessories.leafcrown.slot;
      s.unlocked.accessories.push('leafcrown'); s.equipped[slot] = 'leafcrown';
      expect(buildDressingModel(s, CATALOG).worn.map((x) => x.id)).toContain('leafcrown');
    });
  });

  describe('the wardrobe', () => {
    it('shows the slots and Done, and hides Today\'s walk and the Dress up door', () => {
      const h = home(defaultishState(), { wardrobe: true });
      expect(h).toContain('data-view="wardrobe"');
      expect(h).toContain('dr-view-wardrobe');
      expect(count(h, /data-dr-slot=/g)).toBe(new Set(Object.values(CATALOG.accessories).map((a) => a.slot)).size);
      expect(count(h, /data-dr-wardrobe-done/g)).toBe(1);
      expect(h).toContain('Done ✓');
      expect(h).not.toContain('class="dr-today"');
      expect(h).not.toContain('Today’s walk');
      expect(h).not.toMatch(/data-dr-wardrobe(?![-\w])/);
      // the dock (the place line and Start) is still there
      expect(h).toContain('Walking in <b>');
      expect(h).toContain('id="start"');
    });
    it('an empty slot says "＋ add", never "nothing yet", and no count label appears', () => {
      const h = home(defaultishState(), { wardrobe: true });
      expect(h).toContain('＋ add');
      expect(h).not.toContain('nothing yet');
      expect(h).not.toMatch(/of \d+ slots/i);
      expect(h).not.toMatch(/\b\d+ of \d+\b(?! —)/);
    });
    it('slot buttons say whether their picker is open', () => {
      const h = home(defaultishState(), { wardrobe: true, openSlot: 'collar', pickerHtml: '<p>PICK</p>' });
      expect(h).toMatch(/data-dr-slot="collar" aria-expanded="true"/);
      expect(h).toMatch(/data-dr-slot="head" aria-expanded="false"/);
    });
  });

  describe("Today's walk", () => {
    it('is one picture card that opens the places sheet and names the effective place', () => {
      const h = home({ ...defaultishState(), edition: 'legacy' });
      const t = section(h, 'dr-today');
      expect(t).toContain('data-dr-sheet="places"');
      expect(t).toContain('Today’s walk');
      expect(t).toContain('Cozy Neighborhood');
      expect(t).toContain(PLACE_PICTURE('neighborhood'));
      expect(t).toContain('Change place');
    });
    it('Clan Edition in the Woods names the place and the clan land', () => {
      const s = { ...defaultishState(), edition: 'canon', area: 'woods' };
      s.unlocked.areas.push('woods');
      const m = buildDressingModel(s, CATALOG);
      expect(m.currentPlace).toMatchObject({ id: 'woods', clan: 'woods', line: `${clanName('woods')} land` });
      const t = section(renderDressingRoomHtml({ model: m, ui: {} }), 'dr-today');
      expect(t).toContain('The Woods');
      expect(t).toContain(`${clanName('woods')} land`);
    });
    it('Legacy has no clan line, even with a Clan-only place chosen', () => {
      const s = { ...defaultishState(), edition: 'legacy', area: 'woods' };
      s.unlocked.areas.push('woods');
      const m = buildDressingModel(s, CATALOG);
      expect(m.currentPlace.line).toBe('');
      expect(m.currentPlace.clan).toBeNull();
      const t = section(renderDressingRoomHtml({ model: m, ui: {} }), 'dr-today');
      expect(t).toContain('Cozy Neighborhood');
      expect(t).not.toMatch(/ land</);
      expect(t).not.toContain(clanName('woods'));
    });
    it('Clan Edition on a non-clan place (Twolegplace) has no clan line', () => {
      const m = buildDressingModel({ ...defaultishState(), edition: 'canon' }, CATALOG);
      expect(m.currentPlace.line).toBe('');
    });
  });

  describe('no leftovers of the old home', () => {
    it('no pills, no abilities or extras panel, no count labels, no stats region, no map', () => {
      for (const ui of [{}, { wardrobe: true }, { moreCats: true }]) {
        const h = home(defaultishState(), ui);
        expect(h).not.toContain('data-dr-pill');
        expect(h).not.toContain('dr-pills');
        expect(h).not.toContain('dr-abilities');
        expect(h).not.toContain('dr-more"');
        expect(h).not.toContain('territory-map');
        expect(h).not.toContain('data-clan-pick');
        expect(h).not.toMatch(/OF \d+ SLOTS/i);
        expect(h).not.toMatch(/\d+ of \d+ (slots|earned)/i);
      }
    });
    it('the unlock button uses the paw span, not a bare emoji', () => {
      const s = defaultishState(); s.points = 60;
      const h = renderDressingRoomHtml({ model: buildDressingModel(s, CATALOG, { previewCat: 'hagrid' }), ui: {} });
      expect(h).toContain(`Unlock — 60 ${PAW}`);
      expect(h).not.toMatch(/Unlock — \d+ 🐾/);
    });
  });

  describe('the places sheet body', () => {
    it('includes denHtml and clanLineHtml verbatim, once each, clan line first', () => {
      for (const edition of ['canon', 'legacy']) {
        const m = buildDressingModel({ ...defaultishState(), edition }, CATALOG);
        const html = renderPlacesSheetHtml(m, { clanLineHtml: '<p id="CLANLINE">x</p>', denHtml: '<button id="DEN">den</button>' });
        expect(count(html, /<p id="CLANLINE">x<\/p>/g)).toBe(1);
        expect(count(html, /<button id="DEN">den<\/button>/g)).toBe(1);
        expect(html.startsWith('<div class="dr-where">')).toBe(true);
        expect(html.indexOf('CLANLINE')).toBeLessThan(html.indexOf('DEN'));
      }
    });
    it('defaults to no clan line and no den', () => {
      const html = renderPlacesSheetHtml(buildDressingModel(defaultishState(), CATALOG));
      expect(html).not.toContain('undefined');
      expect(html).toContain('class="dr-places"');
    });
    it('Clan puts the den inside More places, after the other place cards', () => {
      const m = buildDressingModel({ ...defaultishState(), edition: 'canon' }, CATALOG);
      const html = renderPlacesSheetHtml(m, { denHtml: '<button id="DEN"></button>' });
      expect(html.indexOf('More places')).toBeLessThan(html.indexOf('data-dr-place="park"'));
      expect(html.indexOf('data-dr-place="docks"')).toBeLessThan(html.indexOf('id="DEN"'));
    });
  });

  describe('the sheets', () => {
    it('the Menu holds the kid tiles then three grown-up sheets; the doors are menu and places', () => {
      expect(MENU_TILES).toEqual(['together', 'colony', 'journal', 'album', 'skills', 'social', 'controls']);
      expect(GROWNUP_SHEETS).toEqual(['settings', 'sync', 'code']);
      expect(HOME_SHEETS).toEqual(['menu', 'places', ...MENU_TILES, ...GROWNUP_SHEETS]);
    });
    it('Friends and Cloud save are the names for social and sync', () => {
      expect(SHEET_LABEL.social).toBe('👥 Friends');
      expect(SHEET_LABEL.sync).toBe('☁️ Cloud save');
    });
  });
});
