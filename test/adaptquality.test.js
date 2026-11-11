import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
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

function setup({ memory, storage, dpr = 3, ...more } = {}) {
  const renderer = fakeRenderer();
  const composerRig = fakeRig();
  const store = storage ?? fakeStorage(memory);
  const adapter = createQualityAdapter({
    renderer, composerRig, storage: store,
    devicePixelRatio: () => dpr,
    wallClock: () => WALL,
    ...more,
  });
  return { adapter, renderer, composerRig, storage: store };
}

// Feeds frames every dtMs from fromMs up to and including toMs.
function run(adapter, session, fromMs, toMs, dtMs) {
  for (let t = fromMs; t <= toMs; t += dtMs) adapter.frame(session, t);
}
// Like run, but the frame time comes from dtOf(t), read before each step.
function drive(adapter, session, fromMs, toMs, dtOf) {
  for (let t = fromMs; t <= toMs; t += dtOf(t)) adapter.frame(session, t);
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
    // 40 ms on rung 0, 35 ms on rung 1, 30 ms on rung 2: each step helps, but
    // not enough, so the floor is earned (25% better than the first trigger).
    const { adapter, renderer, composerRig, storage } = setup();
    const statusRef = adapter.status;
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });

    run(adapter, session, 0, 9100, 40);
    expect(adapter.status.rung).toBe(1);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(composerRig.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(adapter.status.change).toBe('0→1: 100% of frames over 20 ms for 4 s');
    expect(stored(storage).rung).toBe(1);

    composerRig.setBloomStrength.mockClear();
    run(adapter, session, 9135, 14400, 35);
    expect(adapter.status.rung).toBe(2);
    expect(stored(storage).rung).toBe(2);
    expect(composerRig.setBloomStrength).toHaveBeenCalled();
    expect(session.useComposer).toBe(true); // fading, not cut

    run(adapter, session, 14435, 16000, 35);
    expect(session.useComposer).toBe(false);
    expect(composerRig.setBloomStrength).toHaveBeenLastCalledWith(0);
    // the fade is monotonic from 0.35 down to 0
    const strengths = composerRig.setBloomStrength.mock.calls.map(([s]) => s);
    for (let i = 1; i < strengths.length; i++) expect(strengths[i]).toBeLessThanOrEqual(strengths[i - 1]);
    expect(strengths[0]).toBeLessThanOrEqual(0.35);

    run(adapter, session, 16030, 22000, 30);
    expect(adapter.status.rung).toBe(3);
    expect(adapter.status.change).toMatch(/^2→3: \d+% of frames over 20 ms for 4 s \(next walk\)$/);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(stored(storage).rung).toBe(3);

    const writes = storage.setItem.mock.calls.length;
    const prCalls = renderer.setPixelRatio.mock.calls.length;
    const bloomCalls = composerRig.setBloomStrength.mock.calls.length;
    run(adapter, session, 22030, 40000, 30);
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

describe('a frame-rate cap is not remembered (F1)', () => {
  it('steady 33.3 ms from rung 0 steps live to rung 2, then skips the floor and remembers nothing', () => {
    const { adapter, renderer, storage } = setup();
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    const startMem = stored(storage);
    expect(startMem).toEqual({ rung: 0, steppedAt: 0, walks: 1, waitDays: 7, retrying: false });

    drive(adapter, session, 0, 30_000, () => 33.3);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(session.useComposer).toBe(false);
    expect(adapter.status.rung).toBe(2);
    expect(adapter.status.change).toBe('2→3 skipped: no gain from stepping down (frame cap?)');
    expect(stored(storage)).toEqual(startMem);

    const writes = storage.setItem.mock.calls.length;
    const prCalls = renderer.setPixelRatio.mock.calls.length;
    drive(adapter, session, 30_000, 60_000, () => 33.3);
    expect(storage.setItem.mock.calls.length).toBe(writes);
    expect(renderer.setPixelRatio.mock.calls.length).toBe(prCalls);
    expect(adapter.status.rung).toBe(2);
    expect(adapter.status.change).toMatch(/no gain/);
    expect(stored(storage)).toEqual(startMem);
  });

  it('30 ms until rung 2 finishes fading, then 16 ms: no third trigger, rung 2 remembered', () => {
    const { adapter, storage } = setup();
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    drive(adapter, session, 0, 60_000, () => (session.useComposer ? 30 : 16));
    expect(adapter.status.rung).toBe(2);
    expect(stored(storage).rung).toBe(2);
  });

  it('40 → 35 → 30 ms is a real gain while still slow, so rung 3 is persisted', () => {
    const { adapter, storage } = setup();
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    const dt = () => [40, 35, 30][adapter.status.rung] ?? 30;
    drive(adapter, session, 0, 60_000, dt);
    expect(adapter.status.rung).toBe(3);
    expect(stored(storage).rung).toBe(3);
    expect(adapter.status.change).toMatch(/^2→3: \d+% of frames over 20 ms for 4 s \(next walk\)$/);
  });

  it('a remembered rung 2 has no live step to judge, so steady 30 ms still steps to 3', () => {
    const { adapter, storage } = setup({
      memory: { rung: 2, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false },
    });
    const session = { useComposer: false };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, session, 0, 30_000, 30);
    expect(adapter.status.rung).toBe(3);
    expect(stored(storage).rung).toBe(3);
    expect(adapter.status.change).toMatch(/^2→3: 100% of frames over 20 ms for 4 s \(next walk\)$/);
  });
});

