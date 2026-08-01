import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProgression, CATALOG, RANKS, rankFor } from '../src/progression.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  };
}

describe('createProgression', () => {
  let storage, p;
  beforeEach(() => {
    storage = fakeStorage();
    p = createProgression(storage);
  });

  it('starts fresh with three cats, two accessories, and neighborhood unlocked', () => {
    expect(p.state.points).toBe(0);
    expect(p.state.unlocked.cats).toEqual(['tabby', 'siamese', 'persian']);
    expect(p.state.unlocked.accessories).toEqual(['bell', 'bandana']);
    expect(p.state.unlocked.areas).toEqual(['neighborhood']);
    expect(p.state.equipped).toEqual({ cat: 'tabby', collar: null, outfit: null });
  });

  it('discards version-1 saves so starter unlocks apply', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = fakeStorage({
      'whisker-walk-save': JSON.stringify({ version: 1, points: 0, unlocked: { cats: ['tabby'] } }),
    });
    const p2 = createProgression(old);
    expect(p2.state.unlocked.cats).toContain('siamese');
    warn.mockRestore();
  });

  it('adds points and persists', () => {
    p.addPoints(25);
    const reloaded = createProgression(storage);
    expect(reloaded.state.points).toBe(25);
  });

  it('buys an affordable locked item and deducts points', () => {
    p.addPoints(CATALOG.cats.black.price);
    expect(p.canBuy('cats', 'black')).toBe(true);
    expect(p.buy('cats', 'black')).toBe(true);
    expect(p.state.points).toBe(0);
    expect(p.isUnlocked('cats', 'black')).toBe(true);
  });

  it('refuses to buy unaffordable or already-owned items', () => {
    expect(p.buy('cats', 'black')).toBe(false); // no points
    p.addPoints(999);
    p.buy('cats', 'black');
    expect(p.buy('cats', 'black')).toBe(false); // already owned
  });

  it('gates park behind 2 neighborhood walks even with enough points', () => {
    p.addPoints(999);
    expect(p.canBuy('areas', 'park')).toBe(false);
    p.completeWalk(); // area defaults to neighborhood
    p.completeWalk();
    expect(p.canBuy('areas', 'park')).toBe(true);
  });

  it('equips only unlocked cats and accessories into the right slot', () => {
    p.equipCat('black');
    expect(p.state.equipped.cat).toBe('tabby'); // locked → ignored
    p.equipCat('persian');
    expect(p.state.equipped.cat).toBe('persian'); // starter-unlocked → works
    p.addPoints(999);
    p.buy('accessories', 'glow');
    p.equipAccessory('glow');
    p.equipAccessory('bandana'); // starter-owned outfit
    expect(p.state.equipped.collar).toBe('glow');
    expect(p.state.equipped.outfit).toBe('bandana');
    p.unequip('collar');
    expect(p.state.equipped.collar).toBe(null);
  });

  it('recovers from corrupt save data with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = fakeStorage({ 'whisker-walk-save': '{not json!!' });
    const p2 = createProgression(bad);
    expect(p2.state.points).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('discards saves with a different version', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 0, points: 900 }) });
    const p2 = createProgression(old);
    expect(p2.state.points).toBe(0);
    warn.mockRestore();
  });

  it('survives a storage that throws on write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const p2 = createProgression(broken);
    expect(() => p2.addPoints(5)).not.toThrow();
    expect(p2.state.points).toBe(5);
    warn.mockRestore();
  });

  it('migrates a v2 save keeping data and adding v3 fields', () => {
    const v2 = {
      version: 2, points: 77,
      walks: { neighborhood: 4, park: 0, seaside: 0 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
      equipped: { cat: 'siamese', collar: 'bell', outfit: null },
      area: 'neighborhood',
    };
    const p2 = createProgression(fakeStorage({ 'whisker-walk-save': JSON.stringify(v2) }));
    expect(p2.state.points).toBe(77);
    expect(p2.state.equipped.cat).toBe('siamese');
    expect(p2.state.lifetimePoints).toBe(77);
    expect(p2.state.bestWalk).toBe(0);
    expect(p2.state.friends).toEqual({});
    expect(p2.state.version).toBe(3);
  });

  it('accrues lifetimePoints through addPoints and never decreases on buy', () => {
    p.addPoints(50);
    p.buy('cats', 'black'); // costs 45
    expect(p.state.points).toBe(5);
    expect(p.state.lifetimePoints).toBe(50);
  });

  it('tracks friendship levels with one greet per walk per cat', () => {
    expect(p.recordGreet('Pickles', 'tabby', 'walk-1')).toBe('met');
    expect(p.recordGreet('Pickles', 'tabby', 'walk-1')).toBe(null); // same walk: no-op
    expect(p.state.friends.Pickles.greets).toBe(1);
    p.recordGreet('Pickles', 'tabby', 'walk-2');
    expect(p.recordGreet('Pickles', 'tabby', 'walk-3')).toBe('friend'); // 3rd greet
    expect(p.friendLevel('Pickles')).toBe('friend');
    for (const w of ['w4', 'w5']) p.recordGreet('Pickles', 'tabby', w);
    expect(p.recordGreet('Pickles', 'tabby', 'w6')).toBe('best');
    expect(p.friendLevel('Nobody')).toBe('none');
  });

  it('records best walk scores', () => {
    expect(p.recordWalkScore(30)).toBe(true);
    expect(p.recordWalkScore(20)).toBe(false);
    expect(p.recordWalkScore(45)).toBe(true);
    expect(p.state.bestWalk).toBe(45);
  });

  it('defaults petName to null and persists it via setPetName', () => {
    expect(p.state.petName).toBe(null);
    p.setPetName('Hagrid');
    expect(p.state.petName).toBe('Hagrid');
    const reloaded = createProgression(storage);
    expect(reloaded.state.petName).toBe('Hagrid');
  });

  it('defaults petName to null for existing v3 saves missing the field', () => {
    const v3 = {
      version: 3, points: 10,
      walks: { neighborhood: 0, park: 0, seaside: 0 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: null, outfit: null },
      area: 'neighborhood', lifetimePoints: 10, bestWalk: 0, friends: {},
    };
    const p2 = createProgression(fakeStorage({ 'whisker-walk-save': JSON.stringify(v3) }));
    expect(p2.state.petName).toBe(null);
  });

  it('gives a v2 migration petName: null too', () => {
    const v2 = {
      version: 2, points: 5,
      walks: { neighborhood: 0, park: 0, seaside: 0 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: null, outfit: null },
      area: 'neighborhood',
    };
    const p2 = createProgression(fakeStorage({ 'whisker-walk-save': JSON.stringify(v2) }));
    expect(p2.state.petName).toBe(null);
  });

  it('maps lifetime points to ranks', () => {
    expect(rankFor(0).title).toBe('House Cat');
    expect(rankFor(151).title).toBe('Yard Prowler');
    expect(rankFor(2500).title).toBe('Mythical Feline');
    expect(rankFor(2500).next).toBe(null);
    expect(rankFor(160).next.title).toBe('Street Smart');
    expect(RANKS).toHaveLength(5);
  });

  describe('replaceFromPayload', () => {
    it('round-trips a raw v3 save object through storage and reloads live state', () => {
      p.addPoints(999);
      p.buy('cats', 'black');
      p.setPetName('Hagrid');
      const donorStorage = fakeStorage();
      const donor = createProgression(donorStorage);
      donor.addPoints(321);
      donor.setPetName('Whiskers');
      donor.equipCat('siamese');

      p.replaceFromPayload(donor.state);

      expect(p.state).toEqual(donor.state);
      expect(p.state.petName).toBe('Whiskers');
      expect(p.state.lifetimePoints).toBe(321);
      // persisted, not just in-memory — a fresh instance over the same
      // storage sees the replacement too.
      const reloaded = createProgression(storage);
      expect(reloaded.state.petName).toBe('Whiskers');
      expect(reloaded.state.lifetimePoints).toBe(321);
    });

    it('migrates a v2-format payload on replace, same as the normal load path', () => {
      const v2 = {
        version: 2, points: 88,
        walks: { neighborhood: 3, park: 0, seaside: 0 },
        unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
        equipped: { cat: 'persian', collar: null, outfit: null },
        area: 'neighborhood',
      };
      p.addPoints(5); // pre-existing state should be fully discarded, not merged

      p.replaceFromPayload(v2);

      expect(p.state.version).toBe(3);
      expect(p.state.points).toBe(88);
      expect(p.state.lifetimePoints).toBe(88);
      expect(p.state.bestWalk).toBe(0);
      expect(p.state.friends).toEqual({});
      expect(p.state.petName).toBe(null);
      expect(p.state.equipped.cat).toBe('persian');
    });

    it('recovers to a fresh save with a warning when the payload is unreadable', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      p.addPoints(50);

      p.replaceFromPayload({ version: 999, points: 1 });

      expect(p.state.points).toBe(0);
      expect(p.state.version).toBe(3);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('yields a playable default-shaped state from a bare {version:3} payload', () => {
      // a malformed-but-version-3-claiming payload must never leave the
      // save missing fields render()/canBuy()/isUnlocked() rely on — this
      // used to persist wholesale and brick every future boot.
      p.replaceFromPayload({ version: 3 });

      expect(p.state).toEqual({
        version: 3, points: 0,
        walks: { neighborhood: 0, park: 0, seaside: 0 },
        unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
        equipped: { cat: 'tabby', collar: null, outfit: null },
        area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      });
      // and it's genuinely playable, not just shaped right
      expect(() => p.isUnlocked('cats', 'tabby')).not.toThrow();
      expect(() => p.canBuy('areas', 'park')).not.toThrow();
      expect(p.isUnlocked('cats', 'tabby')).toBe(true);
      // persisted sanitized — a fresh instance over the same storage
      // doesn't re-inherit the malformed payload.
      const reloaded = createProgression(storage);
      expect(reloaded.state).toEqual(p.state);
    });

    it('corrects garbage nested types field-by-field instead of trusting them wholesale', () => {
      p.replaceFromPayload({
        version: 3,
        points: 'a lot',
        lifetimePoints: -50,
        bestWalk: NaN,
        walks: null,
        unlocked: { cats: 'tabby', accessories: [1, 2, 3], areas: null },
        equipped: 'siamese',
        area: { evil: true },
        friends: ['not', 'a', 'dict'],
        petName: { toString: () => 'hi' },
      });

      expect(p.state.points).toBe(0);
      expect(p.state.lifetimePoints).toBe(0);
      expect(p.state.bestWalk).toBe(0);
      expect(p.state.walks).toEqual({ neighborhood: 0, park: 0, seaside: 0 });
      // starter unlocks are still guaranteed even though the payload's
      // unlocked lists were unusable
      expect(p.state.unlocked).toEqual({ cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] });
      expect(p.state.equipped).toEqual({ cat: 'tabby', collar: null, outfit: null });
      expect(p.state.area).toBe('neighborhood');
      expect(p.state.friends).toEqual({});
      expect(p.state.petName).toBe(null);
      expect(() => p.canBuy('areas', 'park')).not.toThrow();
    });

    it('rejects an equipped id the payload never actually unlocked', () => {
      p.replaceFromPayload({
        version: 3, points: 0,
        walks: { neighborhood: 0, park: 0, seaside: 0 },
        unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood'] },
        equipped: { cat: 'hagrid', collar: 'glow', outfit: 'crown' }, // none of these are unlocked above
        area: 'seaside', // not unlocked either
        lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      });

      expect(p.state.equipped).toEqual({ cat: 'tabby', collar: null, outfit: null });
      expect(p.state.area).toBe('neighborhood');
    });

    it('rejects a collar id placed in the wrong slot', () => {
      p.replaceFromPayload({
        version: 3, points: 0,
        walks: { neighborhood: 0, park: 0, seaside: 0 },
        unlocked: { cats: ['tabby'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
        equipped: { cat: 'tabby', collar: 'bandana', outfit: 'bell' }, // slots swapped
        area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      });

      expect(p.state.equipped.collar).toBe(null);
      expect(p.state.equipped.outfit).toBe(null);
    });

    it('sanitizes friends: drops unusable entries, coerces breed/greets, keeps long/short names by length only', () => {
      p.replaceFromPayload({
        version: 3, points: 0,
        walks: { neighborhood: 0, park: 0, seaside: 0 },
        unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood'] },
        equipped: { cat: 'tabby', collar: null, outfit: null },
        area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, petName: null,
        friends: {
          'Pickles': { breed: 'tabby', greets: 3, lastWalk: 'walk-1' },
          '<img src=x onerror=1>': { breed: 'siamese', greets: 1, lastWalk: null }, // kept (≤24 chars) — escaped at render, not here
          'UnknownBreed': { breed: 'totally-not-a-cat', greets: 2, lastWalk: null },
          'NegativeGreets': { breed: 'tabby', greets: -5, lastWalk: null },
          'StringGreets': { breed: 'tabby', greets: 'lots', lastWalk: null },
          ['x'.repeat(25)]: { breed: 'tabby', greets: 1, lastWalk: null }, // too long — dropped
          '': { breed: 'tabby', greets: 1, lastWalk: null }, // empty — dropped
          'NotAnObject': 'nope', // wrong shape — dropped
        },
      });

      const f = p.state.friends;
      expect(f['Pickles']).toEqual({ breed: 'tabby', greets: 3, lastWalk: 'walk-1' });
      expect(f['<img src=x onerror=1>']).toEqual({ breed: 'siamese', greets: 1, lastWalk: null });
      expect(f['UnknownBreed']).toEqual({ breed: 'tabby', greets: 2, lastWalk: null }); // coerced to a safe default
      expect(f['NegativeGreets'].greets).toBe(0);
      expect(f['StringGreets'].greets).toBe(0);
      expect(f['x'.repeat(25)]).toBeUndefined();
      expect(f['']).toBeUndefined();
      expect(f['NotAnObject']).toBeUndefined();
    });
  });
});
