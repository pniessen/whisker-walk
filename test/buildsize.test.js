import { describe, it, expect } from 'vitest';
import { MAIN_GZIP_CEILING_KB, mainScript, sizeProblem, startupFiles, areaDownloads, lazyProblems, areaSizeProblems } from '../scripts/buildjson.mjs';
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
  it('is 700 kB gzipped', () => {
    expect(MAIN_GZIP_CEILING_KB).toBe(700);
  });

  it('passes a script under the ceiling, and one exactly at it', () => {
    expect(sizeProblem(601_000)).toBeNull();
    expect(sizeProblem(700_000)).toBeNull();
  });

  it('fails a script over the ceiling, naming the size and the ceiling', () => {
    const problem = sizeProblem(700_001);
    expect(problem).toMatch(/700.0 kB gzipped/);
    expect(problem).toMatch(/ceiling of 700 kB/);
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
