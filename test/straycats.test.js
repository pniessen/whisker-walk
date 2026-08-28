import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createStrayCats, friendRungCrossed, friendRungs, isGrudgeableStray, CAT_NAMES,
} from '../src/straycats.js';
import { createProgression, CATALOG } from '../src/progression.js';
import { NAME_TAG_RANGE, CROSS_NAME_TAG_RANGE } from '../src/nametag.js';
import { hasSkill } from '../src/skills.js';
import { mulberry32 } from '../src/rng.js';

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
