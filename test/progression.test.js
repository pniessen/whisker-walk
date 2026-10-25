import { describe, it, test, expect, beforeEach, vi } from 'vitest';
import { createProgression, CATALOG, RANKS, rankFor, asFiniteNonNeg, summarizeSaveForPreview, JOURNAL_TYPES, sanitizeClanRoles, sanitizeClan } from '../src/progression.js';
import { clanTitleFor } from '../src/clannames.js';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';
import { SKILL_IDS, hasSkill, unlockedSkills } from '../src/skills.js';
import { STARTER_ACCESSORIES } from '../src/progression.js';
import { emptyColony, isShy, TAME_FEEDS } from '../src/colony.js';
import { CAT_NAMES } from '../src/straynames.js';
import { pickMedicineCat } from '../src/clanroles.js';

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
        colony: {
          id: null, partner: null, cats: [], feeds: [], trades: [], tradesApplied: [], rewarded: [],
          seen: { feedKeys: [], tamed: [], trades: [], day: null },
        },
        clanRoles: { medicine: null, deputy: null },
        clan: { name: null, adopted: false },
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

// ---------------------------------------------------------------------------
// v21 Stream 2 — the shared colony's save key (Task 2).
// ---------------------------------------------------------------------------
describe('the colony save key', () => {
  const ME = 'aaaaaaaa-1111', SIB = 'bbbbbbbb-2222';
  const SAVE = 'whisker-walk-save';
  const boldName = CAT_NAMES.find((n) => !isShy(n));
  // A storage whose setItem is a spy, so "without writing" can be asserted.
  function spyStorage(initial) {
    const s = fakeStorage(initial);
    const setItem = vi.fn(s.setItem);
    return { ...s, setItem };
  }
  const tameOne = (p, name = boldName, by = ME) => {
    let last;
    for (let i = 0; i < TAME_FEEDS; i++) last = p.feedColonyCat({ name, by, walk: `walk-${100 + i}`, area: 'park', x: 1, z: 2 });
    return last;
  };
  const paired = (cats = [], feeds = [], trades = []) => ({
    id: 'col-1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] }, cats, feeds, trades,
  });

  it('a v20 save loads with an empty colony and SAVE_VERSION 4', () => {
    // A v20-shaped payload: every field v20 wrote, and no `colony` key.
    const v20 = {
      version: 4, points: 42, lifetimePoints: 300, bestWalk: 17,
      walks: { neighborhood: 3, park: 2, seaside: 0, den: 1, docks: 0 },
      unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana', 'tophat'], areas: ['neighborhood', 'park'] },
      equipped: { cat: 'siamese', collar: 'bell', head: 'tophat', face: null, neck: null, body: null, back: null, feet: null },
      area: 'park', friends: { Pickles: { breed: 'tabby', greets: 2, lastWalk: 'walk-9' } }, petName: 'Mittens',
      journal: { bird: 3 }, golden: [], streak: { last: '2026-10-01', count: 2 }, kitten: { stage: 1 },
      race: { date: null, area: null, bestMs: null }, den: { owned: [], placed: {} },
      skills: [], feats: {}, duskWalks: 0, gifts: [], grudges: ['Mochi'],
    };
    const storage = fakeStorage({ [SAVE]: JSON.stringify(v20) });
    const p = createProgression(storage);
    expect(p.state.version).toBe(4);
    expect(p.state.colony).toEqual(emptyColony());
    // ...and everything else came through untouched
    const { colony, clanRoles, clan, ...rest } = p.state;
    expect(clanRoles).toEqual({ medicine: null, deputy: null });
    expect(rest).toEqual(v20);
  });

  it('a fresh save starts with the starter accessories and an empty colony', () => {
    expect(STARTER_ACCESSORIES).toEqual(['bell', 'bandana']);
    const p = createProgression(fakeStorage());
    expect(p.state.unlocked.accessories).toEqual(STARTER_ACCESSORIES);
    expect(p.state.unlocked.accessories).not.toBe(STARTER_ACCESSORIES); // a buy() must not grow the constant
    expect(p.state.colony).toEqual(emptyColony());
    expect(p.colonyMembers()).toBe(1);
  });

  it('feedColonyCat uses greets from BEFORE this walk as the head start', () => {
    const p = createProgression(fakeStorage());
    for (let w = 1; w <= 6; w++) p.recordGreet('Pickles', 'tabby', `walk-${w}`);
    p.recordGreet('Pickles', 'tabby', 'walk-9');
    expect(p.state.friends.Pickles.greets).toBe(7);
    const r = p.feedColonyCat({ name: 'Pickles', by: ME, walk: 'walk-9', area: 'park', x: 0, z: 0 });
    expect(r.result).toBe('ok');
    expect(r.progress.headStart).toBe(3); // six prior greets
    expect(r.tamedNow).toBe(false);
    expect(p.state.colony.feeds).toEqual([{ cat: 'Pickles', by: ME, walk: 'walk-9', head: 3 }]);
    // Where the two readings differ: 2 greets before + 1 on this walk is a
    // head start of 1 (from 2), not 2 (from 3).
    const q = createProgression(fakeStorage());
    for (const w of ['walk-1', 'walk-2', 'walk-9']) q.recordGreet('Mochi', 'tabby', w);
    expect(q.feedColonyCat({ name: 'Mochi', by: ME, walk: 'walk-9', area: 'park', x: 0, z: 0 }).progress.headStart).toBe(1);
    // A cat first met on this very walk is a stranger.
    q.recordGreet('Bean', 'tabby', 'walk-9');
    expect(q.feedColonyCat({ name: 'Bean', by: ME, walk: 'walk-9', area: 'park', x: 0, z: 0 }).progress.headStart).toBe(0);
    // Greets from a past walk, none on this one: all of them count.
    q.recordGreet('Fig', 'tabby', 'walk-1');
    expect(q.feedColonyCat({ name: 'Fig', by: ME, walk: 'walk-9', area: 'park', x: 0, z: 0 }).progress.headStart).toBe(1);
  });

  it('feedColonyCat refuses an unknown name or area without writing', () => {
    const storage = spyStorage();
    const p = createProgression(storage);
    const ok = { name: 'Pickles', by: ME, walk: 'walk-9', area: 'park', x: 0, z: 0 };
    for (const bad of [{ name: 'Zeetoo' }, { name: '__proto__' }, { area: 'moon' }, { area: 'den' },
      { by: '<img>' }, { walk: 'today' }, { x: NaN }]) {
      const r = p.feedColonyCat({ ...ok, ...bad });
      expect(r.result, JSON.stringify(bad)).not.toBe('ok');
      expect(r.tamedNow).toBe(false);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(p.state.colony).toEqual(emptyColony());
    // a refusal for game reasons doesn't write either
    expect(p.feedColonyCat(ok).result).toBe('ok');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(p.feedColonyCat(ok).result).toBe('fed-this-walk');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('a fed and tamed cat persists across a reload, with tamedNow reported once', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    const r = tameOne(p);
    expect(r).toMatchObject({ result: 'ok', tamedNow: true });
    expect(r.progress.tamed).toBe(true);
    const again = createProgression(storage);
    expect(again.state.colony).toEqual(p.state.colony);
    expect(again.state.colony.cats[0]).toMatchObject({ name: boldName, finder: ME, area: 'park', x: 1, z: 2, tamedBy: ME });
    expect(again.feedColonyCat({ name: boldName, by: ME, walk: 'walk-999', area: 'park', x: 0, z: 0 }).result).toBe('tamed');
  });

  // The shy rule holds only while the partner still plays (final review I1):
  // they fed some colony cat `daysAgo` days ago by the real clock.
  const partnerFed = (p, daysAgo) => p.feedColonyCat({ name: boldName, by: SIB,
    walk: `walk-${Date.now() - daysAgo * 24 * 60 * 60 * 1000}`, area: 'park', x: 0, z: 0 });

  it('a paired colony counts two members, and the shy rule applies', () => {
    const p = createProgression(fakeStorage());
    p.setColonyLink({ id: 'col-1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] } });
    expect(p.colonyMembers()).toBe(2);
    expect(p.state.colony).toMatchObject({ id: 'col-1', partner: { playerId: SIB, petName: 'Robin' } });
    expect(partnerFed(p, 1).result).toBe('ok');
    const shy = CAT_NAMES.find(isShy);
    const r = tameOne(p, shy);
    expect(r.tamedNow).toBe(false);
    expect(r.progress.needsSecondFeeder).toBe(true);
    // a hostile link is sanitized on the way in
    p.setColonyLink({ id: '<x>', partner: { playerId: SIB, petName: '<b>', wardrobe: ['laser', 'crown'] } });
    expect(p.state.colony.id).toBe(null);
    expect(p.state.colony.partner).toEqual({ playerId: SIB, petName: 'your partner', wardrobe: ['crown'] });
    expect(p.colonyMembers()).toBe(1);
  });

  it('mergeColonySnapshot merges add-only, sanitizes the remote and persists', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    tameOne(p);
    const remoteCat = { name: boldName, finder: SIB, area: 'park', x: 9, z: 9, wear: 'laser', tamedBy: null, tamedWalk: null };
    p.mergeColonySnapshot(paired([remoteCat, { name: '__proto__', finder: SIB, area: 'park', x: 0, z: 0 }],
      [{ cat: boldName, by: SIB, walk: 'walk-500', head: 0 }, { cat: 'Ghost', by: SIB, walk: 'walk-1', head: 0 }]));
    const c = p.state.colony;
    expect(c.id).toBe('col-1');
    expect(c.cats).toHaveLength(1);
    expect(c.cats[0]).toMatchObject({ finder: SIB, x: 9, z: 9, wear: null, tamedBy: ME });
    expect(c.feeds).toHaveLength(TAME_FEEDS + 1);
    expect(createProgression(storage).state.colony).toEqual(c);
    // garbage changes nothing local
    p.mergeColonySnapshot(paired('no', 7, null));
    expect(p.state.colony.cats).toEqual(c.cats);
    expect(p.state.colony.feeds).toEqual(c.feeds);
  });

  // A failed or garbage pull must never clear the colony link (Task 5).
  it('mergeColonySnapshot is a no-op, with no write, unless the remote is an object with a valid id', () => {
    const storage = spyStorage();
    const p = createProgression(storage);
    tameOne(p);
    p.mergeColonySnapshot(paired());
    const before = JSON.parse(JSON.stringify(p.state.colony));
    expect(before.id).toBe('col-1');
    expect(before.partner).toMatchObject({ playerId: SIB });
    const writes = storage.setItem.mock.calls.length;
    const { id, ...noId } = paired();
    for (const bad of [null, undefined, 'paired', 7, [], [paired()], {}, noId,
      { ...paired(), id: null }, { ...paired(), id: '' }, { ...paired(), id: '<img>' }, { ...paired(), id: 42 },
      { ...paired(), id: 'x'.repeat(65) }]) {
      p.mergeColonySnapshot(bad);
      expect(p.state.colony, JSON.stringify(bad) ?? String(bad)).toEqual(before);
    }
    expect(storage.setItem.mock.calls.length).toBe(writes);
    // a valid id still merges
    p.mergeColonySnapshot({ ...paired(), id: 'col-2' });
    expect(p.state.colony.id).toBe('col-2');
  });

  it('settleColonyTaming tames a bar an unpair left full, persists it, and writes nothing otherwise', () => {
    const storage = spyStorage();
    const p = createProgression(storage);
    const shy = CAT_NAMES.find(isShy);
    p.setColonyLink({ id: 'col-1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] } });
    partnerFed(p, 1);
    expect(tameOne(p, shy).progress.needsSecondFeeder).toBe(true);
    let writes = storage.setItem.mock.calls.length;
    expect(p.settleColonyTaming(ME)).toEqual([]); // still paired: waiting
    expect(storage.setItem.mock.calls.length).toBe(writes);
    p.setColonyLink({ id: null, partner: null });
    expect(p.settleColonyTaming(ME)).toEqual([shy]);
    const shyOf = (q) => q.state.colony.cats.find((c) => c.name === shy);
    expect(shyOf(p)).toMatchObject({ name: shy, tamedBy: ME, tamedWalk: `walk-${100 + TAME_FEEDS - 1}` });
    expect(shyOf(createProgression(storage)).tamedBy).toBe(ME);
    writes = storage.setItem.mock.calls.length;
    expect(p.settleColonyTaming(ME)).toEqual([]);
    expect(storage.setItem.mock.calls.length).toBe(writes);
  });

  it('a shy bar waiting on a partner who stopped playing settles on its own, two weeks on', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.UTC(2026, 9, 25, 12));
      const p = createProgression(fakeStorage());
      p.setColonyLink({ id: 'col-1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] } });
      partnerFed(p, 3);
      const shy = CAT_NAMES.find(isShy);
      expect(tameOne(p, shy).progress.needsSecondFeeder).toBe(true);
      expect(p.settleColonyTaming(ME)).toEqual([]);
      // eleven days later the partner's last feed is fourteen days old: still waiting
      vi.setSystemTime(Date.UTC(2026, 10, 5, 12));
      expect(p.settleColonyTaming(ME)).toEqual([]);
      // a day after that it is fifteen: the rule lapses, still paired
      vi.setSystemTime(Date.UTC(2026, 10, 6, 12));
      expect(p.colonyMembers()).toBe(2);
      expect(p.settleColonyTaming(ME)).toEqual([shy]);
      expect(p.state.colony.cats.find((c) => c.name === shy)).toMatchObject({ tamedBy: ME });
    } finally {
      vi.useRealTimers();
    }
  });

  it('setColonyLink keeps the existing value of an omitted field, and explicit nulls still clear', () => {
    const p = createProgression(fakeStorage());
    tameOne(p);
    p.setColonyLink({ id: 'col-1', partner: { playerId: SIB, petName: 'Robin', wardrobe: [] } });
    // only the partner: the id survives
    p.setColonyLink({ partner: { playerId: SIB, petName: 'Robin', wardrobe: ['crown'] } });
    expect(p.state.colony.id).toBe('col-1');
    expect(p.state.colony.partner.wardrobe).toEqual(['crown']);
    // only the id: the partner survives
    p.setColonyLink({ id: 'col-9' });
    expect(p.state.colony.id).toBe('col-9');
    expect(p.state.colony.partner).toMatchObject({ playerId: SIB });
    // no argument at all changes nothing
    p.setColonyLink();
    expect(p.state.colony).toMatchObject({ id: 'col-9', partner: { playerId: SIB } });
    // explicit nulls unlink, and the cats and feeds stay
    const { cats, feeds } = p.state.colony;
    p.setColonyLink({ id: null, partner: null });
    expect(p.state.colony.id).toBe(null);
    expect(p.state.colony.partner).toBe(null);
    expect(p.state.colony.cats).toEqual(cats);
    expect(p.state.colony.feeds).toEqual(feeds);
    expect(p.colonyMembers()).toBe(1);
  });

  // Review Focus 5
  it('applyColonyTrades applies an accepted trade exactly once, unequips, and never removes a starter', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.addPoints(100);
    expect(p.buy('accessories', 'tophat')).toBe(true);
    p.equipAccessory('tophat');
    expect(p.state.equipped.head).toBe('tophat');
    const trade = { id: 4, from: ME, to: SIB, give: 'tophat', want: 'crown', status: 'accepted' };
    p.mergeColonySnapshot(paired([], [], [trade]));
    expect(p.applyColonyTrades(ME)).toEqual([trade]);
    expect(p.state.unlocked.accessories).not.toContain('tophat');
    expect(p.state.unlocked.accessories).toContain('crown');
    expect(p.state.equipped.head).toBe(null);
    expect(p.state.colony.tradesApplied).toEqual([4]);
    // a second call is a no-op
    expect(p.applyColonyTrades(ME)).toEqual([]);
    expect(p.state.unlocked.accessories.filter((a) => a === 'crown')).toHaveLength(1);
    // ...and so is a reload
    const reloaded = createProgression(storage);
    expect(reloaded.applyColonyTrades(ME)).toEqual([]);
    expect(reloaded.state.unlocked.accessories).toContain('crown');
    expect(reloaded.state.unlocked.accessories).not.toContain('tophat');
    // a trade giving a starter: the starter stays, and stays equipped
    reloaded.equipAccessory('bell');
    const bellTrade = { id: 5, from: ME, to: SIB, give: 'bell', want: 'wizard', status: 'accepted' };
    reloaded.mergeColonySnapshot(paired([], [], [trade, bellTrade]));
    expect(reloaded.applyColonyTrades(ME)).toEqual([bellTrade]);
    expect(reloaded.state.unlocked.accessories).toContain('bell');
    expect(reloaded.state.equipped.collar).toBe('bell');
    expect(reloaded.state.unlocked.accessories).toContain('wizard');
  });

  it('applyColonyTrades reads the other side of a swap, and skips trades that are not accepted or not mine', () => {
    const storage = spyStorage();
    const p = createProgression(storage);
    p.addPoints(100);
    p.buy('accessories', 'crown');
    const mine = { id: 7, from: SIB, to: ME, give: 'tophat', want: 'crown', status: 'accepted' };
    const offered = { id: 8, from: SIB, to: ME, give: 'wizard', want: 'crown', status: 'offered' };
    const others = { id: 9, from: SIB, to: 'cccccccc-3333', give: 'heart', want: 'crown', status: 'accepted' };
    p.mergeColonySnapshot(paired([], [], [others, offered, mine]));
    const writes = storage.setItem.mock.calls.length;
    expect(p.applyColonyTrades(ME)).toEqual([mine]);
    expect(storage.setItem.mock.calls.length).toBe(writes + 1); // all of it in one save
    expect(p.state.unlocked.accessories).toContain('tophat');
    expect(p.state.unlocked.accessories).not.toContain('crown');
    expect(p.state.unlocked.accessories).not.toContain('wizard');
    expect(p.state.colony.tradesApplied).toEqual([7]);
    expect(p.applyColonyTrades(ME)).toEqual([]);
    expect(storage.setItem.mock.calls.length).toBe(writes + 1); // nothing to do: no write
  });

  // Folded-in (Task 11): a cat of mine wearing an item I traded away must not
  // keep wearing something I no longer own.
  it('applyColonyTrades takes a traded-away item off my cats, and only mine', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(200);
    p.buy('accessories', 'tophat');
    p.buy('accessories', 'crown');
    const BOLD_NAMES = CAT_NAMES.filter((n) => !isShy(n));
    const [A1, A2, A3] = BOLD_NAMES;
    tameOne(p, A1);
    tameOne(p, A2);
    tameOne(p, A3);
    expect(p.dressColonyCat(A1, 'tophat', ME)).toBe(true);
    expect(p.dressColonyCat(A2, 'crown', ME)).toBe(true);
    // a cat my sibling found, wearing a tophat on their side
    const theirs = { name: BOLD_NAMES[3], finder: SIB, area: 'park', x: 1, z: 2, wear: 'tophat', tamedBy: null, tamedWalk: null };
    const snap = paired([theirs], [], []);
    p.mergeColonySnapshot(snap);
    const trade = { id: 4, from: ME, to: SIB, give: 'tophat', want: 'wizard', status: 'accepted' };
    p.mergeColonySnapshot({ ...snap, trades: [trade] });
    expect(p.applyColonyTrades(ME)).toEqual([trade]);
    const wear = (n) => p.state.colony.cats.find((c) => c.name === n).wear;
    expect(wear(A1)).toBe(null);          // traded away -> undressed
    expect(wear(A2)).toBe('crown');       // a different item stays
    expect(wear(BOLD_NAMES[3])).toBe('tophat'); // not my cat: not mine to clear
  });

  it('grantColonyRewards unlocks once per milestone and returns the items', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    expect(p.grantColonyRewards()).toEqual([]);
    tameOne(p);
    expect(p.grantColonyRewards()).toEqual(['heart']);
    expect(p.state.unlocked.accessories).toContain('heart');
    expect(p.state.colony.rewarded).toEqual(['tamed-1']);
    expect(p.grantColonyRewards()).toEqual([]);
    expect(createProgression(storage).grantColonyRewards()).toEqual([]);
  });

  it('grantColonyRewards gives the next unowned item, and marks a milestone even when nothing is left to give', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(500);
    for (const id of ['heart', 'bowtie', 'socks', 'crown']) expect(p.buy('accessories', id)).toBe(true);
    const cats = CAT_NAMES.slice(0, 3).map((name, i) => ({ name, finder: SIB, area: 'park', x: 0, z: 0, wear: null, tamedBy: SIB, tamedWalk: `walk-${i + 1}` }));
    p.mergeColonySnapshot(paired(cats));
    expect(p.grantColonyRewards()).toEqual(['wizard']);
    expect(p.state.colony.rewarded).toEqual(['tamed-1', 'tamed-3']);
    expect(p.grantColonyRewards()).toEqual([]);
  });

  it('dressColonyCat only lets the finder dress, and only with an owned item', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.feedColonyCat({ name: boldName, by: ME, walk: 'walk-1', area: 'park', x: 0, z: 0 });
    p.addPoints(100);
    p.buy('accessories', 'tophat');
    expect(p.dressColonyCat(boldName, 'tophat', ME)).toBe(true);
    expect(p.state.colony.cats[0].wear).toBe('tophat');
    expect(createProgression(storage).state.colony.cats[0].wear).toBe('tophat');
    expect(p.dressColonyCat(boldName, 'bell', SIB)).toBe(false); // not the finder
    expect(p.dressColonyCat(boldName, 'crown', ME)).toBe(false); // not owned
    expect(p.dressColonyCat(boldName, 'laser', ME)).toBe(false); // not an item
    expect(p.dressColonyCat('Zeetoo', 'bell', ME)).toBe(false); // not a colony cat
    expect(p.state.colony.cats[0].wear).toBe('tophat');
    expect(p.dressColonyCat(boldName, null, ME)).toBe(true); // null clears
    expect(p.state.colony.cats[0].wear).toBe(null);
  });

  it('markColonySeen records every feed key, tamed name and trade id, plus the day', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    tameOne(p);
    const trade = { id: 3, from: SIB, to: ME, give: 'crown', want: 'tophat', status: 'offered' };
    p.mergeColonySnapshot(paired([], [], [trade]));
    p.markColonySeen('2026-10-24');
    expect(p.state.colony.seen).toEqual({
      feedKeys: p.state.colony.feeds.map((f) => `${f.cat}|${f.by}|${f.walk}`),
      tamed: [boldName], trades: [3], day: '2026-10-24',
    });
    expect(createProgression(storage).state.colony.seen).toEqual(p.state.colony.seen);
    p.markColonySeen('not a day');
    expect(p.state.colony.seen.day).toBe('2026-10-24');
  });

  it('markColonySeen(ymd, shown) marks only what the card showed, merged into what was seen', () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    tameOne(p);
    const keys = p.state.colony.feeds.map((f) => `${f.cat}|${f.by}|${f.walk}`);
    p.markColonySeen('2026-10-23', { feedKeys: [keys[0]], tamed: [], trades: [], day: '2026-10-23' });
    expect(p.state.colony.seen).toEqual({ feedKeys: [keys[0]], tamed: [], trades: [], day: '2026-10-23' });
    // a second dismiss adds to it (and dedupes); the rest stays unread
    p.markColonySeen('2026-10-24', { feedKeys: [keys[0], keys[1]], tamed: [boldName], trades: [9], day: '2026-10-24' });
    expect(p.state.colony.seen).toEqual({ feedKeys: [keys[0], keys[1]], tamed: [boldName], trades: [9], day: '2026-10-24' });
    expect(p.state.colony.seen.feedKeys).not.toContain(keys[keys.length - 1]);
    expect(createProgression(storage).state.colony.seen).toEqual(p.state.colony.seen);
    // a null day keeps the stored one; hostile entries are dropped by the sanitizer
    p.markColonySeen('2026-10-25', { feedKeys: ['junk', 7, keys[2]], tamed: ['__proto__', 'Zeetoo'], trades: [-1, 'x'], day: null });
    expect(p.state.colony.seen.day).toBe('2026-10-24');
    expect(p.state.colony.seen.feedKeys).toEqual([keys[0], keys[1], keys[2]]);
    expect(p.state.colony.seen.tamed).toEqual([boldName]);
    expect(p.state.colony.seen.trades).toEqual([9]);
    // a non-object `shown` falls back to marking everything
    p.markColonySeen('2026-10-26', 'nope');
    expect(p.state.colony.seen.feedKeys).toEqual(keys);
  });

  it('reset() empties the colony and a hostile colony payload is sanitized on load', () => {
    const p = createProgression(fakeStorage());
    tameOne(p);
    p.reset();
    expect(p.state.colony).toEqual(emptyColony());
    p.replaceFromPayload({ version: 4, colony: { id: 'c', cats: [{ name: '__proto__' }], feeds: 'x', rewarded: ['tamed-99'] } });
    expect(p.state.colony).toEqual({ ...emptyColony(), id: 'c' });
  });
});

