import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProgression, CATALOG, RANKS, rankFor, asFiniteNonNeg, summarizeSaveForPreview, JOURNAL_TYPES } from '../src/progression.js';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';
import { SKILL_IDS, hasSkill, unlockedSkills } from '../src/skills.js';

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

  // v18 CF-4. friendLevel hardcoded the base 1/3/6 while Charmer moved the
  // rungs to 1/2/4 inside straycats.js, so a Charmer player was toasted
  // "BEST friend 💕" at four greets for a cat the home-base roster still drew
  // as ♥ and the best-friend gift roll still treated as an ordinary friend.
  // Both now read one table (skills.js's friendRungs).
  describe('friendLevel and the Charmer rungs', () => {
    // Sets one cat's lifetime count directly. Nothing here goes through
    // recordGreet on purpose: these cases are about the RUNG a count lands
    // on, and the accrual path is pinned separately below.
    const at = (prog, n) => {
      prog.state.friends.Pickles = { breed: 'tabby', greets: n, lastWalk: null };
      return prog.friendLevel('Pickles');
    };

    it('walks the base 1/3/6 ladder at every rung without Charmer', () => {
      expect(hasSkill(p.state, 'charmer')).toBe(false);
      expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => at(p, n))).toEqual(
        ['none', 'met', 'met', 'friend', 'friend', 'friend', 'best', 'best']
      );
    });

    it('walks the shortened 1/2/4 ladder at every rung with Charmer', () => {
      p.recordSkillUnlocks(['charmer']);
      expect(hasSkill(p.state, 'charmer')).toBe(true);
      expect([0, 1, 2, 3, 4, 5].map((n) => at(p, n))).toEqual(
        ['none', 'met', 'friend', 'friend', 'best', 'best']
      );
    });

    it('agrees with recordGreet\'s own rung names in both states', () => {
      // The two used to be independent copies of the table; a disagreement
      // here is exactly the CF-4 defect.
      for (const charmer of [false, true]) {
        const q = createProgression(fakeStorage());
        if (charmer) q.recordSkillUnlocks(['charmer']);
        for (let w = 1; w <= 6; w++) {
          const named = q.recordGreet('Pickles', 'tabby', `w${w}`);
          if (named) expect(q.friendLevel('Pickles')).toBe(named);
        }
      }
    });

    it('never lets Charmer change how greets accrue', () => {
      // The load-bearing invariant: Charmer moves rungs, never the count.
      // Same greet script with and without the skill must leave the same
      // number on the save, including the per-walk dedup rejections.
      const script = ['w1', 'w1', 'w1', 'w2', 'w3', 'w3', 'w4', 'w5', 'w6', 'w6'];
      const counts = [false, true].map((charmer) => {
        const q = createProgression(fakeStorage());
        if (charmer) q.recordSkillUnlocks(['charmer']);
        for (const w of script) q.recordGreet('Pickles', 'tabby', w);
        return q.state.friends.Pickles.greets;
      });
      expect(counts[0]).toBe(6); // six distinct walks out of ten greet attempts
      expect(counts[1]).toBe(counts[0]);
    });

    it('does not let Charmer bootstrap its own unlock predicate', () => {
      // Charmer is earned by befriending 5 cats at the BASE ♥ rung. If its
      // predicate read the Charmer table the bar would drop to two greets
      // the instant it went true, and earned abilities are never revoked.
      for (let i = 0; i < 5; i++) {
        p.state.friends[`Cat${i}`] = { breed: 'tabby', greets: 2, lastWalk: null };
      }
      expect(hasSkill(p.state, 'charmer')).toBe(false); // 2 greets is not ♥
      for (let i = 0; i < 5; i++) p.state.friends[`Cat${i}`].greets = 3;
      expect(hasSkill(p.state, 'charmer')).toBe(true);
    });
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
    expect(rankFor(160).next.title).toBe('Street Smart');
  });

  // The pre-v18 ladder is frozen: a title or threshold change here would
  // demote a live player on update. Pinned literally rather than derived
  // from RANKS so an accidental edit fails the test instead of following it.
  it('never demotes: the five pre-v18 tiers keep their exact thresholds', () => {
    expect(RANKS.slice(0, 5)).toEqual([
      { at: 0, title: 'House Cat' },
      { at: 150, title: 'Yard Prowler' },
      { at: 400, title: 'Street Smart' },
      { at: 900, title: 'Neighborhood Legend' },
      { at: 2000, title: 'Mythical Feline' },
    ]);
  });

  it('extends to nine tiers, sorted ascending, with no duplicate titles', () => {
    expect(RANKS).toHaveLength(9);
    expect(RANKS.map((r) => r.at)).toEqual([0, 150, 400, 900, 2000, 3500, 5500, 8000, 12000]);
    expect(RANKS.map((r) => r.title)).toEqual([
      'House Cat', 'Yard Prowler', 'Street Smart', 'Neighborhood Legend',
      'Mythical Feline', 'Rooftop Royalty', 'Shadow Prowler', 'Nine Lives',
      'Whisker Legend',
    ]);
    expect(new Set(RANKS.map((r) => r.title)).size).toBe(RANKS.length);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].at).toBeGreaterThan(RANKS[i - 1].at); // rankFor assumes ascending
    }
  });

  // Every boundary at need-1 / need / need+1: one point short still reads as
  // the tier below, and the threshold itself already promotes.
  it('promotes exactly at each threshold, not one point early or late', () => {
    for (let i = 1; i < RANKS.length; i++) {
      const { at, title } = RANKS[i];
      const below = RANKS[i - 1].title;
      expect(rankFor(at - 1).title).toBe(below);
      expect(rankFor(at).title).toBe(title);
      expect(rankFor(at + 1).title).toBe(title);
    }
  });

  it('points at the next tier below the top and at null on the top tier', () => {
    expect(rankFor(2000).next.title).toBe('Rooftop Royalty');
    expect(rankFor(2500).next.title).toBe('Rooftop Royalty'); // no longer the ceiling
    expect(rankFor(3499).next.title).toBe('Rooftop Royalty');
    expect(rankFor(8000).next.title).toBe('Whisker Legend');
    // Top tier: `next` is null rather than pointing past the end of the array.
    expect(rankFor(12000).title).toBe('Whisker Legend');
    expect(rankFor(12000).next).toBe(null);
    expect(rankFor(999999).next).toBe(null);
  });

  it('floors at House Cat for zero and for below-zero lifetime points', () => {
    expect(rankFor(0)).toEqual({ title: 'House Cat', next: RANKS[1] });
    expect(rankFor(-1).title).toBe('House Cat'); // current stays RANKS[0] seed
    expect(rankFor(-1).next.title).toBe('Yard Prowler');
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
        walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0 },
        unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
        equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
        area: 'neighborhood', lifetimePoints: 0, bestWalk: 0, friends: {}, petName: null,
        journal: {}, golden: [], streak: { last: null, count: 0 }, kitten: { stage: 0 },
        race: { date: null, area: null, bestMs: null },
        den: { owned: [], placed: {} },
        skills: [], feats: {}, duskWalks: 0, gifts: [], grudges: [],
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
      expect(p.state.walks).toEqual({ neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0 });
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

  it('every slot offers 4-5 choices so no category feels thin', () => {
    for (const slot of ['collar', ...SLOTS]) {
      const count = Object.values(CATALOG.accessories).filter((a) => a.slot === slot).length;
      expect(count, `slot "${slot}" has ${count} items`).toBeGreaterThanOrEqual(4);
      expect(count, `slot "${slot}" has ${count} items`).toBeLessThanOrEqual(5);
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
      expect(p.state.walks).toEqual({ neighborhood: 5, park: 2, seaside: 0, den: 0, docks: 0 });
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

describe('v18 skills/feats save fields', () => {
  it('a fresh save starts with no skills and no feat tallies', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.skills).toEqual([]);
    expect(p.state.feats).toEqual({});
    expect(p.state.version).toBe(4); // additive — no version bump
  });

  it('a v4 payload predating both fields loads losslessly with defaults', () => {
    // The additive-field contract: an old client's save has no `skills` and
    // no `feats` key at all, and must survive untouched apart from gaining
    // the two defaults. This is the v15 precedent (journal/golden/streak/
    // kitten) applied again.
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, points: 120, lifetimePoints: 940, bestWalk: 61,
      walks: { neighborhood: 7, park: 3, seaside: 2, den: 1 },
      unlocked: { cats: ['tabby', 'black'], accessories: ['bell'], areas: ['neighborhood', 'park'] },
      equipped: { cat: 'black', collar: 'bell' },
      journal: { bird: 4 }, golden: ['gm-park-1'], streak: { last: '2026-08-01', count: 5 },
      kitten: { stage: 2 }, race: { date: '2026-08-01', area: 'park', bestMs: 21000 },
      den: { owned: ['rug'], placed: {} },
    }) });
    const p = createProgression(storage);
    expect(p.state.skills).toEqual([]);
    expect(p.state.feats).toEqual({});
    // nothing else disturbed
    expect(p.state.points).toBe(120);
    expect(p.state.lifetimePoints).toBe(940);
    expect(p.state.bestWalk).toBe(61);
    // v18 Task 2.6: 'docks' is recovered with a 0 on a save that predates it —
    // the whole point of iterating the DEFAULT walks keys rather than the payload's.
    expect(p.state.walks).toEqual({ neighborhood: 7, park: 3, seaside: 2, den: 1, docks: 0 });
    expect(p.state.journal).toEqual({ bird: 4 });
    expect(p.state.golden).toEqual(['gm-park-1']);
    expect(p.state.streak).toEqual({ last: '2026-08-01', count: 5 });
    expect(p.state.kitten).toEqual({ stage: 2 });
    expect(p.state.race).toEqual({ date: '2026-08-01', area: 'park', bestMs: 21000 });
    expect(p.state.den).toEqual({ owned: ['rug'], placed: {} });
    expect(p.state.equipped.cat).toBe('black');
  });

  it('does NOT back-fill feat tallies for an existing save', () => {
    // Locked decision: new tallies start at zero. A rich existing save must
    // not be credited with feats it never actually performed — the feats
    // that read pre-existing fields (golden/journal/walks/friends/race) are
    // retroactive on their own, and seeding the rest from lifetimePoints
    // would be a fabrication.
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, points: 5000, lifetimePoints: 50000, bestWalk: 800,
      journal: { bird: 90 }, golden: ['gm-park-1', 'gm-park-2', 'gm-park-3'],
    }) });
    const p = createProgression(storage);
    expect(p.state.feats).toEqual({});
    expect(p.state.skills).toEqual([]);
  });

  it('round-trips skills and feats through a save/reload', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.recordFeat('mischief');
    p.recordFeat('mischief');
    p.recordFeat('gift');
    expect(createProgression(storage).state.feats).toEqual({ mischief: 2, gift: 1 });
  });

  it('keeps known skill ids, drops unknown/non-string ones, and dedupes', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      skills: ['spring-paws', 'nonexistent-id', 'spring-paws', 7, null, {}, 'big-swat'] }) });
    const p = createProgression(storage);
    expect(p.state.skills).toEqual(['spring-paws', 'big-swat']);
  });

  it('drops a non-array skills field wholesale', () => {
    for (const skills of ['<script>alert(1)</script>', 42, null, { 'sea-legs': true }, true]) {
      const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, skills }) });
      expect(createProgression(storage).state.skills).toEqual([]);
    }
  });

  it('caps an over-length skills array at the catalog length', () => {
    // Every real id repeated 40 times: dedupe alone bounds the result, but
    // the result must never exceed the catalog either way.
    const flooded = [];
    for (let i = 0; i < 40; i++) flooded.push(...SKILL_IDS);
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, skills: flooded }) });
    const p = createProgression(storage);
    expect(p.state.skills).toEqual(SKILL_IDS);
    expect(p.state.skills.length).toBeLessThanOrEqual(SKILL_IDS.length);
  });

  it('keeps only known AWARDS keys in feats and drops the rest', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      feats: { mischief: 12, scenic: 4, dragonslaying: 99, points: 500 } }) });
    const p = createProgression(storage);
    expect(p.state.feats).toEqual({ mischief: 12, scenic: 4 });
  });

  it('drops non-numeric, negative, NaN and Infinity feat counts', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      feats: { mischief: '<img src=x onerror=alert(1)>', gift: -5, scenic: null, photo: 3 } }) });
    const p = createProgression(storage);
    // JSON can't carry NaN/Infinity, so those go through the in-memory path.
    expect(p.state.feats).toEqual({ photo: 3 });
    p.replaceFromPayload({ version: 4, feats: { mischief: NaN, gift: Infinity, scenic: 2.7 } });
    expect(p.state.feats).toEqual({ scenic: 2 }); // floored, junk dropped
  });

  it('clamps an absurd feat tally rather than persisting it', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      feats: { mischief: 1e15 } }) });
    expect(createProgression(storage).state.feats.mischief).toBe(1_000_000);
  });

  it('ignores a __proto__ key in a feats payload without polluting Object.prototype', () => {
    const storage = fakeStorage({ 'whisker-walk-save': '{"version":4,"feats":{"__proto__":{"polluted":1},"mischief":3}}' });
    const p = createProgression(storage);
    expect(p.state.feats).toEqual({ mischief: 3 });
    expect(Object.prototype.hasOwnProperty.call(p.state.feats, '__proto__')).toBe(false);
    expect({}.polluted).toBe(undefined);
    expect(Object.getPrototypeOf(p.state.feats)).toBe(Object.prototype);
  });

  it('drops a non-object feats field wholesale', () => {
    for (const feats of ['<script>', 42, null, ['mischief'], true]) {
      const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, feats }) });
      expect(createProgression(storage).state.feats).toEqual({});
    }
  });

  it('recordFeat ignores unknown and non-string types', () => {
    const p = createProgression(fakeStorage());
    p.recordFeat('dragonslaying');
    p.recordFeat('__proto__');
    p.recordFeat(null);
    p.recordFeat(7);
    p.recordFeat(undefined);
    expect(p.state.feats).toEqual({});
    expect({}.polluted).toBe(undefined);
  });

  it('recordFeat stops at the tally ceiling instead of growing without bound', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4,
      feats: { mischief: 1_000_000 } }) });
    const p = createProgression(storage);
    p.recordFeat('mischief');
    expect(p.state.feats.mischief).toBe(1_000_000);
  });

  it('feeds hasSkill so an earned feat unlocks its ability', () => {
    const p = createProgression(fakeStorage());
    expect(hasSkill(p.state, 'sure-claws')).toBe(false);
    for (let i = 0; i < 25; i++) p.recordFeat('mischief');
    expect(hasSkill(p.state, 'sure-claws')).toBe(true);
    expect(hasSkill(p.state, 'big-swat')).toBe(false); // needs 40
  });

  it('reset() clears skills and feats back to empty', () => {
    const p = createProgression(fakeStorage());
    p.recordFeat('mischief');
    p.reset();
    expect(p.state.feats).toEqual({});
    expect(p.state.skills).toEqual([]);
  });
});

