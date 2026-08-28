import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HOSTILE_CHANCE, CHARMER_HOSTILE_CHANCE, hostileChance,
  SCUFFLE_COST, SCUFFLE_FREEZE, SCUFFLE_MAX_PER_WALK,
  GRUDGE_NAME_MAX, isGrudgeName,
  hostileSeed, rollHostile,
  bearsGrudge, grudgeNames, isHostilityImmune, shouldTurnHostile,
  createEnemyWalkLog,
} from '../src/enemies.js';
import { AWARDS } from '../src/discoveries.js';
import { CAT_NAMES, friendRungs } from '../src/straycats.js';

// A save shaped exactly like the one the greet path holds, with only the
// fields the predicate under test reads. Everything else absent on purpose —
// that is what an old payload looks like.
const withGreets = (name, greets, extra = {}) => ({ friends: { [name]: { greets } }, ...extra });

// Every hostile payload the coercion preamble is supposed to survive. Reused
// by every totality test below so a new predicate cannot quietly skip one.
const GARBAGE_STATES = [
  undefined, null, 0, 1, '', 'nope', '<script>alert(1)</script>', true, [], [1, 2],
  {}, { friends: null }, { friends: 'nope' }, { friends: [] }, { friends: { Pickles: 7 } },
  { friends: { Pickles: { greets: '9e99' } } }, { friends: { Pickles: { greets: NaN } } },
  { friends: { Pickles: { greets: Infinity } } }, { friends: { Pickles: { greets: -5 } } },
  { grudges: null }, { grudges: 'Pickles' }, { grudges: 7 }, { grudges: { Pickles: true } },
  { skills: 'charmer' }, { skills: 7 },
];

// --- Fixtures pinned from the real seed construction ------------------------
// A (walkStamp, name) pair that rolls hostile at the base 5% chance, and one
// that does not. Named literally so the roll's two outcomes are both pinned
// by a test rather than left to a lucky sample. 'Baron von Fluff' is also the
// Charmer boundary — hostile at the base 5%, friendly at Charmer's 2.5%.
const HOSTILE_PAIR = ['walk-0', 'Baron von Fluff'];
const FRIENDLY_PAIR = ['walk-0', 'Pickles'];

describe('the hostility chance', () => {
  it('is a small chance that Charmer halves', () => {
    expect(HOSTILE_CHANCE).toBe(0.05);
    expect(CHARMER_HOSTILE_CHANCE).toBe(HOSTILE_CHANCE / 2);
    expect(CHARMER_HOSTILE_CHANCE).toBeLessThan(HOSTILE_CHANCE);
  });

  // spec §5's goal-balance constraint, stated as arithmetic rather than
  // prose: 'greet-cats' needs 3 'friend' awards and a walk spawns 22 strays,
  // so the expected supply must stay far clear of 3.
  it('leaves a 3-friend goal untouched with 22 strays on the map', () => {
    const expectedHostile = 22 * HOSTILE_CHANCE;
    expect(expectedHostile).toBeCloseTo(1.1, 5);      // about one cross cat a walk
    expect(22 - expectedHostile).toBeGreaterThan(3 * 5); // ~21 greetable: 7x the goal
    // Even the coarse/mobile tier's 14 strays keeps a wide margin.
    expect(14 - 14 * HOSTILE_CHANCE).toBeGreaterThan(3 * 4);
  });

  it('reads Charmer off the save rather than a flag the caller has to pass', () => {
    expect(hostileChance({})).toBe(HOSTILE_CHANCE);
    expect(hostileChance({ skills: ['charmer'] })).toBe(CHARMER_HOSTILE_CHANCE);
    // Charmer earned by predicate rather than persisted counts too — five
    // cats at the 'friend' rung is the feat.
    const fiveFriends = { friends: Object.fromEntries(
      ['A', 'B', 'C', 'D', 'E'].map((n) => [n, { greets: 3 }]),
    ) };
    expect(hostileChance(fiveFriends)).toBe(CHARMER_HOSTILE_CHANCE);
  });

  it('never throws on a hostile save', () => {
    for (const s of GARBAGE_STATES) {
      expect(() => hostileChance(s)).not.toThrow();
      expect([HOSTILE_CHANCE, CHARMER_HOSTILE_CHANCE]).toContain(hostileChance(s));
    }
  });
});

