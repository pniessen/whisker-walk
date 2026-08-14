import { describe, it, expect } from 'vitest';
import { kittenPlan, createKittenEncounter, KITTEN_SPOT } from '../src/kitten.js';

describe('kittenPlan', () => {
  it('stage 0 + neighborhood -> trail', () => {
    expect(kittenPlan(0, 'neighborhood')).toEqual({ kind: 'trail' });
  });
  it('stage 0 + park -> null (neighborhood-only for stage 0)', () => {
    expect(kittenPlan(0, 'park')).toBeNull();
  });
  it('stage 0 + seaside -> null', () => {
    expect(kittenPlan(0, 'seaside')).toBeNull();
  });
  it('stage 1 + neighborhood -> meet', () => {
    expect(kittenPlan(1, 'neighborhood')).toEqual({ kind: 'meet' });
  });
  it('stage 1 + park -> null (neighborhood-only for stage 1)', () => {
    expect(kittenPlan(1, 'park')).toBeNull();
  });
  it('stage 2 + any area -> home', () => {
    expect(kittenPlan(2, 'neighborhood')).toEqual({ kind: 'home' });
    expect(kittenPlan(2, 'park')).toEqual({ kind: 'home' });
    expect(kittenPlan(2, 'seaside')).toEqual({ kind: 'home' });
  });
  it('stage 3 + any area -> home', () => {
    expect(kittenPlan(3, 'neighborhood')).toEqual({ kind: 'home' });
    expect(kittenPlan(3, 'park')).toEqual({ kind: 'home' });
    expect(kittenPlan(3, 'seaside')).toEqual({ kind: 'home' });
  });
});

describe('KITTEN_SPOT', () => {
  it('is the fixed spot per the brief', () => {
    expect(KITTEN_SPOT).toEqual({ x: -18, z: -6 });
  });
});

function fakeScene() {
  const objects = new Set();
  return {
    objects,
    add: (o) => objects.add(o),
    remove: (o) => objects.delete(o),
  };
}

describe('createKittenEncounter — trail', () => {
  it('adds a group with 5 paw-print pairs (10 decals) to the scene, no kitten mesh', () => {
    const scene = fakeScene();
    const enc = createKittenEncounter(scene, { kind: 'trail' }, { x: 0, z: 0 });
    expect(scene.objects.has(enc.group)).toBe(true);
    expect(enc.group.children.length).toBe(10);
  });

  it('promptAt is null far from KITTEN_SPOT and fires within 2 units of it', () => {
    const enc = createKittenEncounter(fakeScene(), { kind: 'trail' }, { x: 0, z: 0 });
    expect(enc.promptAt({ x: 0, z: 0 })).toBeNull();
    expect(enc.promptAt({ x: KITTEN_SPOT.x, z: KITTEN_SPOT.z })).toBe('E — investigate the tiny mew');
    expect(enc.promptAt({ x: KITTEN_SPOT.x + 1.5, z: KITTEN_SPOT.z })).toBe('E — investigate the tiny mew');
    expect(enc.promptAt({ x: KITTEN_SPOT.x + 5, z: KITTEN_SPOT.z })).toBeNull();
  });

  it('interact returns advanced', () => {
    const enc = createKittenEncounter(fakeScene(), { kind: 'trail' }, { x: 0, z: 0 });
    expect(enc.interact()).toBe('advanced');
  });

  // Regression: a stray extra E press at KITTEN_SPOT within the same walk
  // must not re-fire — promptAt has to go permanently null after interact()
  // (mirroring meet's `following` guard), otherwise repeated presses race
  // handleInteract through every branch in one walk (main.js's own fix pairs
  // with this by dispatching on the walk's fixed plan kind, not the live
  // stage — but the encounter must stop offering the prompt regardless).
  it('promptAt returns null for the rest of the walk after interact()', () => {
    const enc = createKittenEncounter(fakeScene(), { kind: 'trail' }, { x: 0, z: 0 });
    expect(enc.promptAt({ x: KITTEN_SPOT.x, z: KITTEN_SPOT.z })).toBe('E — investigate the tiny mew');
    expect(enc.interact()).toBe('advanced');
    expect(enc.promptAt({ x: KITTEN_SPOT.x, z: KITTEN_SPOT.z })).toBeNull();
    // a second interact() call is also a no-op, not a repeat 'advanced'
    expect(enc.interact()).toBeNull();
  });

  it('dispose removes the group from the scene', () => {
    const scene = fakeScene();
    const enc = createKittenEncounter(scene, { kind: 'trail' }, { x: 0, z: 0 });
    enc.dispose();
    expect(scene.objects.has(enc.group)).toBe(false);
  });
});

