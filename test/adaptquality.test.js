import { describe, it, expect, vi } from 'vitest';
import { createQualityAdapter } from '../src/game/adaptquality.js';
import { LADDER } from '../src/render/quality.js';
import { MEMORY_KEY } from '../src/render/adaptive.js';

// Fakes: a renderer that remembers its pixel ratio, a composer rig of spies,
// a Map-backed storage, and a device with dpr 3 (so the tier cap decides).
function fakeRenderer() {
  let pr = 1;
  return {
    setPixelRatio: vi.fn((v) => { pr = v; }),
    getPixelRatio: () => pr,
  };
}
function fakeRig() {
  return { setPixelRatio: vi.fn(), setBloomStrength: vi.fn() };
}
function fakeStorage(initial) {
  const m = new Map();
  if (initial) m.set(MEMORY_KEY, JSON.stringify(initial));
  return {
    map: m,
    getItem: vi.fn((k) => (m.has(k) ? m.get(k) : null)),
    setItem: vi.fn((k, v) => { m.set(k, String(v)); }),
  };
}
function stored(storage) {
  const text = storage.map.get(MEMORY_KEY);
  return text == null ? null : JSON.parse(text);
}

const DAY = 86_400_000;
const WALL = 100 * DAY;

function setup({ memory, storage, dpr = 3 } = {}) {
  const renderer = fakeRenderer();
  const composerRig = fakeRig();
  const store = storage ?? fakeStorage(memory);
  const adapter = createQualityAdapter({
    renderer, composerRig, storage: store,
    devicePixelRatio: () => dpr,
    wallClock: () => WALL,
  });
  return { adapter, renderer, composerRig, storage: store };
}

// Feeds frames every dtMs from fromMs up to and including toMs.
function run(adapter, session, fromMs, toMs, dtMs) {
  for (let t = fromMs; t <= toMs; t += dtMs) adapter.frame(session, t);
}

