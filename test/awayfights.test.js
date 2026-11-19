import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AWAY_CHANCES, AWAY_COOLDOWN, AWAY_RETRY, AWAY_CHASE_DIST,
  awayChance, awayRoll, canChallengeRank, awayAllowed, createAwayLedger, sanitizeAway, awayLanding,
} from '../src/awayfights.js';
import { CAST_RANKS, clanCast, ROAM_SLOTS } from '../src/clancast.js';
import { RANK_KEYS } from '../src/wordset.js';

// Away fights with the roaming cats: the rules, with no THREE.
const IDS = Array.from({ length: 16 }, (_, i) => `moor-${i}`);

describe('the chance', () => {
  test('the table: 50%, 30%, 18%, 10%, and 10% from then on, never zero', () => {
    expect(AWAY_CHANCES).toEqual([0.5, 0.3, 0.18, 0.1]);
    expect([0, 1, 2, 3, 4, 9, 500].map(awayChance)).toEqual([0.5, 0.3, 0.18, 0.1, 0.1, 0.1, 0.1]);
    expect(awayChance(-1)).toBe(0.5);
    expect(awayChance(undefined)).toBe(0.5);
    expect(awayChance(1.5)).toBe(0.5);
  });

  test("a cat's roll is in [0, 1), the same for the same walk and cat, and its own", () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = awayRoll(seed, 'moor-4');
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      expect(awayRoll(seed, 'moor-4')).toBe(r);
    }
    expect(awayRoll(7, 'moor-4')).not.toBe(awayRoll(7, 'moor-5'));
    expect(awayRoll(7, 'moor-4')).not.toBe(awayRoll(8, 'moor-4'));
  });

  test('over many walks the share of cats that want to fight follows the table as she wins', () => {
    const N = 4000;
    for (let wins = 0; wins <= 4; wins++) {
      let fights = 0;
      for (let seed = 1; seed <= N; seed++) {
        const L = createAwayLedger({ seed: seed * 7919, restore: { wins } });
        if (L.decide('woods-5') === 'fight') fights++;
      }
      expect(Math.abs(fights / N - awayChance(wins))).toBeLessThan(0.025);
    }
  });

  test('with no wins it is a fair coin for each cat, and the cats of one walk do not all agree', () => {
    let fights = 0;
    let mixed = 0;
    const N = 500;
    for (let seed = 1; seed <= N; seed++) {
      const L = createAwayLedger({ seed });
      const ds = IDS.map((id) => L.decide(id));
      fights += ds.filter((d) => d === 'fight').length;
      if (new Set(ds).size === 2) mixed++;
    }
    expect(Math.abs(fights / (N * IDS.length) - 0.5)).toBeLessThan(0.02);
    expect(mixed).toBeGreaterThan(N * 0.99);
  });
});

