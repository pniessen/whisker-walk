import { describe, it, expect } from 'vitest';
import { composePhrase, createMusic } from '../src/music.js';
import { mulberry32 } from '../src/rng.js';

const SCALE = [0, 3, 5, 7, 10];

describe('composePhrase', () => {
  it('is deterministic for a given rng seed', () => {
    const a = composePhrase(mulberry32(42), { mood: 'day' });
    const b = composePhrase(mulberry32(42), { mood: 'day' });
    expect(a).toEqual(b);
  });

  it('every step note is in the pentatonic set (allowing +12)', () => {
    for (const seed of [1, 2, 3, 999, 123456]) {
      const phrase = composePhrase(mulberry32(seed), { mood: 'day' });
      for (const step of phrase.steps) {
        const base = step.note % 12;
        expect(SCALE).toContain(base);
      }
    }
  });

  it('produces 4-7 notes for non-rain moods, each beat in 0..7', () => {
    for (const seed of [1, 2, 3, 999]) {
      const phrase = composePhrase(mulberry32(seed), { mood: 'day' });
      expect(phrase.steps.length).toBeGreaterThanOrEqual(4);
      expect(phrase.steps.length).toBeLessThanOrEqual(7);
      for (const step of phrase.steps) {
        expect(step.beat).toBeGreaterThanOrEqual(0);
        expect(step.beat).toBeLessThanOrEqual(7);
      }
    }
  });

  it('rain produces fewer notes than day for the same seed', () => {
    for (const seed of [1, 2, 3, 999, 42]) {
      const day = composePhrase(mulberry32(seed), { mood: 'day' });
      const rain = composePhrase(mulberry32(seed), { mood: 'rain' });
      expect(rain.steps.length).toBeLessThan(day.steps.length);
    }
  });

  it('roots match the documented mood table', () => {
    expect(composePhrase(mulberry32(1), { mood: 'day' }).root).toBe(220);
    expect(composePhrase(mulberry32(1), { mood: 'sunset' }).root).toBeCloseTo(246.94);
    expect(composePhrase(mulberry32(1), { mood: 'dusk' }).root).toBeCloseTo(174.61);
    expect(composePhrase(mulberry32(1), { mood: 'rain' }).root).toBe(220);
  });

  it('defaults to day mood when unspecified', () => {
    expect(composePhrase(mulberry32(7)).root).toBe(220);
  });

  it('returns a chord as a semitone array including root and octave', () => {
    const phrase = composePhrase(mulberry32(5), { mood: 'day' });
    expect(Array.isArray(phrase.chord)).toBe(true);
    expect(phrase.chord[0]).toBe(0);
    expect(phrase.chord).toContain(12);
  });
});

// --- createMusic scheduler -------------------------------------------
// Same fakeCtx shape as test/audio.test.js's fakeCtx: enough Web Audio node
// stubs (createGain/createOscillator/createBiquadFilter) for the scheduler
// to run without a real AudioContext.
function fakeParam(v = 1) {
  return { value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}
function fakeNode(extra = {}) {
  const n = { connections: [], stopped: false, connect(t) { n.connections.push(t); return t; }, disconnect() {}, start() {}, stop() { n.stopped = true; }, ...extra };
  return n;
}
function fakeCtx() {
  const ctx = {
    currentTime: 0,
    createGain() { return fakeNode({ gain: fakeParam(1) }); },
    createOscillator() { return fakeNode({ frequency: fakeParam(440), detune: fakeParam(0), type: 'sine' }); },
    createBiquadFilter() { return fakeNode({ type: 'lowpass', frequency: fakeParam(), Q: fakeParam() }); },
  };
  return ctx;
}

describe('createMusic scheduler', () => {
  it('start() creates a scheduling interval and stop() clears it', () => {
    const ctx = fakeCtx();
    const master = fakeNode();
    let intervalCalls = 0;
    let clearCalls = 0;
    const origSetInterval = global.setInterval;
    const origClearInterval = global.clearInterval;
    global.setInterval = (...args) => { intervalCalls++; return origSetInterval(...args); };
    global.clearInterval = (...args) => { clearCalls++; return origClearInterval(...args); };
    try {
      const music = createMusic(() => ctx, () => master);
      expect(music.playing).toBe(false);
      music.start(1, 'day');
      expect(intervalCalls).toBe(1);
      expect(music.playing).toBe(true);
      music.stop();
      expect(clearCalls).toBe(1);
      expect(music.playing).toBe(false);
    } finally {
      global.setInterval = origSetInterval;
      global.clearInterval = origClearInterval;
      // in case the test failed before an explicit stop(), don't leak a real interval
    }
  });

  it('start() while volume is 0 is a cheap no-op', () => {
    const ctx = fakeCtx();
    const master = fakeNode();
    let intervalCalls = 0;
    const origSetInterval = global.setInterval;
    global.setInterval = (...args) => { intervalCalls++; return origSetInterval(...args); };
    try {
      const music = createMusic(() => ctx, () => master);
      music.setVolume(0);
      music.start(1, 'day');
      expect(music.playing).toBe(false);
      expect(intervalCalls).toBe(0);
    } finally {
      global.setInterval = origSetInterval;
    }
  });

  it('setVolume(0) while playing stops the scheduler', () => {
    const ctx = fakeCtx();
    const master = fakeNode();
    const origSetInterval = global.setInterval;
    let clearCalls = 0;
    const origClearInterval = global.clearInterval;
    global.clearInterval = (...args) => { clearCalls++; return origClearInterval(...args); };
    try {
      const music = createMusic(() => ctx, () => master);
      music.start(1, 'day');
      expect(music.playing).toBe(true);
      music.setVolume(0);
      expect(music.playing).toBe(false);
      expect(clearCalls).toBe(1);
    } finally {
      global.setInterval = origSetInterval;
      global.clearInterval = origClearInterval;
    }
  });

  it('starting twice restarts cleanly instead of stacking intervals', () => {
    const ctx = fakeCtx();
    const master = fakeNode();
    let intervalCalls = 0;
    let clearCalls = 0;
    const origSetInterval = global.setInterval;
    const origClearInterval = global.clearInterval;
    global.setInterval = (...args) => { intervalCalls++; return origSetInterval(...args); };
    global.clearInterval = (...args) => { clearCalls++; return origClearInterval(...args); };
    try {
      const music = createMusic(() => ctx, () => master);
      music.start(1, 'day');
      music.start(2, 'sunset');
      expect(intervalCalls).toBe(2);
      expect(clearCalls).toBe(1); // the first interval was cleared by the implicit stop()
      music.stop();
    } finally {
      global.setInterval = origSetInterval;
      global.clearInterval = origClearInterval;
    }
  });
});