describe('createQualityAdapter', () => {
  it('auto on a fresh device starts at rung 0 and counts the walk', () => {
    const { adapter, renderer, composerRig, storage } = setup();
    const tier = adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(tier).toBe(LADDER[0]);
    expect(renderer.getPixelRatio()).toBe(2);
    expect(composerRig.setPixelRatio).toHaveBeenCalledWith(2);
    expect(composerRig.setBloomStrength).toHaveBeenCalledWith(0.35);
    expect(stored(storage).walks).toBe(1);
    expect(adapter.status).toMatchObject({ mode: 'auto', rung: 0, startRung: 0, startReason: 'top', change: '' });
  });

  it('steps a slow device down live, one rung at a time, to the floor', () => {
    const { adapter, renderer, composerRig, storage } = setup();
    const statusRef = adapter.status;
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });

    run(adapter, session, 0, 9100, 30);
    expect(adapter.status.rung).toBe(1);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(composerRig.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(adapter.status.change).toBe('0→1: 100% of frames over 20 ms for 4 s');
    expect(stored(storage).rung).toBe(1);

    composerRig.setBloomStrength.mockClear();
    run(adapter, session, 9130, 14200, 30);
    expect(adapter.status.rung).toBe(2);
    expect(stored(storage).rung).toBe(2);
    expect(composerRig.setBloomStrength).toHaveBeenCalled();
    expect(session.useComposer).toBe(true); // fading, not cut

    run(adapter, session, 14230, 15700, 30);
    expect(session.useComposer).toBe(false);
    expect(composerRig.setBloomStrength).toHaveBeenLastCalledWith(0);
    // the fade is monotonic from 0.35 down to 0
    const strengths = composerRig.setBloomStrength.mock.calls.map(([s]) => s);
    for (let i = 1; i < strengths.length; i++) expect(strengths[i]).toBeLessThanOrEqual(strengths[i - 1]);
    expect(strengths[0]).toBeLessThanOrEqual(0.35);

    run(adapter, session, 15730, 21000, 30);
    expect(adapter.status.rung).toBe(3);
    expect(adapter.status.change).toMatch(/^2→3: \d+% of frames over 20 ms for 4 s \(next walk\)$/);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(stored(storage).rung).toBe(3);

    const writes = storage.setItem.mock.calls.length;
    const prCalls = renderer.setPixelRatio.mock.calls.length;
    const bloomCalls = composerRig.setBloomStrength.mock.calls.length;
    run(adapter, session, 21030, 40000, 30);
    expect(storage.setItem.mock.calls.length).toBe(writes);
    expect(renderer.setPixelRatio.mock.calls.length).toBe(prCalls);
    expect(composerRig.setBloomStrength.mock.calls.length).toBe(bloomCalls);
    expect(adapter.status.rung).toBe(3);
    expect(adapter.status).toBe(statusRef); // one object, mutated in place
  });

  it('a steady 60 fps walk touches nothing after beginWalk', () => {
    const { adapter, renderer, composerRig, storage } = setup();
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    renderer.setPixelRatio.mockClear();
    composerRig.setPixelRatio.mockClear();
    composerRig.setBloomStrength.mockClear();
    storage.setItem.mockClear();
    run(adapter, session, 0, 60000, 16);
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(composerRig.setPixelRatio).not.toHaveBeenCalled();
    expect(composerRig.setBloomStrength).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(session.useComposer).toBe(true);
    expect(stored(storage).rung).toBe(0);
  });

  it('manual High never steps and never reads or writes storage', () => {
    const { adapter, renderer, storage } = setup();
    const session = { useComposer: true };
    const tier = adapter.beginWalk({ override: 'high', reducedMotion: false, nowMs: 0 });
    expect(tier).toBe(LADDER[0]);
    expect(renderer.getPixelRatio()).toBe(2); // the adapter owns pixel ratio in every mode
    run(adapter, session, 0, 30000, 30);
    expect(adapter.status).toMatchObject({ mode: 'manual', rung: 0 });
    expect(renderer.getPixelRatio()).toBe(2);
    expect(session.useComposer).toBe(true);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.map.has(MEMORY_KEY)).toBe(false);
  });

  it('Auto with reduced motion stays LOW and never steps', () => {
    const { adapter, renderer, storage } = setup();
    const session = { useComposer: false };
    const tier = adapter.beginWalk({ override: 'auto', reducedMotion: true, nowMs: 0 });
    expect(tier).toBe(LADDER[3]);
    expect(renderer.getPixelRatio()).toBe(1.5);
    run(adapter, session, 0, 30000, 30);
    expect(adapter.status).toMatchObject({ mode: 'reduced-motion', rung: 3, change: '' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('a remembered rung starts the walk there', () => {
    const { adapter, renderer, composerRig } = setup({
      memory: { rung: 1, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false },
    });
    const tier = adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(tier).toBe(LADDER[1]);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(composerRig.setPixelRatio).toHaveBeenCalledWith(1.5);
    expect(adapter.status).toMatchObject({ rung: 1, startRung: 1, startReason: 'remembered' });
  });

  it('a walk that ends mid-fade leaves the next walk at full bloom, its session untouched', () => {
    const { adapter, composerRig } = setup({
      memory: { rung: 1, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false },
    });
    const first = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, first, 0, 9100, 30); // rung 1 → 2: the fade has started
    expect(adapter.status.rung).toBe(2);
    expect(first.useComposer).toBe(true);

    // The next walk starts on rung 2 from memory; give it a composer anyway to
    // prove the old fade can't reach it.
    composerRig.setBloomStrength.mockClear();
    const second = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 10000 });
    expect(composerRig.setBloomStrength).toHaveBeenCalledWith(0.35);
    run(adapter, second, 10000, 13000, 16);
    expect(second.useComposer).toBe(true);
    expect(first.useComposer).toBe(true);
    expect(composerRig.setBloomStrength).toHaveBeenCalledTimes(1);
  });

  it('a rung-1 walk then a rung-0 walk puts the composer back on the renderer ratio', () => {
    const { adapter, composerRig } = setup();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, { useComposer: true }, 0, 9100, 30);
    expect(composerRig.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    adapter.beginWalk({ override: 'high', reducedMotion: false, nowMs: 20000 });
    expect(composerRig.setPixelRatio).toHaveBeenLastCalledWith(2);
  });

  it('storage that throws on write still steps and never throws', () => {
    const storage = fakeStorage();
    storage.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });
    const { adapter, renderer } = setup({ storage });
    const session = { useComposer: true };
    expect(() => {
      adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
      run(adapter, session, 0, 9100, 30);
    }).not.toThrow();
    expect(adapter.status.rung).toBe(1);
    expect(renderer.getPixelRatio()).toBe(1.5);
  });

  it('a dpr-1 device stepping to rung 1 leaves the canvas alone', () => {
    // setPixelRatio reassigns canvas.width, which clears the drawing buffer;
    // min(1, 1.5) is still 1, so there is nothing to change.
    const { adapter, renderer, composerRig } = setup({ dpr: 1 });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(renderer.getPixelRatio()).toBe(1);
    renderer.setPixelRatio.mockClear();
    composerRig.setPixelRatio.mockClear();
    run(adapter, { useComposer: true }, 0, 9100, 30);
    expect(adapter.status.rung).toBe(1);
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(composerRig.setPixelRatio).not.toHaveBeenCalled();
  });

  it('frame without a session is a no-op', () => {
    const { adapter } = setup();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(() => run(adapter, null, 0, 10000, 30)).not.toThrow();
    expect(adapter.status.rung).toBe(0);
  });
});
