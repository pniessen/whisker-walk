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
  it('has the twelve shipped abilities across four families', () => {
    // Twelve — the spec's full set. Sea Legs was descoped in v18 (CF-12,
    // "water is already a walk-over surface, so swimming is a downgrade")
    // and reinstated in v20 once water went solid. It sits in TRAVERSAL, not
    // the spec's mischief: it changes where the cat can go and how fast it
    // gets there, which is what the other three traversal abilities do.
    expect(SKILLS).toHaveLength(12);
    expect(SKILL_IDS).toEqual([
      'spring-paws', 'long-zoomies', 'fence-runner', 'sea-legs',
      'twitchy-nose', 'night-eyes', 'whisker-sense',
      'charmer', 'far-call', 'gift-paws',
      'sure-claws', 'big-swat',
    ]);
    expect(SKILL_FAMILIES.map((f) => f.id)).toEqual(['traversal', 'senses', 'social', 'mischief']);
  });

  it('carries Sea Legs as a real, reachable traversal ability', () => {
    // The reinstatement, asserted as the exact inverse of the descope
    // assertions it replaces: the id is in the catalog, skillProgress
    // answers for it instead of returning null, and seaside walks unlock it.
    const entry = SKILLS.find((s) => s.id === 'sea-legs');
    expect(entry.family).toBe('traversal');
    expect(entry.name).toBe('Sea Legs');
    expect(skillProgress({ walks: { seaside: 99 } }, 'sea-legs')).toEqual({ have: 99, need: 5 });
    expect(hasSkill({ walks: { seaside: 500 } }, 'sea-legs')).toBe(true);
    // ...and it is the ONLY thing a pile of walk counts unlocks: no other
    // predicate in the catalog reads state.walks.
    expect(unlockedSkills({ walks: { neighborhood: 99, park: 99, seaside: 99, den: 99, docks: 99 } }))
      .toEqual(['sea-legs']);
  });

  it('leaves mischief with exactly two abilities', () => {
    // Mischief shipped at two in v18 because Sea Legs was cut from it, and
    // stays at two now that it came back under Traversal instead. The Skills
    // tab still renders a two-card section for it.
    expect(SKILLS.filter((s) => s.family === 'mischief').map((s) => s.id))
      .toEqual(['sure-claws', 'big-swat']);
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

  it('gives every family at least two abilities, and none is degenerate', () => {
    // Three per family was the spec's shape. The v18 Sea Legs descope left
    // mischief with two, and the v20 reinstatement put Sea Legs back under
    // traversal rather than mischief, so the catalog is 4/3/3/2. What the
    // Skills tab actually needs is only that no section is empty or a lone
    // card, so that is what is asserted, alongside the exact shape.
    const sizes = SKILL_FAMILIES.map((f) => SKILLS.filter((s) => s.family === f.id).length);
    expect(sizes).toEqual([4, 3, 3, 2]);
    for (const n of sizes) expect(n).toBeGreaterThanOrEqual(2);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(SKILLS.length); // no orphan family
  });

  it('uses unique ids', () => {
    expect(new Set(SKILL_IDS).size).toBe(SKILL_IDS.length);
  });
});

