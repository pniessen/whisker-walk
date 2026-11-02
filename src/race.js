import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { litMaterial } from './render/materials.js';
import { FLAT_GROUND } from './ground.js';

const RING_RADIUS = 1.1;
const RING_TUBE = 0.08;
export const RING_Y = 1.1; // metres above the ground under the ring
const CROSS_DIST = 1.2; // horizontal distance that counts as "through" a ring/on the pad

// raceCourse(pois, seed) — pure. mulberry32(seed)-seeded Fisher-Yates
// shuffle of a COPY of the area's pois (never mutates the caller's array —
// areaData.pois is the same array object reused by every walk in this area,
// including createQuest's own target picks), then the first 5 shuffled
// entries become the day's checkpoint order. Both a solo player and every
// device in a room derive this from the identical (dateStr + '-' + areaId)
// seed (see seedFromCode in main.js's startWalk) — that's the whole
// mechanism for "siblings race the same course": no wire event ever needs
// to describe the course itself, only the two inputs (date, area) both
// sides already agree on.
//
// A POI may carry a `group` (the Pines' island POIs share 'island'). The
// course takes at most one POI per group, so the island is one stop on a
// course, never the whole of it. The shuffle is untouched (same draws), and a
// POI with no group is never skipped, so every other area's course is the
// same as before.
//
// Polish 2: with 8 of the Pines' 17 POIs on the island, the one island stop
// still came up 20 days in 21. So on a course whose POIs carry groups, one
// more draw from this same seeded stream (after the shuffle, so the shuffle
// is unchanged; never walkRng) decides whether the groups are in the running
// today: GROUP_DAY_SHARE of days. On the other days the course is drawn from
// the ungrouped POIs alone, unless there are too few of them for a course.
// Pure in (pois, seed) like the rest, so both devices still agree.
export const GROUP_DAY_SHARE = 0.5;
export function raceCourse(pois, seed) {
  const rng = mulberry32(seed);
  const copy = pois.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const anyGroup = copy.some((p) => p.group !== undefined);
  const ungrouped = copy.filter((p) => p.group === undefined).length;
  const groupsToday = !anyGroup || rng() < GROUP_DAY_SHARE || ungrouped < 5;
  const course = [];
  const groups = new Set();
  for (const p of copy) {
    if (p.group !== undefined) {
      if (!groupsToday || groups.has(p.group)) continue;
      groups.add(p.group);
    }
    course.push(p);
    if (course.length === 5) break;
  }
  return course;
}

function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}

// createRace(scene, course, spawn) — course is the 5-waypoint array from
// raceCourse; spawn is the area's own spawn point (areaData.spawn). Builds a
// start pad just off spawn plus one upright ring per waypoint, and returns
// the live race controller main.js drives from the per-frame loop.
// Gorge part 1: the pad and the rings sit on `ground` (FLAT_GROUND: y 0).
// Gorge part 2: each ring stores its ground y and counts only when the cat is
// on that ring's level (ground.sameLevel; always true on flat ground, so every
// other race is unchanged). kind 'climb' is the Gorge's fixed course; it only
// changes the pad's prompt and what finishing it is called (finishLabel).
export function createRace(scene, course, spawn, { ground = FLAT_GROUND, kind = 'daily' } = {}) {
  const group = new THREE.Group();

  // start pad: a flat ring lying on the ground, offset from spawn so it
  // doesn't sit directly under the cat's own spawn position.
  const padMat = litMaterial(0xf2e04e, { emissive: 0x8a7020 });
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 24), padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(spawn.x + 2, ground.y(spawn.x + 2, spawn.z - 3) + 0.02, spawn.z - 3);
  group.add(pad);

  // Two shared materials, swapped onto whichever ring mesh is "current"
  // (bright) vs. already passed or not-yet-current (dim) — cheaper than a
  // unique material per ring since at most one ring is ever bright at a
  // time. TorusGeometry's default orientation already lies in the XY plane
  // (hole axis along Z), which is exactly the upright/vertical hoop the cat
  // runs through — no extra rotation needed (unlike the flat start pad
  // above, which is deliberately rotated flat onto the ground).
  const brightMat = litMaterial(0xffe27a, { emissive: 0xcc9a20 });
  const dimMat = litMaterial(0x707078, { emissive: 0x18181c });

  const rings = course.map((wp) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 12, 24), dimMat);
    const gy = ground.y(wp.x, wp.z);
    mesh.position.set(wp.x, gy + RING_Y, wp.z);
    group.add(mesh);
    return { x: wp.x, z: wp.z, y: gy, mesh };
  });
  if (rings.length > 0) rings[0].mesh.material = brightMat;

  // Plain positions for the corner map, built once so the per-frame read
  // allocates nothing.
  const ringPositions = rings.map((r) => ({ x: r.x, z: r.z }));
  const padPosition = { x: pad.position.x, z: pad.position.z };

  scene.add(group);

  let state = 'idle'; // 'idle' | 'running' | 'done'
  let timeMs = 0;
  let currentRing = 1; // 1-indexed — matches the "ring N/5" HUD text directly

  return {
    group,
    get state() {
      return state;
    },
    get timeMs() {
      return timeMs;
    },
    get currentRing() {
      return currentRing;
    },
    get rings() {
      return ringPositions;
    },
    get pad() {
      return padPosition;
    },
    get kind() {
      return kind;
    },
    // the discovery-log line the finish pays under (main.js)
    get finishLabel() {
      return kind === 'climb' ? 'the climb to the clifftop' : 'the daily zoomies race';
    },
    // update(dt, catPos) — while running, accumulates elapsed time and
    // checks the cat against ONLY the current ring (rings[currentRing - 1]);
    // crossing it dims that ring, advances to the next (brightening it), or
    // — on the fifth ring — ends the race.
    update(dt, catPos) {
      if (state !== 'running') return;
      timeMs += dt * 1000;
      const ring = rings[currentRing - 1];
      if (!ring) return;
      if (Math.hypot(catPos.x - ring.x, catPos.z - ring.z) < CROSS_DIST
          && ground.sameLevel(catPos.x, catPos.z, ring.x, ring.z)) {
        ring.mesh.material = dimMat;
        if (currentRing >= rings.length) {
          state = 'done';
        } else {
          currentRing += 1;
          rings[currentRing - 1].mesh.material = brightMat;
        }
      }
    },
    // promptAt(catPos) — only offers the start prompt from the pad while
    // idle; once running or done, the pad is inert (no re-triggering
    // mid-race or after finishing this walk).
    promptAt(catPos) {
      if (state !== 'idle') return null;
      const h = Math.hypot(catPos.x - pad.position.x, catPos.z - pad.position.z);
      if (h >= CROSS_DIST) return null;
      return kind === 'climb' ? 'E — race to the clifftop! 🏁' : 'E — start today’s zoomies race! 🏁';
    },
    begin() {
      if (state !== 'idle') return;
      state = 'running';
      timeMs = 0;
      currentRing = 1;
    },
    dispose() {
      scene.remove(group);
      // brightMat/dimMat are each referenced by multiple ring meshes, so
      // this traversal calls .dispose() on the same shared material more
      // than once — Three's Material.dispose() is idempotent (just fires a
      // 'dispose' event), so that's harmless, unlike a geometry leak would be.
      disposeGroup(group);
    },
  };
}
