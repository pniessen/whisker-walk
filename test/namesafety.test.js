import { describe, it, expect } from 'vitest';
import { validPetName, goodNewPetName, safeRemoteName } from '../src/net.js';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, KITTYPET_NAMES } from '../src/straynames.js';
import { PREFIXES, CAT_PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, CLAN_SUFFIX, RIVAL_PREFIXES } from '../src/clanwords.js';
import { candidateStarNames, clanNameOf } from '../src/clannames.js';

// The wider name list (goodNewPetName) is substring-matched, so it must not
// catch any name the game itself uses or offers, nor ordinary cat names that
// hide one of its words (the Scunthorpe problem).

function builtInNames() {
  const names = new Set([...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES, ...KITTYPET_NAMES]);
  const prefixes = new Set([...PREFIXES, ...Object.values(CAT_PREFIXES), ...Object.values(RIVAL_PREFIXES).flat()]);
  for (const p of prefixes) {
    if (typeof p !== 'string') continue;
    names.add(p);
    names.add(p + CLAN_SUFFIX);
    for (const s of Object.values(RANK_SUFFIX)) names.add(p + s);
    for (const s of WARRIOR_SUFFIXES) names.add(p + s);
  }
  for (const n of [...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES]) {
    for (const have of [0, 2, 6]) names.add(clanNameOf(n, { have }));
  }
  for (let i = 0; i < 200; i++) for (const n of candidateStarNames(`seed-${i}`)) names.add(n);
  return [...names].filter((n) => typeof n === 'string');
}

describe('goodNewPetName: no built-in name is caught', () => {
  it('every built-in name that is a valid pet name is still a good new one', () => {
    const names = builtInNames();
    expect(names.length).toBeGreaterThan(200);
    const caught = names.filter((n) => validPetName(n) && !goodNewPetName(n));
    expect(caught).toEqual([]);
  });
  it('every star name the picker offers can be picked', () => {
    for (let i = 0; i < 200; i++) {
      for (const n of candidateStarNames(`seed-${i}`)) expect(goodNewPetName(n)).toBe(true);
    }
  });
  it('ordinary names that hide one of the words are fine', () => {
    for (const n of ['Thorny', 'Booboo', 'Swanky', 'Grape', 'Torpedo', 'Peacock', 'Dickens', 'Essex', 'Popcorn',
      'Mittens', 'Whiskers', 'Shadow', 'Pickles', 'Hippo', 'Kiki', 'Kitty', 'Therapist', 'Mossstar']) {
      expect(goodNewPetName(n)).toBe(true);
    }
  });
});

describe('goodNewPetName: what it adds', () => {
  it('turns down the new words, a contact handle spelled out, and everything validPetName does', () => {
    for (const n of ['Penis', 'Porn Star', 'Hitler Cat', 'Big Kkk', 'Snapchat Me', 'Www Cat', 'Http Cat', 'Discord Kitty',
      'Fuck', '<b>x</b>', 'x', '555-123-4567']) {
      expect(goodNewPetName(n)).toBe(false);
    }
  });
  it('a cat ALREADY named with a new word is not locked out (validPetName, which gates Host and Join, is unchanged)', () => {
    expect(validPetName('Pisstopher')).toBe(true);
    expect(goodNewPetName('Pisstopher')).toBe(false);
    // her friends see the fallback instead of the name
    expect(safeRemoteName('Pisstopher')).toBe('Mystery Cat');
  });
});
