import { describe, it, expect, beforeAll, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import * as on from '../src/clanwords.js';
import { packSet } from '../src/seriespack.js';
import { sealVault } from '../src/seriescrypto.js';
import { normalizeCode } from '../src/redeem.js';
import { createFamilyLock, wordSetFor, startAfterFamily } from '../src/serieslock.js';
import { readFamilyKey, writeFamilyKey, forgetFamilyKey, FAMILY_KEY_STORE } from '../src/serieskey.js';
import { memoryStorage } from './helpers/storage.js';

const subtle = webcrypto.subtle;
const rand = (n) => webcrypto.getRandomValues(new Uint8Array(n));
const CODE = normalizeCode('test-code-for-the-lock 2222');
const key = rand(32);
let vault;

beforeAll(async () => {
  vault = await sealVault({ plaintext: packSet(on), contentKey: key, salt: rand(16), wraps: [{ id: 'family', code: CODE }] }, subtle, rand);
});

const lock = (extra = {}) => {
  const storage = extra.storage ?? memoryStorage();
  const install = vi.fn();
  return { storage, install, lock: createFamilyLock({ vault, storage, subtle, install, installed: () => false, ...extra }) };
};
const throwing = () => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } });

describe('the key on the device', () => {
  it('is kept outside the save, read back, and forgotten', () => {
    const s = memoryStorage();
    expect(readFamilyKey(s)).toBeNull();
    expect(writeFamilyKey(s, key)).toBe(true);
    expect([...readFamilyKey(s)]).toEqual([...key]);
    expect(FAMILY_KEY_STORE).toBe('whisker-walk-family-words');
    forgetFamilyKey(s);
    expect(readFamilyKey(s)).toBeNull();
  });
  it('refuses junk, and never throws', () => {
    const s = memoryStorage();
    s.setItem(FAMILY_KEY_STORE, 'not base64 !!');
    expect(readFamilyKey(s)).toBeNull();
    s.setItem(FAMILY_KEY_STORE, btoa('short'));
    expect(readFamilyKey(s)).toBeNull();
    expect(writeFamilyKey(s, new Uint8Array(5))).toBe(false);
    const t = throwing();
    expect(readFamilyKey(t)).toBeNull();
    expect(writeFamilyKey(t, key)).toBe(false);
    expect(() => forgetFamilyKey(t)).not.toThrow();
    expect(readFamilyKey(null)).toBeNull();
  });
});

describe('restore', () => {
  it('a stored good key installs the set', async () => {
    const { lock: l, storage, install } = lock();
    writeFamilyKey(storage, key);
    expect(await l.restore()).toBe('on-ready');
    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0][0].CLAN_SUFFIX).toBe(on.CLAN_SUFFIX);
    expect(install.mock.calls[0][0].DENIED_NAMES).toBeInstanceOf(Set);
  });
  it('no key is locked, and installs nothing', async () => {
    const { lock: l, install } = lock();
    expect(await l.restore()).toBe('locked');
    expect(install).not.toHaveBeenCalled();
  });
  it('a stored key that does not open the vault is locked and forgotten', async () => {
    const { lock: l, storage, install } = lock();
    writeFamilyKey(storage, rand(32));
    expect(await l.restore()).toBe('locked');
    expect(readFamilyKey(storage)).toBeNull();
    expect(install).not.toHaveBeenCalled();
  });
  it('no WebCrypto is unsupported', async () => {
    const { lock: l, storage } = lock({ subtle: null });
    writeFamilyKey(storage, key);
    expect(await l.restore()).toBe('unsupported');
  });
  it('an unreadable storage is locked, not a crash', async () => {
    const { lock: l } = lock({ storage: throwing() });
    expect(await l.restore()).toBe('locked');
  });
});

