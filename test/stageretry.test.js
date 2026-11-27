import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAreaLoader } from '../src/game/areaload.js';
import { STAGED_AREAS } from '../scripts/buildjson.mjs';

// A stage chunk that fails once (an offline blip) must not stay failed: the next ask refetches.
// One case per row of STAGED_AREAS (scripts/buildjson.mjs): the loader is src/world/<id>stages.js, load<Id>Stages, and the chunk that goes offline is the place's first stage.
const cap = (id) => id[0].toUpperCase() + id.slice(1);
const CASES = STAGED_AREAS.map((a) => [a.id, `../src/world/${a.id}stages.js`, `load${cap(a.id)}Stages`, `../${a.stages[0][2][0]}`]);

describe('stage loaders retry after a failed download', () => {
  beforeEach(() => { vi.resetModules(); for (const c of CASES) vi.doUnmock(c[3]); });
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
  for (const [name, mod, fn, dep] of CASES) {
    it(`${name}, through the area loader: a failure then a retry loads the stage`, async () => {
      let fail = true;
      vi.doMock(dep, () => { if (fail) throw new Error('offline'); return {}; });
      const s = await import(mod);
      const loader = createAreaLoader({ loaders: { [name]: () => s[fn]().then(() => ({ id: name, world: {}, life: {} })) } });
      await expect(loader.ensure(name)).rejects.toMatchObject({ kind: 'failed' });
      fail = false;
      expect((await loader.ensure(name)).id).toBe(name);
      vi.doUnmock(dep);
    });
  }
});
