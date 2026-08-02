import { describe, it, expect, vi } from 'vitest';
import { createSettings } from '../src/settings.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

describe('createSettings', () => {
  it('starts with the documented defaults when storage is empty', () => {
    const settings = createSettings(fakeStorage());
    expect(settings.all()).toEqual({
      volume: 0.8,
      muted: false,
      invertY: false,
      leftHanded: false,
      reducedMotion: false,
    });
    expect(settings.get('volume')).toBe(0.8);
  });

  it('set() updates the in-memory value and persists it to storage', () => {
    const storage = fakeStorage();
    const settings = createSettings(storage);
    settings.set('volume', 0.3);
    settings.set('invertY', true);
    expect(settings.get('volume')).toBe(0.3);
    expect(settings.get('invertY')).toBe(true);
    const raw = JSON.parse(storage.getItem('whisker-walk-settings'));
    expect(raw).toMatchObject({ volume: 0.3, invertY: true });
  });

  it('a fresh instance over the same storage reloads the persisted values', () => {
    const storage = fakeStorage();
    createSettings(storage).set('leftHanded', true);
    const reloaded = createSettings(storage);
    expect(reloaded.get('leftHanded')).toBe(true);
    expect(reloaded.all()).toEqual({
      volume: 0.8,
      muted: false,
      invertY: false,
      leftHanded: true,
      reducedMotion: false,
    });
  });

  it('recovers to defaults from corrupt or missing data, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = createSettings(fakeStorage({ 'whisker-walk-settings': '{not json' }));
    expect(settings.all()).toEqual({
      volume: 0.8,
      muted: false,
      invertY: false,
      leftHanded: false,
      reducedMotion: false,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('clamps an out-of-range volume and ignores unknown keys', () => {
    const settings = createSettings(fakeStorage());
    settings.set('volume', 5);
    expect(settings.get('volume')).toBe(1);
    settings.set('volume', -2);
    expect(settings.get('volume')).toBe(0);
    settings.set('notAKey', true);
    expect(settings.all().notAKey).toBeUndefined();
  });
});