describe('the ledger', () => {
  test('one decision per cat per walk: asking again never re-rolls, whatever she has won since', () => {
    const L = createAwayLedger({ seed: 1234 });
    const first = IDS.map((id) => L.decide(id));
    L.addWin('moor-4');
    L.addWin();
    L.addWin();
    expect(IDS.map((id) => L.decide(id))).toEqual(first);
    expect(IDS.map((id) => L.decisionOf(id))).toEqual(first);
  });

  test('a win lowers the chance for undecided cats only; a loss or a run changes nothing', () => {
    // A cat whose roll is between 30% and 50%: it fights at no wins, passes after one.
    let seed = 0;
    while (!(awayRoll(seed, 'river-6') >= 0.3 && awayRoll(seed, 'river-6') < 0.5)) seed++;
    const a = createAwayLedger({ seed });
    expect(a.decide('river-6')).toBe('fight');
    const b = createAwayLedger({ seed });
    b.addWin('river-4');
    expect(b.chance).toBe(0.3);
    expect(b.decide('river-6')).toBe('pass');
    // Running and losing: only waits are set, the chance stays.
    const c = createAwayLedger({ seed });
    c.rest('river-4');
    c.startCooldown();
    expect(c.wins).toBe(0);
    expect(c.chance).toBe(0.5);
    expect(c.decide('river-6')).toBe('fight');
  });

  test('border patrol wins count: addWin() with no cat beats no cat but lowers the chance', () => {
    const L = createAwayLedger({ seed: 5 });
    L.addWin();
    expect(L.wins).toBe(1);
    expect(L.chance).toBe(0.3);
    expect(IDS.some((id) => L.isBeaten(id))).toBe(false);
  });

  test('a new walk starts again at 50% with nobody decided', () => {
    const L = createAwayLedger({ seed: 5 });
    L.addWin('moor-4');
    L.addWin('moor-5');
    const next = createAwayLedger({ seed: 6 });
    expect(next.wins).toBe(0);
    expect(next.chance).toBe(0.5);
    expect(next.decisionOf('moor-4')).toBe(null);
    expect(next.isBeaten('moor-4')).toBe(false);
  });

  test('the cooldown: after a challenge ends no cat may challenge for AWAY_COOLDOWN seconds', () => {
    expect(AWAY_COOLDOWN).toBe(25);
    const seed = 99;
    const L = createAwayLedger({ seed });
    const fighters = IDS.filter((id) => L.decide(id) === 'fight');
    expect(fighters.length).toBeGreaterThan(1);
    expect(fighters.every((id) => L.canChallenge(id))).toBe(true);
    L.startCooldown();
    expect(L.cooling).toBe(true);
    expect(fighters.some((id) => L.canChallenge(id))).toBe(false);
    L.tick(AWAY_COOLDOWN - 0.1);
    expect(fighters.some((id) => L.canChallenge(id))).toBe(false);
    L.tick(0.2);
    expect(L.cooling).toBe(false);
    expect(fighters.every((id) => L.canChallenge(id))).toBe(true);
  });

  test('the cat she ran from waits AWAY_RETRY seconds; the others only the cooldown', () => {
    expect(AWAY_RETRY).toBeGreaterThan(AWAY_COOLDOWN);
    const L = createAwayLedger({ seed: 99 });
    const [a, b] = IDS.filter((id) => L.decide(id) === 'fight');
    L.rest(a);
    L.startCooldown();
    L.tick(AWAY_COOLDOWN + 1);
    expect(L.canChallenge(a)).toBe(false);
    expect(L.canChallenge(b)).toBe(true);
    L.tick(AWAY_RETRY - AWAY_COOLDOWN);
    expect(L.canChallenge(a)).toBe(true);
  });

  test('a beaten cat stays beaten: it never challenges again this walk', () => {
    const L = createAwayLedger({ seed: 99 });
    const [a] = IDS.filter((id) => L.decide(id) === 'fight');
    L.addWin(a);
    L.tick(100000);
    expect(L.isBeaten(a)).toBe(true);
    expect(L.canChallenge(a)).toBe(false);
    expect(L.decide(a)).toBe('fight'); // its decision is kept; it just stands down
  });

  test('a cat that lets her pass, and a cat she has not met, never challenge', () => {
    const L = createAwayLedger({ seed: 99 });
    const pass = IDS.find((id) => L.decide(id) === 'pass');
    expect(L.canChallenge(pass)).toBe(false);
    expect(L.canChallenge('gorge-4')).toBe(false);
  });

  test('a walk picked up again does not re-roll: decisions, the beaten and the wins come back', () => {
    const seed = 4242;
    const L = createAwayLedger({ seed });
    // Three wins first, so cats decided EARLY (at 50%) would fall differently if rolled again (at 10%).
    const early = IDS.slice(0, 8).map((id) => L.decide(id));
    const beat = IDS.slice(0, 8).filter((id) => L.decisionOf(id) === 'fight').slice(0, 2);
    for (const id of beat) L.addWin(id);
    L.addWin();
    const note = JSON.parse(JSON.stringify(L.snapshot()));
    const back = createAwayLedger({ seed, restore: note });
    expect(back.wins).toBe(beat.length + 1);
    expect(IDS.slice(0, 8).map((id) => back.decisionOf(id))).toEqual(early);
    expect(IDS.slice(0, 8).map((id) => back.decide(id))).toEqual(early);
    for (const id of beat) expect(back.isBeaten(id)).toBe(true);
    // The undecided cats are decided at the restored chance, as they would have been.
    const rest = IDS.slice(8);
    expect(rest.map((id) => back.decide(id))).toEqual(rest.map((id) => L.decide(id)));
  });

  test("a resume note's away part is checked like outside data", () => {
    expect(sanitizeAway(null)).toBe(null);
    expect(sanitizeAway('x')).toBe(null);
    expect(sanitizeAway({})).toEqual({ wins: 0, fight: [], pass: [], beaten: [] });
    expect(sanitizeAway({ wins: -3, fight: ['a', 5, 'b'], pass: ['a', 'c'], beaten: ['b', 'zz', {}] }))
      .toEqual({ wins: 0, fight: ['a', 'b'], pass: ['c'], beaten: ['b'] });
    expect(sanitizeAway({ wins: 2.5 }).wins).toBe(0);
    expect(sanitizeAway({ wins: 3, fight: Array.from({ length: 500 }, (_, i) => `c${i}`) }).fight.length).toBe(64);
  });
});

