import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProgression, CATALOG, RANKS, rankFor, asFiniteNonNeg, summarizeSaveForPreview, JOURNAL_TYPES } from '../src/progression.js';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';

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
    expect(p.state.equipped).toEqual({
      cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null,
    });
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

  // Regression (Task 7.2 fix): the den is freely repeatable and never
  // persists state.area (areaOverride semantics — see main.js's startWalk),
  // so completeWalk must accept the walked area explicitly rather than
  // always crediting state.area — otherwise every den walk would silently
  // inflate whatever OTHER area was last set via setArea, e.g. letting a
  // player farm den walks to unlock park/seaside's walks-gated requirement
  // without ever actually walking neighborhood.
  it('completeWalk(areaId) credits the area actually walked, not state.area', () => {
    expect(p.state.walks.den).toBe(0);
    expect(p.state.walks.neighborhood).toBe(0);
    p.completeWalk('den');
    expect(p.state.walks.den).toBe(1);
    expect(p.state.walks.neighborhood).toBe(0); // untouched — state.area is still 'neighborhood'
    p.completeWalk('den');
    expect(p.state.walks.den).toBe(2);
    expect(p.state.walks.neighborhood).toBe(0);
  });

  it('equips only unlocked cats and accessories into the right slot', () => {
    p.equipCat('black');
    expect(p.state.equipped.cat).toBe('tabby'); // locked → ignored
    p.equipCat('persian');
    expect(p.state.equipped.cat).toBe('persian'); // starter-unlocked → works
    p.addPoints(999);
    p.buy('accessories', 'glow');
    p.equipAccessory('glow');
    p.equipAccessory('bandana'); // starter-owned, now a neck item
    expect(p.state.equipped.collar).toBe('glow');
    expect(p.state.equipped.neck).toBe('bandana');
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

  it('migrates a v2 save keeping data and adding v3/v4 fields (2 → 3 → 4)', () => {
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
    expect(p2.state.version).toBe(4);
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

      expect(p.state.version).toBe(4);
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
      expect(p.state.version).toBe(4);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('yields a playable default-shaped state from a bare {version:3} payload', () => {
      // a malformed-but-version-3-claiming payload must never leave the
      // save missing fields render()/canBuy()/isUnlocked() rely on — this
      // used to persist wholesale and brick every future boot.
      p.replaceFromPayload({ version: 3 });

      expect(p.state).toEqual({
        version: 4, points: 0,
        walks: { neighborhood: 0, park: 0, seaside: 0, den: 0 },
        unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
        equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
        area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
        journal: {}, golden: [], streak: { last: null, count: 0 }, kitten: { stage: 0 },
        race: { date: null, area: null, bestMs: null },
        den: { owned: [], placed: {} },
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
      expect(p.state.walks).toEqual({ neighborhood: 0, park: 0, seaside: 0, den: 0 });
      // starter unlocks are still guaranteed even though the payload's
      // unlocked lists were unusable
      expect(p.state.unlocked).toEqual({ cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] });
      expect(p.state.equipped).toEqual({
        cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null,
      });
      expect(p.state.area).toBe('neighborhood');
      expect(p.state.friends).toEqual({});
      expect(p.state.petName).toBe(null);
      expect(() => p.canBuy('areas', 'park')).not.toThrow();
    });

    it('rejects an equipped id the payload never actually unlocked', () => {
      p.replaceFromPayload({
        version: 4, points: 0,
        walks: { neighborhood: 0, park: 0, seaside: 0 },
        unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood'] },
        equipped: { cat: 'hagrid', collar: 'glow', head: 'crown' }, // none of these are unlocked above
        area: 'seaside', // not unlocked either
        lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      });

      expect(p.state.equipped).toEqual({
        cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null,
      });
      expect(p.state.area).toBe('neighborhood');
    });

    it('rejects an id placed in the wrong slot', () => {
      p.replaceFromPayload({
        version: 4, points: 0,
        walks: { neighborhood: 0, park: 0, seaside: 0 },
        unlocked: { cats: ['tabby'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
        equipped: { cat: 'tabby', collar: 'bandana', head: 'bell' }, // slots swapped: bandana is a neck item, bell is a collar
        area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      });

      expect(p.state.equipped.collar).toBe(null);
      expect(p.state.equipped.head).toBe(null);
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

// Cloud-preview XSS fix (final fix wave, Task 1): a "Load from cloud" preview
// reads a save straight back from the `saves` table with no server-side
// shape check (see docs/supabase-setup.sql's load_save) and — before this
// fix — rendered its points/lifetimePoints/bestWalk raw into innerHTML
// (ui/homebase.js's renderSync). summarizeSaveForPreview is the coercion
// choke point main.js's previewLoad now runs both saves through; these
// tests exercise it directly with maximally hostile payloads (no jsdom
// required — this is a pure function, not a DOM render).
describe('asFiniteNonNeg', () => {
  it('passes through finite non-negative numbers unchanged', () => {
    expect(asFiniteNonNeg(0, -1)).toBe(0);
    expect(asFiniteNonNeg(42, -1)).toBe(42);
    expect(asFiniteNonNeg(3.5, -1)).toBe(3.5);
  });

  it('falls back for anything that is not a finite non-negative number', () => {
    expect(asFiniteNonNeg('<script>alert(1)</script>', 0)).toBe(0);
    expect(asFiniteNonNeg('42', 0)).toBe(0); // numeric string still isn't a number
    expect(asFiniteNonNeg(-5, 0)).toBe(0);
    expect(asFiniteNonNeg(NaN, 0)).toBe(0);
    expect(asFiniteNonNeg(Infinity, 0)).toBe(0);
    expect(asFiniteNonNeg(null, 0)).toBe(0);
    expect(asFiniteNonNeg(undefined, 0)).toBe(0);
    expect(asFiniteNonNeg({}, 0)).toBe(0);
    expect(asFiniteNonNeg([1, 2], 0)).toBe(0);
  });
});

describe('v11 slots + save migration', () => {
  const SLOTS = ['head', 'face', 'neck', 'body', 'back', 'feet'];

  it('every accessory has a valid slot, and ids are unique with sane prices', () => {
    const seen = new Set();
    for (const [id, a] of Object.entries(CATALOG.accessories)) {
      expect(['collar', ...SLOTS]).toContain(a.slot);
      expect(typeof a.name).toBe('string');
      expect(a.price).toBeGreaterThanOrEqual(0);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('re-homes the old outfit item into its new slot on a v3 save, preserving every other persisted field', () => {
    const cases = [['bandana', 'neck'], ['booties', 'feet'], ['backpack', 'back'], ['crown', 'head']];
    for (const [item, slot] of cases) {
      const store = fakeStorage();
      // Every persisted field below is deliberately set to a distinctive,
      // non-default value so a migration that silently rebuilds the object
      // from a partial field list (e.g. dropping lifetimePoints/bestWalk/
      // friends) would show up as a failing assertion here rather than
      // slipping through unnoticed.
      store.setItem('whisker-walk-save', JSON.stringify({
        version: 3, points: 120, lifetimePoints: 300, bestWalk: 40, area: 'park',
        walks: { neighborhood: 5, park: 2, seaside: 0 },
        friends: { Whiskers: { breed: 'siamese', greets: 4, lastWalk: 'walk-9' } },
        petName: 'Zeetoo',
        unlocked: { cats: ['tabby', 'black'], accessories: ['bell', 'glow', item], areas: ['neighborhood', 'park'] },
        equipped: { cat: 'tabby', collar: 'bell', outfit: item },
      }));
      const p = createProgression(store);
      expect(p.state.version).toBe(4);
      expect(p.state.equipped[slot]).toBe(item);   // re-homed, not lost
      expect(p.state.equipped.collar).toBe('bell'); // collar preserved
      expect(p.state.equipped.outfit).toBeUndefined();
      expect(p.state.points).toBe(120);
      expect(p.state.lifetimePoints).toBe(300);     // veteran rank must survive
      expect(p.state.bestWalk).toBe(40);             // best-walk record must survive
      expect(p.state.area).toBe('park');
      expect(p.state.walks).toEqual({ neighborhood: 5, park: 2, seaside: 0, den: 0 });
      expect(p.state.friends).toEqual({ Whiskers: { breed: 'siamese', greets: 4, lastWalk: 'walk-9' } });
      expect(p.state.petName).toBe('Zeetoo');
      expect(p.state.unlocked.cats).toEqual(expect.arrayContaining(['tabby', 'black', 'siamese', 'persian']));
      expect(p.state.unlocked.accessories).toEqual(expect.arrayContaining(['bell', 'glow', item]));
      expect(p.state.unlocked.areas).toEqual(expect.arrayContaining(['neighborhood', 'park']));
    }
  });

  it('a v3 save with no outfit migrates with every new slot null', () => {
    const store = fakeStorage();
    store.setItem('whisker-walk-save', JSON.stringify({
      version: 3, points: 10, lifetimePoints: 10, bestWalk: 0, area: 'neighborhood',
      walks: {}, friends: {}, petName: null,
      unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: 'bell', outfit: null },
    }));
    const p = createProgression(store);
    for (const s of SLOTS) expect(p.state.equipped[s]).toBeNull();
  });

  it('rejects a wrong-slot, unowned, or garbage value per slot without throwing', () => {
    const store = fakeStorage();
    store.setItem('whisker-walk-save', JSON.stringify({
      version: 4, points: 0, lifetimePoints: 0, bestWalk: 0, area: 'neighborhood',
      walks: {}, friends: {}, petName: null,
      unlocked: { cats: ['tabby'], accessories: ['bell', 'tophat'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: 'bell', head: 'bandana', face: 'nope', neck: 42, body: null, back: null, feet: 'sneakers' },
    }));
    const p = createProgression(store);
    expect(p.state.equipped.head).toBeNull();  // bandana is a neck item, not head
    expect(p.state.equipped.face).toBeNull();  // unknown id
    expect(p.state.equipped.neck).toBeNull();  // not a string
    expect(p.state.equipped.feet).toBeNull();  // sneakers not unlocked
    expect(p.state.equipped.collar).toBe('bell');
  });

  it('a v3 save whose equipped.outfit names an id not in the catalog migrates without throwing, leaving all six slots null', () => {
    const store = fakeStorage();
    store.setItem('whisker-walk-save', JSON.stringify({
      version: 3, points: 55, lifetimePoints: 200, bestWalk: 15, area: 'neighborhood',
      walks: { neighborhood: 3, park: 0, seaside: 0 },
      friends: { Pickles: { breed: 'tabby', greets: 2, lastWalk: 'walk-2' } },
      petName: 'Mochi',
      unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: 'bell', outfit: 'oldhat' }, // 'oldhat' was retired, no longer in CATALOG.accessories
    }));
    expect(() => createProgression(store)).not.toThrow();
    const p = createProgression(store);
    expect(p.state.version).toBe(4);
    for (const s of SLOTS) expect(p.state.equipped[s]).toBeNull();
    expect(p.state.equipped.collar).toBe('bell');
    expect(p.state.points).toBe(55);
    expect(p.state.lifetimePoints).toBe(200);
    expect(p.state.bestWalk).toBe(15);
    expect(p.state.friends).toEqual({ Pickles: { breed: 'tabby', greets: 2, lastWalk: 'walk-2' } });
    expect(p.state.petName).toBe('Mochi');
    expect(p.state.unlocked.accessories).toContain('bell');
  });

  it('a v3 save with equipped missing entirely (or null) migrates without throwing, defaulting equipped while preserving points/unlocks', () => {
    for (const equipped of [undefined, null]) {
      const store = fakeStorage();
      const payload = {
        version: 3, points: 33, lifetimePoints: 90, bestWalk: 5, area: 'neighborhood',
        walks: { neighborhood: 1, park: 0, seaside: 0 }, friends: {}, petName: null,
        unlocked: { cats: ['tabby', 'black'], accessories: ['bell'], areas: ['neighborhood'] },
        ...(equipped === undefined ? {} : { equipped }),
      };
      store.setItem('whisker-walk-save', JSON.stringify(payload));
      expect(() => createProgression(store)).not.toThrow();
      const p = createProgression(store);
      expect(p.state.version).toBe(4);
      expect(p.state.equipped).toEqual({
        cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null,
      });
      expect(p.state.points).toBe(33);
      expect(p.state.unlocked.cats).toEqual(expect.arrayContaining(['tabby', 'black']));
      expect(p.state.unlocked.accessories).toContain('bell');
    }
  });

  it('equips and unequips independently per slot', () => {
    const store = fakeStorage();
    const p = createProgression(store);
    p.state.unlocked.accessories.push('tophat', 'necktie');
    p.equipAccessory('tophat');
    p.equipAccessory('necktie');
    expect(p.state.equipped.head).toBe('tophat');
    expect(p.state.equipped.neck).toBe('necktie');
    p.unequip('head');
    expect(p.state.equipped.head).toBeNull();
    expect(p.state.equipped.neck).toBe('necktie'); // other slots untouched
  });
});

// v15 Collector's Journal: four additive save fields (journal sighting
// counts, golden-mouse ids found, daily-walk streak, kitten growth stage).
// SAVE_VERSION stays 4 — these are additive fields, not a new version — so a
// pre-existing v4 payload missing them must load with sane defaults, and a
// hostile cloud payload (same untrusted-input threat model as every other
// field in sanitizeState) must have each field individually validated rather
// than trusted wholesale.
describe('v15 journal/golden/streak/kitten save fields', () => {
  it('v4 save without journal/golden/streak/kitten loads with defaults', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, points: 50, equipped: { cat: 'tabby' } }) });
    const p = createProgression(storage);
    expect(p.state.journal).toEqual({});
    expect(p.state.golden).toEqual([]);
    expect(p.state.streak).toEqual({ last: null, count: 0 });
    expect(p.state.kitten).toEqual({ stage: 0 });
    expect(p.state.points).toBe(50); // nothing else disturbed
  });

  it('sanitizes hostile new fields', () => {
    // Deviation from the original brief: state.golden is validated against
    // the id-shape pattern /^gm-[a-z]+-[1-9]$/ instead of a KNOWN_GOLD set
    // imported from src/goldmice.js — that module doesn't exist yet (it's
    // Task 5.3), and importing it here would create a cycle/ordering
    // dependency progression.js shouldn't have on a not-yet-existing module.
    // 'gm-neigh-1' matches the pattern and survives; 'nope' (wrong shape)
    // and 7 (non-string) are dropped, same as the brief's intent.
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      journal: { bird: 3, dragon: 9, squirrel: '<img>' }, golden: ['gm-neigh-1', 'nope', 7],
      streak: { last: 12, count: -3 }, kitten: { stage: 99 } }) });
    const p = createProgression(storage);
    expect(p.state.journal).toEqual({ bird: 3 });         // unknown type + non-numeric dropped
    expect(p.state.golden).toEqual(['gm-neigh-1']);       // unknown/non-string dropped
    expect(p.state.streak).toEqual({ last: null, count: 0 });
    expect(p.state.kitten).toEqual({ stage: 3 });         // clamped
  });

  it('dedupes golden ids and drops duplicates even when the pattern matches', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      golden: ['gm-park-1', 'gm-park-1', 'gm-park-2'] }) });
    const p = createProgression(storage);
    expect(p.state.golden).toEqual(['gm-park-1', 'gm-park-2']);
  });

  it('caps golden ids at 64 even when a hostile payload supplies 100 unique valid-shaped ids', () => {
    // Spreadsheet-column-style base-26 letters (a, b, ..., z, aa, ab, ...) —
    // guarantees 100 distinct all-lowercase middle segments that genuinely
    // satisfy GOLD_ID_PATTERN's [a-z]{1,24}. (A prior version of this test
    // used `area${i}`, whose digits fail the letters-only pattern — every
    // entry was silently dropped and the length-≤64 assertion passed
    // vacuously at length 0, never exercising the cap.)
    const toLetters = (i) => {
      let n = i + 1;
      let s = '';
      while (n > 0) {
        n -= 1;
        s = String.fromCharCode(97 + (n % 26)) + s;
        n = Math.floor(n / 26);
      }
      return s;
    };
    const golden = Array.from({ length: 100 }, (_, i) => `gm-${toLetters(i)}-1`);
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, golden }) });
    const p = createProgression(storage);
    expect(p.state.golden.length).toBe(64); // exact — proves the cap actually bites
  });

  it('drops a golden id whose middle segment is a 100-char bloat attempt', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      golden: [`gm-${'a'.repeat(100)}-1`] }) });
    const p = createProgression(storage);
    expect(p.state.golden).toEqual([]);
  });

  it('clamps a hostile streak count of 1e15 down to 3650', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      streak: { last: '2026-08-13', count: 1e15 } }) });
    const p = createProgression(storage);
    expect(p.state.streak).toEqual({ last: '2026-08-13', count: 3650 });
  });

  it('recordStreakWalk: same-day, consecutive, and gap', () => {
    const p = createProgression(fakeStorage({}));
    expect(p.recordStreakWalk('2026-08-13')).toEqual({ count: 1, bonus: 5 });
    expect(p.recordStreakWalk('2026-08-13')).toEqual({ count: 1, bonus: 0 });
    expect(p.recordStreakWalk('2026-08-14')).toEqual({ count: 2, bonus: 10 });
    expect(p.recordStreakWalk('2026-08-20')).toEqual({ count: 1, bonus: 5 });
  });

  it('recordSighting increments known journal types and ignores unknown ones', () => {
    const p = createProgression(fakeStorage({}));
    p.recordSighting('bird');
    p.recordSighting('bird');
    p.recordSighting('dragon'); // unknown — ignored
    expect(p.state.journal).toEqual({ bird: 2 });
    expect(JOURNAL_TYPES).toContain('bird');
  });

  it('recordGolden returns true once per valid id, false for repeats or malformed ids', () => {
    const p = createProgression(fakeStorage({}));
    expect(p.recordGolden('gm-park-3')).toBe(true);
    expect(p.recordGolden('gm-park-3')).toBe(false); // already found
    expect(p.recordGolden('nope')).toBe(false);       // malformed
    expect(p.state.golden).toEqual(['gm-park-3']);
  });

  it('setKittenStage clamps to 0..3 and never decreases', () => {
    const p = createProgression(fakeStorage({}));
    p.setKittenStage(2);
    expect(p.state.kitten.stage).toBe(2);
    p.setKittenStage(1); // lower — ignored
    expect(p.state.kitten.stage).toBe(2);
    p.setKittenStage(99); // clamped
    expect(p.state.kitten.stage).toBe(3);
  });

  it('replaceFromPayload (cloud round-trip) preserves journal/golden/streak/kitten', () => {
    const p = createProgression(fakeStorage({}));
    p.replaceFromPayload({
      version: 4, points: 0,
      walks: { neighborhood: 0, park: 0, seaside: 0 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
      area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      journal: { bird: 4, mouse: 1 }, golden: ['gm-seaside-2'],
      streak: { last: '2026-08-10', count: 3 }, kitten: { stage: 2 },
    });
    expect(p.state.journal).toEqual({ bird: 4, mouse: 1 });
    expect(p.state.golden).toEqual(['gm-seaside-2']);
    expect(p.state.streak).toEqual({ last: '2026-08-10', count: 3 });
    expect(p.state.kitten).toEqual({ stage: 2 });
  });
});

