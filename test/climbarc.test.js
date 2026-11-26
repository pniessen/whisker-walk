import { describe, it, expect } from 'vitest';
import { climbArc, climbArcOffset } from '../src/climbarc.js';
import { placeArc } from '../src/placephysics.js';

const earth = { height: 0.35, time: 0.3 };
const A = { x: 0, y: 0, z: 0 }, B = { x: 3, y: 1.2, z: 4 };
describe('climbArc', () => {
  it('starts at from-minus-to and ends at exactly zero', () => {
    const a = climbArc(A, B, earth);
    const o0 = climbArcOffset(a, 0);
    expect(o0).toEqual({ x: -3, y: -1.2, z: -4 });
    expect(climbArcOffset(a, a.dur)).toEqual({ x: 0, y: 0, z: 0 });
    expect(climbArcOffset(a, a.dur + 5)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('closes in monotonically on the spot and peaks mid-way', () => {
    const a = climbArc(A, B, earth);
    let last = Infinity;
    for (let i = 0; i < 10; i++) { const o = climbArcOffset(a, a.dur * i / 10); const d = Math.hypot(o.x, o.z); expect(d).toBeLessThan(last); last = d; }
    const m = climbArcOffset(a, a.dur / 2);
    expect(m.y).toBeCloseTo(-1.2 / 2 + a.apex, 6);
    expect(a.apex).toBeCloseTo(Math.max(0.35, 0.25 * 5 + 0.6), 6);
  });
  it('Earth timing: 0.28 + 0.07 per metre, capped at 0.6', () => {
    expect(climbArc(A, { x: 3, y: 0, z: 4 }, earth).dur).toBeCloseTo(0.63 > 0.6 ? 0.6 : 0.63, 6);
    expect(climbArc(A, { x: 1, y: 0, z: 0 }, earth).dur).toBeCloseTo(0.35, 6);
  });
  it('the Moon is longer and higher', () => {
    const m = placeArc(earth, 'moon');
    const e = climbArc(A, B, earth), mo = climbArc(A, B, m);
    expect(mo.dur).toBeGreaterThan(e.dur);
    expect(mo.dur).toBeGreaterThanOrEqual(1.08 - 1e-9);
    expect(mo.apex).toBeGreaterThan(e.apex);
  });
  it('reduced motion gives no arc', () => {
    const a = climbArc(A, B, { ...earth, reducedMotion: true });
    expect(a.dur).toBe(0);
    expect(climbArcOffset(a, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('zero distance has no NaN; a drop does not hump upward', () => {
    const up = climbArc(A, A, earth);
    for (const t of [0, 0.1, 1]) for (const v of Object.values(climbArcOffset(up, t))) expect(Number.isNaN(v)).toBe(false);
    const drop = climbArc({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, earth);
    expect(drop.apex).toBe(0);
    expect(climbArcOffset(drop, 0).y).toBe(2);
  });
});
