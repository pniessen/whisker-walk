import { describe, it, expect } from 'vitest';
import { composePhrase as cp } from '../src/music.js';
import * as lib from '../src/musicthemes.js';
import { THEMES, VOICES, themeFor } from '../src/musicthemes.js';
const composePhrase = (rng, o = {}) => cp(rng, { ...o, lib });
import { mulberry32 } from '../src/rng.js';
import { meowParams, createAudio } from '../src/audio.js';

const AREAS = ['neighborhood', 'park', 'seaside', 'den', 'docks', 'woods', 'river', 'moor', 'pines', 'gorge', 'farm', 'fair', 'roofs', 'market', 'house', 'lighthouse', 'greenhouse', 'moon', 'reef', 'crystal'];
const themed = Object.keys(THEMES).filter((k) => THEMES[k]);

describe('music themes', () => {
  it('every area id has a theme, or is the documented neighborhood fallback', () => {
    for (const a of AREAS) expect(a in THEMES, a).toBe(true);
    expect(THEMES.neighborhood).toBeNull();
  });
  it('same seed, same themed phrase; different areas differ', () => {
    for (const a of themed) {
      expect(composePhrase(mulberry32(7), { mood: 'day', area: a })).toEqual(composePhrase(mulberry32(7), { mood: 'day', area: a }));
    }
    expect(composePhrase(mulberry32(7), { area: 'moon' })).not.toEqual(composePhrase(mulberry32(7), { area: 'river' }));
  });
  it('unknown, missing and neighborhood areas equal the old output', () => {
    for (const seed of [1, 5, 99]) for (const mood of ['day', 'dusk', 'rain', 'sunset']) {
      const old = cp(mulberry32(seed), { mood });
      for (const a of [undefined, 'nowhere', 'neighborhood']) expect(composePhrase(mulberry32(seed), { mood, area: a })).toEqual(old);
    }
  });
  it('every themed note is in range and in its scale, steps in the phrase, voices exist', () => {
    for (const a of themed) for (const mood of ['day', 'dusk', 'rain']) for (let seed = 1; seed <= 40; seed++) {
      const th = themeFor(a, mood);
      const ph = composePhrase(mulberry32(seed), { mood, area: a });
      expect(ph.steps.length).toBeGreaterThanOrEqual(1);
      for (const s of ph.steps) {
        expect(s.note).toBeGreaterThanOrEqual(0);
        expect(s.note).toBeLessThanOrEqual(36);
        expect(th.scale).toContain(s.note % 12);
        expect(s.beat).toBeGreaterThanOrEqual(0);
        expect(s.beat).toBeLessThan(th.len);
      }
      for (const c of ph.chord) expect(th.scale).toContain(c % 12);
      expect(Number.isFinite(ph.root)).toBe(true);
      expect(VOICES[th.voice]).toBeTruthy();
      if (th.altVoice) expect(VOICES[th.altVoice]).toBeTruthy();
    }
  });
  it('the crystal cave plays only the crystals\' own notes', () => {
    const hz = new Set([392, 440, 523.3, 587.3, 659.3, 784]);
    for (let seed = 1; seed <= 30; seed++) {
      const ph = composePhrase(mulberry32(seed), { area: 'crystal' });
      for (const s of ph.steps) expect([...hz].some((h) => Math.abs(ph.root * Math.pow(2, s.note / 12) - h) < 1.5)).toBe(true);
    }
  });
  it('the dusk variant is slower, sparser and different', () => {
    for (const a of themed) {
      const d = themeFor(a, 'day'), k = themeFor(a, 'dusk');
      expect(k).not.toEqual(d);
      expect(k.beat).toBeGreaterThan(d.beat);
      expect(k.n[1]).toBeLessThanOrEqual(d.n[1]);
    }
    expect(themeFor('nowhere', 'dusk')).toBeNull();
  });
});

