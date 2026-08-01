import { describe, it, expect, vi } from 'vitest';
import { createAlbum } from '../src/album.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

describe('createAlbum', () => {
  it('starts empty and reports first-photo status from add()', () => {
    const album = createAlbum(fakeStorage());
    expect(album.photos).toEqual([]);
    expect(album.add({ key: 'critter-bird', label: 'a songbird', area: 'X', thumb: 'data:1' })).toBe(true);
    expect(album.add({ key: 'critter-bird', label: 'a songbird', area: 'X', thumb: 'data:2' })).toBe(false);
    expect(album.photos).toHaveLength(2);
    expect(album.has('critter-bird')).toBe(true);
  });

  it('caps the album and rotates out the oldest', () => {
    const album = createAlbum(fakeStorage(), 3);
    for (let i = 0; i < 5; i++) album.add({ key: `k${i}`, label: `p${i}`, area: 'X', thumb: `t${i}` });
    expect(album.photos).toHaveLength(3);
    expect(album.photos[0].key).toBe('k2');
  });

  it('persists across instances', () => {
    const storage = fakeStorage();
    createAlbum(storage).add({ key: 'a', label: 'a', area: 'X', thumb: 't' });
    expect(createAlbum(storage).photos).toHaveLength(1);
  });

  it('recovers from corrupt data with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const album = createAlbum(fakeStorage({ 'whisker-walk-album': '{nope' }));
    expect(album.photos).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a storage that throws on write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const album = createAlbum({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(() => album.add({ key: 'a', label: 'a', area: 'X', thumb: 't' })).not.toThrow();
    warn.mockRestore();
  });

  it('serialize() returns the exact shape persisted to storage', () => {
    const storage = fakeStorage();
    const album = createAlbum(storage);
    album.add({ key: 'a', label: 'a', area: 'X', thumb: 't' });
    expect(album.serialize()).toEqual({ version: 1, photos: album.photos });
  });

  describe('replaceFromPayload', () => {
    it('round-trips a raw album payload through storage and reloads live state', () => {
      const storage = fakeStorage();
      const album = createAlbum(storage);
      album.add({ key: 'local', label: 'local photo', area: 'X', thumb: 'tL' });

      const donorStorage = fakeStorage();
      const donor = createAlbum(donorStorage);
      donor.add({ key: 'cloud-1', label: 'cloud photo one', area: 'Y', thumb: 'tC1' });
      donor.add({ key: 'cloud-2', label: 'cloud photo two', area: 'Y', thumb: 'tC2' });

      album.replaceFromPayload(donor.serialize());

      expect(album.photos).toEqual(donor.photos);
      expect(album.has('cloud-1')).toBe(true);
      expect(album.has('local')).toBe(false);
      // persisted, not just in-memory
      const reloaded = createAlbum(storage);
      expect(reloaded.photos).toEqual(donor.photos);
    });

    it('falls back to an empty album when the payload has no photos array', () => {
      const storage = fakeStorage();
      const album = createAlbum(storage);
      album.add({ key: 'a', label: 'a', area: 'X', thumb: 't' });

      album.replaceFromPayload({ notPhotos: true });

      expect(album.photos).toEqual([]);
    });

    it('warns and keeps the prior on-disk album when storage rejects the write', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const map = new Map();
      const storage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => {
          if (v.includes('quota-buster')) throw new Error('quota');
          map.set(k, v);
        },
      };
      const album = createAlbum(storage);
      album.add({ key: 'a', label: 'a', area: 'X', thumb: 't' });

      album.replaceFromPayload({ version: 1, photos: [{ key: 'quota-buster', label: 'x', area: 'X', thumb: 't' }] });

      expect(warn).toHaveBeenCalled();
      expect(album.photos).toEqual([{ key: 'a', label: 'a', area: 'X', thumb: 't' }]);
      warn.mockRestore();
    });
  });
});