// v21 Stream 3a Task 6: the two den-role SELECTION verdicts (medicine cat,
// deputy), stored once and never moved.
describe('clan role verdicts', () => {
  const ME = 'me-player-0001';
  const SIS = 'sis-player-0002';
  const SISTER = { playerId: SIS, petName: 'Sis', wardrobe: [] };
  const A = CAT_NAMES[0];
  const B = CAT_NAMES[1];
  const cat = (name, extra = {}) => ({
    name, finder: ME, area: 'park', x: 1, z: 2, wear: null, tamedBy: null, tamedWalk: null, ...extra,
  });
  // One feed per walk stamp so each is distinct; `at` is the first stamp.
  const feed = (c, by, n, at = 1000) =>
    Array.from({ length: n }, (_, i) => ({ cat: c, by, walk: `walk-${at + i}`, head: 0 }));
  // A completes (second feeder) at walk-2000.
  const colonyWithADeputy = () => ({ ...emptyColony(), cats: [cat(A)],
    feeds: [...feed(A, ME, 1, 1000), ...feed(A, SIS, 1, 2000)] });
  // B completes earlier (walk-200), so pickDeputy over this colony would pick B.
  const colonyWithADifferentEarlierDeputy = () => ({ ...emptyColony(), cats: [cat(A), cat(B)],
    feeds: [...colonyWithADeputy().feeds, ...feed(B, ME, 1, 100), ...feed(B, SIS, 1, 200)] });
  // A name whose derived role makes it medicine-eligible.
  const eligible = CAT_NAMES.find((n) => pickMedicineCat([{ name: n }]) === n);

  let storage, p;
  beforeEach(() => {
    storage = fakeStorage();
    p = createProgression(storage);
  });

  it('starts with no clan roles', () => {
    expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
  });

  it('keeps a settled verdict across a reload', () => {
    p.settleClanRoles(colonyWithADeputy());
    const first = p.state.clanRoles.deputy;
    expect(first).not.toBeNull();
    expect(createProgression(storage).state.clanRoles.deputy).toBe(first);
  });

  it.each([null, undefined, 42, 'x', [], { medicine: 42 }, { deputy: {} },
    { medicine: 'x'.repeat(100) }, Object.create({ medicine: 'Pickles' })])(
    'sanitizeClanRoles is total over a hostile payload: %p', (bad) => {
      const out = sanitizeClanRoles(bad);
      expect(Object.keys(out).sort()).toEqual(['deputy', 'medicine']);
      for (const v of Object.values(out)) expect(v === null || typeof v === 'string').toBe(true);
    });

  it('does not leak an inherited verdict', () => {
    expect(sanitizeClanRoles(Object.create({ medicine: 'Pickles' })).medicine).toBeNull();
  });

  it('a name that is not a known cat name is not accepted as a verdict', () => {
    expect(sanitizeClanRoles({ medicine: 'NotACat' }).medicine).toBeNull();
    expect(sanitizeClanRoles({ medicine: A }).medicine).toBe(A);
  });

  it("moves a verdict only to a strictly earlier pick (the partner's history arriving)", () => {
    p.settleClanRoles(colonyWithADeputy());
    expect(p.state.clanRoles.deputy).toBe(A);
    p.settleClanRoles(colonyWithADifferentEarlierDeputy());
    expect(p.state.clanRoles.deputy).toBe(B);
    // A colony where A is again the only completed cat cannot move it back.
    p.settleClanRoles(colonyWithADeputy());
    expect(p.state.clanRoles.deputy).toBe(B);
  });

  it('a later-tamed eligible cat never displaces the stored medicine cat', () => {
    const [first, later] = CAT_NAMES.filter((n) => pickMedicineCat([{ name: n }]) === n);
    const one = { ...emptyColony(), cats: [cat(first, { tamedBy: ME, tamedWalk: 'walk-100' })] };
    p.settleClanRoles(one);
    expect(p.state.clanRoles.medicine).toBe(first);
    p.settleClanRoles({ ...one, cats: [...one.cats, cat(later, { tamedBy: ME, tamedWalk: 'walk-900' })] });
    expect(p.state.clanRoles.medicine).toBe(first);
  });

  it('writes nothing while no cat yet qualifies', () => {
    const solo = { ...emptyColony(), cats: [cat(A)], feeds: feed(A, ME, 3) };
    p.settleClanRoles(solo);
    expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
  });

  it('loads a version-4 save that predates clanRoles, and stays version 4', () => {
    const p2 = createProgression(fakeStorage({
      'whisker-walk-save': JSON.stringify({ version: 4, points: 10 }),
    }));
    expect(p2.state.clanRoles).toEqual({ medicine: null, deputy: null });
    expect(p2.state.version).toBe(4);
  });

  it('keeps clanRoles off the cats', () => {
    p.settleClanRoles(colonyWithADeputy());
    expect(Object.keys(p.state.colony.cats[0] ?? {})).not.toContain('clanRoles');
  });

  // --- R12(a): when progression settles for itself -------------------------
  const tamedEligible = () => ({ ...emptyColony(), cats: [cat(eligible, { tamedBy: ME, tamedWalk: 'walk-5' })],
    feeds: feed(eligible, ME, TAME_FEEDS, 1) });
  const feedUntilTamed = (name) => {
    for (let i = 1; i <= TAME_FEEDS; i++) {
      p.feedColonyCat({ name, by: ME, walk: `walk-${i}`, area: 'park', x: 1, z: 2 });
    }
  };

  it('has a medicine-eligible cat to build the wiring fixtures from', () => {
    expect(eligible).toBeTruthy();
  });

  it('a solo feed that tames a cat settles the medicine cat', () => {
    feedUntilTamed(eligible);
    expect(p.state.colony.cats[0].tamedBy).toBe(ME);
    expect(p.state.clanRoles.medicine).toBe(eligible);
    expect(createProgression(storage).state.clanRoles.medicine).toBe(eligible);
  });

  it('a paired feed settles nothing: the partner has not seen it yet', () => {
    p.setColonyLink({ id: 'col-1', partner: SISTER });
    feedUntilTamed(eligible);
    expect(p.state.colony.feeds.length).toBeGreaterThan(0);
    expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
  });

  it('a merge settles from the shared colony', () => {
    p.setColonyLink({ id: 'col-1', partner: SISTER });
    p.mergeColonySnapshot({ id: 'col-1', partner: SISTER,
      cats: tamedEligible().cats, feeds: tamedEligible().feeds, trades: [] });
    expect(p.state.clanRoles.medicine).toBe(eligible);
    expect(createProgression(storage).state.clanRoles.medicine).toBe(eligible);
  });

  it('settleColonyTaming settles roles too', () => {
    p.setColonyLink({ id: 'col-1', partner: null });
    p.state.colony = { ...p.state.colony, ...tamedEligible(), id: 'col-1' };
    p.settleColonyTaming(ME);
    expect(p.state.clanRoles.medicine).toBe(eligible);
  });

  it('settleColonyTaming on a paired device with no merge settles no roles', () => {
    p.setColonyLink({ id: 'col-1', partner: SISTER });
    feedUntilTamed(eligible);
    p.settleColonyTaming(ME);
    expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
  });

  it('a no-op merge on a paired device re-fills reset verdicts', () => {
    const snap = { id: 'col-1', partner: SISTER, cats: tamedEligible().cats, feeds: tamedEligible().feeds, trades: [] };
    p.setColonyLink({ id: 'col-1', partner: SISTER });
    p.mergeColonySnapshot(snap);
    expect(p.state.clanRoles.medicine).toBe(eligible);
    p.setColonyLink({ id: 'col-2', partner: SISTER });
    expect(p.state.clanRoles.medicine).toBeNull();
    p.mergeColonySnapshot({ ...snap, id: 'col-2' }); // colony already holds everything
    expect(p.state.clanRoles.medicine).toBe(eligible);
    expect(createProgression(storage).state.clanRoles.medicine).toBe(eligible);
  });

  it('a merge with an invalid remote settles nothing', () => {
    p.state.colony = { ...p.state.colony, ...tamedEligible() };
    for (const bad of [null, [], { id: 5, cats: [] }, 'x']) p.mergeColonySnapshot(bad);
    expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
  });

  // --- R12(b): a new pairing re-settles ------------------------------------
  it('a new colony id resets the verdicts, so both devices re-settle', () => {
    p.settleClanRoles(colonyWithADeputy());
    expect(p.state.clanRoles.deputy).toBe(A);
    p.setColonyLink({ id: 'col-9', partner: null });
    expect(p.state.clanRoles).toEqual({ medicine: null, deputy: null });
    expect(createProgression(storage).state.clanRoles).toEqual({ medicine: null, deputy: null });
  });

  it('re-linking to the same id resets nothing', () => {
    p.setColonyLink({ id: 'col-9', partner: null });
    p.settleClanRoles(colonyWithADeputy());
    p.setColonyLink({ id: 'col-9', partner: SISTER });
    p.setColonyLink({ partner: null });
    expect(p.state.clanRoles.deputy).toBe(A);
  });

  it('a settle after the reset fills the verdicts in again', () => {
    p.settleClanRoles(colonyWithADeputy());
    p.setColonyLink({ id: 'col-9', partner: null });
    p.settleClanRoles(colonyWithADifferentEarlierDeputy());
    expect(p.state.clanRoles.deputy).toBe(B);
  });

  it('unlinking is not a new pairing and keeps the verdicts', () => {
    p.setColonyLink({ id: 'col-9', partner: null });
    p.settleClanRoles(colonyWithADeputy());
    p.setColonyLink({ id: null, partner: null });
    expect(p.state.clanRoles.deputy).toBe(A);
  });
});