describe('a retry holds only after a judged window (F2)', () => {
  // rung 2, 5 walks, 20 days ago (waitDays 14): the walk retries rung 1.
  const retryable = { rung: 2, steppedAt: WALL - 20 * DAY, walks: 5, waitDays: 14, retrying: false };

  it('a retry walk at 16 ms for 10 s writes the hold once: retrying false, waitDays 7', () => {
    const { adapter, storage } = setup({ memory: retryable });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(adapter.status).toMatchObject({ rung: 1, startReason: 'retry' });
    expect(stored(storage)).toMatchObject({ rung: 1, retrying: true, waitDays: 14 });
    run(adapter, { useComposer: true }, 0, 10_000, 16);
    expect(stored(storage)).toMatchObject({ rung: 1, retrying: false, waitDays: 7 });
    expect(storage.setItem).toHaveBeenCalledTimes(2); // beginWalk + the hold
    run(adapter, { useComposer: true }, 10_016, 30_000, 16);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it('a retry walk too short to judge retries the same rung next walk', () => {
    const { adapter, storage } = setup({ memory: retryable });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, { useComposer: true }, 0, 6000, 16);
    expect(stored(storage).retrying).toBe(true);
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 7000 });
    expect(adapter.status).toMatchObject({ rung: 1, startRung: 1, startReason: 'retry' });
    expect(stored(storage)).toMatchObject({ rung: 1, retrying: true, waitDays: 14, walks: 2 });
  });

  it('a retry walk that steps down doubles waitDays and never writes a hold', () => {
    const { adapter, storage } = setup({ memory: retryable });
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, session, 0, 9100, 30);
    expect(adapter.status.rung).toBe(2);
    expect(stored(storage)).toMatchObject({ rung: 2, retrying: false, waitDays: 28 });
    run(adapter, session, 9130, 40_000, 16);
    expect(stored(storage)).toMatchObject({ rung: 2, retrying: false, waitDays: 28 });
  });
});

describe('warm-up starts at the first frame (F3)', () => {
  it('a slow area build between beginWalk and the first frame does not eat the warm-up', () => {
    const { adapter } = setup();
    const session = { useComposer: true };
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    // The area build takes 4 s; the first frame arrives then.
    run(adapter, session, 4000, 12_900, 30);
    expect(adapter.status.rung).toBe(0);
    run(adapter, session, 12_910, 13_200, 30);
    expect(adapter.status.rung).toBe(1);
  });
});

describe('status.mode (F5)', () => {
  it('manual High/Low are manual; Auto with reduced motion is reduced-motion', () => {
    const { adapter } = setup();
    adapter.beginWalk({ override: 'high', reducedMotion: true, nowMs: 0 });
    expect(adapter.status.mode).toBe('manual');
    adapter.beginWalk({ override: 'low', reducedMotion: false, nowMs: 0 });
    expect(adapter.status.mode).toBe('manual');
    adapter.beginWalk({ override: 'auto', reducedMotion: true, nowMs: 0 });
    expect(adapter.status.mode).toBe('reduced-motion');
  });
});

describe('a forced rung (?rung=N)', () => {
  it('starts Auto on that rung, never steps, and never reads or writes storage', () => {
    const { adapter, renderer, storage } = setup({
      forcedRung: 2,
      memory: { rung: 1, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false },
    });
    const before = storage.map.get(MEMORY_KEY);
    const session = { useComposer: false };
    const tier = adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(tier).toBe(LADDER[2]);
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(adapter.status).toMatchObject({ mode: 'forced', rung: 2, startRung: 2, startReason: 'forced', change: '' });
    run(adapter, session, 0, 60_000, 40);
    expect(adapter.status).toMatchObject({ mode: 'forced', rung: 2, change: '' });
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.map.get(MEMORY_KEY)).toBe(before);
  });

  it('holds for every walk of the page load', () => {
    const { adapter } = setup({ forcedRung: 3 });
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 })).toBe(LADDER[3]);
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 9000 })).toBe(LADDER[3]);
  });

  it('rung 0 forced is still forced: a slow walk does not step', () => {
    const { adapter, storage } = setup({ forcedRung: 0 });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, { useComposer: true }, 0, 30_000, 40);
    expect(adapter.status).toMatchObject({ mode: 'forced', rung: 0 });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('manual High/Low and reduced motion keep their meaning', () => {
    const { adapter } = setup({ forcedRung: 2 });
    expect(adapter.beginWalk({ override: 'high', reducedMotion: false, nowMs: 0 })).toBe(LADDER[0]);
    expect(adapter.status.mode).toBe('manual');
    expect(adapter.beginWalk({ override: 'low', reducedMotion: false, nowMs: 0 })).toBe(LADDER[3]);
    expect(adapter.status.mode).toBe('manual');
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: true, nowMs: 0 })).toBe(LADDER[3]);
    expect(adapter.status.mode).toBe('reduced-motion');
  });
});

