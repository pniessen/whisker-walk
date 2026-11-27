// A place's card shows public/places/<id>.jpg (src/ui/dressingroom.js PLACE_PICTURE); without the file
// it falls back to a plain green gradient. Every catalog place has a picture, or is named here on purpose.
import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { CATALOG } from '../src/progression.js';
import { PLACE_PICTURE } from '../src/ui/dressingroom.js';

const NO_PICTURE = new Set([]); // an id here ships a plain card on purpose (say why beside it)
const IDS = [...new Set([...Object.keys(CATALOG.areas), 'den'])].filter((id) => !NO_PICTURE.has(id));

describe('every place has a card picture', () => {
  for (const id of IDS) {
    it(id, () => {
      const file = new URL(`../public/places/${id}.jpg`, import.meta.url);
      expect(PLACE_PICTURE(id).endsWith(`places/${id}.jpg`)).toBe(true);
      expect(existsSync(file), `${id}: no public/places/${id}.jpg (add one, or list it in NO_PICTURE)`).toBe(true);
      expect(statSync(file).size, `${id}: picture over 80 kB`).toBeLessThan(80_000);
    });
  }
});
