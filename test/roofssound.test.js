import { describe, it, expect, vi, afterEach } from 'vitest';
import { EAR, CALLS, loudness, createRoofsSound } from '../src/world/roofssound.js';

// A stand-in audio (never the game's: nothing here makes a real sound). Its
// getContext() hands out a counting fake context; `asked` counts every
// getContext() and getMaster() call.
function fakeParam(v = 1) {
  const p = {
    value: v,
    events: [],
    setValueAtTime(x, t) { p.events.push(['set', x, t]); },
    linearRampToValueAtTime(x, t) { p.events.push(['linear', x, t]); },
    exponentialRampToValueAtTime(x, t) { p.events.push(['exp', x, t]); },
  };
  return p;
}
function fakeNode(extra = {}) {
  const n = { connections: [], stops: [], connect(t) { n.connections.push(t); return t; }, start(t) { n.startAt = t; }, stop(t) { n.stops.push(t); }, ...extra };
  return n;
}
function fakeAudio({ muted = false } = {}) {
  const ctx = {
    currentTime: 0,
    oscs: [],
    gains: [],
    createGain() { const n = fakeNode({ gain: fakeParam(1) }); ctx.gains.push(n); return n; },
    createOscillator() { const n = fakeNode({ frequency: fakeParam(440), type: 'sine' }); ctx.oscs.push(n); return n; },
  };
  const master = fakeNode({ gain: fakeParam(1), isMaster: true });
  let m = muted;
  const audio = {
    ctx,
    master,
    asked: 0,
    isMuted: () => m,
    setMuted(v) { m = !!v; },
    getContext() { audio.asked++; return ctx; },
    getMaster() { audio.asked++; return master; },
  };
  return audio;
}

const LOFT = { x: -33, y: 9, z: -45.5 };
const at = (d, y = LOFT.y) => ({ x: LOFT.x + d, y, z: LOFT.z });

// Walks `secs` of walk seconds at 30 frames a second, the context's clock
// keeping time; `each(t)` runs before each frame (move birds, mute).
function walk(sound, audio, secs, catPos, each = null, t0 = 0) {
  const dt = 1 / 30;
  const n = Math.round(secs * 30);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    each?.(t);
    audio.ctx.currentTime += dt;
    sound.update(dt, typeof catPos === 'function' ? catPos(t) : catPos);
  }
}

const firstF = (osc) => osc.frequency.events.find((e) => e[0] === 'set')?.[1];
const ofCall = (audio, call) => audio.ctx.oscs.filter((o) => firstF(o) === call.notes[0].f);
const peak = (oscs) => Math.max(0, ...oscs.flatMap((o) => o.connections[0].gain.events.map((e) => e[1])));

function bird(id, kind, pos, flying = false) {
  return { id, kind, flying, pos: { ...pos } };
}

afterEach(() => vi.restoreAllMocks());

describe('the ears and the calls', () => {
  it('has an ear for each call', () => {
    expect(EAR).toEqual({ loft: 16, pigeon: 8, sparrow: 10, gull: 30, flap: 8 });
  });
  it('loudness is (1 - d / ear) squared, clamped', () => {
    expect(loudness(0, 16)).toBe(1);
    expect(loudness(8, 16)).toBeCloseTo(0.25);
    expect(loudness(16, 16)).toBe(0);
    expect(loudness(40, 16)).toBe(0);
    expect(loudness(-1, 16)).toBe(1);
  });
  it('the sparrow chirps twice, 3200 to 3800 Hz; the gull is the game\'s, a sawtooth 1400 to 900 Hz', () => {
    expect(CALLS.sparrow.notes).toHaveLength(2);
    for (const n of CALLS.sparrow.notes) expect([n.f, n.to]).toEqual([3200, 3800]);
    for (const n of CALLS.gull.notes) expect([n.type, n.f, n.to]).toEqual(['sawtooth', 1400, 900]);
  });
  it('a take-off is six soft beats 60 ms apart', () => {
    expect(CALLS.flap.notes).toHaveLength(6);
    CALLS.flap.notes.forEach((n, i) => expect(n.at).toBeCloseTo(i * 0.06));
  });
});