// A session as far as the two lower rungs' live steps can tell: a scene with
// one thing made of a big part and a small one, both casting, and the shadow
// rig's two verbs (render/shadowfit.js).
function lowSession() {
  const scene = new THREE.Scene();
  const thing = new THREE.Group();
  const big = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const small = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial());
  big.castShadow = true;
  small.castShadow = true;
  thing.add(big, small);
  scene.add(thing);
  return {
    useComposer: false, scene, big, small,
    shadows: { setStrength: vi.fn(), stop: vi.fn() },
  };
}
const atLow = { rung: 3, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false };

describe('below LOW: the shadow-light and lite rungs', () => {
  it('a walk that steps down to LOW rests there: LOW has not been seen yet', () => {
    const { adapter, renderer, storage } = setup({
      memory: { rung: 2, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false },
    });
    const session = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, session, 0, 120_000, 40);
    expect(adapter.status.rung).toBe(3);
    expect(stored(storage).rung).toBe(3);
    expect(session.small.castShadow).toBe(true);
    expect(session.shadows.setStrength).not.toHaveBeenCalled();
    expect(session.shadows.stop).not.toHaveBeenCalled();
    expect(renderer.getPixelRatio()).toBe(1.5);
  });

  it('from LOW, a slow walk steps to shadow-light live: small parts stop casting at once', () => {
    const { adapter, renderer, storage } = setup({ memory: atLow });
    const session = lowSession();
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 })).toBe(LADDER[3]);
    run(adapter, session, 0, 9100, 40);
    expect(adapter.status.rung).toBe(4);
    expect(adapter.status.change).toBe('3→4: 100% of frames over 20 ms for 4 s');
    expect(stored(storage).rung).toBe(4);
    expect(session.big.castShadow).toBe(true);
    expect(session.small.castShadow).toBe(false);
    // Nothing else moves: same pixels, shadows as dark as they were.
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(session.shadows.setStrength).not.toHaveBeenCalled();
    expect(session.shadows.stop).not.toHaveBeenCalled();
  });

  it('then to lite: the pixel ratio drops at once and the shadows fade out, then stop', () => {
    const { adapter, renderer, storage } = setup({ memory: atLow });
    const session = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, session, 0, 9100, 40);
    expect(adapter.status.rung).toBe(4);
    run(adapter, session, 9140, 14400, 40);
    expect(adapter.status.rung).toBe(5);
    expect(adapter.status.change).toBe('4→5: 100% of frames over 20 ms for 4 s (fewer strays, no clouds, thinner grass next walk)');
    expect(stored(storage).rung).toBe(5);
    expect(renderer.getPixelRatio()).toBe(1);
    expect(session.shadows.stop).not.toHaveBeenCalled(); // fading, not cut

    run(adapter, session, 14440, 16500, 40);
    const strengths = session.shadows.setStrength.mock.calls.map(([k]) => k);
    expect(strengths.length).toBeGreaterThan(10);
    expect(strengths[0]).toBeLessThanOrEqual(1);
    for (let i = 1; i < strengths.length; i++) expect(strengths[i]).toBeLessThan(strengths[i - 1]);
    expect(strengths.at(-1)).toBeGreaterThan(0);
    expect(session.shadows.stop).toHaveBeenCalledTimes(1);

    // The fade is over: nothing touches the shadows again.
    const calls = session.shadows.setStrength.mock.calls.length;
    run(adapter, session, 16540, 20000, 16);
    expect(session.shadows.setStrength.mock.calls.length).toBe(calls);
    expect(session.shadows.stop).toHaveBeenCalledTimes(1);
  });

  it('a walk that got fast enough on shadow-light stays there', () => {
    const { adapter, storage } = setup({ memory: atLow });
    const session = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    drive(adapter, session, 0, 60_000, () => (adapter.status.rung === 3 ? 30 : 16));
    expect(adapter.status.rung).toBe(4);
    expect(stored(storage).rung).toBe(4);
    expect(session.shadows.stop).not.toHaveBeenCalled();
  });

  it('a remembered rung 4 or 5 starts the walk there', () => {
    for (const rung of [4, 5]) {
      const { adapter, renderer } = setup({ memory: { ...atLow, rung } });
      expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 })).toBe(LADDER[rung]);
      expect(adapter.status).toMatchObject({ rung, startRung: rung, startReason: 'remembered' });
      expect(renderer.getPixelRatio()).toBe(rung === 5 ? 1 : 1.5);
    }
  });

  it('a shadow fade left by a walk that ended cannot reach the next walk', () => {
    const { adapter } = setup({ memory: { ...atLow, rung: 4 } });
    const first = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    run(adapter, first, 0, 9100, 40); // 4 → 5: the fade has started
    expect(adapter.status.rung).toBe(5);
    const second = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 10_000 });
    run(adapter, second, 10_000, 13_000, 16);
    expect(second.shadows.setStrength).not.toHaveBeenCalled();
    expect(second.shadows.stop).not.toHaveBeenCalled();
    expect(first.shadows.stop).not.toHaveBeenCalled();
  });

  it('a session with no scene or shadow rig steps without throwing', () => {
    const { adapter } = setup({ memory: atLow });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(() => run(adapter, { useComposer: false }, 0, 30_000, 40)).not.toThrow();
    expect(adapter.status.rung).toBe(5);
  });

  it('?rung=4 and ?rung=5 hold those rungs', () => {
    for (const rung of [4, 5]) {
      const { adapter, storage } = setup({ forcedRung: rung });
      expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 })).toBe(LADDER[rung]);
      run(adapter, lowSession(), 0, 30_000, 40);
      expect(adapter.status).toMatchObject({ mode: 'forced', rung });
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });
});

