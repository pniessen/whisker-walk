import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
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

// ---------------------------------------------------------------------------
// v18 CF-5 — Far Call's critter half.
//
// The spec says a Far Call meow draws "strays and critters"; only the stray
// half shipped, because critters.js was outside the implementing task's
// ownership. The draw moves each called critter's IDLE ANCHOR — the centre
// point every idle pattern is built around — rather than the critter itself,
// so its patrol/circle/hover glides over instead of teleporting.
// ---------------------------------------------------------------------------

// The real game passes a THREE.Vector3 here (session.cat.position), and the
// draw clones and normalizes it, so the test uses the real class.
const V = (x, z) => new THREE.Vector3(x, 0, z);

describe('createCritters — Far Call (v18 CF-5)', () => {
  // A squirrel out in the far band and a bird beside it, so one call
  // exercises both the draw and the untouched startle.
  const spawns = () => [
    { type: 'squirrel', x: 15, z: 0 },
    { type: 'bird', x: 3, z: 0 },
    { type: 'villager', x: 4, z: 0 },
    { type: 'duck', x: 40, z: 0 }, // beyond the 22m band
  ];
  const byType = (c, type) => c.list.find((x) => x.type === type);
  const step = (c, seconds) => {
    // 60Hz, the rate the render loop actually drives update at.
    for (let i = 0; i < seconds * 60; i++) c.update(1 / 60, i / 60, V(0, 0), V(0, 0));
  };

  it('leaves every critter exactly where it was without the skill', () => {
    // The no-skill path — and the remote-meow path, which never passes far —
    // must be the pre-v18 loop.
    const c = createCritters(scene, spawns(), {});
    const sq = byType(c, 'squirrel');
    const home = sq.anchor.clone();
    expect(c.reactToMeow(V(0, 0))).toBe(0);
    expect(sq.anchorTo).toBe(null);
    step(c, 1);
    expect(sq.anchor.equals(home)).toBe(true);
  });

  it('draws a curious critter in the far band toward the caller', () => {
    const c = createCritters(scene, spawns(), {});
    const sq = byType(c, 'squirrel');
    expect(c.reactToMeow(V(0, 0), { far: true })).toBe(1); // squirrel only
    expect(sq.anchorTo).not.toBe(null);
    const before = sq.anchor.length();
    step(c, 2);
    expect(sq.anchor.length()).toBeLessThan(before);
  });

  it('stops a body length short instead of stacking on the caller', () => {
    const c = createCritters(scene, spawns(), {});
    const sq = byType(c, 'squirrel');
    c.reactToMeow(V(0, 0), { far: true });
    step(c, 20); // longer than the call, so it also arrives and heads home
    expect(sq.anchorTo).toBe(null); // the call lapsed
    step(c, 20);
    // Home again: a called critter must not abandon its spawn patrol.
    expect(sq.anchor.distanceTo(sq.anchorHome)).toBeLessThan(0.01);
  });

  it('parks the anchor at the standoff distance while the call is live', () => {
    const c = createCritters(scene, spawns(), {});
    const sq = byType(c, 'squirrel');
    c.reactToMeow(V(0, 0), { far: true });
    // 2.2m out along the squirrel's own bearing from the caller (+x here).
    expect(sq.anchorTo.x).toBeCloseTo(2.2, 5);
    expect(sq.anchorTo.z).toBeCloseTo(0, 5);
  });

  it('ignores critters beyond the 22m band', () => {
    const c = createCritters(scene, spawns(), {});
    expect(byType(c, 'duck').anchorTo).toBe(null);
    c.reactToMeow(V(0, 0), { far: true });
    expect(byType(c, 'duck').anchorTo).toBe(null);
  });

  it('never draws the critters a meow scatters, and still scatters them', () => {
    // Birds and seagulls bolt at a meow. Drawing them would have the same
    // meow do two opposite things in one frame.
    const c = createCritters(scene, spawns(), {});
    const bird = byType(c, 'bird');
    c.reactToMeow(V(0, 0), { far: true });
    expect(bird.fleeing).toBe(true);  // unchanged startle
    expect(bird.anchorTo).toBe(null); // and no draw
  });

  it('still waves the villager and never draws it', () => {
    const c = createCritters(scene, spawns(), {});
    const v = byType(c, 'villager');
    c.reactToMeow(V(0, 0), { far: true });
    expect(v.meowWaveT).toBe(1.5);
    expect(v.anchorTo).toBe(null);
  });

  it('awards, marks and catches nothing — the draw is movement only', () => {
    // critters.nearest feeds the chase prompt and catchAt/pounceCatch pay
    // out, so a meow that marked a critter would out-farm walking over to it.
    const c = createCritters(scene, spawns(), {});
    const sq = byType(c, 'squirrel');
    const snapshot = { spottable: sq.spottable, fleeing: sq.fleeing, caughtUntil: sq.caughtUntil, stalkClose: sq.stalkClose };
    c.reactToMeow(V(0, 0), { far: true });
    expect({ spottable: sq.spottable, fleeing: sq.fleeing, caughtUntil: sq.caughtUntil, stalkClose: sq.stalkClose })
      .toEqual(snapshot);
  });

  it('draws nothing from Math.random — the call is derived from positions', () => {
    // critters.js takes an injected rng precisely so two co-walkers on one
    // room seed agree; a bare roll in the draw would reintroduce that split.
    const real = Math.random;
    let rolls = 0;
    Math.random = () => { rolls++; return real(); };
    try {
      const c = createCritters(scene, spawns(), {});
      rolls = 0; // spawn's own phase roll predates v18 and is not under test
      c.reactToMeow(V(0, 0), { far: true });
      step(c, 3);
      expect(rolls).toBe(0);
    } finally {
      Math.random = real;
    }
  });

  it('gives two co-walkers on one seed the same called-critter positions', () => {
    const make = () => createCritters(scene, spawns(), { rng: mulberry32(7) });
    const [a, b] = [make(), make()];
    for (const c of [a, b]) {
      c.reactToMeow(V(0, 0), { far: true });
      step(c, 3);
    }
    const anchors = (c) => c.list.map((x) => [x.anchor.x.toFixed(6), x.anchor.z.toFixed(6)]);
    expect(anchors(a)).toEqual(anchors(b));
  });
});
