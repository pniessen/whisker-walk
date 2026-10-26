import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  createStrayCats, friendRungCrossed, friendRungs, isGrudgeableStray, CAT_NAMES, legendPulse,
} from '../src/straycats.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { NAME_TAG_RANGE, CROSS_NAME_TAG_RANGE } from '../src/nametag.js';
import { hasSkill } from '../src/skills.js';
import { mulberry32 } from '../src/rng.js';
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
// from another (D2), carrying a persisted grudge onto the right stray at walk
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

describe('D2 — only strays can ever bear a grudge', () => {
  it('shares not one name with any player avatar, so no family pet is a stray', () => {
    // THE vocabulary half of the guard, pinned against the REAL catalog
    // rather than a hand-copied list of four names, so it cannot rot: adding
    // 'Rosa' to CAT_NAMES, or a new family pet whose name is already a stray
    // name, fails here rather than shipping a cat that can scratch its own
    // child.
    const avatarNames = Object.values(CATALOG.cats).map((c) => c.name);
    expect(avatarNames).toContain('Zeetoo');   // the list really is the family pets
    expect(avatarNames).toContain('Hagrid');
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
    for (const name of ['Zeetoo', 'Rosa', 'Robbie', 'Hagrid']) {
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
// draws; changing this number shifts gifts, weather, secrets and goals.
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
    // The extra list is empty unless that guard found a cat...
    expect(src).toContain('const extras = legend ? [');
    // ...and it is what createStrayCats is handed.
    const call = src.indexOf('const strayCats = createStrayCats(');
    expect(call).toBeGreaterThan(decide);
    expect(src.slice(call, src.indexOf('});', call))).toMatch(/\n\s+extras,\n/);
    // The extra's own rng: mulberry32 over its name and the room seed, never walkRng.
    const ex = src.slice(src.indexOf('const extras = legend ? ['), call);
    expect(ex).toContain('mulberry32((seedFromCode(legend) ^ (roomSeed ?? ');
    expect(ex).not.toContain('walkRng');
    // And none of it inside the rival's slice.
    const slice = src.slice(src.indexOf("The rival's border and its patrol"), src.indexOf('session.rival = {'));
    expect(slice).not.toMatch(/legend/i);
  });
});