// v18 Task 1.4 — the foundation corrections. Two of the twelve feats shipped
// reading a PROXY counter because no faithful source existed; these tests pin
// the real counters that replaced them, and — just as importantly — pin that
// the existing awards those counters ride alongside were NOT changed.
describe('v18 perch/race feat tallies', () => {
  it('accepts the two dedicated tallies that are not AWARDS types', () => {
    const p = createProgression(fakeStorage());
    p.recordFeat('perch');
    p.recordFeat('perch');
    p.recordFeat('race');
    expect(p.state.feats).toEqual({ perch: 2, race: 1 });
  });

  it('keeps the perch tally independent of the scenic award it rides alongside', () => {
    // The interactions.js call site pays awardOnce('scenic', …) AND records
    // 'perch'. The award was deliberately not retyped — 'scenic' still feeds
    // GOAL_POOL's scenic-spots goal — so the two counters must move
    // independently: a scenic viewpoint visit bumps only 'scenic'.
    const p = createProgression(fakeStorage());
    p.recordFeat('scenic');                       // a plain viewpoint visit
    expect(p.state.feats).toEqual({ scenic: 1 });
    expect(hasSkill(p.state, 'spring-paws')).toBe(false);
    p.recordFeat('scenic');                       // and now a vantage perch:
    p.recordFeat('perch');                        // both, as the call site does
    expect(p.state.feats).toEqual({ scenic: 2, perch: 1 });
  });

  it('keeps the race tally independent of the goal award it rides alongside', () => {
    // Same shape: 'goal' is shared with ordinary per-walk goal completions,
    // so three goals in one walk must not unlock Long Zoomies.
    const p = createProgression(fakeStorage());
    for (let i = 0; i < 3; i++) p.recordFeat('goal');
    expect(hasSkill(p.state, 'long-zoomies')).toBe(false);
    for (let i = 0; i < 3; i++) { p.recordFeat('goal'); p.recordFeat('race'); }
    expect(p.state.feats).toEqual({ goal: 6, race: 3 });
    expect(hasSkill(p.state, 'long-zoomies')).toBe(true);
  });

  it('round-trips the two tallies through a save/reload like any other feat', () => {
    // They are not AWARDS keys, so sanitizeFeats has to know about them too —
    // otherwise they would be silently dropped on the next boot.
    const storage = fakeStorage();
    const p = createProgression(storage);
    for (let i = 0; i < 10; i++) p.recordFeat('perch');
    p.recordFeat('race');
    const reloaded = createProgression(storage);
    expect(reloaded.state.feats).toEqual({ perch: 10, race: 1 });
    expect(hasSkill(reloaded.state, 'spring-paws')).toBe(true);
  });

  it('still drops unknown feat types', () => {
    const p = createProgression(fakeStorage());
    p.recordFeat('perching');   // near-miss of the real 'perch' key
    p.recordFeat('races');
    expect(p.state.feats).toEqual({});
  });
});

