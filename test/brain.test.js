import { describe, it, expect } from 'vitest';
import { createBrain, weightedChoice, PERSONALITIES } from '../src/cat/brain.js';

const CALM_CTX = { leashTension: 0, critterNearby: true, poiNearby: true };

// rng stub that returns queued values then 0.5 forever
function rngQueue(...vals) {
  return () => (vals.length ? vals.shift() : 0.5);
}

describe('weightedChoice', () => {
  it('picks proportionally to weights', () => {
    const w = { a: 1, b: 1 }; // a covers [0, .5), b covers [.5, 1)
    expect(weightedChoice(w, 0.1)).toBe('a');
    expect(weightedChoice(w, 0.9)).toBe('b');
  });
  it('skips zero-weight entries', () => {
    expect(weightedChoice({ a: 0, b: 1 }, 0.0)).toBe('b');
  });
});

describe('PERSONALITIES', () => {
  it('covers all six breeds with required fields', () => {
    const breeds = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
    for (const b of breeds) {
      const p = PERSONALITIES[b];
      expect(p.speed).toBeGreaterThan(0);
      expect(p.weights).toHaveProperty('nap');
      expect(p.special).toBeTruthy();
    }
  });
});

describe('createBrain', () => {
  it('starts in follow', () => {
    expect(createBrain('tabby').state).toBe('follow');
  });

  it('eventually leaves follow when its decision timer expires', () => {
    // rng: first call sets initial timer, second picks the state.
    // roll 0.99 lands on the last non-zero weighted option.
    const brain = createBrain('persian', rngQueue(0, 0.99, 0));
    let state = 'follow';
    for (let i = 0; i < 100 && state === 'follow'; i++) state = brain.update(0.1, CALM_CTX);
    expect(state).not.toBe('follow');
  });

  it('taut leash forces any away-state back to follow', () => {
    const brain = createBrain('siamese');
    brain.set('distracted', 10);
    brain.update(0.016, { ...CALM_CTX, leashTension: 1.2 });
    expect(brain.state).toBe('follow');
  });

  it('petting works only during requestPet or nap', () => {
    const brain = createBrain('tabby');
    expect(brain.pet()).toBe(false);
    brain.set('nap', 10);
    expect(brain.pet()).toBe(true);
    expect(brain.state).toBe('follow');
  });

  it('scare frightens most cats but not fearless or steady ones', () => {
    const scaredy = createBrain('calico');
    expect(scaredy.scare()).toBe(true);
    expect(scaredy.state).toBe('scared');
    expect(createBrain('black').scare()).toBe(false);
    expect(createBrain('mainecoon').scare()).toBe(false);
  });

  it('never picks distracted when no critter is nearby', () => {
    // roll 0.99 would hit the tail of the weight table; with distracted
    // zeroed the choice must be something else.
    const brain = createBrain('siamese', rngQueue(0, 0.6, 0));
    let state = 'follow';
    for (let i = 0; i < 100 && state === 'follow'; i++) {
      state = brain.update(0.1, { leashTension: 0, critterNearby: false, poiNearby: true });
    }
    expect(state).not.toBe('distracted');
  });
});
