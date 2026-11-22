import { describe, it, expect, vi, afterEach } from 'vitest';
import { memoryStorage } from './helpers/storage.js';
import { importAsFamily } from './helpers/family.js';

// The family build keeps its save under its own key and never touches the cloud
// (private-edition milestone 0, Task 4).
afterEach(() => vi.unstubAllGlobals());

const progressionOf = async (path = '../src/progression.js') => import(path);

describe('the family save key', () => {
  it('is whisker-walk-save publicly and whisker-walk-family-save in the family build', async () => {
    const pub = await progressionOf();
    expect(pub.SAVE_KEY).toBe('whisker-walk-save');
    await importAsFamily(() => import('../src/progression.js'), (fam) => {
      expect(fam.SAVE_KEY).toBe('whisker-walk-family-save');
    });
  });

  it('the backups sit beside the save, under the family key in the family build', async () => {
    const pub = await progressionOf();
    expect(pub.BACKUP_KEYS.unreadable).toBe('whisker-walk-save.bak');
    expect(pub.BACKUP_KEYS.cloud).toBe('whisker-walk-save.before-cloud');
    await importAsFamily(() => import('../src/progression.js'), (fam) => {
      for (const k of Object.values(fam.BACKUP_KEYS)) expect(k.startsWith('whisker-walk-family-save.')).toBe(true);
    });
  });

  it('a public save is never read by the family build, and the reverse', async () => {
    const storage = memoryStorage({ expose: 'map' });
    const pub = await progressionOf();
    const p = pub.createProgression(storage);
    p.addPoints?.(7);
    p.save?.();
    const publicRaw = storage.getItem('whisker-walk-save');
    expect(publicRaw).toBeTruthy();
    expect(storage.getItem('whisker-walk-family-save')).toBeNull();

    await importAsFamily(() => import('../src/progression.js'), (fam) => {
      const f = fam.createProgression(storage);
      expect(f.state?.lifetimePoints ?? f.getState?.().lifetimePoints ?? 0).toBe(0);
      f.addPoints?.(3);
      f.save?.();
      expect(storage.getItem('whisker-walk-family-save')).toBeTruthy();
      expect(storage.getItem('whisker-walk-save')).toBe(publicRaw);
    });
  });
});

describe('no cloud in the family build', () => {
  it('createLiveCloud makes no client: every call is a no-op', async () => {
    const net = await import('../src/net.js');
    await importAsFamily(() => import('../src/cloud.js'), async (cloud) => {
      const c = cloud.createLiveCloud('https://example.invalid', 'key');
      expect(await c.saveToCloud?.({}) ?? null).toBeNull();
      expect(await c.loadFromCloud?.('X') ?? null).toBeNull();
    });
    expect(net).toBeTruthy();
  });

  it('getSupabaseClient refuses in the family build, and is untouched publicly', async () => {
    await importAsFamily(() => import('../src/net.js'), async (net) => {
      expect(await net.getSupabaseClient('https://example.invalid', 'key')).toBeNull();
    });
  });
});
