import { describe, it, expect } from 'vitest';
import { MAIN_GZIP_CEILING_KB, mainScript, sizeProblem } from '../scripts/buildjson.mjs';

// `npm run build` fails when the main script grows past its gzip ceiling, so
// the download a child's phone makes before the game starts never grows by
// accident.
describe('the main script download ceiling', () => {
  it('is 900 kB gzipped', () => {
    expect(MAIN_GZIP_CEILING_KB).toBe(900);
  });

  it('passes a script under the ceiling, and one exactly at it', () => {
    expect(sizeProblem(801_000)).toBeNull();
    expect(sizeProblem(900_000)).toBeNull();
  });

  it('fails a script over the ceiling, naming the size and the ceiling', () => {
    const problem = sizeProblem(900_001);
    expect(problem).toMatch(/900\.0 kB gzipped/);
    expect(problem).toMatch(/ceiling of 900 kB/);
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
