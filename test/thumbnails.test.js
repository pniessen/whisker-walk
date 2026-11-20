import { describe, it, expect } from 'vitest';
import { thumbnailIds, missingFoundThumbs } from '../src/thumbnails.js';
import { CATALOG, BASE_ACCESSORY_IDS } from '../src/progression.js';

describe('found-outfit thumbnails', () => {
  it('thumbnailIds holds no found outfit and every shop accessory', () => {
    const ids = thumbnailIds(CATALOG);
    for (const id of ids) expect(CATALOG.accessories[id].find).toBeFalsy();
    for (const id of BASE_ACCESSORY_IDS) expect(ids).toContain(id);
    expect(CATALOG.accessories.acorncap.find).toBeTruthy();
    expect(ids).not.toContain('acorncap');
  });

  it('missingFoundThumbs lists owned found outfits with no picture', () => {
    const cat = { accessories: { acorncap: { find: 'park' }, daisychain: { find: 'park' }, bell: {} } };
    expect(missingFoundThumbs({ accessories: { acorncap: 'data:x' } }, ['acorncap', 'daisychain', 'bell', 'junk'], cat)).toEqual(['daisychain']);
  });

  it('missingFoundThumbs skips ids already tried', () => {
    const cat = { accessories: { a: { find: 'park' }, b: { find: 'park' } } };
    expect(missingFoundThumbs({ accessories: {} }, ['a', 'b'], cat, new Set(['a']))).toEqual(['b']);
  });
});