describe('v18 duskWalks save field', () => {
  it('a fresh save starts at zero and stays version 4', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.duskWalks).toBe(0);
    expect(p.state.version).toBe(4); // additive — no version bump
  });

  it('a v4 payload predating duskWalks loads losslessly with the default', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, points: 120, lifetimePoints: 940, bestWalk: 61,
      walks: { neighborhood: 7, park: 3, seaside: 2, den: 1 },
      unlocked: { cats: ['tabby', 'black'], accessories: ['bell'], areas: ['neighborhood', 'park'] },
      equipped: { cat: 'black', collar: 'bell' },
      journal: { bird: 4 }, golden: ['gm-park-1'], streak: { last: '2026-08-01', count: 5 },
      kitten: { stage: 2 }, race: { date: '2026-08-01', area: 'park', bestMs: 21000 },
      den: { owned: ['rug'], placed: {} }, skills: ['big-swat'], feats: { mischief: 9 },
    }) });
    const p = createProgression(storage);
    expect(p.state.duskWalks).toBe(0);
    // nothing else disturbed by the new field
    expect(p.state.points).toBe(120);
    // v18 Task 2.6: 'docks' is recovered with a 0 on a save that predates it —
    // the whole point of iterating the DEFAULT walks keys rather than the payload's.
    expect(p.state.walks).toEqual({ neighborhood: 7, park: 3, seaside: 2, den: 1, docks: 0 });
    expect(p.state.journal).toEqual({ bird: 4 });
    expect(p.state.golden).toEqual(['gm-park-1']);
    expect(p.state.streak).toEqual({ last: '2026-08-01', count: 5 });
    expect(p.state.kitten).toEqual({ stage: 2 });
    expect(p.state.race).toEqual({ date: '2026-08-01', area: 'park', bestMs: 21000 });
    expect(p.state.den).toEqual({ owned: ['rug'], placed: {} });
    expect(p.state.skills).toEqual(['big-swat']);
    expect(p.state.feats).toEqual({ mischief: 9 });
  });

  it('a save that persisted sea-legs now KEEPS it — the v20 reinstatement', () => {
    // BEHAVIOURAL CHANGE, deliberate. Under v18 this exact payload had
    // 'sea-legs' silently dropped by sanitizeSkills, because the id was not
    // in SKILL_IDS; the ability was descoped (CF-12). v20 put it back in the
    // catalog, so the same save now loads with the id intact and the
    // ability really held. Nobody loses anything: the id was written by a
    // v18 dev build in the first place, and this is the outcome such a save
    // was always going to want.
    //
    // It would also have come back through the predicate half of hasSkill
    // anyway — nine seaside walks clears the feat — so the two halves of the
    // union agree here, which is what makes this a lossless upgrade rather
    // than a regrant of something unearned.
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, points: 88, lifetimePoints: 1200, bestWalk: 44,
      walks: { neighborhood: 3, park: 2, seaside: 9, den: 1 },
      journal: { bird: 2 }, golden: ['gm-park-1'],
      skills: ['spring-paws', 'sea-legs', 'big-swat'],
      feats: { mischief: 41, perch: 12 }, duskWalks: 3,
    }) });
    const p = createProgression(storage);
    // Catalog order, and sea-legs sorts between spring-paws and big-swat
    // exactly where it was written.
    expect(p.state.skills).toEqual(['spring-paws', 'sea-legs', 'big-swat']);
    // Everything else on the save is untouched.
    expect(p.state.points).toBe(88);
    expect(p.state.lifetimePoints).toBe(1200);
    expect(p.state.bestWalk).toBe(44);
    expect(p.state.feats).toEqual({ mischief: 41, perch: 12 });
    expect(p.state.duskWalks).toBe(3);
    expect(p.state.golden).toEqual(['gm-park-1']);
    expect(p.state.walks.seaside).toBe(9);
    expect(unlockedSkills(p.state)).toContain('sea-legs');
    // And it survives a re-save/reload round trip.
    p.recordSkillUnlocks(['charmer']);
    expect(createProgression(storage).state.skills)
      .toEqual(['spring-paws', 'sea-legs', 'charmer', 'big-swat']);
  });

  it('unlocks Sea Legs at the END of the fifth seaside walk, like Night Eyes', () => {
    // Sea Legs' counter is walks.seaside, which completeWalk owns — so, like
    // Night Eyes' duskWalks, it can ONLY complete as a walk ends, never
    // mid-walk. walk.js's endWalk already orders completeWalk BEFORE
    // celebrateNewSkills for exactly that reason, so the fifth seaside walk
    // celebrates at its own end rather than the next one. (The ability
    // itself takes effect from the next walk, because player.setSwim is read
    // once at walk start — the same boundary Long Zoomies sits behind.)
    const p = createProgression(fakeStorage());
    for (let i = 0; i < 4; i++) p.completeWalk('seaside');
    expect(unlockedSkills(p.state)).toEqual([]);
    p.completeWalk('park');   // a different area does not count
    expect(unlockedSkills(p.state)).toEqual([]);
    p.completeWalk('seaside');
    expect(p.state.walks.seaside).toBe(5);
    expect(p.recordSkillUnlocks(unlockedSkills(p.state))).toEqual(['sea-legs']);
  });

  it('unlocks Sea Legs on load for a pre-v18 save that never heard of skills', () => {
    // The retroactive path, end to end through the real loader: a payload
    // with no `skills` field at all — every save written before v18 — whose
    // lifetime walks.seaside tally already clears the feat. The ability is
    // live the instant createProgression returns, with nothing written to
    // state.skills yet, and recordSkillUnlocks is then what persists it and
    // reports it as newly earned (which is what fires the celebration).
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, points: 10, walks: { neighborhood: 12, park: 6, seaside: 5, den: 1 },
    }) });
    const p = createProgression(storage);
    expect(p.state.skills).toEqual([]);            // nothing persisted yet
    expect(hasSkill(p.state, 'sea-legs')).toBe(true); // ...but already earned
    expect(unlockedSkills(p.state)).toEqual(['sea-legs']);
    // The celebration path: recordSkillUnlocks reports it as NEWLY added
    // once, then never again, and it is stored across a reload.
    expect(p.recordSkillUnlocks(unlockedSkills(p.state))).toEqual(['sea-legs']);
    expect(p.recordSkillUnlocks(unlockedSkills(p.state))).toEqual([]);
    expect(createProgression(storage).state.skills).toEqual(['sea-legs']);
    // Four seaside walks does not: the feat is a real bar, not a giveaway.
    const four = createProgression(fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, walks: { neighborhood: 12, park: 6, seaside: 4, den: 1 },
    }) }));
    expect(unlockedSkills(four.state)).toEqual([]);
  });

  it('increments only on a dusk walk, never on an ordinary one', () => {
    const p = createProgression(fakeStorage());
    p.completeWalk('park');                        // pre-v18 call shape
    p.completeWalk('park', {});                    // opts present, no dusk
    p.completeWalk('park', { dusk: false });
    expect(p.state.duskWalks).toBe(0);
    expect(p.state.walks.park).toBe(3);            // walk count still moves
    p.completeWalk('park', { dusk: true });
    p.completeWalk('seaside', { dusk: true });
    expect(p.state.duskWalks).toBe(2);
    expect(p.state.walks).toEqual({ neighborhood: 0, park: 4, seaside: 1, den: 0, docks: 0 });
  });

  it('unlocks Night Eyes on the fifth dusk walk and persists across a reload', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    for (let i = 0; i < 4; i++) p.completeWalk('park', { dusk: true });
    expect(hasSkill(p.state, 'night-eyes')).toBe(false);
    p.completeWalk('park', { dusk: true });
    expect(hasSkill(p.state, 'night-eyes')).toBe(true);
    expect(createProgression(storage).state.duskWalks).toBe(5);
  });

  it('sanitizes a hostile duskWalks value down to zero', () => {
    for (const duskWalks of ['<script>alert(1)</script>', -5, null, true, [], {}, '9']) {
      const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, duskWalks }) });
      expect(createProgression(storage).state.duskWalks).toBe(0);
    }
    // JSON can't carry NaN/Infinity, so those go through the in-memory path.
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, duskWalks: NaN });
    expect(p.state.duskWalks).toBe(0);
    p.replaceFromPayload({ version: 4, duskWalks: Infinity });
    expect(p.state.duskWalks).toBe(0);
    p.replaceFromPayload({ version: 4, duskWalks: 4.9 });
    expect(p.state.duskWalks).toBe(4); // floored
  });

  it('clamps an absurd duskWalks rather than persisting it', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, duskWalks: 1e15 }) });
    const p = createProgression(storage);
    expect(p.state.duskWalks).toBe(100_000);
    // and the cap holds against further increments
    p.completeWalk('park', { dusk: true });
    expect(p.state.duskWalks).toBe(100_000);
  });

  it('reset() clears duskWalks back to zero', () => {
    const p = createProgression(fakeStorage());
    p.completeWalk('park', { dusk: true });
    p.reset();
    expect(p.state.duskWalks).toBe(0);
  });
});

