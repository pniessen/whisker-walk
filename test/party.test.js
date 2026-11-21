// The birthday party on the home screen (src/ui/party.js): the banner's words
// in both word sets, whose name it says, and when the party is on.
import { describe, it, expect } from 'vitest';
import { partyBannerText, partyCatName, birthdayPartyOn, balloonsHtml } from '../src/ui/party.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { BIRTHDAY_EVENT } from '../src/giftevents.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('the birthday banner', () => {
  it('says happy birthday to her cat, the same in both word sets', () => {
    expect(partyBannerText('Tabby')).toBe('Happy birthday, Tabby! 🎂');
    expect(withOffWords(() => partyBannerText('Tabby'))).toBe('Happy birthday, Tabby! 🎂');
    expect(bannedIn(withOffWords(() => partyBannerText('Tabby')))).toBe(null);
    expect(withOffWords(() => phrase('party.time'))).toBe('Party time! 🎉');
  });
  it('names the cat she plays as, never her friend name', () => {
    const state = { petName: 'Her Own Name', equipped: { cat: 'siamese', custom: null }, customCats: [] };
    expect(partyCatName(state, CATALOG)).toBe('Siamese');
    expect(partyCatName({ ...state, equipped: { cat: 'tabby', custom: 'c1' }, customCats: [{ id: 'c1', name: 'Moonpaw' }] }, CATALOG)).toBe('Moonpaw');
    expect(partyCatName({ equipped: { cat: 'nope' } }, CATALOG)).toBe('kitty');
    expect(partyCatName(null, CATALOG)).toBe('kitty');
  });
  it('the balloons carry no words', () => {
    expect(balloonsHtml(1234).replace(/<[^>]*>/g, '')).toBe('');
  });
});

describe('when the party is on', () => {
  it('only with the birthday in the save, and only until the end of 2026-11-22', () => {
    const p = createProgression(mem());
    const day = new Date(2026, 10, 21, 15, 0);
    expect(birthdayPartyOn(p, day)).toBe(false);
    p.redeemCode('ab'.repeat(32), { events: [BIRTHDAY_EVENT] });
    expect(birthdayPartyOn(p, day)).toBe(true);
    expect(birthdayPartyOn(p, new Date(2026, 10, 22, 22, 30))).toBe(true);
    expect(birthdayPartyOn(p, new Date(2026, 10, 23, 0, 0))).toBe(false);
    expect(birthdayPartyOn(null, day)).toBe(false);
  });
});
