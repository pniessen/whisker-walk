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