describe('tryCode', () => {
  it('the right code installs the set and keeps the key', async () => {
    const { lock: l, storage, install } = lock();
    expect(await l.tryCode(CODE)).toBe('unlocked');
    expect(install).toHaveBeenCalledTimes(1);
    expect([...readFamilyKey(storage)]).toEqual([...key]);
  });
  it('a wrong code is no', async () => {
    const { lock: l, storage, install } = lock();
    expect(await l.tryCode(normalizeCode('wrong code 0000'))).toBe('no');
    expect(await l.tryCode('')).toBe('no');
    expect(install).not.toHaveBeenCalled();
    expect(readFamilyKey(storage)).toBeNull();
  });
  it('storage that throws still unlocks this session', async () => {
    const { lock: l, install } = lock({ storage: throwing() });
    expect(await l.tryCode(CODE)).toBe('unlocked');
    expect(install).toHaveBeenCalledTimes(1);
  });
  it('no WebCrypto is unsupported', async () => {
    expect(await lock({ subtle: null }).lock.tryCode(CODE)).toBe('unsupported');
  });
  it('a code typed when the set is already in does not install it twice', async () => {
    const { lock: l, install } = lock({ installed: () => true });
    expect(await l.tryCode(CODE)).toBe('unlocked');
    expect(install).not.toHaveBeenCalled();
  });
});

describe('wordSetFor', () => {
  it('the truth table', () => {
    expect(wordSetFor({ wordSet: null }, true)).toBe('on');
    expect(wordSetFor({ wordSet: null }, false)).toBe('off');
    expect(wordSetFor({ wordSet: 'off' }, true)).toBe('off');
    expect(wordSetFor({ wordSet: 'on' }, false)).toBe('off');
    expect(wordSetFor({ wordSet: 'on' }, true)).toBe('on');
    expect(wordSetFor(undefined, true)).toBe('on');
    expect(wordSetFor({}, false)).toBe('off');
  });
});

describe('the boot', () => {
  const timers = () => {
    const t = { fns: [], cleared: 0 };
    t.set = (fn) => { t.fns.push(fn); return t.fns.length; };
    t.clear = () => { t.cleared++; };
    return t;
  };
  it('a device with no key starts at once, without asking the lock', () => {
    const init = vi.fn();
    const restore = vi.fn();
    startAfterFamily({ hasKey: false, restore, init, late: vi.fn() });
    expect(init).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
  });
  it('a device with a key starts only after the set is open, and the first screen sees it', async () => {
    const order = [];
    const t = timers();
    await new Promise((done) => {
      startAfterFamily({
        hasKey: true, setTimer: t.set, clearTimer: t.clear,
        restore: async () => { order.push('restored'); return 'on-ready'; },
        init: () => { order.push('init'); done(); }, late: () => order.push('late'),
      });
      expect(order).toEqual([]); // not before the restore
    });
    expect(order).toEqual(['restored', 'init']);
    expect(t.cleared).toBe(1);
  });
  it('a restore that hangs lets the game start at the cap, then says the words arrived', async () => {
    const order = [];
    const t = timers();
    let finish;
    startAfterFamily({
      hasKey: true, setTimer: t.set, clearTimer: t.clear, waitMs: 1500,
      restore: () => new Promise((r) => { finish = r; }),
      init: () => order.push('init'), late: () => order.push('late'),
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    t.fns[0](); // the 1500 ms cap
    expect(order).toEqual(['init']);
    finish('on-ready');
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['init', 'late']);
  });
  it('a restore that says locked, fails, or is unsupported starts the game once and never says late', async () => {
    for (const restore of [async () => 'locked', async () => 'unsupported', async () => { throw new Error('x'); }]) {
      const init = vi.fn();
      const late = vi.fn();
      startAfterFamily({ hasKey: true, restore, init, late, setTimer: () => 0, clearTimer: () => {} });
      await new Promise((r) => setTimeout(r, 0));
      expect(init).toHaveBeenCalledTimes(1);
      expect(late).not.toHaveBeenCalled();
    }
  });
});
