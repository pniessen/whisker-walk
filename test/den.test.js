import { describe, it, expect } from 'vitest';
import { DEN_ITEMS, DEN_SPOTS } from '../src/den.js';

describe('DEN_ITEMS', () => {
  it('has exactly the six furniture pieces the brief specifies, with names + prices', () => {
    expect(Object.keys(DEN_ITEMS).sort()).toEqual(
      ['bed', 'cattree', 'fishtank', 'lamp', 'rug', 'scratcher'].sort()
    );
    expect(DEN_ITEMS.rug).toEqual({ name: 'Sunbeam Rug', price: 30 });
    expect(DEN_ITEMS.cattree).toEqual({ name: 'Deluxe Cat Tree', price: 60 });
    expect(DEN_ITEMS.fishtank).toEqual({ name: 'Bubbling Fish Tank', price: 45 });
    expect(DEN_ITEMS.bed).toEqual({ name: 'Donut Bed', price: 25 });
    expect(DEN_ITEMS.lamp).toEqual({ name: 'Warm Lamp', price: 20 });
    expect(DEN_ITEMS.scratcher).toEqual({ name: 'Scratching Post', price: 20 });
  });
});

describe('DEN_SPOTS', () => {
  const ids = DEN_SPOTS.map((s) => s.id);

  it('has exactly the six fixed anchor ids the brief specifies', () => {
    expect(ids.sort()).toEqual(
      ['rug-spot', 'corner-a', 'corner-b', 'window', 'shelf', 'center'].sort()
    );
  });

  it('every spot has a numeric position inside the 16x16 room (bounds ±8)', () => {
    for (const spot of DEN_SPOTS) {
      expect(typeof spot.x).toBe('number');
      expect(typeof spot.z).toBe('number');
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(spot.z)).toBeLessThanOrEqual(8);
    }
  });

  it('every spot is at least 1.5 units clear of the walls', () => {
    for (const spot of DEN_SPOTS) {
      expect(8 - Math.abs(spot.x)).toBeGreaterThanOrEqual(1.5);
      expect(8 - Math.abs(spot.z)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('every pair of spots is at least 2 units apart', () => {
    for (let i = 0; i < DEN_SPOTS.length; i++) {
      for (let j = i + 1; j < DEN_SPOTS.length; j++) {
        const a = DEN_SPOTS[i];
        const b = DEN_SPOTS[j];
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        expect(dist).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