// At the floor rung, a walk whose frames alternate between making and missing
// the display's refresh: 33.3, 33.3, 16.7 ms, two in three slow.
const uneven = () => { let i = 0; return () => (i++ % 3 === 2 ? 16.7 : 33.3); };
const atFloor = { rung: 5, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false };
// What the render loop would draw: refreshes every `ms`, asked of shouldRender.
function drawnIn(adapter, fromMs, toMs, ms) {
  let n = 0;
  const count = Math.round((toMs - fromMs) / ms);
  for (let i = 0; i < count; i++) if (adapter.shouldRender(fromMs + i * ms)) n++;
  return n;
}

describe('the 30 fps cap, the last resort', () => {
  it('every refresh is drawn while the cap is off', () => {
    const { adapter } = setup();
    expect(adapter.shouldRender(0)).toBe(true);
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(adapter.status.cap30).toBe(false);
    expect(drawnIn(adapter, 0, 1000, 1000 / 60)).toBe(60);
  });

  it('uneven slow frames on the floor rung turn the cap on, and it is remembered', () => {
    const { adapter, storage } = setup({ memory: atFloor });
    const session = lowSession();
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 })).toBe(LADDER[5]);
    drive(adapter, session, 0, 12_000, uneven());
    expect(adapter.status).toMatchObject({ rung: 6, cap30: true });
    expect(adapter.status.change).toMatch(/^5→30 fps: 6\d% of frames over 20 ms for 4 s$/);
    expect(stored(storage).rung).toBe(6);
    // From now on every other 60 Hz refresh is skipped.
    expect(drawnIn(adapter, 20_000, 21_000, 1000 / 60)).toBe(30);
    // Nothing about the picture changed: the cap is the only step.
    expect(session.shadows.setStrength).not.toHaveBeenCalled();
    expect(session.small.castShadow).toBe(true);
  });

  it('is the end of the ladder: nothing further is judged or written', () => {
    const { adapter, storage } = setup({ memory: atFloor });
    const session = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    drive(adapter, session, 0, 12_000, uneven());
    const writes = storage.setItem.mock.calls.length;
    run(adapter, session, 12_040, 60_000, 33.3);
    expect(storage.setItem.mock.calls.length).toBe(writes);
    expect(adapter.status.rung).toBe(6);
  });

  it('frames already steady at 30 are a capped display, not a reason: no cap, nothing remembered', () => {
    const { adapter, storage } = setup({ memory: atFloor });
    const session = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    const before = stored(storage);
    run(adapter, session, 0, 60_000, 33.3);
    expect(adapter.status).toMatchObject({ rung: 5, cap30: false });
    expect(adapter.status.change).toBe('5→30 fps skipped: frames already steady at 30 or slower (display cap?)');
    expect(stored(storage)).toEqual(before);
    expect(drawnIn(adapter, 60_000, 61_000, 1000 / 30)).toBe(30);
  });

  it('a device held at 30 by Low Power Mode with the cap remembered is not halved to 15', () => {
    const { adapter } = setup({ memory: { ...atFloor, rung: 6 } });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(adapter.status.cap30).toBe(true);
    expect(drawnIn(adapter, 0, 1000, 1000 / 30)).toBe(30);
  });

  it('a remembered cap starts the walk on the lite rung, capped', () => {
    const { adapter, renderer } = setup({ memory: { ...atFloor, rung: 6 } });
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 })).toBe(LADDER[5]);
    expect(adapter.status).toMatchObject({ rung: 6, startRung: 6, startReason: 'remembered', cap30: true });
    expect(renderer.getPixelRatio()).toBe(1);
    expect(drawnIn(adapter, 0, 1000, 1000 / 60)).toBe(30);
  });

  it('the retry from the cap is the lite rung uncapped; stepping down again puts it back', () => {
    const { adapter, storage } = setup({
      memory: { rung: 6, steppedAt: WALL - 20 * DAY, walks: 5, waitDays: 7, retrying: false },
    });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(adapter.status).toMatchObject({ rung: 5, startReason: 'retry', cap30: false });
    drive(adapter, lowSession(), 0, 12_000, uneven());
    expect(adapter.status).toMatchObject({ rung: 6, cap30: true });
    expect(stored(storage)).toMatchObject({ rung: 6, retrying: false, waitDays: 14 });
  });

  it('the cap belongs to the walk: a manual walk afterwards is uncapped', () => {
    const { adapter } = setup({ memory: { ...atFloor, rung: 6 } });
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    expect(adapter.status.cap30).toBe(true);
    adapter.beginWalk({ override: 'low', reducedMotion: false, nowMs: 5000 });
    expect(adapter.status.cap30).toBe(false);
    expect(drawnIn(adapter, 5000, 6000, 1000 / 60)).toBe(60);
  });

  it('?rung=6 holds the lite rung with the cap on', () => {
    const { adapter, storage } = setup({ forcedRung: 6 });
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 })).toBe(LADDER[5]);
    expect(adapter.status).toMatchObject({ mode: 'forced', rung: 6, cap30: true });
    expect(drawnIn(adapter, 0, 1000, 1000 / 60)).toBe(30);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('the whole way down in one walk from LOW: 4, 5, then the cap', () => {
    const { adapter, storage } = setup({ memory: atLow });
    const session = lowSession();
    adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs: 0 });
    drive(adapter, session, 0, 40_000, uneven());
    expect(adapter.status).toMatchObject({ rung: 6, cap30: true, startRung: 3 });
    expect(stored(storage).rung).toBe(6);
    expect(session.shadows.stop).toHaveBeenCalledTimes(1);
  });
});

