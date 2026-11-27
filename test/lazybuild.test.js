import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { realBuild } from './helpers/realbuild.js';
import { AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { startupFiles, areaDownloads, lazyProblems, areaSizeProblems, sizeProblem, STAGED_AREAS, stageEntryModules, stagedAreaDownloads } from '../scripts/buildjson.mjs';

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

describe('every staged place is a landing chunk plus lazy stage chunks (STAGED_AREAS)', () => {
  for (const area of STAGED_AREAS) {
    it(`${area.id}: stage A and each later stage are under their ceiling, all together under the total, each stage lazy and out of start-up`, () => {
      expect(lazyProblems(b.manifest, stageEntryModules(area))).toEqual([]);
      const dl = stagedAreaDownloads(b.manifest, area);
      const kb = Object.fromEntries(Object.entries(dl).map(([id, fs]) => [id, fs.reduce((n, f) => n + b.gz(f), 0) / 1000]));
      for (const id of [area.id, ...area.stages.map(([name]) => name)]) {
        expect(dl[id].length, id).toBeGreaterThan(0);
        expect(kb[id], id).toBeLessThanOrEqual(area.stageCeiling);
      }
      expect(kb.total).toBeLessThanOrEqual(area.totalCeiling);
      expect(startupFiles(b.manifest).some((f) => f.includes(`${area.id}stage`))).toBe(false);
    });
  }

  it('the Moon landing alone stays at 64.98 kB or less (the empty station slot must not grow it)', () => {
    const area = STAGED_AREAS.find((a) => a.id === 'moon');
    const kb = stagedAreaDownloads(b.manifest, area).moon.reduce((n, f) => n + b.gz(f), 0) / 1000;
    expect(kb).toBeLessThanOrEqual(64.98); // 64.98 kB before X0's seams
  });

  it('start-up is within the recorded figure', () => {
    const startKb = startupFiles(b.manifest).reduce((n, f) => n + b.gz(f), 0) / 1000;
    const { kb: pinnedKb, slack } = JSON.parse(readFileSync(new URL('./fixtures/startup-kb.json', import.meta.url), 'utf8'));
    expect(startKb).toBeLessThanOrEqual(pinnedKb + slack); // the figure lives in test/fixtures/startup-kb.json (history in its "history" key); re-record with scripts/recordstartup.mjs
  });
});
