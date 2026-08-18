import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createStrayCats, friendRungCrossed, friendRungs } from '../src/straycats.js';
import { createProgression } from '../src/progression.js';
import { hasSkill } from '../src/skills.js';

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
