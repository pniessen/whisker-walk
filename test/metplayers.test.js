import { describe, it, expect } from 'vitest';
import { createMetPlayers, metOnly, MET_KEY } from '../src/metplayers.js';

function memStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

describe('createMetPlayers', () => {
  it('remembers who was met, across a reload, and nothing else', () => {
    const storage = memStorage();
    const met = createMetPlayers(storage);
    met.add('robin');
    met.add('robin');
    met.add('');
    met.add(7);
    expect(met.all()).toEqual(['robin']);
    expect(createMetPlayers(storage).has('robin')).toBe(true);
    expect(createMetPlayers(storage).has('stranger')).toBe(false);
  });
  it('a corrupt or missing list starts empty instead of throwing', () => {
    expect(createMetPlayers(memStorage({ [MET_KEY]: '{nope' })).all()).toEqual([]);
    expect(createMetPlayers(memStorage({ [MET_KEY]: '{"ids":[1,"a",null]}' })).all()).toEqual(['a']);
    expect(createMetPlayers(null).all()).toEqual([]);
  });
  it('is not the save', () => {
    const storage = memStorage();
    createMetPlayers(storage).add('robin');
    expect([...storage.map.keys()]).toEqual([MET_KEY]);
  });
});

describe('metOnly', () => {
  it('first run on a device: the friends it already had are carried over, once', () => {
    const storage = memStorage();
    const met = createMetPlayers(storage);
    expect(metOnly(met, ['sister', 'old-friend'])).toEqual(['sister', 'old-friend']);
    // from now on a row on the server is not enough to be shown
    expect(metOnly(met, ['sister', 'old-friend', 'stranger'])).toEqual(['sister', 'old-friend']);
    expect(metOnly(createMetPlayers(storage), ['stranger'])).toEqual([]);
  });
  it('a boop or a friend code adds someone after that', () => {
    const met = createMetPlayers(memStorage());
    metOnly(met, []);
    expect(metOnly(met, ['new-friend'])).toEqual([]);
    met.add('new-friend');
    expect(metOnly(met, ['new-friend', 'stranger'])).toEqual(['new-friend']);
  });
});
