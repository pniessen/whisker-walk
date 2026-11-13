import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { offeredWalkingName, walkingNameIntro, WALKING_NAME, WALKING_NAME_HELP, PICK_WALKING_NAME } from '../src/ui/walkingname.js';
import { FALLBACK_NAME } from '../src/customcats.js';
import { buildDressingModel } from '../src/ui/dressingroom.js';
import { CATALOG, createProgression } from '../src/progression.js';

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
  it('one name for the public name, said the same way each time', () => {
    expect(WALKING_NAME).toBe('Your walking name');
    expect(WALKING_NAME_HELP).toBe('Friends see this name when you play together.');
    expect(PICK_WALKING_NAME).toBe('Pick your walking name');
    expect(walkingNameIntro(false)).toBe('First, pick your walking name:');
    expect(walkingNameIntro('walk')).toBe('You need a walking name before you can join a walk. Type one here and tap Save:');
    expect(walkingNameIntro('colony')).toBe('You need a walking name before you can share your colony. Type one here and tap Save:');
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
