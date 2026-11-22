import { describe, it, expect, vi } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';


stubCanvasDocument();

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
