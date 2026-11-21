import { describe, it, expect, vi } from 'vitest';
import {
  MARKET, STALL_TIMES, MARKET_STALL_SALT, periodOf, stallOffsets, stallPhase, inWatchZone, isHidden, stallSees,
} from '../src/marketrules.js';
import { TREAT_STALLS, STALLS, MARKET_HIDES, MARKET_KEEPOUT, stallById, fromStall } from '../src/world/marketplan.js';
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

describe('noticing', () => {
  const fish = stallById('fish');
  const at = (lx, lz) => fromStall(fish, lx, lz);
  const front = (depth) => at(0, fish.d / 2 + depth);
  const looking = { watching: true, cooing: false };
  const walker = (p, extra = {}) => ({ x: p.x, z: p.z, stalking: false, high: false, ...extra });

  it('a walking cat is seen anywhere in front of the counter, out to WATCH_DEPTH', () => {
    for (const s of STALLS.filter((x) => TREAT_STALLS.includes(x.id))) {
      for (const lx of [-(s.w / 2 + MARKET.WATCH_SIDE), 0, s.w / 2 + MARKET.WATCH_SIDE]) {
        for (const lz of [s.d / 2 + 1e-6, s.d / 2 + 1, s.d / 2 + MARKET.WATCH_DEPTH - 1e-6]) {
          const p = fromStall(s, lx - Math.sign(lx) * 1e-6, lz);
          expect(inWatchZone(s, p.x, p.z, false)).toBe(true);
        }
      }
    }
    const far = front(MARKET.WATCH_DEPTH + 0.3);
    expect(inWatchZone(fish, far.x, far.z, false)).toBe(false);
  });

  it('a crouched cat is seen only within half that', () => {
    const half = MARKET.WATCH_DEPTH * MARKET.STALK_SHARE;
    const near = front(half - 0.05), mid = front(half + 0.1);
    expect(inWatchZone(fish, near.x, near.z, true)).toBe(true);
    expect(inWatchZone(fish, mid.x, mid.z, true)).toBe(false);
    expect(inWatchZone(fish, mid.x, mid.z, false)).toBe(true);
  });

  it('a stallholder turned away, turning, or cooing at someone sees nobody', () => {
    const p = walker(front(1));
    expect(stallSees(fish, looking, p, MARKET_HIDES)).toBe(true);
    expect(stallSees(fish, { watching: false, cooing: false }, p, MARKET_HIDES)).toBe(false);
    expect(stallSees(fish, { watching: true, cooing: true }, p, MARKET_HIDES)).toBe(false);
    expect(stallSees(fish, { watching: true }, p, MARKET_HIDES)).toBe(true);
    const out = {};
    for (let u = 0; u < periodOf('fish'); u += 0.05) {
      stallPhase('fish', 0, u, out);
      if (out.phase === 'turn' || out.phase === 'away' || out.phase === 'back') expect(stallSees(fish, out, p, MARKET_HIDES)).toBe(false);
    }
  });

  it('under a trestle or up on an awning, nobody sees her', () => {
    const p = front(1);
    expect(isHidden(MARKET_HIDES, walker(p))).toBe(false);
    expect(isHidden([{ x: p.x + 0.3, z: p.z, r: 0.6 }], walker(p))).toBe(true);
    expect(isHidden([{ x: p.x + 0.7, z: p.z, r: 0.6 }], walker(p))).toBe(false);
    expect(isHidden([], walker(p, { high: true }))).toBe(true);
    expect(stallSees(fish, looking, walker(p, { high: true }), MARKET_HIDES)).toBe(false);
    expect(stallSees(fish, looking, walker(p), [{ x: p.x, z: p.z, r: 0.6 }])).toBe(false);
  });

  it('beside or behind the stall, nobody sees her', () => {
    for (const [lx, lz] of [[0, -fish.d / 2 - 1], [0, fish.d / 2 - 0.1], [fish.w / 2 + MARKET.WATCH_SIDE + 0.3, fish.d / 2 + 1], [-(fish.w / 2 + MARKET.WATCH_SIDE + 0.3), fish.d / 2 + 1]]) {
      const p = at(lx, lz);
      expect(stallSees(fish, looking, walker(p), [])).toBe(false);
    }
  });

  it('every treat spot is in its own stall\'s zone, walking and crouched', () => {
    for (const id of TREAT_STALLS) {
      const s = stallById(id);
      expect(inWatchZone(s, s.treat.x, s.treat.z, false)).toBe(true);
      expect(inWatchZone(s, s.treat.x, s.treat.z, true)).toBe(true);
    }
  });

  it('the strays\' keep-out covers the whole watch zone', () => {
    // marketplan cannot import the rules (the rules import the plan), so its literals are held to MARKET here
    for (const id of TREAT_STALLS) {
      const s = stallById(id);
      for (let lx = -(s.w / 2 + MARKET.WATCH_SIDE); lx <= s.w / 2 + MARKET.WATCH_SIDE + 1e-9; lx += 0.25) {
        for (let lz = s.d / 2; lz <= s.d / 2 + MARKET.WATCH_DEPTH + 1e-9; lz += 0.25) {
          const p = fromStall(s, lx, lz);
          const covered = MARKET_KEEPOUT.capsules.some((c) => {
            const dx = c.x2 - c.x1, dz = c.z2 - c.z1, L = dx * dx + dz * dz;
            const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - c.x1) * dx + (p.z - c.z1) * dz) / L));
            return Math.hypot(p.x - (c.x1 + t * dx), p.z - (c.z1 + t * dz)) <= c.r;
          });
          expect(covered).toBe(true);
        }
      }
    }
  });
});
