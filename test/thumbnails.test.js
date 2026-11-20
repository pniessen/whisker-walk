import { describe, it, expect, vi } from 'vitest';
import { thumbnailIds, missingFoundThumbs, fillFoundThumbs, foundThumbsTried, releaseThumbnails } from '../src/thumbnails.js';
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

  it('releaseThumbnails forgets tried found outfits so they are drawn again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thumbs = { accessories: {} };
    fillFoundThumbs(thumbs, ['acorncap']); // no WebGL here: the draw fails and is remembered
    warn.mockRestore();
    expect(foundThumbsTried()).toEqual(['acorncap']);
    expect(missingFoundThumbs(thumbs, ['acorncap'], CATALOG, new Set(foundThumbsTried()))).toEqual([]);
    releaseThumbnails();
    expect(foundThumbsTried()).toEqual([]);
    expect(missingFoundThumbs(thumbs, ['acorncap'], CATALOG, new Set(foundThumbsTried()))).toEqual(['acorncap']);
  });
});