describe('recordSkillUnlocks', () => {
  it('persists newly unlocked ids and returns exactly what it added', () => {
    const p = createProgression(fakeStorage());
    expect(p.recordSkillUnlocks(['sure-claws'])).toEqual(['sure-claws']);
    expect(p.state.skills).toEqual(['sure-claws']);
  });

  it('returns [] and does not duplicate on a second call with the same ids', () => {
    // Task 2.7's unlock celebration fires on the return value, so a repeat
    // call must report nothing new — otherwise it double-fires every walk.
    const p = createProgression(fakeStorage());
    p.recordSkillUnlocks(['sure-claws', 'charmer']);
    expect(p.recordSkillUnlocks(['sure-claws', 'charmer'])).toEqual([]);
    expect(p.state.skills).toEqual(['charmer', 'sure-claws']);
  });

  it('returns only the ids added by THIS call, not everything held', () => {
    const p = createProgression(fakeStorage());
    p.recordSkillUnlocks(['sure-claws']);
    expect(p.recordSkillUnlocks(['sure-claws', 'big-swat'])).toEqual(['big-swat']);
    expect(p.state.skills).toEqual(['sure-claws', 'big-swat']);
  });

  it('dedupes within a single call', () => {
    const p = createProgression(fakeStorage());
    expect(p.recordSkillUnlocks(['far-call', 'far-call', 'far-call'])).toEqual(['far-call']);
    expect(p.state.skills).toEqual(['far-call']);
  });

  it('stores and returns in catalog order regardless of the caller order', () => {
    const p = createProgression(fakeStorage());
    const added = p.recordSkillUnlocks(['big-swat', 'spring-paws', 'charmer']);
    expect(added).toEqual(['spring-paws', 'charmer', 'big-swat']);
    expect(p.state.skills).toEqual(['spring-paws', 'charmer', 'big-swat']);
  });

  it('drops unknown and non-string ids without throwing', () => {
    const p = createProgression(fakeStorage());
    expect(p.recordSkillUnlocks(['not-a-skill', 7, null, {}, '__proto__', 'big-swat'])).toEqual(['big-swat']);
    expect(p.state.skills).toEqual(['big-swat']);
    expect({}.polluted).toBe(undefined);
  });

  it('tolerates a non-array argument', () => {
    const p = createProgression(fakeStorage());
    for (const bad of [undefined, null, 'big-swat', 42, { 'big-swat': true }]) {
      expect(p.recordSkillUnlocks(bad)).toEqual([]);
    }
    expect(p.state.skills).toEqual([]);
  });

  it('never stores more than the catalog holds', () => {
    const p = createProgression(fakeStorage());
    const flooded = [];
    for (let i = 0; i < 40; i++) flooded.push(...SKILL_IDS);
    expect(p.recordSkillUnlocks(flooded)).toEqual(SKILL_IDS);
    expect(p.state.skills).toEqual(SKILL_IDS);
    expect(p.state.skills.length).toBe(SKILL_IDS.length);
  });

  it('persists through a save/reload', () => {
    const storage = fakeStorage();
    createProgression(storage).recordSkillUnlocks(['whisker-sense']);
    expect(createProgression(storage).state.skills).toEqual(['whisker-sense']);
  });

  it('does not write to storage when nothing was added', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.recordSkillUnlocks(['big-swat']);
    const before = storage.dump()['whisker-walk-save'];
    expect(p.recordSkillUnlocks(['big-swat'])).toEqual([]);
    expect(storage.dump()['whisker-walk-save']).toBe(before);
  });

  it('keeps an earned ability even after its predicate stops being satisfied', () => {
    // The whole reason state.skills is stored rather than derived: a later
    // threshold change must never revoke an ability a child already earned.
    const storage = fakeStorage();
    const p = createProgression(storage);
    for (let i = 0; i < 25; i++) p.recordFeat('mischief');
    expect(hasSkill(p.state, 'sure-claws')).toBe(true);
    p.recordSkillUnlocks(unlockedSkills(p.state));
    expect(p.state.skills).toEqual(['sure-claws']);
    // simulate the tally being lost/reset while the unlock stays on record
    p.replaceFromPayload({ version: 4, skills: p.state.skills, feats: {} });
    expect(p.state.feats).toEqual({});
    expect(hasSkill(p.state, 'sure-claws')).toBe(true);
  });
});

