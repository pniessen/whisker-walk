import { test, expect } from 'vitest';
import { CAT_NAMES, KIT_NAMES } from '../src/straynames.js';
import { TAME_FEEDS, HEAD_START_MAX } from '../src/colony.js';
import { PREFIXES, CAT_PREFIXES, RIVAL_PREFIXES, WARRIOR_SUFFIXES, RANK_SUFFIX, CLAN_SUFFIX, DENIED_NAMES } from '../src/clanwords.js';
import { prefixFor, warriorSuffixFor, clanRankFor, clanNameOf, clanTitleFor, candidateStarNames, colonyRankFor } from '../src/clannames.js';
import { validPetName } from '../src/net.js';
import { seedFromCode } from '../src/rng.js';

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

// Every stored name, strays AND kits (a fed kit grows up into a colony cat),
// must give a distinct warrior name, or two tamed cards would share a name.
test('all 60 stored names give 60 distinct warrior clan names', () => {
  const all = [...CAT_NAMES, ...KIT_NAMES];
  expect(all).toHaveLength(60);
  const tamed = all.map((n) => clanNameOf(n, { have: 6, tamed: true }));
  expect(new Set(tamed).size).toBe(all.length);
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

// Spec §6.5: a fed kit is an apprentice. A colony cat with a kit name floors
// at apprentice; the bare bar-reading rank (used for unfed den kits) does not.
test('colonyRankFor floors a kit name at apprentice, and leaves strays alone', () => {
  const kit = KIT_NAMES[0];
  expect(colonyRankFor(kit, { have: 0, tamed: false })).toBe('apprentice');
  expect(colonyRankFor(kit, { have: 1, tamed: false })).toBe('apprentice');
  expect(colonyRankFor(kit, { have: 3, tamed: false })).toBe('apprentice');
  expect(colonyRankFor(kit, { have: 6, tamed: true })).toBe('warrior');
  expect(colonyRankFor(CAT_NAMES[0], { have: 1, tamed: false })).toBe('kit');
  expect(clanRankFor({ have: 1, tamed: false })).toBe('kit');
  expect(clanNameOf(kit, { have: 1, tamed: false })).toBe(prefixFor(kit) + RANK_SUFFIX.kit);
  expect(clanNameOf(kit, { have: 1, tamed: false }, colonyRankFor(kit, { have: 1 }))).toBe(prefixFor(kit) + RANK_SUFFIX.apprentice);
});

// ---- CAT_PREFIXES: every stored name has its own prefix ----

const ALL_NAMES = [...CAT_NAMES, ...KIT_NAMES];
// The pre-table prefix: the hash over the 22-word PREFIXES list (SALT 27).
const oldPrefix = (n) => PREFIXES[seedFromCode(`${n}|27`) % PREFIXES.length];

test('CAT_PREFIXES has an own entry for every stored name and no other keys', () => {
  expect(Object.isFrozen(CAT_PREFIXES)).toBe(true);
  expect(ALL_NAMES).toHaveLength(60);
  for (const n of ALL_NAMES) expect(Object.hasOwn(CAT_PREFIXES, n)).toBe(true);
  // Same set, and the literal is written in CAT_NAMES then KIT_NAMES order.
  expect(Object.keys(CAT_PREFIXES)).toEqual(ALL_NAMES);
});

test('prefixFor reads the table for every stored name', () => {
  for (const n of ALL_NAMES) expect(prefixFor(n)).toBe(CAT_PREFIXES[n]);
});

test('all 60 names give 180 distinct clan names across every name AND rank', () => {
  const out = [];
  for (const n of ALL_NAMES) {
    out.push(clanNameOf(n, { have: 0 }), clanNameOf(n, { have: 2 }), clanNameOf(n, { tamed: true }));
  }
  expect(out).toHaveLength(180);
  expect(new Set(out).size).toBe(180);
});

test('every CAT_PREFIXES word is short, unique, clean and clear of every other word list', () => {
  const words = Object.values(CAT_PREFIXES);
  expect(new Set(words).size).toBe(60);
  const stored = new Set(ALL_NAMES.map((n) => n.toLowerCase()));
  const rivals = new Set(Object.values(RIVAL_PREFIXES));
  for (const w of words) {
    expect(w).toMatch(/^[A-Z][a-z]{2,7}$/);
    expect(stored.has(w.toLowerCase())).toBe(false);
    expect(rivals.has(w)).toBe(false);
    for (const s of [RANK_SUFFIX.kit, RANK_SUFFIX.apprentice, ...WARRIOR_SUFFIXES]) {
      expect(DENIED_NAMES.has(w + s)).toBe(false);
      expect(validPetName(w + s)).toBe(true);
    }
  }
});

// Seven prefixes were swapped by hand afterwards so no name doubles a letter at
// the join; of those, only Marmalade had kept its old prefix (Lark).
const HAND_SWAPPED = new Set(['Marmalade', 'Meatball', 'Static', 'Pip', 'Beignet', 'Doppler', 'Sprout']);

test('a cat keeps its old prefix unless an earlier name took it (20 kept)', () => {
  const taken = new Set();
  let kept = 0;
  for (const n of ALL_NAMES) {
    const old = oldPrefix(n);
    if (HAND_SWAPPED.has(n)) {
      taken.add(old);
      expect(CAT_PREFIXES[n]).not.toBe(old);
    } else if (!taken.has(old)) {
      taken.add(old);
      kept++;
      expect(CAT_PREFIXES[n]).toBe(old);
    } else {
      expect(CAT_PREFIXES[n]).not.toBe(old);
    }
  }
  expect(kept).toBe(20);
  expect(CAT_PREFIXES.Pickles).toBe('Wren');
  expect(CAT_PREFIXES.Mochi).toBe('Moss');
  expect(CAT_PREFIXES.Peanut).toBe('Clover');
  // Sardine hashed to Moss, which Mochi had already taken.
  expect(oldPrefix('Sardine')).toBe('Moss');
  expect(CAT_PREFIXES.Sardine).not.toBe('Moss');
});

test('prefixFor falls back to the old hash for a name not in the table', () => {
  for (const n of ['NotInAnyPool', 'MossClanSeed', 'player-1234']) {
    expect(Object.hasOwn(CAT_PREFIXES, n)).toBe(false);
    expect(prefixFor(n)).toBe(oldPrefix(n));
    expect(PREFIXES).toContain(prefixFor(n));
  }
});

test("prefixFor('__proto__') hashes rather than reading an inherited value", () => {
  expect(prefixFor('__proto__')).toBe(oldPrefix('__proto__'));
  expect(prefixFor('constructor')).toBe(oldPrefix('constructor'));
  expect(prefixFor('toString')).toBe(oldPrefix('toString'));
});

// No clan name doubles a letter where prefix meets suffix (Larkkit, Tulippaw).
test('no clan name doubles a letter at the join', () => {
  for (const n of [...CAT_NAMES, ...KIT_NAMES]) {
    const p = prefixFor(n);
    for (const prog of [{ have: 0 }, { have: 2 }, { tamed: true }]) {
      // A doubled vowel (Primroseear) reads fine; a doubled consonant does not.
      const join = clanNameOf(n, prog)[p.length];
      if (!'aeiou'.includes(join)) expect(p.at(-1).toLowerCase()).not.toBe(join);
    }
  }
});
