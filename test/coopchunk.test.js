import { describe, it, expect } from 'vitest';
import { realBuild } from './helpers/realbuild.js';
import { startupFiles, lazyProblems, areaDownloads, areaSizeProblems, COOP_ENTRY_MODULES, COOP_GZIP_CEILING_KB, MAIN_GZIP_CEILING_KB } from '../scripts/buildjson.mjs';
import { IOS_MODE } from '../vite.config.js';

// Couch play is ONE lazy chunk. If a start-up module ever imports src/coop/*
// the chunk folds into start-up and this fails the build.
describe('the coop chunk guard (scripts/buildjson.mjs)', () => {
  const M = {
    'index.html': { file: 'assets/main.js', isEntry: true, imports: ['_three.js'] },
    '_three.js': { file: 'assets/three.js' },
    'src/coop/index.js': { file: 'assets/coop.js', isDynamicEntry: true, imports: ['_three.js'] },
  };
  it('names the module, a ceiling of 25 kB, and the start-up ceiling is untouched', () => {
    expect(COOP_ENTRY_MODULES).toEqual({ coop: ['src/coop/index.js'] });
    expect(COOP_GZIP_CEILING_KB).toBe(25);
    expect(MAIN_GZIP_CEILING_KB).toBe(720);
  });
  it('a lazy chunk passes; one imported from start-up, or missing, is named', () => {
    expect(lazyProblems(M, COOP_ENTRY_MODULES)).toEqual([]);
    const bad = { ...M, 'index.html': { ...M['index.html'], imports: ['_three.js', 'src/coop/index.js'] } };
    expect(lazyProblems(bad, COOP_ENTRY_MODULES)[0]).toMatch(/src\/coop\/index\.js/);
    const { 'src/coop/index.js': _gone, ...none } = M;
    expect(lazyProblems(none, COOP_ENTRY_MODULES)[0]).toMatch(/src\/coop\/index\.js/);
  });
  it('over 25 kB is reported, 25 is not', () => {
    expect(areaSizeProblems({ coop: 25.1 }, COOP_GZIP_CEILING_KB)[0]).toMatch(/coop.*25\.1 kB/);
    expect(areaSizeProblems({ coop: 25 }, COOP_GZIP_CEILING_KB)).toEqual([]);
    expect(areaDownloads(M, COOP_ENTRY_MODULES).coop).toEqual(['assets/coop.js']);
  });
});

for (const mode of ['production', IOS_MODE]) {
  describe(`the coop chunk in the ${mode} bundle`, () => {
    it('is a dynamic entry that start-up never downloads, under its ceiling, and is precached', async () => {
      const b = await realBuild(mode);
      expect(lazyProblems(b.manifest, COOP_ENTRY_MODULES)).toEqual([]);
      const c = b.manifest['src/coop/index.js'];
      expect(c?.isDynamicEntry).toBe(true);
      expect(startupFiles(b.manifest)).not.toContain(c.file);
      expect(b.files.has(c.file)).toBe(true);
      const kb = (areaDownloads(b.manifest, COOP_ENTRY_MODULES).coop ?? []).reduce((n, f) => n + b.gz(f), 0) / 1000;
      expect(kb).toBeLessThanOrEqual(COOP_GZIP_CEILING_KB);
      const pre = b.files.get('precache.json');
      if (pre) {
        const list = new Set(JSON.parse(String(pre.source)).files);
        for (const f of areaDownloads(b.manifest, COOP_ENTRY_MODULES).coop) expect(list.has(f), `${f} is precached`).toBe(true);
      }
    }, 300_000);

    it('no couch-play code leaks into the start-up files', async () => {
      const b = await realBuild(mode);
      const code = (f) => String(b.files.get(f).code ?? '');
      const start = startupFiles(b.manifest).map(code).join('\n');
      expect(start).not.toContain('COOP_READY');
      expect(code(b.manifest['src/coop/index.js'].file)).toContain('standard');
    }, 300_000);
  });
}
