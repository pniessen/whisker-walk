import { describe, it, expect } from 'vitest';
import { createAudio } from '../src/audio.js';

function fakeParam(v = 1) {
  return { value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}
function fakeNode(extra = {}) {
  const n = { connections: [], stopped: false, connect(t) { n.connections.push(t); return t; }, start() {}, stop() { n.stopped = true; }, ...extra };
  return n;
}
function fakeCtx() {
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: fakeNode({ isDestination: true }),
    created: { gains: [], oscs: [], compressors: [], convolvers: [] },
    createGain() { const n = fakeNode({ gain: fakeParam(1) }); ctx.created.gains.push(n); return n; },
    createOscillator() { const n = fakeNode({ frequency: fakeParam(440), type: 'sine' }); ctx.created.oscs.push(n); return n; },
    createDynamicsCompressor() { const n = fakeNode({ threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam() }); ctx.created.compressors.push(n); return n; },
    createConvolver() { const n = fakeNode({ buffer: null }); ctx.created.convolvers.push(n); return n; },
    createBiquadFilter() { return fakeNode({ type: 'lowpass', frequency: fakeParam(), Q: fakeParam() }); },
    createBuffer(ch, len, rate) { return { getChannelData: () => new Float32Array(len), length: len, sampleRate: rate }; },
    createBufferSource() { return fakeNode({ buffer: null, loop: false, playbackRate: fakeParam(1) }); },
  };
  return ctx;
}

describe('audio master bus', () => {
  it('builds master → compressor → destination once, with a convolver reverb send', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.chime();
    audio.chime();
    expect(ctx.created.compressors).toHaveLength(1);
    expect(ctx.created.convolvers).toHaveLength(1);
    const comp = ctx.created.compressors[0];
    expect(comp.connections).toContain(ctx.destination);
  });
  it('no sound node connects straight to destination', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.meow();
    for (const osc of ctx.created.oscs) {
      expect(osc.connections).not.toContain(ctx.destination);
    }
  });
  it('setVolume drives the master gain live', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.chime(); // forces bus creation
    audio.setVolume(0.3);
    const master = ctx.created.gains[0]; // first gain created is the master
    expect(master.gain.value).toBeCloseTo(0.3);
  });
});

describe('layered ambience', () => {
  it('startAmbient(dusk) then stopAmbient() stops every started source', () => {
    const ctx = fakeCtx();
    const bufferSources = [];
    const origCreateBufferSource = ctx.createBufferSource;
    ctx.createBufferSource = () => { const n = origCreateBufferSource(); bufferSources.push(n); return n; };
    const audio = createAudio({ contextFactory: () => ctx });
    audio.startAmbient('neighborhood', { dusk: true });
    expect(bufferSources.length).toBeGreaterThan(0);
    for (const src of bufferSources) expect(src.stopped).toBe(false);
    audio.stopAmbient();
    for (const src of bufferSources) expect(src.stopped).toBe(true);
  });

  it('starting ambience twice does not stack — the first set is stopped', () => {
    const ctx = fakeCtx();
    const bufferSources = [];
    const origCreateBufferSource = ctx.createBufferSource;
    ctx.createBufferSource = () => { const n = origCreateBufferSource(); bufferSources.push(n); return n; };
    const audio = createAudio({ contextFactory: () => ctx });
    audio.startAmbient('seaside');
    const firstBatch = [...bufferSources];
    expect(firstBatch.length).toBeGreaterThan(0);
    audio.startAmbient('seaside');
    for (const src of firstBatch) expect(src.stopped).toBe(true);
    audio.stopAmbient();
  });

  it('defaults (no opts) keep existing behavior: seaside = waves+gulls, others = wind+birdsong', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    expect(() => audio.startAmbient('seaside')).not.toThrow();
    audio.stopAmbient();
    expect(() => audio.startAmbient('neighborhood')).not.toThrow();
    audio.stopAmbient();
    expect(() => audio.startAmbient('park')).not.toThrow();
    audio.stopAmbient();
  });

  // Task 7.2: the den's ambience is fireplace-crackle only — no wind,
  // birdsong, or crickets, even if a caller somehow passed dusk: true (the
  // den never surfaces the dusk toggle, but startAmbient stays defensive).
  it('den ambience is crackle-only: one looped-noise layer, never crickets at dusk', () => {
    const ctx = fakeCtx();
    const bufferSources = [];
    const origCreateBufferSource = ctx.createBufferSource;
    ctx.createBufferSource = () => { const n = origCreateBufferSource(); bufferSources.push(n); return n; };
    let intervalCalls = 0;
    const origSetInterval = global.setInterval;
    global.setInterval = (...args) => { intervalCalls++; return origSetInterval(...args); };
    const audio = createAudio({ contextFactory: () => ctx });
    try {
      audio.startAmbient('den', { dusk: true });
    } finally {
      global.setInterval = origSetInterval;
    }
    // exactly one looped noise source (the crackle layer) — no wind/waves
    // layer stacked alongside it, and no interval-based cricket/birdsong
    // layer scheduled either.
    expect(bufferSources).toHaveLength(1);
    expect(intervalCalls).toBe(0);
    audio.stopAmbient();
    expect(bufferSources[0].stopped).toBe(true);
  });
});
