import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { realBuild } from './helpers/realbuild.js';
import { AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { startupFiles, areaDownloads, lazyProblems, areaSizeProblems, sizeProblem } from '../scripts/buildjson.mjs';

let b;
beforeAll(async () => { b = await realBuild('production'); }, 600_000);

describe('the real website build is split into start-up and places', () => {
  it('no place is pulled into start-up, and every place is a dynamic chunk', () => {
    expect(lazyProblems(b.manifest)).toEqual([]);
  });

  it('start-up passes the ceiling and is far below every chunk together', () => {
    const start = startupFiles(b.manifest);
    const startKb = start.reduce((n, f) => n + b.gz(f), 0);
    const allKb = b.chunks.reduce((n, c) => n + b.gz(c.fileName), 0);
    expect(sizeProblem(startKb)).toBeNull();
    expect(allKb - startKb).toBeGreaterThanOrEqual(150_000);
  });

  it('every place downloads under its ceiling', () => {
    const dl = areaDownloads(b.manifest);
    expect(Object.keys(dl).sort()).toEqual(Object.keys(AREA_ENTRY_MODULES).sort());
    const kb = Object.fromEntries(Object.entries(dl).map(([id, fs]) => [id, fs.reduce((n, f) => n + b.gz(f), 0) / 1000]));
    expect(areaSizeProblems(kb)).toEqual([]);
  });

  it('the people figure is in place chunks only, never in start-up', () => {
    const start = new Set(startupFiles(b.manifest));
    const own = Object.entries(b.manifest).filter(([k]) => k.startsWith('src/people/'));
    expect(own.length).toBeGreaterThan(0);
    for (const [, e] of own) expect(start.has(e.file), e.file).toBe(false);
    const dl = areaDownloads(b.manifest);
    for (const id of ['neighborhood', 'park', 'docks', 'seaside', 'fair']) {
      expect(own.some(([, e]) => dl[id].includes(e.file)), id).toBe(true);
    }
  });

  it('precache.json lists every emitted file under assets/', () => {
    const p = b.files.get('precache.json');
    expect(p).toBeTruthy();
    const { files, build } = JSON.parse(String(p.source));
    const emitted = [...b.files.keys()].filter((n) => n.startsWith('assets/')).sort();
    expect(files).toEqual(emitted);
    expect(build).toMatch(/^[0-9a-f]{12}$/);
  });

  it('the shipped sw.js carries the build id from precache.json, and is otherwise public/sw.js', () => {
    const { build } = JSON.parse(String(b.files.get('precache.json').source));
    const sw = b.files.get('sw.js');
    expect(sw, 'sw.js is emitted by the build').toBeTruthy();
    const text = String(sw.source);
    expect(text).toContain(build);
    expect(text.endsWith(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'))).toBe(true);
  });
});

describe('the Moon is a landing chunk, three stage chunks and the late arrivals code', () => {
  it('stage A (the landing) and each later stage are under their own ceiling, and all together under the total', async () => {
    const { moonDownloads, MOON_STAGE_ENTRY_MODULES, lazyProblems: lp, MOON_STAGE_GZIP_CEILING_KB, MOON_TOTAL_GZIP_CEILING_KB } = await import('../scripts/buildjson.mjs');
    expect(lp(b.manifest, MOON_STAGE_ENTRY_MODULES)).toEqual([]);
    const dl = moonDownloads(b.manifest);
    const kb = Object.fromEntries(Object.entries(dl).map(([id, fs]) => [id, fs.reduce((n, f) => n + b.gz(f), 0) / 1000]));
    for (const id of ['moon', 'moonhill', 'moonlaunch', 'moonrover', 'moonlate']) {
      expect(dl[id].length, id).toBeGreaterThan(0);
      expect(kb[id], id).toBeLessThanOrEqual(MOON_STAGE_GZIP_CEILING_KB);
    }
    expect(kb.moon).toBeLessThanOrEqual(65); // stage A, the landing, alone
    expect(kb.total).toBeLessThanOrEqual(MOON_TOTAL_GZIP_CEILING_KB);
  });
});

describe('the Reef is four chunks fetched together (R10 stage slots)', () => {
  it('stage A and the lab, wreck and ride stages are each under their ceiling, all four under the total, and start-up grew under 1 kB (658.0 kB before R10)', async () => {
    const { reefDownloads, REEF_STAGE_ENTRY_MODULES, lazyProblems: lp, REEF_STAGE_GZIP_CEILING_KB, REEF_TOTAL_GZIP_CEILING_KB } = await import('../scripts/buildjson.mjs');
    expect(lp(b.manifest, REEF_STAGE_ENTRY_MODULES)).toEqual([]);
    const dl = reefDownloads(b.manifest);
    const kb = Object.fromEntries(Object.entries(dl).map(([id, fs]) => [id, fs.reduce((n, f) => n + b.gz(f), 0) / 1000]));
    for (const id of ['reef', 'reeflab', 'reefwreck', 'reefride']) {
      expect(dl[id].length, id).toBeGreaterThan(0);
      expect(kb[id], id).toBeLessThanOrEqual(REEF_STAGE_GZIP_CEILING_KB);
    }
    expect(kb.total).toBeLessThanOrEqual(REEF_TOTAL_GZIP_CEILING_KB);
    const startKb = startupFiles(b.manifest).reduce((n, f) => n + b.gz(f), 0) / 1000;
    expect(startKb).toBeLessThan(658.0 + 2.5); // +1 for the R10 seams, +1.2 for the area-music chunk link
  });
});
