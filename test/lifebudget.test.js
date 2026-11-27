import { describe, it, expect } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { measureWithLife } = await import('./helpers/lifebudget.js');
const { build: buildMoon } = await import('../src/world/moon.js');
const { build: buildReef } = await import('../src/world/reef.js');
const { build: buildCrystal } = await import('../src/world/crystal.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build: buildTreehouse } = await import('../src/world/treehouse.js');
const { loadSnowvilleStages } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build: buildSnowville } = await import('../src/world/snowville.js');
const { loadJungleStages } = await import('../src/world/junglestages.js');
await loadJungleStages();
const { build: buildJungle } = await import('../src/world/jungle.js');

// test/budget.test.js's rows for the newest areas count build(scene) alone. These count the whole frame: the build plus the
// walk's life layer (sky, flakes, fireflies, rain, strings of lights, glows, critters). Each row is an UPPER BOUND at measured +12%
// (never a lower bound); the failure message carries the measured value. The street places' budget is 280 / 210 / 62,000.
const STREET = [280, 210, 62000];
const ROWS = [
  // name, builder, meshes, casters, triangles (measured build+life +12%; numbers in docs/headroom.md)
  ['moon', buildMoon, 61, 8, 49400],
  ['reef', buildReef, 101, 2, 74200],
  ['crystal', buildCrystal, 32, 2, 36900],
  ['treehouse', buildTreehouse, 23, 2, 66200],
  ['snowville', buildSnowville, 36, 3, 47700], // 46,500 before the ski slope (round three, +1,356 built)
  ['jungle', buildJungle, 31, 4, 55700],
];

describe('build + life: the whole frame of the newest areas', () => {
  for (const [name, build, m, c, t] of ROWS) {
    it(`${name}: build + life stays within ${m} meshes / ${c} casters / ${t} triangles`, () => {
      const r = measureWithLife(build);
      const msg = `${name} measured build+life ${r.whole.meshes} / ${r.whole.casters} / ${r.whole.triangles} (build ${JSON.stringify(r.build)}, life ${JSON.stringify(r.life)})`;
      expect(r.whole.meshes, msg).toBeLessThanOrEqual(m);
      expect(r.whole.casters, msg).toBeLessThanOrEqual(c);
      expect(r.whole.triangles, msg).toBeLessThanOrEqual(t);
    });
  }
  it('prints the street places budget for comparison', () => { expect(STREET).toEqual([280, 210, 62000]); });
});
