import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {
  createStrayCats, friendRungCrossed, friendRungs, isGrudgeableStray, CAT_NAMES, legendPulse, strayStream,
} from '../src/straycats.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { NAME_TAG_RANGE, CROSS_NAME_TAG_RANGE } from '../src/nametag.js';
import { hasSkill } from '../src/skills.js';
import { mulberry32 } from '../src/rng.js';
import { collarFor as housecatCollar, wanderStrayCount } from '../src/housecats.js';
import { lonersFor } from '../src/clancast.js';
import { PREFIXES, CAT_PREFIXES } from '../src/clanwords.js';
import { prefixFor } from '../src/clannames.js';
import { emptyColony, feedCat, canFeed, tamingProgress } from '../src/colony.js';
import { KIT_NAMES, LEGENDARY_NAMES, isStrayName, strayBreed, STRAY_BREEDS } from '../src/straynames.js';

function fakeScene() {
  const objects = new Set();
  return {
    objects,
    add: (o) => objects.add(o),
    remove: (o) => objects.delete(o),
  };
}

const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
const FAR = new THREE.Vector3(999, 0, 999);
const NO_OPTS = { stalking: false, catSpeed: 0, toy: null };

describe('createStrayCats', () => {
  it('spawns the requested number of strays inside the area bounds', () => {
    const scene = fakeScene();
    const strays = createStrayCats(scene, AREA, 3);
    expect(strays.strays).toHaveLength(3);
    expect(scene.objects.size).toBe(3);
    for (const s of strays.strays) {
      expect(s.group.position.x).toBeGreaterThanOrEqual(AREA.bounds.minX);
      expect(s.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
    }
  });

  it('wanders without leaving bounds or crashing over many frames', () => {
    const strays = createStrayCats(fakeScene(), AREA, 3);
    for (let i = 0; i < 600; i++) strays.update(0.05, i * 0.05, FAR, NO_OPTS);
    for (const s of strays.strays) {
      expect(s.group.position.x).toBeGreaterThanOrEqual(AREA.bounds.minX);
      expect(s.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
      expect(s.group.position.z).toBeGreaterThanOrEqual(AREA.bounds.minZ);
      expect(s.group.position.z).toBeLessThanOrEqual(AREA.bounds.maxZ);
      expect(Number.isFinite(s.group.position.x)).toBe(true);
    }
  });

  it('nearest finds a stray within range and ignores ones beyond it', () => {
    const strays = createStrayCats(fakeScene(), AREA, 1);
    const s = strays.strays[0];
    const near = s.group.position.clone().add(new THREE.Vector3(1, 0, 0));
    expect(strays.nearest(near, 2.5)).toBe(s);
    const far = s.group.position.clone().add(new THREE.Vector3(30, 0, 0));
    expect(strays.nearest(far, 2.5)).toBe(null);
  });

  it('nearest with ungreetedOnly skips a closer greeted stray in favor of an ungreeted one', () => {
    const strays = createStrayCats(fakeScene(), AREA, 2);
    const [a, b] = strays.strays;
    a.group.position.set(0, 0, 0);
    b.group.position.set(0, 0, 1);
    const playerPos = new THREE.Vector3(0, 0, -0.5); // a is closer than b
    strays.greet(a, playerPos);
    expect(strays.nearest(playerPos, 2.5)).toBe(a);
    expect(strays.nearest(playerPos, 2.5, { ungreetedOnly: true })).toBe(b);
  });

  it('greet turns the stray toward the greeter, marks it greeted, and later resumes wandering', () => {
    const strays = createStrayCats(fakeScene(), AREA, 1);
    const s = strays.strays[0];
    strays.greet(s, s.group.position.clone().add(new THREE.Vector3(0, 0, 5)));
    expect(s.state).toBe('greet');
    expect(s.greeted).toBe(true);
    for (let i = 0; i < 100; i++) strays.update(0.05, i * 0.05, FAR, NO_OPTS);
    expect(s.state).not.toBe('greet');
    expect(s.greeted).toBe(true); // stays greeted for the rest of the walk
  });

  it('dispose removes all strays from the scene', () => {
    const scene = fakeScene();
    const strays = createStrayCats(scene, AREA, 3);
    strays.dispose();
    expect(scene.objects.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Seeded-RNG determinism — the bug this file exists to catch.
//
// A room walk seeds every client's walkRng from the same roomSeed and relies
// on straycats drawing from it in lockstep (see game/walk.js:266-287): the
// name shuffle and personality roll already did, but spawn position, facing
// and the initial wander timer were drawn from bare Math.random() instead.
// Two co-walkers agreed on WHICH cats existed and got shuffled the same
// names, but each saw them standing in a different spot facing a different
// way — the same "same world, different fields" desync as CF-7
// (game/walk.js:507) and the firefly bug (game/walk.js:429). This is the
// assertion that would have caught it: two independent mulberry32(seed)
// streams on the same seed must produce byte-identical spawns.
// ---------------------------------------------------------------------------
describe('createStrayCats seeded-RNG determinism', () => {
  it('two fresh mulberry32(seed) streams on the same seed spawn identical positions, facings and timers', () => {
    const a = createStrayCats(fakeScene(), AREA, 5, mulberry32(42));
    const b = createStrayCats(fakeScene(), AREA, 5, mulberry32(42));
    expect(a.strays.map((s) => s.name)).toEqual(b.strays.map((s) => s.name));
    expect(a.strays.map((s) => s.personality)).toEqual(b.strays.map((s) => s.personality));
    for (let i = 0; i < a.strays.length; i++) {
      expect(a.strays[i].group.position.x).toBe(b.strays[i].group.position.x);
      expect(a.strays[i].group.position.z).toBe(b.strays[i].group.position.z);
      expect(a.strays[i].group.rotation.y).toBe(b.strays[i].group.rotation.y);
      expect(a.strays[i].timer).toBe(b.strays[i].timer);
    }
  });

  // Clan Life Part 1, Task 3: a territory with a camp spawns fewer strays
  // (lonersFor) from the same stream. That is safe only because a shorter cast
  // is a prefix of the longer one, cat for cat.
  it('fewer strays from the same stream are a prefix of today\'s cast', () => {
    const view = (s) => [s.name, s.group.position.x, s.group.position.z, s.group.rotation.y, s.personality];
    for (const [few, many] of [[5, 22], [12, 22], [4, 14]]) {
      const a = createStrayCats(fakeScene(), AREA, few, strayStream(7), { roomSeed: 7 });
      const b = createStrayCats(fakeScene(), AREA, many, strayStream(7), { roomSeed: 7 });
      expect(a.strays).toHaveLength(few);
      expect(a.strays.map(view)).toEqual(b.strays.slice(0, few).map(view));
    }
  });

  it('two different seeds do not spawn identical positions', () => {
    const a = createStrayCats(fakeScene(), AREA, 5, mulberry32(42));
    const b = createStrayCats(fakeScene(), AREA, 5, mulberry32(43));
    const positions = (cats) => cats.strays.map((s) => [s.group.position.x, s.group.position.z, s.group.rotation.y, s.timer]);
    expect(positions(a)).not.toEqual(positions(b));
  });
});

// ---------------------------------------------------------------------------
// Seeded WANDER determinism — the half the spawn tests above cannot see.
//
// Spawn being seeded only bought the first frame. The wander FSM in update()
// still rolled scurry bearings, wander targets, idle poses and every timer off
// bare Math.random(), so two co-walkers watched the same cats appear in the
// same places and then walk off in different directions a second or two later.
// A spawn-only assertion passes happily while that happens, which is exactly
// why the tests below STEP the population: they compare the world after many
// updates, not at frame zero.
//
// The fix is a private mulberry32 per stray, seeded from (roomSeed, name) —
// see straycats.js's strayWanderRng. Not walkRng: walk.js:266-287 forbids a
// per-frame consumer of the shared stream.
// ---------------------------------------------------------------------------
describe('stray wander determinism', () => {
  // Identical inputs on both "clients": the player parked far away (so no
  // scurry, no greet, no tag work) and no toy. Any divergence is the FSM's
  // own rolls, which is the thing under test.
  function step(cats, steps = 600) {
    for (let i = 0; i < steps; i++) cats.update(0.05, i * 0.05, FAR, NO_OPTS);
  }
  const snapshot = (cats) => cats.strays.map((s) => [
    s.group.position.x, s.group.position.z, s.group.rotation.y, s.state, s.pose, s.timer,
  ]);

  it('two clients on one roomSeed still match after hundreds of update steps', () => {
    const a = createStrayCats(fakeScene(), AREA, 8, mulberry32(42), { roomSeed: 20260827 });
    const b = createStrayCats(fakeScene(), AREA, 8, mulberry32(42), { roomSeed: 20260827 });
    const spawned = snapshot(a);
    expect(spawned).toEqual(snapshot(b));   // as before: the cats start together...

    step(a);
    step(b);
    expect(snapshot(a)).toEqual(snapshot(b));   // ...and now they stay together.
    // Guard against a vacuous pass: the cats must actually have wandered.
    expect(snapshot(a)).not.toEqual(spawned);
  });

  it('two different roomSeeds wander apart even from an identical spawn', () => {
    // Same spawn stream, different roomSeed: the two populations start
    // byte-identical, so anything that differs after stepping came from the
    // wander streams alone.
    const a = createStrayCats(fakeScene(), AREA, 8, mulberry32(42), { roomSeed: 111 });
    const b = createStrayCats(fakeScene(), AREA, 8, mulberry32(42), { roomSeed: 222 });
    expect(snapshot(a)).toEqual(snapshot(b));
    step(a);
    step(b);
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });

  it('an unseeded (solo) walk still wanders differently every time', () => {
    // Solo passes no roomSeed, so the base falls back to a fresh random number
    // the way sky life's stream does. Two solo populations off the same spawn
    // stream must not walk the same path.
    const a = createStrayCats(fakeScene(), AREA, 8, mulberry32(42));
    const b = createStrayCats(fakeScene(), AREA, 8, mulberry32(42));
    expect(snapshot(a)).toEqual(snapshot(b));
    step(a);
    step(b);
    expect(snapshot(a)).not.toEqual(snapshot(b));
  });

  it('gives every one of the 48 shipped names a distinct wander stream', () => {
    // The reason the per-cat offset is seedFromCode and not hashName: hashName
    // is a sum of char codes and collides on letter permutations, yielding only
    // 43 distinct values over CAT_NAMES. Two cats sharing a stream here would
    // walk identical paths in lockstep for a whole walk.
    const cats = createStrayCats(fakeScene(), AREA, CAT_NAMES.length, mulberry32(5), { roomSeed: 99 });
    expect(cats.strays).toHaveLength(CAT_NAMES.length);
    const firstDraws = new Set(cats.strays.map((s) => s.wanderRng()));
    expect(firstDraws.size).toBe(CAT_NAMES.length);
  });

  it('takes no draws from the shared walk stream while wandering', () => {
    // walkRng is order-sensitive and shared. The wander streams must cost it
    // nothing, or a client whose cats happened to roll one more time would
    // shift every later draw in the walk.
    let draws = 0;
    const inner = mulberry32(42);
    const counted = () => { draws += 1; return inner(); };
    const cats = createStrayCats(fakeScene(), AREA, 8, counted, { roomSeed: 7 });
    const atSpawn = draws;
    step(cats);
    expect(draws).toBe(atSpawn);
  });
});

// ---------------------------------------------------------------------------
// v18 Charmer ('charmer') — the friendship ladder climbs on fewer greets.
//
// The security property under test throughout this block is NOT "Charmer
// works"; it is that Charmer moves the RUNGS and cannot move the COUNT.
// Greets persist to a backend whose record_friend_greet validates only the
// caller's identity, so the client-side per-walk cap is load-bearing.
// ---------------------------------------------------------------------------

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

// Walk the ladder one greet at a time and collect the rung each greet crossed,
// indexed by the resulting greet count: rungs[n] is what greet number n said.
function ladder(charmer, upTo = 8) {
  const out = [];
  for (let after = 1; after <= upTo; after++) {
    out.push(friendRungCrossed(after - 1, after, { charmer }));
  }
  return out;
}

describe('friendRungCrossed', () => {
  it('without Charmer reproduces progression.recordGreet\'s 1/3/6 rungs exactly', () => {
    // This is the "no-skill path behaves exactly as today" pin. recordGreet
    // returns 'met' iff greets === 1, 'friend' iff === 3, 'best' iff === 6,
    // and null otherwise.
    expect(ladder(false)).toEqual([
      'met', null, 'friend', null, null, 'best', null, null,
    ]);
    expect(friendRungs(false)).toEqual({ met: 1, friend: 3, best: 6 });
  });

  it('with Charmer reaches ♥ and 💕 sooner, on 2 and 4 greets', () => {
    expect(ladder(true)).toEqual([
      'met', 'friend', null, 'best', null, null, null, null,
    ]);
    expect(friendRungs(true)).toEqual({ met: 1, friend: 2, best: 4 });
  });

  it('defaults to the base ladder when no options are passed', () => {
    expect(friendRungCrossed(2, 3)).toBe('friend');
    expect(friendRungCrossed(1, 2)).toBe(null);
  });

  it('returns null when the greet count did not move, in both states', () => {
    // before === after is what a greet rejected by recordGreet's per-walk
    // dedup guard looks like from the call site. It must stay silent whether
    // or not Charmer is earned — a skill may not conjure a rung out of a
    // greet that was never recorded.
    for (const charmer of [false, true]) {
      expect(friendRungCrossed(0, 0, { charmer })).toBe(null);
      expect(friendRungCrossed(5, 5, { charmer })).toBe(null);
      expect(friendRungCrossed(6, 5, { charmer })).toBe(null); // never runs backwards
    }
  });

  it('reports one rung, the highest, when a step crosses two at once', () => {
    // A cat already at 3 greets when Charmer unlocks is past the new ♥ rung
    // (2) and one greet short of the new 💕 rung (4): the next greet must
    // toast 'best' once, not backdate a second 'friend'.
    expect(friendRungCrossed(3, 4, { charmer: true })).toBe('best');
    expect(friendRungCrossed(0, 6, { charmer: false })).toBe('best');
  });

  it('stops reporting rungs once the ladder is topped out', () => {
    for (const charmer of [false, true]) {
      expect(friendRungCrossed(9, 10, { charmer })).toBe(null);
    }
  });
});

describe('Charmer does not change how fast greets accrue', () => {
  // Replays awardStrayGreet's greet-recording sequence against the REAL
  // progression module: the prompt layer only offers an ungreeted stray
  // (nearest(..., {ungreetedOnly:true})), and recordGreet dedups on the
  // walkStamp. Both guards are outside Charmer's reach, and this asserts it.
  function walkGreetingHard(skills, { attempts = 25, walks = 1 } = {}) {
    const p = createProgression(fakeStorage());
    p.state.skills = skills;
    const scene = fakeScene();
    const cats = createStrayCats(scene, AREA, 1);
    const stray = cats.strays[0];
    const at = stray.group.position.clone();
    const rungs = [];

    for (let w = 0; w < walks; w++) {
      const walkStamp = `walk-${w}`;
      stray.greeted = false; // a fresh walk re-offers the cat exactly once
      for (let i = 0; i < attempts; i++) {
        // The prompt scan: mashing E only produces a greet while the cat is
        // still surfaced as ungreeted.
        if (cats.nearest(at, 2.5, { ungreetedOnly: true }) !== stray) continue;
        cats.greet(stray, at);
        const before = p.state.friends[stray.name]?.greets ?? 0;
        p.recordGreet(stray.name, stray.breed, walkStamp);
        const after = p.state.friends[stray.name]?.greets ?? 0;
        rungs.push(friendRungCrossed(before, after, {
          charmer: hasSkill(p.state, 'charmer'),
        }));
      }
    }
    return { greets: p.state.friends[stray.name]?.greets ?? 0, rungs };
  }

  it('records exactly one greet per stray per walk with or without Charmer', () => {
    const plain = walkGreetingHard([], { attempts: 25, walks: 6 });
    const charmed = walkGreetingHard(['charmer'], { attempts: 25, walks: 6 });
    expect(plain.greets).toBe(6);          // 25 attempts a walk, still one greet a walk
    expect(charmed.greets).toBe(plain.greets); // THE constraint: identical accrual
  });

  it('reaches ♥ and 💕 on earlier walks with Charmer, on the same greet budget', () => {
    const plain = walkGreetingHard([], { walks: 6 });
    const charmed = walkGreetingHard(['charmer'], { walks: 6 });
    expect(plain.rungs).toEqual(['met', null, 'friend', null, null, 'best']);
    expect(charmed.rungs).toEqual(['met', 'friend', null, 'best', null, null]);
  });

  // v18 CF-4, in one assertion. The in-walk toast is driven by
  // friendRungCrossed; the home-base roster icon (ui/homebase.js) and the
  // best-friend gift roll (game/walk.js) are driven by friendLevel. They ran
  // off two independent rung tables, so a Charmer player was told "BEST
  // friend 💕" on greet four for a cat both other readers still called ♥.
  it('friendLevel always agrees with the rung the toast just announced', () => {
    for (const skills of [[], ['charmer']]) {
      const p = createProgression(fakeStorage());
      p.state.skills = skills;
      const cats = createStrayCats(fakeScene(), AREA, 1);
      const stray = cats.strays[0];
      let announced = 'none'; // the highest rung the player has been told about
      for (let w = 0; w < 6; w++) {
        const before = p.state.friends[stray.name]?.greets ?? 0;
        p.recordGreet(stray.name, stray.breed, `walk-${w}`);
        const after = p.state.friends[stray.name]?.greets ?? 0;
        announced = friendRungCrossed(before, after, {
          charmer: hasSkill(p.state, 'charmer'),
        }) ?? announced;
        expect(p.friendLevel(stray.name)).toBe(announced);
      }
    }
  });

  it('an unearned charmer id in the save does not unlock the shorter ladder', () => {
    // hasSkill accepts a persisted id, so this pins the gate itself: a save
    // that lists no skill and satisfies no feat must read as base rungs.
    const p = createProgression(fakeStorage());
    expect(hasSkill(p.state, 'charmer')).toBe(false);
    expect(friendRungCrossed(1, 2, { charmer: hasSkill(p.state, 'charmer') })).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// v18 Far Call ('far-call') — a meow that carries, and draws strays over.
// ---------------------------------------------------------------------------

describe('reactToMeow', () => {
  function strayAt(cats, i, x, z) {
    cats.strays[i].group.position.set(x, 0, z);
    return cats.strays[i];
  }

  it('without Far Call reaches 8m and no further, exactly as before', () => {
    const cats = createStrayCats(fakeScene(), AREA, 3);
    const near = strayAt(cats, 0, 0, 5);
    const edge = strayAt(cats, 1, 0, 9);
    const gone = strayAt(cats, 2, 0, 30);
    for (const s of cats.strays) { s.state = 'idle'; s.target = null; }

    expect(cats.reactToMeow(new THREE.Vector3(0, 0, 0))).toBe(1);
    expect(near.state).toBe('greet');
    expect(edge.state).toBe('idle');
    expect(gone.state).toBe('idle');
    expect(edge.target).toBe(null);
  });

  it('with Far Call draws strays in the outer band toward the caller', () => {
    const cats = createStrayCats(fakeScene(), AREA, 2);
    const near = strayAt(cats, 0, 0, 5);
    const far = strayAt(cats, 1, 0, 15);
    for (const s of cats.strays) { s.state = 'idle'; s.target = null; }
    const pos = new THREE.Vector3(0, 0, 0);

    expect(cats.reactToMeow(pos, { far: true })).toBe(2);
    expect(near.state).toBe('greet');   // close-range behaviour is unchanged
    expect(far.state).toBe('wander');
    expect(far.target).not.toBe(null);
    // Heads for a standoff just short of the caller, not on top of them.
    expect(far.target.distanceTo(pos)).toBeGreaterThan(0);
    expect(far.target.distanceTo(pos)).toBeLessThan(2.5);
    expect(far.target.distanceTo(pos)).toBeLessThan(far.group.position.distanceTo(pos));
  });

  it('with Far Call still ignores strays past the extended reach', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1);
    const s = strayAt(cats, 0, 0, 40);
    s.state = 'idle';
    s.target = null;
    expect(cats.reactToMeow(new THREE.Vector3(0, 0, 0), { far: true })).toBe(0);
    expect(s.state).toBe('idle');
  });

  it('a Far Call draw actually closes the distance over time', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1);
    const s = strayAt(cats, 0, 0, 15);
    s.personality = 'bold'; // shy strays may scurry first; not what is under test
    const pos = new THREE.Vector3(0, 0, 0);
    const d0 = s.group.position.distanceTo(pos);
    cats.reactToMeow(pos, { far: true });
    for (let i = 0; i < 100; i++) cats.update(0.05, i * 0.05, pos, NO_OPTS);
    expect(s.group.position.distanceTo(pos)).toBeLessThan(d0);
  });

  it('never marks a stray greeted — a meow is not a greet vector', () => {
    // The whole anti-farming story rests on `greeted`: it is what stops
    // nearest(..., {ungreetedOnly:true}) re-offering a cat that already paid
    // out its one friendship award. Far Call moves cats and nothing else, so
    // meowing across a walk must leave every one of them still greetable.
    const cats = createStrayCats(fakeScene(), AREA, 4);
    const pos = new THREE.Vector3(0, 0, 0);
    for (const s of cats.strays) s.group.position.set(0, 0, 3 + cats.strays.indexOf(s) * 4);
    for (let i = 0; i < 50; i++) {
      cats.reactToMeow(pos, { far: true });
      cats.reactToMeow(pos);
    }
    for (const s of cats.strays) expect(s.greeted).toBe(false);
    expect(cats.nearest(new THREE.Vector3(0, 0, 3), 2.5, { ungreetedOnly: true })).not.toBe(null);
  });

  it('keeps Far Call targets inside the area bounds', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1);
    // Caller in the far corner, stray out in the band: the standoff point
    // lands outside the playable inset and must be clamped back in.
    const s = strayAt(cats, 0, -49, -34);
    cats.reactToMeow(new THREE.Vector3(-49, 0, -49), { far: true });
    expect(s.target.x).toBeGreaterThanOrEqual(AREA.bounds.minX + 2);
    expect(s.target.z).toBeGreaterThanOrEqual(AREA.bounds.minZ + 2);
  });
});

// ===========================================================================
// v20 "Ruffled Fur" — the stray half of the enemy system.
//
// src/enemies.js owns the rules and has its own suite. What is under test
// here is everything that module explicitly cannot do: telling one cat object
// from another (the strays-only rule), carrying a persisted grudge onto the right stray at walk
// start, and the two live transitions the world half performs.
// ===========================================================================

// nametag.js guards on `document`, so in a plain node test run makeNameTag
// returns null and there is no tag to inspect. This is test/nametag.test.js's
// fake, trimmed to the ops straycats.js actually depends on — it is what lets
// the reveal-range and repaint wiring below be asserted at all, and that
// wiring is exactly the CF-10 failure shape (a fully built ability that no
// call site ever activates) these tests exist to catch.
function fakeCtx() {
  return {
    font: '', textAlign: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
    clearRect() {}, beginPath() {}, roundRect() {}, rect() {}, fill() {},
    stroke() {}, fillText() {},
    measureText: (s) => ({ width: String(s).length * 18 }),
  };
}

function withFakeDocument(fn) {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0, ctx: fakeCtx() };
      canvas.getContext = () => canvas.ctx;
      return canvas;
    },
  };
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

describe('the strays-only rule — only strays can ever bear a grudge', () => {
  it('shares not one name with any player avatar, so no family pet is a stray', () => {
    // THE vocabulary half of the guard, pinned against the REAL catalog
    // rather than a hand-copied list of names, so it cannot rot: adding
    // a stray name to the family catalog, or a new family pet whose name is already a stray
    // name, fails here rather than shipping a cat that can scratch its own
    // child.
    const avatarNames = Object.values(CATALOG.cats).map((c) => c.name);
    expect(avatarNames).toContain('Zeetoo');   // the list really is the family pets
    expect(avatarNames).toContain('Hagrid');
    expect(avatarNames).toContain('D2');
    expect(avatarNames).toContain('Digit');
    for (const name of avatarNames) expect(CAT_NAMES).not.toContain(name);
    // The gate also admits KIT_NAMES and LEGENDARY_NAMES, so they must be
    // disjoint from avatars too.
    for (const name of avatarNames) expect(KIT_NAMES).not.toContain(name);
    for (const name of avatarNames) expect(LEGENDARY_NAMES).not.toContain(name);
  });

  it('admits a kit-named colony cat cast onto a walk', () => {
    const kit = KIT_NAMES[0];
    const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(7), { colonyCats: [{ name: kit, x: 5, z: 6, wear: null }] });
    const cast = cats.strays.find((s) => s.name === kit);
    expect(cast).toBeTruthy();
    expect(isGrudgeableStray(cats, cast)).toBe(true);
  });

  it('lets a kit be fed past its first feed on a later walk', () => {
    const kit = KIT_NAMES[0];
    const mom = { area: 'park', x: 5, z: 6 };
    let colony = feedCat(emptyColony(), { name: kit, by: 'aaaaaaaa-1111', walk: 'walk-1000', head: 0, ...mom }).colony;
    expect(tamingProgress(colony, kit).have).toBe(1);
    const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(7), { colonyCats: colony.cats });
    const cast = cats.strays.find((s) => s.name === kit);
    // The walk's feed scan requires both of these.
    expect(isGrudgeableStray(cats, cast)).toBe(true);
    expect(canFeed(colony, kit, 'aaaaaaaa-1111', 'walk-2000')).toBe('ok');
    colony = feedCat(colony, { name: kit, by: 'aaaaaaaa-1111', walk: 'walk-2000', head: 0, ...mom }).colony;
    expect(tamingProgress(colony, kit).have).toBe(2);
  });

  it('accepts a real stray out of this walk', () => {
    const cats = createStrayCats(fakeScene(), AREA, 3);
    for (const s of cats.strays) expect(isGrudgeableStray(cats, s)).toBe(true);
  });

  it('refuses a ghost or remote pet even when it carries a stray name', () => {
    // THE identity half. Ghost visitors and co-walkers' pets share
    // makeNameTag and a name-shaped API with strays, and their pet names are
    // player-chosen — so one can legitimately be called 'Pickles'. Nothing
    // but membership of this walk's stray array may make a cat rollable.
    const cats = createStrayCats(fakeScene(), AREA, 3);
    const ghost = { name: 'Pickles', petName: 'Pickles', group: cats.strays[0].group };
    expect(isGrudgeableStray(cats, ghost)).toBe(false);
    // ...and a stray from a DIFFERENT walk's list is not this walk's cat.
    const other = createStrayCats(fakeScene(), AREA, 3);
    expect(isGrudgeableStray(cats, other.strays[0])).toBe(false);
  });

  it('refuses a family pet even if one is forced into the stray array', () => {
    // Belt to the braces: the two halves are independent, so smuggling a
    // family pet past the identity half still fails the vocabulary half.
    const cats = createStrayCats(fakeScene(), AREA, 1);
    for (const name of Object.values(CATALOG.cats).map((c) => c.name)) {
      const pet = { name, group: cats.strays[0].group };
      cats.strays.push(pet);
      expect(isGrudgeableStray(cats, pet)).toBe(false);
      cats.strays.pop();
    }
  });

  it('refuses D2 and Digit by name when forced into the stray array', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1);
    for (const name of ['D2', 'Digit']) {
      const pet = { name, group: cats.strays[0].group };
      cats.strays.push(pet);
      expect(isGrudgeableStray(cats, pet)).toBe(false);
      cats.strays.pop();
    }
  });

  it('never throws on garbage', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1);
    for (const cat of [null, undefined, 'Pickles', 7, {}, { name: 42 }, { name: 'Pickles' }]) {
      expect(isGrudgeableStray(cats, cat)).toBe(false);
    }
    for (const holder of [null, undefined, {}, { strays: 'nope' }]) {
      expect(isGrudgeableStray(holder, cats.strays[0])).toBe(false);
    }
  });
});

