import { describe, it, expect } from 'vitest';
import { screenIndicator } from '../src/indicator.js';

// local: camera-space position (z negative = in front of camera, y up)
// ndc: normalized device coords from THREE's project()

describe('screenIndicator', () => {
  it('returns null when the target is on screen', () => {
    expect(screenIndicator({ x: 1, y: 0, z: -5 }, { x: 0.3, y: -0.1 })).toBe(null);
  });

  it('points right when the target is off the right edge', () => {
    const ind = screenIndicator({ x: 4, y: 0, z: -2 }, { x: 1.8, y: 0 });
    expect(ind.leftPct).toBeGreaterThan(90);
    expect(ind.topPct).toBeCloseTo(50, 0);
    expect(ind.rotDeg).toBeCloseTo(0, 0);
  });

  it('points up-screen when the target is above the view', () => {
    const ind = screenIndicator({ x: 0, y: 5, z: -2 }, { x: 0, y: 2 });
    expect(ind.topPct).toBeLessThan(10);
    expect(ind.rotDeg).toBeCloseTo(-90, 0);
  });

  it('flips direction when the target is behind the camera', () => {
    // behind and slightly left → indicator points right-ish (away from where it projects)
    const ind = screenIndicator({ x: -2, y: 0, z: 3 }, { x: -1.5, y: 0 });
    expect(ind.leftPct).toBeGreaterThan(50);
  });

  it('points straight down when the target is directly behind', () => {
    const ind = screenIndicator({ x: 0, y: 0, z: 4 }, { x: 0, y: 0 });
    expect(ind.topPct).toBeGreaterThan(90);
    expect(ind.rotDeg).toBeCloseTo(90, 0);
  });
});
