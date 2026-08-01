import { describe, it, expect } from 'vitest';
import { PERSONALITIES } from '../src/cat/brain.js';

describe('PERSONALITIES', () => {
  it('covers all six breeds with required fields', () => {
    const breeds = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon'];
    for (const b of breeds) {
      const p = PERSONALITIES[b];
      expect(p.speed).toBeGreaterThan(0);
      expect(p.special).toBeTruthy();
    }
  });

  it('has one unique special per breed', () => {
    const specials = Object.values(PERSONALITIES).map((p) => p.special);
    expect(new Set(specials).size).toBe(specials.length);
  });
});
