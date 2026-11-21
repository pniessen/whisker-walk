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

// A file of its own, so no area module is evaluated before it.
describe('loading an area', () => {
  it('draws no random number and paints nothing', async () => {
    await import('../src/world/builder.js'); await import('../src/render/textures.js'); // what start-up already has
    const { AREA_LOADERS } = await import('../src/world/areas.js');
    const random = vi.spyOn(Math, 'random');
    const paint = vi.spyOn(document, 'createElement');
    for (const id of Object.keys(AREA_LOADERS)) {
      random.mockClear(); paint.mockClear();
      await AREA_LOADERS[id]();
      expect(random, id).not.toHaveBeenCalled();
      expect(paint, id).not.toHaveBeenCalled();
    }
  });
});