describe('clan role verdicts converge after two solo histories pair (F3)', () => {
  const AID = 'aaaa-player-0001', BID = 'bbbb-player-0002';
  const COL = 'col-shared-1';
  const member = (id) => ({ playerId: id, petName: 'Pet', wardrobe: [] });
  const ELIGIBLE = CAT_NAMES.filter((n) => pickMedicineCat([{ name: n }]) === n);
  const [XA, XB] = ELIGIBLE; // A's and B's solo medicine cats
  const tamedCat = (name, by, walk) => ({ name, finder: by, area: 'park', x: 1, z: 2, wear: null, tamedBy: by, tamedWalk: walk });
  // A tamed its cat at walk-500, B tamed its cat earlier, at walk-100.
  const aCats = [tamedCat(XA, AID, 'walk-500')];
  const bCats = [tamedCat(XB, BID, 'walk-100')];
  // Deputy: cat P completes (second feeder) at walk-3000; cat Q at walk-2000.
  const [P, Q] = CAT_NAMES.filter((n) => n !== XA && n !== XB);
  const f = (c, by, walk) => ({ cat: c, by, walk, head: 0 });
  const pFeeds = [f(P, AID, 'walk-1000'), f(P, BID, 'walk-3000')];
  const qFeeds = [f(Q, BID, 'walk-1500'), f(Q, AID, 'walk-2000')];
  // Every fed cat is in the snapshot too (an untamed one), as the server sends it.
  const fedCat = (name) => ({ name, finder: AID, area: 'park', x: 1, z: 2, wear: null, tamedBy: null, tamedWalk: null });
  const snap = (cats, feeds) => ({ id: COL, partner: null, trades: [], feeds,
    cats: [...cats, ...[...new Set(feeds.map((x) => x.cat))].map(fedCat)] });

  const soloDevice = (cats) => {
    const p = createProgression(fakeStorage());
    p.state.colony = { ...p.state.colony, cats: cats.map((c) => ({ ...c })) };
    p.settleColonyTaming(cats[0].finder); // solo settle
    return p;
  };

  it.each([['A first', true], ['B first', false]])('%s: both end with identical verdicts', (_, aFirst) => {
    const a = soloDevice(aCats), b = soloDevice(bCats);
    expect(a.state.clanRoles.medicine).toBe(XA);
    expect(b.state.clanRoles.medicine).toBe(XB);
    const first = aFirst ? a : b, second = aFirst ? b : a;
    const firstCats = aFirst ? aCats : bCats, firstFeeds = aFirst ? pFeeds : qFeeds;
    // The first device pairs; the server holds only its own data so far.
    first.setColonyLink({ id: COL, partner: member(aFirst ? BID : AID) });
    first.mergeColonySnapshot(snap(firstCats, firstFeeds));
    // The second device pairs and sees everything.
    second.setColonyLink({ id: COL, partner: member(aFirst ? AID : BID) });
    const all = snap([...aCats, ...bCats], [...pFeeds, ...qFeeds]);
    second.mergeColonySnapshot(all);
    // The first device's next pull sees everything too.
    first.mergeColonySnapshot(all);
    expect(a.state.clanRoles).toEqual(b.state.clanRoles);
    expect(a.state.clanRoles).toEqual({ medicine: XB, deputy: Q });
  });

  it('a verdict never flips back and forth across repeated, partial merges', () => {
    const a = soloDevice(aCats);
    a.setColonyLink({ id: COL, partner: member(BID) });
    const seen = [];
    const record = () => { const r = JSON.stringify(a.state.clanRoles); if (seen.at(-1) !== r) seen.push(r); };
    for (const s of [snap(aCats, pFeeds), snap([...aCats, ...bCats], [...pFeeds, ...qFeeds]),
      snap(aCats, pFeeds), snap(bCats, qFeeds), snap(aCats, pFeeds)]) {
      a.mergeColonySnapshot(s);
      record();
    }
    expect(new Set(seen).size).toBe(seen.length); // no state is ever returned to
    expect(a.state.clanRoles).toEqual({ medicine: XB, deputy: Q });
  });
});

