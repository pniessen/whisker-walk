// "Click" on desktop, "Tap" on touch (owner follow-up, 2026-11-20): the older
// lines on the home screen, Change place (the world map's labels, its pop-up
// card, Legacy's picture cards), the pick card and the "next thing" line said
// "Tap" on every device. A touch screen keeps "Tap"; a desktop says "Click".
// The touch flag is the home screen's getIsTouch (the map hint's own); a
// caller that says nothing gets the desktop words, as line() does.
import { describe, it, expect } from 'vitest';
import { CATALOG, createProgression } from '../src/progression.js';
import { line } from '../src/tutorialwords.js';
import { nextThing } from '../src/ui/nextthing.js';
import { placeState, territoryMapModel } from '../src/territories.js';
import { worldMapModel } from '../src/worldmap.js';
import { buildDressingModel, renderPlacesSheetHtml } from '../src/ui/dressingroom.js';
import { createDressingRoom } from '../src/ui/dressingroomview.js';
import { clanPickerModel, renderClanMomentHtml } from '../src/ui/clanpicker.js';
import { walkingNameIntro } from '../src/ui/walkingname.js';
import { withOffWords } from './helpers/offwords.js';
import { htmlText } from './helpers/serieswords.js';

// Run fn in the family's words, then in the everyday words.
const inBothSets = (fn) => { fn('on'); withOffWords(() => fn('off')); };