describe('the render loop asks before it does anything', () => {
  it('main.js skips a capped refresh before reading the clock or the readout', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const loop = src.slice(src.indexOf('renderer.setAnimationLoop(() => {'));
    const ask = loop.indexOf('if (session && !qualityAdapter.shouldRender(performance.now())) return;');
    expect(ask).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(loop.indexOf('perfHud.frameStart('));
    expect(ask).toBeLessThan(loop.indexOf('clock.getDelta()'));
    // The clamp that keeps a 33 ms frame a 33 ms step of game time.
    expect(loop).toContain('const dt = Math.min(clock.getDelta(), 0.05);');
    expect(1 / 30).toBeLessThan(0.05);
  });
});

// The iPhone and iPad app's device profile (render/deviceprofile.js). Without
// one (every test above) nothing here applies.
const iPad7 = { model: 'iPad7,11', memoryGB: 2.9, thermal: 'nominal', lowPower: false };
const begin = (adapter, nowMs = 0) => adapter.beginWalk({ override: 'auto', reducedMotion: false, nowMs });

describe('the device profile: where a device with no memory starts', () => {
  it('an iPad 7th generation starts its first walk on LOW, and that becomes its memory', () => {
    const { adapter, renderer, storage } = setup({ device: iPad7 });
    expect(begin(adapter)).toBe(LADDER[3]);
    expect(adapter.status).toMatchObject({ rung: 3, startRung: 3, startReason: 'device' });
    expect(adapter.status.device).toBe('iPad7,11 · 2.9 GB · thermal nominal · low power off');
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(stored(storage)).toEqual({ rung: 3, steppedAt: 0, walks: 1, waitDays: 7, retrying: false });
    begin(adapter, 9000);
    expect(adapter.status).toMatchObject({ rung: 3, startReason: 'remembered' });
  });

  it('a remembered rung from real frame times always wins over the table', () => {
    const { adapter } = setup({
      device: iPad7,
      memory: { rung: 0, steppedAt: 0, walks: 3, waitDays: 7, retrying: false },
    });
    expect(begin(adapter)).toBe(LADDER[0]);
    expect(adapter.status.startReason).toBe('top');
    const lower = setup({ device: { ...iPad7, model: 'iPhone18,1', memoryGB: 11.2 }, memory: atFloor });
    expect(begin(lower.adapter)).toBe(LADDER[5]);
    expect(lower.adapter.status.startReason).toBe('remembered');
  });

  it('the table is a guess the ordinary machinery corrects: slow frames step it down at once', () => {
    const { adapter, storage } = setup({ device: iPad7 });
    const session = lowSession();
    begin(adapter);
    run(adapter, session, 0, 9100, 40);
    expect(adapter.status.rung).toBe(4);
    expect(stored(storage).rung).toBe(4);
  });

  it('...and the sixth walk tries one rung higher', () => {
    const { adapter, storage } = setup({ device: iPad7 });
    for (let i = 0; i < 5; i++) {
      begin(adapter, i * 1000);
      expect(adapter.status.rung).toBe(3);
    }
    begin(adapter, 6000);
    expect(adapter.status).toMatchObject({ rung: 2, startReason: 'retry' });
    expect(stored(storage)).toMatchObject({ rung: 2, retrying: true });
  });

  it('a profile the table does not know starts at the top, as with no profile', () => {
    for (const device of [{ model: 'iPhone18,1', memoryGB: 11.2 }, { model: 'arm64', memoryGB: 16 }, null, 'junk']) {
      const { adapter, storage } = setup({ device });
      expect(begin(adapter)).toBe(LADDER[0]);
      expect(adapter.status.startReason).toBe('top');
      expect(stored(storage)).toEqual({ rung: 0, steppedAt: 0, walks: 1, waitDays: 7, retrying: false });
    }
  });

  it('manual settings, reduced motion and ?rung ignore the table', () => {
    const { adapter, storage } = setup({ device: iPad7 });
    expect(adapter.beginWalk({ override: 'high', reducedMotion: false, nowMs: 0 })).toBe(LADDER[0]);
    expect(adapter.beginWalk({ override: 'auto', reducedMotion: true, nowMs: 0 })).toBe(LADDER[3]);
    expect(storage.setItem).not.toHaveBeenCalled();
    const forced = setup({ device: iPad7, forcedRung: 0 });
    expect(begin(forced.adapter)).toBe(LADDER[0]);
  });

  it('storage that throws starts from the table every walk and never throws', () => {
    const storage = fakeStorage();
    storage.getItem = vi.fn(() => { throw new Error('SecurityError'); });
    const { adapter } = setup({ device: iPad7, storage });
    expect(begin(adapter)).toBe(LADDER[3]);
    expect(begin(adapter, 5000)).toBe(LADDER[3]);
  });
});

