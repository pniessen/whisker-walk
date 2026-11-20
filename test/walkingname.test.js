import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { offeredWalkingName, walkingNameIntro, WALKING_NAME, WALKING_NAME_HELP, PICK_WALKING_NAME, WALKING_NAME_RULE } from '../src/ui/walkingname.js';
import { FALLBACK_NAME } from '../src/customcats.js';
import { buildDressingModel } from '../src/ui/dressingroom.js';
import { CATALOG, createProgression } from '../src/progression.js';
import { withOffWords } from './helpers/offwords.js';

const mine = (name) => ({ id: 'mine1', name, personality: 'keenNose', look: {} });
const walking = (name, petName = null) => ({ petName, customCats: [mine(name)], equipped: { cat: 'tabby', custom: 'mine1' } });

describe('offeredWalkingName', () => {
  it("offers her own cat's name when she walks it and has no walking name", () => {
    expect(offeredWalkingName(walking('Mango'))).toBe('Mango');
  });
  it('offers nothing for a ready-made cat, even when she has made cats', () => {
    expect(offeredWalkingName({ petName: null, customCats: [mine('Mango')], equipped: { cat: 'tabby', custom: null } })).toBe(null);
    expect(offeredWalkingName({ petName: null, equipped: { cat: 'tabby' } })).toBe(null);
  });
  it('offers nothing once a walking name is saved', () => {
    expect(offeredWalkingName(walking('Mango', 'Mittens'))).toBe(null);
  });
  it('still offers when the saved walking name is not a usable one', () => {
    expect(offeredWalkingName(walking('Mango', 'x'))).toBe('Mango');
  });
  it('offers only a name the name box itself would take', () => {
    expect(offeredWalkingName(walking('Tiktok Tom'))).toBe(null); // the wider list for new online names
    expect(offeredWalkingName(walking('<b>'))).toBe(null);
    expect(offeredWalkingName(walking(FALLBACK_NAME))).toBe(null); // the stand-in for a broken name, not hers
  });
  it('never throws on junk', () => {
    for (const junk of [null, undefined, 3, 'x', {}, { equipped: 4 }, { customCats: 'no', equipped: { custom: 'mine1' } }]) {
      expect(offeredWalkingName(junk)).toBe(null);
    }
  });
});

describe('the words', () => {
  it('one name for the public name, said the same way each time: "friend name"', () => {
    expect(WALKING_NAME).toBe('Your friend name');
    expect(WALKING_NAME_HELP).toBe('Friends see this name when you play together.');
    expect(PICK_WALKING_NAME).toBe('Pick your friend name');
    expect(WALKING_NAME_RULE).toBe('A friend name is 2–16 letters, spaces, or hyphens.');
    expect(walkingNameIntro(false)).toBe('First, pick your friend name:');
    expect(walkingNameIntro('walk')).toBe('You need a friend name before you can play together. Type one here and click Save:');
    expect(walkingNameIntro('colony')).toBe('You need a friend name before you can share your colony. Type one here and click Save:');
  });
  it('from My cats, the everyday words say share your cats; the Clan Edition keeps its colony line', () => {
    expect(walkingNameIntro('colony', { touch: true })).toBe('You need a friend name before you can share your colony. Type one here and tap Save:');
    withOffWords(() => {
      expect(walkingNameIntro('colony')).toBe('You need a friend name before you can share your cats. Type one here and click Save:');
      expect(walkingNameIntro('colony', { touch: true })).toBe('You need a friend name before you can share your cats. Type one here and tap Save:');
      for (const t of [true, false]) expect(walkingNameIntro('colony', { touch: t })).not.toMatch(/colony/);
      expect(walkingNameIntro('walk')).toBe('You need a friend name before you can play together. Type one here and click Save:');
    });
  });
  it('no screen still asks her to "give your cat a name" for the online one', () => {
    const files = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory()) walk(new URL(`${f.name}/`, dir));
        else if (f.name.endsWith('.js')) files.push(new URL(f.name, dir));
      }
    };
    walk(new URL('../src/', import.meta.url));
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), String(file)).not.toMatch(/give your cat a name|cat needs a name/i);
    }
  });
});

// Home shows one name under the cat: her own cat's name for a cat she made,
// the ready-made cat's own name otherwise. The walking name is never a second line.
describe('the name on Home', () => {
  it("a cat she made shows its own name, whatever her walking name is", () => {
    const progression = createProgression({ getItem: () => null, setItem() {} });
    const id = progression.createCustomCat({ name: 'Mango', personality: 'keenNose', look: {} });
    progression.equipCustom(id);
    expect(buildDressingModel(progression.state, CATALOG).hero.name).toBe('Mango');
    progression.setPetName('Mittens');
    expect(buildDressingModel(progression.state, CATALOG).hero.name).toBe('Mango');
  });
  it("a ready-made cat keeps its own name (Robbie is Robbie), with or without a walking name", () => {
    const progression = createProgression({ getItem: () => null, setItem() {} });
    expect(buildDressingModel(progression.state, CATALOG).hero.name).toBe(CATALOG.cats.tabby.name);
    progression.setPetName('Mittens');
    expect(buildDressingModel(progression.state, CATALOG).hero.name).toBe(CATALOG.cats.tabby.name);
  });
});
