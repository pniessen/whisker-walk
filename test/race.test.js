import { describe, it, expect } from 'vitest';
import { raceCourse, createRace } from '../src/race.js';

// Mirrors the real world files' pois shape (8 entries, x/z only) — see
// src/world/neighborhood.js's areaData.pois.
const POIS = [
  { x: -8, z: 4 }, { x: 4, z: -35 }, { x: 16, z: 2 }, { x: -12, z: 32 },
  { x: 8, z: 27 }, { x: -6, z: -40 }, { x: 20, z: -8 }, { x: 28, z: 28 },
];

function fakeScene() {
  const objects = new Set();
  return {
    objects,
    add: (o) => objects.add(o),
    remove: (o) => objects.delete(o),
  };
}

describe('raceCourse', () => {
  it('returns exactly 5 waypoints', () => {
    expect(raceCourse(POIS, 42).length).toBe(5);
  });

  it('is deterministic: same seed -> identical 5 waypoints in the same order', () => {
    const a = raceCourse(POIS, 1234);
    const b = raceCourse(POIS, 1234);
    expect(a).toEqual(b);
  });

  it('different seeds produce a different order (or selection)', () => {
    const a = raceCourse(POIS, 1);
    const b = raceCourse(POIS, 2);
    expect(a).not.toEqual(b);
  });

  it('never contains duplicate waypoints', () => {
    for (const seed of [1, 2, 3, 42, 99999]) {
      const course = raceCourse(POIS, seed);
      const seen = new Set(course.map((p) => `${p.x},${p.z}`));
      expect(seen.size).toBe(course.length);
    }
  });

  it('every waypoint comes from the original pois array', () => {
    const course = raceCourse(POIS, 7);
    for (const wp of course) {
      expect(POIS.some((p) => p.x === wp.x && p.z === wp.z)).toBe(true);
    }
  });

  it('does not mutate the input pois array', () => {
    const before = POIS.map((p) => ({ ...p }));
    raceCourse(POIS, 55);
    expect(POIS).toEqual(before);
  });
});

const SPAWN = { x: 0, z: 45 };

function makeCourse() {
  return raceCourse(POIS, 42);
}

describe('createRace', () => {
  it('adds a group to the scene with a start pad + 5 rings (6 children)', () => {
    const scene = fakeScene();
    const race = createRace(scene, makeCourse(), SPAWN);
    expect(scene.objects.has(race.group)).toBe(true);
    expect(race.group.children.length).toBe(6);
  });

  it('starts idle, at ring 1, with timeMs 0', () => {
    const race = createRace(fakeScene(), makeCourse(), SPAWN);
    expect(race.state).toBe('idle');
    expect(race.currentRing).toBe(1);
    expect(race.timeMs).toBe(0);
  });

  it('promptAt fires only near the start pad, and only while idle', () => {
    const race = createRace(fakeScene(), makeCourse(), SPAWN);
    const padPos = { x: SPAWN.x + 2, z: SPAWN.z - 3 };
    expect(race.promptAt(padPos)).toBe('E — start today’s zoomies race! 🏁');
    expect(race.promptAt({ x: padPos.x + 20, z: padPos.z })).toBeNull();
    race.begin();
    expect(race.promptAt(padPos)).toBeNull(); // no re-triggering once running
  });

  it('update does nothing while idle (no time accrues, prompts still work)', () => {
    const race = createRace(fakeScene(), makeCourse(), SPAWN);
    race.update(1, { x: 0, z: 0 });
    expect(race.timeMs).toBe(0);
    expect(race.state).toBe('idle');
  });

  it('begin() transitions idle -> running and is a no-op once already running', () => {
    const race = createRace(fakeScene(), makeCourse(), SPAWN);
    race.begin();
    expect(race.state).toBe('running');
    race.update(2, { x: 9999, z: 9999 }); // 2s away from any ring
    const midTime = race.timeMs;
    race.begin(); // no-op — must not reset the clock mid-race
    expect(race.state).toBe('running');
    expect(race.timeMs).toBe(midTime);
  });

  it('accumulates timeMs while running', () => {
    const race = createRace(fakeScene(), makeCourse(), SPAWN);
    race.begin();
    race.update(0.5, { x: 9999, z: 9999 });
    race.update(0.25, { x: 9999, z: 9999 });
    expect(race.timeMs).toBeCloseTo(750);
  });

  it('crossing rings in course order advances currentRing, then finishes on the 5th', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    race.begin();
    for (let i = 0; i < course.length; i++) {
      expect(race.state).toBe('running');
      expect(race.currentRing).toBe(i + 1);
      race.update(0.1, { x: course[i].x, z: course[i].z });
    }
    expect(race.state).toBe('done');
  });

  it('being near a later ring out of order does not advance currentRing', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    race.begin();
    // stand on ring 3's spot without having crossed rings 1/2 first
    race.update(0.1, { x: course[2].x, z: course[2].z });
    expect(race.currentRing).toBe(1);
    expect(race.state).toBe('running');
  });

  it('update does nothing once done (timeMs freezes)', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    race.begin();
    for (const wp of course) race.update(0.1, { x: wp.x, z: wp.z });
    expect(race.state).toBe('done');
    const finalTime = race.timeMs;
    race.update(5, { x: 0, z: 0 });
    expect(race.timeMs).toBe(finalTime);
  });

  it('dispose removes the group from the scene', () => {
    const scene = fakeScene();
    const race = createRace(scene, makeCourse(), SPAWN);
    race.dispose();
    expect(scene.objects.has(race.group)).toBe(false);
  });
});
