import { describe, it, expect } from 'vitest';
import { MAIN_GZIP_CEILING_KB, mainScript, sizeProblem, startupFiles, areaDownloads, lazyProblems, areaSizeProblems, TV_ENTRY_MODULES, TV_GZIP_CEILING_KB, tvDownloads, CAT_ENTRY_MODULES } from '../scripts/buildjson.mjs';
import { precacheManifest } from '../scripts/precache.mjs';

const M = {
  'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_three.js', 'src/world/park.js'], dynamicImports: ['src/world/woods.js'] },
  '_three.js': { file: 'assets/three.js' },
  'src/world/park.js': { file: 'assets/park.js' },
  'src/world/woods.js': { file: 'assets/woods.js', isDynamicEntry: true, imports: ['_camp.js', '_three.js'] },
  '_camp.js': { file: 'assets/camp.js' },
};

// `npm run build` fails when the main script grows past its gzip ceiling, so
// the download a child's phone makes before the game starts never grows by
// accident.
describe('the main script download ceiling', () => {
  it('is 720 kB gzipped', () => {
    expect(MAIN_GZIP_CEILING_KB).toBe(720);
  });

  it('passes a script under the ceiling, and one exactly at it', () => {
    expect(sizeProblem(601_000)).toBeNull();
    expect(sizeProblem(720_000)).toBeNull();
  });

  it('fails a script over the ceiling, naming the size and the ceiling', () => {
    const problem = sizeProblem(720_001);
    expect(problem).toMatch(/720.0 kB gzipped/);
    expect(problem).toMatch(/ceiling of 720 kB/);
    expect(problem).toMatch(/MAIN_GZIP_CEILING_KB/);
    expect(sizeProblem(1_234_567)).toMatch(/1234\.6 kB gzipped/);
  });

  it('takes another ceiling when given one', () => {
    expect(sizeProblem(500_000, 400)).toMatch(/ceiling of 400 kB/);
    expect(sizeProblem(500_000, 600)).toBeNull();
  });

  it('finds the main script in the built index.html, not the inline ones', () => {
    const html = `<head>
      <script>window.x = 1;</script>
      <script type="module" crossorigin src="/whisker-walk/assets/index-BGpS5vZE.js"></script>
      <link rel="stylesheet" crossorigin href="/whisker-walk/assets/index-CS9Ie2x3.css">
    </head>`;
    expect(mainScript(html)).toBe('/whisker-walk/assets/index-BGpS5vZE.js');
    expect(mainScript('<script>1</script>')).toBeNull();
  });
});

