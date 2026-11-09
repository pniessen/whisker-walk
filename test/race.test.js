import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { raceCourse, createRace, RING_Y, NEAR_FADE, PAD_LOOK } from '../src/race.js';
import { mulberry32 } from '../src/rng.js';

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

// The body raceCourse had before groups, copied here so a plain list is
// proven byte-identical, not just "looks right".
function oldRaceCourse(pois, seed) {
  const rng = mulberry32(seed);
  const copy = pois.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 5);
}

describe('raceCourse', () => {
  it('takes at most one POI from any group, with the same shuffle', () => {
    const pois = [...Array.from({ length: 9 }, (_, i) => ({ x: i, z: 0 })),
      ...Array.from({ length: 8 }, (_, i) => ({ x: i, z: 10, group: 'island' }))];
    for (let seed = 1; seed <= 300; seed++) {
      const c = raceCourse(pois, seed);
      expect(c).toHaveLength(5);
      expect(c.filter((p) => p.group === 'island').length).toBeLessThanOrEqual(1);
    }
    // no groups: identical to before
    const plain = pois.slice(0, 9);
    expect(raceCourse(plain, 42)).toEqual(oldRaceCourse(plain, 42));
    expect(raceCourse(POIS, 7)).toEqual(oldRaceCourse(POIS, 7));
  });

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
  it('adds a group to the scene with a start pad + 5 rings + the pennant (7 children)', () => {
    const scene = fakeScene();
    const race = createRace(scene, makeCourse(), SPAWN);
    expect(scene.objects.has(race.group)).toBe(true);
    expect(race.group.children.length).toBe(7);
    expect(race.group.getObjectByName('racePennant')).toBeTruthy();
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

  // Final review M1: the Gorge's climb paid out as "the daily zoomies race".
  it('names its kind, and what finishing it is called', () => {
    const daily = createRace(fakeScene(), makeCourse(), SPAWN);
    expect(daily.kind).toBe('daily');
    expect(daily.finishLabel).toBe('the daily zoomies race');
    const climb = createRace(fakeScene(), makeCourse(), SPAWN, { kind: 'climb' });
    expect(climb.kind).toBe('climb');
    expect(climb.finishLabel).toBe('the climb to the clifftop');
  });

  it('main.js pays the finish under the race\'s own name', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/main.js', import.meta.url)), 'utf8');
    expect(src).toContain("log.awardOnce('goal', 'race-done', session.race.finishLabel)");
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

describe('createRace — positions for the corner map', () => {
  it('race exposes ring and pad positions', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    expect(race.rings).toEqual(course.map((p) => ({ x: p.x, z: p.z })));
    expect(race.pad).toEqual({ x: SPAWN.x + 2, z: SPAWN.z - 3 });
  });
});

// polish-startpad: the flat yellow plastic ring became a worn circle of earth
// with eight cream paw-print stones. Still one mesh, one geometry, one material
// (race.js runs in every walk; the flat trace counts THREE objects).
describe('createRace — the start pad', () => {
  const padOf = (race) => race.group.children.filter((m) => m.userData.racePad);
  it('is one see-through mesh under 400 triangles, every face up', () => {
    const pads = padOf(createRace(fakeScene(), makeCourse(), SPAWN));
    expect(pads).toHaveLength(1);
    const g = pads[0].geometry;
    expect(g.index.count / 3).toBeLessThanOrEqual(400);
    expect(g.getAttribute('color').itemSize).toBe(4);
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.5);
    expect(pads[0].material.transparent).toBe(true);
    expect(pads[0].material.depthWrite).toBe(false);
  });
  it('the worn ring fades out at its edges and the stones are opaque', () => {
    const g = padOf(createRace(fakeScene(), makeCourse(), SPAWN))[0].geometry;
    const a = g.getAttribute('color');
    const alphas = Array.from({ length: a.count }, (_, i) => a.getW(i));
    expect(alphas.filter((x) => x === 0).length).toBe(PAD_LOOK.segs * 2);
    expect(Math.max(...alphas.filter((x) => x < 1))).toBeLessThan(0.6);
    expect(alphas.filter((x) => x === 1).length).toBeGreaterThan(PAD_LOOK.paws * 30);
  });
  it('glows only at dusk, at half the old ring\'s emissive', () => {
    const day = padOf(createRace(fakeScene(), makeCourse(), SPAWN))[0].material;
    const dusk = padOf(createRace(fakeScene(), makeCourse(), SPAWN, { dusk: true }))[0].material;
    expect(day.emissive.getHex()).toBe(0x000000);
    expect(dusk.emissive.getHex()).toBe(0x453810);
  });
});

// Polish (view clear), task 2: the rings used to be dim grey tori that often
// filled the foreground. Now the next ring is a thick candy-striped hoop with a
// numbered pennant, the rest are thin faint hoops, and any ring close to the
// camera fades out of the way.
const RING_RADIUS = 1.1;
const ringMeshes = (race) => race.group.children.filter((o) => o.userData.raceRing);
const tubeOf = (g) => g.parameters?.tube ?? g.userData.tube;
function distinctColours(geo) {
  const c = geo.getAttribute('color');
  const seen = new Set();
  for (let i = 0; i < c.count; i++) seen.add(`${c.getX(i).toFixed(3)},${c.getY(i).toFixed(3)},${c.getZ(i).toFixed(3)}`);
  return seen.size;
}

describe('createRace — candy hoop, faint hoops, pennant, near fade', () => {
  it('the current ring is a thick striped hoop; the others are thin and faint', () => {
    const race = createRace(fakeScene(), makeCourse(), SPAWN);
    const rings = ringMeshes(race);
    expect(rings).toHaveLength(5);
    const cur = rings[0];
    expect(cur.geometry.getAttribute('color')).toBeTruthy();
    expect(distinctColours(cur.geometry)).toBeGreaterThanOrEqual(2);
    expect(tubeOf(cur.geometry)).toBeGreaterThanOrEqual(0.08);
    expect(cur.material.opacity).toBe(1);
    expect(cur.material.transparent).toBe(true);
    const thin = rings[1].geometry;
    for (const r of rings.slice(1)) {
      expect(r.geometry).toBe(thin);
      expect(tubeOf(r.geometry)).toBeLessThanOrEqual(0.05);
      expect(r.material.opacity).toBeLessThanOrEqual(0.6);
      expect(r.material.transparent).toBe(true);
      expect(r.material).not.toBe(cur.material);
    }
  });

  it('passed rings go fainter than upcoming ones', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    const rings = ringMeshes(race);
    const thick = rings[0].geometry;
    race.begin();
    race.update(0.1, { x: course[0].x, z: course[0].z });
    expect(race.currentRing).toBe(2);
    expect(rings[0].material.opacity).toBeLessThan(rings[2].material.opacity);
    expect(rings[1].geometry).toBe(thick);
    expect(rings[1].material.opacity).toBe(1);
    expect(tubeOf(rings[0].geometry)).toBeLessThanOrEqual(0.05);
  });

  it('the pennant sits on the current ring and moves on', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    const pennant = race.group.getObjectByName('racePennant');
    const at = () => { pennant.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(pennant.matrixWorld); };
    let p = at();
    expect(p.x).toBeCloseTo(course[0].x);
    expect(p.z).toBeCloseTo(course[0].z);
    expect(p.y).toBeGreaterThanOrEqual(RING_Y + RING_RADIUS - 1e-6);
    expect(pennant.visible).toBe(true);
    race.begin();
    race.update(0.1, { x: course[0].x, z: course[0].z });
    p = at();
    expect(p.x).toBeCloseTo(course[1].x);
    expect(p.z).toBeCloseTo(course[1].z);
    for (let i = 1; i < course.length; i++) race.update(0.1, { x: course[i].x, z: course[i].z });
    expect(race.state).toBe('done');
    expect(pennant.visible).toBe(false);
    pennant.traverse((o) => { if (o.isMesh) { expect(o.castShadow).toBe(false); expect(o.userData.noCast).toBe(true); } });
  });

  // Fix wave: the flag's front (+Z, where the number reads un-mirrored) turns
  // to the camera, so the number never reads backwards.
  it('the pennant turns its front to the camera', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    const pennant = race.group.getObjectByName('racePennant');
    const flag = pennant.children.find((m) => m.geometry.type === 'BufferGeometry');
    const n = flag.geometry.getAttribute('normal');
    expect([n.getX(0), n.getY(0), n.getZ(0)]).toEqual([0, 0, 1]); // front is +Z
    for (const [dx, dz] of [[5, 0], [0, -7], [-3, 4], [2, 9]]) {
      const camera = { position: { x: course[0].x + dx, y: 3, z: course[0].z + dz } };
      race.update(0.016, { x: 9999, z: 9999 }, camera);
      pennant.updateWorldMatrix(true, false);
      const front = new THREE.Vector3(0, 0, 1).transformDirection(pennant.matrixWorld);
      const to = new THREE.Vector3(dx, 0, dz).normalize();
      expect(front.dot(to)).toBeCloseTo(1, 6);
    }
  });

  it('a ring near the camera fades, whatever the race state', () => {
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    const rings = ringMeshes(race);
    const farCat = { x: 9999, z: 9999 };
    const ring = course[2];
    const stateOpacity = rings[2].material.opacity;
    const before = rings.map((r) => r.material.opacity);
    race.update(0.016, farCat); // no camera: opacities untouched
    expect(rings.map((r) => r.material.opacity)).toEqual(before);
    const camera = { position: { x: ring.x, y: RING_Y, z: ring.z + 1.0 } };
    race.update(0.016, farCat, camera);
    expect(race.state).toBe('idle');
    expect(rings[2].material.opacity).toBeLessThanOrEqual(stateOpacity * (NEAR_FADE.min + 0.01));
    camera.position.z = ring.z + 10;
    race.update(0.016, farCat, camera);
    expect(rings[2].material.opacity).toBeCloseTo(stateOpacity);
    // the current ring too, while running
    race.begin();
    camera.position.x = course[0].x; camera.position.z = course[0].z + 1.0;
    race.update(0.016, farCat, camera);
    expect(rings[0].material.opacity).toBeLessThanOrEqual(1 * (NEAR_FADE.min + 0.01));
  });

  it('a ring fades when the camera is near its hoop, not only near its centre (polish-quayside)', () => {
    // The Docks quay on the phone: the camera 2 m from a ring's centre but a
    // hand's breadth from its rim, and the candy hoop filled the screen corner.
    const course = makeCourse();
    const race = createRace(fakeScene(), course, SPAWN);
    const rings = ringMeshes(race);
    const ring = course[2];
    const stateOpacity = rings[2].material.opacity;
    // 2.10 m from the centre (the old rule: ~0.73 of full), 1.2 m from the hoop
    const camera = { position: { x: ring.x + 1.9, y: RING_Y, z: ring.z + 0.9 } };
    race.update(0.016, { x: 9999, z: 9999 }, camera);
    expect(rings[2].material.opacity).toBeLessThanOrEqual(stateOpacity * (NEAR_FADE.min + 0.01));
    // well clear of both: full
    camera.position.x = ring.x + 4;
    camera.position.z = ring.z + 3;
    race.update(0.016, { x: 9999, z: 9999 }, camera);
    expect(rings[2].material.opacity).toBeCloseTo(stateOpacity);
  });

  it('createRace works with no document (node)', () => {
    expect(typeof document).toBe('undefined');
    let race;
    expect(() => { race = createRace(fakeScene(), makeCourse(), SPAWN); }).not.toThrow();
    expect(race.group.getObjectByName('racePennant')).toBeTruthy();
    expect(() => race.dispose()).not.toThrow();
  });

  it('uses only a handful of distinct geometries', () => {
    const race = createRace(fakeScene(), makeCourse(), SPAWN);
    const geos = new Set();
    race.group.traverse((o) => { if (o.geometry) geos.add(o.geometry); });
    expect(geos.size).toBeLessThanOrEqual(5);
  });

  it('NEAR_FADE has the plan\'s values', () => {
    expect(NEAR_FADE).toEqual({ start: 2.5, end: 1.2, min: 0.12 });
  });

  it('main.js hands the camera to the race', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/main.js', import.meta.url)), 'utf8');
    expect(src).toContain('session.race.update(dt, session.cat.position, camera)');
  });
});
