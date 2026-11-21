// The birthday song (src/birthdaysong.js) and how audio.js plays it: the
// traditional melody, about 12 s, through the game's bus; muted or at volume
// 0 it makes nothing. Checked by the notes scheduled, never by ear.
import { describe, it, expect } from 'vitest';
import { HAPPY_BIRTHDAY, birthdayTune } from '../src/birthdaysong.js';
import { createAudio } from '../src/audio.js';

function fakeParam(v = 1) {
  const p = { value: v, events: [], setValueAtTime(x, t) { p.events.push(['set', x, t]); }, linearRampToValueAtTime(x, t) { p.events.push(['lin', x, t]); }, exponentialRampToValueAtTime(x, t) { p.events.push(['exp', x, t]); } };
  return p;
}
function fakeNode(extra = {}) {
  const n = { connect(t) { return t; }, start(t) { n.startedAt = t; }, stop() {}, ...extra };
  return n;
}
function fakeCtx() {
  const ctx = {
    currentTime: 10, sampleRate: 8000, state: 'suspended', resumed: 0, destination: fakeNode(), oscs: [],
    resume() { ctx.resumed++; ctx.state = 'running'; return Promise.resolve(); },
    createGain: () => fakeNode({ gain: fakeParam(1) }),
    createOscillator() { const o = fakeNode({ frequency: fakeParam(440), type: 'sine' }); ctx.oscs.push(o); return o; },
    createDynamicsCompressor: () => fakeNode({ threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam() }),
    createConvolver: () => fakeNode({ buffer: null }),
    createBiquadFilter: () => fakeNode({ frequency: fakeParam(), Q: fakeParam() }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => fakeNode({ playbackRate: fakeParam(1) }),
  };
  return ctx;
}
const semis = (tune) => tune.map((n) => Math.round(12 * Math.log2(n.freq / tune[0].freq)));

describe('the birthday song', () => {
  it('is the traditional melody: four lines of G G A G ...', () => {
    // relative to the first G: G G A G C B | G G A G D C | G G G' E C B A | F F E C D C
    expect(semis(birthdayTune())).toEqual([
      0, 0, 2, 0, 5, 4,
      0, 0, 2, 0, 7, 5,
      0, 0, 12, 9, 5, 4, 2,
      10, 10, 9, 5, 7, 5,
    ]);
    expect(HAPPY_BIRTHDAY.reduce((t, [, b]) => t + b, 0)).toBe(26);
  });
  it('lasts about 12 seconds, its notes in order, a music box an octave up', () => {
    const tune = birthdayTune();
    const end = Math.max(...tune.map((n) => n.at + n.dur));
    expect(end).toBeGreaterThan(10.5);
    expect(end).toBeLessThan(13);
    for (let i = 1; i < tune.length; i++) expect(tune[i].at).toBeGreaterThan(tune[i - 1].at);
    expect(tune[0].freq).toBeCloseTo(392, 0); // G above middle C
  });
  it('audio.playTune wakes a suspended context, then schedules each note (and its octave) from then', async () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    const tune = birthdayTune();
    expect(audio.playTune(tune, 0.5)).toBe(tune.length);
    expect(ctx.oscs).toHaveLength(0); // nothing queued on a held context
    await Promise.resolve(); await Promise.resolve();
    expect(ctx.oscs).toHaveLength(tune.length * 2);
    expect(ctx.oscs.filter((o, i) => i % 2 === 0).map((o) => o.startedAt)).toEqual(tune.map((n) => 10 + n.at));
    expect(ctx.oscs[0].frequency.events[0][1]).toBeCloseTo(tune[0].freq, 6);
    expect(ctx.resumed).toBe(1);
  });
  it('a context that will not start plays nothing later', async () => {
    const ctx = fakeCtx();
    ctx.resume = () => Promise.reject(new Error('no'));
    const audio = createAudio({ contextFactory: () => ctx });
    audio.playTune(birthdayTune(), 1);
    await Promise.resolve(); await Promise.resolve();
    expect(ctx.oscs).toHaveLength(0);
  });
  it('muted, or at music volume 0, it makes nothing', () => {
    const ctx = fakeCtx();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.setMuted(true);
    expect(audio.playTune(birthdayTune(), 1)).toBe(0);
    audio.setMuted(false);
    expect(audio.playTune(birthdayTune(), 0)).toBe(0);
    expect(ctx.oscs).toHaveLength(0);
  });
});
