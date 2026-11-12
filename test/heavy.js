// The test files that take ~20 s or more of one worker each in a full run
// (measured on the owner's Mac, 2026-11-11, longest first): whole-cat pose
// sweeps that raycast every vertex against the fur, and whole built
// territories. Two uses, both in vite.config.js:
//
//   - HeavyFirst runs them before everything else. Vitest orders files by the
//     durations it cached on the last run, and with no cache (a fresh CI
//     checkout) by file size, largest first. The pose sweeps live in small
//     files that call a sweep from test/helpers/ (so they run side by side),
//     so by size they would start LAST, and a 60 s file started at the end
//     makes the whole run 60 s longer.
//   - `npm run test:quick` leaves them out, for a fast check while working.
//     `npm test` always runs everything.
//
// A file that grows heavy can be added here; one that is missing is still run
// by `npm test`, only perhaps later than it should start.
export const HEAVY_TESTS = [
  'catcape.tail.cape.test.js',
  'catcape.tail.confetticape.test.js',
  'catcape.sit.confetticape.test.js',
  'catcape.fur.cape.test.js',
  'catcape.fur.confetticape.test.js',
  'folds.test.js',
  'gorge.test.js',
  'catcape.sit.cape.test.js',
  'catbackitems.jetpack.test.js',
  'fightcamworld.pines.test.js',
  'fightcamworld.moor.test.js',
  'fightcamworld.test.js',
  'fightcamworld.river.test.js',
  'catsitupright.test.js',
  'catbackitems.backpack.test.js',
  'catcape.tie.cape.test.js',
  'builder.test.js',
  'catcape.tie.confetticape.test.js',
  'catnap.test.js',
  'catsitupright.items.test.js',
  'catballoon.test.js',
  'catbackitems.test.js',
  'catmodel.test.js',
];

const base = (moduleId) => moduleId.split(/[\\/]/).pop();

// A test sequencer: vitest's own order (its BaseSequencer, loaded only when
// vitest runs, so `vite build` never imports vitest), with HEAVY_TESTS moved
// to the front in the order listed. Sharding is vitest's own.
export class HeavyFirst {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async base() {
    if (!this.inner) {
      const { BaseSequencer } = await import('vitest/node');
      this.inner = new BaseSequencer(this.ctx);
    }
    return this.inner;
  }

  async shard(files) {
    return (await this.base()).shard(files);
  }

  async sort(files) {
    const sorted = await (await this.base()).sort(files);
    const rank = (f) => HEAVY_TESTS.indexOf(base(f.moduleId));
    const heavy = sorted.filter((f) => rank(f) >= 0).sort((a, b) => rank(a) - rank(b));
    return [...heavy, ...sorted.filter((f) => rank(f) < 0)];
  }
}
