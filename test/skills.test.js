import { describe, it, expect } from 'vitest';
import { SKILLS, SKILL_IDS, SKILL_FAMILIES, hasSkill, unlockedSkills, skillProgress } from '../src/skills.js';

// Build the minimal save shape a single predicate needs. Everything else is
// left absent on purpose — a predicate must not care about fields it doesn't
// read, and a save missing them entirely is exactly what an old payload looks
// like.
function stateWith(patch) {
  return { ...patch };
}

// need-1 / need / need+1 for one ability, given a function that turns a
// tally into a state. Every predicate below is exercised through this so no
// off-by-one can hide in a single skill.
function expectBoundary(id, atCount) {
  const { need } = skillProgress(stateWith({}), id);
  expect(hasSkill(atCount(need - 1), id)).toBe(false);
  expect(hasSkill(atCount(need), id)).toBe(true);
  expect(hasSkill(atCount(need + 1), id)).toBe(true);
  expect(skillProgress(atCount(need - 1), id)).toEqual({ have: need - 1, need });
  expect(skillProgress(atCount(need + 1), id)).toEqual({ have: need + 1, need });
}

const featState = (type) => (n) => ({ feats: { [type]: n } });

describe('skills catalog', () => {
  it('has the twelve abilities from the spec across four families', () => {
    expect(SKILLS).toHaveLength(12);
    expect(SKILL_IDS).toEqual([
      'spring-paws', 'long-zoomies', 'fence-runner',
      'twitchy-nose', 'night-eyes', 'whisker-sense',
      'charmer', 'far-call', 'gift-paws',
      'sure-claws', 'big-swat', 'sea-legs',
    ]);
    expect(SKILL_FAMILIES.map((f) => f.id)).toEqual(['traversal', 'senses', 'social', 'mischief']);
  });

  it('gives every ability a family, display strings, and a progress function', () => {
    const families = new Set(SKILL_FAMILIES.map((f) => f.id));
    for (const s of SKILLS) {
      expect(families.has(s.family)).toBe(true);
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.effect).toBe('string');
      expect(s.effect.length).toBeGreaterThan(0);
      expect(typeof s.feat).toBe('string');
      expect(s.feat.length).toBeGreaterThan(0);
      expect(typeof s.progress).toBe('function');
    }
  });

  it('has three abilities in each family', () => {
    for (const f of SKILL_FAMILIES) {
      expect(SKILLS.filter((s) => s.family === f.id)).toHaveLength(3);
    }
  });

  it('uses unique ids', () => {
    expect(new Set(SKILL_IDS).size).toBe(SKILL_IDS.length);
  });
});

