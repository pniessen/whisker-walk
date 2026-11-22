import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setHouse } from '../src/houseflag.js';
import { phrase } from '../src/clanphrases.js';
import { createAreaLoader } from '../src/game/areaload.js';
import { lifecycle, fakeEl } from './helpers/walklife.js';

// =============================================================================
// The Old House's drawing is its own download, as every place's is (the
// `house` pack in world/areas.js, fetched by game/areaload.js). When that
// download fails (offline, a deploy swapped underneath), Explore with
// ?house=1 keeps her home with the same gentle line as any place that did not
// come, starts no walk, and the next Explore tries again (online, by starting
// the game fresh). Here world/house.js cannot be loaded at all, as
// test/roofsload.test.js does for the Rooftops.
// =============================================================================

const tries = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/world/house.js', () => {
  tries.n++;
  throw new Error('offline');
});

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  setHouse(null);
  vi.restoreAllMocks();
});

describe('when the house cannot be loaded', () => {
  it('Explore with the switch stays home with the gentle line, and walks nowhere', async () => {
    setHouse(true);
    const areas = createAreaLoader();
    await areas.ensure('neighborhood'); // her own place is here: she still does not walk it
    const life = lifecycle({ areas });
    const started = life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null); // home stays up while it tries
    expect(await started).toBe('failed');
    expect(life.getSession()).toBe(null);
    expect(life.rec.toasts).toEqual([phrase('start.notReadyReload')]);
    expect(tries.n).toBeGreaterThan(0);
    expect(areas.loaded('house')).toBe(null);
  }, 60_000);

  it('a failed fetch online offers a fresh start: the next Explore reloads without another fetch', async () => {
    setHouse(true);
    const life = lifecycle();
    expect(await life.w.beginWalkFromHomebase({ duskMode: false })).toBe('failed');
    const before = tries.n;
    expect(await life.w.beginWalkFromHomebase({ duskMode: false })).toBe('failed');
    expect(tries.n).toBe(before);
    expect(life.rec.reloads).toBe(1);
    expect(life.getSession()).toBe(null);
  }, 60_000);

  it('offline it says the place needs the internet, and never reloads', async () => {
    setHouse(true);
    const life = lifecycle({ online: () => false });
    expect(await life.w.beginWalkFromHomebase({ duskMode: false })).toBe('failed');
    expect(await life.w.beginWalkFromHomebase({ duskMode: false })).toBe('failed');
    expect(life.rec.reloads).toBe(0);
    expect(life.rec.toasts).toEqual([phrase('start.notReadyOffline'), phrase('start.notReadyOffline')]);
    expect(life.getSession()).toBe(null);
  }, 60_000);
});
