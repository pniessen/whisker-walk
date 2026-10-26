import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { SKILLS } from '../src/skills.js';
import { CAT_BLURBS, ACC_BLURBS } from '../src/ui/catblurbs.js';
import {
  HOME_SHEETS, SHEET_LABEL, resolveSheet, PLACE_PICTURE,
  buildDressingModel, renderSlotPickerHtml, renderDressingRoomHtml,
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
    const m = buildDressingModel(defaultishState(), CATALOG);
    expect(m.places.find((p) => p.id === 'seaside').lockLine).toContain('opens after 2 walks in City Park');
    expect(m.places.find((p) => p.id === 'park').lockLine).toBe('opens after 2 walks in Cozy Neighborhood · 0/2 so far');
  });
  it('an unlocked-by-gate but unbought area shows its price', () => {
    const s = defaultishState(); s.walks.neighborhood = 2;
    const park = buildDressingModel(s, CATALOG).places.find((p) => p.id === 'park');
    expect(park.lockLine).toBe('50 🐾 to unlock');
    expect(park.canBuy).toBe(false);
    s.points = 50;
    expect(buildDressingModel(s, CATALOG).places.find((p) => p.id === 'park').canBuy).toBe(true);
  });
  it('abilities are counted from the live skill list', () => {
    expect(buildDressingModel(defaultishState(), CATALOG).abilities.total).toBe(SKILLS.length);
  });
});

describe('slot picker', () => {
  it('lists every accessory in the slot', () => {
    const want = Object.values(CATALOG.accessories).filter((a) => a.slot === 'head').length;
    const html = renderSlotPickerHtml(defaultishState(), CATALOG, 'head', null);
    expect(count(html, /data-dr-act="try"/g)).toBe(want);
  });
  it('labels owned, worn, affordable and unaffordable items', () => {
    const s = defaultishState(); s.equipped.collar = 'bell'; s.points = 25;
    const html = renderSlotPickerHtml(s, CATALOG, 'collar', null);
    expect(html).toContain('data-dr-acc="bell" data-dr-act="off"');
    expect(html).toContain('On ✓');
    expect(html).toContain('Take off');
    expect(html).toContain('data-dr-acc="heart" data-dr-act="buy"');
    expect(html).toContain('Unlock — 25 🐾');
    expect(html).toContain("30 🐾 (can't afford)");
    const owned = renderSlotPickerHtml(defaultishState(), CATALOG, 'neck', null);
    expect(owned).toContain('data-dr-acc="bandana" data-dr-act="wear"');
  });
});

describe('dressing-room renderer', () => {
  const render = (over = {}, state = defaultishState(), mopts) => renderDressingRoomHtml({
    model: buildDressingModel(state, CATALOG, mopts), headerHtml: '<h1>HDR</h1>', statsHtml: '<i>STATS</i>',
    startHtml: '<button id="start">GO</button>', extrasHtml: '<b>EXTRAS</b>', sheets: HOME_SHEETS,
    ui: { pill: 'wearing', openSlot: null, pickerHtml: '' }, ...over,
  });

  it('renders the regions once, in order, with caller HTML verbatim', () => {
    const html = render();
    const order = ['<header class="dr-header"', 'class="dr-hero"', 'class="dr-pills"', 'class="dr-wearing"', 'class="dr-abilities"',
      'class="dr-where"', 'class="dr-more"', 'class="dr-extras"', '<footer class="dr-dock"'].map((c) => html.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const t of ['<h1>HDR</h1>', '<i>STATS</i>', '<b>EXTRAS</b>', '<button id="start">GO</button>']) expect(count(html, new RegExp(t.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toBe(1);
    expect(html).toContain('id="dr-stage"');
    expect(html).toContain('data-pill="wearing"');
    expect(html).toContain('dr-pill-wearing');
    expect(html).toContain('drag to spin');
  });
  it('one portrait per cat, one slot per slot, one place per area, three pills', () => {
    const html = render();
    expect(count(html, /data-dr-cat=/g)).toBe(Object.keys(CATALOG.cats).length);
    expect(count(html, /data-dr-slot=/g)).toBe(new Set(Object.values(CATALOG.accessories).map((a) => a.slot)).size);
    expect(count(html, /data-dr-place=/g)).toBe(Object.keys(CATALOG.areas).length);
    expect(count(html, /data-dr-pill=/g)).toBe(3);
    expect(html).toContain(`aria-pressed="true"`);
  });
  it('shows the hero unlock button only for a buyable locked cat', () => {
    const s = defaultishState(); s.points = 60;
    expect(render({}, s, { previewCat: 'hagrid' })).toContain('data-dr-buy-cat="hagrid"');
    expect(render()).not.toContain('data-dr-buy-cat');
  });
  it('puts the picker under the open slot only', () => {
    const html = render({ ui: { pill: 'where', openSlot: 'head', pickerHtml: '<p>PICK</p>' } });
    expect(count(html, /<p>PICK<\/p>/g)).toBe(1);
    expect(html).toContain('data-pill="where"');
  });
  it('every sheet gets a button, including code', () => {
    const html = render();
    for (const id of HOME_SHEETS) expect(html).toContain(`data-dr-sheet="${id}"`);
    expect(html).toContain('🎁 Secret code');
  });
  it('place pictures fall back to a gradient when the image fails', () => {
    expect(render()).toContain('onerror="this.remove()"');
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
      model: buildDressingModel(state, cat), ui: { pill: 'wearing', openSlot: 'head', pickerHtml: renderSlotPickerHtml(state, cat, 'head', null) },
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
    expect(html).toContain('Wearing 0');
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
  it('labels match the signed-off mockup', () => {
    expect(HOME_SHEETS.map((id) => SHEET_LABEL[id])).toEqual(['🐾 Skills', '🐈 Colony', '👥 Social', '📖 Journal', '📸 Album', '☁️ Sync', '⚙️ Settings', '🎁 Secret code']);
  });
  it('place pictures use the base url', () => expect(PLACE_PICTURE('park')).toBe('/places/park.jpg'));
  it('blurbs cover every cat', () => {
    for (const id of Object.keys(CATALOG.cats)) expect(CAT_BLURBS[id]).toBeTruthy();
    expect(Object.keys(ACC_BLURBS).length).toBeGreaterThan(0);
  });
});
