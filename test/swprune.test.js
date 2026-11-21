import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildStamp } from '../vite.config.js';
import { BUILD_STAMP } from '../src/buildstamp.js';
import { precacheManifest, stampServiceWorker } from '../scripts/precache.mjs';

// sw.js is a classic script, so the pure decisions are read out of the real
// file between its markers rather than mirrored. The worker's events are
// covered by test/swprecache.test.js.
const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const block = src.split('// prune:start')[1].split('// prune:end')[0];
const { KEEP_BUILDS, precacheUrls, buildsToDrop, assetsToPrune } = new Function(
  `${block}; return { KEEP_BUILDS, precacheUrls, buildsToDrop, assetsToPrune };`
)();

const SCOPE = 'https://x.test/whisker-walk/';
const a = (n) => `${SCOPE}assets/f${n}-abc.js`;

describe('service worker pruning', () => {
  it('keeps at least two builds, so a page open across a deploy still has its files', () => {
    expect(KEEP_BUILDS).toBeGreaterThanOrEqual(2);
  });
  it('drops only /assets/ files outside the kept builds', () => {
    expect(assetsToPrune([a(1), a(2), a(3)], [a(2)])).toEqual([a(1), a(3)]);
    expect(assetsToPrune([a(1), a(2)], [a(1), a(2)])).toEqual([]);
  });
  it('never touches shell, pictures, sounds or build lists', () => {
    const keep = [SCOPE, `${SCOPE}index.html`, `${SCOPE}places/a.png`, `${SCOPE}sounds/x.mp3`, `${SCOPE}__builds/abc`];
    expect(assetsToPrune([...keep, a(1)], [])).toEqual([a(1)]);
  });
  it('drops the oldest build lists beyond the cap, in order', () => {
    expect(buildsToDrop(['b1', 'b2', 'b3', 'b4', 'b5'], 3)).toEqual(['b1', 'b2']);
    expect(buildsToDrop(['b1', 'b2'], 3)).toEqual([]);
    expect(buildsToDrop([], 3)).toEqual([]);
  });
  it('turns a list into absolute asset URLs, ignoring anything outside assets/', () => {
    expect(precacheUrls({ build: 'x', files: ['assets/a.js', 'index.html', '../sw.js', 'assets/b.css'] }, SCOPE)).toEqual([
      `${SCOPE}assets/a.js`,
      `${SCOPE}assets/b.css`,
    ]);
  });
  it('a malformed list gives no URLs', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { files: 'assets/a.js' }, { files: [1, null, {}] }]) {
      expect(precacheUrls(bad, SCOPE)).toEqual([]);
    }
  });
});

describe('the shipped sw.js carries its build', () => {
  it('stamps the build id from precache.json and keeps the worker otherwise unchanged', () => {
    const { build } = precacheManifest(['assets/a.js']);
    const out = stampServiceWorker(src, build);
    expect(out).toContain(build);
    expect(out.endsWith(src)).toBe(true);
  });
  it('two different file lists give different sw.js bytes', () => {
    const one = stampServiceWorker(src, precacheManifest(['assets/a-1.js']).build);
    const two = stampServiceWorker(src, precacheManifest(['assets/a-2.js']).build);
    expect(one).not.toEqual(two);
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