// ===========================================================================
// v18 Task 3.2 — Gift Paws' save field.
//
// Additive, exactly like skills/feats/duskWalks before it: SAVE_VERSION stays
// 4, an old payload loads losslessly with the default, and every field is
// sanitized independently against a hostile payload.
// ===========================================================================
describe('v18 gifts save field', () => {
  it('a fresh save starts empty and stays version 4', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.gifts).toEqual([]);
    expect(p.state.version).toBe(4); // additive — no version bump
  });

  it('a v4 payload predating gifts loads losslessly with the default', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, points: 300, lifetimePoints: 1200,
      walks: { neighborhood: 4, park: 4, seaside: 2, den: 1, docks: 1 },
      skills: ['gift-paws'], feats: { gift: 6 }, duskWalks: 5,
    }) });
    const p = createProgression(storage);
    expect(p.state.gifts).toEqual([]);
    expect(p.state.points).toBe(300);
    expect(p.state.feats.gift).toBe(6);
  });

  it('round-trips a real gift through storage', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    expect(p.leaveGift('park', 'fountain')).toBe(true);
    expect(createProgression(storage).state.gifts).toEqual([{ area: 'park', spot: 'fountain' }]);
  });

  // --- hostile payloads --------------------------------------------------

  it('drops a gifts field that is not an array', () => {
    for (const gifts of ['<script>alert(1)</script>', 5, true, null, { area: 'park' }]) {
      const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, gifts }) });
      expect(createProgression(storage).state.gifts).toEqual([]);
    }
  });

  it('drops entries with the wrong types', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, gifts: [
      null, 7, 'park/fountain', [], ['park', 'fountain'],
      { area: 'park' },                       // no spot
      { spot: 'fountain' },                   // no area
      { area: 5, spot: 'fountain' },
      { area: 'park', spot: 5 },
      { area: 'park', spot: '' },
      { area: 'park', spot: 'x'.repeat(41) }, // oversized
    ] });
    expect(p.state.gifts).toEqual([]);
  });

  it('drops an unknown area id — including one that renames itself', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, gifts: [
      { area: 'atlantis', spot: 'fountain' },
      { area: 'den', spot: 'fountain' },        // the den is not a walk area
      { area: '__proto__', spot: 'fountain' },
      { area: 'constructor', spot: 'fountain' },
      { area: 'toString', spot: 'fountain' },
      { area: 'park', spot: 'fountain' },       // the one real entry
    ] });
    expect(p.state.gifts).toEqual([{ area: 'park', spot: 'fountain' }]);
  });

  it('never lets a __proto__ spot id pollute anything', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, gifts: [{ area: 'park', spot: '__proto__' }] });
    // Stored inertly as a plain string on a plain object — it matches no
    // scenic id, so gifts.js renders nothing for it (see gifts.test.js).
    expect(p.state.gifts).toEqual([{ area: 'park', spot: '__proto__' }]);
    expect(Object.prototype.hasOwnProperty.call({}, 'polluted')).toBe(false);
    expect({}.spot).toBeUndefined();
  });

  it('collapses duplicates so one spot can never hold two', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, gifts: [
      { area: 'park', spot: 'fountain' },
      { area: 'park', spot: 'fountain' },
      { area: 'seaside', spot: 'fountain' }, // same spot id, different area: kept
    ] });
    expect(p.state.gifts).toEqual([
      { area: 'park', spot: 'fountain' },
      { area: 'seaside', spot: 'fountain' },
    ]);
  });

  it('caps an over-long list rather than persisting it', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, gifts: Array.from({ length: 500 }, (_, i) => ({
      area: 'park', spot: `spot-${i}`,
    })) });
    expect(p.state.gifts).toHaveLength(8);
    // and the cap holds against further leaves
    expect(p.leaveGift('park', 'one-more')).toBe(false);
    expect(p.state.gifts).toHaveLength(8);
  });

  it('keeps only the two declared fields, never whatever else rode along', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, gifts: [
      { area: 'park', spot: 'fountain', points: 1e9, html: '<img onerror=1>' },
    ] });
    expect(p.state.gifts).toEqual([{ area: 'park', spot: 'fountain' }]);
  });

  // --- the API -----------------------------------------------------------

  it('leaveGift refuses an unknown area, a bad spot, and a repeat', () => {
    const p = createProgression(fakeStorage());
    expect(p.leaveGift('atlantis', 'fountain')).toBe(false);
    expect(p.leaveGift('den', 'fountain')).toBe(false);
    expect(p.leaveGift('park', '')).toBe(false);
    expect(p.leaveGift('park', 'x'.repeat(41))).toBe(false);
    expect(p.leaveGift('park', 5)).toBe(false);
    expect(p.leaveGift(null, 'fountain')).toBe(false);
    expect(p.state.gifts).toEqual([]);
    expect(p.leaveGift('park', 'fountain')).toBe(true);
    expect(p.leaveGift('park', 'fountain')).toBe(false); // one per spot
    expect(p.state.gifts).toHaveLength(1);
  });

  it('giftsIn returns only that area, as copies the caller may keep', () => {
    const p = createProgression(fakeStorage());
    p.leaveGift('park', 'fountain');
    p.leaveGift('seaside', 'pier-end');
    expect(p.giftsIn('park')).toEqual([{ area: 'park', spot: 'fountain' }]);
    expect(p.giftsIn('docks')).toEqual([]);
    expect(p.giftsIn('den')).toEqual([]);
    expect(p.giftsIn(null)).toEqual([]);
    const copy = p.giftsIn('park')[0];
    copy.spot = 'tampered';
    expect(p.state.gifts[0].spot).toBe('fountain');
  });

  it('claimGift removes exactly one, and reports whether it did', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.leaveGift('park', 'fountain');
    p.leaveGift('park', 'meadow');
    expect(p.claimGift('park', 'fountain')).toBe(true);
    expect(p.claimGift('park', 'fountain')).toBe(false); // already found
    expect(p.claimGift('seaside', 'meadow')).toBe(false); // wrong area
    expect(p.state.gifts).toEqual([{ area: 'park', spot: 'meadow' }]);
    // persisted, not just in memory
    expect(createProgression(storage).state.gifts).toEqual([{ area: 'park', spot: 'meadow' }]);
  });

  it('reset() clears stashed gifts', () => {
    const p = createProgression(fakeStorage());
    p.leaveGift('park', 'fountain');
    p.reset();
    expect(p.state.gifts).toEqual([]);
  });
});