describe('meowParams', () => {
  it('kinds are distinct, finite and in range', () => {
    const kinds = ['meow', 'call', 'chirp', 'mew'];
    const sigs = new Set();
    for (const k of kinds) {
      const p = meowParams(k);
      sigs.add(JSON.stringify(p));
      for (const v of [p.dur, p.amp, p.peakAt, ...p.f, ...p.f1, ...p.f2]) expect(Number.isFinite(v) && v > 0).toBe(true);
      expect(p.amp).toBeLessThanOrEqual(0.16);
      expect(p.dur).toBeLessThan(1);
    }
    expect(sigs.size).toBe(4);
    expect(meowParams('call').dur).toBeGreaterThan(meowParams('chirp').dur);
    expect(meowParams('nope')).toEqual(meowParams('meow'));
  });
  it('a kitten is higher and quicker, an old cat lower and slower, amplitude same at default', () => {
    const base = meowParams('meow'), kit = meowParams('meow', { pitch: 1.3, rate: 1.3 }), old = meowParams('meow', { pitch: 0.75, rate: 0.8 });
    expect(kit.f[0]).toBeGreaterThan(base.f[0]);
    expect(kit.dur).toBeLessThan(base.dur);
    expect(old.f[0]).toBeLessThan(base.f[0]);
    expect(base.amp).toBeCloseTo(0.16, 5);
  });
  it('bad inputs stay finite', () => {
    const p = meowParams('meow', { pitch: NaN, rate: 0, gain: -1, volume: NaN });
    for (const v of [p.dur, p.amp, ...p.f]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('meow sound', () => {
  function ctx() {
    const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = (x = {}) => { const n = { connect(t) { return t; }, start() {}, stop() {}, ...x }; return n; };
    const made = { oscs: 0 };
    const c = { currentTime: 0, sampleRate: 8000, destination: node(),
      createGain: () => node({ gain: param() }), createOscillator: () => { made.oscs++; return node({ frequency: param(), type: 'sine' }); },
      createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
      createConvolver: () => node({ buffer: null }), createBiquadFilter: () => node({ type: 'lowpass', frequency: param(), Q: param() }),
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len), length: len }), createBufferSource: () => node({ buffer: null }), made };
    return c;
  }
  it('plays every kind, ducks the music, and muted is silent', () => {
    const c = ctx();
    const a = createAudio({ contextFactory: () => c });
    let ducks = 0;
    a.setVoiceHook(() => { ducks++; });
    for (const k of ['meow', 'call', 'chirp', 'mew', undefined]) a.meow(1, 1, { pitch: 1.2, rate: 1.1, gain: 1 }, k);
    expect(ducks).toBe(5);
    expect(c.made.oscs).toBeGreaterThan(5);
    a.setMuted(true);
    const before = c.made.oscs;
    a.meow();
    expect(c.made.oscs).toBe(before);
    expect(ducks).toBe(5);
  });
});

describe('createMusic with a theme', () => {
  it('plays every themed area for a while without throwing, and ducks and mutes', async () => {
    const { createMusic } = await import('../src/music.js');
    const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
    const node = (x = {}) => ({ connect(t) { return t; }, disconnect() {}, start() {}, stop() {}, ...x });
    const ctx = { currentTime: 0, createGain: () => node({ gain: param() }), createOscillator: () => node({ frequency: param(), detune: param(), type: 'sine' }), createBiquadFilter: () => node({ type: 'lowpass', frequency: param(), Q: param() }) };
    const master = node();
    for (const a of [...themed, 'neighborhood']) for (const mood of ['day', 'dusk']) {
      const m = createMusic(() => ctx, () => master);
      m.start(3, mood, a);
      await new Promise((r) => setTimeout(r, 20));
      m.duck();
      for (let i = 0; i < 80; i++) { ctx.currentTime += 0.5; await new Promise((r) => setTimeout(r, 0)); m.setVolume(1); }
      m.setMuted(true);
      m.stop();
    }
  }, 60000);
});