describe('grudges carried in from the save (D1)', () => {
  // createStrayCats shuffles the 48 names, so a test that wants a specific
  // cat to be cross has to spawn first and read the names back.
  function withGrudgeOn(count, pick) {
    const first = createStrayCats(fakeScene(), AREA, count, mulberry32(7));
    const name = pick(first.strays.map((s) => s.name));
    return {
      name,
      cats: createStrayCats(fakeScene(), AREA, count, mulberry32(7), { grudges: [name] }),
    };
  }

  it('marks exactly the strays whose names the save is cross with', () => {
    const { name, cats } = withGrudgeOn(6, (names) => names[3]);
    for (const s of cats.strays) expect(s.cross).toBe(s.name === name);
  });

  it('defaults to no grudges at all, so every existing caller is unchanged', () => {
    const cats = createStrayCats(fakeScene(), AREA, 6);
    for (const s of cats.strays) expect(s.cross).toBe(false);
    // ...and a garbage grudges field reads as "none" rather than throwing.
    for (const grudges of [null, 'Pickles', 7, {}]) {
      const c = createStrayCats(fakeScene(), AREA, 3, undefined, { grudges });
      for (const s of c.strays) expect(s.cross).toBe(false);
    }
  });

  it('draws nothing from the rng, so a co-walk world is bit-identical (D4)', () => {
    // Hostility is a PRIVATE per-device fact: two co-walkers on one room seed
    // may disagree about which cats are cross, and their worlds must still
    // match cat for cat. If applying grudges ever took a draw, the co-walker
    // without them would diverge from this point on — the exact CF-7 /
    // firefly failure family.
    const plain = createStrayCats(fakeScene(), AREA, 8, mulberry32(99));
    const crossed = createStrayCats(fakeScene(), AREA, 8, mulberry32(99), {
      grudges: [plain.strays[2].name, plain.strays[5].name],
    });
    expect(crossed.strays.map((s) => s.name)).toEqual(plain.strays.map((s) => s.name));
    for (let i = 0; i < plain.strays.length; i++) {
      expect(crossed.strays[i].group.position.x).toBe(plain.strays[i].group.position.x);
      expect(crossed.strays[i].group.position.z).toBe(plain.strays[i].group.position.z);
      expect(crossed.strays[i].personality).toBe(plain.strays[i].personality);
      expect(crossed.strays[i].timer).toBe(plain.strays[i].timer);
    }
  });

  it('is born wearing the cross tag, not merely repainted a frame later', () => {
    withFakeDocument(() => {
      const { name, cats } = withGrudgeOn(6, (names) => names[1]);
      for (const s of cats.strays) {
        expect(s.tag.userData.cross).toBe(s.name === name);
        expect(s.tag.userData.revealRange).toBe(
          s.name === name ? CROSS_NAME_TAG_RANGE : NAME_TAG_RANGE
        );
      }
    });
  });
});

