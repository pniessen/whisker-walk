import { describe, it, expect } from 'vitest';
import { createGoals, GOAL_POOL } from '../src/goals.js';

const rngQueue = (...vals) => () => (vals.length ? vals.shift() : 0.5);

describe('createGoals', () => {
  it('deals 3 distinct goals', () => {
    const g = createGoals(() => 0.99);
    expect(g.goals).toHaveLength(3);
    expect(new Set(g.goals.map((x) => x.id)).size).toBe(3);
  });

  it('tracks progress and completes at target with jackpot on the third', () => {
    const g = createGoals(rngQueue(0, 0, 0)); // deterministic first three pool entries
    const types = g.goals.map((x) => x.type);
    let completions = 0;
    let jackpot = false;
    for (const goal of g.goals) {
      for (let i = 0; i < goal.target; i++) {
        const res = g.note(goal.type);
        if (res.completed) completions += 1;
        if (res.jackpot) jackpot = true;
      }
    }
    expect(completions).toBe(3);
    expect(jackpot).toBe(true);
    expect(g.goals.every((x) => x.done)).toBe(true);
    expect(g.note(types[0]).completed).toBeUndefined(); // done goals stop counting
  });

  it('ignores goal/jackpot award types', () => {
    const g = createGoals(rngQueue(0, 0, 0));
    expect(g.note('goal')).toEqual({});
    expect(g.note('jackpot')).toEqual({});
  });
});
