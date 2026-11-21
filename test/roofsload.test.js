import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setRoofs, loadRoofs, loadedRoofs } from '../src/roofsflag.js';
import { lifecycle, fakeEl } from './helpers/walklife.js';

// =============================================================================
// The Rooftops' drawing is its own download (roofsflag.js loadRoofs, build fix
// F2). When that download fails (offline, a deploy swapped underneath), Explore
// with ?roofs=1 still goes somewhere: she walks her own place, never a blank
// screen. Here world/roofs.js cannot be loaded at all.
// =============================================================================

const tries = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/world/roofs.js', () => {
  tries.n++;
  throw new Error('offline');
});

beforeEach(() => {
  globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete globalThis.document;
  setRoofs(null);
  vi.restoreAllMocks();
});

describe('when the Rooftops cannot be loaded', () => {
  it('Explore with the switch walks her own place instead', async () => {
    setRoofs(true);
    const life = lifecycle();
    const started = life.w.beginWalkFromHomebase({ duskMode: false });
    expect(life.getSession()).toBe(null); // home stays up while it tries
    await started;
    expect(life.getSession()?.areaId).toBe('neighborhood');
    expect(tries.n).toBeGreaterThan(0);
    expect(loadedRoofs()).toBe(null);
    life.w.endWalk();
  });

  it('a failed fetch is not kept: the next call tries again', async () => {
    await expect(loadRoofs()).rejects.toThrow();
    const before = tries.n;
    await expect(loadRoofs()).rejects.toThrow();
    expect(tries.n).toBe(before + 1);
  });
});