describe('where and who', () => {
  const base = { mine: 'gorge', picks: ['gorge'], edition: 'canon' };
  test("only a clan cat, in another clan's territory", () => {
    for (const areaId of ['woods', 'river', 'moor', 'pines']) expect(awayAllowed({ ...base, areaId })).toBe(true);
    expect(awayAllowed({ ...base, areaId: 'gorge' })).toBe(false); // her own land
    expect(awayAllowed({ areaId: 'moor', mine: null, picks: [], edition: 'canon' })).toBe(false); // no clan yet
  });

  test('never the street areas, the farm, the den or the island', () => {
    for (const areaId of ['neighborhood', 'park', 'seaside', 'docks', 'farm', 'den', 'island', '__proto__', undefined]) {
      expect(awayAllowed({ ...base, areaId })).toBe(false);
    }
  });

  test("never in an ally's territory (her co-walker's clan), and never in Legacy", () => {
    expect(awayAllowed({ areaId: 'moor', mine: 'gorge', picks: ['gorge', 'moor'], edition: 'canon' })).toBe(false);
    expect(awayAllowed({ areaId: 'woods', mine: 'gorge', picks: ['gorge', 'moor'], edition: 'canon' })).toBe(true);
    expect(awayAllowed({ ...base, areaId: 'moor', edition: 'legacy' })).toBe(false);
  });

  test('only the roaming ranks challenge: never the leader, the deputy, an elder or a kit', () => {
    const K = RANK_KEYS;
    expect([K.warrior, K.apprentice].map(canChallengeRank)).toEqual([true, true]);
    expect([K.leader, K.deputy, K.elder, K.kit, 'medicine', undefined].map(canChallengeRank)).toEqual([false, false, false, false, false, false]);
    // In the cast, exactly the roaming slots.
    const can = CAST_RANKS.map((r, slot) => (canChallengeRank(r) ? slot : -1)).filter((s) => s >= 0);
    expect(can).toEqual([...ROAM_SLOTS]);
    expect(clanCast('moor').filter((m) => canChallengeRank(m.rank)).length).toBe(8);
  });
});

describe('the chase-off landing', () => {
  const cat = { x: 0, z: 0 };
  const foe = { x: 0, z: 2 };
  test('straight away from the cat, AWAY_CHASE_DIST metres', () => {
    const to = awayLanding(cat, foe, () => true);
    expect(to.x).toBeCloseTo(0);
    expect(to.z).toBeCloseTo(-AWAY_CHASE_DIST);
  });

  test('nearer along the line, then turned aside, when the first spot is refused', () => {
    const near = awayLanding(cat, foe, (x, z) => z > -5);
    expect(near.z).toBeCloseTo(-AWAY_CHASE_DIST * 0.75);
    const aside = awayLanding(cat, foe, (x) => Math.abs(x) > 2);
    expect(Math.abs(aside.x)).toBeGreaterThan(2);
    expect(Math.hypot(aside.x, aside.z)).toBeCloseTo(AWAY_CHASE_DIST);
    expect(aside.z).toBeLessThan(0); // never toward the cat
  });

  test('nothing open, or bad input: no landing (so no chase), never a throw', () => {
    expect(awayLanding(cat, foe, () => false)).toBe(null);
    expect(awayLanding(null, foe, () => true)).toBe(null);
    expect(awayLanding(cat, { x: NaN, z: 0 }, () => true)).toBe(null);
    expect(awayLanding(cat, foe, null)).toBe(null);
    expect(awayLanding(cat, cat, () => true)).not.toBe(null); // on top of each other: any way out
  });
});

describe('structure', () => {
  test('awayfights.js is pure: no THREE, no DOM, nothing that stores progress, no shared stream', () => {
    const src = readFileSync(new URL('../src/awayfights.js', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['./clanhomes.js', './rng.js', './wordset.js']);
    expect(src).not.toMatch(/Math\.random|walkRng|document\.|localStorage/);
  });

  test('awayfight.js is handed no progression and sends nothing on the wire', () => {
    const src = readFileSync(new URL('../src/game/awayfight.js', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['../awayfights.js', '../rivalcats.js', './borderfight.js', './clanfight.js']);
    expect(src).not.toMatch(/progression\.|Math\.random|localStorage/);
    expect(src).toMatch(/sendEvent: \(\) => \{\}/);
  });
});
