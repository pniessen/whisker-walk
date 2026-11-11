import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgression, BACKUP_KEYS } from '../src/progression.js';

const KEY = 'whisker-walk-save';
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
const backupRaw = (storage, kind) => {
  const w = storage.getItem(BACKUP_KEYS[kind]);
  return w === null ? null : JSON.parse(w).raw;
};
// A real save, as this build writes it, with some progress in it.
function savedWith(points) {
  const s = memStorage();
  const p = createProgression(s);
  p.addPoints(points);
  return s.getItem(KEY);
}

let warn;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

describe('save backups: keys', () => {
  it('each kind has its own key beside the save, never the save key itself', () => {
    expect(BACKUP_KEYS).toEqual({
      unreadable: 'whisker-walk-save.bak',
      cloud: 'whisker-walk-save.before-cloud',
      reset: 'whisker-walk-save.before-reset',
      restore: 'whisker-walk-save.before-restore',
    });
  });
});

describe('save backups: first run', () => {
  it('an absent save creates no backup', () => {
    const s = memStorage();
    const p = createProgression(s);
    p.addPoints(5);
    expect([...s.map.keys()]).toEqual([KEY]);
    expect(p.backupInfo()).toEqual([]);
  });
});

describe('save backups: an unreadable save', () => {
  it('broken JSON is copied to the backup and survives the next save', () => {
    const s = memStorage({ [KEY]: '{"version":4,"points":12' });
    const p = createProgression(s);
    expect(p.state.points).toBe(0);
    p.addPoints(3); // the next save overwrites the main key...
    expect(backupRaw(s, 'unreadable')).toBe('{"version":4,"points":12'); // ...but not the copy
    const [info] = p.backupInfo();
    expect(info).toMatchObject({ kind: 'unreadable', newer: false, restorable: false, points: null });
    expect(typeof info.at).toBe('number');
  });

  it('keeps the first unreadable copy over a later broken one', () => {
    const s = memStorage({ [KEY]: 'first-broken' });
    createProgression(s);
    s.setItem(KEY, 'second-broken');
    createProgression(s);
    expect(backupRaw(s, 'unreadable')).toBe('first-broken');
  });

  it('a copy that is not even JSON gives way to one that is a whole save', () => {
    const s = memStorage({ [KEY]: 'junk' });
    createProgression(s);
    const future = JSON.stringify({ version: 99, points: 400, lifetimePoints: 900 });
    s.setItem(KEY, future);
    createProgression(s);
    expect(backupRaw(s, 'unreadable')).toBe(future);
  });

  it('a save of an unknown kind (wrong version shape) is backed up too', () => {
    const raw = JSON.stringify({ version: 'four', points: 7 });
    const s = memStorage({ [KEY]: raw });
    const p = createProgression(s);
    p.addPoints(1);
    expect(backupRaw(s, 'unreadable')).toBe(raw);
  });
});

describe('save backups: a save from a newer version of the game', () => {
  const future = JSON.stringify({ version: 5, points: 250, lifetimePoints: 800, somethingNew: [1, 2] });

  it('is backed up, and this build never writes over it', () => {
    const s = memStorage({ [KEY]: future });
    const p = createProgression(s);
    expect(p.state.points).toBe(0); // plays fresh this session
    p.addPoints(10);
    p.recordWalkScore(10);
    expect(s.getItem(KEY)).toBe(future); // still the newer save, for the newer build
    expect(backupRaw(s, 'unreadable')).toBe(future);
    expect(p.backupInfo()).toEqual([
      expect.objectContaining({ kind: 'unreadable', newer: true, restorable: false, points: 250, lifetimePoints: 800 }),
    ]);
  });

  it('once a build can read it, the backup that matches the save in use is dropped', () => {
    // the newer build would read version 5; here a version-4 save stands in
    // for "the save this build reads fine, still identical to the copy"
    const raw = savedWith(40);
    const s = memStorage({ [KEY]: raw, [BACKUP_KEYS.unreadable]: JSON.stringify({ at: 1, raw }) });
    const p = createProgression(s);
    expect(p.state.points).toBe(40);
    expect(s.getItem(BACKUP_KEYS.unreadable)).toBe(null);
  });

  it('Start over still works over it, and keeps a copy', () => {
    const s = memStorage({ [KEY]: future });
    const p = createProgression(s);
    p.reset();
    p.addPoints(2);
    expect(JSON.parse(s.getItem(KEY)).points).toBe(2);
    expect(backupRaw(s, 'reset')).toBe(future);
  });
});

