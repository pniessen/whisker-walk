// The test files that take ~20 s or more of one worker each in a full run,
// with those seconds (measured in a full run, 2026-11-26, with other builds
// running on the same Mac, so inflated but in proportion; regenerate with
// `node scripts/heavycost.mjs <vitest --reporter=json report>`, longest first): whole-cat pose
// sweeps that raycast every vertex against the fur, and whole built territories. Three uses, all through vite.config.js:
//
//   - HeavyFirst runs them before everything else. Vitest orders files by the
//     durations it cached on the last run, and with no cache (a fresh CI
//     checkout) by file size, largest first. The pose sweeps live in small
//     files that call a sweep from test/helpers/ (so they run side by side),
//     so by size they would start LAST, and a 60 s file started at the end
//     makes the whole run 60 s longer.
//   - HeavyFirst also splits the files over CI's shards by these seconds (see
//     dealShards below), so the shards finish close together.
//   - `npm run test:quick` leaves them out, for a fast check while working.
//     `npm test` always runs everything.
//
// A file that grows heavy can be added here; one that is missing is still run
// by `npm test`, only perhaps later than it should start, and it counts as an
// ordinary file when the shards are dealt. The seconds only need to be right
// relative to each other.
export const HEAVY_COST = [
  ['fairgames.test.js', 178],
  ['housecamera.test.js', 140], // 28 before the east wing's rooms and ledges joined its sweeps
  ['folds.test.js', 130],
  ['gorge.test.js', 124],
  ['fightcamworld.pines.test.js', 100],
  ['fightcamworld.moor.test.js', 94],
  ['fightcamworld.test.js', 84],
  ['farmjobs.test.js', 77],
  ['catnap.test.js', 75],
  ['builder.test.js', 74],
  ['fightcamworld.river.test.js', 66],
  ['catballoon.test.js', 63],
  ['reeflabshow.test.js', 58],
  ['reefridelive.test.js', 57],
  ['catmodel.test.js', 50],
  ['marketlive.test.js', 40],
  ['foundwearfit.test.js', 38],
  ['dencats-den.test.js', 33],
  ['walkon.test.js', 30],
  ['roofs.test.js', 29],
  ['straycats.test.js', 29],
  ['bumps.test.js', 28],
  ['catsitupright.items.test.js', 28],
  ['housebudget.test.js', 24],
  ['houseguards.test.js', 24],
  ['fairshow.people.test.js', 23],
  ['people.reach.test.js', 21],
  // every shipped map traced again in the everyday words (series A3): 9 s in
  // a full run, 2026-11-26, lighter than the rest but a whole-world build; listed
  // so it starts early beside its family-words twin instead of last
  ['flattrace.offwords.test.js', 9],
  // two whole builds (public and family) searched for the private edition's tokens: 1 s alone, more with the suite running
  ['privateedition.test.js', 5],
];

export const HEAVY_TESTS = HEAVY_COST.map(([file]) => file);

// Every other file, on average, in the same run (365 files, about 620 s).
export const LIGHT_COST = 2;

const COST = new Map(HEAVY_COST);
const base = (moduleId) => moduleId.split(/[\\/]/).pop();

export const costOf = (path) => COST.get(base(path)) ?? LIGHT_COST;

// Split files over `count` shards so each gets about the same seconds of work:
// the dearest file first, each to the shard with the least so far (ties to the
// lower shard). Vitest's own split cuts the files into equal COUNTS, so where
// the heavy files fall is luck (a run took 2.2 / 2.6 / 2.8 / 4.0 min).
//
// Each CI machine works out the split on its own, so it must not depend on
// anything that differs between them: only the paths (relative to the root)
// and the fixed costs above, never vitest's cache of timings, and not the
// order the files arrive in. Returns `count` lists of indexes into `paths`.
export function dealShards(paths, count, cost = costOf) {
  const order = paths
    .map((path, i) => ({ path, i, cost: cost(path) }))
    .sort((a, b) => b.cost - a.cost || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const totals = new Array(count).fill(0);
  const shards = totals.map(() => []);
  for (const { i, cost: c } of order) {
    let least = 0;
    for (let s = 1; s < count; s++) if (totals[s] < totals[least]) least = s;
    totals[least] += c;
    shards[least].push(i);
  }
  return shards;
}

const relativeTo = (root, moduleId) => {
  const slash = (p) => p.replace(/\\/g, '/');
  const r = slash(root).replace(/\/$/, '');
  const m = slash(moduleId);
  return m.startsWith(`${r}/`) ? m.slice(r.length + 1) : m;
};

// A test sequencer: vitest's own order (its BaseSequencer, loaded only when
// vitest runs, so `vite build` never imports vitest), with HEAVY_TESTS moved
// to the front in the order listed, and shards dealt by cost (dealShards).
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
    const { root, shard } = this.ctx.config;
    const paths = files.map((f) => relativeTo(root, f.moduleId));
    return dealShards(paths, shard.count)[shard.index - 1].map((i) => files[i]);
  }

  async sort(files) {
    const sorted = await (await this.base()).sort(files);
    const rank = (f) => HEAVY_TESTS.indexOf(base(f.moduleId));
    const heavy = sorted.filter((f) => rank(f) >= 0).sort((a, b) => rank(a) - rank(b));
    return [...heavy, ...sorted.filter((f) => rank(f) < 0)];
  }
}
