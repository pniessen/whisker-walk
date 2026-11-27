import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { HEAVY_COST, HEAVY_TESTS, LIGHT_COST, HeavyFirst, costOf, dealShards } from './heavy.js';

const LIGHT = Array.from({ length: 365 }, (_, i) => `test/light${String(i).padStart(3, '0')}.test.js`);
const ALL = [...HEAVY_TESTS.map((f) => `test/${f}`), ...LIGHT];
const total = (paths, shard) => shard.reduce((s, i) => s + costOf(paths[i]), 0);

describe('dealShards', () => {
  it('puts every file in exactly one shard', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const shards = dealShards(ALL, count);
      expect(shards).toHaveLength(count);
      expect(shards.flat().sort((a, b) => a - b)).toEqual(ALL.map((_, i) => i));
    }
  });

  it('gives the four shards the same seconds of work, to within one light file', () => {
    const totals = dealShards(ALL, 4).map((s) => total(ALL, s));
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(LIGHT_COST);
  });

  it('deals the four heaviest files to four different shards', () => {
    const shards = dealShards(ALL, 4);
    const shardOf = (i) => shards.findIndex((s) => s.includes(i));
    expect(new Set([0, 1, 2, 3].map(shardOf)).size).toBe(4);
  });

  it('gives the same split whatever order the files arrive in', () => {
    const byName = (paths, shards) => shards.map((s) => s.map((i) => paths[i]).sort());
    const reversed = [...ALL].reverse();
    expect(byName(reversed, dealShards(reversed, 4))).toEqual(byName(ALL, dealShards(ALL, 4)));
  });

  it('balances files it has no cost for, by count', () => {
    const shards = dealShards(LIGHT.slice(0, 10), 4);
    expect(shards.map((s) => s.length)).toEqual([3, 3, 2, 2]);
  });
});

describe('the heavy list', () => {
  it('is longest first (HeavyFirst starts them in this order)', () => {
    const secs = HEAVY_COST.map(([, s]) => s);
    expect(secs).toEqual([...secs].sort((a, b) => b - a));
  });

  it('names files that exist in test/', () => {
    const files = new Set(readdirSync(new URL('.', import.meta.url)));
    expect(HEAVY_TESTS.filter((f) => !files.has(f))).toEqual([]);
  });

  it('counts a file it does not list as a light file', () => {
    expect(costOf('/x/test/gorge.test.js')).toBe(109);
    expect(costOf('/x/test/somethingnew.test.js')).toBe(LIGHT_COST);
  });
});

describe('HeavyFirst.shard', () => {
  const run = (root, index) => {
    const files = ALL.map((p) => ({ moduleId: `${root}/${p}` }));
    const seq = new HeavyFirst({ config: { root, shard: { index, count: 4 } } });
    return seq.shard(files).then((got) => got.map((f) => f.moduleId.slice(root.length + 1)));
  };

  it('splits all the files over the four shards, each once', async () => {
    const parts = await Promise.all([1, 2, 3, 4].map((i) => run('/repo', i)));
    expect(parts.flat().sort()).toEqual([...ALL].sort());
  });

  it('splits the same way whatever the checkout is called', async () => {
    for (const i of [1, 2, 3, 4]) {
      expect(await run('/home/runner/work/whisker-walk', i)).toEqual(await run('/Users/x/cat-game', i));
    }
  });
});