// v17 daily zoomies race: one additive save field, same discipline as the
// v15 block above (still SAVE_VERSION 4 — additive, not a new version).
describe('v17 race save field', () => {
  it('v4 save without race loads with defaults', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, points: 10 }) });
    const p = createProgression(storage);
    expect(p.state.race).toEqual({ date: null, area: null, bestMs: null });
  });

  it('sanitizes a hostile race field: bad date/area/bestMs each drop to null independently', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      race: { date: 'not-a-date', area: 'atlantis', bestMs: -50 } }) });
    const p = createProgression(storage);
    expect(p.state.race).toEqual({ date: null, area: null, bestMs: null });
  });

  it('rejects a bestMs beyond 24 hours or non-finite/non-numeric', () => {
    const tooBig = JSON.stringify({ version: 4, race: { date: '2026-08-13', area: 'park', bestMs: 25 * 60 * 60 * 1000 } });
    expect(createProgression(fakeStorage({ 'whisker-walk-save': tooBig })).state.race.bestMs).toBeNull();
    const nan = JSON.stringify({ version: 4, race: { date: '2026-08-13', area: 'park', bestMs: NaN } });
    expect(createProgression(fakeStorage({ 'whisker-walk-save': nan })).state.race.bestMs).toBeNull();
    const str = JSON.stringify({ version: 4, race: { date: '2026-08-13', area: 'park', bestMs: '12000' } });
    expect(createProgression(fakeStorage({ 'whisker-walk-save': str })).state.race.bestMs).toBeNull();
  });

  it('accepts a well-formed race field', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      race: { date: '2026-08-13', area: 'seaside', bestMs: 12345 } }) });
    const p = createProgression(storage);
    expect(p.state.race).toEqual({ date: '2026-08-13', area: 'seaside', bestMs: 12345 });
  });

  it('recordRace: first race of the day/area is always the best', () => {
    const p = createProgression(fakeStorage({}));
    expect(p.recordRace('2026-08-13', 'neighborhood', 15000)).toEqual({ isBest: true });
    expect(p.state.race).toEqual({ date: '2026-08-13', area: 'neighborhood', bestMs: 15000 });
  });

  it('recordRace: same day+area — faster time improves the best, slower does not', () => {
    const p = createProgression(fakeStorage({}));
    p.recordRace('2026-08-13', 'neighborhood', 15000);
    expect(p.recordRace('2026-08-13', 'neighborhood', 20000)).toEqual({ isBest: false });
    expect(p.state.race.bestMs).toBe(15000); // unchanged — slower run
    expect(p.recordRace('2026-08-13', 'neighborhood', 9000)).toEqual({ isBest: true });
    expect(p.state.race.bestMs).toBe(9000);
  });

  it('recordRace: a new day resets the best even if slower than yesterday', () => {
    const p = createProgression(fakeStorage({}));
    p.recordRace('2026-08-13', 'neighborhood', 9000);
    expect(p.recordRace('2026-08-14', 'neighborhood', 30000)).toEqual({ isBest: true });
    expect(p.state.race).toEqual({ date: '2026-08-14', area: 'neighborhood', bestMs: 30000 });
  });

  it('recordRace: a new area (same day) resets the best too', () => {
    const p = createProgression(fakeStorage({}));
    p.recordRace('2026-08-13', 'neighborhood', 9000);
    expect(p.recordRace('2026-08-13', 'park', 40000)).toEqual({ isBest: true });
    expect(p.state.race).toEqual({ date: '2026-08-13', area: 'park', bestMs: 40000 });
  });

  it('replaceFromPayload (cloud round-trip) preserves race', () => {
    const p = createProgression(fakeStorage({}));
    p.replaceFromPayload({
      version: 4, points: 0,
      walks: { neighborhood: 0, park: 0, seaside: 0 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
      area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      journal: {}, golden: [], streak: { last: null, count: 0 }, kitten: { stage: 0 },
      race: { date: '2026-08-12', area: 'park', bestMs: 8800 },
    });
    expect(p.state.race).toEqual({ date: '2026-08-12', area: 'park', bestMs: 8800 });
  });
});

