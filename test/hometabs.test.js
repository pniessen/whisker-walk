import { describe, it, expect } from 'vitest';
import { HOME_TABS, resolveTab } from '../src/ui/hometabs.js';

describe('home base tabs', () => {
  it('lists the four tabs in order, play first', () => {
    expect(HOME_TABS).toEqual(['play', 'social', 'album', 'settings']);
  });
  it('resolveTab keeps a known id', () => {
    for (const t of HOME_TABS) expect(resolveTab(t)).toBe(t);
  });
  it('resolveTab falls back to play for unknown/empty/non-string', () => {
    expect(resolveTab('nope')).toBe('play');
    expect(resolveTab('')).toBe('play');
    expect(resolveTab(undefined)).toBe('play');
    expect(resolveTab(null)).toBe('play');
    expect(resolveTab(42)).toBe('play');
  });
});
