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

  it('pool contains the pounce-play hunt goal', () => {
    const entry = GOAL_POOL.find((g) => g.id === 'pounce-play');
    expect(entry).toBeDefined();
    expect(entry.type).toBe('hunt');
    expect(entry.target).toBe(2);
  });

  describe('noteDuoRemote', () => {
    it('advances only the matching duo goal by id, ignoring non-duo goals', () => {
      const g = createGoals(rngQueue(0, 0, 0));
      g.goals[0] = { id: 'duo-greet', text: 'Together: greet 5 cats', type: 'friend', target: 5, duo: true, progress: 0, done: false };
      const res = g.noteDuoRemote('duo-greet');
      expect(res.completed).toBeUndefined();
      expect(g.goals[0].progress).toBe(1);
      expect(g.goals[1].progress).toBe(0);
      expect(g.goals[2].progress).toBe(0);
    });

    it('is a no-op for an id that does not match any duo goal', () => {
      const g = createGoals(rngQueue(0, 0, 0));
      g.goals[0] = { id: 'duo-greet', text: 'Together: greet 5 cats', type: 'friend', target: 5, duo: true, progress: 0, done: false };
      const res = g.noteDuoRemote('no-such-goal');
      expect(res).toEqual({});
      expect(g.goals[0].progress).toBe(0);
    });

    it('is a no-op for a non-duo goal even if the id matched', () => {
      const g = createGoals(rngQueue(0, 0, 0));
      const nonDuoId = g.goals[0].id;
      const res = g.noteDuoRemote(nonDuoId);
      expect(res).toEqual({});
      expect(g.goals[0].progress).toBe(0);
    });

    it('completes at target, with jackpot when it is the last goal standing', () => {
      const g = createGoals(rngQueue(0, 0, 0));
      g.goals[0] = { id: 'duo-greet', text: 'Together: greet 5 cats', type: 'friend', target: 2, duo: true, progress: 0, done: false };
      g.goals[1].done = true;
      g.goals[2].done = true;
      g.noteDuoRemote('duo-greet');
      const res = g.noteDuoRemote('duo-greet');
      expect(res.completed).toBe(g.goals[0]);
      expect(res.jackpot).toBe(true);
      expect(g.goals[0].done).toBe(true);
    });

    it('never advances a duo goal past done (no double-completion)', () => {
      const g = createGoals(rngQueue(0, 0, 0));
      g.goals[0] = { id: 'duo-greet', text: 'Together: greet 5 cats', type: 'friend', target: 1, duo: true, progress: 0, done: false };
      g.noteDuoRemote('duo-greet');
      const res = g.noteDuoRemote('duo-greet');
      expect(res).toEqual({});
      expect(g.goals[0].progress).toBe(1);
    });
  });
});
