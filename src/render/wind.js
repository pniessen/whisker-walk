import * as THREE from 'three';

// ---------------------------------------------------------------------------
// WIND — a small per-object sway system for otherwise-static foliage.
//
// Every prop in world/builder.js (trees, bushes, fence posts, ...) is a
// hand-built, flat-shaded, low-poly mesh, and every collider/perch that
// reasons about it (see climbing.js's `canReach`, and each area's collider
// list) reads a fixed `{x, z, r}` recorded separately from the mesh. A
// vertex-shader sway would look nicer, but it would silently decouple what
// the player SEES from where the game thinks the trunk is — exactly the bug
// class this project's colliders exist to make impossible. So wind sways the
// whole rigid object by a small ROTATION instead: `position.x/z` (the only
// thing any collider or perch ever reads) never moves, only the lean does.
// ---------------------------------------------------------------------------

// ---- tuning constants ------------------------------------------------

// A "unit" prop (sizeHint 1 — an unscaled bush, or a tree at builder.js's
// default scale) sways this many radians at the peak of its PRIMARY axis,
// before the gust envelope or an `intensity` (rain) multiplier touch it.
// ~1.5°: cosy-children's-game subtle. It is small enough that even after the
// side-axis wobble and a rain-strength gust peak are added on top (see the
// worst-case note by MAX_INTENSITY below), the combined lean still tops out
// at a few degrees, per the brief — over-swaying flat-shaded low-poly
// foliage reads as jelly, not weather.
export const UNIT_AMPLITUDE = 0.026; // radians, ≈1.5°

// A unit prop's primary axis completes one full cycle roughly every
// 2π / UNIT_FREQUENCY ≈ 3.6s — slow enough to read as air moving something,
// not a servo twitching on a fixed tick.
export const UNIT_FREQUENCY = 1.75; // rad/s

// The secondary ("side") axis runs at this multiple of the primary
// frequency and at this fraction of its amplitude. 1.37 is deliberately not
// a tidy ratio (2:1, 1.5:1, ...): a rational ratio makes the combined lean
// retrace the exact same little loop every couple of cycles, which reads as
// mechanical the moment a player stands still and watches one tree. An
// irrational-looking ratio instead traces a slowly precessing ellipse that
// never quite repeats within a walk's timescale.
export const SIDE_FREQUENCY_RATIO = 1.37;
export const SIDE_AMPLITUDE_FRACTION = 0.55;

// Per-object size hint is clamped to this range before it feeds the
// amplitude/frequency falloff in add(), so a malformed or extreme hint (a
// typo'd sizeHint, a prop accidentally scaled to 0) can only pull the sway
// toward "ordinary" — never toward "frozen solid" (divide blows up) or
// "whipping around" (divide collapses to 0).
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 3;

// The whole scene's sway breathes on one slow global envelope, so it doesn't
// read as every plant oscillating at one fixed, eternal rate — see the
// brief's "gentle global gust envelope, so the whole scene breathes". Period
// is 2π / GUST_FREQUENCY ≈ 52s: long enough that a stroll through one area
// (tens of seconds) reads it as weather, not a loop. GUST_DEPTH 0.4 means
// amplitude swings between 0.6x (lull) and 1.4x (gust) of baseline, and 0.6x
// of an already-gentle sway is still plainly visible, so nothing ever
// actually goes still during a lull.
export const GUST_FREQUENCY = 0.12; // rad/s
export const GUST_DEPTH = 0.4;

// update()'s `intensity` (meant to be driven by rain — see update()'s doc)
// is clamped to this ceiling so a caller passing something unexpectedly
// large can never turn the breeze into a storm: intensity 2 at a gust peak
// (1.4x) on the biggest per-object amplitude (smallest allowed sizeHint,
// MIN_SCALE) is the worst case the system can ever produce, and it is still
// only a few degrees — see test/wind.test.js's bound check.
export const MAX_INTENSITY = 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// windPhase(x, z) — a deterministic, chaotic-looking value in [0, 2π)
// derived purely from a world position. Exported so its determinism can be
// asserted directly in tests.
//
// This is the classic GLSL "sin hash": sin() of a large, irrational-looking
// linear combination of the inputs runs through many periods well before the
// inputs themselves move by even a metre, so two trees planted a few units
// apart land on very different phases despite the formula being continuous
// and having no branches or lookup tables.
//
// WHY POSITION, AND NOT A SHARED RNG STREAM. game/walk.js's walkRng is one
// seeded stream that every system draws from, in a fixed order, during
// startWalk — and its own comment there is explicit that NOTHING may draw
// from it later, per-frame, on pain of two co-walkers' clients silently
// diverging the instant their draw orders differ (walk.js:266-287). wind's
// update() runs every rendered frame for the entire life of the walk —
// precisely the consumer that warning describes. Deriving the phase from the
// object's own (x, z) instead — the same trick straycats.js's Far Call uses
// for per-cat variation — means every client computes the SAME phase for the
// SAME tree without either of them drawing from anything shared or ordered
// at all: it's arithmetic on a coordinate both clients already agree on,
// because both built the same world from the same area data.
export function windPhase(x, z) {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * Math.PI * 2;
}

