// A holiday decor chunk that never arrives must not hold a walk (H8): the walk waits for it at most 4 s, then starts without it.
// (The chunk is the lazy holidayfinds file; here its import never settles, as a hung fetch would.)
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createAreaLoader } from '../src/game/areaload.js';
import { lifecycle, controlledLoader, fakeEl } from './helpers/walklife.js';

vi.mock('../src/world/holidayfinds.js', () => new Promise(() => {}));

beforeAll(async () => { await createAreaLoader().ensureAll(['park']); });
afterEach(() => { delete globalThis.document; vi.restoreAllMocks(); vi.useRealTimers(); });
const clock = (iso) => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date(iso) });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
};

describe('a decor chunk that hangs', () => {
  it('in a window, a place already here starts after 4 s without the decor', async () => {
    clock('2026-12-05T15:00:00');
    const { areas } = controlledLoader();
    await areas.ensure('park');
    const life = lifecycle({ areas, settings: { holidayDecor: 'auto' } });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    await vi.advanceTimersByTimeAsync(3900);
    expect(life.getSession()).toBe(null); // still waiting for the chunk
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toBe('started');
    expect(life.getSession()?.areaId).toBe('park');
    life.w.endWalk();
  });
  it('outside every window the walk never waits for it (same tick)', async () => {
    clock('2026-07-05T15:00:00');
    const { areas } = controlledLoader();
    await areas.ensure('park');
    const life = lifecycle({ areas, settings: { holidayDecor: 'auto' } });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    expect(life.getSession()?.areaId).toBe('park');
    expect(await p).toBe('started');
    life.w.endWalk();
  });
  it('with the decor Off the walk never waits for it either', async () => {
    clock('2026-12-05T15:00:00');
    const { areas } = controlledLoader();
    await areas.ensure('park');
    const life = lifecycle({ areas, settings: { holidayDecor: 'off' } });
    const p = life.w.startWalkWhenReady({ areaOverride: 'park' });
    expect(life.getSession()?.areaId).toBe('park');
    expect(await p).toBe('started');
    life.w.endWalk();
  });
});