describe('feat predicates at their boundaries', () => {
  // Traversal --------------------------------------------------------------
  it('Spring Paws needs 10 vantage perches (feats.perch)', () => {
    expectBoundary('spring-paws', featState('perch'));
  });

  it('Fence Runner needs 25 vantage perches (feats.perch)', () => {
    expectBoundary('fence-runner', featState('perch'));
  });

  // Task 1.4: the perch tally is DEDICATED. feats.scenic is paid by the same
  // interactions.js call site (the award was left untouched so GOAL_POOL's
  // scenic-spots goal keeps working), but it also counts plain viewpoint
  // visits — so it must not advance either climbing ability on its own.
  it('does not let scenic-spot visits unlock the two climbing abilities', () => {
    expect(hasSkill({ feats: { scenic: 999 } }, 'spring-paws')).toBe(false);
    expect(hasSkill({ feats: { scenic: 999 } }, 'fence-runner')).toBe(false);
    expect(skillProgress({ feats: { scenic: 999, perch: 3 } }, 'spring-paws')).toEqual({ have: 3, need: 10 });
  });

  it('Sea Legs needs 5 seaside walks (walks.seaside)', () => {
    expectBoundary('sea-legs', (n) => ({ walks: { seaside: n } }));
    // Pinned as literals too, not just via expectBoundary's self-read: both
    // the counter and the threshold were re-examined at the v20
    // reinstatement and deliberately kept at the spec's originals.
    expect(skillProgress({}, 'sea-legs')).toEqual({ have: 0, need: 5 });
    expect(SKILLS.find((s) => s.id === 'sea-legs').feat).toBe('Complete 5 seaside walks');
  });

  // The feat is SEASIDE walks, not "walks in an area that has water" —
  // three areas hold water now (park pond, seaside sea, Docks canal) and
  // summing them was the rejected alternative, so no other area's tally may
  // advance this bar, alone or in combination.
  it('does not let park, docks or den walks unlock Sea Legs', () => {
    expect(hasSkill({ walks: { park: 999, docks: 999, den: 999, neighborhood: 999 } }, 'sea-legs')).toBe(false);
    expect(skillProgress({ walks: { park: 99, seaside: 2, docks: 99 } }, 'sea-legs')).toEqual({ have: 2, need: 5 });
  });

  it('Long Zoomies needs 3 race finishes (feats.race)', () => {
    expectBoundary('long-zoomies', featState('race'));
    expect(skillProgress({}, 'long-zoomies')).toEqual({ have: 0, need: 3 });
  });

  // The race pays awardOnce('goal', 'race-done') and that award was left
  // unchanged, but 'goal' is shared with the three ordinary per-walk goal
  // completions — feats.goal hits 3 in one normal walk, so it must not be
  // able to hand this ability out for free. Nor may state.race.bestMs, the
  // have-you-ever-finished proxy this predicate used to read.
  it('does not let ordinary goal completions or a race best time unlock Long Zoomies', () => {
    expect(hasSkill({ feats: { goal: 999 } }, 'long-zoomies')).toBe(false);
    expect(hasSkill({ race: { date: '2026-08-18', area: 'park', bestMs: 24310 } }, 'long-zoomies')).toBe(false);
  });

  // Senses -----------------------------------------------------------------
  it('Twitchy Nose needs 20 collectibles (feats.collectible)', () => {
    expectBoundary('twitchy-nose', featState('collectible'));
    // 'treasure' is a different award type and must NOT advance this bar.
    expect(hasSkill({ feats: { treasure: 99 } }, 'twitchy-nose')).toBe(false);
  });

  it('Night Eyes needs 5 completed dusk walks (state.duskWalks)', () => {
    expectBoundary('night-eyes', (n) => ({ duskWalks: n }));
  });

  // Task 1.4: chasing fireflies is not the same as completing dusk walks —
  // journal.firefly was the proxy this predicate used to read, and a player
  // who caught 500 of them on two dusk walks has still done two dusk walks.
  // Plain walks must not count either.
  it('does not let firefly sightings or ordinary walks unlock Night Eyes', () => {
    expect(hasSkill({ journal: { firefly: 500 } }, 'night-eyes')).toBe(false);
    expect(hasSkill({ walks: { neighborhood: 99, park: 99, seaside: 99, den: 99 } }, 'night-eyes')).toBe(false);
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

  it('Gift Paws needs 3 gifts (feats.gift)', () => {
    expectBoundary('gift-paws', featState('gift'));
    // Pinned as a literal, not just via expectBoundary's self-read: lowered
    // from 5 in Task 4.0 because giving requires the ability, so the only
    // pre-unlock source is a best-friend stray's 0.3 roll (see skills.js).
    expect(skillProgress({}, 'gift-paws').need).toBe(3);
    expect(hasSkill({ feats: { gift: 3 } }, 'gift-paws')).toBe(true);
  });

  it('states the Gift Paws feat honestly on the card', () => {
    // The displayed text must say what the predicate counts, or the number
    // on the card drifts from the number that unlocks it.
    const card = SKILLS.find((s) => s.id === 'gift-paws');
    expect(card.feat).toBe('Give or receive 3 gifts');
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
    expect(hasSkill({ skills: ['big-swat'] }, 'big-swat')).toBe(true);
    expect(unlockedSkills({ skills: ['big-swat'] })).toEqual(['big-swat']);
  });

  it('unlocks from the predicate alone, with no persisted skills array', () => {
    expect(unlockedSkills({ feats: { mischief: 40 } })).toEqual(['sure-claws', 'big-swat']);
  });

  it('a persisted sea-legs is a genuine unlock again, not an inert id', () => {
    // The exact inverse of the v18 assertion this replaces. A save written
    // by a v18 dev build carrying 'sea-legs' had the id silently dropped by
    // sanitizeSkills; from v20 it is a known id, so it survives the load and
    // the ability it names is really held.
    expect(hasSkill({ skills: ['sea-legs'] }, 'sea-legs')).toBe(true);
    expect(unlockedSkills({ skills: ['sea-legs'] })).toEqual(['sea-legs']);
  });

  it('hands Sea Legs to an existing 5-seaside-walk save the instant it loads', () => {
    // THE point of keeping walks.seaside as the counter: it is a lifetime
    // tally that predates v18, so no back-fill is needed and no new walk is
    // required. hasSkill's predicate half fires before anything has written
    // state.skills — this is a save straight out of localStorage, `skills`
    // absent entirely, exactly as a pre-v18 payload looks.
    const oldSave = { walks: { neighborhood: 12, park: 6, seaside: 5, den: 1 }, feats: {}, golden: [] };
    expect(oldSave.skills).toBe(undefined);
    expect(hasSkill(oldSave, 'sea-legs')).toBe(true);
    // ...and it is the only thing that save unlocks, so the celebration it
    // eventually fires names exactly one ability.
    expect(unlockedSkills(oldSave)).toEqual(['sea-legs']);
    // Four seaside walks is still four seaside walks.
    expect(hasSkill({ walks: { seaside: 4 } }, 'sea-legs')).toBe(false);
  });

  it('unions persisted and predicate-satisfied ids, in catalog order', () => {
    // The persisted id sorts into the MIDDLE of the derived pair, so this
    // pins catalog order rather than mere concatenation.
    const state = { skills: ['far-call'], feats: { mischief: 25 }, golden: ['gm-park-1', 'gm-park-2', 'gm-park-3'] };
    expect(unlockedSkills(state)).toEqual(['whisker-sense', 'far-call', 'sure-claws']);
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
    { skills: 'big-swat' },
    { skills: { 'big-swat': true } },
    // NOTE: `{ skills: ['sea-legs'] }` used to live here, asserting that the
    // descoped id was inert. It is a REAL catalog id again (v20), so it is
    // now a legitimate unlock and belongs nowhere near a junk list — see
    // "a persisted sea-legs is a genuine unlock again" below, which asserts
    // the new behaviour explicitly rather than leaving the case deleted.
    { duskWalks: '9' },
    { duskWalks: NaN },
    { duskWalks: Infinity },
    { duskWalks: -1 },
    { duskWalks: null },
    { duskWalks: { valueOf: () => 99 } },
    { feats: { perch: '99', race: '99' } },
    { feats: { perch: -99, race: NaN } },
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
    const perchFeats = Object.create({ perch: 999 });
    expect(hasSkill({ feats: perchFeats }, 'spring-paws')).toBe(false);
    // state.duskWalks is a TOP-LEVEL field, so the poisoned prototype here
    // is on the state object itself rather than on a nested tally bag.
    const state = Object.create({ duskWalks: 999 });
    expect(hasSkill(state, 'night-eyes')).toBe(false);
    // state.walks is a nested tally bag like feats, so Sea Legs takes the
    // same guard.
    const walks = Object.create({ seaside: 999 });
    expect(hasSkill({ walks }, 'sea-legs')).toBe(false);
    expect(skillProgress({ walks }, 'sea-legs')).toEqual({ have: 0, need: 5 });
  });

  it('handles a JSON-parsed __proto__ payload without unlocking', () => {
    const state = JSON.parse('{"feats":{"__proto__":{"mischief":999}},"skills":["__proto__"]}');
    expect(unlockedSkills(state)).toEqual([]);
    expect(hasSkill(state, 'sure-claws')).toBe(false);
    expect({}.mischief).toBe(undefined); // no global pollution either
  });
});