function base(extra = {}) {
  return {
    edition: 'canon',
    points: 0,
    walks: { neighborhood: 2, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood', 'park'] },
    equipped: { cat: 'tabby' },
    area: 'neighborhood',
    ...extra,
  };
}
// The Park is hers (not today's), the Woods is free and open.
const clan = base();
const legacy = base({ edition: 'legacy' });

const KEY = 'whisker-walk-save';
const mem = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
const save = (fields = {}) => createProgression(mem({ [KEY]: JSON.stringify({ version: 4, ...fields }) })).state;

describe('the "next thing" lines', () => {
  const LINES = {
    'home.present': ['Tap the present! 🎁', 'Click the present! 🎁'],
    'home.first': ['A friend is waiting outside. Tap Explore!', 'A friend is waiting outside. Click Explore!'],
    'home.part': ['Biscuit has more to show you. Tap Explore!', 'Biscuit has more to show you. Click Explore!'],
    'home.part-friend': ['Your friend has more to show you. Tap Explore!', 'Your friend has more to show you. Click Explore!'],
    'home.wear': ['You have enough for the Cozy Beanie. Tap Dress up!', 'You have enough for the Cozy Beanie. Click Dress up!'],
  };
  const slots = { name: 'Biscuit', thing: 'Cozy Beanie' };

  it('touch says Tap, desktop says Click, in both word sets', () => {
    inBothSets((set) => {
      for (const [id, [touch, keys]] of Object.entries(LINES)) {
        expect(line(id, { ...slots, touch: true }), `${set} ${id}`).toBe(touch);
        expect(line(id, { ...slots, touch: false }), `${set} ${id}`).toBe(keys);
        expect(line(id, slots), `${set} ${id} (no touch given)`).toBe(keys);
      }
    });
  });

  it('nextThing passes touch through to its line', () => {
    expect(nextThing(save(), { present: true, touch: true }).text).toBe('Tap the present! 🎁');
    expect(nextThing(save(), { present: true }).text).toBe('Click the present! 🎁');
    expect(nextThing(save(), { touch: true }).text).toBe('A friend is waiting outside. Tap Explore!');
    expect(nextThing(save(), { touch: false }).text).toBe('A friend is waiting outside. Click Explore!');
  });
});

describe('Change place: the world map and its pop-up card', () => {
  it('placeState: an owned place and a free open one, touch and desktop', () => {
    expect(placeState(clan, CATALOG, 'park', { touch: true }).line).toBe('tap to go here');
    expect(placeState(clan, CATALOG, 'park', { touch: false }).line).toBe('click to go here');
    expect(placeState(clan, CATALOG, 'park').line).toBe('click to go here');
    expect(placeState(clan, CATALOG, 'woods', { touch: true }).line).toBe('Tap to explore');
    expect(placeState(clan, CATALOG, 'woods').line).toBe('Click to explore');
    // the map's short label is the same line for these
    expect(placeState(clan, CATALOG, 'park', { touch: true }).mapLine).toBe('tap to go here');
    expect(placeState(clan, CATALOG, 'park').mapLine).toBe('click to go here');
  });

  it('the board and the world map pass touch through', () => {
    const woods = (m) => m.regions.find((r) => r.areaId === 'woods');
    const park = (m) => m.regions.find((r) => r.areaId === 'park');
    expect(woods(territoryMapModel(clan, CATALOG, { touch: true })).line).toBe('Tap to explore');
    expect(woods(territoryMapModel(clan, CATALOG)).line).toBe('Click to explore');
    expect(park(worldMapModel(clan, CATALOG, { touch: true })).line).toBe('tap to go here');
    expect(park(worldMapModel(clan, CATALOG)).line).toBe('click to go here');
  });

  it('the map label and the pop-up card of an open place: "click to go here" on desktop, "tap to go here" on touch', () => {
    inBothSets((set) => {
      for (const [touch, words] of [[true, 'tap to go here'], [false, 'click to go here']]) {
        const m = buildDressingModel(clan, CATALOG, { mapCard: 'park', touch });
        expect(m.placeCard.line, set).toBe(words);
        const html = renderPlacesSheetHtml(m);
        expect(html, set).toContain(`<p class="wm-card-line">${words}</p>`);
        expect(htmlText(html), set).toContain(words); // the map's own label
        expect(html, set).not.toContain(touch ? 'click to go here' : 'tap to go here');
      }
    });
  });

  it('Legacy\'s picture cards say the same', () => {
    const tap = renderPlacesSheetHtml(buildDressingModel(legacy, CATALOG, { touch: true }));
    const click = renderPlacesSheetHtml(buildDressingModel(legacy, CATALOG));
    expect(tap).toContain('<small>tap to go here</small>');
    expect(tap).not.toContain('click to go here');
    expect(click).toContain('<small>click to go here</small>');
    expect(click).not.toContain('tap to go here');
  });

  it('the dressing room reads touch from its getIsTouch when it draws', () => {
    let touch = true;
    const room = createDressingRoom({ progression: { state: clan }, getIsTouch: () => touch });
    expect(room.placesHtml()).toContain('tap to go here');
    touch = false;
    expect(room.placesHtml()).toContain('click to go here');
    expect(createDressingRoom({ progression: { state: clan } }).placesHtml()).toContain('click to go here');
  });
});

describe('the pick card', () => {
  it('changing her group: touch says Tap, desktop says Click, in both word sets', () => {
    const change = clanPickerModel({ clanPick: { mine: 'woods' } });
    const ask = (opts) => htmlText(renderClanMomentHtml(change, 'Robin', opts))[2];
    expect(ask({ touch: true })).toBe('Tap a clan to join it.');
    expect(ask({ touch: false })).toBe('Click a clan to join it.');
    expect(ask()).toBe('Click a clan to join it.');
    withOffWords(() => {
      expect(ask({ touch: true })).toBe('Tap a crew to make it your home.');
      expect(ask()).toBe('Click a crew to make it your home.');
    });
  });
});

describe('the friend-name box (Play together)', () => {
  it('touch says tap Save, desktop says click Save', () => {
    expect(walkingNameIntro('walk', { touch: true })).toBe('You need a friend name before you can play together. Type one here and tap Save:');
    expect(walkingNameIntro('walk')).toBe('You need a friend name before you can play together. Type one here and click Save:');
    expect(walkingNameIntro('colony', { touch: true })).toBe('You need a friend name before you can share your colony. Type one here and tap Save:');
    expect(walkingNameIntro('colony')).toBe('You need a friend name before you can share your colony. Type one here and click Save:');
    expect(walkingNameIntro(false, { touch: true })).toBe('First, pick your friend name:');
    withOffWords(() => {
      expect(walkingNameIntro('colony', { touch: true })).toBe('You need a friend name before you can share your cats. Type one here and tap Save:');
      expect(walkingNameIntro('colony')).toBe('You need a friend name before you can share your cats. Type one here and click Save:');
      expect(walkingNameIntro('walk', { touch: true })).toBe('You need a friend name before you can play together. Type one here and tap Save:');
    });
  });
});