describe('start-up and places in a built manifest', () => {
  it('start-up is the entry and every chunk it imports, never a dynamic one', () => expect(startupFiles(M).sort()).toEqual(['assets/index.js', 'assets/park.js', 'assets/three.js']));
  it("a place downloads its chunk and its own shared chunks, not start-up's", () => expect(areaDownloads(M, { woods: ['src/world/woods.js'] }).woods.sort()).toEqual(['assets/camp.js', 'assets/woods.js']));
  it('names a place pulled into start-up, and one missing', () => {
    expect(lazyProblems(M, { park: ['src/world/park.js'] })[0]).toMatch(/src\/world\/park\.js/);
    expect(lazyProblems(M, { x: ['src/world/x.js'] })[0]).toMatch(/src\/world\/x\.js/);
    expect(lazyProblems(M, { woods: ['src/world/woods.js'] })).toEqual([]);
  });
  it('a place over its ceiling is named with its size', () => expect(areaSizeProblems({ fair: 100.1, park: 5 })).toEqual([expect.stringMatching(/fair.*100\.1 kB.*AREA_GZIP_CEILING_KB/)]));
  it('precacheManifest lists assets only, sorted, with a build id that follows the files', () => {
    const a = precacheManifest(['index.html', 'assets/b.js', 'assets/a.js', 'assets/a.js', '.vite/manifest.json']);
    expect(a.files).toEqual(['assets/a.js', 'assets/b.js']);
    expect(precacheManifest(['assets/a.js', 'assets/b.js']).build).toBe(a.build);
    expect(precacheManifest(['assets/a.js', 'assets/b.js', 'assets/c.js']).build).not.toBe(a.build);
    expect(a.build).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('the TV chunk guard', () => {
  const tvM = {
    ...M,
    'src/tv/index.js': { file: 'assets/tv.js', isDynamicEntry: true, css: ['assets/tv.css'], imports: ['_three.js'] },
  };
  it('a tv chunk that is lazy passes', () => expect(lazyProblems(tvM, TV_ENTRY_MODULES)).toEqual([]));
  it('names the tv module when start-up imports it statically', () => {
    const bad = { ...tvM, 'index.html': { ...tvM['index.html'], imports: [...tvM['index.html'].imports, 'src/tv/index.js'] } };
    expect(lazyProblems(bad, TV_ENTRY_MODULES)[0]).toMatch(/src\/tv\/index\.js/);
  });
  it('names the tv module when it is missing from the manifest', () => expect(lazyProblems(M, TV_ENTRY_MODULES)[0]).toMatch(/src\/tv\/index\.js/));
  it('a tv chunk over its ceiling is reported', () => {
    expect(TV_GZIP_CEILING_KB).toBe(30);
    expect(areaSizeProblems({ tv: 30.1 }, TV_GZIP_CEILING_KB)[0]).toMatch(/tv.*30\.1 kB/);
    expect(areaSizeProblems({ tv: 30 }, TV_GZIP_CEILING_KB)).toEqual([]);
  });
  it('the tv download is its scripts and its stylesheet, not start-up files', () => {
    expect(tvDownloads(tvM).sort()).toEqual(['assets/tv.css', 'assets/tv.js']);
  });
});

describe('the cat login catch-up chunk guard', () => {
  const catM = { ...M, 'src/game/catsync.js': { file: 'assets/catsync.js', isDynamicEntry: true, imports: ['_three.js'] }, 'src/savecode.js': { file: 'assets/savecode.js', isDynamicEntry: true }, 'src/catcodes.js': { file: 'assets/catcodes.js', isDynamicEntry: true }, 'src/ui/catlogin.js': { file: 'assets/catlogin.js', isDynamicEntry: true, imports: ['_catcodes.js'] } };
  it('a catch-up chunk that is lazy passes', () => expect(lazyProblems(catM, CAT_ENTRY_MODULES)).toEqual([]));
  it('names the module when start-up imports it statically', () => {
    const bad = { ...catM, 'index.html': { ...catM['index.html'], imports: [...catM['index.html'].imports, 'src/game/catsync.js'] } };
    expect(lazyProblems(bad, CAT_ENTRY_MODULES)[0]).toMatch(/src\/game\/catsync\.js/);
  });
  it('names the module when it is missing from the manifest', () => expect(lazyProblems(M, CAT_ENTRY_MODULES)[0]).toMatch(/src\/game\/catsync\.js/));
  it('guards the cat code words and the My cat sheet too (cat login M3): each must stay out of start-up', () => {
    expect(CAT_ENTRY_MODULES.catcodes).toEqual(['src/catcodes.js']);
    expect(CAT_ENTRY_MODULES.catlogin).toEqual(['src/ui/catlogin.js']);
    for (const mod of ['src/catcodes.js', 'src/ui/catlogin.js']) {
      const bad = { ...catM, 'index.html': { ...catM['index.html'], imports: [...catM['index.html'].imports, mod] } };
      expect(lazyProblems(bad, CAT_ENTRY_MODULES).join('\n')).toContain(mod);
    }
  });
});

describe('the layout profile stays tiny', () => {
  it('src/profile.js and src/profilevalues.js are under 1.5 kB gzipped together (as written, comments and all)', async () => {
    const { readFileSync } = await import('node:fs');
    const { gzipSync } = await import('node:zlib');
    const src = ['../src/profile.js', '../src/profilevalues.js'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
    expect(gzipSync(src).length).toBeLessThanOrEqual(1500);
  });
  it('src/profile.js imports nothing', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(new URL('../src/profile.js', import.meta.url), 'utf8')).not.toMatch(/^\s*import\b/m);
  });
});
