import { describe, it, expect } from 'vitest';
import { HOME_TABS, resolveTab } from '../src/ui/hometabs.js';

describe('home base tabs', () => {
  it('lists the five tabs in order, cats first', () => {
    expect(HOME_TABS).toEqual(['cats', 'accessories', 'social', 'album', 'settings']);
  });
  it('resolveTab keeps a known id', () => {
    for (const t of HOME_TABS) expect(resolveTab(t)).toBe(t);
  });
  it('resolveTab falls back to cats for unknown/empty/non-string', () => {
    expect(resolveTab('nope')).toBe('cats');
    expect(resolveTab('')).toBe('cats');
    expect(resolveTab(undefined)).toBe('cats');
    expect(resolveTab(null)).toBe('cats');
    expect(resolveTab(42)).toBe('cats');
  });
  it("resolveTab clamps the pre-rename 'play' id to cats", () => {
    expect(resolveTab('play')).toBe('cats');
  });
});