// ===========================================================================
// v20 Ruffled Fur — the persisted grudge, and the one permitted deduction.
//
// state.grudges is ADDITIVE, exactly like skills/feats/duskWalks/gifts before
// it: SAVE_VERSION stays 4, an old payload loads losslessly with the default,
// and the field is sanitized independently against a hostile payload.
//
// It follows sanitizeGolden/sanitizeGifts (an array validated per entry and
// capped) rather than sanitizeFeats (an object over a known key vocabulary),
// because the vocabulary here is cat NAMES — 48 of them in straycats.js, and
// not importable from this module without dragging THREE and the cat model
// in. A parallel table rather than a fourth field on state.friends: the
// friends entry shape is asserted with toEqual just above, and a grudge is
// not a friendship.
// ===========================================================================
describe('v20 grudges save field', () => {
  it('a fresh save starts empty and stays version 4', () => {
    const p = createProgression(fakeStorage());
    expect(p.state.grudges).toEqual([]);
    expect(p.state.version).toBe(4); // additive — no version bump
  });

  it('a v4 payload predating grudges loads losslessly with the default', () => {
    const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({
      version: 4, points: 300, lifetimePoints: 1200,
      walks: { neighborhood: 4, park: 4, seaside: 2, den: 1, docks: 1 },
      skills: ['gift-paws'], feats: { gift: 6 }, duskWalks: 5,
      gifts: [{ area: 'park', spot: 'fountain' }],
      friends: { Pickles: { breed: 'tabby', greets: 3, lastWalk: 'walk-1' } },
    }) });
    const p = createProgression(storage);
    expect(p.state.grudges).toEqual([]);
    expect(p.state.points).toBe(300);
    expect(p.state.lifetimePoints).toBe(1200);
    expect(p.state.feats.gift).toBe(6);
    expect(p.state.gifts).toEqual([{ area: 'park', spot: 'fountain' }]);
    expect(p.state.friends.Pickles).toEqual({ breed: 'tabby', greets: 3, lastWalk: 'walk-1' });
  });

  it('round-trips a real grudge through storage', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    expect(p.recordGrudge('Pickles')).toBe(true);
    expect(createProgression(storage).state.grudges).toEqual(['Pickles']);
  });

  it('leaves the friends table alone — a grudge is not a friendship', () => {
    const p = createProgression(fakeStorage());
    p.recordGreet('Pickles', 'tabby', 'walk-1');
    p.recordGrudge('Pickles');
    // The exact three-field shape progression.test.js:480 pins, unwidened.
    expect(p.state.friends.Pickles).toEqual({ breed: 'tabby', greets: 1, lastWalk: 'walk-1' });
    // …and a cat you have never greeted can still be cross with you.
    expect(p.recordGrudge('Waffles')).toBe(true);
    expect(p.state.friends.Waffles).toBeUndefined();
  });

  // --- the three save methods -------------------------------------------

  it('recordGrudge / hasGrudge / forgiveGrudge report whether the save changed', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    expect(p.hasGrudge('Pickles')).toBe(false);
    expect(p.recordGrudge('Pickles')).toBe(true);
    expect(p.hasGrudge('Pickles')).toBe(true);
    expect(p.recordGrudge('Pickles')).toBe(false); // already cross — no double rupture
    expect(p.forgiveGrudge('Pickles')).toBe(true);
    expect(p.forgiveGrudge('Pickles')).toBe(false); // nothing left to forgive
    expect(p.hasGrudge('Pickles')).toBe(false);
    // persisted, not just in memory
    expect(createProgression(storage).state.grudges).toEqual([]);
  });

  it('refuses a name a grudge could never be keyed on', () => {
    const p = createProgression(fakeStorage());
    for (const bad of ['', null, undefined, 7, {}, [], true, 'x'.repeat(25)]) {
      expect(p.recordGrudge(bad)).toBe(false);
      expect(p.hasGrudge(bad)).toBe(false);
      expect(p.forgiveGrudge(bad)).toBe(false);
    }
    expect(p.state.grudges).toEqual([]);
  });

  it('grudgeNames hands back a fresh array', () => {
    const p = createProgression(fakeStorage());
    p.recordGrudge('Pickles');
    const names = p.grudgeNames();
    names.push('Mochi');
    expect(p.state.grudges).toEqual(['Pickles']);
    expect(p.grudgeNames()).toEqual(['Pickles']);
  });

  it('caps the table so it can never outgrow the shipped name list', () => {
    const p = createProgression(fakeStorage());
    for (let i = 0; i < 100; i++) p.recordGrudge(`Cat${i}`);
    expect(p.state.grudges).toHaveLength(64);
    expect(p.recordGrudge('OneMore')).toBe(false);
  });

  it('reset() clears every grudge', () => {
    const p = createProgression(fakeStorage());
    p.recordGrudge('Pickles');
    p.reset();
    expect(p.state.grudges).toEqual([]);
  });

  // --- hostile payloads --------------------------------------------------

  it('drops a grudges field that is not an array', () => {
    for (const grudges of ['<script>alert(1)</script>', 5, true, null, { Pickles: true }]) {
      const storage = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, grudges }) });
      expect(createProgression(storage).state.grudges).toEqual([]);
    }
  });

  it('drops entries with the wrong type, empty or oversized names, and duplicates', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, grudges: [
      'Pickles', 7, null, true, {}, ['Mochi'], '', 'x'.repeat(25), 'Pickles', 'Mochi',
    ] });
    expect(p.state.grudges).toEqual(['Pickles', 'Mochi']);
  });

  it('caps a hostile payload that pads the list', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, grudges: Array.from({ length: 5000 }, (_, i) => `Cat${i}`) });
    expect(p.state.grudges).toHaveLength(64);
  });

  it('never lets a __proto__ entry pollute anything', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, grudges: ['__proto__', 'constructor', 'toString', 'Pickles'] });
    // Stored inertly as plain strings in an ARRAY — nothing from the payload
    // is ever used as an object key, which is what makes this safe by
    // construction rather than by filtering (same rule as sanitizeGifts).
    expect(p.state.grudges).toEqual(['__proto__', 'constructor', 'toString', 'Pickles']);
    expect(Object.prototype.hasOwnProperty.call({}, 'polluted')).toBe(false);
    expect({}.grudges).toBeUndefined();
    // …and they match no shipped stray name, so nothing in the world reads them.
    expect(p.hasGrudge('__proto__')).toBe(true); // it IS in the list, inertly
    expect(p.hasGrudge('polluted')).toBe(false);
  });
});

