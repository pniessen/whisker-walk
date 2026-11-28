import { describe, it, expect } from 'vitest';
import { parseSoakArgs, replayCommand, runName } from '../scripts/soak/args.mjs';
import { ALL_PLACES, PRESET_CATS, buildSeedSave, isKnownCat } from '../scripts/soak/save.mjs';
import { CATALOG, sanitizeSave } from '../src/progression.js';

describe('soak args', () => {
  it('parses every flag', () => {
    const o = parseSoakArgs(['--seed', '7', '--place', 'moon', '--cat', 'hagrid', '--tv', '1', '--throttle', '6', '--minutes', '2.5', '--couch', '1', '--hidden-tab', '1']);
    expect(o).toMatchObject({ seed: 7, place: 'moon', cat: 'hagrid', tv: 1, throttle: 6, minutes: 2.5, couch: 1, hiddenTab: 1 });
  });
  it('refuses junk', () => {
    expect(() => parseSoakArgs(['--place', 'atlantis'])).toThrow(/unknown place/);
    expect(() => parseSoakArgs(['--cat', 'dog'])).toThrow(/unknown cat/);
    expect(() => parseSoakArgs(['--tv', '2'])).toThrow();
    expect(() => parseSoakArgs(['--minutes', '0'])).toThrow();
    expect(() => parseSoakArgs(['--bogus'])).toThrow(/unexpected/);
    expect(() => parseSoakArgs(['--seed'])).toThrow(/needs a value/);
  });
  it('the replay command parses back to the same run', () => {
    const o = parseSoakArgs(['--seed', '99', '--place', 'reef', '--cat', 'custom', '--tv', '1', '--throttle', '4', '--couch', '1', '--hidden-tab', '1']);
    const argv = replayCommand(o).split(' ').slice(2);
    expect(parseSoakArgs(argv)).toEqual(o);
  });
  it('names a run by what it was', () => {
    expect(runName(parseSoakArgs(['--seed', '5']), 'S')).toBe('S-reef-tabby-s5-tv0-t1-c0');
  });
});

describe('soak seed save', () => {
  it('lists exactly the game places and preset cats', () => {
    expect([...ALL_PLACES].sort()).toEqual(Object.keys(CATALOG.areas).sort());
    expect([...PRESET_CATS].sort()).toEqual(Object.keys(CATALOG.cats).filter((c) => !CATALOG.cats[c].prize).sort());
  });
  it('loads through the game sanitiser with the chosen cat and place', () => {
    for (const cat of ['hagrid', 'custom']) {
      const s = sanitizeSave(JSON.parse(JSON.stringify(buildSeedSave({ place: 'moon', cat }))));
      expect(s.area).toBe('moon');
      expect(s.unlocked.areas).toContain('reef');
      if (cat === 'custom') expect(s.equipped.custom).toBe('mine1');
      else expect(s.equipped.cat).toBe('hagrid');
      expect(s.tutorial.first).toBe('done');
    }
    expect(isKnownCat('custom')).toBe(true);
  });
});
