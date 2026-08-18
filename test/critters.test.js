import { describe, it, expect } from 'vitest';
import { createCritters } from '../src/critters.js';
import { mulberry32 } from '../src/rng.js';

// A scene stand-in — createCritters only ever add()s and remove()s groups, so
// nothing here needs a real THREE.Scene (same approach as secrets.test.js).
const scene = { add() {}, remove() {} };

const positionsOf = (critters, type) =>
  critters.list.filter((c) => c.type === type).map((c) => [c.group.position.x, c.group.position.z]);

// v18 Task 1.4e. The eight dusk fireflies were placed with a bare
// Math.random() inside a builder that otherwise threads the injected seeded
// RNG, which meant two co-walkers on the same room seed saw the fireflies in
// different places. Determinism under a shared seed is a hard rule for
// anything placed in the world, cosmetic or not.
describe('createCritters firefly determinism', () => {
  it('places the eight dusk fireflies from the injected rng', () => {
    const a = createCritters(scene, [], { spawnFireflies: true, rng: mulberry32(1234) });
    const b = createCritters(scene, [], { spawnFireflies: true, rng: mulberry32(1234) });
    expect(positionsOf(a, 'firefly')).toHaveLength(8);
    expect(positionsOf(a, 'firefly')).toEqual(positionsOf(b, 'firefly'));
  });

  it('places them differently under a different seed', () => {
    // Guards against the opposite failure: an rng that is threaded but
    // ignored would also make the two runs above match.
    const a = createCritters(scene, [], { spawnFireflies: true, rng: mulberry32(1) });
    const b = createCritters(scene, [], { spawnFireflies: true, rng: mulberry32(2) });
    expect(positionsOf(a, 'firefly')).not.toEqual(positionsOf(b, 'firefly'));
  });

  it('draws every coordinate from the injected rng, never Math.random', () => {
    // Sixteen draws — an x and a z per firefly. If any coordinate still came
    // from Math.random the count would fall short.
    let draws = 0;
    const rng = () => { draws++; return 0.5; };
    const c = createCritters(scene, [], { spawnFireflies: true, rng });
    expect(draws).toBe(16);
    // rng() === 0.5 puts every firefly dead centre: (0.5 - 0.5) * 60 === 0.
    expect(positionsOf(c, 'firefly')).toEqual(Array.from({ length: 8 }, () => [0, 0]));
  });

  it('spawns no fireflies and draws nothing when the walk is not dusk', () => {
    let draws = 0;
    const rng = () => { draws++; return 0.5; };
    const c = createCritters(scene, [{ type: 'bird', x: 3, z: 4 }], { rng });
    expect(positionsOf(c, 'firefly')).toEqual([]);
    expect(draws).toBe(0);
    expect(positionsOf(c, 'bird')).toEqual([[3, 4]]);
  });

  it('falls back to Math.random when no rng is injected', () => {
    // Solo walks pass walkRng === Math.random, and an older caller passes no
    // rng at all; neither may throw or lose its fireflies.
    const c = createCritters(scene, [], { spawnFireflies: true });
    expect(positionsOf(c, 'firefly')).toHaveLength(8);
    for (const [x, z] of positionsOf(c, 'firefly')) {
      expect(Math.abs(x)).toBeLessThanOrEqual(30);
      expect(Math.abs(z)).toBeLessThanOrEqual(30);
    }
  });

  it('ignores a non-function rng rather than throwing', () => {
    for (const rng of [null, 'random', 42, {}, []]) {
      expect(() => createCritters(scene, [], { spawnFireflies: true, rng })).not.toThrow();
    }
  });
});
