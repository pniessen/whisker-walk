import { describe, it, expect, vi } from 'vitest';
import { MARKET, STALL_TIMES, MARKET_STALL_SALT, periodOf, stallOffsets, stallPhase } from '../src/marketrules.js';
import { TREAT_STALLS } from '../src/world/marketplan.js';
import { DOG_NOTICE_STALKED } from '../src/dogs.js';
import { mulberry32 } from '../src/rng.js';

describe('the stall rhythm', () => {
  it('has the constants of the spec and the one idea borrowed from the dogs', () => {
    expect(MARKET.BUSY_S).toBe(1.6);
    expect(MARKET.TURN_S).toBe(0.4);
    expect(MARKET.WATCH_DEPTH).toBe(3.2);
    expect(MARKET.WATCH_SIDE).toBe(1.0);
    expect(MARKET.STALK_SHARE).toBe(DOG_NOTICE_STALKED);
    expect(Object.isFrozen(MARKET)).toBe(true);
    expect(Object.isFrozen(STALL_TIMES)).toBe(true);
  });

  it('two devices with the same seed and clock see the same stallholder at the same moment', () => {
    const a = stallOffsets(1234), b = stallOffsets(1234);
    for (let t = 0; t < 120; t += 0.1) {
      for (const id of TREAT_STALLS) expect(stallPhase(id, a[id], 1e9 + t)).toEqual(stallPhase(id, b[id], 1e9 + t));
    }
  });

  it('the seed only shifts each stall in its cycle', () => {
    const a = stallOffsets(1), b = stallOffsets(2);
    expect(TREAT_STALLS.some((id) => a[id] !== b[id])).toBe(true);
    for (const o of [a, b]) {
      for (const id of TREAT_STALLS) {
        expect(o[id]).toBeGreaterThanOrEqual(0);
        expect(o[id]).toBeLessThan(periodOf(id));
      }
    }
    expect(MARKET_STALL_SALT).toBe(0x3a7c51e9);
  });

  it('the phases run serve, busy, turn, away, back, with the turn eased', () => {
    const id = 'fish', t = STALL_TIMES.fish;
    const at = (u) => stallPhase(id, 0, u);
    expect(at(0.1).phase).toBe('serve');
    expect(at(t.serve + 0.1).phase).toBe('busy');
    expect(at(t.serve + MARKET.BUSY_S + 0.1).phase).toBe('turn');
    expect(at(t.serve + MARKET.BUSY_S + MARKET.TURN_S + 0.1).phase).toBe('away');
    expect(at(periodOf(id) - 0.1).phase).toBe('back');
    expect(at(0.1).facing).toBe(0);
    expect(at(t.serve + MARKET.BUSY_S + MARKET.TURN_S + 0.1).facing).toBe(1);
    const mid = at(t.serve + MARKET.BUSY_S + MARKET.TURN_S / 2);
    expect(mid.facing).toBeGreaterThan(0);
    expect(mid.facing).toBeLessThan(1);
    expect(at(t.serve + 0.1).watching).toBe(true);
    expect(at(t.serve + MARKET.BUSY_S + 0.1).watching).toBe(false);
  });

  it('the clock may be negative and the offset may be anything', () => {
    const p = periodOf('baker');
    expect(stallPhase('baker', 1, -5.2).phase).toBe(stallPhase('baker', 1, -5.2 + p * 3).phase);
  });

  it('fills the object it is given and allocates nothing new', () => {
    const out = {};
    expect(stallPhase('milk', 0, 3, out)).toBe(out);
    expect(Object.keys(out).sort()).toEqual(['bubble', 'facing', 'k', 'phase', 'watching']);
  });

  it('the bubble shows a full BUSY_S before the turn, stays while turned away, and goes as they turn back', () => {
    for (const id of TREAT_STALLS) {
      const P = periodOf(id), out = {};
      let bubbleWhileWatching = 0, prev = null;
      for (let u = 0; u < P * 2; u += 0.01) {
        stallPhase(id, 0, u, out);
        if (prev && prev.watching && !out.watching) expect(bubbleWhileWatching).toBeGreaterThanOrEqual(MARKET.BUSY_S - 0.02);
        if (out.watching && out.bubble) bubbleWhileWatching += 0.01;
        if (!out.watching && !out.bubble) bubbleWhileWatching = 0;
        if (out.phase === 'serve') bubbleWhileWatching = 0;
        if (out.phase === 'back') expect(out.bubble).toBe(false);
        if (out.phase === 'turn' || out.phase === 'away') expect(out.bubble).toBe(true);
        if (out.phase === 'serve') expect(out.bubble).toBe(false);
        prev = { watching: out.watching };
      }
    }
  });

  it('every watched stall turns away for at least 3.5 s each cycle, and no cycle is longer than 13 s', () => {
    for (const id of TREAT_STALLS) {
      const P = periodOf(id), out = {};
      expect(P).toBeLessThanOrEqual(13);
      let notWatching = 0;
      for (let u = 0; u < P; u += 0.01) {
        stallPhase(id, 0, u, out);
        if (!out.watching) notWatching += 0.01;
      }
      expect(notWatching).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('never in lockstep: no two stalls share a period', () => {
    for (let i = 0; i < TREAT_STALLS.length; i++) {
      for (let j = i + 1; j < TREAT_STALLS.length; j++) {
        // fish (11.1) and baker (11.4) differ by exactly 0.3 in the spec's own data: >= with a float guard
        expect(Math.abs(periodOf(TREAT_STALLS[i]) - periodOf(TREAT_STALLS[j]))).toBeGreaterThanOrEqual(0.3 - 1e-9);
      }
    }
  });

  it('draws one number a stall from its own stream and never touches Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const a = stallOffsets(77);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(Object.keys(a)).toEqual([...TREAT_STALLS]);
    const r = mulberry32(((77 >>> 0) ^ MARKET_STALL_SALT) >>> 0);
    for (const id of TREAT_STALLS) expect(a[id]).toBe(r() * periodOf(id));
  });
});
