import { describe, it, expect, vi } from 'vitest';


// The same headless canvas stub every world test uses (test/neighborhood.js,
// test/park.js, ...): the world builders touch the DOM in exactly two places
// (document.createElement('canvas') for the billboard poster, and
// render/textures.js's tile painters), and the painters read back their own
// canvas via getImageData, so a blanket no-op Proxy isn't enough — it has to
// answer getImageData with something clampToFloor can iterate.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { AREA_LOADERS, AREA_ENTRY_MODULES } = await import('../src/world/areas.js');
const { CATALOG } = await import('../src/progression.js');

describe('the area registry', () => {
  it('every place a child can walk has a loader, and the den too', () => {
    for (const id of [...Object.keys(CATALOG.areas), 'den']) expect(Object.hasOwn(AREA_LOADERS, id), id).toBe(true);
    expect(Object.keys(AREA_ENTRY_MODULES).sort()).toEqual(Object.keys(AREA_LOADERS).sort());
  });
  it('each loader hands over its own builder module, and the Farm and the Fair their life', async () => {
    for (const id of Object.keys(AREA_LOADERS)) {
      const pack = await AREA_LOADERS[id]();
      expect(pack.id).toBe(id);
      expect(pack.world).toBe(await import(`../src/world/${id}.js`));
      expect(typeof pack.world.build).toBe('function');
    }
    expect((await AREA_LOADERS.farm()).life.createFarmAnimals).toBe((await import('../src/farmanimals.js')).createFarmAnimals);
    const fair = (await AREA_LOADERS.fair()).life;
    expect(fair.createFairLive).toBe((await import('../src/fairlive.js')).createFairLive);
    expect(fair.createFairShow).toBe((await import('../src/fairshow.js')).createFairShow);
  });
});