describe('the grudge in the running world', () => {
  const HERE = new THREE.Vector3(0, 0, 0);

  function oneCross() {
    const cats = createStrayCats(fakeScene(), AREA, 1);
    const s = cats.strays[0];
    s.group.position.set(0, 0, 1);
    s.personality = 'bold'; // the shy scurry is a different feature
    return { cats, s };
  }

  it('offers no greet: a cross cat is skipped by the greet filter', () => {
    const { cats, s } = oneCross();
    expect(cats.nearest(HERE, 2.5, { promptable: true })).toBe(s);
    cats.turnHostile(s, HERE);
    // Still promptable — that is the reconciliation offer…
    expect(cats.nearest(HERE, 2.5, { promptable: true })).toBe(s);
    // …but never a greet.
    expect(cats.nearest(HERE, 2.5, { ungreetedOnly: true, excludeCross: true })).toBe(null);
    expect(cats.nearest(HERE, 2.5, { crossOnly: true })).toBe(s);
  });

  it('keeps a greeted, un-cross cat out of the prompt entirely', () => {
    const { cats, s } = oneCross();
    cats.greet(s, HERE);
    expect(cats.nearest(HERE, 2.5, { promptable: true })).toBe(null);
  });

  it('returns the NEAREST of a cross cat and a greetable one, either way round', () => {
    // The reason the prompt scan is one filtered call rather than two: a
    // cross cat must never shadow a friendly cat standing closer, nor the
    // reverse.
    const cats = createStrayCats(fakeScene(), AREA, 2);
    const [a, b] = cats.strays;
    a.group.position.set(0, 0, 0.5);
    cats.turnHostile(b, HERE);
    b.group.position.set(0, 0, 2.0); // put it back after the recoil step
    expect(cats.nearest(HERE, 2.5, { promptable: true })).toBe(a);
    a.group.position.set(0, 0, 2.2);
    expect(cats.nearest(HERE, 2.5, { promptable: true })).toBe(b);
  });

  it('backs away from you and marks itself greeted so E cannot be mashed', () => {
    const { cats, s } = oneCross();
    const before = s.group.position.distanceTo(HERE);
    cats.turnHostile(s, HERE);
    expect(s.cross).toBe(true);
    expect(s.greeted).toBe(true);
    expect(s.group.position.distanceTo(HERE)).toBeGreaterThan(before);
  });

  it('holds the recoil, then hands back to the wander FSM still cross', () => {
    // The animator is driven for real (update() calls it every frame); what
    // is asserted is the FSM state that SELECTS the pose, and that the hold
    // expiring does not quietly clear the grudge with it.
    const { cats, s } = oneCross();
    cats.turnHostile(s, HERE);
    for (let i = 0; i < 5; i++) cats.update(0.05, i * 0.05, FAR, NO_OPTS);
    expect(s.state).toBe('cross');
    for (let i = 0; i < 200; i++) cats.update(0.05, i * 0.05, FAR, NO_OPTS);
    expect(s.state).not.toBe('cross');
    expect(s.cross).toBe(true);      // the hold expired; the grudge did not
  });

  it('does not come when called, and does not count toward the meow reply', () => {
    const cats = createStrayCats(fakeScene(), AREA, 2);
    const [a, b] = cats.strays;
    a.group.position.set(0, 0, 3);
    b.group.position.set(0, 0, 4);
    cats.turnHostile(b, HERE);
    b.state = 'idle';
    expect(cats.reactToMeow(HERE)).toBe(1);   // only the friendly one answers
    expect(a.state).toBe('greet');
    expect(b.state).toBe('idle');
    expect(cats.reactToMeow(HERE, { far: true })).toBe(1);
  });

  it('shows its tag from three times as far, and narrows again once forgiven', () => {
    // THE wiring test the nametag suite structurally cannot write: its own
    // module has no update loop. If straycats.js goes back to a literal `< 4`
    // here, the "visible at distance" half of the indicator ships dead — the
    // CF-10 shape — and this fails.
    withFakeDocument(() => {
      const cats = createStrayCats(fakeScene(), AREA, 1);
      const s = cats.strays[0];
      s.personality = 'bold';
      s.group.position.set(0, 0, 8);   // outside 4m, inside 12m
      cats.update(0.05, 0, HERE, NO_OPTS);
      expect(s.tag.visible).toBe(false);
      cats.turnHostile(s, HERE);
      s.group.position.set(0, 0, 8);   // the recoil moved it; put it back
      cats.update(0.05, 0.05, HERE, NO_OPTS);
      expect(s.tag.visible).toBe(true);
      expect(s.tag.userData.revealRange).toBe(CROSS_NAME_TAG_RANGE);
      cats.forgive(s, HERE);
      s.group.position.set(0, 0, 8);
      cats.update(0.05, 0.1, HERE, NO_OPTS);
      expect(s.tag.visible).toBe(false);
      expect(s.tag.userData.revealRange).toBe(NAME_TAG_RANGE);
    });
  });

  it('repaints the tag in place on both transitions — same sprite, same canvas', () => {
    // The payoff beat. Rebuilding the sprite would strand the old texture and
    // drop the parenting; the whole point of setNameTagMood is that it does
    // not.
    withFakeDocument(() => {
      const cats = createStrayCats(fakeScene(), AREA, 1);
      const s = cats.strays[0];
      const tag = s.tag;
      const canvas = tag.userData.tagCanvas;
      expect(tag.userData.cross).toBe(false);
      cats.turnHostile(s, HERE);
      expect(s.tag).toBe(tag);
      expect(tag.userData.tagCanvas).toBe(canvas);
      expect(tag.userData.cross).toBe(true);
      cats.forgive(s, HERE);
      expect(s.tag).toBe(tag);
      expect(tag.userData.tagCanvas).toBe(canvas);
      expect(tag.userData.cross).toBe(false);
    });
  });

  it('becomes greetable again the moment it is forgiven', () => {
    const { cats, s } = oneCross();
    cats.turnHostile(s, HERE);
    s.group.position.set(0, 0, 1);
    expect(cats.nearest(HERE, 2.5, { ungreetedOnly: true, excludeCross: true })).toBe(null);
    cats.forgive(s, HERE);
    expect(s.cross).toBe(false);
    expect(s.greeted).toBe(false);
    expect(cats.nearest(HERE, 2.5, { ungreetedOnly: true, excludeCross: true })).toBe(s);
  });

  it('never leaves the area bounds however hard it recoils', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1);
    const s = cats.strays[0];
    s.group.position.set(AREA.bounds.maxX - 0.1, 0, AREA.bounds.maxZ - 0.1);
    cats.turnHostile(s, new THREE.Vector3(0, 0, 0));
    expect(s.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
    expect(s.group.position.z).toBeLessThanOrEqual(AREA.bounds.maxZ);
    // ...and a cat standing exactly on the player still picks a bearing.
    const on = createStrayCats(fakeScene(), AREA, 1);
    on.strays[0].group.position.set(0, 0, 0);
    on.turnHostile(on.strays[0], new THREE.Vector3(0, 0, 0));
    expect(Number.isFinite(on.strays[0].group.position.x)).toBe(true);
  });

  it('wanders for hundreds of frames while cross without leaving bounds', () => {
    const cats = createStrayCats(fakeScene(), AREA, 4, mulberry32(3), {
      grudges: [],
    });
    for (const s of cats.strays) cats.turnHostile(s, new THREE.Vector3(0, 0, 0));
    for (let i = 0; i < 600; i++) cats.update(0.05, i * 0.05, FAR, NO_OPTS);
    for (const s of cats.strays) {
      expect(s.cross).toBe(true);
      expect(s.group.position.x).toBeGreaterThanOrEqual(AREA.bounds.minX);
      expect(s.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
      expect(Number.isFinite(s.group.position.z)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// v21 Stream 2, Task 6 — colony cats at fixed spots (Review Focus 2).
//
// A colony cat is a stray the siblings are taming: it must be standing at the
// spot where it was first fed, every walk, and it must cost the shared walkRng
// stream exactly what an ordinary stray costs, or a co-walk with colony cats
// would desync every system drawn after the strays.
// ---------------------------------------------------------------------------
describe('createStrayCats — colony cats (v21 Stream 2)', () => {
  const scene = fakeScene();
  const counting = () => { let n = 0; const f = () => { n++; return ((n * 0.6180339887) % 1); }; f.count = () => n; return f; };

  it('colony cats do not change how many walkRng values a spawn draws', () => {
    const a = counting(), b = counting();
    createStrayCats(scene, AREA, 22, a);
    createStrayCats(scene, AREA, 22, b, { colonyCats: [{ name: 'Pickles', x: 5, z: 6, wear: null }] });
    expect(b.count()).toBe(a.count());
  });

  it('...not even with a full colony, a worn item and a smaller count', () => {
    const many = CAT_NAMES.slice(0, 12).map((name, i) => ({ name, x: i, z: -i, wear: i % 2 ? { slot: 'collar', id: 'bell' } : null }));
    for (const count of [0, 5, 14, 22]) {
      const a = counting(), b = counting();
      createStrayCats(scene, AREA, count, a);
      createStrayCats(scene, AREA, count, b, { colonyCats: many });
      expect(b.count()).toBe(a.count());
    }
  });

  it('leaves every downstream draw where it was: the stream position after spawn is identical', () => {
    const a = mulberry32(42), b = mulberry32(42);
    createStrayCats(scene, AREA, 22, a);
    createStrayCats(scene, AREA, 22, b, { colonyCats: [{ name: 'Pickles', x: 5, z: 6, wear: null }] });
    expect(b()).toBe(a());
  });

  it('a colony cat stands at its fixed spot, once, and keeps its name', () => {
    const s = createStrayCats(scene, AREA, 22, () => 0.42, { colonyCats: [{ name: 'Pickles', x: 5, z: 6, wear: null }] });
    const p = s.strays.filter((x) => x.name === 'Pickles');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ colony: true });
    expect([p[0].home.x, p[0].home.z]).toEqual([5, 6]);
    expect([p[0].group.position.x, p[0].group.position.z]).toEqual([5, 6]);
    // Every other stray is an ordinary one, and no name appears twice.
    expect(s.strays.filter((x) => x.colony)).toHaveLength(1);
    expect(new Set(s.strays.map((x) => x.name)).size).toBe(22);
  });

  it('is at the same spot whatever the walk stream says', () => {
    for (const seed of [1, 2, 3]) {
      const s = createStrayCats(scene, AREA, 14, mulberry32(seed), { colonyCats: [{ name: 'Pickles', x: -7.5, z: 3.2, wear: null }] });
      const p = s.strays.find((x) => x.name === 'Pickles');
      expect([p.home.x, p.home.z]).toEqual([-7.5, 3.2]);
    }
  });

  it('clamps a spot outside the area into its bounds', () => {
    const s = createStrayCats(scene, AREA, 3, mulberry32(1), { colonyCats: [{ name: 'Pickles', x: 180, z: -180, wear: null }] });
    const p = s.strays.find((x) => x.name === 'Pickles');
    expect(p.home.x).toBeLessThanOrEqual(AREA.bounds.maxX);
    expect(p.home.z).toBeGreaterThanOrEqual(AREA.bounds.minZ);
    expect(p.group.position.x).toBe(p.home.x);
  });

  it('ordinary strays are never colony cats', () => {
    const s = createStrayCats(scene, AREA, 5, mulberry32(9));
    expect(s.strays.every((x) => x.colony === false)).toBe(true);
  });

  it('more colony cats than the count are truncated, never overflowing', () => {
    const many = CAT_NAMES.slice(0, 20).map((name) => ({ name, x: 0, z: 0, wear: null }));
    expect(createStrayCats(scene, AREA, 14, () => 0.3, { colonyCats: many }).strays).toHaveLength(14);
  });

  it('a shy name is shy, and any other colony cat is never shy', async () => {
    const { isShy } = await import('../src/colony.js');
    const shy = CAT_NAMES.find((n) => isShy(n));
    const bold = CAT_NAMES.filter((n) => !isShy(n)).slice(0, 8);
    // The shy cat is shy by NAME, whatever it rolls; every other colony cat
    // has a rolled 'shy' mapped to 'bold', so it never runs from you.
    const s = createStrayCats(scene, AREA, 9, () => 0, {
      colonyCats: [shy, ...bold].map((name) => ({ name, x: 1, z: 1, wear: null })),
    });
    expect(s.strays.find((x) => x.name === shy).personality).toBe('shy');
    for (const name of bold) expect(s.strays.find((x) => x.name === name).personality).not.toBe('shy');
  });

  it('drops a colony entry whose name is not a stray name', () => {
    const s = createStrayCats(scene, AREA, 4, mulberry32(2), {
      colonyCats: [{ name: 'Zeetoo', x: 1, z: 1, wear: null }, { name: 'Pickles', x: 2, z: 2, wear: null }],
    });
    expect(s.strays.map((x) => x.name)).not.toContain('Zeetoo');
    expect(s.strays.filter((x) => x.colony).map((x) => x.name)).toEqual(['Pickles']);
  });

  // Fix round 1: on a colony walk EVERY colony name (tamed, or found in
  // another area) is kept out of the ordinary shuffle tail, so a cat waiting
  // in the den, or one whose fixed spot is in another area, never wanders in
  // here at a random spot. game/walk.js passes `excludeNames` only on a
  // colony walk; off one the cast is exactly as before.
  it('excluded names never appear in the cast, at any count or seed', () => {
    const tamed = 'Marmalade', elsewhere = 'Noodle';
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const count of [14, 22, 30]) {   // real walks spawn 14 or 22
        const s = createStrayCats(scene, AREA, count, mulberry32(seed), {
          colonyCats: [{ name: 'Pickles', x: 5, z: 6, wear: null }],
          excludeNames: [tamed, elsewhere, 'Pickles'],
        });
        const names = s.strays.map((x) => x.name);
        expect(names).not.toContain(tamed);
        expect(names).not.toContain(elsewhere);
        expect(names.filter((n) => n === 'Pickles')).toHaveLength(1);   // the colony cat itself still comes
      }
    }
  });

  it('excluding names does not change how many walkRng values a spawn draws', () => {
    const many = CAT_NAMES.slice(0, 12);
    for (const count of [0, 14, 22]) {
      const a = counting(), b = counting();
      createStrayCats(scene, AREA, count, a);
      createStrayCats(scene, AREA, count, b, { colonyCats: [{ name: many[0], x: 1, z: 1, wear: null }], excludeNames: many });
      expect(b.count()).toBe(a.count());
    }
  });

  it('without excludeNames the ordinary cast is exactly as before (a non-partner room)', () => {
    const a = createStrayCats(scene, AREA, 22, mulberry32(8));
    const b = createStrayCats(scene, AREA, 22, mulberry32(8), { excludeNames: [] });
    expect(b.strays.map((x) => x.name)).toEqual(a.strays.map((x) => x.name));
  });

  it('nearest honours a where filter', () => {
    const s = createStrayCats(scene, AREA, 2, mulberry32(4));
    const [near, far] = s.strays;
    near.group.position.set(0, 0, 1);
    far.group.position.set(0, 0, 2);
    const here = new THREE.Vector3(0, 0, 0);
    expect(s.nearest(here, 5)).toBe(near);
    expect(s.nearest(here, 5, { where: (x) => x !== near })).toBe(far);
    expect(s.nearest(here, 5, { where: () => false })).toBe(null);
  });
});

// The walkRng guard. shuffled(CAT_NAMES, rng) consumes CAT_NAMES.length - 1
// draws; changing this number shifts the stray stream (every stray's spot after it).
describe('reserved kit names', () => {
  it('CAT_NAMES is still exactly 48 names', () => {
    expect(CAT_NAMES.length).toBe(48);
  });

  it('kit names are a separate, disjoint, validated block', () => {
    expect(KIT_NAMES.length).toBe(12);
    expect(new Set(KIT_NAMES).size).toBe(12);
    for (const n of KIT_NAMES) expect(CAT_NAMES).not.toContain(n);
  });

  // docs/supabase-colony.sql's feed RPC rejects any name not matching
  // ^[A-Za-z][A-Za-z ]{0,23}$ (a letter first, then letters/spaces, 24 max: no
  // hyphens, apostrophes or digits). A name the server would refuse must fail
  // here, not silently on a child's device.
  it('every cat, kit and legendary name obeys the feed RPC name regex', () => {
    const RPC_NAME = /^[A-Za-z][A-Za-z ]{0,23}$/;
    expect(LEGENDARY_NAMES).toHaveLength(4);
    for (const n of [...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES]) expect(n).toMatch(RPC_NAME);
  });

  // The clan layer shows prefix + rank suffix, derived from the stored name.
  // Distinct prefixes keep siblings distinct at kit, paw and warrior rank; a
  // kit that is itself a prefix word, or whose prefix is another kit's stored
  // name, would shadow or echo another cat on screen.
  it('kit names derive distinct, non-colliding clan prefixes', () => {
    expect(new Set(KIT_NAMES.map(prefixFor)).size).toBe(12);
    for (const n of KIT_NAMES) expect(PREFIXES).not.toContain(n);
    for (const n of [...CAT_NAMES, ...KIT_NAMES]) expect(Object.values(CAT_PREFIXES)).not.toContain(n);
    for (const n of KIT_NAMES) expect(KIT_NAMES).not.toContain(prefixFor(n));
  });

  it('isStrayName accepts a kit name and still rejects a stranger', () => {
    for (const n of KIT_NAMES) expect(isStrayName(n)).toBe(true);
    for (const bad of ['Stranger', '__proto__', '', null, 42, {}]) expect(isStrayName(bad)).toBe(false);
  });

  it('strayBreed is total over kit names', () => {
    for (const n of KIT_NAMES) expect(STRAY_BREEDS).toContain(strayBreed(n));
  });

  it('a kit name never joins a walk as an ordinary stray', () => {
    const kits = new Set(KIT_NAMES);
    for (const seed of [1, 7, 22, 99]) {
      const { strays } = createStrayCats(fakeScene(), AREA, 22, mulberry32(seed));
      for (const s of strays) expect(kits.has(s.name)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// v21 3b Task 18 — a legendary cat, added AFTER the ordinary cast and drawn
// from its own rng. walkRng must not feel it: the stream position after spawn
// is still 47 + 5 * count, extra or no extra.
// ---------------------------------------------------------------------------
describe('createStrayCats — a legendary extra (v21 3b)', () => {
  const counting = () => { let n = 0; const f = () => { n++; return ((n * 0.6180339887) % 1); }; f.count = () => n; return f; };
  const legend = (name = 'Captain Barnacle', seed = 5) => ({ name, rng: mulberry32(seed) });
  const glowsIn = (group) => group.children.filter((o) => o.userData?.legendGlow);

  it('a legendary extra draws nothing from the walk rng', () => {
    for (const count of [0, 14, 22]) {
      const a = counting(), b = counting();
      createStrayCats(fakeScene(), AREA, count, a);
      createStrayCats(fakeScene(), AREA, count, b, {
        extras: [legend()],
        colonyCats: [{ name: 'Pickles', x: 1, z: 1, wear: null }],
      });
      expect(a.count()).toBe(47 + 5 * count);
      expect(b.count()).toBe(47 + 5 * count);
    }
    // ...and the next value off a seeded stream is where it always was.
    const a = mulberry32(42), b = mulberry32(42);
    createStrayCats(fakeScene(), AREA, 22, a);
    createStrayCats(fakeScene(), AREA, 22, b, { extras: [legend()] });
    expect(b()).toBe(a());
  });

  it('draws all five of its spawn values from its own rng, in order', () => {
    const own = counting();
    createStrayCats(fakeScene(), AREA, 3, mulberry32(1), { extras: [{ name: 'Duchess', rng: own }] });
    expect(own.count()).toBe(5);
  });

  it('the ordinary cast is untouched by an extra', () => {
    const a = createStrayCats(fakeScene(), AREA, 22, mulberry32(8));
    const b = createStrayCats(fakeScene(), AREA, 22, mulberry32(8), { extras: [legend()] });
    expect(b.strays.slice(0, 22).map((s) => [s.name, s.group.position.x, s.group.position.z, s.personality]))
      .toEqual(a.strays.map((s) => [s.name, s.group.position.x, s.group.position.z, s.personality]));
    expect(b.strays).toHaveLength(23);
    expect(b.strays[22].name).toBe('Captain Barnacle');
  });

  it('partners see it at the same spot: its place is a function of its own rng alone', () => {
    const one = createStrayCats(fakeScene(), AREA, 22, mulberry32(3), { extras: [legend('Duchess', 99)] });
    const two = createStrayCats(fakeScene(), AREA, 14, () => 0.5, { extras: [legend('Duchess', 99)], roomSeed: 7 });
    const [p, q] = [one, two].map((c) => c.strays.find((s) => s.name === 'Duchess'));
    expect([q.group.position.x, q.group.position.z, q.group.rotation.y, q.timer])
      .toEqual([p.group.position.x, p.group.position.z, p.group.rotation.y, p.timer]);
    expect(p.home.x).toBe(p.group.position.x);
    expect(Math.abs(p.group.position.x)).toBeLessThanOrEqual(AREA.bounds.maxX);
  });

  it('a legendary extra is a real, grudgeable, feedable stray', () => {
    const cats = createStrayCats(fakeScene(), AREA, 4, mulberry32(2), { extras: [legend()] });
    const s = cats.strays.find((x) => x.name === 'Captain Barnacle');
    expect(s).toBeTruthy();
    expect(isGrudgeableStray(cats, s)).toBe(true);      // the identity half: a real entry in strays
    expect(s.colony).toBe(false);
    expect(s.personality).not.toBe('shy');               // isShy(name) is false, so never shy
    expect(Object.keys(s)).not.toContain('legendary');   // no stored per-cat field
    expect(new Set(cats.strays.map((x) => x.id)).size).toBe(5);
    // Feedable through the ordinary path, from its home.
    const r = feedCat(emptyColony(), { name: s.name, by: 'aaaaaaaa-1111', walk: 'walk-1000', area: 'seaside', x: s.home.x, z: s.home.z, head: 0 });
    expect(r.result).toBe('ok');
    expect(canFeed(r.colony, s.name, 'aaaaaaaa-1111', 'walk-1001')).toBe('ok');
    // It wanders on its own stream, like every stray.
    for (let i = 0; i < 300; i++) cats.update(0.05, i * 0.05, FAR, NO_OPTS);
    expect(Number.isFinite(s.group.position.x)).toBe(true);
  });

  it('wears a gold glow under it and a star on its tag; nobody else does', () => {
    withFakeDocument(() => {
      const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(4), { extras: [legend()] });
      const s = cats.strays.find((x) => x.name === 'Captain Barnacle');
      expect(s.tag.userData.tagName).toBe('Captain Barnacle');
      expect(s.tag.userData.legend).toBe(true);        // nametag.js draws the gold star
      const glows = glowsIn(s.group);
      expect(glows).toHaveLength(1);
      const [g] = glows;
      expect(g.geometry.type).toBe('CircleGeometry');
      expect(g.geometry.parameters.radius).toBeCloseTo(0.95);
      expect(g.material.type).toBe('MeshBasicMaterial');
      expect(g.material.transparent).toBe(true);
      expect(g.material.depthWrite).toBe(false);
      expect(g.userData.contactDecal).toBe(true);    // the shadow sweep leaves it alone
      expect(g.rotation.x).toBeCloseTo(-Math.PI / 2); // flat on the ground
      // R41: above the contact shadow (renderOrder -1 at y 0.015, depthWrite
      // off) and below every other transparent (renderOrder 0), a hair higher
      // with its own polygon offset.
      expect(g.renderOrder).toBeGreaterThan(-1);
      expect(g.renderOrder).toBeLessThan(0);
      expect(g.position.y * 0.85).toBeGreaterThan(0.015);
      expect(g.position.y * 0.85).toBeLessThan(0.04);  // still under the water surfaces
      expect(g.material.polygonOffset).toBe(true);
      // A plateau of deep gold, not a fade from the (cat-covered) centre: a
      // texel halfway out is still near-opaque, the rim is clear.
      const { data, width } = g.material.map.image;
      const alphaAt = (fx) => data[((width / 2) * width + Math.floor(fx * (width - 1))) * 4 + 3];
      expect(alphaAt(0.5 + 0.25)).toBeGreaterThan(200);   // half the radius out
      expect(alphaAt(0.999)).toBeLessThan(10);              // the rim
      expect(g.material.map.name).not.toMatch(/^surface:/); // freed by endWalk's traversal, once
      // A child of the cat: it follows the cat with no per-frame code, and
      // endWalk's scene traversal frees it exactly once with the cat.
      expect(g.parent).toBe(s.group);
      for (const o of cats.strays.filter((x) => x !== s)) {
        expect(glowsIn(o.group)).toHaveLength(0);
        expect(o.tag.userData.tagName).toBe(o.name);
        expect(o.tag.userData.legend).toBe(false);
      }
      s.group.position.set(10, 0, -3);
      const w = new THREE.Vector3();
      g.getWorldPosition(w);
      expect([w.x, w.z]).toEqual([10, -3]);
    });
  });

  it('a legendary colony cat looks the part too, without an extra', () => {
    withFakeDocument(() => {
      const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(4), {
        colonyCats: [{ name: 'Duchess', x: 2, z: 2, wear: null }],
      });
      const s = cats.strays.find((x) => x.name === 'Duchess');
      expect(s.colony).toBe(true);
      expect(s.tag.userData.legend).toBe(true);
      expect(glowsIn(s.group)).toHaveLength(1);
    });
  });

  it('a cross legendary cat keeps its star when it is forgiven', () => {
    withFakeDocument(() => {
      const cats = createStrayCats(fakeScene(), AREA, 1, mulberry32(4), { extras: [legend()], grudges: ['Captain Barnacle'] });
      const s = cats.strays.find((x) => x.name === 'Captain Barnacle');
      expect(s.cross).toBe(true);
      cats.forgive(s, new THREE.Vector3());
      expect(s.tag.userData.legend).toBe(true);
      expect(s.tag.userData.tagName).toBe('Captain Barnacle');
    });
  });

  it('the glow breathes gently and boundedly, off dt alone', () => {
    // The pure curve: bounded, smooth, periodic, total.
    const samples = Array.from({ length: 400 }, (_, k) => legendPulse(k * 0.05));
    for (const p of samples) {
      expect(p.opacity).toBeGreaterThanOrEqual(0.7);
      expect(p.opacity).toBeLessThanOrEqual(1);
      expect(p.scale).toBeGreaterThanOrEqual(0.94);
      expect(p.scale).toBeLessThanOrEqual(1.06);
    }
    const ops = samples.map((p) => p.opacity);
    expect(Math.max(...ops) - Math.min(...ops)).toBeGreaterThan(0.2);   // it does pulse
    for (let k = 1; k < samples.length; k++) expect(Math.abs(ops[k] - ops[k - 1])).toBeLessThan(0.05);  // gently
    for (const bad of [NaN, Infinity, undefined]) expect(legendPulse(bad)).toEqual({ opacity: 1, scale: 1.05 });
    // Wired into update(): the same dt sequence gives the same glow, and
    // nothing random is drawn for it.
    const run = () => {
      const cats = createStrayCats(fakeScene(), AREA, 2, mulberry32(4), { extras: [legend()], roomSeed: 9 });
      const g = glowsIn(cats.strays.find((x) => x.name === 'Captain Barnacle').group)[0];
      const seen = [];
      for (let i = 0; i < 40; i++) { cats.update(0.05, i * 0.05, FAR, NO_OPTS); seen.push([g.material.opacity, g.scale.x]); }
      return seen;
    };
    const a = run();
    expect(run()).toEqual(a);
    expect(new Set(a.map(([o]) => o)).size).toBeGreaterThan(10);
    const at = legendPulse(40 * 0.05);
    expect(a.at(-1)[0]).toBeCloseTo(at.opacity);
    expect(a.at(-1)[1]).toBeCloseTo(at.scale);
    // A walk with no legendary cat has nothing to pulse and is untouched.
    const plain = createStrayCats(fakeScene(), AREA, 2, mulberry32(4));
    expect(() => plain.update(0.05, 0, FAR, NO_OPTS)).not.toThrow();
  });

  it('with reduced motion the glow holds still at the top of its breath', () => {
    const top = legendPulse(0);
    expect(top).toEqual({ opacity: 1, scale: 1.05 });
    const cats = createStrayCats(fakeScene(), AREA, 2, mulberry32(4), { extras: [legend()], roomSeed: 9, reducedMotion: true });
    const g = glowsIn(cats.strays.find((x) => x.name === 'Captain Barnacle').group)[0];
    for (let i = 0; i < 80; i++) {
      cats.update(0.05, i * 0.05, FAR, NO_OPTS);
      expect(g.material.opacity).toBe(top.opacity);
      expect(g.scale.x).toBeCloseTo(top.scale, 12);
    }
    // and the walk passes the setting in
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    const call = src.slice(src.indexOf('const strayCats = createStrayCats('), src.indexOf('});', src.indexOf('const strayCats = createStrayCats(')));
    expect(call).toMatch(/\breducedMotion,/);
  });

  it('only a legendary name with a real rng is ever an extra, and never twice', () => {
    const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(4), {
      colonyCats: [{ name: 'Duchess', x: 2, z: 2, wear: null }],
      extras: [
        { name: 'Pickles', rng: mulberry32(1) },        // an ordinary stray name
        { name: 'Zeetoo', rng: mulberry32(1) },         // a family pet
        { name: 'Lord Lantern' },                       // no rng
        { name: 'Lord Lantern', rng: 'nope' },
        null, 7,
        { name: 'Duchess', rng: mulberry32(1) },        // already cast as a colony cat
        legend('Professor Whiskers'), legend('Professor Whiskers'),
      ],
    });
    const names = cats.strays.map((s) => s.name);
    expect(names.filter((n) => n === 'Duchess')).toHaveLength(1);
    expect(names.filter((n) => n === 'Professor Whiskers')).toHaveLength(1);
    expect(names).not.toContain('Zeetoo');
    expect(names).not.toContain('Lord Lantern');
    expect(cats.strays).toHaveLength(4);
    for (const bad of [undefined, null, 'x', {}]) {
      expect(createStrayCats(fakeScene(), AREA, 2, mulberry32(4), { extras: bad }).strays).toHaveLength(2);
    }
  });

  it('dispose takes the extra out of the scene with everyone else', () => {
    const scene = fakeScene();
    const cats = createStrayCats(scene, AREA, 2, mulberry32(4), { extras: [legend()] });
    expect(scene.objects.size).toBe(3);
    cats.dispose();
    expect(scene.objects.size).toBe(0);
  });
});

// The walk-level guard, as a text slice: a co-walk with a non-partner must
// behave exactly as it does today, so the roll and the extra live entirely
// behind colonyWalk (solo, or partner-only) and never in the den.
describe('game/walk.js — where a legendary cat may appear', () => {
  const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');

  it('a walk with a non-partner never passes extras', () => {
    const decide = src.indexOf('const legend = colonyWalk && !isDen ? legendaryFor(');
    expect(decide).toBeGreaterThan(-1);
    // One roll, and only inside that guard.
    expect(src.split('legendaryRoll(').length - 1).toBe(1);
    expect(src.indexOf('legendaryRoll(roomSeed)')).toBeGreaterThan(decide);
    expect(src.indexOf('legendaryRoll(roomSeed)')).toBeLessThan(src.indexOf('\n', decide));
    // Ruling R40: a room walk decides on shared data only.
    expect(src.slice(decide, src.indexOf('\n', decide))).toContain('{ shared: roomSeed !== undefined }');
    // The extra list is empty unless the legend or the wanderer is there,
    // and the legend wins: the wanderer is the else-branch of that one expression.
    expect(src).toContain('const extras = legend ? [');
    const exStart = src.indexOf('const extras = legend ? [');
    expect(src).toMatch(/const extras = legend \? \[\{[\s\S]*?\}\] : wanderSpot \? \[\{[\s\S]*?\}\] : \[\];/);
    // ...and it is what createStrayCats is handed.
    const call = src.indexOf('const strayCats = createStrayCats(');
    expect(call).toBeGreaterThan(decide);
    expect(src.slice(call, src.indexOf('});', call))).toMatch(/\n\s+extras,\n/);
    // The wanderer comes only from walkWanderer, with no walkRng between it and the call.
    const wander = src.indexOf('walkWanderer(state, areaId, {');
    expect(wander).toBeGreaterThan(-1);
    expect(wander).toBeLessThan(call);
    expect(src.slice(wander, call)).not.toContain('walkRng');
    // Its spot (ruling R3): clan ground, away from the camp, off the as-built map.
    const spotLine = src.slice(src.indexOf('const wanderSpot = '), src.indexOf(';\n', src.indexOf('const wanderSpot = ')));
    expect(spotLine).toContain('wanderSpotFor(');
    expect(spotLine).toContain('clanWalkableFor(');
    expect(spotLine).toContain('clearSpot(wanderStart(areaData.spawn)');
    // Each extra's own rng: mulberry32 over its name and the room seed, never walkRng.
    const ex = src.slice(exStart, call);
    expect(ex).toContain('mulberry32((seedFromCode(legend) ^ (roomSeed ?? ');
    expect(ex).toContain('mulberry32((seedFromCode(wanderName) ^ (roomSeed ?? ');
    expect(ex).not.toContain('walkRng');
    // Ruling R2 (amended): the wanderer takes an ordinary loner's slot, never
    // a colony cat's, and only when it is passed.
    const callText = src.slice(call, src.indexOf('});', call));
    expect(callText).toContain('createStrayCats(scene, areaData, strayCount, strayStream(roomSeed ?? soloSeed)');
    expect(src).toContain('const loners = isDen ? 0 : lonersFor(areaId, tier.strays, fedHere);');
    // (On the lite rung, quality.js LITE, the loners are first raised to her
    // colony's size here, so no fed cat is dropped; every other rung passes
    // `loners` as it is.)
    expect(src).toContain('const strayCount = wanderStrayCount(tier.keepFedCats ? Math.max(loners, fedHere) : loners, fedHere, !!wanderSpot);');
    // Kittypets are kept out of a territory's ordinary cast on every walk.
    const excl = src.slice(src.indexOf('const excludeNames = '), src.indexOf(';\n', src.indexOf('const excludeNames = ')));
    expect(excl).toContain('territoryCastExcludes(areaId)');
    // And none of it inside the rival's slice.
    const slice = src.slice(src.indexOf("The rival's border and its patrol"), src.indexOf('session.rival = {'));
    expect(slice).not.toMatch(/legend|wander/i);
  });

  it('the arrival line: only when the wanderer was spawned, in Clan Edition, and not already in the colony', () => {
    // Final review, finding 2: the line is kept on the session, not toasted
    // under the Ready? card; main.js toasts it once the walk starts.
    const setArea = src.indexOf('hud.setArea(');
    const keep = src.indexOf('session.arrivalLine = ');
    expect(keep).toBeGreaterThan(setArea);
    const line = src.slice(keep, src.indexOf(';\n', keep));
    expect(line).toContain('strayCats.strays.some((s) => s.wanderer)');
    expect(line).toContain('isClanEdition(progression.state)');
    expect(line).toContain('!state.colony?.cats?.some((c) => c.name === wanderName)');
    expect(line).toContain('wanderArrivalLine(wanderName) : null');
    expect(src).not.toContain('hud.toast(wanderArrivalLine(');
    expect(src.split('wanderArrivalLine(').length - 1).toBe(1);
    // main.js toasts it once, on the first engage after Ready? (pointer lock
    // or the touch engage both emit player:lockchange with locked: true).
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const on = main.indexOf("bus.on('player:lockchange'");
    const handler = main.slice(on, main.indexOf('});', on));
    expect(handler).toContain('if (session && locked) {');
    expect(handler).toContain('const line = takeArrivalLine(session);');
    expect(handler).toContain('if (line) hud.toast(line);');
    expect(main.split('takeArrivalLine(').length - 1).toBe(1);
  });
});

// Island Task 3: an area can name places its strays never stand. Literal
// shapes, the same numbers the Pines' ISLAND_KEEP_OUT will carry.
describe('the keep-out — places a walk\'s strays never stand', () => {
  const KO = {
    rects: [{ minX: 26, maxX: 86, minZ: 8, maxZ: 66 }, { minX: 0, maxX: 30, minZ: 5, maxZ: 44 }],
    capsules: [{ x1: 20.56, z1: 18.08, x2: 10.0, z2: 4.0, r: 1.5 }],
    margin: 0.6,
  };
  const KO_AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, keepOut: KO };
  const EPS = 1e-9;
  function outside(x, z) {
    for (const r of KO.rects) {
      const dx = Math.max(r.minX - x, 0, x - r.maxX);
      const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
      if (Math.hypot(dx, dz) < KO.margin - EPS) return false;
    }
    for (const c of KO.capsules) {
      const sx = c.x2 - c.x1, sz = c.z2 - c.z1;
      const t = Math.max(0, Math.min(1, ((x - c.x1) * sx + (z - c.z1) * sz) / (sx * sx + sz * sz)));
      if (Math.hypot(x - (c.x1 + sx * t), z - (c.z1 + sz * t)) < c.r - EPS) return false;
    }
    return true;
  }
  const v = (x, z) => new THREE.Vector3(x, 0, z);
  const ISLAND = v(28, 28);
  const BRIDGE = v(15.28, 11.04);
  const FOOT = v(10.6, 4.8);

  it('strays on an area with a keep-out never stand in it', () => {
    let bad = null;
    for (let seed = 1; seed <= 200; seed++) {
      const cats = createStrayCats(fakeScene(), KO_AREA, 3, strayStream(seed), { roomSeed: seed });
      const [a, b, c] = cats.strays;
      const where = (s, i) => `seed ${seed} frame ${i} ${s.name} at (${s.group.position.x}, ${s.group.position.z})`;
      for (const s of cats.strays) {
        expect(outside(s.group.position.x, s.group.position.z), where(s, -1)).toBe(true);
        expect(outside(s.home.x, s.home.z), where(s, -1)).toBe(true);
      }
      let toy = null;
      for (let i = 0; i < 3600; i++) {
        const t = i / 30;
        let catPos = t < 40 ? ISLAND : t < 80 ? BRIDGE : FOOT;
        let catSpeed = 0;
        // A toy thrown onto the island, then one into the lake's corner, with
        // a playful stray standing on the shore close enough to chase it.
        if (i === 60) toy = { active: true, mesh: { position: v(28, 28) }, bat() {} };
        if (i === 150) {
          b.personality = 'playful';
          b.state = 'idle';
          b.group.position.set(30.8, 0, 3.0);
          toy = { active: true, mesh: { position: v(27, 9) }, bat() {} };
        }
        if (i === 240) toy = null;
        // A shy stray on the shore, scurrying from a fast approach, away from
        // the cat and straight at the bay.
        if (i === 300) {
          a.personality = 'shy';
          a.state = 'idle';
          a.scurry = 0;
          a.group.position.set(24, 0, 3.6);
          catPos = v(24, 2);
          catSpeed = 3;
        }
        // A cross cat recoiling away from the cat, towards the water.
        if (i === 600) {
          c.group.position.set(20, 0, 3.9);
          cats.turnHostile(c, v(20, 2.4));
          expect(outside(c.group.position.x, c.group.position.z), where(c, i)).toBe(true);
        }
        // A Far Call from the island. No stray outside the keep-out is in
        // its band (the nearest clear ground is over 22 m away), so a second
        // call comes from the bridge, with a stray waiting on the shore below.
        if (i === 900) {
          cats.reactToMeow(v(28, 30), { far: true });
          a.group.position.set(15.28, 0, -2);
          a.scurry = 0;
          cats.reactToMeow(BRIDGE, { far: true });
          expect(a.state, where(a, i)).toBe('wander');
          for (const s of cats.strays) {
            if (s.target) expect(outside(s.target.x, s.target.z), `target: ${where(s, i)}`).toBe(true);
          }
        }
        cats.update(1 / 30, t, catPos, { stalking: false, catSpeed, toy });
        // Checked by hand and reported once: an expect per stray per frame
        // is millions of them over the run.
        for (const s of cats.strays) {
          if (!outside(s.group.position.x, s.group.position.z)) bad ??= where(s, i);
          if (s.target && !outside(s.target.x, s.target.z)) bad ??= `target (${s.target.x}, ${s.target.z}): ${where(s, i)}`;
        }
      }
    }
    expect(bad).toBe(null);
  }, 60000);

  it('a colony cat stored inside the keep-out is moved out of it, and so is its home', () => {
    const name = CAT_NAMES[0];
    const cats = createStrayCats(fakeScene(), KO_AREA, 3, mulberry32(7), {
      colonyCats: [{ name, x: 40, z: 40, wear: null }],
    });
    const s = cats.strays.find((x) => x.name === name);
    expect(s.colony).toBe(true);
    expect(outside(s.group.position.x, s.group.position.z)).toBe(true);
    expect(s.home.x).toBe(s.group.position.x);
    expect(s.home.z).toBe(s.group.position.z);
  });

  it('a legendary extra rolled inside the keep-out is moved out of it, and so is its home', () => {
    // 0.9 of the way across 0.7 x the bounds is (28, 28): the island.
    const name = LEGENDARY_NAMES[0];
    const cats = createStrayCats(fakeScene(), KO_AREA, 1, mulberry32(7), { extras: [{ name, rng: () => 0.9 }] });
    const s = cats.strays.find((x) => x.name === name);
    expect(outside(s.group.position.x, s.group.position.z)).toBe(true);
    expect(s.home.x).toBe(s.group.position.x);
    expect(s.home.z).toBe(s.group.position.z);
  });

  it('a wander target drawn from home never lands inside the keep-out', () => {
    const cats = createStrayCats(fakeScene(), KO_AREA, 1, mulberry32(3), { roomSeed: 3 });
    const s = cats.strays[0];
    s.personality = 'bold';
    // Homes on the shore, every one of them within a wander's reach of water.
    const homes = [[24, 2], [31, 4], [-1.5, 20], [25, 46], [8, 2]];
    for (const [hx, hz] of homes) {
      for (let k = 0; k < 200; k++) {
        s.home.set(hx, 0, hz);
        s.group.position.set(hx, 0, hz);
        s.state = 'idle';
        s.timer = 0;
        cats.update(1 / 30, k, FAR, NO_OPTS);
        // A target pushed out close to the cat may be reached this same
        // frame (the cat goes idle again), so the target is what is checked.
        expect(s.target).not.toBe(null);
        expect(outside(s.target.x, s.target.z), `home (${hx}, ${hz}) target (${s.target.x}, ${s.target.z})`).toBe(true);
      }
    }
  });

  it('without a keep-out, the Woods\' strays stand exactly where they did', () => {
    // The Woods' bounds (woods.js BOUNDS), and the old spawn formula: after
    // the name shuffle's draws, each stray takes x, z, facing, personality
    // and timer, and stands at lerp(0.7 x the bounds, x) and the same for z.
    const WOODS = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
    const b = WOODS.bounds;
    for (let seed = 1; seed <= 20; seed++) {
      const r = strayStream(seed);
      for (let k = 0; k < CAT_NAMES.length - 1; k++) r();
      const snapshot = [];
      for (let i = 0; i < 3; i++) {
        const x = THREE.MathUtils.lerp(b.minX * 0.7, b.maxX * 0.7, r());
        const z = THREE.MathUtils.lerp(b.minZ * 0.7, b.maxZ * 0.7, r());
        r(); r(); r();
        snapshot.push([x, z]);
      }
      const cats = createStrayCats(fakeScene(), WOODS, 3, strayStream(seed), { roomSeed: seed });
      expect(cats.strays.map((s) => [s.group.position.x, s.group.position.z])).toEqual(snapshot);
      expect(cats.strays.map((s) => [s.home.x, s.home.z])).toEqual(snapshot);
    }
  });
});

describe('createStrayCats — kittypet collars', () => {
  const collarOf = (s) => s.group.getObjectByName('collar');
  it('collarFor puts a non-casting collar on a non-colony stray, and draws nothing extra', () => {
    const calls = []; const count = (r) => () => { const v = r(); calls.push(v); return v; };
    const a = createStrayCats(fakeScene(), AREA, 22, count(mulberry32(4)));
    const n = calls.length; calls.length = 0;
    const b = createStrayCats(fakeScene(), AREA, 22, count(mulberry32(4)), { collarFor: () => 'bell' });
    expect(calls.length).toBe(n);
    expect(b.strays.map((s) => s.name)).toEqual(a.strays.map((s) => s.name));
    const c = collarOf(b.strays[0]);
    expect(c).toBeTruthy();
    c.traverse((o) => { if (o.isMesh) expect(o.userData.noCast).toBe(true); });
  });
  it('a colony cat is never given the kittypet collar', () => {
    const asked = [];
    createStrayCats(fakeScene(), AREA, 3, mulberry32(1), {
      colonyCats: [{ name: 'Marmalade', x: 1, z: 1, wear: null }], collarFor: (n) => { asked.push(n); return 'bell'; },
    });
    expect(asked).not.toContain('Marmalade');
  });
});

describe('createStrayCats — a kittypet wanderer', () => {
  const wanderer = (seed = 3) => ({ name: 'Marmalade', rng: mulberry32(seed), spot: { x: 10, z: -4 }, wanderer: true });
  it('stands at its spot, is flagged, and draws nothing from the walk rng', () => {
    const calls = []; const r = mulberry32(9); const counting = () => { const v = r(); calls.push(v); return v; };
    const cats = createStrayCats(fakeScene(), AREA, 22, counting, { extras: [wanderer()], excludeNames: ['Marmalade'] });
    expect(calls.length).toBe(47 + 5 * 22);
    const w = cats.strays.find((s) => s.name === 'Marmalade');
    expect([w.home.x, w.home.z]).toEqual([10, -4]);
    expect([w.group.position.x, w.group.position.z]).toEqual([10, -4]);
    expect(w.wanderer).toBe(true);
    expect(w.tag?.userData?.legend ?? false).toBe(false);
    expect(cats.strays.filter((s) => s.name === 'Marmalade')).toHaveLength(1);
    for (const s of cats.strays) if (s !== w) expect(s.wanderer).toBe(false);
  });
  it('still takes all five of its own draws when it has a spot', () => {
    let n = 0; const own = () => { n++; return 0.5; };
    createStrayCats(fakeScene(), AREA, 3, mulberry32(1), { extras: [{ name: 'Marmalade', rng: own, spot: { x: 1, z: 2 }, wanderer: true }], excludeNames: ['Marmalade'] });
    expect(n).toBe(5);
  });
  it('a spot outside the bounds is clamped in, like a colony cat', () => {
    const cats = createStrayCats(fakeScene(), AREA, 0, mulberry32(1), { extras: [{ name: 'Marmalade', rng: mulberry32(2), spot: { x: 900, z: -900 }, wanderer: true }] });
    const w = cats.strays[0];
    expect([w.home.x, w.home.z]).toEqual([AREA.bounds.maxX - 0.5, AREA.bounds.minZ + 0.5]);
  });
  it('wears no legend glow or star; a legendary extra with a spot still does', () => {
    withFakeDocument(() => {
      const cats = createStrayCats(fakeScene(), AREA, 0, mulberry32(1), {
        extras: [wanderer(), { name: 'Captain Barnacle', rng: mulberry32(4), spot: { x: -3, z: 3 } }],
      });
      const w = cats.strays.find((s) => s.name === 'Marmalade');
      expect(w.tag.userData.legend).toBe(false);
      expect(w.group.children.filter((o) => o.userData?.legendGlow)).toHaveLength(0);
      const l = cats.strays.find((s) => s.name === 'Captain Barnacle');
      expect(l.tag.userData.legend).toBe(true);
      expect(l.group.children.filter((o) => o.userData?.legendGlow)).toHaveLength(1);
      expect(l.wanderer).toBe(false);
      expect([l.home.x, l.home.z]).toEqual([-3, 3]);
      expect(() => cats.update(0.05, 0, FAR, NO_OPTS)).not.toThrow();
    });
  });
  it('a non-kittypet is refused as a wanderer extra', () => {
    const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(1), { extras: [{ name: 'Pickles', rng: mulberry32(2), wanderer: true }] });
    expect(cats.strays).toHaveLength(3);
    expect(cats.strays.some((s) => s.name === 'Pickles' && s.wanderer === true)).toBe(false);
  });
  it('a kittypet without the wanderer flag is refused', () => {
    const cats = createStrayCats(fakeScene(), AREA, 0, mulberry32(1), { extras: [{ name: 'Marmalade', rng: mulberry32(2) }] });
    expect(cats.strays).toHaveLength(0);
  });
  it('two devices with 22 and 14 strays place the same wanderer at the same spot and facing', () => {
    const a = createStrayCats(fakeScene(), AREA, 22, mulberry32(5), { extras: [wanderer(7)], excludeNames: ['Marmalade'] });
    const b = createStrayCats(fakeScene(), AREA, 14, mulberry32(5), { extras: [wanderer(7)], excludeNames: ['Marmalade'] });
    const w = (c) => c.strays.find((s) => s.name === 'Marmalade');
    expect([w(a).home.x, w(a).home.z, w(a).group.rotation.y]).toEqual([w(b).home.x, w(b).home.z, w(b).group.rotation.y]);
  });
});

// Final review, finding 1: the wanderer takes an ordinary loner's slot, never a
// colony cat's. createStrayCats counts the fed colony cats inside `count`, so
// the walk's count is cut only when there is an ordinary loner to drop.
describe('the wanderer and the fed colony cats', () => {
  const FED = CAT_NAMES.filter((n) => n !== 'Marmalade');
  const fed = (n) => FED.slice(0, n).map((name, i) => ({ name, x: i, z: 1, wear: null }));
  const wanderer = () => ({ name: 'Marmalade', rng: mulberry32(3), spot: { x: 10, z: -4 }, wanderer: true });
  const spawn = (fedHere, withWanderer) => {
    const loners = lonersFor('woods', 22, fedHere);
    return createStrayCats(fakeScene(), AREA, wanderStrayCount(loners, fedHere, withWanderer), mulberry32(1), {
      colonyCats: fed(fedHere), excludeNames: ['Marmalade'], extras: withWanderer ? [wanderer()] : [],
    }).strays;
  };

  it('HIGH tier, five fed cats and a wanderer: all five colony cats still spawn', () => {
    expect(lonersFor('woods', 22, 5)).toBe(5);
    const cats = spawn(5, true);
    expect(cats.filter((s) => s.colony).map((s) => s.name)).toEqual(FED.slice(0, 5));
    expect(cats.filter((s) => s.wanderer).map((s) => s.name)).toEqual(['Marmalade']);
    expect(cats.filter((s) => !s.colony && !s.wanderer)).toEqual([]);
  });

  it('LOW tier, four fed cats and a wanderer: all four colony cats still spawn', () => {
    const loners = lonersFor('woods', 14, 4);
    expect(wanderStrayCount(loners, 4, true)).toBe(loners);
  });

  it('fewer fed cats than loners: the wanderer takes one ordinary loner', () => {
    const without = spawn(2, false);
    const withW = spawn(2, true);
    expect(withW.filter((s) => s.colony)).toHaveLength(2);
    expect(without.filter((s) => s.colony)).toHaveLength(2);
    const ordinary = (cats) => cats.filter((s) => !s.colony && !s.wanderer).map((s) => s.name);
    expect(ordinary(withW)).toHaveLength(ordinary(without).length - 1);
    expect(ordinary(withW)).toEqual(ordinary(without).slice(0, -1));   // a prefix: nobody moves
  });

  it('wanderStrayCount: no wanderer, no change; never below the fed cats; never negative', () => {
    for (const [l, f] of [[5, 0], [5, 3], [5, 5], [4, 6], [0, 0], [22, 0]]) {
      expect(wanderStrayCount(l, f, false)).toBe(l);
      expect(wanderStrayCount(l, f, true)).toBe(l > f ? l - 1 : l);
      expect(wanderStrayCount(l, f, true)).toBeGreaterThanOrEqual(Math.min(l, f));
      expect(wanderStrayCount(l, f, true)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('createStrayCats — the extras wear the kittypet collar', () => {
  const ringHex = (s) => s.group.getObjectByName('collar')?.children[0]?.material?.color?.getHex();
  const clanCollar = (n) => housecatCollar({ edition: 'clan' }, n);
  it('a legendary Duchess extra gets the heart charm through collarFor', () => {
    const cats = createStrayCats(fakeScene(), AREA, 0, mulberry32(1), { extras: [{ name: 'Duchess', rng: mulberry32(2) }], collarFor: clanCollar });
    const d = cats.strays.find((s) => s.name === 'Duchess');
    expect(clanCollar('Duchess')).toBe('heart');
    expect(ringHex(d)).toBe(0xf27ab0);
    expect(d.group.getObjectByName('collar').children).toHaveLength(4);   // ring, charm, two lobes
  });
  it('a wanderer extra gets the bell', () => {
    const cats = createStrayCats(fakeScene(), AREA, 0, mulberry32(1), {
      extras: [{ name: 'Marmalade', rng: mulberry32(2), spot: { x: 0, z: 0 }, wanderer: true }], collarFor: clanCollar,
    });
    const m = cats.strays[0];
    expect(clanCollar('Marmalade')).toBe('bell');
    expect(m.group.getObjectByName('collar').children).toHaveLength(2);   // ring and bell
    m.group.getObjectByName('collar').traverse((o) => { if (o.isMesh) expect(o.userData.noCast).toBe(true); });
  });
  it('in Legacy neither wears one', () => {
    const legacy = (n) => housecatCollar({ edition: 'legacy' }, n);
    const cats = createStrayCats(fakeScene(), AREA, 0, mulberry32(1), {
      extras: [{ name: 'Duchess', rng: mulberry32(2) }, { name: 'Marmalade', rng: mulberry32(3), spot: { x: 0, z: 0 }, wanderer: true }],
      collarFor: legacy,
    });
    expect(cats.strays).toHaveLength(2);
    for (const s of cats.strays) expect(s.group.getObjectByName('collar')).toBeFalsy();
  });
});

describe('a colony cat whose saved spot is now inside the camp', () => {
  // A spot saved before the camps existed can fall inside the den or the
  // leader's rock. It is nudged out where the walk is built (display only:
  // nothing is written back to the save) and draws nothing.
  const DEN = { x: 10, z: 10, r: 1.4 };
  const ROCK = { x: 14, z: 10, r: 1.1 };
  const MARGIN = 0.35; // CAT_RADIUS

  it('is moved just outside the den or the rock, and its home with it', () => {
    for (const [x, z] of [[10, 10], [10.5, 10.4], [14, 10.2], [13.2, 10], [10, 11.3]]) {
      const cats = createStrayCats(fakeScene(), AREA, 3, mulberry32(7), {
        colonyCats: [{ name: CAT_NAMES[0], x, z, wear: null }], colonyAvoid: [DEN, ROCK],
      });
      const s = cats.strays.find((c) => c.name === CAT_NAMES[0]);
      const p = s.group.position;
      for (const d of [DEN, ROCK]) {
        expect(Math.hypot(p.x - d.x, p.z - d.z), `${x},${z}`).toBeGreaterThanOrEqual(d.r + MARGIN - 1e-9);
      }
      expect(Math.hypot(p.x - x, p.z - z), `${x},${z} moved only a little`).toBeLessThan(2.5);
      expect([s.home.x, s.home.z]).toEqual([p.x, p.z]);
    }
  });

  it('a spot clear of the camp is left exactly where it was, and the draws are the same', () => {
    const count = (r) => { const c = { n: 0 }; c.rng = () => { c.n++; return r(); }; return c; };
    const a = count(mulberry32(7));
    const b = count(mulberry32(7));
    const plain = createStrayCats(fakeScene(), AREA, 3, a.rng, { colonyCats: [{ name: CAT_NAMES[0], x: 20, z: -5, wear: null }] });
    const nudged = createStrayCats(fakeScene(), AREA, 3, b.rng, { colonyCats: [{ name: CAT_NAMES[0], x: 20, z: -5, wear: null }], colonyAvoid: [DEN, ROCK] });
    expect(nudged.strays.map((s) => s.group.position.toArray())).toEqual(plain.strays.map((s) => s.group.position.toArray()));
    expect(b.n).toBe(a.n);
  });

  it('walk.js hands it the camp\'s den and rock', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toMatch(/colonyAvoid: campDiscs\(areaId\)/);
  });
});

// ---------------------------------------------------------------------------
// Gorge part 3 (C8, ruling C-F2): someone lives in the Snug Cave. `homes`
// gives the first ordinary strays a fixed home each, with only the home's own
// rectangles to stand on, and costs the stray stream nothing.
// ---------------------------------------------------------------------------
describe('createStrayCats — homes (Gorge part 3, C8)', () => {
  const counting = () => { let n = 0; const f = () => { n++; return ((n * 0.6180339887) % 1); }; f.count = () => n; return f; };
  const HOME = { x: 22.5, z: 9.5, roam: 2 };
  const look = (s) => [s.name, s.group.position.x, s.group.position.z, s.group.rotation.y, s.personality, s.timer];

  it('a home is taken by the first ordinary stray, and the stream is unchanged', () => {
    const a = counting(), b = counting(), c = counting();
    const plain = createStrayCats(fakeScene(), AREA, 6, a);
    const homed = createStrayCats(fakeScene(), AREA, 6, b, { homes: [HOME] });
    expect(a.count()).toBe(47 + 5 * 6);
    expect(b.count()).toBe(47 + 5 * 6);
    expect([homed.strays[0].group.position.x, homed.strays[0].group.position.z]).toEqual([22.5, 9.5]);
    expect([homed.strays[0].home.x, homed.strays[0].home.z]).toEqual([22.5, 9.5]);
    expect(homed.strays[0].roam).toBe(2);
    // the same cat (same name), just at home; everyone else exactly as before
    expect(homed.strays[0].name).toBe(plain.strays[0].name);
    expect(homed.strays.slice(1).map(look)).toEqual(plain.strays.slice(1).map(look));
    expect(homed.strays.slice(1).every((s) => s.roam === null)).toBe(true);

    // With one colony cat, the colony cat keeps its spot and the second cast
    // member takes the home.
    const withColony = createStrayCats(fakeScene(), AREA, 6, c, {
      homes: [HOME], colonyCats: [{ name: 'Pickles', x: 5, z: -7, wear: null }],
    });
    expect(c.count()).toBe(47 + 5 * 6);
    const [colonyCat, second] = withColony.strays;
    expect([colonyCat.name, colonyCat.group.position.x, colonyCat.group.position.z, colonyCat.roam]).toEqual(['Pickles', 5, -7, null]);
    expect([second.group.position.x, second.group.position.z, second.roam]).toEqual([22.5, 9.5, 2]);
  });

  it('a home never goes to an extra, and a bad home is ignored', () => {
    const r = counting();
    const cats = createStrayCats(fakeScene(), AREA, 0, r, {
      homes: [HOME], extras: [{ name: 'Captain Barnacle', rng: mulberry32(5) }],
    });
    expect(r.count()).toBe(47);
    expect(cats.strays[0].roam).toBe(null);
    const plain = createStrayCats(fakeScene(), AREA, 4, mulberry32(9));
    const junk = createStrayCats(fakeScene(), AREA, 4, mulberry32(9), { homes: [null, { x: NaN, z: 1, roam: 2 }, 'x'] });
    expect(junk.strays.map(look)).toEqual(plain.strays.map(look));
  });

  it('a rolled shy cat at home is bold, so she can greet it', () => {
    // A constant 0.1 rolls 'shy' for the first stray.
    const plain = createStrayCats(fakeScene(), AREA, 2, () => 0.1);
    const homed = createStrayCats(fakeScene(), AREA, 2, () => 0.1, { homes: [HOME] });
    expect(plain.strays[0].personality).toBe('shy');
    expect(homed.strays[0].personality).toBe('bold');
    expect(homed.strays[1].personality).toBe(plain.strays[1].personality);
  });

  it('with no homes, every stray is exactly as before', () => {
    // Pinned from the pre-homes code (690c39d, before part 3): the cast,
    // where each stands and faces, its personality and timer, at spawn and
    // after 10 s of wandering, rounded to 1e-6 and hashed, for three seeds;
    // and the first four of seed 7 written out.
    const PINNED = {
      1: 'f2c3186b4f98dfe59eb5daa4a14610d475449b722ab38b3c1f7e226578303dac',
      7: 'd46e7c3745c2f20fb06bd42ed510422a8162c0ab83cc6f4d25c33498cbc1ee88',
      22: '7e48749a73603a29f8886b88d430ca0a4aa1e5022c1b811a73145a29d40b5364',
    };
    const r6 = (rows) => rows.map((row) => row.map((v) => (typeof v === 'number' ? +v.toFixed(6) : v)));
    for (const seed of [1, 7, 22]) {
      for (const opts of [{ roomSeed: seed }, { roomSeed: seed, homes: [] }]) {
        const c = createStrayCats(fakeScene(), AREA, 22, mulberry32(seed), opts);
        const spawn = r6(c.strays.map(look));
        if (seed === 7) {
          expect(spawn.slice(0, 4).map((r) => [r[0], r[1], r[2]])).toEqual([
            ['Doppler', 31.235482, 14.229676],
            ['Churro', -25.284616, -25.669472],
            ['Pepper', 9.254612, -11.426035],
            ['Tofu', 3.351085, 22.860427],
          ]);
        }
        for (let f = 0; f < 300; f++) c.update(1 / 30, f / 30, FAR, NO_OPTS);
        const after = r6(c.strays.map(look));
        expect(createHash('sha256').update(JSON.stringify({ spawn, after })).digest('hex'), `seed ${seed}`).toBe(PINNED[seed]);
      }
    }
  });

  it('a homed playful stray chases a toy only within its roam', () => {
    // A constant 0.4 rolls 'playful' for the first stray. The toy lies 5 m
    // from home, well inside a stray's 8 m reach for it.
    const cats = createStrayCats(fakeScene(), AREA, 1, () => 0.4, { homes: [HOME] });
    const [s] = cats.strays;
    expect(s.personality).toBe('playful');
    const toy = { active: true, mesh: { position: new THREE.Vector3(HOME.x + 5, 0, HOME.z) }, bat() {} };
    let toward = 0;
    for (let f = 0; f < 600; f++) {
      cats.update(1 / 30, f / 30, FAR, { ...NO_OPTS, toy });
      const p = s.group.position;
      expect(Math.hypot(p.x - HOME.x, p.z - HOME.z), `frame ${f}`).toBeLessThanOrEqual(HOME.roam + 1e-9);
      if (s.target) expect(Math.hypot(s.target.x - HOME.x, s.target.z - HOME.z), `frame ${f}`).toBeLessThanOrEqual(HOME.roam + 1e-9);
      toward = Math.max(toward, p.x - HOME.x);
    }
    expect(toward).toBeGreaterThan(1.5); // it did run for the toy, to near the end of its roam
  });

  it('a homed stray\'s recoil never pushes it past its roam', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1, () => 0.4, { homes: [HOME] });
    const [s] = cats.strays;
    // at the edge of its roam, and she stands on its home side
    s.group.position.set(HOME.x + HOME.roam, 0, HOME.z);
    cats.turnHostile(s, new THREE.Vector3(HOME.x, 0, HOME.z));
    expect(s.state).toBe('cross');
    expect(Math.hypot(s.group.position.x - HOME.x, s.group.position.z - HOME.z)).toBeLessThanOrEqual(HOME.roam + 1e-9);
    for (let f = 0; f < 300; f++) {
      cats.update(1 / 30, f / 30, FAR, NO_OPTS);
      const p = s.group.position;
      expect(Math.hypot(p.x - HOME.x, p.z - HOME.z), `frame ${f}`).toBeLessThanOrEqual(HOME.roam + 1e-9);
    }
  });

  it('a homed stray stays home and is never shy', async () => {
    const { build } = await import('../src/world/gorge.js');
    const { SNUG_Y } = await import('../src/world/gorgeshape.js');
    const area = build(new THREE.Scene());
    const [home] = area.strayHomes;
    const inRects = (x, z) => home.onlyOn.some((r) => x >= r.minX - 1e-9 && x <= r.maxX + 1e-9 && z >= r.minZ - 1e-9 && z <= r.maxZ + 1e-9);
    const bad = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const cats = createStrayCats(fakeScene(), area, 22, strayStream(seed), { roomSeed: seed, homes: area.strayHomes });
      const s = cats.strays.find((c) => c.roam !== null);
      expect(cats.strays.filter((c) => c.roam !== null)).toHaveLength(1);
      expect(s.personality).not.toBe('shy');
      // her cat comes into the chamber, fast, and calls from the cave mouth
      const near = new THREE.Vector3(20, SNUG_Y, 8);
      let wandered = 0;
      for (let f = 0; f < 3000; f++) {
        const here = f % 600 < 300;
        if (f % 500 === 250) cats.reactToMeow(new THREE.Vector3(15, SNUG_Y, 20.2), { far: true });
        cats.update(1 / 30, f / 30, here ? near : FAR, { stalking: false, catSpeed: 4, toy: null });
        const p = s.group.position;
        const d = Math.hypot(p.x - home.x, p.z - home.z);
        wandered = Math.max(wandered, d);
        if (d > home.roam + 0.5) bad.push(`seed ${seed} f${f} ${d.toFixed(2)} m from home`);
        if (Math.abs(p.y - SNUG_Y) > 1e-9) bad.push(`seed ${seed} f${f} y ${p.y}`);
        if (!inRects(p.x, p.z)) bad.push(`seed ${seed} f${f} out of the cave (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
        if (s.target && !inRects(s.target.x, s.target.z)) bad.push(`seed ${seed} f${f} target out of the cave`);
        if (s.personality === 'shy') bad.push(`seed ${seed} f${f} shy`);
      }
      // ...and it does walk about its home, not stand frozen
      if (wandered < 0.5) bad.push(`seed ${seed} never left the spot (${wandered.toFixed(2)} m)`);
    }
    expect(bad.slice(0, 12)).toEqual([]);
  });
});
