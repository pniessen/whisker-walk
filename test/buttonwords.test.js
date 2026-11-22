// The touch buttons' small words go by use (src/ui/buttonwords.js; design section 4).
import { describe, it, expect } from 'vitest';
import { createButtonUses, buttonWords, countButtonUse, sanitizeButtonUses, BUTTON_USES_KEY, USES_TO_KNOW } from '../src/ui/buttonwords.js';
import { memoryStorage as mem } from './helpers/storage.js';

describe('button words by use', () => {
  it('every button shows its word until it has been used twice', () => {
    const storage = mem();
    const uses = createButtonUses(storage);
    expect(uses.words()).toEqual({ pounce: true, meow: true, camera: true });
    expect(uses.use('pounce')).toBe(true);
    expect(uses.words().pounce).toBe(true);
    expect(uses.use('pounce')).toBe(true);
    expect(uses.words()).toEqual({ pounce: false, meow: true, camera: true });
    expect(uses.use('pounce')).toBe(false); // nothing more to count
    expect(USES_TO_KNOW).toBe(2);
    // kept for the next visit, and the next walk
    expect(createButtonUses(storage).words().pounce).toBe(false);
    expect(JSON.parse(storage.getItem(BUTTON_USES_KEY))).toEqual({ pounce: 2 });
  });

  it('only the three word buttons count (the yarn button went in the controls review)', () => {
    const uses = createButtonUses(mem());
    for (const name of ['pause', 'interact', 'tapWorld', 'zoomIn', 'yarn', '__proto__', undefined]) expect(uses.use(name)).toBe(false);
    expect(countButtonUse({}, 'meow')).toEqual({ meow: 1 });
  });

  it('junk in storage reads as nothing used; storage that throws is not fatal', () => {
    expect(sanitizeButtonUses({ pounce: 99, meow: -1, yarn: 2, camera: 1.5, other: 2 })).toEqual({ pounce: 2 });
    expect(createButtonUses(mem({ [BUTTON_USES_KEY]: '{oops' })).words().meow).toBe(true);
    expect(buttonWords(null)).toEqual({ pounce: true, meow: true, camera: true });
    const broken = { getItem: () => { throw new Error('off'); }, setItem: () => { throw new Error('full'); } };
    const uses = createButtonUses(broken);
    expect(uses.use('camera')).toBe(true);
    expect(uses.use('camera')).toBe(true);
    expect(uses.words().camera).toBe(false);
  });
});