// createWind({ reducedMotion }) — a tiny registry of swaying objects.
//
//   const wind = createWind({ reducedMotion: settings.get('reducedMotion') });
//   wind.add(treeGroup);
//   wind.add(bushMesh, { pivotY: 0.5, sizeHint: 0.7 });
//   ...
//   wind.update(t, rainy ? 1.7 : 1);   // call once per rendered frame
//   ...
//   wind.dispose();                    // on area teardown
//
// There is deliberately no per-object handle returned by add(): the only
// thing a caller ever needs to do to a registered object is stop swaying
// everything at once, which dispose() covers (see main.js's other per-area
// systems — skyLife, weather, fx — for the same shape).
export function createWind({ reducedMotion = false } = {}) {
  const entries = [];

  // add(object3d, opts) — register one object for sway.
  //
  //   opts.sizeHint   number > 0. Feeds the amplitude/frequency falloff
  //                   below (bigger → slower, smaller sway; smaller →
  //                   snappier, bigger sway — a big canopy's inertia moves
  //                   slowly and a little, a light bush responds fast).
  //                   Defaults to object3d's own average scale factor,
  //                   `(scale.x + scale.y + scale.z) / 3`. That default is
  //                   exactly right for world/builder.js's `tree(x, z,
  //                   scale)`, whose Group carries `g.scale.setScalar
  //                   (scale)` — a big oak naturally gets a bigger sizeHint
  //                   than a sapling with zero extra wiring. Props that
  //                   builder.js never scales (bush(), fenceRun(), ...)
  //                   default to 1, i.e. "ordinary". Pass sizeHint
  //                   explicitly to make a prop read as smaller/twitchier
  //                   than its render scale implies — bushes are visually
  //                   small and light no matter how big one is drawn, so the
  //                   integration pass may want every bush's sizeHint forced
  //                   low regardless of its mesh scale.
  //   opts.amplitude  radians. Overrides the derived amplitude outright.
  //   opts.frequency  rad/s. Overrides the derived frequency outright.
  //   opts.pivotY     number, default 0. See "PIVOTING AROUND THE BASE".
  //
  // PIVOTING AROUND THE BASE. Rotating object3d.rotation directly pivots
  // around object3d's OWN ORIGIN. For builder.js's compound props (tree(),
  // mailbox(), fenceRun(), ...) that origin already IS the ground contact
  // point — `g.position.set(x, 0, z)` with every part stacked above local
  // y=0 — so the default (pivotY: 0, just rotate object3d in place) already
  // pivots exactly at the base, for free, with no extra bookkeeping.
  //
  // It is NOT true of a single-mesh prop built around its own visual center
  // (builder.js's bush(): one Icosahedron Mesh placed at world y=0.5, no
  // wrapping group). Rotating that mesh directly pivots around its belly,
  // not its root — invisible at a couple of degrees on a small round bush,
  // but for a caller that wants it exact anyway, pivotY makes add() build a
  // one-time invisible pivot Group at the object's true base and reparent
  // object3d under it (offset upward by pivotY, so its world position is
  // unchanged), so wind then rotates the PIVOT and object3d swings from its
  // root like something actually hinged to the ground. This costs a one-off
  // reparent here at add() time, nothing extra in update(), and is undone
  // exactly by dispose(). It assumes object3d's existing parent applies no
  // rotation/scale of its own, which holds for every area builder in
  // world/*.js — they add props straight to the scene or to an unrotated,
  // unscaled area group. If object3d has no parent yet (e.g. a test
  // fixture, or a caller that registers before scene.add()), pivotY is
  // silently ignored and object3d is rotated directly instead of throwing —
  // there is nothing to reparent it under.
  function add(object3d, opts = {}) {
    const sizeHint = typeof opts.sizeHint === 'number' && opts.sizeHint > 0
      ? opts.sizeHint
      : (object3d.scale.x + object3d.scale.y + object3d.scale.z) / 3;
    const scale = clamp(sizeHint, MIN_SCALE, MAX_SCALE);

    const amp = typeof opts.amplitude === 'number' ? opts.amplitude : UNIT_AMPLITUDE / Math.sqrt(scale);
    const freq = typeof opts.frequency === 'number' ? opts.frequency : UNIT_FREQUENCY / scale;

    const phase = windPhase(object3d.position.x, object3d.position.z);
    // Second phase for the side axis, from the SAME two coordinates with
    // (x, z) swapped rather than reused verbatim — otherwise the two axes
    // would sit a fixed offset apart for every object, and every tree would
    // trace the identical ellipse shape, merely rotated.
    const sidePhase = windPhase(object3d.position.z, object3d.position.x);

    const pivotY = typeof opts.pivotY === 'number' ? opts.pivotY : 0;
    let target = object3d;
    let pivotInfo = null;
    if (pivotY !== 0 && object3d.parent) {
      const pivot = new THREE.Group();
      pivot.position.copy(object3d.position);
      pivot.position.y += pivotY;
      const parent = object3d.parent;
      const originalPosition = object3d.position.clone();
      parent.add(pivot);
      pivot.add(object3d); // THREE.Object3D#add detaches object3d from `parent` automatically
      object3d.position.set(0, -pivotY, 0);
      target = pivot;
      pivotInfo = { parent, originalPosition };
    }

    entries.push({
      object3d,
      target,
      pivotInfo,
      baseRotX: target.rotation.x,
      baseRotZ: target.rotation.z,
      amp,
      freq,
      phase,
      sidePhase,
    });
  }

  // update(t, intensity) — call once per rendered frame with the walk's
  // elapsed time (main.js's `clock.elapsedTime`, the same `t` already passed
  // to skyLife/goldMice/ghosts). Using absolute elapsed time rather than
  // accumulating dt internally means every rotation is a pure function of
  // `t` recomputed fresh each call — there is no running total anywhere in
  // this module to drift, and reading the same `t` twice always yields the
  // same rotation (see test/wind.test.js's determinism/bound checks).
  //
  // `intensity` (default 1 = an ordinary breeze) is a plain multiplier on
  // top of the gust envelope, deliberately NOT read from weather.js here —
  // this module has no idea what rain is, by design (see the file header's
  // constraint: it accepts a hint rather than importing weather). The
  // integration pass should drive it from session.weather.condition, e.g.
  // `wind.update(t, session.weather.condition === 'rain' ? 1.7 : 1)` —
  // ~1.7 comfortably clears "noticeably windier" while staying under
  // MAX_INTENSITY's storm ceiling.
  //
  // Allocates nothing: every value below is a local primitive (numbers), and
  // the loop only assigns into `.rotation.x/z`, which THREE.Object3D already
  // owns — no per-frame object, array, or vector is created.
  function update(t, intensity = 1) {
    if (reducedMotion) return; // kill the sway entirely — same "drop the exaggeration" rule as cat/animator.js's body-bob and fx.js's particles
    const gust = (1 + GUST_DEPTH * Math.sin(t * GUST_FREQUENCY)) * clamp(intensity, 0, MAX_INTENSITY);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      e.target.rotation.z = e.baseRotZ + Math.sin(t * e.freq + e.phase) * e.amp * gust;
      e.target.rotation.x = e.baseRotX
        + Math.sin(t * e.freq * SIDE_FREQUENCY_RATIO + e.sidePhase) * e.amp * SIDE_AMPLITUDE_FRACTION * gust;
    }
  }

  // dispose() — stop swaying everything and undo any pivot reparenting from
  // add(), restoring every registered object to exactly the parent,
  // position and rotation it had before it was registered.
  function dispose() {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      e.target.rotation.x = e.baseRotX;
      e.target.rotation.z = e.baseRotZ;
      if (e.pivotInfo) {
        const { parent, originalPosition } = e.pivotInfo;
        parent.add(e.object3d); // detaches from the pivot automatically
        e.object3d.position.copy(originalPosition);
        parent.remove(e.target); // the now-childless pivot Group
      }
    }
    entries.length = 0;
  }

  return { add, update, dispose };
}
