import { describe, it, expect } from 'vitest';
import { TORSO, LEGACY_BODY, deformTorso, torsoGeometry, torsoSurface, torsoRetarget } from '../src/cat/torso.js';

const surfY = (w, up) => torsoSurface([0, up * Math.sqrt(1 - w * w), w]).y;
const halfW = (w) => torsoSurface([Math.sqrt(1 - w * w), 0, w]).x;

describe('cat torso shape', () => {
  it('deep chest: the underside is lower at the front than at the hips', () => {
    expect(surfY(-0.4, -1)).toBeLessThan(surfY(0.6, -1) - 0.02);
  });
  it('slim waist just behind the middle', () => {
    expect(halfW(0.15)).toBeLessThan(halfW(-0.4));
    expect(halfW(0.15)).toBeLessThan(halfW(0.6));
  });
  // The brief's absolute form (surfY(0.5, 1) > surfY(-0.5, 1)) cannot hold with the
  // sketch's own numbers: the deep chest lifts the shoulders (0.944 vs 0.904 at +-0.5).
  // What backRise does is raise the back more toward the hips, so test that effect.
  it('the back rises gently toward the hips', () => {
    const rise = (w) => {
      const d = [0, Math.sqrt(1 - w * w), w];
      return deformTorso(...d)[1] - deformTorso(...d, { ...TORSO.SHAPE, backRise: 0 })[1];
    };
    expect(rise(0.5)).toBeGreaterThan(rise(-0.5));
    expect(rise(0.5)).toBeLessThan(0.07);
  });
  it('the haunch swell is the gentle 0.08, not the rejected 0.24', () => {
    const d = [Math.sqrt(1 - 0.15 ** 2 - 0.55 ** 2), -0.15, 0.55];
    expect(deformTorso(...d)[0] / deformTorso(...d, { ...TORSO.SHAPE, haunch: 0 })[0]).toBeCloseTo(1.08, 3);
  });
  it('one welded surface: no duplicate positions, so no seam crease', () => {
    const g = torsoGeometry(0.32, 40, 40), p = g.attributes.position, seen = new Set();
    for (let i = 0; i < p.count; i++) seen.add([p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join());
    expect(seen.size).toBe(p.count);
  });
  it('poles at nose and rump', () => {
    const g = torsoGeometry(0.32, 40, 40);
    const u = g.userData.unit; let poles = 0;
    for (let i = 0; i < u.length; i += 3) if (Math.abs(Math.abs(u[i + 2]) - 1) < 1e-6) poles++;
    expect(poles).toBe(2);
  });
  it('costs 3120 triangles full and 1296 simple', () => {
    expect(torsoGeometry(0.32, 40, 40).index.count / 3).toBe(3120);
    expect(torsoGeometry(0.32, 24, 28).index.count / 3).toBe(1296);
  });
});

describe('torsoRetarget', () => {
  // A point on the old torso's surface (ρ = 1), along legacy unit direction d.
  const legacyPoint = (d, f) => d.map((v, i) => LEGACY_BODY.CENTRE[i] + TORSO.R * LEGACY_BODY.SCALE[i] * f[i] * v);
  it.each([[[1, 1, 1]], [[0.8, 1, 1]]])('a point on the old surface lands on the new surface along the same direction (f %j)', (f) => {
    for (const raw of [[0, 1, 0], [0.4, 0.8, 0.3], [-0.5, 0.2, -0.7], [0.1, -0.6, 0.6]]) {
      const L = Math.hypot(...raw), d = raw.map((v) => v / L);
      const s = torsoSurface(d);   // body-local, before the mesh's scale
      const want = [TORSO.SCALE[0] * f[0] * s.x, TORSO.CENTRE_Y + TORSO.SCALE[1] * f[1] * s.y, TORSO.SCALE[2] * f[2] * s.z];
      expect(torsoRetarget(legacyPoint(d, f), f)).toEqual(want.map((v) => expect.closeTo(v, 9)));
    }
  });
  it('a point far off the old body (ρ > 1.5) just rises 0.09 with the torso', () => {
    const p = [0.06, 1.0, 0.2];   // well over the back, ρ ≈ 2.8
    expect(torsoRetarget(p)).toEqual([0.06, 1.09, 0.2].map((v) => expect.closeTo(v, 12)));
  });
  it('minRho pushes a sunk point out to that depth, and leaves a deeper-out one alone', () => {
    const d = [0, 1, 0], inside = legacyPoint(d, [1, 1, 1]).map((v, i) => (i === 1 ? LEGACY_BODY.CENTRE[1] + (v - LEGACY_BODY.CENTRE[1]) * 0.9 : v));
    const atOne = torsoRetarget(legacyPoint(d, [1, 1, 1]));
    const pushed = torsoRetarget(inside, [1, 1, 1], 1);
    expect(pushed).toEqual(atOne.map((v) => expect.closeTo(v, 9)));
    expect(torsoRetarget(legacyPoint(d, [1, 1, 1]), [1, 1, 1], 0.5)).toEqual(atOne.map((v) => expect.closeTo(v, 12)));
  });
});