describe('muted (Review Focus 2)', () => {
  it('muted: no sound, and no AudioContext asked for', () => {
    const audio = fakeAudio({ muted: true });
    const birds = { birds: [bird('pigeon-7', 'pigeon', at(1)), bird('gull-1', 'gull', at(3))], following: null };
    const sound = createRoofsSound(audio, { birds, loft: LOFT });
    walk(sound, audio, 60, at(1), (t) => { birds.birds[0].flying = Math.floor(t / 5) % 2 === 1; });
    expect(audio.asked).toBe(0);
    expect(audio.ctx.oscs).toHaveLength(0);
    sound.dispose();
    expect(audio.asked).toBe(0);
  });

  it('muted mid-walk: silent from the next frame', () => {
    const audio = fakeAudio();
    const birds = { birds: [bird('pigeon-7', 'pigeon', at(1))], following: null };
    const sound = createRoofsSound(audio, { birds, loft: LOFT });
    walk(sound, audio, 20, at(1));
    const before = audio.ctx.oscs.length;
    expect(before).toBeGreaterThan(0);
    // muted between two frames, while a coo may still be sounding
    audio.setMuted(true);
    const muteAt = audio.ctx.currentTime;
    audio.ctx.currentTime += 1 / 30;
    sound.update(1 / 30, at(1));
    for (const o of audio.ctx.oscs) {
      const last = o.stops[o.stops.length - 1];
      // stopped now, or it had already ended
      expect(last === undefined || last <= muteAt + 1 / 30 + 1e-9).toBe(true);
    }
    walk(sound, audio, 40, at(1), (t) => { birds.birds[0].flying = Math.floor(t / 4) % 2 === 1; }, 20);
    expect(audio.ctx.oscs.length).toBe(before);
  });

  it('an audio without isMuted plays nothing', () => {
    const audio = fakeAudio();
    delete audio.isMuted;
    const sound = createRoofsSound(audio, { birds: { birds: [bird('pigeon-7', 'pigeon', at(1))], following: null }, loft: LOFT });
    walk(sound, audio, 60, at(1));
    expect(audio.asked).toBe(0);
    expect(audio.ctx.oscs).toHaveLength(0);
  });
});

