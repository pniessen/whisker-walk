// The test files that take ~15 s or more of one worker each in a full run,
// with those seconds (measured in a full run, 2026-11-27, on the Mac with ten workers,
// so inflated but in proportion; every file over 15 s is listed; regenerate with
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
  ['fairgames.test.js', 237],
  ['housecamera.test.js', 223],
  ['folds.test.js', 128],
  ['reefridelive.test.js', 118],
  ['reeflabshow.test.js', 117],
  ['gorge.test.js', 109],
  ['foundwearfit.test.js', 87],
  ['fightcamworld.pines.test.js', 86],
  ['fightcamworld.moor.test.js', 81],
  ['houseguards.test.js', 79],
  ['catmodel.test.js', 73],
  ['fightcamworld.test.js', 72],
  ['walkon.test.js', 68],
  ['farmjobs.test.js', 65],
  ['catballoon.test.js', 64],
  ['fightcamworld.river.test.js', 63],
  ['builder.test.js', 63],
  ['catnap.test.js', 63],
  ['roofs.test.js', 56],
  ['housebudget.test.js', 55],
  ['bumps.test.js', 53],
  ['marketlive.test.js', 53],
  ['people.reach.test.js', 52],
  ['dencats-den.test.js', 48],
  ['fairshow.people.test.js', 47],
  ['straycats.test.js', 47],
  ['housegame.test.js', 42],
  ['catdrape.test.js', 41],
  ['budget.test.js', 38],
  ['walkcast.test.js', 36],
  ['dogs.test.js', 35],
  ['holidaywear.test.js', 35],
  ['housefinds.test.js', 33],
  ['catface3.test.js', 31],
  ['catcape.test.js', 30],
  ['roofsbeampad.test.js', 29],
  ['moonidlelive.test.js', 28],
  ['groundsystems.test.js', 28],
  ['moonguidelive.test.js', 28],
  ['reeflabstory.test.js', 26],
  ['farmsim.test.js', 26],
  ['coopm5jungle.test.js', 26],
  ['reeflab.test.js', 26],
  ['housewonder.test.js', 25],
  ['gorgelife.test.js', 25],
  ['catrealposes.test.js', 24],
  ['serieswords.world.test.js', 24],
  ['scarmesh.test.js', 23],
  ['catsitupright.items.test.js', 23],
  ['moonrobots.test.js', 23],
  ['stalktail.test.js', 22],
  ['walkready.test.js', 22],
  ['mergeprops.test.js', 21],
  ['catcodes.test.js', 20],
  ['wadingroutes.test.js', 20],
  ['moonlaunchlive.test.js', 19],
  ['pines.test.js', 19],
  ['coopm5places.test.js', 19],
  ['marketlive-hop.test.js', 18],
  ['moonflowlive.test.js', 18],
  ['areas.test.js', 18],
  ['clancats.test.js', 18],
  ['grass.test.js', 17],
  ['straywater.test.js', 17],
  ['catbackitems.test.js', 17],
  ['moonroverlive.test.js', 16],
  ['fightcam.test.js', 16],
  ['ambient.test.js', 16],
  ['greenhouserooms.test.js', 15],
  ['waterdress.test.js', 15],
];

export const HEAVY_TESTS = HEAVY_COST.map(([file]) => file);

// Every other file, on average, in the same run (789 files, about 1.9 s each, 2026-11-27).
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
