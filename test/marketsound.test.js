import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// =============================================================================
// The Market's sounds (step 3, V9): the street musician's tune, the pigeons'
// coos, the bicycle bell and a soft murmur of chatter by the four treat
// stalls, each a few short synthesised tones on the game's own context,
// quiet, and silent (the context never asked for) while the game is muted.
// =============================================================================

const { MUSIC, BELL, CHATTER, MARKET_SOUND_SALT, createMarketSound } = await import('../src/world/marketsound.js');
const { CALLS, EAR } = await import('../src/world/roofssound.js');
const { MUSICIAN, PIGEON_PATCH, TREAT_STALLS, stallById } = await import('../src/world/marketplan.js');
const { MARKET_APPLE_SALT, MARKET_PETAL_SALT } = await import('../src/world/marketfruit.js');
const { MARKET_STALL_SALT } = await import('../src/marketrules.js');
const { FIND_SALT } = await import('../src/foundwear/rules.js');
const { createMarketLife } = await import('../src/world/marketlife.js');

// The Rooftops' stand-in audio (test/roofssound.test.js: never the game's,
// nothing here makes a real sound), with the buffers and filters chatter's
// noise wants. `asked` counts every getContext() and getMaster() call.
function fakeParam(v = 1) {
  const p = {
    value: v,
    events: [],
    setValueAtTime(x, t) { p.events.push(['set', x, t]); },
    linearRampToValueAtTime(x, t) { p.events.push(['linear', x, t]); },
    exponentialRampToValueAtTime(x, t) { p.events.push(['exp', x, t]); },
    setTargetAtTime(x, t, k) { p.events.push(['target', x, t, k]); },
    cancelScheduledValues(t) { p.events.push(['cancel', null, t]); },
    cancelAndHoldAtTime(t) { p.events.push(['hold', null, t]); },
  };
  return p;
}
function fakeNode(extra = {}) {
  const n = { connections: [], stops: [], connect(t) { n.connections.push(t); return t; }, start(t) { n.startAt = t; }, stop(t) { n.stops.push(t); }, disconnected: false, disconnect() { n.disconnected = true; }, ...extra };
  return n;
}
function fakeAudio({ muted = false, state = undefined, noIsMuted = false } = {}) {
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state,
    oscs: [],
    gains: [],
    sources: [],
    filters: [],
    buffers: [],
    createGain() { const n = fakeNode({ gain: fakeParam(1) }); ctx.gains.push(n); return n; },
    createOscillator() { const n = fakeNode({ frequency: fakeParam(440), type: 'sine' }); ctx.oscs.push(n); return n; },
    createBiquadFilter() { const n = fakeNode({ frequency: fakeParam(350), Q: fakeParam(1), type: 'lowpass' }); ctx.filters.push(n); return n; },
    createBufferSource() { const n = fakeNode({ buffer: null, playbackRate: fakeParam(1) }); ctx.sources.push(n); return n; },
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      const b = { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => data };
      ctx.buffers.push(b);
      return b;
    },
  };
  const master = fakeNode({ gain: fakeParam(1), isMaster: true });
  let m = muted;
  const audio = {
    ctx,
    master,
    asked: 0,
    setMuted(v) { m = !!v; },
    getContext() { audio.asked++; return ctx; },
    getMaster() { audio.asked++; return master; },
  };
  if (!noIsMuted) audio.isMuted = () => m;
  return audio;
}

const STALL_SPOTS = TREAT_STALLS.map((id) => stallById(id).at);
const opts = () => ({ pigeons: [PIGEON_PATCH], musician: MUSICIAN, stalls: STALL_SPOTS });
const from = (p, d, y = 0) => ({ x: p.x + d, y, z: p.z }); // d m east of p
// a point d m from the musician, out on the square (east, then south)
const byMusician = (d) => ({ x: MUSICIAN.x + d * 0.6, y: 0, z: MUSICIAN.z + d * 0.8 });

// Walks `secs` of walk seconds at 30 frames a second, the context's clock
// keeping time; `each(t)` runs before each frame (move her, mute).
function walk(sound, audio, secs, catPos, each = null, t0 = 0) {
  const dt = 1 / 30;
  const n = Math.round(secs * 30);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    each?.(t);
    audio.ctx.currentTime += dt;
    sound.update(dt, typeof catPos === 'function' ? catPos(t) : catPos, t);
  }
}

