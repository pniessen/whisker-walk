import { describe, it, expect, vi } from 'vitest';
import { createSettings } from '../src/settings.js';
import { memoryStorage as fakeStorage } from './helpers/storage.js';

describe('createSettings', () => {
  it('starts with the documented defaults when storage is empty', () => {
    const settings = createSettings(fakeStorage());
    expect(settings.all()).toEqual({
      volume: 0.8,
      musicVolume: 0.5,
      muted: false,
      invertY: false,
      leftHanded: false,
      reducedMotion: false,
      hideChat: false,
      perfReadout: false,
      quality: 'auto',
      cameraZoom: 1,
      haptics: true,
      showTips: true, // 2026-11-15, guided-first-walk design: the "Show tips" switch, on by default
      zoomButtons: false, // 2026-11-19, controls review: the + and − pair on screen, off by default
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
      musicVolume: 0.5,
      muted: false,
      invertY: false,
      leftHanded: true,
      reducedMotion: false,
      hideChat: false,
      perfReadout: false,
      quality: 'auto',
      cameraZoom: 1,
      haptics: true,
      showTips: true, // 2026-11-15, guided-first-walk design: the "Show tips" switch, on by default
      zoomButtons: false, // 2026-11-19, controls review: the + and − pair on screen, off by default
    });
  });

  it('recovers to defaults from corrupt or missing data, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = createSettings(fakeStorage({ 'whisker-walk-settings': '{not json' }));
    expect(settings.all()).toEqual({
      volume: 0.8,
      musicVolume: 0.5,
      muted: false,
      invertY: false,
      leftHanded: false,
      reducedMotion: false,
      hideChat: false,
      perfReadout: false,
      quality: 'auto',
      cameraZoom: 1,
      haptics: true,
      showTips: true, // 2026-11-15, guided-first-walk design: the "Show tips" switch, on by default
      zoomButtons: false, // 2026-11-19, controls review: the + and − pair on screen, off by default
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

  it('defaults hideChat to false, persists a set, ignores corrupt', () => {
    const store = fakeStorage();
    const s = createSettings(store);
    expect(s.get('hideChat')).toBe(false);
    s.set('hideChat', true);
    expect(s.get('hideChat')).toBe(true);
    const reloaded = createSettings(store);
    expect(reloaded.get('hideChat')).toBe(true);
  });

  it('defaults quality to auto, accepts valid tiers, rejects bogus values, and sanitizes corrupt persisted data', () => {
    const store = fakeStorage();
    const s = createSettings(store);
    expect(s.get('quality')).toBe('auto');

    s.set('quality', 'high');
    expect(s.get('quality')).toBe('high');

    s.set('quality', 'bogus');
    expect(s.get('quality')).toBe('high');

    const reloaded = createSettings(fakeStorage({ 'whisker-walk-settings': JSON.stringify({ quality: 42 }) }));
    expect(reloaded.get('quality')).toBe('auto');
  });

  it('defaults musicVolume to 0.5, clamps out-of-range sets, and sanitizes corrupt persisted data', () => {
    const settings = createSettings(fakeStorage());
    expect(settings.get('musicVolume')).toBe(0.5);

    settings.set('musicVolume', 5);
    expect(settings.get('musicVolume')).toBe(1);
    settings.set('musicVolume', -2);
    expect(settings.get('musicVolume')).toBe(0);
    settings.set('musicVolume', 0.25);
    expect(settings.get('musicVolume')).toBe(0.25);

    const reloaded = createSettings(fakeStorage({ 'whisker-walk-settings': JSON.stringify({ musicVolume: 'loud' }) }));
    expect(reloaded.get('musicVolume')).toBe(0.5);
  });

  it('defaults perfReadout to false, rejects a non-boolean, persists a set', () => {
    expect(createSettings(fakeStorage()).get('perfReadout')).toBe(false);
    const bad = createSettings(fakeStorage({ 'whisker-walk-settings': JSON.stringify({ perfReadout: 'yes' }) }));
    expect(bad.get('perfReadout')).toBe(false);
    const storage = fakeStorage();
    createSettings(storage).set('perfReadout', true);
    expect(createSettings(storage).get('perfReadout')).toBe(true);
  });

  it('haptics (the Vibration switch) defaults to on, rejects a non-boolean, persists a set', () => {
    expect(createSettings(fakeStorage()).get('haptics')).toBe(true);
    for (const junk of ['no', 0, null, {}, []]) {
      const bad = createSettings(fakeStorage({ 'whisker-walk-settings': JSON.stringify({ haptics: junk }) }));
      expect(bad.get('haptics')).toBe(true);
    }
    // A settings object saved before the switch existed keeps everything and gains it, on.
    const old = createSettings(fakeStorage({ 'whisker-walk-settings': JSON.stringify({ volume: 0.3, muted: true }) }));
    expect(old.all()).toMatchObject({ volume: 0.3, muted: true, haptics: true });
    const storage = fakeStorage();
    createSettings(storage).set('haptics', false);
    expect(createSettings(storage).get('haptics')).toBe(false);
  });

  it('cameraZoom defaults to step 1 (today\'s camera), turns junk into the default, persists a valid step', () => {
    expect(createSettings(fakeStorage()).get('cameraZoom')).toBe(1);
    for (const junk of ['far', 2.5, -1, 4, 99, NaN, null, true, {}, [2]]) {
      const s = createSettings(fakeStorage({ 'whisker-walk-settings': JSON.stringify({ cameraZoom: junk }) }));
      expect(s.get('cameraZoom')).toBe(1);
    }
    const storage = fakeStorage();
    const s = createSettings(storage);
    s.set('cameraZoom', 3);
    expect(s.get('cameraZoom')).toBe(3);
    s.set('cameraZoom', 7); // out of range: kept at the last good value
    expect(s.get('cameraZoom')).toBe(3);
    s.set('cameraZoom', 'close');
    expect(s.get('cameraZoom')).toBe(3);
    s.set('cameraZoom', 0);
    expect(createSettings(storage).get('cameraZoom')).toBe(0);
  });

  // 2026-11-15, guided-first-walk design (section 8): "Show tips".
  it('showTips is on by default, persists a set, and junk reads as on', () => {
    const storage = fakeStorage();
    const settings = createSettings(storage);
    expect(settings.get('showTips')).toBe(true);
    settings.set('showTips', false);
    expect(createSettings(storage).get('showTips')).toBe(false);
    const junk = createSettings(fakeStorage({ 'whisker-walk-settings': JSON.stringify({ showTips: 'no' }) }));
    expect(junk.get('showTips')).toBe(true);
  });
});
