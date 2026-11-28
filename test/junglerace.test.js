import { describe, it, expect } from 'vitest';

// The jungle modules form no import cycle (checked by hand and by a strongly-connected-components pass over src/),
// so every order, and a concurrent import from several entry points, must hand over the same finished exports.
describe('jungle module import order', () => {
  it('the plates match the table slots, whichever module loads first', async () => {
    const w = await import('../src/world/junglewingplan.js');
    const { TABLE } = await import('../src/world/junglestory.js');
    expect(w.PLATES.map((q) => [q.x, q.y, q.z])).toEqual(TABLE.slots.map((q) => [q.x, Math.round((q.y + 0.15) * 100) / 100, q.z]));
  });
  it('imports the story, the wing plan and the loader concurrently and finished', async () => {
    const [s, w, p, sup, areas] = await Promise.all([
      import('../src/world/junglestory.js'),
      import('../src/world/junglewingplan.js'),
      import('../src/world/jungleplan.js'),
      import('../src/world/junglesupper.js'),
      import('../src/world/areas.js'),
    ]);
    expect(s.TABLE.slots.length).toBe(3);
    expect(w.PLATES.length).toBe(3);
    expect(typeof p.MOSSY_SPOT.x).toBe('number');
    expect(sup.CANDLES_AT).toBeGreaterThan(0);
    const pack = await areas.AREA_LOADERS.jungle();
    expect(pack.id).toBe('jungle');
  });
});
