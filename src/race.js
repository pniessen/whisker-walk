import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { litMaterial } from './render/materials.js';
import { FLAT_GROUND } from './ground.js';

const RING_RADIUS = 1.1;
export const RING_Y = 1.1; // metres above the ground under the ring
const CROSS_DIST = 1.2; // horizontal distance that counts as "through" a ring/on the pad

// Polish (view clear): a ring close to the camera fades out of the way. Inside
// `end` metres (3D, camera to ring centre) it sits at `min` of its state's
// opacity; past `start` it is back to full; linear in between.
export const NEAR_FADE = { start: 2.5, end: 1.2, min: 0.12 };

// The next ring is a thick candy-striped hoop; every other ring is a thin faint
// one, a little fainter once passed. Ring materials stay transparent for good
// (opacity 1 when solid), so nothing toggles `transparent` while running.
const THICK_TUBE = 0.09;
const THIN_TUBE = 0.04;
const STRIPES = 12;
const CANDY_RED = 0xff5a5f;
const CANDY_CREAM = 0xfff4dc;
const RING_LOOK = {
  current: { color: 0xffffff, emissive: 0x6a2a10, opacity: 1 },
  upcoming: { color: 0xbfe3ff, emissive: 0x16303f, opacity: 0.55 },
  passed: { color: 0xb8e0a8, emissive: 0x16301a, opacity: 0.3 },
};
const POLE_H = 0.6;
const FLAG_YELLOW = 0xffd23f;

