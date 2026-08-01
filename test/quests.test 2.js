import { describe, it, expect } from 'vitest';
import { createQuest, QUEST_TYPES } from '../src/quests.js';

const SPOTS = [{ x: 10, z: 0 }, { x: -5, z: 20 }, { x: 0, z: -30 }];
const rngQueue = (...vals) => () => (vals.length ? vals.shift() : 0.5);

describe('createQuest', () => {
  it('picks a type and a target from the provided spots deterministically', () => {
    const q = createQuest(rngQueue(0, 0), SPOTS);
    expect(q.type).toBe(QUEST_TYPES[0]);
    expect(q.target).toEqual(SPOTS[0]);
    const q2 = createQuest(rngQueue(0.99, 0.99), SPOTS);
    expect(q2.type).toBe(QUEST_TYPES[2]);
    expect(q2.target).toEqual(SPOTS[2]);
  });

  it('walks offered → active → complete', () => {
    const q = createQuest(rngQueue(0, 0), SPOTS);
    expect(q.state).toBe('offered');
    expect(q.tryComplete({ x: 10, z: 0 })).toBe(false); // not accepted yet
    q.accept();
    expect(q.state).toBe('active');
    expect(q.tryComplete({ x: 30, z: 30 })).toBe(false); // too far
    expect(q.tryComplete({ x: 10.5, z: 0.5 })).toBe(true);
    expect(q.state).toBe('complete');
    expect(q.tryComplete({ x: 10, z: 0 })).toBe(false); // already done
  });

  it('has full text for every quest type', () => {
    for (let i = 0; i < QUEST_TYPES.length; i++) {
      const q = createQuest(rngQueue(i / QUEST_TYPES.length + 0.01, 0), SPOTS);
      expect(q.texts.offer.length).toBeGreaterThan(0);
      expect(q.texts.objective.length).toBeGreaterThan(0);
      expect(q.texts.prompt.startsWith('E — ')).toBe(true);
      expect(q.texts.done.length).toBeGreaterThan(0);
    }
  });
});