// ===========================================================================
// D3 — the one place in the codebase permitted to subtract outside buy().
//
// A scuffle deducts state.points ONLY, floored at zero. state.lifetimePoints
// is monotonic and is the sole input to rankFor; three tests above pin
// non-demotion (:147, :285, :789) and a rank must never go backwards.
// ===========================================================================
describe('deductPoints', () => {
  it('takes spendable points and never touches lifetime points', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(50);
    expect(p.deductPoints(5)).toBe(5);
    expect(p.state.points).toBe(45);
    expect(p.state.lifetimePoints).toBe(50); // untouched
  });

  it('floors at zero and reports what it actually took', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(3);
    expect(p.deductPoints(5)).toBe(3); // only 3 were there to take
    expect(p.state.points).toBe(0);
    expect(p.deductPoints(5)).toBe(0); // nothing left — caller skips its toast
    expect(p.state.points).toBe(0);
    expect(p.state.lifetimePoints).toBe(3);
  });

  it('can never demote a rank, however many scuffles a walk holds', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(2000); // 'Mythical Feline'
    const before = rankFor(p.state.lifetimePoints).title;
    for (let i = 0; i < 500; i++) p.deductPoints(5);
    expect(p.state.points).toBe(0);
    expect(p.state.lifetimePoints).toBe(2000);
    expect(rankFor(p.state.lifetimePoints).title).toBe(before);
    expect(rankFor(p.state.lifetimePoints).title).toBe('Mythical Feline');
  });

  it('is a no-op for a zero, negative, or non-numeric amount', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(20);
    for (const bad of [0, -5, -1e9, NaN, Infinity, '5', null, undefined, {}, []]) {
      expect(p.deductPoints(bad)).toBe(0);
    }
    // It is the ONLY method allowed to subtract; it must not be a way to ADD.
    expect(p.state.points).toBe(20);
    expect(p.state.lifetimePoints).toBe(20);
  });

  it('survives a hostile payload that mistyped points', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, points: '9e99', lifetimePoints: 900 });
    expect(p.state.points).toBe(0); // sanitized on load
    expect(p.deductPoints(5)).toBe(0);
    expect(p.state.points).toBe(0);
    expect(rankFor(p.state.lifetimePoints).title).toBe('Neighborhood Legend');
  });

  it('persists the deduction', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.addPoints(50);
    p.deductPoints(5);
    const reloaded = createProgression(storage);
    expect(reloaded.state.points).toBe(45);
    expect(reloaded.state.lifetimePoints).toBe(50);
  });
});
