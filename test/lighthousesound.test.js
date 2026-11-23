import { describe, it, expect, vi } from 'vitest';

const S = await import('../src/world/lighthousesound.js');

// Lighthouse Point, milestone 3: the sounds. Silent while muted, no context asked for, brief and soft.

const CALLS = ['horn', 'bell', 'echo', 'gull', 'mew', 'purr'];

function liveAudio() {
  const nodes = { osc: 0, gain: 0, started: [], gains: [] };
  const ctx = {
    state: 'running', currentTime: 10,
    createOscillator: () => { nodes.osc++; return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (g) => g, start: (t) => nodes.started.push(t), stop() {}, disconnect() {} }; },
    createGain: () => { nodes.gain++; const g = { gain: { setValueAtTime() {}, linearRampToValueAtTime: (v) => nodes.gains.push(v), exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }; return g; },
  };
  return { audio: { isMuted: () => false, getContext: () => ctx, getMaster: () => ({}) }, nodes };
}

describe('the sounds', () => {
  it('muted, with no mute switch, or on a suspended or closed context, nothing plays and the context is never asked for (except by the suspended check)', () => {
    const asked = vi.fn();
    for (const audio of [{ isMuted: () => true, getContext: asked, getMaster: asked }, { getContext: asked, getMaster: asked }, null]) {
      const s = S.createLighthouseSound(audio);
      for (const c of CALLS) expect(s[c](), c).toBe(false);
      s.dispose();
    }
    expect(asked).not.toHaveBeenCalled();
    for (const state of ['suspended', 'closed']) {
      const s = S.createLighthouseSound({ isMuted: () => false, getContext: () => ({ state }), getMaster: () => ({}) });
      for (const c of CALLS) expect(s[c](), `${c} ${state}`).toBe(false);
    }
  });
  it('each sounds when it may, with oscillators started at or after the context\'s clock, and never louder than 0.07 before the master', () => {
    for (const c of CALLS) {
      const { audio, nodes } = liveAudio();
      const s = S.createLighthouseSound(audio);
      expect(s[c](), c).toBe(true);
      expect(nodes.osc, c).toBeGreaterThan(0);
      expect(nodes.started.every((t) => t >= 10), c).toBe(true);
      expect(Math.max(...nodes.gains), c).toBeLessThanOrEqual(0.07 + 1e-9);
      s.dispose();
    }
  });
  it('the echo gives her call back three times, each quieter and later; the bell is one struck note of three partials', () => {
    expect(S.ECHO.delays).toHaveLength(3);
    expect(S.ECHO.gains[0]).toBeGreaterThan(S.ECHO.gains[1]);
    expect(S.ECHO.gains[1]).toBeGreaterThan(S.ECHO.gains[2]);
    expect(S.ECHO.delays[2]).toBeLessThanOrEqual(1.5);
    expect(S.BELL.partials).toHaveLength(3);
    expect(S.BELL.dur).toBeLessThanOrEqual(2.6);
    const { audio, nodes } = liveAudio();
    const s = S.createLighthouseSound(audio);
    s.echo();
    expect(nodes.osc).toBe(3);
    s.bell();
    expect(nodes.osc).toBe(6);
  });
  it('a context that throws turns the rest of the walk silent, and a disposed set of sounds plays nothing', () => {
    const s = S.createLighthouseSound({ isMuted: () => false, getContext: () => { throw new Error('no audio'); }, getMaster: () => ({}) });
    expect(s.bell()).toBe(false);
    expect(s.mew()).toBe(false);
    const { audio } = liveAudio();
    const d = S.createLighthouseSound(audio);
    d.dispose();
    for (const c of CALLS) expect(d[c](), c).toBe(false);
  });
  it('no Math.random and no clock: the same call twice builds the same nodes', () => {
    const real = { r: Math.random, d: Date.now, p: performance.now };
    const trap = (n) => () => { throw new Error(`${n} was called`); };
    const { audio, nodes } = liveAudio();
    const s = S.createLighthouseSound(audio);
    Math.random = trap('Math.random'); Date.now = trap('Date.now'); performance.now = trap('performance.now');
    try { for (const c of CALLS) s[c](); } finally { Math.random = real.r; Date.now = real.d; performance.now = real.p; }
    expect(nodes.osc).toBeGreaterThan(10);
  });
});
