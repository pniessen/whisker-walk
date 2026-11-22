import { describe, it, expect, vi } from 'vitest';
import { createAudio } from '../src/audio.js';

vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });

const { createHouseSound, TICK_R, CREAK_EVERY_M, ATTIC_CREAK_S } = await import('../src/world/housesound.js');
const { HOUSE_STAIRS, HOUSE_ROOMS } = await import('../src/world/houseplan.js');
const { HOUSE_FINDS } = await import('../src/world/housethings.js');

// The Old House, step 2, Task 7 (ruling D15): the clock's tick and the creaks.
const DT = 1 / 60;
const CLOCK = HOUSE_FINDS.find((f) => f.id === 'clock');
const ATTIC = HOUSE_ROOMS.find((r) => r.id === 'attic');
const MAIN = HOUSE_STAIRS.find((s) => s.id === 'main');

function make() {
  const log = [];
  const audio = { tick: (v) => log.push(['tick', v, now.t]), creak: (v) => log.push(['creak', v, now.t]) };
  const now = { t: 0 };
  const sound = createHouseSound(audio, { clock: CLOCK, stairs: HOUSE_STAIRS, attic: ATTIC });
  const run = (seconds, pos) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      const p = typeof pos === 'function' ? pos(now.t) : pos;
      sound.update(DT, now.t, p);
      now.t += DT;
    }
  };
  return { sound, log, run, now };
}

describe('the house sound', () => {
  it('the clock ticks quietly near it, once a second, and not at all 8 m away', () => {
    const near = make();
    near.run(3, { x: CLOCK.x + 2, y: 0, z: CLOCK.z });
    const ticks = near.log.filter((e) => e[0] === 'tick');
    expect(ticks).toHaveLength(3);
    for (const e of ticks) {
      expect(e[1]).toBeGreaterThan(0);
      expect(e[1]).toBeLessThan(0.6);
    }
    expect(ticks[0][1]).toBeCloseTo(0.6 * (1 - 2 / TICK_R), 5);
    const far = make();
    far.run(3, { x: CLOCK.x + 8, y: 0, z: CLOCK.z });
    expect(far.log).toHaveLength(0);
  });

  it('a stair creaks as she climbs it, a few times, never at every step', () => {
    const h = make();
    const speed = 1.5;
    const secs = 8.4 / speed;
    h.run(secs, (t) => ({ x: MAIN.x0, y: 0, z: MAIN.z0 - Math.min(8.4, speed * t) }));
    const creaks = h.log.filter((e) => e[0] === 'creak');
    expect(creaks.length).toBeGreaterThanOrEqual(5);
    expect(creaks.length).toBeLessThanOrEqual(7);
    for (const c of creaks) expect(c[1]).toBe(0.5);
    expect(CREAK_EVERY_M).toBe(1.4);
    // standing on a stair makes no creak
    const still = make();
    still.run(5, { x: MAIN.x0, y: 1, z: -2 });
    expect(still.log.filter((e) => e[0] === 'creak')).toHaveLength(0);
  });

  it('the attic creaks now and then while she walks, the same every time', () => {
    const walk = () => {
      const h = make();
      h.run(30, (t) => ({ x: ATTIC.minX + 2 + Math.abs(((t + 4) % 8) - 4), y: 4.2, z: -11 }));
      return h.log.filter((e) => e[0] === 'creak').map((e) => [e[1], e[2]]);
    };
    const a = walk();
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(a.every((c) => c[0] === 0.35)).toBe(true);
    expect(walk()).toEqual(a);
    expect(a[1][1] - a[0][1]).toBeCloseTo(ATTIC_CREAK_S, 1);
    // standing still, nothing
    const still = make();
    still.run(30, { x: ATTIC.minX + 3, y: 4.2, z: -11 });
    expect(still.log).toHaveLength(0);
  });

  it('draws nothing from Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const h = make();
    h.run(12, (t) => ({ x: ATTIC.minX + 2 + 4 * (0.5 + 0.5 * Math.sin(t)), y: 4.2, z: -11 }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('muted, the house makes no sound at all', () => {
    const made = { n: 0 };
    const node = () => {
      const n = { connect: (t) => t, start() {}, stop() {} };
      const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
      n.gain = param(); n.frequency = param(); n.threshold = param(); n.knee = param(); n.ratio = param(); n.attack = param(); n.release = param(); n.Q = param();
      return n;
    };
    const ctx = {
      currentTime: 0, sampleRate: 44100, state: 'running', destination: node(),
      createGain: node, createOscillator: () => { made.n++; return node(); }, createDynamicsCompressor: node, createConvolver: node,
      createBiquadFilter: node, createBuffer: (c, len, rate) => ({ getChannelData: () => new Float32Array(len), length: len, sampleRate: rate }),
      createBufferSource: node,
    };
    const audio = createAudio({ contextFactory: () => ctx });
    audio.setMuted(true);
    audio.tick();
    audio.creak();
    audio.playTune([{ at: 0, freq: 196, dur: 1 }]);
    audio.musicBoxNote(262);
    expect(made.n).toBe(0);
    audio.setMuted(false);
    audio.tick();
    expect(made.n).toBeGreaterThanOrEqual(1);
    audio.creak(0);
    const n = made.n;
    audio.creak(0);
    audio.tick(-1);
    expect(made.n).toBe(n);
  });
});
