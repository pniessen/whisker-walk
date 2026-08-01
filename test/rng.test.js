import { describe, it, expect } from 'vitest';
import { mulberry32, seedFromCode } from '../src/rng.js';
import { createGoals } from '../src/goals.js';
import { createQuest, QUEST_TYPES } from '../src/quests.js';

describe('mulberry32', () => {
  it('is deterministic and uniform-ish in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(seqA).size).toBe(5);
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('seedFromCode', () => {
  it('maps room codes to stable ints, case-insensitively', () => {
    expect(seedFromCode('WXYZ')).toBe(seedFromCode('wxyz'));
    expect(seedFromCode('WXYZ')).not.toBe(seedFromCode('WXYA'));
    expect(Number.isInteger(seedFromCode('AB23'))).toBe(true);
  });
});

describe('shared-world determinism', () => {
  const SPOTS = [{ x: 10, z: 0 }, { x: -5, z: 20 }, { x: 0, z: -30 }];

  it('two rngs from the same seed produce identical world-gen picks', () => {
    const rngA = mulberry32(1234);
    const rngB = mulberry32(1234);

    const goalsA = createGoals(rngA).goals.map((g) => g.id);
    const goalsB = createGoals(rngB).goals.map((g) => g.id);
    expect(goalsA).toEqual(goalsB);

    const questA = createQuest(rngA, SPOTS);
    const questB = createQuest(rngB, SPOTS);
    expect(questA.type).toBe(questB.type);
    expect(questA.target).toEqual(questB.target);
    expect(QUEST_TYPES).toContain(questA.type);
  });

  it('two rngs from different seeds are not guaranteed to line up (sanity: values differ upstream)', () => {
    const rngA = mulberry32(1);
    const rngB = mulberry32(2);
    expect(rngA()).not.toBe(rngB());
  });
});
