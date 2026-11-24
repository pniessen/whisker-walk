import { describe, it, expect } from 'vitest';
import { realBuild } from './helpers/realbuild.js';
import { startupFiles, lazyProblems, areaDownloads, areaSizeProblems, TELE_ENTRY_MODULES, TELE_GZIP_CEILING_KB, MAIN_GZIP_CEILING_KB } from '../scripts/buildjson.mjs';
import { IOS_MODE } from '../vite.config.js';

// The teleport gates (src/teleport.js, src/teleui.js, src/world/telegate.js) are ONE lazy chunk. If a start-up module ever
// imports one of them, the chunk folds into start-up and this fails the build. Plan, milestone 1: lazy chunks 30 kB gz.
describe('the teleport chunk guard (scripts/buildjson.mjs)', () => {
  const M = {
    'index.html': { file: 'assets/main.js', isEntry: true, imports: ['_three.js'] },
    '_three.js': { file: 'assets/three.js' },
    'src/teleport.js': { file: 'assets/teleport.js', isDynamicEntry: true, imports: ['_three.js'] },
    'src/cat/suitkit.js': { file: 'assets/suitkit.js', isDynamicEntry: true, imports: ['_three.js'] },
  };
  it('names the module, a ceiling of 30 kB, and the start-up ceiling is untouched', () => {
    expect(TELE_ENTRY_MODULES).toEqual({ tele: ['src/teleport.js'], suit: ['src/cat/suitkit.js'] });
    expect(TELE_GZIP_CEILING_KB).toBe(30);
    expect(MAIN_GZIP_CEILING_KB).toBe(720);
  });
  it('a lazy chunk passes; one imported from start-up, or missing, is named', () => {
    expect(lazyProblems(M, TELE_ENTRY_MODULES)).toEqual([]);
    const bad = { ...M, 'index.html': { ...M['index.html'], imports: ['_three.js', 'src/teleport.js'] } };
    expect(lazyProblems(bad, TELE_ENTRY_MODULES)[0]).toMatch(/src\/teleport\.js/);
    const { 'src/teleport.js': _gone, ...none } = M;
    expect(lazyProblems(none, TELE_ENTRY_MODULES)[0]).toMatch(/src\/teleport\.js/);
  });
  it('over 30 kB is reported, 30 is not', () => {
    expect(areaSizeProblems({ tele: 30.1 }, TELE_GZIP_CEILING_KB)[0]).toMatch(/tele.*30\.1 kB/);
    expect(areaSizeProblems({ tele: 30 }, TELE_GZIP_CEILING_KB)).toEqual([]);
    expect(areaDownloads(M, TELE_ENTRY_MODULES).tele).toEqual(['assets/teleport.js']);
  });
});

for (const mode of ['production', IOS_MODE]) {
  describe(`the teleport chunk in the ${mode} bundle`, () => {
    it('is a dynamic entry that start-up never downloads, under its ceiling, and is precached', async () => {
      const b = await realBuild(mode);
      expect(lazyProblems(b.manifest, TELE_ENTRY_MODULES)).toEqual([]);
      const c = b.manifest['src/teleport.js'];
      expect(c?.isDynamicEntry).toBe(true);
      expect(startupFiles(b.manifest)).not.toContain(c.file);
      expect(b.files.has(c.file)).toBe(true);
      const dl = areaDownloads(b.manifest, TELE_ENTRY_MODULES);
      const kb = (dl.tele ?? []).reduce((n, f) => n + b.gz(f), 0) / 1000;
      expect(kb).toBeLessThanOrEqual(TELE_GZIP_CEILING_KB);
      // milestone 2: the suit kit is a lazy chunk of its own, never folded into start-up or into the gates' chunk
      const kit = b.manifest['src/cat/suitkit.js'];
      expect(kit?.isDynamicEntry).toBe(true);
      expect(startupFiles(b.manifest)).not.toContain(kit.file);
      expect(dl.tele).not.toContain(kit.file);
      expect((dl.suit ?? []).reduce((n, f) => n + b.gz(f), 0) / 1000).toBeLessThanOrEqual(TELE_GZIP_CEILING_KB);
      const pre = b.files.get('precache.json');
      if (pre) {
        const list = new Set(JSON.parse(String(pre.source)).files);
        for (const f of [...dl.tele, ...dl.suit]) expect(list.has(f), `${f} is precached`).toBe(true);
      }
    }, 300_000);

    it('none of the gate looks or words leak into the start-up files', async () => {
      const b = await realBuild(mode);
      const code = (f) => String(b.files.get(f).code ?? '');
      const start = startupFiles(b.manifest).map(code).join('\n');
      expect(start).not.toContain('teleStones');
      expect(start).not.toContain('teleDisc');
      expect(start).not.toContain('tele-swirl');
      expect(start).not.toContain('Go through');
      expect(start).not.toContain('suit-pack-');
      expect(code(b.manifest['src/teleport.js'].file)).toContain('teleDisc');
    }, 300_000);
  });
}