describe('the device profile: running hot is a temporary rung', () => {
  const rung1 = { rung: 1, steppedAt: WALL - DAY, walks: 2, waitDays: 7, retrying: false };

  it('a walk started hot starts one rung lower, and the memory is not touched', () => {
    const { adapter, storage } = setup({ device: { ...iPad7, thermal: 'serious' }, memory: rung1 });
    expect(begin(adapter)).toBe(LADDER[2]);
    expect(adapter.status).toMatchObject({ rung: 2, startRung: 2, startReason: 'remembered +1 running hot' });
    expect(stored(storage)).toMatchObject({ rung: 1, walks: 3 });
  });

  it('once it has cooled, the next walk starts back on the remembered rung', () => {
    const { adapter, storage } = setup({ device: { ...iPad7, thermal: 'critical' }, memory: rung1 });
    expect(begin(adapter)).toBe(LADDER[2]);
    adapter.deviceChanged({ ...iPad7, thermal: 'fair' });
    expect(adapter.status.rung).toBe(2); // nothing pops back mid-walk
    expect(begin(adapter, 9000)).toBe(LADDER[1]);
    expect(adapter.status).toMatchObject({ rung: 1, startReason: 'remembered' });
    expect(stored(storage).rung).toBe(1);
  });

  it('heating up mid-walk steps down at the next frame, live, and writes nothing', () => {
    const { adapter, renderer, storage } = setup({ device: iPad7, memory: { ...rung1, rung: 0 } });
    const session = { useComposer: true };
    begin(adapter);
    run(adapter, session, 0, 2000, 16);
    const before = stored(storage);
    const writes = storage.setItem.mock.calls.length;
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    expect(adapter.status.rung).toBe(0); // not until a frame
    adapter.frame(session, 2016);
    expect(adapter.status.rung).toBe(1);
    expect(adapter.status.change).toBe('0→1: running hot (not remembered)');
    expect(adapter.status.device).toBe('iPad7,11 · 2.9 GB · thermal serious · low power off');
    expect(renderer.getPixelRatio()).toBe(1.5);
    expect(stored(storage)).toEqual(before);
    expect(storage.setItem.mock.calls.length).toBe(writes);
  });

  it('is one rung, however many times the app says so, and however often it heats again', () => {
    const { adapter } = setup({ device: iPad7, memory: atLow });
    const session = lowSession();
    begin(adapter);
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    adapter.deviceChanged({ ...iPad7, thermal: 'critical' });
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    run(adapter, session, 0, 3000, 16);
    expect(adapter.status.rung).toBe(4);
    adapter.deviceChanged({ ...iPad7, thermal: 'nominal' });
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    run(adapter, session, 3016, 6000, 16);
    expect(adapter.status.rung).toBe(4);
  });

  it('from shadow-light the temporary rung is lite: the shadows fade, as on a remembered step', () => {
    const { adapter, renderer, storage } = setup({ device: iPad7, memory: { ...atLow, rung: 4 } });
    const session = lowSession();
    begin(adapter);
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    run(adapter, session, 0, 3000, 16);
    expect(adapter.status.rung).toBe(5);
    expect(renderer.getPixelRatio()).toBe(1);
    expect(session.shadows.stop).toHaveBeenCalledTimes(1);
    expect(stored(storage).rung).toBe(4);
  });

  it('on the floor the temporary rung is the 30 fps cap', () => {
    const { adapter, storage } = setup({ device: iPad7, memory: atFloor });
    begin(adapter);
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    adapter.frame(lowSession(), 16);
    expect(adapter.status).toMatchObject({ rung: 6, cap30: true, change: '5→30 fps: running hot (not remembered)' });
    expect(stored(storage).rung).toBe(5);
    begin(adapter, 9000);
    expect(adapter.status).toMatchObject({ rung: 6, cap30: true, startReason: 'remembered +1 running hot' });
    adapter.deviceChanged({ ...iPad7, thermal: 'nominal' });
    begin(adapter, 18_000);
    expect(adapter.status).toMatchObject({ rung: 5, cap30: false });
  });

  it('a temporary step to LOW changes nothing live and says so', () => {
    const { adapter, renderer } = setup({ device: iPad7, memory: { ...rung1, rung: 2 } });
    begin(adapter);
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    adapter.frame({ useComposer: false }, 16);
    expect(adapter.status).toMatchObject({ rung: 3, change: '2→3: running hot (not remembered, next walk)' });
    expect(renderer.getPixelRatio()).toBe(1.5);
  });

  it('a hot walk that is still slow remembers one rung down, not the heat too', () => {
    const { adapter, storage } = setup({ device: { ...iPad7, thermal: 'serious' }, memory: atLow });
    const session = lowSession();
    expect(begin(adapter)).toBe(LADDER[4]);
    run(adapter, session, 0, 9100, 40);
    expect(adapter.status.rung).toBe(5);
    expect(stored(storage).rung).toBe(4);
  });

  it('a retry walked hot proves nothing: it stays a retry', () => {
    const { adapter, storage } = setup({
      device: { ...iPad7, thermal: 'serious' },
      memory: { rung: 2, steppedAt: WALL - 20 * DAY, walks: 5, waitDays: 14, retrying: false },
    });
    begin(adapter);
    expect(adapter.status).toMatchObject({ rung: 2, startReason: 'retry +1 running hot' });
    run(adapter, { useComposer: false }, 0, 20_000, 16);
    expect(stored(storage)).toMatchObject({ rung: 1, retrying: true, waitDays: 14 });
  });

  it('waits for a fade in progress, then steps', () => {
    const { adapter } = setup({ device: iPad7, memory: rung1 });
    const session = { useComposer: true };
    begin(adapter);
    run(adapter, session, 0, 9100, 40); // 1 → 2: the bloom fade has started
    expect(adapter.status.rung).toBe(2);
    adapter.deviceChanged({ ...iPad7, thermal: 'serious' });
    adapter.frame(session, 9140);
    expect(adapter.status.rung).toBe(2);
    run(adapter, session, 9180, 11_000, 40);
    expect(session.useComposer).toBe(false);
    expect(adapter.status.rung).toBe(3);
  });

  it('means nothing between walks, on a manual walk, or under ?rung', () => {
    const idle = setup({ device: iPad7 });
    expect(() => idle.adapter.deviceChanged({ ...iPad7, thermal: 'serious' })).not.toThrow();
    expect(() => idle.adapter.deviceChanged(null)).not.toThrow();
    expect(() => idle.adapter.deviceChanged('hot')).not.toThrow();
    const manual = setup({ device: iPad7 });
    manual.adapter.beginWalk({ override: 'high', reducedMotion: false, nowMs: 0 });
    manual.adapter.deviceChanged({ ...iPad7, thermal: 'serious', memoryWarning: true });
    run(manual.adapter, { useComposer: true }, 0, 2000, 16);
    expect(manual.adapter.status).toMatchObject({ mode: 'manual', rung: 0 });
    const forced = setup({ device: { ...iPad7, thermal: 'critical' }, forcedRung: 1 });
    expect(begin(forced.adapter)).toBe(LADDER[1]);
    forced.adapter.deviceChanged({ ...iPad7, thermal: 'critical', memoryWarning: true });
    run(forced.adapter, { useComposer: true }, 0, 2000, 16);
    expect(forced.adapter.status).toMatchObject({ mode: 'forced', rung: 1 });
  });
});