describe('feat predicates at their boundaries', () => {
  // Traversal --------------------------------------------------------------
  it('Spring Paws needs 10 vantage perches (feats.scenic)', () => {
    expectBoundary('spring-paws', featState('scenic'));
  });

  it('Fence Runner needs 25 vantage perches (feats.scenic)', () => {
    expectBoundary('fence-runner', featState('scenic'));
  });

  it('Long Zoomies unlocks on a finished daily race (state.race.bestMs)', () => {
    // Deviation from "3 times" — see the comment on the catalog entry: no
    // lifetime race counter exists, so bestMs is a have-you-ever-finished
    // flag with need 1.
    expect(skillProgress({}, 'long-zoomies')).toEqual({ have: 0, need: 1 });
    expect(hasSkill({ race: { date: null, area: null, bestMs: null } }, 'long-zoomies')).toBe(false);
    expect(hasSkill({ race: { date: '2026-08-18', area: 'park', bestMs: 0 } }, 'long-zoomies')).toBe(false);
    expect(hasSkill({ race: { date: '2026-08-18', area: 'park', bestMs: 24310 } }, 'long-zoomies')).toBe(true);
  });

  // Senses -----------------------------------------------------------------
  it('Twitchy Nose needs 20 collectibles (feats.collectible)', () => {
    expectBoundary('twitchy-nose', featState('collectible'));
    // 'treasure' is a different award type and must NOT advance this bar.
    expect(hasSkill({ feats: { treasure: 99 } }, 'twitchy-nose')).toBe(false);
  });

  it('Night Eyes needs 10 fireflies (state.journal.firefly)', () => {
    expectBoundary('night-eyes', (n) => ({ journal: { firefly: n } }));
    // Another critter must not count toward it.
    expect(hasSkill({ journal: { bird: 999 } }, 'night-eyes')).toBe(false);
  });

  it('Whisker Sense needs 3 golden mice (state.golden)', () => {
    expectBoundary('whisker-sense', (n) => ({ golden: Array.from({ length: n }, (_, i) => `gm-park-${i + 1}`) }));
  });

  // Social -----------------------------------------------------------------
  it('Charmer needs 5 cats at the ♥ friend rung (3+ greets)', () => {
    const befriended = (n) => ({
      friends: Object.fromEntries(Array.from({ length: n }, (_, i) => [`cat${i}`, { breed: 'tabby', greets: 3, lastWalk: null }])),
    });
    expect(hasSkill(befriended(4), 'charmer')).toBe(false);
    expect(hasSkill(befriended(5), 'charmer')).toBe(true);
    expect(hasSkill(befriended(6), 'charmer')).toBe(true);
    // Cats only "met" (1–2 greets) do not count, however many there are.
    const metOnly = {
      friends: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`cat${i}`, { breed: 'tabby', greets: 2, lastWalk: null }])),
    };
    expect(hasSkill(metOnly, 'charmer')).toBe(false);
    expect(skillProgress(metOnly, 'charmer')).toEqual({ have: 0, need: 5 });
  });

  it('Far Call needs 30 lifetime greets summed across state.friends', () => {
    const greets = (n) => ({ friends: { a: { greets: n - 1 }, b: { greets: 1 } } });
    expect(hasSkill(greets(29), 'far-call')).toBe(false);
    expect(hasSkill(greets(30), 'far-call')).toBe(true);
    expect(hasSkill(greets(31), 'far-call')).toBe(true);
    expect(skillProgress(greets(30), 'far-call')).toEqual({ have: 30, need: 30 });
  });

  it('Gift Paws needs 5 gifts (feats.gift)', () => {
    expectBoundary('gift-paws', featState('gift'));
  });

  // Mischief ---------------------------------------------------------------
  it('Sure Claws needs 25 tip-overs (feats.mischief)', () => {
    expectBoundary('sure-claws', featState('mischief'));
  });

  it('Big Swat needs 40 tip-overs (feats.mischief)', () => {
    expectBoundary('big-swat', featState('mischief'));
    // The two mischief abilities share one counter at different thresholds.
    expect(hasSkill({ feats: { mischief: 25 } }, 'sure-claws')).toBe(true);
    expect(hasSkill({ feats: { mischief: 25 } }, 'big-swat')).toBe(false);
  });

  it('Sea Legs needs 5 seaside walks (state.walks.seaside)', () => {
    expectBoundary('sea-legs', (n) => ({ walks: { neighborhood: 99, park: 99, seaside: n, den: 99 } }));
    // Walks in another area must not count.
    expect(hasSkill({ walks: { neighborhood: 500, seaside: 0 } }, 'sea-legs')).toBe(false);
  });
});

