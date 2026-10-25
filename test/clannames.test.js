import { test, expect } from 'vitest';
import { CAT_NAMES } from '../src/straynames.js';
import { TAME_FEEDS, HEAD_START_MAX } from '../src/colony.js';
import { PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, CLAN_SUFFIX, DENIED_NAMES } from '../src/clanwords.js';
import { prefixFor, warriorSuffixFor, clanRankFor, clanNameOf, clanTitleFor, candidateStarNames } from '../src/clannames.js';
import { validPetName } from '../src/net.js';

test('rank is read off the taming bar, not the feed count', () => {
  expect(clanRankFor({ have: 0, tamed: false })).toBe('kit');
  expect(clanRankFor({ have: 1, tamed: false })).toBe('kit');
  expect(clanRankFor({ have: 2, tamed: false })).toBe('apprentice');
  expect(clanRankFor({ have: 5, tamed: false })).toBe('apprentice');
  // One below a full bar is still an apprentice: together with the next line
  // this pins the mirrored WARRIOR_AT to TAME_FEEDS in both directions.
  expect(clanRankFor({ have: TAME_FEEDS - 1, tamed: false })).toBe('apprentice');
  expect(clanRankFor({ have: TAME_FEEDS, tamed: false })).toBe('warrior');
  expect(clanRankFor({ have: TAME_FEEDS, tamed: true })).toBe('warrior');
});

// headStartFor gives a cat you already know up to HEAD_START_MAX of the bar,
// so a familiar cat is never a kit. That is correct and is the point.
test('a cat with a full head start is already an apprentice', () => {
  expect(clanRankFor({ have: HEAD_START_MAX, tamed: false })).toBe('apprentice');
});

test('the 48 shipped names give 48 distinct clan names', () => {
  const tamed = CAT_NAMES.map((n) => clanNameOf(n, { have: 6, tamed: true }));
  expect(new Set(tamed).size).toBe(CAT_NAMES.length);
});

test('no warrior name is a published character name', () => {
  for (const p of PREFIXES) for (const s of WARRIOR_SUFFIXES) {
    expect(DENIED_NAMES.has(p + s)).toBe(false);
  }
});

test('a clan name is stable and changes only its suffix as the cat rises', () => {
  const kit = clanNameOf('Pickles', { have: 0, tamed: false });
  const paw = clanNameOf('Pickles', { have: 3, tamed: false });
  const war = clanNameOf('Pickles', { have: 6, tamed: true });
  const p = prefixFor('Pickles');
  for (const n of [kit, paw, war]) expect(n.startsWith(p)).toBe(true);
  expect(kit.endsWith(RANK_SUFFIX.kit)).toBe(true);
  expect(paw.endsWith(RANK_SUFFIX.apprentice)).toBe(true);
  expect(new Set([kit, paw, war]).size).toBe(3);
  expect(clanNameOf('Pickles', { have: 6, tamed: true })).toBe(war);
});

// Review Focus 1 — a cat must never become nameless.
test.each([null, undefined, '', 42, {}, 'NotInAnyPool', '__proto__'])(
  'an unknown stored name falls back rather than vanishing: %p', (bad) => {
    const out = clanNameOf(bad, { have: 6, tamed: true });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

test('a stored name that is a non-empty string falls back to itself', () => {
  expect(clanNameOf('NotInAnyPool', { have: 6, tamed: true })).toBe('NotInAnyPool');
});

test.each([null, undefined, '', 42, {}])('prefixFor is total over junk: %p', (bad) => {
  expect(prefixFor(bad)).toBeNull();
});

test.each([null, undefined, '', 42, {}])('warriorSuffixFor is total over junk: %p', (bad) => {
  expect(WARRIOR_SUFFIXES).toContain(warriorSuffixFor(bad));
});

test('a malformed progress object reads as a kit rather than throwing', () => {
  for (const bad of [null, undefined, {}, { have: NaN }, { have: -1 }, { have: '6' }]) {
    expect(clanRankFor(bad)).toBe('kit');
  }
});

test('clanTitleFor is stable per seed and always ends in the clan suffix', () => {
  const a = clanTitleFor('player-abc12345');
  expect(a).toBe(clanTitleFor('player-abc12345'));
  expect(a.endsWith(CLAN_SUFFIX)).toBe(true);
  expect(clanTitleFor('player-abc12345')).not.toBe(clanTitleFor('player-zzz99999'));
});

test.each([null, undefined, '', 42, {}])('clanTitleFor is total over junk: %p', (bad) => {
  expect(PREFIXES.some((p) => clanTitleFor(bad) === p + CLAN_SUFFIX)).toBe(true);
});

test('three distinct leader names, all usable as a pet name', () => {
  const c = candidateStarNames('player-abc12345', 3);
  expect(c).toHaveLength(3);
  expect(new Set(c).size).toBe(3);
  for (const n of c) {
    expect(n.endsWith(RANK_SUFFIX.leader)).toBe(true);
    expect(validPetName(n)).toBe(true);
    expect(DENIED_NAMES.has(n)).toBe(false);
  }
});

test('the same seed offers the same three names', () => {
  expect(candidateStarNames('player-abc12345')).toEqual(candidateStarNames('player-abc12345'));
});

test.each([null, undefined, '', 42])('a junk seed still offers usable names: %p', (bad) => {
  const c = candidateStarNames(bad);
  expect(c).toHaveLength(3);
  for (const n of c) expect(validPetName(n)).toBe(true);
});

test('asking for more names than the pools can make returns what it can, all distinct', () => {
  const c = candidateStarNames('player-abc12345', 9999);
  expect(new Set(c).size).toBe(c.length);
  expect(c.length).toBeGreaterThan(0);
});