// v17 Cozy Den: two additive save fields (state.den's owned/placed furniture,
// and state.walks.den — the den's own walk counter). Still SAVE_VERSION 4 —
// additive, not a new version — same untrusted-input threat model as every
// other field in sanitizeState: a hostile/malformed cloud payload must have
// den validated field-by-field rather than trusted wholesale.
describe('v17 den save fields', () => {
  it('v4 save without den/walks.den loads with defaults', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, points: 10 }) });
    const p = createProgression(storage);
    expect(p.state.den).toEqual({ owned: [], placed: {} });
    expect(p.state.walks.den).toBe(0);
  });

  it('sanitizes a hostile den payload: unknown owned item and unowned/unknown placed entries are dropped', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      den: {
        owned: ['rug', 'nuke'],
        placed: { 'rug-spot': 'cattree', evil: 'rug' },
      } }) });
    const p = createProgression(storage);
    expect(p.state.den.owned).toEqual(['rug']);
    expect(p.state.den.placed).toEqual({});
  });

  it('dedupes owned ids and caps at 32', () => {
    const owned = Array(50).fill('rug');
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, den: { owned, placed: {} } }) });
    const p = createProgression(storage);
    expect(p.state.den.owned).toEqual(['rug']);
  });

  it('caps owned at 32 even with 40 distinct known-shaped ids padded beyond the real catalog', () => {
    // DEN_ITEMS only has 6 real keys, so repeat the known ones — the cap's
    // job is bounding array length regardless of how many are duplicates
    // once dedup happens; this proves the raw (pre-dedupe) list is capped
    // as it's walked, same discipline as sanitizeGolden's GOLD_MAX_COUNT.
    const owned = Array.from({ length: 40 }, (_, i) => Object.keys(DEN_ITEMS)[i % 6]);
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, den: { owned, placed: {} } }) });
    const p = createProgression(storage);
    expect(p.state.den.owned.length).toBeLessThanOrEqual(32);
  });

  it('walks.den defaults to 0 and is sanitized like every other walks entry', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, walks: { den: -5 } }) });
    const p = createProgression(storage);
    expect(p.state.walks.den).toBe(0);
  });

  it('buyDenItem: known id, not owned, enough points -> deducts and unlocks', () => {
    const p = createProgression(fakeStorage({}));
    p.addPoints(30);
    expect(p.buyDenItem('rug')).toBe(true);
    expect(p.state.points).toBe(0);
    expect(p.state.den.owned).toEqual(['rug']);
  });

  it('buyDenItem: unknown id, already-owned id, or insufficient points all fail', () => {
    const p = createProgression(fakeStorage({}));
    p.addPoints(30);
    expect(p.buyDenItem('nuke')).toBe(false);
    expect(p.buyDenItem('cattree')).toBe(false); // costs 60, only have 30
    expect(p.buyDenItem('rug')).toBe(true);
    expect(p.buyDenItem('rug')).toBe(false); // already owned
    expect(p.state.den.owned).toEqual(['rug']);
  });

  it('placeDenItem: happy path places an owned item at a known spot', () => {
    const p = createProgression(fakeStorage({}));
    p.addPoints(30);
    p.buyDenItem('rug');
    expect(p.placeDenItem('rug-spot', 'rug')).toBe(true);
    expect(p.state.den.placed).toEqual({ 'rug-spot': 'rug' });
  });

  it('placeDenItem: rejects an unknown spot, unknown item, or unowned item', () => {
    const p = createProgression(fakeStorage({}));
    p.addPoints(30);
    p.buyDenItem('rug');
    expect(p.placeDenItem('nowhere', 'rug')).toBe(false);
    expect(p.placeDenItem('rug-spot', 'nuke')).toBe(false);
    expect(p.placeDenItem('rug-spot', 'cattree')).toBe(false); // known item, not owned
    expect(p.state.den.placed).toEqual({});
  });

  it('placeDenItem: null clears a spot', () => {
    const p = createProgression(fakeStorage({}));
    p.addPoints(30);
    p.buyDenItem('rug');
    p.placeDenItem('rug-spot', 'rug');
    expect(p.placeDenItem('rug-spot', null)).toBe(true);
    expect(p.state.den.placed).toEqual({});
  });

  it('placeDenItem: placing an owned item at a new spot removes it from any spot it already occupied', () => {
    const p = createProgression(fakeStorage({}));
    p.addPoints(30);
    p.buyDenItem('rug');
    p.placeDenItem('rug-spot', 'rug');
    expect(p.placeDenItem('window', 'rug')).toBe(true);
    expect(p.state.den.placed).toEqual({ window: 'rug' }); // moved, not duplicated
  });

  it('replaceFromPayload (cloud round-trip) preserves den', () => {
    const p = createProgression(fakeStorage({}));
    p.replaceFromPayload({
      version: 4, points: 0,
      walks: { neighborhood: 0, park: 0, seaside: 0, den: 3 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
      equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
      area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
      journal: {}, golden: [], streak: { last: null, count: 0 }, kitten: { stage: 0 },
      race: { date: null, area: null, bestMs: null },
      den: { owned: ['rug', 'lamp'], placed: { 'rug-spot': 'rug' } },
    });
    expect(p.state.den).toEqual({ owned: ['rug', 'lamp'], placed: { 'rug-spot': 'rug' } });
    expect(p.state.walks.den).toBe(3);
  });
});

