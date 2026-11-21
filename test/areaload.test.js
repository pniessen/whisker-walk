import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAreaLoader, AreaLoadError, AREA_LOAD_TIMEOUT_MS } from '../src/game/areaload.js';

afterEach(() => { vi.useRealTimers(); });

describe('the area loader', () => {
  it('loads once, joins a load in flight, then answers loaded()', async () => {
    let release; const pack = { id: 'a', world: {}, life: {} };
    const a = vi.fn(() => new Promise((r) => { release = () => r(pack); }));
    const loader = createAreaLoader({ loaders: { a } });
    expect(loader.loaded('a')).toBeNull();
    const p1 = loader.ensure('a'); const p2 = loader.ensure('a');
    expect(a).toHaveBeenCalledTimes(1);
    release();
    expect(await p1).toBe(pack); expect(await p2).toBe(pack);
    expect(loader.loaded('a')).toBe(pack);
    expect(await loader.ensure('a')).toBe(pack);
    expect(a).toHaveBeenCalledTimes(1);
  });
  it('forgets a failed load, so the next ensure tries again', async () => {
    const boom = new Error('offline'); const pack = { id: 'a', world: {}, life: {} };
    const a = vi.fn().mockRejectedValueOnce(boom).mockResolvedValueOnce(pack);
    const loader = createAreaLoader({ loaders: { a } });
    const err = await loader.ensure('a').catch((e) => e);
    expect(err).toBeInstanceOf(AreaLoadError);
    expect(err.kind).toBe('failed'); expect(err.areaId).toBe('a'); expect(err.cause).toBe(boom);
    expect(loader.loaded('a')).toBeNull();
    expect(await loader.ensure('a')).toBe(pack);
    expect(a).toHaveBeenCalledTimes(2);
  });
  it('an unknown place is refused without a load', async () => {
    const a = vi.fn();
    const loader = createAreaLoader({ loaders: { a } });
    const err = await loader.ensure('nowhere').catch((e) => e);
    expect(err).toBeInstanceOf(AreaLoadError); expect(err.kind).toBe('unknown');
    expect(a).not.toHaveBeenCalled();
  });
  it('gives up after AREA_LOAD_TIMEOUT_MS, and keeps a pack that arrives late', async () => {
    vi.useFakeTimers();
    let release; const pack = { id: 'a', world: {}, life: {} };
    const a = vi.fn(() => new Promise((r) => { release = () => r(pack); }));
    const loader = createAreaLoader({ loaders: { a } });
    const p = loader.ensure('a').catch((e) => e);
    await vi.advanceTimersByTimeAsync(AREA_LOAD_TIMEOUT_MS);
    const err = await p;
    expect(err).toBeInstanceOf(AreaLoadError); expect(err.kind).toBe('timeout');
    release(); await vi.advanceTimersByTimeAsync(0);
    expect(loader.loaded('a')).toBe(pack);
    expect(await loader.ensure('a')).toBe(pack);
    expect(a).toHaveBeenCalledTimes(1);
  });
  it('prefetch never throws and never rejects', async () => {
    const a = vi.fn().mockRejectedValue(new Error('offline'));
    const loader = createAreaLoader({ loaders: { a } });
    expect(loader.prefetch('a')).toBeUndefined();
    expect(loader.prefetch('nowhere')).toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(a).toHaveBeenCalledTimes(1);
  });
  it('ensureAll loads every id', async () => {
    const loaders = { a: async () => ({ id: 'a' }), b: async () => ({ id: 'b' }) };
    const loader = createAreaLoader({ loaders });
    expect((await loader.ensureAll()).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
