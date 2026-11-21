// Menu review #13: a small "the town" line under the Neighborhood's name for
// the first five visits (on the home place card and the map's pop-up card).
// The everyday words say it with an empty phrase, which draws nothing.
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { buildDressingModel, renderDressingRoomHtml, renderPlacesSheetHtml, TOWN_NOTE_VISITS } from '../src/ui/dressingroom.js';
import { withOffWords } from './helpers/offwords.js';

function save(extra = {}) {
  return {
    edition: 'canon',
    points: 0,
    visits: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood', 'park'] },
    equipped: { cat: 'tabby' },
    area: 'neighborhood',
    ...extra,
  };
}
const home = (s) => renderDressingRoomHtml({ model: buildDressingModel(s, CATALOG), ui: {} });
const card = (s, id = 'neighborhood') => renderPlacesSheetHtml(buildDressingModel(s, CATALOG, { mapCard: id }));
const NOTE = /<small class="dr-town-note">the town<\/small>/;

describe('the town note', () => {
  it('is five visits long', () => { expect(TOWN_NOTE_VISITS).toBe(5); });
  it('the phrase is "the town" in the clan words and empty in the everyday ones', () => {
    expect(phrase('place.townNote')).toBe('the town');
    withOffWords(() => { expect(phrase('place.townNote')).toBe(''); });
  });
  it('shows under the Neighborhood on the home place card at visits 0..5, not at 6', () => {
    for (const v of [0, 1, 3, 5]) expect(home(save({ visits: v }))).toMatch(NOTE);
    expect(home(save({ visits: 6 }))).not.toMatch(NOTE);
  });
  it('never under another place', () => {
    expect(home(save({ visits: 1, area: 'park' }))).not.toMatch(NOTE);
  });
  it('shows on the map pop-up card of the Neighborhood by the same rule', () => {
    for (const v of [0, 5]) expect(card(save({ visits: v }))).toMatch(NOTE);
    expect(card(save({ visits: 6 }))).not.toMatch(NOTE);
    expect(card(save({ visits: 1 }), 'park')).not.toMatch(NOTE);
  });
  it('the everyday words draw no element at all', () => {
    withOffWords(() => {
      expect(home(save({ visits: 1 }))).not.toContain('dr-town-note');
      expect(card(save({ visits: 1 }))).not.toContain('dr-town-note');
    });
  });
});