describe('the device profile: a memory warning is a temporary rung too', () => {
  it('steps down at the next frame, once, and lasts until the page is reloaded', () => {
    const { adapter, storage } = setup({ device: iPad7, memory: atLow });
    const session = lowSession();
    begin(adapter);
    adapter.deviceChanged({ ...iPad7, memoryWarning: true });
    adapter.deviceChanged({ ...iPad7, memoryWarning: true });
    run(adapter, session, 0, 3000, 16);
    expect(adapter.status).toMatchObject({ rung: 4, change: '3→4: memory warning (not remembered)' });
    expect(session.small.castShadow).toBe(false);
    expect(stored(storage).rung).toBe(3);
    expect(begin(adapter, 9000)).toBe(LADDER[4]);
    expect(adapter.status.startReason).toBe('remembered +1 memory warning');
    expect(stored(storage).rung).toBe(3);
  });

  it('hot and warned together are two rungs', () => {
    const { adapter, storage } = setup({ device: iPad7, memory: atLow });
    const session = lowSession();
    begin(adapter);
    adapter.deviceChanged({ ...iPad7, thermal: 'serious', memoryWarning: true });
    run(adapter, session, 0, 4000, 16);
    expect(adapter.status.rung).toBe(5);
    expect(stored(storage).rung).toBe(3);
    begin(adapter, 9000);
    expect(adapter.status).toMatchObject({ rung: 5, startReason: 'remembered +2 running hot, memory warning' });
  });

  it('a warning between walks is carried into the next walk', () => {
    const { adapter } = setup({ device: iPad7, memory: atLow });
    adapter.deviceChanged({ ...iPad7, memoryWarning: true });
    expect(begin(adapter)).toBe(LADDER[4]);
  });
});

