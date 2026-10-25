import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCritters, PREY_NOTICE, PREY_NOTICE_STALKED, HIDE_REACH } from '../src/critters.js';
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

// ---------------------------------------------------------------------------
// v21 3b Task 13 — prey that evades.
//
// A mouse, rat or squirrel that notices the cat runs for the nearest cover
// within 15m and hides there for the rest of the walk. A trotting cat is
// noticed at PREY_NOTICE (3.5m), a stalking one only at PREY_NOTICE_STALKED
// (1.2m). A pounce-tag still pays exactly as before (the caller's job) and the
// tagged critter then hides too — caught and released, never removed.
// ---------------------------------------------------------------------------

describe('createCritters — prey that evades (v21 3b Task 13)', () => {
  // A critter that stands still (zero patrol span), by default a mouse at the
  // origin, with its cover 5m to the east.
  const still = (type = 'mouse', x = 0, z = 0) => ({ type, x, z, x2: x, z2: z });
  const HIDE = { x: 5, z: 0 };
  let clockT = 0;
  // One 60Hz frame in the order the game runs them: critters.update (main.js)
  // and then markStalked (game/avatar.js), so update reads LAST frame's flag.
  const frame = (c, cat, stalking = false) => {
    clockT += 1 / 60;
    c.update(1 / 60, clockT, cat, cat);
    c.markStalked(cat, stalking);
  };
  const run = (c, seconds, cat, stalking = false) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) frame(c, cat, stalking);
  };
  const byType = (c, type) => c.list.find((x) => x.type === type);

  it('a mouse bolts for its hide when the cat trots up, and stays hidden', () => {
    const hidden = [];
    const c = createCritters(scene, [still()], { hides: [HIDE], onHide: (x) => hidden.push(x) });
    const mouse = byType(c, 'mouse');
    run(c, 1, V(-10, 0));
    expect(mouse.fleeing).toBe(false);
    expect(mouse.group.visible).toBe(true);

    frame(c, V(-3, 0)); // 3m: inside PREY_NOTICE
    expect(mouse.fleeing).toBe(true);
    run(c, 0.3, V(-3, 0));
    // It runs TOWARD its cover (east), at its dash speed (6.5m/s).
    expect(mouse.group.position.x).toBeGreaterThan(1.5);
    expect(mouse.group.position.x).toBeLessThan(2.5);
    expect(mouse.hidden).toBeFalsy();

    run(c, 1, V(-3, 0));
    expect(mouse.hidden).toBe(true);
    expect(mouse.group.visible).toBe(false); // contactshadows collapses a hidden mover's decal
    expect(mouse.spottable).toBe(false);
    expect(mouse.group.position.distanceTo(V(5, 0))).toBeLessThanOrEqual(HIDE_REACH);
    expect(hidden).toEqual([mouse]);

    // The cat walks away and a long time passes: it stays hidden, and the
    // walk was told exactly once.
    run(c, 40, V(-30, 0));
    expect(mouse.hidden).toBe(true);
    expect(mouse.group.visible).toBe(false);
    expect(hidden).toHaveLength(1);
    expect(c.list).toContain(mouse); // hidden, never removed
  });

  it('runs to the nearest hide, and only to one within 15m', () => {
    const c = createCritters(scene, [still('rat'), still('squirrel', 40, 0)], {
      hides: [{ x: 0, z: 9 }, { x: 0, z: -4 }, { x: 56, z: 0 }],
    });
    const rat = byType(c, 'rat');
    const squirrel = byType(c, 'squirrel');
    frame(c, V(-2, 0));
    run(c, 2, V(-2, 0));
    expect(rat.hidden).toBe(true);
    expect(rat.group.position.distanceTo(V(0, -4))).toBeLessThanOrEqual(HIDE_REACH);
    // The squirrel's only hide is 16m off: it dashes away instead and comes back.
    frame(c, V(38, 0));
    expect(squirrel.fleeing).toBe(true);
    run(c, 1, V(38, 0));
    expect(squirrel.group.position.x).toBeGreaterThan(42); // away from the cat
    run(c, 3, V(-30, 0));
    expect(squirrel.fleeing).toBe(false);
    expect(squirrel.hidden).toBeFalsy();
    expect(squirrel.group.position.x).toBeCloseTo(40, 5);
  });

  it('a stalking cat gets much closer before the mouse notices', () => {
    expect(PREY_NOTICE).toBe(3.5);
    expect(PREY_NOTICE_STALKED).toBe(1.2);
    const c = createCritters(scene, [still()], { hides: [HIDE] });
    const mouse = byType(c, 'mouse');
    c.markStalked(V(-6, 0), true); // the cat was already stalking on its way in
    run(c, 1, V(-2, 0), true);
    expect(mouse.fleeing).toBe(false); // 2m away, stalking: unnoticed
    run(c, 1, V(-1.3, 0), true);
    expect(mouse.fleeing).toBe(false);
    frame(c, V(-1.1, 0), true);
    expect(mouse.fleeing).toBe(true);

    // The same 2m, trotting: noticed at once.
    const t = createCritters(scene, [still()], { hides: [HIDE] });
    frame(t, V(-2, 0), false);
    expect(byType(t, 'mouse').fleeing).toBe(true);
  });

  it('a hidden critter cannot be pounced, spotted, meowed at or called', () => {
    const c = createCritters(scene, [still('squirrel')], { hides: [HIDE] });
    const sq = byType(c, 'squirrel');
    frame(c, V(-3, 0));
    run(c, 3, V(-3, 0));
    expect(sq.hidden).toBe(true);
    const at = sq.group.position.clone();

    expect(c.nearest(at, 10)).toBe(null);             // no chase prompt
    expect(sq.spottable).toBe(false);                 // no spot award, no photo
    expect(c.pounceCatch(at)).toBe(null);             // no pounce-tag
    c.markStalked(at, true);
    expect(sq.stalkClose).toBeFalsy();                // no "perfect sneak"
    expect(c.catchAt(at)).toBe(null);
    expect(c.reactToMeow(at, { far: true })).toBe(0); // Far Call skips it
    expect(sq.anchorTo).toBe(null);
    c.dismayNear(at, 8);
    run(c, 30, at);                                   // standing right on its hide
    expect(sq.hidden).toBe(true);
    expect(sq.group.visible).toBe(false);
    expect(sq.group.position.equals(at)).toBe(true);
    expect(c.pounceCatch(at)).toBe(null);             // and still not, 30s later
  });

  it('a caught mouse pays once and then hides too', () => {
    const hidden = [];
    const c = createCritters(scene, [still()], { hides: [HIDE], onHide: (x) => hidden.push(x) });
    const mouse = byType(c, 'mouse');
    c.markStalked(V(-0.5, 0), true);
    // The pounce result is exactly what it was: the caller pays from it.
    expect(c.pounceCatch(V(-0.5, 0))).toEqual({ type: 'mouse', wasStalked: true });
    expect(c.pounceCatch(V(-0.5, 0))).toBe(null); // once
    run(c, 2, V(-0.5, 0), true);
    expect(mouse.hidden).toBe(true);
    expect(mouse.group.visible).toBe(false);
    expect(hidden).toEqual([]); // caught, not got away: no "dived under cover"
    run(c, 25, V(-0.5, 0), true); // past the 20s catch cooldown
    expect(c.pounceCatch(mouse.group.position.clone())).toBe(null);
    expect(c.list).toContain(mouse);
  });

  it('with no hides it dashes away and comes back, as before', () => {
    for (const opts of [{}, { hides: [] }, { hides: [{ x: 40, z: 0 }] }, { hides: 'garbage' }, { hides: [null, { x: 'a' }] }]) {
      const c = createCritters(scene, [{ type: 'mouse', x: 0, z: 0 }], opts); // patrol 0..6 on x
      const mouse = byType(c, 'mouse');
      frame(c, V(-3, 0));
      expect(mouse.fleeing).toBe(true);
      expect(mouse.cooldown).toBeCloseTo(3, 1); // the pounce-tag dash's 3s, one frame in
      const x0 = mouse.group.position.x;
      run(c, 1, V(-30, 0)); // the dash runs FROM the cat
      expect(mouse.group.position.x).toBeGreaterThan(x0 + 5);
      run(c, 2.2, V(-30, 0));
      expect(mouse.fleeing).toBe(false);
      expect(mouse.hidden).toBeFalsy();
      expect(mouse.group.visible).toBe(true);
      // Back on its patrol line.
      expect(mouse.group.position.x).toBeGreaterThanOrEqual(0);
      expect(mouse.group.position.x).toBeLessThanOrEqual(6);
      expect(mouse.group.position.z).toBeCloseTo(0, 5);
      // And a pounce-tag with no cover is the old 3s dash too.
      const tagged = createCritters(scene, [still()], opts);
      expect(tagged.pounceCatch(V(0.5, 0))).toEqual({ type: 'mouse', wasStalked: false });
      expect(byType(tagged, 'mouse').cooldown).toBe(3);
      run(tagged, 4, V(-30, 0));
      expect(byType(tagged, 'mouse').hidden).toBeFalsy();
      expect(byType(tagged, 'mouse').group.visible).toBe(true);
    }
  });

  it('birds are untouched', () => {
    // A fingerprint of every non-prey critter's position at four frames,
    // recorded off the pre-Task-13 critters.js with exactly this run (which
    // already passed hides/onHide — the old module ignored them). The run is
    // seeded end to end: spawn's own phase roll goes through a seeded
    // Math.random, and it takes the cat through the flock, stalks, meows a
    // Far Call and pounces, so the birds take off, fly and come home.
    const GOLDEN = [
      [[2, 0.073826, 0], [-2.400623, 2.420343, 2.955352], [6, 0.013861, -2], [2.473543, 0.854505, 1.017854], [-7.090357, 0, -4.32336], [1.876299, 0, 5]],
      [[4.452147, 3.800627, 0.636203], [6.929076, 16.420343, 2.694905], [6, 0.041314, -2], [0.302058, 1.092207, -0.475035], [-7.914072, 0, -5.420062], [4.2, 0, 5]],
      [[14.131673, 18.800627, 3.147532], [16.925181, 31.420343, 2.415855], [6.325466, 15.041314, -11.994702], [-0.701826, 0.817746, -0.91392], [-3.729943, 0, -3.176495], [2.02629, 0, 5]],
      [[30.199687, 43.700627, 7.316337], [33.518717, 56.320343, 1.952632], [6.865739, 39.941314, -28.585908], [0.906661, 1.062522, 0.641984], [0.391329, 0, -2.39703], [1.988077, 0, 5]],
    ];
    const spawns = [
      { type: 'bird', x: 2, z: 0 }, { type: 'bird', x: -4, z: 3 },
      { type: 'seagull', x: 6, z: -2 }, { type: 'butterfly', x: 1, z: 1 },
      { type: 'duck', x: -6, z: -6 }, { type: 'crab', x: 3, z: 5 },
      { type: 'mouse', x: 0, z: 2 },
    ];
    const real = Math.random;
    Math.random = mulberry32(99);
    let c;
    try {
      c = createCritters(scene, spawns, { rng: mulberry32(5), hides: [{ x: 0, z: 4 }], onHide() {} });
    } finally {
      Math.random = real;
    }
    const path = (i) => V(-8 + i * 0.05, Math.sin(i / 30) * 2);
    const out = [];
    for (let i = 0; i < 600; i++) {
      c.update(1 / 60, i / 60, path(i), path(i));
      c.markStalked(path(i), i > 300);
      if (i === 200) c.reactToMeow(path(i), { far: true });
      if (i % 50 === 0) c.pounceCatch(path(i));
      if ([60, 200, 350, 599].includes(i)) {
        out.push(c.list.filter((x) => !['mouse', 'rat', 'squirrel'].includes(x.type))
          .map((x) => x.group.position.toArray().map((v) => +v.toFixed(6))));
      }
    }
    expect(out).toEqual(GOLDEN);
    expect(byType(c, 'mouse').hidden).toBe(true); // and the mouse did evade, mid-flock
  });

  it('evasion draws nothing from the injected rng or from Math.random', () => {
    let draws = 0;
    const rng = () => { draws++; return 0.5; };
    const real = Math.random;
    const c = createCritters(scene, [still(), still('rat', 20, 0), still('squirrel', -20, 0)], {
      rng, hides: [HIDE, { x: 24, z: 0 }],
    });
    let rolls = 0; // spawn's own phase roll predates Task 13 and is not under test
    Math.random = () => { rolls++; return real(); };
    try {
      frame(c, V(-3, 0));          // the mouse bolts for cover
      run(c, 2, V(-3, 0));
      c.markStalked(V(19.5, 0), true);
      c.pounceCatch(V(19.5, 0));   // the rat is caught and hides
      run(c, 2, V(19.5, 0), true);
      run(c, 4, V(-18, 0));        // the squirrel has no cover in reach: the dash
      c.reactToMeow(V(0, 0), { far: true });
      run(c, 1, V(0, 0));
    } finally {
      Math.random = real;
    }
    expect(byType(c, 'mouse').hidden).toBe(true);
    expect(byType(c, 'rat').hidden).toBe(true);
    expect(byType(c, 'squirrel').hidden).toBeFalsy();
    expect(draws).toBe(0);
    expect(rolls).toBe(0);
  });
});