// The thick hoop, non-indexed so each triangle carries its own colour: 12
// stripes around the hoop, by the triangle centroid's angle about the centre.
function candyHoopGeometry() {
  const geo = new THREE.TorusGeometry(RING_RADIUS, THICK_TUBE, 10, 36).toNonIndexed();
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const red = new THREE.Color(CANDY_RED);
  const cream = new THREE.Color(CANDY_CREAM);
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const a = Math.atan2(cy, cx) + Math.PI; // 0..2π
    const stripe = Math.min(STRIPES - 1, Math.floor((a / (Math.PI * 2)) * STRIPES));
    const c = stripe % 2 === 0 ? red : cream;
    for (let v = t; v < t + 3; v++) {
      colors[v * 3] = c.r;
      colors[v * 3 + 1] = c.g;
      colors[v * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.userData.tube = THICK_TUBE;
  return geo;
}

function thinHoopGeometry() {
  const geo = new THREE.TorusGeometry(RING_RADIUS, THIN_TUBE, 6, 32);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

// The pennant's flag: one triangle off the pole's top, UVs for the number.
function flagGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0.02, POLE_H, 0, 0.02, POLE_H - 0.3, 0, 0.44, POLE_H - 0.15, 0,
  ]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0.5]), 2));
  geo.computeVertexNormals();
  return geo;
}

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

  // Two shared hoop geometries; each ring has its own material so a ring
  // near the camera can fade on its own. TorusGeometry already lies in the XY
  // plane (hole along Z): the upright hoop the cat runs through.
  const thickGeo = candyHoopGeometry();
  const thinGeo = thinHoopGeometry();

  const rings = course.map((wp) => {
    const mat = litMaterial(0xffffff, { vertexColors: true, transparent: true, emissive: 0x000000 });
    const mesh = new THREE.Mesh(thinGeo, mat);
    mesh.userData.raceRing = true;
    const gy = ground.y(wp.x, wp.z);
    mesh.position.set(wp.x, gy + RING_Y, wp.z);
    group.add(mesh);
    return { x: wp.x, z: wp.z, y: gy, mesh, stateOpacity: 1, fade: 1 };
  });

  // paint(ring, state) — geometry, colour, glow and opacity for one state.
  function paint(ring, state) {
    const look = RING_LOOK[state];
    ring.mesh.geometry = state === 'current' ? thickGeo : thinGeo;
    ring.mesh.material.color.setHex(look.color);
    ring.mesh.material.emissive.setHex(look.emissive);
    ring.stateOpacity = look.opacity;
    ring.mesh.material.opacity = look.opacity * ring.fade;
  }
  rings.forEach((r, i) => paint(r, i === 0 ? 'current' : 'upcoming'));

  // The pennant: a pole and a yellow flag with the next ring's number, standing
  // on top of the current ring. The number is drawn on one small canvas, only
  // where there is a document (never in node tests).
  const pennant = new THREE.Group();
  pennant.name = 'racePennant';
  const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, POLE_H, 6);
  const poleMat = litMaterial(0xf4efe6);
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = POLE_H / 2;
  const flagGeo = flagGeometry();
  let numberCanvas = null;
  let numberTex = null;
  if (typeof document !== 'undefined') {
    numberCanvas = document.createElement('canvas');
    numberCanvas.width = 128;
    numberCanvas.height = 128;
    numberTex = new THREE.CanvasTexture(numberCanvas);
    numberTex.colorSpace = THREE.SRGBColorSpace;
  }
  const flagMat = litMaterial(FLAG_YELLOW, {
    side: THREE.DoubleSide, emissive: 0x5a4400, ...(numberTex ? { map: numberTex } : {}),
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  for (const m of [pole, flag]) {
    m.castShadow = false;
    m.userData.noCast = true;
    pennant.add(m);
  }
  group.add(pennant);

  function drawNumber(n) {
    const ctx = numberCanvas?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#3a2a10';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 44, 66);
    numberTex.needsUpdate = true;
  }

  function placePennant(n) {
    const ring = rings[n - 1];
    if (!ring) {
      pennant.visible = false;
      return;
    }
    pennant.visible = true;
    pennant.position.set(ring.x, ring.y + RING_Y + RING_RADIUS, ring.z);
    drawNumber(n);
  }
  placePennant(1);

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
    // update(dt, catPos, camera) — first, whatever the state, any ring near
    // the camera fades (NEAR_FADE) and the pennant turns to face the camera;
    // with no camera the fades and the pennant stay as they are.
    // Then, while running, accumulates elapsed time and checks the cat against
    // ONLY the current ring (rings[currentRing - 1]); crossing it marks that
    // ring passed, advances to the next (the candy hoop and the pennant move
    // on), or — on the fifth ring — ends the race.
    update(dt, catPos, camera = null) {
      if (camera) {
        const cp = camera.position;
        for (const r of rings) {
          // the nearer of the ring's centre and its hoop (polish-quayside):
          // the hoop is RING_RADIUS out from the centre, so a camera 2 m from
          // the centre can be a hand's breadth from the rim, where the candy
          // stripes filled the corner of the phone. The hoop is upright in
          // the XY plane (TorusGeometry, never turned).
          const qx = cp.x - r.x, qy = cp.y - (r.y + RING_Y), qz = cp.z - r.z;
          const d = Math.min(Math.hypot(qx, qy, qz), Math.hypot(Math.hypot(qx, qy) - RING_RADIUS, qz));
          const k = Math.min(1, Math.max(0, (d - NEAR_FADE.end) / (NEAR_FADE.start - NEAR_FADE.end)));
          r.fade = NEAR_FADE.min + (1 - NEAR_FADE.min) * k;
          r.mesh.material.opacity = r.stateOpacity * r.fade;
        }
        // The flag's front (+Z, the number reads un-mirrored on it) turns to
        // the camera, a snap each frame, so the number never reads backwards.
        pennant.rotation.y = Math.atan2(cp.x - pennant.position.x, cp.z - pennant.position.z);
      }
      if (state !== 'running') return;
      timeMs += dt * 1000;
      const ring = rings[currentRing - 1];
      if (!ring) return;
      if (Math.hypot(catPos.x - ring.x, catPos.z - ring.z) < CROSS_DIST
          && ground.sameLevel(catPos.x, catPos.z, ring.x, ring.z)) {
        paint(ring, 'passed');
        if (currentRing >= rings.length) {
          state = 'done';
          placePennant(0);
        } else {
          currentRing += 1;
          paint(rings[currentRing - 1], 'current');
          placePennant(currentRing);
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
      // Each geometry, material and texture once (the hoop geometries are
      // shared between rings, and swap between them).
      for (const g of [pad.geometry, thickGeo, thinGeo, poleGeo, flagGeo]) g.dispose();
      for (const m of [padMat, poleMat, flagMat, ...rings.map((r) => r.mesh.material)]) m.dispose();
      numberTex?.dispose();
    },
  };
}