describe('summarizeSaveForPreview', () => {
  it('summarizes a normal save into rank/points/lifetimePoints/bestWalk', () => {
    const summary = summarizeSaveForPreview({ points: 30, lifetimePoints: 500, bestWalk: 12 });
    expect(summary).toEqual({ rank: 'Street Smart', points: 30, lifetimePoints: 500, bestWalk: 12 });
  });

  it('coerces a script-tag hostile payload down to safe zeroed numbers', () => {
    const hostile = {
      points: '<img src=x onerror=alert(1)>',
      lifetimePoints: '<script>document.location="https://evil.example"</script>',
      bestWalk: { toString: () => '<b>hi</b>' },
    };
    const summary = summarizeSaveForPreview(hostile);
    expect(summary.points).toBe(0);
    expect(summary.lifetimePoints).toBe(0);
    expect(summary.bestWalk).toBe(0);
    expect(summary.rank).toBe('House Cat'); // rankFor(0)
    // belt-and-suspenders: nothing markup-shaped survives into the summary
    expect(Object.values(summary).some((v) => typeof v === 'string' && /[<>]/.test(v))).toBe(false);
  });

  it('coerces negative/NaN/Infinity numeric fields to 0 rather than passing them through', () => {
    const summary = summarizeSaveForPreview({ points: -50, lifetimePoints: NaN, bestWalk: Infinity });
    expect(summary).toEqual({ rank: 'House Cat', points: 0, lifetimePoints: 0, bestWalk: 0 });
  });

  it('never throws when the whole save is missing/null/a primitive, defaulting everything to 0', () => {
    expect(summarizeSaveForPreview(undefined)).toEqual({ rank: 'House Cat', points: 0, lifetimePoints: 0, bestWalk: 0 });
    expect(summarizeSaveForPreview(null)).toEqual({ rank: 'House Cat', points: 0, lifetimePoints: 0, bestWalk: 0 });
    expect(summarizeSaveForPreview('<script>alert(1)</script>')).toEqual({ rank: 'House Cat', points: 0, lifetimePoints: 0, bestWalk: 0 });
  });
});
