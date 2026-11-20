import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createProgression, BACKUP_KEYS } from '../src/progression.js';

// test/fixtures/save-2026-11-19.json is a save written by the 2026-11-19 build
// through the progression's public API. It is never re-recorded. A later build
// that cannot load it is a bug in that build. If a deliberate migration changes
// a value, change the assertion for that path below, with a comment saying why,
// never the fixture.

// progression.js does not export its save key, so the literal is used here.
const SAVE_KEY = 'whisker-walk-save';
const RAW = readFileSync(new URL('./fixtures/save-2026-11-19.json', import.meta.url), 'utf8');

function spyStorage(initial) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  return {
    map, writes,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { writes.push(k); map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

// Every leaf of `want` must be in `got` at the same path and equal. `got` may
// have more: a later build may add fields (and array entries after the ones
// the fixture has).
function missingLeaves(want, got, path = '') {
  if (want !== null && typeof want === 'object') {
    if (got === null || typeof got !== 'object') return [`${path}: expected ${Array.isArray(want) ? 'an array' : 'an object'}`];
    const out = [];
    for (const key of Object.keys(want)) out.push(...missingLeaves(want[key], got[key], `${path}/${key}`));
    return out;
  }
  return Object.is(want, got) ? [] : [`${path}: ${JSON.stringify(want)} became ${JSON.stringify(got)}`];
}

describe('the 2026-11-19 save', () => {
  it('has substance (the fixture is not an empty save)', () => {
    const fixture = JSON.parse(RAW);
    expect(fixture.lifetimePoints).toBeGreaterThan(0);
    expect(Object.values(fixture.walks).some((n) => n > 0)).toBe(true);
    expect(fixture.customCats.length).toBeGreaterThan(0);
    expect(fixture.golden.length).toBeGreaterThan(0);
  });

  it('loads without being set aside as unreadable and keeps every value', () => {
    const storage = spyStorage({ [SAVE_KEY]: RAW });
    const progression = createProgression(storage);
    expect(storage.map.has(BACKUP_KEYS.unreadable)).toBe(false);
    expect(missingLeaves(JSON.parse(RAW), JSON.parse(JSON.stringify(progression.state)))).toEqual([]);
  });

  it('does not write on load', () => {
    // Today's build loads this save as it is: no migration marker, no
    // retirement, nothing to persist. A later build that must write on load
    // (a migration) may relax this to "the written save still holds every
    // fixture leaf", with a comment saying why.
    const storage = spyStorage({ [SAVE_KEY]: RAW });
    createProgression(storage);
    expect(storage.writes).toEqual([]);
    expect(storage.map.get(SAVE_KEY)).toBe(RAW);
  });
});