describe('the device profile: Low Power Mode says the display is held at 30', () => {
  const lowPower = { ...iPad7, lowPower: true };

  it('steady 33 ms frames are healthy there: nothing steps, nothing is written', () => {
    const { adapter, storage } = setup({ device: lowPower, memory: { ...atLow, rung: 0 } });
    begin(adapter);
    const writes = storage.setItem.mock.calls.length;
    run(adapter, { useComposer: true }, 0, 60_000, 33.3);
    expect(adapter.status).toMatchObject({ rung: 0, change: '' });
    expect(storage.setItem.mock.calls.length).toBe(writes);
    // ...where without the app's word the same frames step to rung 2.
    const blind = setup({ memory: { ...atLow, rung: 0 } });
    begin(blind.adapter);
    run(blind.adapter, { useComposer: true }, 0, 60_000, 33.3);
    expect(blind.adapter.status.rung).toBe(2);
  });

  it('frames missing the 30 Hz refresh as well still step down, and say what they were judged against', () => {
    const { adapter, storage } = setup({ device: lowPower, memory: atLow });
    begin(adapter);
    run(adapter, lowSession(), 0, 9100, 50);
    expect(adapter.status.rung).toBe(4);
    expect(adapter.status.change).toBe('3→4: 100% of frames over 40 ms for 4 s');
    expect(stored(storage).rung).toBe(4);
  });

  it('never takes the 30 fps cap: the display is already there', () => {
    const { adapter, storage } = setup({ device: lowPower, memory: atFloor });
    begin(adapter);
    run(adapter, lowSession(), 0, 60_000, 66);
    expect(adapter.status).toMatchObject({ rung: 5, cap30: false });
    expect(stored(storage).rung).toBe(5);
  });

  it('switching it off mid-walk goes back to the ordinary test, after a fresh warm-up', () => {
    const { adapter } = setup({ device: lowPower, memory: { ...atLow, rung: 0 } });
    const session = { useComposer: true };
    begin(adapter);
    run(adapter, session, 0, 20_000, 33.3);
    expect(adapter.status.rung).toBe(0);
    adapter.deviceChanged(iPad7);
    expect(adapter.status.device).toBe('iPad7,11 · 2.9 GB · thermal nominal · low power off');
    run(adapter, session, 20_030, 24_900, 30);
    expect(adapter.status.rung).toBe(0); // warming up again
    run(adapter, session, 24_930, 29_500, 30);
    expect(adapter.status.rung).toBe(1);
    expect(adapter.status.change).toBe('0→1: 100% of frames over 20 ms for 4 s');
  });

  it('switching it on mid-walk stops 33 ms frames counting as slow', () => {
    const { adapter } = setup({ device: iPad7, memory: { ...atLow, rung: 0 } });
    const session = { useComposer: true };
    begin(adapter);
    run(adapter, session, 0, 3000, 16);
    adapter.deviceChanged(lowPower);
    run(adapter, session, 3033, 60_000, 33.3);
    expect(adapter.status.rung).toBe(0);
  });
});

describe('main.js wires the bridge', () => {
  it('hands the adapter the profile at boot and every event after, and lets go of the menu pictures on a memory warning', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(src).toContain('device: readDeviceProfile(window),');
    expect(src).toContain('window.addEventListener(DEVICE_EVENT, (e) => {');
    expect(src).toContain('qualityAdapter.deviceChanged(e.detail);');
    expect(src).toContain('if (e.detail?.memoryWarning === true) releaseThumbnails();');
  });
});
