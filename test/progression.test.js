import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProgression, CATALOG } from '../src/progression.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  };
}

describe('createProgression', () => {
  let storage, p;
  beforeEach(() => {
    storage = fakeStorage();
    p = createProgression(storage);
  });

  it('starts fresh with three cats, two accessories, and neighborhood unlocked', () => {
    expect(p.state.points).toBe(0);
    expect(p.state.unlocked.cats).toEqual(['tabby', 'siamese', 'persian']);
    expect(p.state.unlocked.accessories).toEqual(['bell', 'bandana']);
    expect(p.state.unlocked.areas).toEqual(['neighborhood']);
    expect(p.state.equipped).toEqual({ cat: 'tabby', collar: null, outfit: null });
  });

  it('discards version-1 saves so starter unlocks apply', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = fakeStorage({
      'whisker-walk-save': JSON.stringify({ version: 1, points: 0, unlocked: { cats: ['tabby'] } }),
    });
    const p2 = createProgression(old);
    expect(p2.state.unlocked.cats).toContain('siamese');
    warn.mockRestore();
  });

  it('adds points and persists', () => {
    p.addPoints(25);
    const reloaded = createProgression(storage);
    expect(reloaded.state.points).toBe(25);
  });

  it('buys an affordable locked item and deducts points', () => {
    p.addPoints(CATALOG.cats.black.price);
    expect(p.canBuy('cats', 'black')).toBe(true);
    expect(p.buy('cats', 'black')).toBe(true);
    expect(p.state.points).toBe(0);
    expect(p.isUnlocked('cats', 'black')).toBe(true);
  });

  it('refuses to buy unaffordable or already-owned items', () => {
    expect(p.buy('cats', 'black')).toBe(false); // no points
    p.addPoints(999);
    p.buy('cats', 'black');
    expect(p.buy('cats', 'black')).toBe(false); // already owned
  });

  it('gates park behind 2 neighborhood walks even with enough points', () => {
    p.addPoints(999);
    expect(p.canBuy('areas', 'park')).toBe(false);
    p.completeWalk(); // area defaults to neighborhood
    p.completeWalk();
    expect(p.canBuy('areas', 'park')).toBe(true);
  });

  it('equips only unlocked cats and accessories into the right slot', () => {
    p.equipCat('black');
    expect(p.state.equipped.cat).toBe('tabby'); // locked → ignored
    p.equipCat('persian');
    expect(p.state.equipped.cat).toBe('persian'); // starter-unlocked → works
    p.addPoints(999);
    p.buy('accessories', 'glow');
    p.equipAccessory('glow');
    p.equipAccessory('bandana'); // starter-owned outfit
    expect(p.state.equipped.collar).toBe('glow');
    expect(p.state.equipped.outfit).toBe('bandana');
    p.unequip('collar');
    expect(p.state.equipped.collar).toBe(null);
  });

  it('recovers from corrupt save data with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = fakeStorage({ 'whisker-walk-save': '{not json!!' });
    const p2 = createProgression(bad);
    expect(p2.state.points).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('discards saves with a different version', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = fakeStorage({ 'whisker-walk-save': JSON.stringify({ version: 0, points: 900 }) });
    const p2 = createProgression(old);
    expect(p2.state.points).toBe(0);
    warn.mockRestore();
  });

  it('survives a storage that throws on write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const p2 = createProgression(broken);
    expect(() => p2.addPoints(5)).not.toThrow();
    expect(p2.state.points).toBe(5);
    warn.mockRestore();
  });
});
