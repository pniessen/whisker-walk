// The boot with the real word door: a device that holds the key shows its first screen in the
// family's words, one that waits too long starts in the everyday words and is told when the family's arrive.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import * as on from '../src/clanwords.js';
import { packSet } from '../src/seriespack.js';
import { sealVault } from '../src/seriescrypto.js';
import { writeFamilyKey } from '../src/serieskey.js';
import { memoryStorage } from './helpers/storage.js';

// This file wants the door as the public build has it, not the test setup's.
vi.unmock('../src/wordset.js');

const subtle = webcrypto.subtle;
const rand = (n) => webcrypto.getRandomValues(new Uint8Array(n));
const key = rand(32);
let vault;

beforeAll(async () => {
  vault = await sealVault({ plaintext: packSet(on), contentKey: key, salt: rand(16), wraps: [{ id: 'family', code: 'ABCDEFGH' }] }, subtle, rand);
});

// A page of its own: fresh copies of the door and the lock, as the public build has them.
async function page(storage) {
  vi.resetModules();
  const door = await import('../src/wordset.js');
  const lockMod = await import('../src/serieslock.js');
  const lock = lockMod.createFamilyLock({ vault, storage, subtle, install: door.installSeriesSet, installed: door.seriesAvailable });
  const apply = (state = { wordSet: null }) => door.setSeriesMode(lockMod.wordSetFor(state, door.seriesAvailable()));
  return { door, lockMod, lock, apply };
}

describe('the first screen after a boot', () => {
  it('is in the family\'s words on a device with the key', async () => {
    const storage = memoryStorage();
    writeFamilyKey(storage, key);
    const { door, lockMod, lock, apply } = await page(storage);
    expect(door.seriesMode()).toBe('off');
    const seen = [];
    await new Promise((done) => lockMod.startAfterFamily({
      hasKey: true, restore: lock.restore, late: () => seen.push('late'),
      init: () => { apply(); seen.push(`first screen: ${door.seriesMode()} ${door.words().CLAN_SUFFIX}`); done(); },
    }));
    expect(seen).toEqual(['first screen: on Clan']);
    // the unpacked set is the family's, word for word
    expect(packSet(door.words()) === packSet(on)).toBe(true);
  });

  it('is in the everyday words on a device with no key, with no wait', async () => {
    const { door, lockMod, lock, apply } = await page(memoryStorage());
    const seen = [];
    lockMod.startAfterFamily({ hasKey: false, restore: lock.restore, late: () => seen.push('late'), init: () => { apply(); seen.push(door.seriesMode()); } });
    expect(seen).toEqual(['off']); // synchronously
    expect(door.seriesAvailable()).toBe(false);
  });

  it('is in the everyday words, then told, when the set takes longer than 1.5 seconds', async () => {
    vi.useFakeTimers();
    try {
      const storage = memoryStorage();
      writeFamilyKey(storage, key);
      const { door, lockMod, lock, apply } = await page(storage);
      const seen = [];
      const slow = () => new Promise((r) => setTimeout(r, 2000)).then(() => lock.restore());
      lockMod.startAfterFamily({
        hasKey: true, restore: slow, waitMs: 1500,
        init: () => { apply(); seen.push(`init ${door.seriesMode()}`); },
        late: () => { apply(); seen.push(`late ${door.seriesMode()}`); },
      });
      await vi.advanceTimersByTimeAsync(1499);
      expect(seen).toEqual([]);
      await vi.advanceTimersByTimeAsync(2);
      expect(seen).toEqual(['init off']);
      await vi.advanceTimersByTimeAsync(600);
      vi.useRealTimers(); // the set opens through real imports
      await vi.waitFor(() => expect(seen).toEqual(['init off', 'late on']));
    } finally {
      vi.useRealTimers();
    }
  });

  it('a bad key falls back to the everyday words and the code box can unlock again', async () => {
    const storage = memoryStorage({}, { removeItem: true });
    writeFamilyKey(storage, rand(32));
    const { door, lockMod, lock, apply } = await page(storage);
    const seen = [];
    await new Promise((done) => lockMod.startAfterFamily({ hasKey: true, restore: lock.restore, late: () => seen.push('late'), init: () => { apply(); seen.push(door.seriesMode()); done(); } }));
    expect(seen).toEqual(['off']);
    expect(door.seriesAvailable()).toBe(false);
    expect(await lock.tryCode('ABCDEFGH')).toBe('unlocked');
    expect(door.seriesAvailable()).toBe(true);
    apply();
    expect(door.seriesMode()).toBe('on');
  });

  it('a family save on a locked device reads in everyday words and keeps its choice', async () => {
    const { door, lockMod, apply } = await page(memoryStorage());
    const state = { wordSet: 'on' };
    apply(state);
    expect(door.seriesMode()).toBe('off');
    expect(state.wordSet).toBe('on'); // choosing the words in use never rewrites the save
    expect(lockMod.wordSetFor(state, false)).toBe('off');
  });
});
