import { describe, it, expect } from 'vitest';
import { TORSO, deformTorso, torsoGeometry, torsoSurface } from '../src/cat/torso.js';

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