describe('hasSkill / unlockedSkills', () => {
  it('returns false for an unknown id and never throws', () => {
    expect(hasSkill({}, 'nope')).toBe(false);
    expect(hasSkill({}, null)).toBe(false);
    expect(hasSkill({}, undefined)).toBe(false);
    expect(hasSkill({}, '__proto__')).toBe(false);
    expect(hasSkill({}, 'constructor')).toBe(false);
    expect(skillProgress({}, 'nope')).toBe(null);
  });

  it('honours a persisted skill even when its predicate is not satisfied', () => {
    // The spec stores unlocked ids rather than deriving them precisely so a
    // later threshold change can never revoke an ability already earned.
    expect(hasSkill({ skills: ['sea-legs'] }, 'sea-legs')).toBe(true);
    expect(unlockedSkills({ skills: ['sea-legs'] })).toEqual(['sea-legs']);
  });

  it('unlocks from the predicate alone, with no persisted skills array', () => {
    expect(unlockedSkills({ feats: { mischief: 40 } })).toEqual(['sure-claws', 'big-swat']);
  });

  it('unions persisted and predicate-satisfied ids, in catalog order', () => {
    const state = { skills: ['sea-legs'], feats: { mischief: 25 }, golden: ['gm-park-1', 'gm-park-2', 'gm-park-3'] };
    expect(unlockedSkills(state)).toEqual(['whisker-sense', 'sure-claws', 'sea-legs']);
  });

  it('ignores junk entries inside a persisted skills array', () => {
    expect(unlockedSkills({ skills: [7, null, {}, 'not-a-skill'] })).toEqual([]);
  });

  it('returns nothing for a brand-new save', () => {
    expect(unlockedSkills({ walks: { neighborhood: 0, park: 0, seaside: 0, den: 0 }, feats: {}, skills: [] })).toEqual([]);
  });
});

describe('hostile and malformed state', () => {
  // A save can arrive from the cloud `saves` table as opaque jsonb with no
  // server-side shape validation, so every predicate has to survive `state`
  // being any type at all.
  const hostile = [
    undefined, null, {}, 42, 'save', true, [], [1, 2, 3], () => {},
    { feats: '<script>alert(1)</script>', golden: 42, journal: { mouse: 'x' } },
    { feats: null, journal: null, walks: null, friends: null, golden: null, race: null, skills: null },
    { feats: [], journal: [], walks: [], friends: [], race: [] },
    { feats: { mischief: '40' }, journal: { firefly: '10' }, walks: { seaside: '5' } },
    { feats: { mischief: NaN }, journal: { firefly: Infinity }, walks: { seaside: -1 } },
    { friends: 'nope' },
    { friends: { a: 'nope', b: 7, c: null, d: { greets: 'lots' } } },
    { race: 'nope' },
    { race: { bestMs: '1000' } },
    { race: { bestMs: -5 } },
    { skills: 'sea-legs' },
    { skills: { 'sea-legs': true } },
  ];

  it('never throws and never unlocks anything from junk', () => {
    for (const state of hostile) {
      expect(() => unlockedSkills(state)).not.toThrow();
      expect(unlockedSkills(state)).toEqual([]);
      for (const s of SKILLS) {
        expect(hasSkill(state, s.id)).toBe(false);
        const p = skillProgress(state, s.id);
        expect(Number.isFinite(p.have)).toBe(true);
        expect(p.have).toBeGreaterThanOrEqual(0);
        expect(p.need).toBeGreaterThan(0);
      }
    }
  });

  it('ignores tallies inherited from a poisoned prototype', () => {
    // An own '__proto__' key (what JSON.parse produces) is inert, but an
    // object whose prototype actually carries the key must not count either.
    const feats = Object.create({ mischief: 999 });
    expect(hasSkill({ feats }, 'sure-claws')).toBe(false);
    const journal = Object.create({ firefly: 999 });
    expect(hasSkill({ journal }, 'night-eyes')).toBe(false);
    const walks = Object.create({ seaside: 999 });
    expect(hasSkill({ walks }, 'sea-legs')).toBe(false);
  });

  it('handles a JSON-parsed __proto__ payload without unlocking', () => {
    const state = JSON.parse('{"feats":{"__proto__":{"mischief":999}},"skills":["__proto__"]}');
    expect(unlockedSkills(state)).toEqual([]);
    expect(hasSkill(state, 'sure-claws')).toBe(false);
    expect({}.mischief).toBe(undefined); // no global pollution either
  });
});