describe('save backups: storage that throws', () => {
  it('a backup that cannot be written never blocks loading or playing', () => {
    const map = new Map([[KEY, 'broken']]);
    const storage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { if (k !== KEY) throw new Error('quota'); map.set(k, v); },
      removeItem: (k) => map.delete(k),
    };
    const p = createProgression(storage);
    p.addPoints(4);
    expect(JSON.parse(map.get(KEY)).points).toBe(4);
    expect(p.backupInfo()).toEqual([]);
    expect(() => p.reset()).not.toThrow();
    expect(() => p.replaceFromPayload({ version: 4, points: 9 })).not.toThrow();
    expect(p.state.points).toBe(9);
  });

  it('a storage whose every call throws still gives a playable game', () => {
    const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    const p = createProgression(storage);
    expect(() => p.addPoints(1)).not.toThrow();
    expect(p.backupInfo()).toEqual([]);
    expect(p.restoreBackup('cloud')).toBe(false);
  });

  it('a storage without removeItem is fine', () => {
    const map = new Map();
    const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
    const p = createProgression(storage);
    p.addPoints(6);
    p.replaceFromPayload({ version: 4, points: 1 });
    expect(p.restoreBackup('cloud')).toBe(true);
    expect(p.state.points).toBe(6);
  });
});

describe('save backups: Load from cloud can be undone', () => {
  it('keeps what the device had, and the undo puts it back', () => {
    const s = memStorage({ [KEY]: savedWith(120) });
    const p = createProgression(s);
    p.replaceFromPayload({ version: 4, points: 3, lifetimePoints: 3 });
    expect(p.state.points).toBe(3);
    expect(p.backupInfo()).toEqual([expect.objectContaining({ kind: 'cloud', restorable: true, points: 120 })]);
    expect(p.restoreBackup('cloud')).toBe(true);
    expect(p.state.points).toBe(120);
    expect(JSON.parse(s.getItem(KEY)).points).toBe(120);
    // the undo used its copy up, and kept what it replaced
    expect(s.getItem(BACKUP_KEYS.cloud)).toBe(null);
    expect(JSON.parse(backupRaw(s, 'restore')).points).toBe(3);
  });

  it('the undo goes through the same sanitising load as a boot', () => {
    // a hostile copy planted in storage: bad numbers, markup, an unknown cat
    const hostile = JSON.stringify({ version: 4, points: -5, lifetimePoints: 'lots', petName: '<img src=x onerror=alert(1)>', equipped: { cat: 'nope' } });
    const s = memStorage({ [KEY]: savedWith(10), [BACKUP_KEYS.cloud]: JSON.stringify({ at: 5, raw: hostile }) });
    const p = createProgression(s);
    expect(p.restoreBackup('cloud')).toBe(true);
    expect(p.state.points).toBe(0);
    expect(p.state.lifetimePoints).toBe(0);
    expect(p.state.equipped.cat).not.toBe('nope');
  });

  it('a v2 copy migrates on restore like a v2 save on boot', () => {
    const s = memStorage({ [BACKUP_KEYS.cloud]: JSON.stringify({ at: 1, raw: JSON.stringify({ version: 2, points: 33 }) }) });
    const p = createProgression(s);
    expect(p.restoreBackup('cloud')).toBe(true);
    expect(p.state.version).toBe(4);
    expect(p.state.lifetimePoints).toBe(33);
  });
});

describe('save backups: Start over can be undone', () => {
  it('keeps a copy of what it erased', () => {
    const s = memStorage({ [KEY]: savedWith(77) });
    const p = createProgression(s);
    p.reset();
    expect(p.state.points).toBe(0);
    expect(p.backupInfo()).toEqual([expect.objectContaining({ kind: 'reset', restorable: true, points: 77, lifetimePoints: 77 })]);
    expect(p.restoreBackup('reset')).toBe(true);
    expect(p.state.points).toBe(77);
    expect(s.getItem(BACKUP_KEYS.reset)).toBe(null);
  });

  it('a second Start over on a fresh save never replaces the copy that has progress', () => {
    const s = memStorage({ [KEY]: savedWith(77) });
    const p = createProgression(s);
    p.reset();
    p.reset();
    expect(JSON.parse(backupRaw(s, 'reset')).points).toBe(77);
  });

  it('a later Start over with progress keeps the newer one (one copy of each kind)', () => {
    const s = memStorage({ [KEY]: savedWith(77) });
    const p = createProgression(s);
    p.reset();
    p.addPoints(5);
    p.reset();
    expect(JSON.parse(backupRaw(s, 'reset')).points).toBe(5);
  });
});

