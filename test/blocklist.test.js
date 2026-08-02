import { describe, it, expect } from 'vitest';
import { createBlockList } from '../src/blocklist.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('createBlockList', () => {
  it('starts empty when there is nothing persisted', () => {
    const list = createBlockList(fakeStorage());
    expect(list.has('alice')).toBe(false);
    expect(list.all()).toEqual([]);
  });

  it('add() then has() reports the id as blocked', () => {
    const list = createBlockList(fakeStorage());
    list.add('alice');
    expect(list.has('alice')).toBe(true);
    expect(list.has('bob')).toBe(false);
    expect(list.all()).toEqual(['alice']);
  });

  it('add() is idempotent — adding the same id twice does not duplicate it', () => {
    const list = createBlockList(fakeStorage());
    list.add('alice');
    list.add('alice');
    expect(list.all()).toEqual(['alice']);
  });

  it('add() ignores non-string / empty input rather than throwing or storing garbage', () => {
    const list = createBlockList(fakeStorage());
    list.add('');
    list.add(null);
    list.add(undefined);
    list.add(42);
    list.add({ playerId: 'alice' });
    expect(list.all()).toEqual([]);
  });

  it('remove() clears a blocked id, and is a no-op for an id that was never blocked', () => {
    const list = createBlockList(fakeStorage());
    list.add('alice');
    list.add('bob');
    list.remove('alice');
    expect(list.has('alice')).toBe(false);
    expect(list.has('bob')).toBe(true);
    list.remove('carol'); // never blocked — should not throw
    expect(list.all()).toEqual(['bob']);
  });

  it('persists across separate createBlockList calls against the same storage', () => {
    const storage = fakeStorage();
    const first = createBlockList(storage);
    first.add('alice');
    const second = createBlockList(storage);
    expect(second.has('alice')).toBe(true);
  });

  it('a later remove() persists too — a fresh instance no longer sees it blocked', () => {
    const storage = fakeStorage();
    const first = createBlockList(storage);
    first.add('alice');
    first.remove('alice');
    const second = createBlockList(storage);
    expect(second.has('alice')).toBe(false);
  });

  it('recovers to an empty list from corrupt JSON in storage', () => {
    const storage = fakeStorage({ 'whisker-walk-blocked': '{not json' });
    const list = createBlockList(storage);
    expect(list.all()).toEqual([]);
    list.add('alice'); // still usable afterward
    expect(list.has('alice')).toBe(true);
  });

  it('recovers to an empty list when the persisted value is valid JSON but not an array', () => {
    const storage = fakeStorage({ 'whisker-walk-blocked': JSON.stringify({ alice: true }) });
    const list = createBlockList(storage);
    expect(list.all()).toEqual([]);
  });

  it('drops non-string / empty entries found in a corrupted persisted array', () => {
    const storage = fakeStorage({ 'whisker-walk-blocked': JSON.stringify(['alice', 42, null, '', 'bob']) });
    const list = createBlockList(storage);
    expect(list.all().sort()).toEqual(['alice', 'bob']);
  });

  it('still works (session-only) when storage throws on every call', () => {
    const storage = {
      getItem() { throw new Error('unavailable'); },
      setItem() { throw new Error('unavailable'); },
    };
    const list = createBlockList(storage);
    expect(() => list.add('alice')).not.toThrow();
    expect(list.has('alice')).toBe(true);
    expect(() => list.remove('alice')).not.toThrow();
    expect(list.has('alice')).toBe(false);
  });
});