const firstF = (osc) => osc.frequency.events.find((e) => e[0] === 'set')?.[1];
const TUNE_F = new Set(MUSIC.notes.map((n) => n.f));
const tuneOscs = (audio) => audio.ctx.oscs.filter((o) => o.type === MUSIC.type && TUNE_F.has(firstF(o)));
const cooOscs = (audio) => audio.ctx.oscs.filter((o) => firstF(o) === CALLS.pigeon.notes[0].f);
const peakOf = (node) => Math.max(0, ...node.connections[0].gain.events.map((e) => e[1] ?? 0));
const peak = (oscs) => Math.max(0, ...oscs.map(peakOf));

afterEach(() => vi.restoreAllMocks());

describe('the tune, the bell and the chatter', () => {
  it('a 16-note tune on a triangle, each note short, a 6 s rest between plays; quiet calls', () => {
    expect(MUSIC.ear).toBe(14);
    expect(MUSIC.gain).toBe(0.03);
    expect(MUSIC.type).toBe('triangle');
    expect(MUSIC.notes).toHaveLength(16);
    expect(MUSIC.rest).toBe(6);
    for (const n of MUSIC.notes) {
      expect(n.dur).toBeGreaterThan(0);
      expect(n.dur).toBeLessThanOrEqual(0.35);
      expect(n.f).toBeGreaterThan(200);
      expect(n.f).toBeLessThan(1200);
    }
    for (let i = 1; i < 16; i++) expect(MUSIC.notes[i].at).toBeGreaterThan(MUSIC.notes[i - 1].at);
    expect(BELL.gain).toBe(0.04);
    expect(CHATTER).toMatchObject({ ear: 9, gain: 0.012 });
    // its own salt, apart from every other stream's
    expect(new Set([MARKET_SOUND_SALT, MARKET_APPLE_SALT, MARKET_PETAL_SALT, MARKET_STALL_SALT, FIND_SALT, CALLS.pigeon.salt]).size).toBe(6);
  });
});

describe('muted', () => {
  it('muted: no sound, and no AudioContext asked for', () => {
    const audio = fakeAudio({ muted: true });
    const sound = createMarketSound(audio, opts());
    walk(sound, audio, 60, byMusician(1));
    walk(sound, audio, 30, from(PIGEON_PATCH, 0.5));
    walk(sound, audio, 30, from(STALL_SPOTS[0], 1));
    sound.bell();
    expect(audio.asked).toBe(0);
    expect(audio.ctx.oscs).toHaveLength(0);
    expect(audio.ctx.sources).toHaveLength(0);
    sound.dispose();
    expect(audio.asked).toBe(0);
  });

  it('muted mid-walk: silent from the next frame', () => {
    const audio = fakeAudio();
    const sound = createMarketSound(audio, opts());
    walk(sound, audio, 20, byMusician(1));
    expect(tuneOscs(audio).length).toBeGreaterThan(0);
    // muted between two frames, while the tune may still be sounding
    let made = audio.ctx.oscs.length;
    audio.setMuted(true);
    audio.ctx.currentTime += 1 / 30;
    const frame = audio.ctx.currentTime;
    const still = audio.ctx.oscs.filter((o) => o.stops[0] > frame);
    sound.update(1 / 30, byMusician(1), 20);
    // whatever was still sounding is eased out and stopped by this frame's end
    for (const o of still) expect(Math.min(...o.stops)).toBeLessThanOrEqual(frame + 0.05);
    walk(sound, audio, 30, byMusician(1), null, 20);
    sound.bell();
    expect(audio.ctx.oscs.length).toBe(made);
    // unmuted: it plays again, with no burst of everything missed
    audio.setMuted(false);
    made = audio.ctx.oscs.length;
    walk(sound, audio, 1 / 30, byMusician(1), null, 50);
    expect(audio.ctx.oscs.length - made).toBeLessThanOrEqual(4);
    sound.dispose();
  });

  it('an audio without isMuted plays nothing', () => {
    const audio = fakeAudio({ noIsMuted: true });
    const sound = createMarketSound(audio, opts());
    walk(sound, audio, 40, byMusician(1));
    sound.bell();
    expect(audio.asked).toBe(0);
    expect(audio.ctx.oscs).toHaveLength(0);
    sound.dispose();
    // and no audio at all
    const none = createMarketSound(null, opts());
    none.update(1 / 30, byMusician(1), 0);
    none.bell();
    none.dispose();
  });

  it('a suspended context plays nothing, and nothing piles up for when it resumes', () => {
    const audio = fakeAudio({ state: 'suspended' });
    const sound = createMarketSound(audio, opts());
    walk(sound, audio, 30, byMusician(1));
    expect(audio.ctx.oscs).toHaveLength(0);
    audio.ctx.state = 'running';
    walk(sound, audio, 1 / 30, byMusician(1), null, 30);
    expect(audio.ctx.oscs.length).toBeLessThanOrEqual(4);
    sound.dispose();
  });
});

