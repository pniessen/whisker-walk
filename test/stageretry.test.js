import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAreaLoader } from '../src/game/areaload.js';

// A stage chunk that fails once (an offline blip) must not stay failed: the next ask refetches.
const CASES = [
  ['reef', '../src/world/reefstages.js', 'loadReefStages', '../src/world/reefstagewreck.js'],
  ['crystal', '../src/world/crystalstages.js', 'loadCrystalStages', '../src/world/crystalstageplay.js'],
  ['moon', '../src/world/moonstages.js', 'loadMoonStages', '../src/world/moonstagerover.js'],
];

describe('stage loaders retry after a failed download', () => {
  beforeEach(() => { vi.resetModules(); vi.doUnmock('../src/world/reefstagewreck.js'); });
  for (const [name, mod, fn, dep] of CASES) {
    it(`${name}: the second call succeeds after the first import rejects`, async () => {
      let fail = true;
      vi.doMock(dep, () => { if (fail) throw new Error('offline'); return {}; });
      const m = await import(mod);
      await expect(m[fn]()).rejects.toThrow();
      fail = false;
      vi.resetModules(); // a rejected import is not cached by the loader; the mock factory runs again
      const again = await import(mod);
      // the same module instance must also recover without a reset: call on the first instance
      await expect(m[fn]()).resolves.toBe(m.ST);
      expect(again[fn]).toBeTypeOf('function');
      vi.doUnmock(dep);
    });
  }
  it('through the area loader: a failure then a retry loads the stage', async () => {
    let fail = true;
    vi.doMock('../src/world/reefstagewreck.js', () => { if (fail) throw new Error('offline'); return {}; });
    const s = await import('../src/world/reefstages.js');
    const loader = createAreaLoader({ loaders: { reef: () => s.loadReefStages().then(() => ({ id: 'reef', world: {}, life: {} })) } });
    await expect(loader.ensure('reef')).rejects.toMatchObject({ kind: 'failed' });
    fail = false;
    expect((await loader.ensure('reef')).id).toBe('reef');
  });
});
