import { describe, it, expect } from 'vitest';
import { createAudio } from '../src/audio.js';

function fakeParam(v = 1) {
  // `scheduled` records every setValueAtTime value. tone() sets an
  // oscillator's pitch that way rather than by assigning .value, so it is the
  // only place the note actually is. Additive — .value keeps meaning what it
  // always did (see the master-gain assertion below).
  const p = {
    value: v,
    scheduled: [],
    setValueAtTime(x) { p.scheduled.push(x); },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  return p;
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

// ---------------------------------------------------------------------------
// v18 Task 2.3 / 2.7 — the two new cues. Both are built out of tone(), so
// what is worth pinning is their SHAPE against the sound each is meant to be
// a sibling of, plus the fact that whiskerPing's pitch actually tracks
// proximity (that mapping is the ability's only feedback channel besides the
// shimmer, and reducedMotion players get nothing else at all).
// ---------------------------------------------------------------------------
describe('v18 cues', () => {
  const freqsOf = (ctx) => ctx.created.oscs.map((o) => o.frequency.scheduled[0]);
  const pingFreqs = (closeness) => {
    const ctx = fakeCtx();
    createAudio({ contextFactory: () => ctx }).whiskerPing(closeness);
    return freqsOf(ctx);
  };

  it('unlockFanfare keeps fanfare\'s rising C-major shape and goes one step further', () => {
    const a = fakeCtx();
    const b = fakeCtx();
    createAudio({ contextFactory: () => a }).fanfare();
    createAudio({ contextFactory: () => b }).unlockFanfare();
    const fanfare = freqsOf(a);
    const unlock = freqsOf(b);
    // Same arpeggio, note for note, as its prefix — deliberately the same
    // "you did the big thing" sound the player already knows.
    expect(unlock.slice(0, fanfare.length)).toEqual(fanfare);
    // ...then more: it climbs higher and carries a sparkle tail.
    expect(unlock.length).toBeGreaterThan(fanfare.length);
    expect(Math.max(...unlock)).toBeGreaterThan(Math.max(...fanfare));
  });

  it('whiskerPing rises in pitch as the mouse gets closer', () => {
    const farF = pingFreqs(0);
    const nearF = pingFreqs(1);
    expect(farF).toHaveLength(2);
    expect(nearF).toHaveLength(2);
    for (let i = 0; i < 2; i++) expect(nearF[i]).toBeGreaterThan(farF[i]);
  });

  it('whiskerPing clamps a nonsense closeness rather than detuning wildly', () => {
    expect(pingFreqs(-99)).toEqual(pingFreqs(0));
    expect(pingFreqs(99)).toEqual(pingFreqs(1));
  });

  it('both stay silent while muted', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.setMuted(true);
    audio.unlockFanfare();
    audio.whiskerPing(0.5);
    expect(ctx.created.oscs).toHaveLength(0);
  });
});