// ===========================================================================
// The roll (spec §3). walkRng is the wrong stream — a greet-time roll is
// lazy, conditional and player-paced, exactly the consumer game/walk.js:
// 272-287 forbids — and bare Math.random() is three separate scars (CF-7,
// the firefly desync, the Far Call note). Both are structurally impossible
// here: the module imports neither, which the source scan below pins.
// ===========================================================================
describe('the hostility roll', () => {
  it('draws from neither walkRng nor Math.random', () => {
    const src = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
    // Strip comments — the RNG rule is discussed at length in this file and
    // the discussion must not be what satisfies (or fails) the test.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/walkRng/);
    // The seed is derived from (walkStamp, name) through rng.js instead.
    expect(code).toMatch(/seedFromCode/);
    expect(code).toMatch(/mulberry32/);
  });

  it('is a pure function of (walkStamp, name) — stable within a walk', () => {
    for (let i = 0; i < 5; i++) {
      expect(rollHostile(...HOSTILE_PAIR)).toBe(true);
      expect(rollHostile(...FRIENDLY_PAIR)).toBe(false);
    }
    expect(hostileSeed(...HOSTILE_PAIR)).toBe(hostileSeed(...HOSTILE_PAIR));
  });

  it('pins both outcomes deterministically', () => {
    expect(rollHostile('walk-0', 'Baron von Fluff')).toBe(true);
    expect(rollHostile('walk-0', 'Pickles')).toBe(false);
  });

  it('lets Charmer flip a cat that would otherwise have taken against you', () => {
    expect(rollHostile('walk-0', 'Baron von Fluff', { charmer: false })).toBe(true);
    expect(rollHostile('walk-0', 'Baron von Fluff', { charmer: true })).toBe(false);
  });

  it('produces a uint32 seed that varies per cat and per walk', () => {
    const seed = hostileSeed('walk-1', 'Pickles');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
    expect(hostileSeed('walk-1', 'Pickles')).not.toBe(hostileSeed('walk-1', 'Mochi'));
    expect(hostileSeed('walk-1', 'Pickles')).not.toBe(hostileSeed('walk-2', 'Pickles'));
    // Distinct per cat across the whole shipped name list, so no two strays
    // on one map share an outcome by construction.
    const seeds = new Set(CAT_NAMES.map((n) => hostileSeed('walk-1', n)));
    expect(seeds.size).toBe(CAT_NAMES.length);
  });

  it('never throws on a missing or hostile walkStamp/name', () => {
    // seedFromCode calls .toUpperCase(); an absent stamp must coerce, not throw.
    for (const stamp of [undefined, null, '', 0, 7, {}, [], true]) {
      expect(() => rollHostile(stamp, 'Pickles')).not.toThrow();
      expect(typeof rollHostile(stamp, 'Pickles')).toBe('boolean');
    }
    for (const name of [undefined, null, '', 0, {}, [], true]) {
      expect(() => rollHostile('walk-1', name)).not.toThrow();
    }
  });

  it('lands close to the stated chance across a lifetime of walks', () => {
    // Deterministic: fixed stamps, fixed names, no Math.random anywhere.
    let hostile = 0, charmed = 0, total = 0;
    for (let i = 0; i < 2000; i++) {
      for (const name of CAT_NAMES) {
        total += 1;
        if (rollHostile(`walk-${i}`, name)) hostile += 1;
        if (rollHostile(`walk-${i}`, name, { charmer: true })) charmed += 1;
      }
    }
    expect(hostile / total).toBeGreaterThan(HOSTILE_CHANCE * 0.85);
    expect(hostile / total).toBeLessThan(HOSTILE_CHANCE * 1.15);
    expect(charmed / total).toBeGreaterThan(CHARMER_HOSTILE_CHANCE * 0.85);
    expect(charmed / total).toBeLessThan(CHARMER_HOSTILE_CHANCE * 1.15);
  });

  it('never leaves a 22-stray walk short of the 3 greetable cats a goal needs', () => {
    // The goal-balance invariant, driven rather than argued. 500 walks, the
    // first 22 names of a rotated CAT_NAMES standing in for the shuffle.
    let worst = 0;
    for (let i = 0; i < 500; i++) {
      const map = [...CAT_NAMES.slice(i % CAT_NAMES.length), ...CAT_NAMES].slice(0, 22);
      const hostile = map.filter((n) => rollHostile(`walk-${i}`, n)).length;
      worst = Math.max(worst, hostile);
    }
    expect(22 - worst).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// D5 — a friend never turns on you.
// ===========================================================================
describe('hostility immunity', () => {
  it('is permanent from the friend rung up', () => {
    const { friend, best } = friendRungs(false);
    expect(isHostilityImmune(withGreets('Pickles', friend - 1), 'Pickles')).toBe(false);
    expect(isHostilityImmune(withGreets('Pickles', friend), 'Pickles')).toBe(true);
    expect(isHostilityImmune(withGreets('Pickles', best), 'Pickles')).toBe(true);
    expect(isHostilityImmune(withGreets('Pickles', 999), 'Pickles')).toBe(true);
  });

  it('moves with the rung table when Charmer is earned', () => {
    // Charmer calls a cat a friend on its SECOND nose-touch, so immunity
    // arrives a greet earlier — CF-4's lesson: one table, every reader.
    const two = { friends: { Pickles: { greets: 2 } }, skills: ['charmer'] };
    expect(isHostilityImmune(two, 'Pickles')).toBe(true);
    expect(isHostilityImmune({ friends: { Pickles: { greets: 2 } } }, 'Pickles')).toBe(false);
    expect(friendRungs(true).friend).toBe(2);
  });

  it('does not count an inherited friends entry', () => {
    const friends = Object.create({ Ghostly: { greets: 99 } });
    expect(isHostilityImmune({ friends }, 'Ghostly')).toBe(false);
  });

  it('never throws on a hostile save', () => {
    for (const s of GARBAGE_STATES) {
      expect(() => isHostilityImmune(s, 'Pickles')).not.toThrow();
      expect(isHostilityImmune(s, 'Pickles')).toBe(false);
    }
  });
});

// ===========================================================================
// Grudge predicates.
// ===========================================================================
describe('grudge predicates', () => {
  it('accepts the same name shape sanitizeFriends keys on', () => {
    expect(GRUDGE_NAME_MAX).toBe(24);
    expect(isGrudgeName('Pickles')).toBe(true);
    expect(isGrudgeName('Baron von Fluff')).toBe(true);
    expect(isGrudgeName('x'.repeat(24))).toBe(true);
    expect(isGrudgeName('x'.repeat(25))).toBe(false);
    for (const bad of ['', null, undefined, 7, {}, [], true, Symbol.iterator]) {
      expect(isGrudgeName(bad)).toBe(false);
    }
    // Every shipped stray name is expressible as a grudge.
    for (const n of CAT_NAMES) expect(isGrudgeName(n)).toBe(true);
  });

  it('reads state.grudges and nothing else', () => {
    const cross = { grudges: ['Pickles', 'Mochi'] };
    expect(bearsGrudge(cross, 'Pickles')).toBe(true);
    expect(bearsGrudge(cross, 'Mochi')).toBe(true);
    expect(bearsGrudge(cross, 'Waffles')).toBe(false);
    expect(grudgeNames(cross)).toEqual(['Pickles', 'Mochi']);
  });

  it('hands back a fresh array a caller may mutate', () => {
    const s = { grudges: ['Pickles'] };
    grudgeNames(s).push('Mochi');
    expect(s.grudges).toEqual(['Pickles']);
  });

  it('filters junk entries out of a payload-supplied list', () => {
    const s = { grudges: ['Pickles', 7, null, '', 'x'.repeat(25), {}, ['Mochi'], 'Mochi'] };
    expect(grudgeNames(s)).toEqual(['Pickles', 'Mochi']);
  });

  it('never throws on a hostile save', () => {
    for (const s of GARBAGE_STATES) {
      expect(() => bearsGrudge(s, 'Pickles')).not.toThrow();
      expect(bearsGrudge(s, 'Pickles')).toBe(false);
      expect(() => grudgeNames(s)).not.toThrow();
      expect(grudgeNames(s)).toEqual([]);
    }
  });
});

// ===========================================================================
// The one question the greet path asks.
// ===========================================================================
describe('shouldTurnHostile', () => {
  const stamp = 'walk-0';

  it('turns a cat you barely know when the roll says so', () => {
    expect(shouldTurnHostile({}, 'Baron von Fluff', stamp)).toBe(true);
    expect(shouldTurnHostile({}, 'Pickles', stamp)).toBe(false);
  });

  it('never turns a cat at the friend rung (D5)', () => {
    expect(shouldTurnHostile(withGreets('Baron von Fluff', 3), 'Baron von Fluff', stamp)).toBe(false);
    expect(shouldTurnHostile(withGreets('Baron von Fluff', 2), 'Baron von Fluff', stamp)).toBe(true);
  });

  it('never re-rolls a cat that is already cross', () => {
    expect(shouldTurnHostile({ grudges: ['Baron von Fluff'] }, 'Baron von Fluff', stamp)).toBe(false);
  });

  it('lets Charmer spare a cat that would otherwise have taken against you', () => {
    expect(shouldTurnHostile({ skills: ['charmer'] }, 'Baron von Fluff', stamp)).toBe(false);
  });

  // The payoff beat. The roll is a pure function of (walkStamp, name), so a
  // cat forgiven mid-walk would fall straight back into a grudge on the very
  // next greet without this exemption — the reconciliation would eat itself.
  it('does not re-rupture a cat forgiven earlier in the same walk', () => {
    expect(shouldTurnHostile({}, 'Baron von Fluff', stamp, { forgivenThisWalk: true })).toBe(false);
    // …and the exemption is per-walk scratch state, not persisted: the same
    // cat on the same walk without the flag still rolls hostile.
    expect(shouldTurnHostile({}, 'Baron von Fluff', stamp)).toBe(true);
  });

  it('rejects a name a grudge could never be recorded under', () => {
    for (const bad of ['', null, undefined, 7, {}, 'x'.repeat(25)]) {
      expect(shouldTurnHostile({}, bad, stamp)).toBe(false);
    }
  });

  it('never throws on a hostile save', () => {
    for (const s of GARBAGE_STATES) {
      expect(() => shouldTurnHostile(s, 'Baron von Fluff', stamp)).not.toThrow();
      expect(typeof shouldTurnHostile(s, 'Baron von Fluff', stamp)).toBe('boolean');
    }
  });
});

// ===========================================================================
// The scuffle's cost and rate limit (D3 / D6).
// ===========================================================================
describe('the scuffle', () => {
  it('costs slightly less than the greet that went wrong would have paid', () => {
    expect(SCUFFLE_COST).toBe(5);
    expect(SCUFFLE_COST).toBeLessThan(AWARDS.friend);
  });

  it('reuses the dog scare\'s freeze rather than inventing a duration (D6)', () => {
    expect(SCUFFLE_FREEZE).toBe(1.5);
    // main.js:412 sets the same 1.5 for a dog scare; pinned as a literal so
    // a change to either has to be a deliberate change to both.
    const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(mainSrc).toContain('session.freezeTime = 1.5;');
  });

  it('caps the worst possible walk well below a walk\'s ordinary take', () => {
    expect(SCUFFLE_MAX_PER_WALK).toBe(3);
    const worst = SCUFFLE_COST * SCUFFLE_MAX_PER_WALK;
    expect(worst).toBe(15);
    // Three completed goals plus the jackpot alone pay more than the worst
    // walk can cost, so a bad walk is a smaller purse, never a net loss.
    expect(worst).toBeLessThan(AWARDS.goal * 3 + AWARDS.jackpot);
  });
});

describe('createEnemyWalkLog', () => {
  it('allows one scuffle per cat per walk', () => {
    const log = createEnemyWalkLog();
    expect(log.allowScuffle('Pickles')).toBe(true);
    expect(log.allowScuffle('Pickles')).toBe(false);
    expect(log.allowScuffle('Pickles')).toBe(false);
    expect(log.scuffleCount()).toBe(1);
  });

  it('caps the whole walk at SCUFFLE_MAX_PER_WALK, whoever is swatting', () => {
    const log = createEnemyWalkLog();
    const names = CAT_NAMES.slice(0, 10);
    const allowed = names.filter((n) => log.allowScuffle(n));
    expect(allowed).toHaveLength(SCUFFLE_MAX_PER_WALK);
    expect(log.scuffleCount()).toBe(SCUFFLE_MAX_PER_WALK);
    // A player with ten grudges crossing one map is taxed three times, not ten.
    expect(allowed.length * SCUFFLE_COST).toBe(15);
  });

  it('refuses a name a grudge could never be recorded under', () => {
    const log = createEnemyWalkLog();
    for (const bad of ['', null, undefined, 7, {}, 'x'.repeat(25)]) {
      expect(log.allowScuffle(bad)).toBe(false);
    }
    expect(log.scuffleCount()).toBe(0);
  });

  it('remembers who was forgiven, and only for this walk', () => {
    const log = createEnemyWalkLog();
    expect(log.wasForgiven('Baron von Fluff')).toBe(false);
    log.markForgiven('Baron von Fluff');
    expect(log.wasForgiven('Baron von Fluff')).toBe(true);
    expect(log.wasForgiven('Pickles')).toBe(false);
    // A fresh walk starts clean — nothing here is persisted.
    expect(createEnemyWalkLog().wasForgiven('Baron von Fluff')).toBe(false);
  });

  it('gives each walk its own log', () => {
    const a = createEnemyWalkLog();
    const b = createEnemyWalkLog();
    a.allowScuffle('Pickles');
    expect(b.allowScuffle('Pickles')).toBe(true);
    expect(a.scuffleCount()).toBe(1);
    expect(b.scuffleCount()).toBe(1);
  });
});