describe('save backups: restoreBackup', () => {
  it('refuses an unknown kind, a missing copy and a copy this build cannot read', () => {
    const s = memStorage({ [KEY]: savedWith(9), [BACKUP_KEYS.unreadable]: JSON.stringify({ at: 1, raw: 'nope' }) });
    const p = createProgression(s);
    const before = s.getItem(KEY);
    expect(p.restoreBackup('toString')).toBe(false);
    expect(p.restoreBackup('cloud')).toBe(false);
    expect(p.restoreBackup('unreadable')).toBe(false);
    s.setItem(BACKUP_KEYS.unreadable, JSON.stringify({ at: 1, raw: JSON.stringify({ version: 99 }) }));
    expect(p.restoreBackup('unreadable')).toBe(false);
    expect(s.getItem(KEY)).toBe(before);
    expect(p.state.points).toBe(9);
  });

  it('never replaces the save when its own copy cannot be kept', () => {
    const map = new Map([[KEY, savedWith(9)], [BACKUP_KEYS.reset, JSON.stringify({ at: 1, raw: savedWith(50) })]]);
    const storage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { if (k === BACKUP_KEYS.restore) throw new Error('quota'); map.set(k, v); },
      removeItem: (k) => map.delete(k),
    };
    const p = createProgression(storage);
    expect(p.restoreBackup('reset')).toBe(false);
    expect(p.state.points).toBe(9);
    expect(JSON.parse(map.get(KEY)).points).toBe(9);
  });

  it('restoring the restore copy swaps back (an undo of the undo)', () => {
    const s = memStorage({ [KEY]: savedWith(120) });
    const p = createProgression(s);
    p.replaceFromPayload({ version: 4, points: 3 });
    p.restoreBackup('cloud');
    expect(p.restoreBackup('restore')).toBe(true);
    expect(p.state.points).toBe(3);
    expect(JSON.parse(backupRaw(s, 'restore')).points).toBe(120);
  });

  it('a restorable unreadable copy comes back and its copy is cleared', () => {
    const good = savedWith(31);
    const s = memStorage({ [BACKUP_KEYS.unreadable]: JSON.stringify({ at: 2, raw: good }) });
    const p = createProgression(s);
    expect(p.backupInfo()).toEqual([expect.objectContaining({ kind: 'unreadable', restorable: true, newer: false, points: 31 })]);
    expect(p.restoreBackup('unreadable')).toBe(true);
    expect(p.state.points).toBe(31);
    expect(p.backupInfo()).toEqual([]);
  });

  it('lifts the newer-save guard: after an explicit restore, saving works again', () => {
    const future = JSON.stringify({ version: 5, points: 1 });
    const s = memStorage({ [KEY]: future, [BACKUP_KEYS.reset]: JSON.stringify({ at: 1, raw: savedWith(12) }) });
    const p = createProgression(s);
    expect(p.restoreBackup('reset')).toBe(true);
    p.addPoints(1);
    expect(JSON.parse(s.getItem(KEY)).points).toBe(13);
    expect(backupRaw(s, 'restore')).toBe(future);
  });
});

describe('save backups: backupInfo is sanitised', () => {
  it('drops a wrapper of the wrong shape and coerces what it shows', () => {
    const s = memStorage({
      [BACKUP_KEYS.cloud]: 'not json',
      [BACKUP_KEYS.reset]: JSON.stringify({ at: 'yesterday', raw: JSON.stringify({ version: 4, points: '<b>', lifetimePoints: -1 }) }),
      [BACKUP_KEYS.restore]: JSON.stringify({ at: 3, raw: 42 }),
    });
    const p = createProgression(s);
    expect(p.backupInfo()).toEqual([
      { kind: 'reset', at: null, newer: false, restorable: true, points: 0, lifetimePoints: 0 },
    ]);
  });

  it('backups never reach the cloud payload (they are not in the save)', () => {
    const s = memStorage({ [KEY]: savedWith(8) });
    const p = createProgression(s);
    p.reset();
    expect(JSON.stringify(p.state)).not.toContain('before-reset');
    expect(Object.keys(p.state)).not.toContain('backups');
  });
});
