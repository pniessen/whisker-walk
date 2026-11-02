import { describe, it, expect } from 'vitest';
import { createAudio } from '../src/audio.js';

function fakeParam(v = 1) {
  // `scheduled` records every setValueAtTime value. tone() sets an
  // oscillator's pitch that way rather than by assigning .value, so it is the
  // only place the note actually is. Additive — .value keeps meaning what it
  // always did (see the master-gain assertion below).
  // `events` records every scheduling call in order, [kind, value, time].
  const p = {
    value: v,
    scheduled: [],
    events: [],
    setValueAtTime(x, t) { p.scheduled.push(x); p.events.push(['set', x, t]); },
    linearRampToValueAtTime(x, t) { p.events.push(['linear', x, t]); },
    exponentialRampToValueAtTime(x, t) { p.events.push(['exp', x, t]); },
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

  // v18 Task 4.0 — the Docks used to fall through to the generic branch, so
  // a night dock played BIRDSONG. These pin the harbour instead.
  //
  // Birdsong is the one layer built on setInterval while gulls and the horn
  // both use a self-rescheduling setTimeout, so counting the two separately
  // is what distinguishes "gulls are playing" from "birds are playing"
  // without reaching into the layer objects.
  const ambienceProbe = (areaKey, opts) => {
    const ctx = fakeCtx();
    const bufferSources = [];
    const origCreateBufferSource = ctx.createBufferSource;
    ctx.createBufferSource = () => { const n = origCreateBufferSource(); bufferSources.push(n); return n; };
    const origSetInterval = global.setInterval;
    const origSetTimeout = global.setTimeout;
    let intervals = 0;
    let timeouts = 0;
    const intervalFns = [];
    const timeoutFns = [];
    global.setInterval = (...args) => { intervals++; intervalFns.push(args[0]); return origSetInterval(...args); };
    global.setTimeout = (...args) => { timeouts++; timeoutFns.push(args[0]); return origSetTimeout(...args); };
    const audio = createAudio({ contextFactory: () => ctx });
    try {
      audio.startAmbient(areaKey, opts);
    } finally {
      global.setInterval = origSetInterval;
      global.setTimeout = origSetTimeout;
    }
    return { audio, ctx, bufferSources, intervals, timeouts, intervalFns, timeoutFns };
  };

  it('docks ambience is water lap + gulls + horn, and never birdsong', () => {
    const dry = ambienceProbe('docks');
    // one looped-noise layer (the water lap), no rain wash stacked on it
    expect(dry.bufferSources).toHaveLength(1);
    // gulls and the horn, both setTimeout-scheduled; birdsong/crickets would
    // be setInterval, and there must be none of either on a dry day walk.
    expect(dry.timeouts).toBe(2);
    expect(dry.intervals).toBe(0);
    dry.audio.stopAmbient();
    for (const src of dry.bufferSources) expect(src.stopped).toBe(true);
  });

  it('a dusk dock adds crickets and still never adds birdsong', () => {
    // The bug this branch fixes: at dusk the generic branch suppressed
    // birdsong, but a DAY dock got it. Dusk must change exactly one thing.
    const dusk = ambienceProbe('docks', { dusk: true });
    expect(dusk.bufferSources).toHaveLength(1);
    expect(dusk.timeouts).toBe(2);
    expect(dusk.intervals).toBe(1); // crickets only
    dusk.audio.stopAmbient();
  });

  it('a rainy dock swaps in the rain wash on top of the lap', () => {
    const wet = ambienceProbe('docks', { rain: true });
    expect(wet.bufferSources).toHaveLength(2); // lap + rain
    expect(wet.intervals).toBe(0);
    wet.audio.stopAmbient();
    for (const src of wet.bufferSources) expect(src.stopped).toBe(true);
  });

  // The River: wind + a quiet water lap under the usual birdsong. Never gulls.
  // Looped-noise layers are buffer sources (wind, lap, rain); birdsong and
  // crickets are setInterval; gulls and the horn are setTimeout.
  it('river ambience is wind, a water lap and birdsong, never gulls', () => {
    const dry = ambienceProbe('river');
    expect(dry.bufferSources).toHaveLength(2); // wind + lap
    expect(dry.intervals).toBe(1); // birdsong
    expect(dry.timeouts).toBe(0); // no gulls, no horn
    dry.audio.stopAmbient();
    for (const src of dry.bufferSources) expect(src.stopped).toBe(true);
    const dusk = ambienceProbe('river', { dusk: true });
    expect(dusk.bufferSources).toHaveLength(2);
    expect(dusk.intervals).toBe(1); // crickets replace birdsong
    expect(dusk.timeouts).toBe(0);
    dusk.audio.stopAmbient();
  });

  it('a rainy river swaps the birdsong for the rain wash', () => {
    const wet = ambienceProbe('river', { rain: true });
    expect(wet.bufferSources).toHaveLength(3); // wind + lap + rain
    expect(wet.intervals).toBe(0);
    wet.audio.stopAmbient();
    for (const src of wet.bufferSources) expect(src.stopped).toBe(true);
  });

  // The Moor: a stronger wind (twice the generic gain) and birdsong; never gulls,
  // lap or horn. The wind is the only gain at 0.06; the generic wind's is 0.03.
  it('moor ambience is a stronger wind and birdsong, never gulls, lap or horn', () => {
    const dry = ambienceProbe('moor');
    expect(dry.bufferSources).toHaveLength(1); // the wind
    expect(dry.intervals).toBe(1); // birdsong
    expect(dry.timeouts).toBe(0);
    const gains = (p) => p.ctx.created.gains.map((g) => g.gain.value);
    expect(gains(dry)).toContain(0.06);
    expect(gains(dry)).not.toContain(0.03);
    const park = ambienceProbe('park');
    expect(gains(park)).toContain(0.03);
    expect(gains(park)).not.toContain(0.06);
    dry.audio.stopAmbient();
    park.audio.stopAmbient();
  });

  it('a rainy moor swaps the birdsong for the rain wash', () => {
    const wet = ambienceProbe('moor', { rain: true });
    expect(wet.bufferSources).toHaveLength(2); // wind + rain
    expect(wet.intervals).toBe(0);
    wet.audio.stopAmbient();
  });

  // The Pines: a low wind and frogs. The frog layer is the one interval; run it
  // once with Math.random at 0 (always croaks) and read the pitches tone()
  // scheduled. Frogs sit well under 400 Hz where birdsong starts at 1500.
  it('the Pines is a low wind and frogs, never birdsong, gulls or a horn', () => {
    const dry = ambienceProbe('pines');
    expect(dry.bufferSources).toHaveLength(1); // the wind
    expect(dry.intervals).toBe(1); // the frogs
    expect(dry.timeouts).toBe(0);
    expect(dry.ctx.created.gains.map((g) => g.gain.value)).toContain(0.035);
    const before = dry.ctx.created.oscs.length;
    const realRandom = Math.random;
    Math.random = () => 0;
    try { dry.intervalFns[0](); } finally { Math.random = realRandom; }
    const croaks = dry.ctx.created.oscs.slice(before); // the wind's LFO started earlier
    expect(croaks.length).toBeGreaterThanOrEqual(2);
    for (const o of croaks) {
      expect(o.frequency.scheduled.length).toBeGreaterThan(0);
      for (const f of o.frequency.scheduled) expect(f).toBeLessThan(400);
    }
    dry.audio.stopAmbient();
  });

  it('a rainy Pines adds the rain wash and keeps the frogs', () => {
    const wet = ambienceProbe('pines', { rain: true });
    expect(wet.bufferSources).toHaveLength(2); // wind + rain
    expect(wet.intervals).toBe(1); // the frogs
    wet.audio.stopAmbient();
  });

  // Each interval layer run once with Math.random at 0 (it always plays):
  // the pitches each one scheduled. Frogs sit under 400 Hz, birdsong at
  // 1500-2200, crickets at 4200.
  const pitchesOf = (probe) => probe.intervalFns.map((fn) => {
    const before = probe.ctx.created.oscs.length;
    const realRandom = Math.random;
    Math.random = () => 0;
    try { fn(); } finally { Math.random = realRandom; }
    return probe.ctx.created.oscs.slice(before).flatMap((o) => o.frequency.scheduled);
  });

  // The Gorge: wind and the stream's lap, mixed by how high she is (gorgelife
  // calls setAmbientMix), and a far cry now and then from up high. Never
  // birdsong: the one interval is the cries.
  it('gorge ambience is wind, a lap and the cries, never birdsong', () => {
    const dry = ambienceProbe('gorge');
    expect(dry.bufferSources).toHaveLength(2); // wind + lap
    expect(dry.intervals).toBe(1); // the cries
    expect(dry.timeouts).toBe(1); // the cave drips (silent out of a cave)
    const gains = dry.ctx.created.gains.map((g) => g.gain.value);
    expect(gains).toContain(0.03); // the wind
    expect(gains).toContain(0.038); // the lap
    dry.audio.stopAmbient();
    for (const src of dry.bufferSources) expect(src.stopped).toBe(true);
  });

  // Each looped layer's level is its gain node plus an LFO gain swelling it;
  // the mix must scale both, or the swell would swing a quiet lap through zero.
  // Built in order: wind gain (0.03), wind swell (0.012), lap gain (0.038),
  // lap swell (0.03).
  const gorgeGains = (p) => {
    const gains = p.ctx.created.gains;
    const wind = gains.findIndex((g) => g.gain.value === 0.03);
    const lap = gains.findIndex((g) => g.gain.value === 0.038);
    expect(gains[wind + 1].gain.value).toBe(0.012);
    expect(gains[lap + 1].gain.value).toBe(0.03);
    return { wind: gains[wind], windSwell: gains[wind + 1], lap: gains[lap], lapSwell: gains[lap + 1] };
  };
  const levels = (n) => [n.wind, n.windSwell, n.lap, n.lapSwell].map((g) => g.gain.value);
  const expectLevels = (n, want) => levels(n).forEach((v, i) => expect(v).toBeCloseTo(want[i], 10));

  it('setAmbientMix lifts the wind x2.2 and quiets the lap x0.2 up high, swell and all', () => {
    const p = ambienceProbe('gorge');
    const n = gorgeGains(p);
    p.audio.setAmbientMix({ high: 0 });
    expectLevels(n, [0.03, 0.012, 0.038, 0.03]);
    p.audio.setAmbientMix({ high: 1 });
    expect(n.wind.gain.value).toBeCloseTo(0.066, 10);
    expectLevels(n, [0.03 * 2.2, 0.012 * 2.2, 0.038 * 0.2, 0.03 * 0.2]);
    // the lap's swell never takes it through zero
    expect(n.lap.gain.value - n.lapSwell.gain.value).toBeGreaterThan(0);
    p.audio.setAmbientMix({ high: 0 });
    expectLevels(n, [0.03, 0.012, 0.038, 0.03]);
    p.audio.stopAmbient();
    // with nothing playing it is a no-op
    expect(() => p.audio.setAmbientMix({ high: 1 })).not.toThrow();
  });

  it('a restarted ambience keeps the last mix', () => {
    const p = ambienceProbe('gorge');
    p.audio.setAmbientMix({ high: 1 });
    const before = p.ctx.created.gains.length;
    const origSetInterval = global.setInterval;
    const cries = [];
    global.setInterval = (...args) => { cries.push(args[0]); return origSetInterval(...args); };
    try { p.audio.startAmbient('gorge'); } finally { global.setInterval = origSetInterval; }
    // the new layers' gains, in build order (wind, its swell, lap, its swell)
    const fresh = p.ctx.created.gains.slice(before).map((g) => g.gain.value);
    expect(fresh).toHaveLength(4);
    fresh.forEach((v, i) => expect(v).toBeCloseTo([0.03 * 2.2, 0.012 * 2.2, 0.038 * 0.2, 0.03 * 0.2][i], 10));
    // the new cries know she is up high
    const n = p.ctx.created.oscs.length;
    const realRandom = Math.random;
    Math.random = () => 0.9;
    try { cries[0](); } finally { Math.random = realRandom; }
    expect(p.ctx.created.oscs.length - n).toBe(2);
    p.audio.stopAmbient();
  });

  it('a mix leaves every other area alone', () => {
    const p = ambienceProbe('river');
    const before = p.ctx.created.gains.map((g) => g.gain.value);
    p.audio.setAmbientMix({ high: 1 });
    expect(p.ctx.created.gains.map((g) => g.gain.value)).toEqual(before);
    p.audio.stopAmbient();
  });

  it('the cries come only from up high: a hawk, or now and then a bleat', () => {
    const p = ambienceProbe('gorge');
    const [cry] = p.intervalFns;
    const run = (r) => {
      const before = p.ctx.created.oscs.length;
      const realRandom = Math.random;
      Math.random = () => r;
      try { cry(); } finally { Math.random = realRandom; }
      return p.ctx.created.oscs.slice(before);
    };
    expect(run(0)).toHaveLength(0); // high 0: no oscillator
    p.audio.setAmbientMix({ high: 0.5 });
    expect(run(0)).toHaveLength(0); // only while high > 0.5
    p.audio.setAmbientMix({ high: 0.8 });
    const hawk = run(0.9);
    expect(hawk).toHaveLength(2); // two tones, the second lower: a falling cry
    const [first, second] = hawk.map((o) => o.frequency.scheduled[0]);
    expect(second).toBeLessThan(first);
    const bleat = run(0.1); // 1 in 4
    expect(bleat.length).toBeGreaterThan(0);
    expect(bleat[0].type).toBe('sawtooth');
    expect(bleat.flatMap((o) => o.frequency.scheduled).every((f) => f < 1000)).toBe(true);
    p.audio.stopAmbient();
  });

  // Gorge part 3, C7: drips, by depth. One self-rescheduling setTimeout at
  // random gaps of 0.8-2.2 s; a soft high plink, gain 0.02 x cave at most.
  it('drips only in a cave, and soft', () => {
    const p = ambienceProbe('gorge');
    expect(p.timeoutFns).toHaveLength(1);
    const drip = p.timeoutFns[0];
    const origSetTimeout = global.setTimeout;
    const waits = [];
    const run = (r) => {
      const before = p.ctx.created.oscs.length;
      const beforeGains = p.ctx.created.gains.length;
      const realRandom = Math.random;
      Math.random = () => r;
      global.setTimeout = (fn, wait) => { waits.push(wait); return 0; };
      try { drip(); } finally { Math.random = realRandom; global.setTimeout = origSetTimeout; }
      return { oscs: p.ctx.created.oscs.slice(before), gains: p.ctx.created.gains.slice(beforeGains) };
    };
    expect(run(0).oscs).toHaveLength(0); // no mix yet: cave 0
    p.audio.setAmbientMix({ high: 0, cave: 0 });
    expect(run(0.5).oscs).toHaveLength(0);
    for (const cave of [0.3, 1]) {
      p.audio.setAmbientMix({ high: 0, cave });
      for (const r of [0, 0.5, 0.999]) {
        const { oscs, gains } = run(r);
        expect(oscs.length).toBeGreaterThan(0);
        for (const o of oscs) for (const f of o.frequency.scheduled) {
          expect(f).toBeGreaterThanOrEqual(1800);
          expect(f).toBeLessThanOrEqual(2400);
        }
        expect(gains.length).toBeGreaterThan(0);
        for (const g of gains) {
          expect(g.gain.scheduled.length).toBeGreaterThan(0);
          for (const v of g.gain.scheduled) expect(v).toBeLessThanOrEqual(0.02 * cave + 1e-12);
          // final review M1: no hard onset. The gain starts near 0 and ramps
          // up over a few milliseconds to at most 0.02, then fades out.
          const [first, second] = g.gain.events;
          expect(first[0]).toBe('set');
          expect(first[1]).toBeLessThanOrEqual(1e-3);
          expect(second[0]).toBe('linear');
          expect(second[1]).toBeLessThanOrEqual(0.02 * cave + 1e-12);
          expect(second[1]).toBeGreaterThan(0);
          expect(second[2] - first[2]).toBeGreaterThanOrEqual(0.005);
          expect(second[2] - first[2]).toBeLessThanOrEqual(0.012);
        }
      }
    }
    // random gaps of 0.8-2.2 s, never a beat
    for (const w of waits) {
      expect(w).toBeGreaterThanOrEqual(800);
      expect(w).toBeLessThanOrEqual(2200);
    }
    expect(new Set(waits).size).toBeGreaterThan(1);
    p.audio.stopAmbient();
    // once stopped, a timer already queued plays nothing
    p.audio.setAmbientMix({ high: 0, cave: 1 });
    expect(run(0.5).oscs).toHaveLength(0);
  });

  it('a rainy or dusk Gorge works as the generic branch, and never adds birdsong', () => {
    const wet = ambienceProbe('gorge', { rain: true });
    expect(wet.bufferSources).toHaveLength(3); // wind + lap + rain
    expect(wet.intervals).toBe(1); // the cries
    wet.audio.stopAmbient();
    const dusk = ambienceProbe('gorge', { dusk: true });
    expect(dusk.bufferSources).toHaveLength(2);
    expect(dusk.intervals).toBe(2); // the cries and the crickets
    const [, crickets] = pitchesOf(dusk);
    for (const f of crickets) expect(f).toBe(4200);
    dusk.audio.stopAmbient();
  });

  it('a dusk Pines is the low wind, the frogs and the crickets, and still never birdsong', () => {
    const dusk = ambienceProbe('pines', { dusk: true });
    expect(dusk.bufferSources).toHaveLength(1); // the wind
    expect(dusk.timeouts).toBe(0); // no gulls, no horn
    expect(dusk.intervals).toBe(2); // the frogs and the crickets
    expect(dusk.ctx.created.gains.map((g) => g.gain.value)).toContain(0.035);
    const [frogs, crickets] = pitchesOf(dusk);
    expect(frogs.length).toBeGreaterThan(0);
    for (const f of frogs) expect(f).toBeLessThan(400);
    expect(crickets.length).toBeGreaterThan(0);
    for (const f of crickets) expect(f).toBe(4200);
    for (const f of [...frogs, ...crickets]) expect(f < 1400 || f > 2300, `${f} Hz is birdsong`).toBe(true);
    dusk.audio.stopAmbient();
    for (const src of dusk.bufferSources) expect(src.stopped).toBe(true);
  });

  it('a rainy dusk Pines has the wind, the rain, the frogs and the crickets', () => {
    const p = ambienceProbe('pines', { dusk: true, rain: true });
    expect(p.bufferSources).toHaveLength(2); // wind + rain
    expect(p.intervals).toBe(2);
    expect(p.timeouts).toBe(0);
    const [frogs, crickets] = pitchesOf(p);
    for (const f of frogs) expect(f).toBeLessThan(400);
    for (const f of crickets) expect(f).toBe(4200);
    p.audio.stopAmbient();
    for (const src of p.bufferSources) expect(src.stopped).toBe(true);
  });

  it('routes every docks layer through the master bus, never to destination', () => {
    const { ctx, bufferSources } = ambienceProbe('docks');
    for (const node of [...ctx.created.oscs, ...ctx.created.gains, ...bufferSources]) {
      expect(node.connections).not.toContain(ctx.destination);
    }
    // The compressor is the only thing that may reach the destination.
    expect(ctx.created.compressors).toHaveLength(1);
    expect(ctx.created.compressors[0].connections).toContain(ctx.destination);
  });

  it('starts no docks layer at all while muted', () => {
    // settings.muted is the single source of truth: a muted walk must not
    // leave a horn timer or a looping buffer running in the background.
    const ctx = fakeCtx();
    const bufferSources = [];
    const origCreateBufferSource = ctx.createBufferSource;
    ctx.createBufferSource = () => { const n = origCreateBufferSource(); bufferSources.push(n); return n; };
    const audio = createAudio({ contextFactory: () => ctx });
    audio.setMuted(true);
    audio.startAmbient('docks');
    expect(bufferSources).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// v20 "Ruffled Fur" — hiss(). The game had no hostile cat sound at all; bark()
// was the nearest thing and belongs to the dog. What is worth pinning is that
// it is NOISE rather than a note (a pitched hiss is a cartoon growl), that it
// stays on the shared bus, and that it keeps the deliberately un-frightening
// shape: no low end, soft attack, short, quieter than the dog.
// ---------------------------------------------------------------------------
describe('hiss', () => {
  // The master and reverb-send gains are built with a plain .value, so the
  // only gain node with scheduled points is the hiss's amplitude envelope.
  const envelopeGain = (ctx) => ctx.created.gains.find((g) => g.gain.scheduled.length > 0);

  const probe = (fn) => {
    const ctx = fakeCtx();
    const filters = [];
    const sources = [];
    const origFilter = ctx.createBiquadFilter;
    const origSource = ctx.createBufferSource;
    ctx.createBiquadFilter = () => { const n = origFilter(); filters.push(n); return n; };
    ctx.createBufferSource = () => { const n = origSource(); sources.push(n); return n; };
    const audio = createAudio({ contextFactory: () => ctx });
    fn(audio);
    return { ctx, audio, filters, sources };
  };

  it('is filtered noise, not an oscillator — a pitched hiss would be a growl', () => {
    const { ctx, sources, filters } = probe((a) => a.hiss());
    expect(ctx.created.oscs).toHaveLength(0);
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(false); // one-shot, not an ambient layer
    expect(filters).toHaveLength(2);
  });

  it('strips the low end, which is where a frightening growl would live', () => {
    const { filters } = probe((a) => a.hiss());
    const hp = filters.find((f) => f.type === 'highpass');
    expect(hp).toBeTruthy();
    expect(hp.frequency.value).toBeGreaterThanOrEqual(1000);
  });

  it('swells in rather than cracking in, and is quieter than the dog', () => {
    const { ctx } = probe((a) => a.hiss());
    // ensure() builds the master gain and the reverb-send gain with no
    // scheduling on either, so the one gain carrying an envelope is the
    // hiss's own.
    const env = envelopeGain(ctx);
    expect(env).toBeTruthy();
    // Starts near silence and is ramped up — never set to full at t0.
    expect(env.gain.scheduled[0]).toBeLessThan(0.001);
    const peak = Math.max(...env.gain.scheduled);
    // loopedNoiseSource pre-scales its buffer to +/-0.3, so the audible peak
    // is peak * 0.3 — well under bark()'s 0.09 oscillator gain.
    expect(peak * 0.3).toBeLessThan(0.09);
  });

  it('routes through the master bus like every other sound', () => {
    const { ctx, sources, filters } = probe((a) => a.hiss());
    for (const node of [...sources, ...filters, ...ctx.created.gains]) {
      expect(node.connections).not.toContain(ctx.destination);
    }
    expect(ctx.created.compressors[0].connections).toContain(ctx.destination);
  });

  it('scales with the volume argument and clamps a nonsense one', () => {
    const peakFor = (v) => {
      const { ctx } = probe((a) => a.hiss(v));
      return Math.max(...envelopeGain(ctx).gain.scheduled);
    };
    expect(peakFor(0.5)).toBeLessThan(peakFor(1));
    expect(peakFor(99)).toBeCloseTo(peakFor(1), 6);
    expect(peakFor(-1)).toBeCloseTo(peakFor(0), 6);
  });

  it('respects mute, and setVolume reaches it through the master gain', () => {
    const { ctx, sources } = probe((a) => { a.setMuted(true); a.hiss(); });
    expect(sources).toHaveLength(0);
    // ...and unmuted, the master factor still governs it.
    const live = probe((a) => { a.setVolume(0.25); a.hiss(); });
    expect(live.ctx.created.gains[0].gain.value).toBeCloseTo(0.25);
  });

  it('is safe to call before any other sound has built the context', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    expect(() => audio.hiss()).not.toThrow(); // ensure() builds the bus lazily
    expect(ctx.created.compressors).toHaveLength(1);
  });
});

describe('waterSplash (swimming)', () => {
  // A context that records the buffer sources, filters and gains each kind
  // builds, and when each source stops.
  function splashCtx() {
    const ctx = fakeCtx();
    ctx.sources = [];
    ctx.filters = [];
    const mkSrc = ctx.createBufferSource;
    ctx.createBufferSource = () => {
      const n = mkSrc();
      n.stopAt = null;
      n.stop = (at) => { n.stopped = true; n.stopAt = at; };
      ctx.sources.push(n);
      return n;
    };
    const mkFilter = ctx.createBiquadFilter;
    ctx.createBiquadFilter = () => { const n = mkFilter(); ctx.filters.push(n); return n; };
    return ctx;
  }
  const play = (kind, { muted = false } = {}) => {
    const ctx = splashCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.chime(); // build the bus first, so only the splash's own nodes are counted below
    const master = ctx.created.gains[0];
    const before = ctx.sources.length;
    if (muted) audio.setMuted(true);
    audio.waterSplash(kind);
    return { ctx, master, started: ctx.sources.slice(before) };
  };

  for (const kind of ['wade', 'paddle', 'shake']) {
    it(`${kind}: one noise burst through a bandpass into the master bus`, () => {
      const { ctx, master, started } = play(kind);
      expect(started).toHaveLength(1);
      const [src] = started;
      expect(src.connections).not.toContain(ctx.destination);
      const bp = src.connections[0];
      expect(bp.type).toBe('bandpass');
      expect(bp.connections).not.toContain(ctx.destination);
      const g = bp.connections[0];
      expect(g.gain).toBeDefined();
      expect(g.connections).toContain(master);
      expect(g.connections).not.toContain(ctx.destination);
    });
  }

  it('the shake lasts longer than a wading splash', () => {
    const wade = play('wade').started[0].stopAt;
    const shake = play('shake').started[0].stopAt;
    expect(wade).toBeCloseTo(0.12, 5);
    expect(shake).toBeCloseTo(0.5, 5);
    expect(shake).toBeGreaterThan(wade);
  });

  it('builds its noise buffer once and reuses it for every splash (Polish 3)', () => {
    const ctx = splashCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.chime();
    let built = 0;
    const mkBuf = ctx.createBuffer;
    ctx.createBuffer = (...a) => { built++; return mkBuf(...a); };
    const before = ctx.sources.length;
    for (const kind of ['wade', 'paddle', 'shake', 'wade', 'shake']) audio.waterSplash(kind);
    const started = ctx.sources.slice(before);
    expect(started).toHaveLength(5);
    expect(built).toBe(1);
    for (const s of started) expect(s.buffer).toBe(started[0].buffer);
    // Long enough for the longest kind (the shake, 0.5 s).
    expect(started[0].buffer.length).toBeGreaterThanOrEqual(Math.floor(ctx.sampleRate * 0.5));
  });

  it('plays nothing while muted', () => {
    for (const kind of ['wade', 'paddle', 'shake']) {
      expect(play(kind, { muted: true }).started).toHaveLength(0);
    }
  });

  it('an unknown kind plays nothing', () => {
    expect(play('cannonball').started).toHaveLength(0);
    expect(play(undefined).started).toHaveLength(0);
    expect(play('toString').started).toHaveLength(0);
  });
});