describe('what she hears', () => {
  it('by the musician she hears the tune, louder nearer; 20 m away, none', () => {
    const near = fakeAudio();
    const s1 = createMarketSound(near, opts());
    walk(s1, near, 30, byMusician(1.5));
    const close = tuneOscs(near);
    // in 30 s, the whole tune at least once (16 notes a play)
    expect(close.length).toBeGreaterThanOrEqual(16);
    const mid = fakeAudio();
    const s2 = createMarketSound(mid, opts());
    walk(s2, mid, 30, byMusician(8));
    expect(tuneOscs(mid).length).toBe(close.length);
    expect(peak(tuneOscs(mid))).toBeLessThan(peak(close));
    expect(peak(close)).toBeLessThanOrEqual(MUSIC.gain + 1e-9);
    const far = fakeAudio();
    const s3 = createMarketSound(far, opts());
    walk(s3, far, 30, byMusician(20));
    expect(tuneOscs(far)).toHaveLength(0);
    // nobody to hear it (no cat yet): nothing
    const nobody = fakeAudio();
    const s4 = createMarketSound(nobody, opts());
    walk(s4, nobody, 30, null);
    expect(nobody.ctx.oscs).toHaveLength(0);
    for (const s of [s1, s2, s3, s4]) s.dispose();
  });

  it('the tune rests 6 s between plays', () => {
    const audio = fakeAudio();
    const sound = createMarketSound(audio, opts());
    walk(sound, audio, 60, byMusician(1));
    const starts = tuneOscs(audio).map((o) => o.startAt).sort((p, q) => p - q);
    const len = MUSIC.notes.at(-1).at + MUSIC.notes.at(-1).dur;
    // the plays: a start more than the tune's length after the last note began
    const plays = [starts[0]];
    for (let i = 1; i < starts.length; i++) if (starts[i] - starts[i - 1] > MUSIC.rest - 0.5) plays.push(starts[i]);
    expect(plays.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < plays.length; i++) expect(plays[i] - plays[i - 1]).toBeCloseTo(len + MUSIC.rest, 1);
    sound.dispose();
  });

  it('by the pigeons she hears them coo; far off, not', () => {
    const near = fakeAudio();
    const s1 = createMarketSound(near, opts());
    walk(s1, near, 40, from(PIGEON_PATCH, 1));
    expect(cooOscs(near).length).toBeGreaterThan(0);
    const far = fakeAudio();
    const s2 = createMarketSound(far, opts());
    walk(s2, far, 40, from(PIGEON_PATCH, EAR.pigeon + 2));
    expect(cooOscs(far)).toHaveLength(0);
    s1.dispose();
    s2.dispose();
  });

  it('by a treat stall she hears a soft murmur of chatter; far from all four, none', () => {
    const near = fakeAudio();
    const s1 = createMarketSound(near, opts());
    walk(s1, near, 20, from(STALL_SPOTS[0], 2));
    expect(near.ctx.sources.length).toBeGreaterThan(0);
    for (const src of near.ctx.sources) {
      expect(src.buffer).toBeTruthy();
      expect(src.connections[0]).toBe(near.ctx.filters.find((f) => f === src.connections[0]));
    }
    // one noise buffer for the whole walk, painted once
    expect(near.ctx.buffers).toHaveLength(1);
    const far = fakeAudio();
    const s2 = createMarketSound(far, opts());
    walk(s2, far, 20, { x: 0, y: 0, z: 20.5 }); // the spawn: 10 m and more from every treat stall
    expect(far.ctx.sources).toHaveLength(0);
    s1.dispose();
    s2.dispose();
  });

  it('the bell rings twice when asked', () => {
    const audio = fakeAudio();
    const sound = createMarketSound(audio, opts());
    // a frame first, the way the walk runs (the bell is rung from the life's frame)
    sound.update(1 / 30, from(PIGEON_PATCH, 30), 0);
    const before = audio.ctx.oscs.length;
    sound.bell();
    const ring = audio.ctx.oscs.slice(before);
    const strikes = new Set(ring.map((o) => o.startAt.toFixed(3)));
    expect(strikes.size).toBe(2);
    const [a, b] = [...strikes].map(Number).sort((p, q) => p - q);
    expect(b - a).toBeGreaterThan(0.08);
    expect(b - a).toBeLessThan(0.4);
    for (const o of ring) expect(firstF(o)).toBeGreaterThan(1500); // a bright ring
    expect(peak(ring)).toBeLessThanOrEqual(BELL.gain + 1e-9);
    sound.dispose();
  });

  it('every tone is quiet before the master', () => {
    const audio = fakeAudio();
    const sound = createMarketSound(audio, opts());
    // right by everything at once, as loud as it gets
    walk(sound, audio, 30, byMusician(0.5));
    walk(sound, audio, 30, from(PIGEON_PATCH, 0), null, 30);
    walk(sound, audio, 30, from(STALL_SPOTS[1], 0), null, 60);
    sound.bell();
    expect(audio.ctx.gains.length).toBeGreaterThan(0);
    for (const g of audio.ctx.gains) {
      expect(g.gain.value).toBeLessThanOrEqual(0.05);
      for (const e of g.gain.events) if (e[1] !== null) expect(e[1]).toBeLessThanOrEqual(0.05);
      // and each goes to the game's master (the volume setting)
      expect(g.connections.every((c) => c === audio.master)).toBe(true);
    }
    expect(audio.master.gain.events).toHaveLength(0); // the master is the game's: never touched
    sound.dispose();
  });

  it('dispose stops everything still sounding', () => {
    const audio = fakeAudio();
    const sound = createMarketSound(audio, opts());
    walk(sound, audio, 12, byMusician(1));
    sound.bell();
    const now = audio.ctx.currentTime;
    const still = [...audio.ctx.oscs, ...audio.ctx.sources].filter((o) => o.stops[0] > now + 0.05);
    expect(still.length).toBeGreaterThan(0);
    sound.dispose();
    for (const o of still) expect(Math.min(...o.stops)).toBeLessThanOrEqual(now + 0.05);
    // and after it, nothing
    const made = audio.ctx.oscs.length;
    walk(sound, audio, 20, byMusician(1), null, 12);
    sound.bell();
    expect(audio.ctx.oscs.length).toBe(made);
  });

  it('the same walk makes the same sounds, and nothing draws on Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const record = () => {
      const audio = fakeAudio();
      const sound = createMarketSound(audio, opts());
      const path = (t) => ({ x: Math.cos(t / 9) * 7, y: 0, z: Math.sin(t / 9) * 7 });
      walk(sound, audio, 90, path);
      sound.bell();
      sound.dispose();
      const c = audio.ctx;
      return {
        oscs: c.oscs.map((o) => [o.type, o.startAt, o.frequency.events, o.connections[0].gain.events]),
        sources: c.sources.map((s) => [s.startAt, s.playbackRate.events, s.connections[0].frequency.events, s.connections[0].Q.value]),
        noise: Array.from(c.buffers[0]?.getChannelData(0) ?? []),
      };
    };
    const a = record();
    const b = record();
    expect(a.oscs.length).toBeGreaterThan(20);
    expect(a.sources.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(random).not.toHaveBeenCalled();
  });
});

describe("the square's life plays them", () => {
  it('with audio, the tune by the musician; muted, nothing asked for', () => {
    const scene = new THREE.Scene();
    const audio = fakeAudio();
    const life = createMarketLife({ look: null, anchors: {} }, { scene, audio });
    const cat = new THREE.Vector3(MUSICIAN.x + 1, 0, MUSICIAN.z + 1);
    for (let i = 0; i < 30 * 20; i++) { audio.ctx.currentTime += 1 / 30; life.update(1 / 30, i / 30, cat, null, null); }
    expect(tuneOscs(audio).length).toBeGreaterThan(0);
    life.dispose();
    const hush = fakeAudio({ muted: true });
    const quiet = createMarketLife({ look: null, anchors: {} }, { scene, audio: hush });
    for (let i = 0; i < 30 * 20; i++) quiet.update(1 / 30, i / 30, cat, null, null);
    quiet.dispose();
    expect(hush.asked).toBe(0);
  });
});
