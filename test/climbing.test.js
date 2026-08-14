import { describe, it, expect } from 'vitest';
import { canReach } from '../src/climbing.js';

// Real coordinates from src/world/neighborhood.js's rooftop chain: a porch
// perch at y 1.3 leads to a rooftop perch at y 2.9 (a 1.6 climb), which leads
// to the ridge at y 4.1 (a 1.2 climb). See task-4.2-report.md for the full
// per-area chain tables.
describe('canReach', () => {
  it('reaches a ground-level fence-top perch (y 0.85) from standing height 0', () => {
    const fence = { x: 22, z: -28, y: 0.85 };
    expect(canReach(fence, { x: 22, z: -28 }, 0)).toBe(true);
  });

  it('does not reach a rooftop perch (y 2.9) directly from the ground — height gate blocks it even standing right under it', () => {
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    expect(canReach(roof, { x: -9.5, z: 15.5 }, 0)).toBe(false);
  });

  it('reaches the rooftop perch from the porch perch 1.6 below it (2.9 - 1.3 = 1.6)', () => {
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    const porch = { x: -9, z: 17.5, y: 1.3 };
    expect(canReach(roof, { x: porch.x, z: porch.z }, porch.y)).toBe(true);
  });

  it('reaches the ridge from the rooftop perch (2.9 -> 4.1, a 1.2 climb)', () => {
    const ridge = { x: -11.5, z: 15.5, y: 4.1 };
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    expect(canReach(ridge, { x: roof.x, z: roof.z }, roof.y)).toBe(true);
  });

  it('rejects a climb bigger than 1.6, even at close horizontal range', () => {
    const tooHigh = { x: 0, z: 0, y: 2.0 };
    expect(canReach(tooHigh, { x: 0, z: 0 }, 0)).toBe(false);
  });

  it('allows dropping down to a nearby lower perch, any distance below', () => {
    const lowPerch = { x: -11.5, z: 15.5, y: 0.85 }; // 8x farther down than the 1.6 climb-up budget
    expect(canReach(lowPerch, { x: -11.5, z: 15.5 }, 4.1)).toBe(true);
  });

  it('rejects a perch that is horizontally out of reach even though the height gate would pass', () => {
    const nearPerch = { x: 0, z: 0, y: 1.35 };
    expect(canReach(nearPerch, { x: 10, z: 10 }, 0)).toBe(false);
  });

  it('uses the longer 2.6 reach for perches above y 1 (collider-center perches), and 1.2 for low perches', () => {
    const high = { x: 2.5, z: 0, y: 1.35 }; // 2.5 < 2.6
    const low = { x: 1.0, z: 0, y: 0.85 };  // 1.0 < 1.2
    expect(canReach(high, { x: 0, z: 0 }, 0)).toBe(true);
    expect(canReach(low, { x: 0, z: 0 }, 0)).toBe(true);
    const lowTooFar = { x: 1.3, z: 0, y: 0.85 }; // 1.3 >= 1.2
    expect(canReach(lowTooFar, { x: 0, z: 0 }, 0)).toBe(false);
  });
});
