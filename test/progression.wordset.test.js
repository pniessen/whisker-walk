import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createProgression, sanitizeSave } from '../src/progression.js';
import { memoryStorage } from './helpers/storage.js';

const SAVE = 'whisker-walk-save';
const saved = (st) => JSON.parse(st.getItem(SAVE));

describe('the save\'s word preference', () => {
  it('a fresh save has none, and writes it', () => {
    const st = memoryStorage();
    const p = createProgression(st);
    expect(p.state.wordSet).toBeNull();
    p.addPoints(1);
    expect(JSON.stringify(saved(st))).toContain('"wordSet":null');
  });

  it('anything but on or off loads as none', () => {
    for (const v of ['x', 1, true, {}, [], undefined, 'ON']) expect(sanitizeSave({ wordSet: v }).wordSet, String(v)).toBeNull();
    expect(sanitizeSave({ wordSet: 'on' }).wordSet).toBe('on');
    expect(sanitizeSave({ wordSet: 'off' }).wordSet).toBe('off');
  });

  it('setWordSet takes on and off only, and saves', () => {
    const st = memoryStorage();
    const p = createProgression(st);
    expect(p.setWordSet('off')).toBe(true);
    expect(saved(st).wordSet).toBe('off');
    expect(p.setWordSet('on')).toBe(true);
    expect(saved(st).wordSet).toBe('on');
    expect(p.setWordSet('x')).toBe(false);
    expect(p.setWordSet(null)).toBe(false);
    expect(p.state.wordSet).toBe('on');
  });

  it('a save made with the family words keeps them across a load on a device without the key', () => {
    const st = memoryStorage({ [SAVE]: JSON.stringify({ version: 4, points: 5, wordSet: 'on' }) });
    const p = createProgression(st);
    expect(p.state.wordSet).toBe('on');
    p.addPoints(1); // any save
    expect(saved(st).wordSet).toBe('on');
    expect(createProgression(st).state.wordSet).toBe('on');
  });

  it('an earlier save loads with none', () => {
    const raw = readFileSync(new URL('./fixtures/save-2026-11-19.json', import.meta.url), 'utf8');
    const st = memoryStorage({ [SAVE]: raw });
    const p = createProgression(st);
    expect(p.state.wordSet).toBeNull();
  });
});