describe('the birds she hears', () => {
  it('no node is made until the first call is due', () => {
    const audio = fakeAudio();
    createRoofsSound(audio, { birds: { birds: [], following: null }, loft: LOFT });
    expect(audio.asked).toBe(0);
    expect(audio.ctx.oscs).toHaveLength(0);
  });

  it('beside the loft she hears cooing, louder nearer; 20 m away, none', () => {
    const run = (d) => {
      const audio = fakeAudio();
      const sound = createRoofsSound(audio, { birds: { birds: [], following: null }, loft: LOFT });
      walk(sound, audio, 30, at(d));
      return { audio, coos: ofCall(audio, CALLS.loft) };
    };
    const near = run(2);
    const mid = run(10);
    const far = run(20);
    // one call every 2 to 4 s: between 7 and 15 in 30 s
    expect(near.coos.length).toBeGreaterThanOrEqual(7);
    expect(near.coos.length).toBeLessThanOrEqual(15);
    expect(far.coos).toHaveLength(0);
    expect(far.audio.asked).toBe(0);
    expect(peak(near.coos)).toBeGreaterThan(peak(mid.coos));
    expect(peak(mid.coos)).toBeGreaterThan(0);
    // every tone goes into the master
    for (const o of near.audio.ctx.oscs) expect(o.connections[0].connections).toContain(near.audio.master);
  });

  it('a perched pigeon within 8 m coos; a sparrow chirps within 10 m; a gull cries within 30 m', () => {
    const far = { x: 200, y: 0, z: 200 };
    const run = (b, d) => {
      const audio = fakeAudio();
      const sound = createRoofsSound(audio, { birds: { birds: [b], following: null }, loft: far });
      walk(sound, audio, 60, { x: b.pos.x + d, y: b.pos.y, z: b.pos.z });
      return audio;
    };
    const p = { x: 0, y: 5, z: 0 };
    expect(ofCall(run(bird('pigeon-1', 'pigeon', p), 3), CALLS.pigeon).length).toBeGreaterThan(0);
    expect(ofCall(run(bird('pigeon-1', 'pigeon', p), 9), CALLS.pigeon)).toHaveLength(0);
    expect(ofCall(run(bird('sparrow-1', 'sparrow', p), 4), CALLS.sparrow).length).toBeGreaterThan(0);
    expect(ofCall(run(bird('sparrow-1', 'sparrow', p), 11), CALLS.sparrow)).toHaveLength(0);
    expect(ofCall(run(bird('gull-1', 'gull', p), 20), CALLS.gull).length).toBeGreaterThan(0);
    expect(ofCall(run(bird('gull-1', 'gull', p), 31), CALLS.gull)).toHaveLength(0);
  });

  it('a bird taking off near her flaps; one far away does not', () => {
    const run = (d) => {
      const audio = fakeAudio();
      const b = bird('sparrow-1', 'sparrow', { x: 0, y: 5, z: 0 });
      const sound = createRoofsSound(audio, { birds: { birds: [b], following: null }, loft: { x: 200, y: 0, z: 200 } });
      walk(sound, audio, 3, { x: d, y: 5, z: 0 }, (t) => { b.flying = t >= 1; });
      return ofCall(audio, CALLS.flap);
    };
    expect(run(4)).toHaveLength(6); // one take-off, six beats
    expect(run(20)).toHaveLength(0);
  });

  it('the following pigeon coos when it lands', () => {
    const audio = fakeAudio();
    const b = bird('pigeon-7', 'pigeon', { x: 0, y: 5, z: 0 }, true);
    const birds = { birds: [b], following: 'pigeon-7' };
    const sound = createRoofsSound(audio, { birds, loft: { x: 200, y: 0, z: 200 } });
    // in flight for half a second, then it lands 4.5 m from her
    walk(sound, audio, 0.5, { x: 4.5, y: 5, z: 0 });
    b.flying = false;
    audio.ctx.currentTime += 1 / 30;
    sound.update(1 / 30, { x: 4.5, y: 5, z: 0 });
    expect(ofCall(audio, CALLS.pigeon).length).toBeGreaterThan(0);
  });

  it('every tone is quiet before the master', () => {
    const audio = fakeAudio();
    const near = (dx) => ({ x: LOFT.x + dx, y: LOFT.y, z: LOFT.z });
    const birds = {
      birds: [bird('pigeon-7', 'pigeon', near(0.5)), bird('sparrow-1', 'sparrow', near(0.3)), bird('gull-1', 'gull', near(0.2))],
      following: 'pigeon-7',
    };
    const sound = createRoofsSound(audio, { birds, loft: LOFT });
    walk(sound, audio, 90, LOFT, (t) => { for (const b of birds.birds) b.flying = Math.floor(t / 2) % 2 === 1; });
    expect(audio.ctx.gains.length).toBeGreaterThan(20);
    for (const g of audio.ctx.gains) {
      expect(g.gain.value).toBeLessThanOrEqual(0.05);
      for (const e of g.gain.events) expect(e[1]).toBeLessThanOrEqual(0.05);
    }
  });

  it('the same walk makes the same calls, and nothing draws on Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const run = () => {
      const audio = fakeAudio();
      const birds = {
        birds: [bird('pigeon-7', 'pigeon', at(2)), bird('sparrow-1', 'sparrow', at(4)), bird('gull-1', 'gull', at(12))],
        following: null,
      };
      const sound = createRoofsSound(audio, { birds, loft: LOFT });
      walk(sound, audio, 60, (t) => at(1 + (t % 10)), (t) => { birds.birds[1].flying = Math.floor(t / 7) % 2 === 1; });
      sound.dispose();
      return audio.ctx.oscs.map((o) => [o.type, firstF(o), Math.round(o.startAt * 1000)]);
    };
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(10);
    expect(b).toEqual(a);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('dispose stops anything still sounding', () => {
    const audio = fakeAudio();
    const sound = createRoofsSound(audio, { birds: { birds: [], following: null }, loft: LOFT });
    // walk until the first coo has just started
    let i = 0;
    while (audio.ctx.oscs.length === 0 && i++ < 300) {
      audio.ctx.currentTime += 1 / 30;
      sound.update(1 / 30, at(1));
    }
    expect(audio.ctx.oscs.length).toBeGreaterThan(0);
    const now = audio.ctx.currentTime;
    sound.dispose();
    for (const o of audio.ctx.oscs) {
      const last = o.stops[o.stops.length - 1];
      expect(last === undefined || last <= now + 1e-9).toBe(true);
    }
  });
});
