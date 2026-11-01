import { describe, it, expect } from 'vitest';
import { clanPickerModel, renderClanPickerHtml } from '../src/ui/clanpicker.js';
import { TERRITORIES } from '../src/territories.js';
import { clanName, pickableClans } from '../src/clanhomes.js';
import { CLAN_SUFFIX } from '../src/clanwords.js';

const PARTNER = 'robin-player-02';
const word = CLAN_SUFFIX.toLowerCase();

const save = (over = {}) => ({
  edition: 'canon',
  clanPick: { mine: null, partner: null, partnerId: null },
  colony: { partner: { playerId: PARTNER, petName: 'Robin' } },
  ...over,
});
const cardOf = (m, id) => m.cards.find((c) => c.id === id);

describe('clanPickerModel', () => {
  it('an unpicked save gets four cards, none of them the gorge', () => {
    const m = clanPickerModel(save());
    expect(m.mine).toBeNull();
    expect(m.cards).toHaveLength(4);
    expect(m.cards.map((c) => c.id)).toEqual(pickableClans());
    expect(m.cards.map((c) => c.id)).not.toContain('gorge');
    expect(renderClanPickerHtml(m, 'Robin')).toContain(`Pick your ${word}`);
  });

  it('a pick marks exactly one card mine', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'moor', partner: null, partnerId: null } }));
    expect(m.cards.filter((c) => c.mine).map((c) => c.id)).toEqual(['moor']);
    expect(renderClanPickerHtml(m, 'Robin')).toContain(`Your ${word}: ${clanName('moor')}`);
  });

  it("the partner's current pick marks partner; a stale partnerId marks none", () => {
    const s = save({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } });
    expect(clanPickerModel(s).cards.filter((c) => c.partner).map((c) => c.id)).toEqual(['river']);
    s.colony.partner = { playerId: 'someone-else-03', petName: 'Sam' };
    expect(clanPickerModel(s).cards.some((c) => c.partner)).toBe(false);
  });

  it('the same pick for both gives both and the "You\'re both" line', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'woods', partner: 'woods', partnerId: PARTNER } }));
    expect(m.both).toBe(true);
    expect(renderClanPickerHtml(m, 'Robin')).toContain(`You're both ${clanName('woods')}!`);
    const other = clanPickerModel(save({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } }));
    expect(other.both).toBe(false);
    expect(renderClanPickerHtml(other, 'Robin')).not.toContain("You're both");
  });

  it('a hostile partner pet name is escaped', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'woods', partner: 'river', partnerId: PARTNER } }));
    const html = renderClanPickerHtml(m, '<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('every card is a data-clan-pick button with aria-pressed, place and line', () => {
    const m = clanPickerModel(save({ clanPick: { mine: 'river', partner: null, partnerId: null } }));
    const html = renderClanPickerHtml(m, 'Robin');
    for (const id of pickableClans()) expect(html).toMatch(new RegExp(`<button class="dr-home[^"]*" data-clan-pick="${id}" aria-pressed="(true|false)"`));
    expect(html).toContain('data-clan-pick="river" aria-pressed="true"');
    expect(html).toContain('✓ yours');
    expect(html).toContain('of The Woods');
  });

  it('the moor and pines are built now, so no card is soon', () => {
    const m = clanPickerModel(save());
    for (const id of ['moor', 'pines', 'woods', 'river']) expect(cardOf(m, id).soon).toBe(false);
    expect(renderClanPickerHtml(m, 'Robin')).not.toContain('territory coming soon');
  });

  it('a territory not built yet is soon, still pickable, and says so', () => {
    const later = TERRITORIES.map((t) => (t.id === 'moor' ? { ...t, status: 'later' } : t));
    const m = clanPickerModel(save(), later);
    expect(cardOf(m, 'moor').soon).toBe(true);
    for (const id of ['woods', 'river', 'pines']) expect(cardOf(m, id).soon).toBe(false);
    const html = renderClanPickerHtml(m, 'Robin');
    expect(html).toContain('territory coming soon');
    expect(html.match(/territory coming soon/g)).toHaveLength(1);
    expect(html).toContain('data-clan-pick="moor"');
  });
});
