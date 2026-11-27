import { describe, it, expect } from 'vitest';
import * as B from '../src/world/reefbubbles.js';
import * as S from '../src/world/reefsela.js';
import * as C from '../src/world/reefcritters.js';
import * as P from '../src/world/reefplan.js';

const seeps = C.SEEPS;

describe('the realistic bubbles', () => {
  it('the plan is deterministic, sizes are in range, mostly small', () => {
    const sizes = [];
    for (let i = 0; i < B.BUB.high; i++) {
      const a = { ...B.bubblePlan(i, seeps, {}) }; const b = { ...B.bubblePlan(i, seeps, {}) };
      expect(a).toEqual(b);
      expect(a.size).toBeGreaterThanOrEqual(0.5); expect(a.size).toBeLessThanOrEqual(3.1);
      expect(a.dur).toBeLessThan(B.BUB.cycle);
      sizes.push(a.size);
    }
    expect(sizes.filter((s) => s < 1.2).length).toBeGreaterThan(sizes.length / 2);
    expect(Math.max(...sizes)).toBeGreaterThan(1.8);
    // small ones rise faster than big ones
    const by = [...Array(B.BUB.high).keys()].map((i) => B.bubblePlan(i, seeps, {})).map((p) => ({ s: p.s, v: p.speed }));
    const small = by.filter((p) => p.s < 0.05); const big = by.filter((p) => p.s > 0.3);
    if (small.length && big.length) expect(Math.min(...small.map((p) => p.v))).toBeGreaterThan(Math.max(...big.map((p) => p.v)) * 0.8);
  });
  it('rise paths stay above the sand and under the shimmer ceiling, and fade before it', () => {
    const o = {};
    let seenLive = 0; let seenFlash = 0;
    for (let i = 0; i < B.BUB.high; i++) for (let t = 0; t < 120; t += 0.37) {
      B.bubbleState(i, t, seeps, false, o);
      expect(o.y).toBeLessThan(P.SURFACE_Y - 0.25);
      expect(o.y).toBeGreaterThanOrEqual(P.reefY(o.x, o.z) - 0.5);
      expect(o.alpha).toBeGreaterThanOrEqual(0); expect(o.alpha).toBeLessThanOrEqual(1);
      if (o.live) seenLive++;
      if (o.flash > 0) seenFlash++;
      if (o.y > P.SURFACE_Y - 0.5 && o.live) expect(o.alpha).toBeLessThan(0.5);
    }
    expect(seenLive).toBeGreaterThan(500); expect(seenFlash).toBeGreaterThan(0);
  });
  it('is pure: the same time gives the same bubble, in any order', () => {
    const a = { ...B.bubbleState(7, 33.3, seeps, false, {}) };
    B.bubbleState(3, 99, seeps, false, {});
    expect(B.bubbleState(7, 33.3, seeps, false, {})).toEqual(a);
  });
  it('chains: a seep launches its bubbles within a few seconds of each other', () => {
    const l = [0, 1, 2, 3, 4, 5].map((j) => B.bubblePlan(j * B.BUB.seeps, seeps, {}).launch);
    expect(Math.max(...l) - Math.min(...l)).toBeLessThan(3);
  });
  it('reduced motion: still, no wobble, no flash, whatever the time', () => {
    for (let i = 0; i < B.BUB.reduced; i++) {
      const a = { ...B.bubbleState(i, 0, seeps, true, {}) }; const b = { ...B.bubbleState(i, 77, seeps, true, {}) };
      expect(b).toEqual(a);
      expect(a.squash).toBe(0); expect(a.flash).toBe(0); expect(a.live).toBe(true);
    }
  });
});

describe('Sela as a sea turtle', () => {
  it('her attitude is pure, bounded, and has a stroke then a long glide', () => {
    const a = { ...S.selaAttitude(12.3, false, 0.5, 0.7, {}) };
    S.selaAttitude(40, false, 1, 1, {});
    expect(S.selaAttitude(12.3, false, 0.5, 0.7, {})).toEqual(a);
    let stroking = 0; let n = 0;
    for (let t = 0; t < 220; t += 0.1) {
      const p = S.selaAttitude(t, false, 0, 0.5, {});
      expect(Math.abs(p.flap)).toBeLessThan(0.8); expect(Math.abs(p.roll)).toBeLessThanOrEqual(0.33); expect(Math.abs(p.headYaw)).toBeLessThan(0.8);
      n++; if (Math.abs(p.flap) > 0.2) stroking++;
    }
    expect(stroking / n).toBeGreaterThan(0.03); expect(stroking / n).toBeLessThan(0.3); // mostly gliding
  });
  it('banks into a turn', () => {
    expect(S.selaAttitude(5, false, 0, 0.5, {}).roll).toBeLessThan(0);
    expect(S.selaAttitude(5, false, 0, -0.5, {}).roll).toBeGreaterThan(0);
  });
  it('reduced motion freezes the pose whatever the time', () => {
    expect(S.selaAttitude(0, true, 0.2, 0.9, {})).toEqual(S.selaAttitude(500, true, 3, 1, {}));
  });
  it('is four meshes, vertex-coloured', () => {
    const s = S.buildSela();
    const meshes = []; s.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(4);
    for (const m of meshes) expect(m.geometry.attributes.color).toBeTruthy();
    s.dispose();
  });
});
