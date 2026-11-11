import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildStamp } from '../vite.config.js';
import { BUILD_STAMP } from '../src/buildstamp.js';

// sw.js is a classic script, so the pure decision is read out of the real file
// between its markers rather than mirrored.
const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const block = src.split('// prune:start')[1].split('// prune:end')[0];
const { MAX_ASSETS, assetsToPrune } = new Function(`${block}; return { MAX_ASSETS, assetsToPrune };`)();

const a = (n) => `https://x.test/whisker-walk/assets/f${n}-abc.js`;

describe('service worker pruning', () => {
  it('prunes nothing at or under the cap', () => {
    expect(assetsToPrune([a(1), a(2)], 2)).toEqual([]);
  });
  it('drops the oldest assets beyond the cap, keeping the newest', () => {
    expect(assetsToPrune([a(1), a(2), a(3), a(4)], 2)).toEqual([a(1), a(2)]);
  });
  it('never touches shell, pictures or icons', () => {
    const keep = ['https://x.test/whisker-walk/', 'https://x.test/whisker-walk/index.html', 'https://x.test/whisker-walk/places/a.png'];
    expect(assetsToPrune([...keep, a(1), a(2)], 1)).toEqual([a(1)]);
  });
  it('keeps room for a couple of builds', () => {
    expect(MAX_ASSETS).toBeGreaterThanOrEqual(9);
  });
  it('hooks pruning into activate and after caching a new asset', () => {
    expect(src).toMatch(/\.then\(pruneAssets\)/);
    expect(src).toMatch(/cache\.put\(request, copy\)\)\.then\(pruneAssets\)/);
  });
});

describe('build stamp', () => {
  it('is sha and UTC date', () => {
    expect(buildStamp(new Date('2026-11-11T23:59:00Z'))).toMatch(/^([0-9a-f]{7,}\+?|dev) · 2026-11-11$/);
  });
  it('is a non-empty string (Vitest applies the config define too)', () => {
    expect(BUILD_STAMP).toMatch(/\S/);
  });
});