describe('createKittenEncounter — meet', () => {
  it('spawns a kitten mesh at KITTEN_SPOT, scaled 0.5', () => {
    const scene = fakeScene();
    const enc = createKittenEncounter(scene, { kind: 'meet' }, { x: 0, z: 0 });
    expect(scene.objects.has(enc.group)).toBe(true);
    expect(enc.group.position.x).toBeCloseTo(KITTEN_SPOT.x);
    expect(enc.group.position.z).toBeCloseTo(KITTEN_SPOT.z);
    expect(enc.group.scale.x).toBeCloseTo(0.5);
  });

  it('promptAt fires within 2 units of the kitten, null beyond', () => {
    const enc = createKittenEncounter(fakeScene(), { kind: 'meet' }, { x: 0, z: 0 });
    expect(enc.promptAt({ x: KITTEN_SPOT.x, z: KITTEN_SPOT.z })).toBe('E — comfort the kitten');
    expect(enc.promptAt({ x: KITTEN_SPOT.x + 10, z: KITTEN_SPOT.z })).toBeNull();
  });

  it('interact advances to following and stops re-arming the prompt', () => {
    const enc = createKittenEncounter(fakeScene(), { kind: 'meet' }, { x: 0, z: 0 });
    expect(enc.interact()).toBe('advanced');
    expect(enc.promptAt({ x: KITTEN_SPOT.x, z: KITTEN_SPOT.z })).toBeNull();
  });

  it('after interact, update lerps the kitten toward the cat and stops at 1.1 distance', () => {
    const enc = createKittenEncounter(fakeScene(), { kind: 'meet' }, { x: 0, z: 0 });
    enc.interact();
    const catPos = { x: KITTEN_SPOT.x + 20, z: KITTEN_SPOT.z };
    for (let i = 0; i < 2000; i++) enc.update(0.05, catPos);
    const dist = Math.hypot(catPos.x - enc.group.position.x, catPos.z - enc.group.position.z);
    expect(dist).toBeGreaterThan(1.0);
    expect(dist).toBeLessThan(1.3);
  });

  it('calls onMew periodically before being comforted', () => {
    let count = 0;
    const enc = createKittenEncounter(fakeScene(), { kind: 'meet' }, { x: 0, z: 0 }, {
      onMew: () => { count += 1; },
    });
    for (let i = 0; i < 2000; i++) enc.update(0.05, { x: 0, z: 0 }); // 100s of solo mewing
    expect(count).toBeGreaterThan(0);
  });

  it('dispose removes the group from the scene', () => {
    const scene = fakeScene();
    const enc = createKittenEncounter(scene, { kind: 'meet' }, { x: 0, z: 0 });
    enc.dispose();
    expect(scene.objects.has(enc.group)).toBe(false);
  });
});

describe('createKittenEncounter — home', () => {
  it('spawns a kitten mesh near spawn, scaled 0.5', () => {
    const scene = fakeScene();
    const spawn = { x: 12, z: -4 };
    const enc = createKittenEncounter(scene, { kind: 'home' }, spawn);
    expect(scene.objects.has(enc.group)).toBe(true);
    expect(enc.group.scale.x).toBeCloseTo(0.5);
    expect(Math.hypot(enc.group.position.x - spawn.x, enc.group.position.z - spawn.z)).toBeLessThanOrEqual(4);
  });

  it('wanders but stays within a 4-unit radius of spawn over many frames', () => {
    const spawn = { x: 12, z: -4 };
    const enc = createKittenEncounter(fakeScene(), { kind: 'home' }, spawn);
    for (let i = 0; i < 2000; i++) {
      enc.update(0.05, { x: 999, z: 999 });
      const d = Math.hypot(enc.group.position.x - spawn.x, enc.group.position.z - spawn.z);
      expect(d).toBeLessThanOrEqual(4.001);
    }
  });

  it('promptAt fires within 2 units of the kitten, interact returns nuzzle', () => {
    const spawn = { x: 12, z: -4 };
    const enc = createKittenEncounter(fakeScene(), { kind: 'home' }, spawn);
    expect(enc.promptAt({ x: enc.group.position.x, z: enc.group.position.z })).toBe('E — nuzzle Mochi');
    expect(enc.promptAt({ x: spawn.x + 50, z: spawn.z })).toBeNull();
    expect(enc.interact()).toBe('nuzzle');
  });

  it('dispose removes the group from the scene', () => {
    const scene = fakeScene();
    const enc = createKittenEncounter(scene, { kind: 'home' }, { x: 0, z: 0 });
    enc.dispose();
    expect(scene.objects.has(enc.group)).toBe(false);
  });
});