describe('the clan name', () => {
  const ME = 'aaaaaaaa-1111', PARTNER = 'bbbbbbbb-2222';
  let p;
  beforeEach(() => { p = createProgression(fakeStorage()); });

  it('starts with no clan name', () => {
    expect(p.state.clan).toEqual({ name: null, adopted: false });
  });
  it('mints a name for a solo player, with no colony id at all', () => {
    expect(p.state.colony.id).toBeNull();
    p.ensureClanName(ME);
    expect(p.state.clan.name).toBe(clanTitleFor(ME));
    expect(p.state.clan.adopted).toBe(false);
  });
  it('does not change the name when it mints twice', () => {
    p.ensureClanName(ME);
    const first = p.state.clan.name;
    p.ensureClanName(PARTNER);
    expect(p.state.clan.name).toBe(first);
  });
  it("adopts the pair's shared name once, and a re-pair cannot change it again", () => {
    p.ensureClanName(ME);
    p.adoptClanName(clanTitleFor(PARTNER));
    expect(p.state.clan).toEqual({ name: clanTitleFor(PARTNER), adopted: true });
    p.adoptClanName(clanTitleFor('player-cccccccc'));
    expect(p.state.clan.name).toBe(clanTitleFor(PARTNER));
  });
  it('ignores an adopted name that is not a real clan title', () => {
    p.ensureClanName(ME);
    p.adoptClanName('NotAClanName');
    expect(p.state.clan).toEqual({ name: clanTitleFor(ME), adopted: false });
  });
  test.each([null, undefined, 42, 'x', [], { name: 42 }, { name: 'NotAClanName' },
    { name: 'x'.repeat(200) }, Object.create({ name: 'MossClan' })])(
    'sanitizeClan is total over a hostile payload: %p', (bad) => {
      const out = sanitizeClan(bad);
      expect(out.name === null || typeof out.name === 'string').toBe(true);
      expect(typeof out.adopted).toBe('boolean');
      expect(out.name).toBeNull();
    });
  it('never keeps adopted:true without a valid name', () => {
    expect(sanitizeClan({ name: 'bogus', adopted: true })).toEqual({ name: null, adopted: false });
  });
  it.each([undefined, 42, '', null])('ensureClanName(%p) neither throws nor mints', (id) => {
    expect(() => p.ensureClanName(id)).not.toThrow();
    expect(p.state.clan.name).toBeNull();
  });
  it('keeps a valid saved name and a strict adopted boolean', () => {
    expect(sanitizeClan({ name: clanTitleFor(ME), adopted: true })).toEqual({ name: clanTitleFor(ME), adopted: true });
    expect(sanitizeClan({ name: clanTitleFor(ME), adopted: 'yes' }).adopted).toBe(false);
  });
  it('loads a version-4 save that predates clan, and stays version 4', () => {
    const p2 = createProgression(fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, points: 10 }) }));
    expect(p2.state.clan).toEqual({ name: null, adopted: false });
    expect(p2.state.version).toBe(4);
  });
  it('persists the name, and ignores a stale clanJoining key', () => {
    const st = fakeStorage();
    const a = createProgression(st);
    a.ensureClanName(ME);
    const b = createProgression(st);
    expect(b.state.clan.name).toBe(clanTitleFor(ME));
    const c = createProgression(fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, clanJoining: true }) }));
    expect('clanJoining' in c.state).toBe(false);
  });
});
