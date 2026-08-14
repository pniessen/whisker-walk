import { describe, it, expect } from 'vitest';
import { advanceClouds } from '../src/skylife.js';

describe('advanceClouds', () => {
  it('drifts +x and wraps around the span', () => {
    const clouds = [{ x: 0, z: 5, speed: 2 }, { x: 59, z: -10, speed: 2 }];
    advanceClouds(clouds, 1, 60);   // rule: x += speed*dt; if (x > halfSpan) x -= halfSpan*2
    expect(clouds[0].x).toBeCloseTo(2);
    expect(clouds[1].x).toBeCloseTo(-59); // 59 → 61 → wrapped to −59
  });
});
