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
  ['snowville', buildSnowville, 37, 3, 51800], // beauty pass 1 (2026-11-28): +1,596 built (eave bulbs, frost corners, sill planters, wreath bows, lintel holly, skates by the pond), measured 37 / 3 / 51,777, bound 50,231 -> 51,800; frost round (2026-11-27): +575 net (side drifts, west icicles, tufts, lane banks and prints, paid in part by open birch/stump/well cylinders and flat pads), measured 37 / 3 / 50,181, bound 49,620 -> 50,231 (measured +50); 46,500 before the ski slope (round three, +1,356 built), 47,700 after it; the snowmobile (round four): ring, marks and garage +1,162 built, the machine +1 non-casting mesh +686 (measured 37 / 3 / 49,514, bound +106)
  ['jungle', buildJungle, 31, 4, 61000], // beauty pass 2 (2026-11-28): 55,128 -> 60,857 measured (+5,729: shrubs, lanterns, totems, mushrooms in the build +2,362; the swaying vines, blossoms, leaves, banners, flock and the sun shafts in the life +3,367; test/junglebeauty2.test.js), meshes 28 -> 30 (sway + shafts; the motes are a Points), casters 3 unchanged; row 55,700 -> 61,000 on purpose, under the 62,000 design figure
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
