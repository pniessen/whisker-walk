import { describe, it, expect } from 'vitest';
import { PERSONALITIES } from '../src/cat/brain.js';
import { CATALOG } from '../src/progression.js';

describe('PERSONALITIES', () => {
  it('covers every playable character in the catalog with required fields', () => {
    for (const id of Object.keys(CATALOG.cats)) {
      const p = PERSONALITIES[id];
      expect(p, `missing personality for ${id}`).toBeTruthy();
      expect(p.speed).toBeGreaterThan(0);
      expect(p.special).toBeTruthy();
    }
  });

  it('includes the family pets with their traits', () => {
    expect(PERSONALITIES.zeetoo.special).toBe('keenNose');
    expect(PERSONALITIES.rosa.special).toBe('fearless');
    expect(PERSONALITIES.robbie.special).toBe('pouncer');
    expect(PERSONALITIES.hagrid.special).toBe('bird'); // a chicken among cats
  });
});
