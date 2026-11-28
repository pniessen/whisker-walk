// =============================================================================
// THE REEF: ITS CREATURES (milestone R4, life). Drawing only, none of it a rule, none of it ever near enough to matter and none of it ever after her:
//   * the FISH SCHOOLS: ONE InstancedMesh (one draw). Every fish is a pure function of time and a hashed phase (fishPose), no state, no rng;
//     the small fish swim in three schools, a few larger slow fish circle the middle. Fewer on the low rung, none of the small fish on the lite rung;
//   * SELA the turtle: slow and friendly, a closed loop of waypoints on the Sandy Flats (four meshes: shell, head and the two front flippers; drawn in reefsela.js);
//   * the CRABS: one InstancedMesh, each scuttling a metre to and fro by its own hole, pausing at both ends (they never come toward her);
//   * the BUBBLES: one Points of 60 (36 low, 14 in reduced motion; the bubble sprite and paths are in reefbubbles.js), six seeps on open sand, each bubble rising on its own phase.
// Reduced motion freezes all of it at its pose for time zero (the fish, turtle, crabs and bubbles stand still; the count of bubbles drops).
// Made by the walk's life, after the sweeps (not in the build's count). Draws no random number and reads no clock: the walk's own dt adds up to `clock`.
// =============================================================================

import * as THREE from 'three';
import { buildSela } from './reefsela.js';
import { BUB, bubbleState, makeBubbles, setBubble } from './reefbubbles.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as P from './reefplan.js';

// One salt per stream, all different (test/reefcritters.test.js).
export const SALTS = Object.freeze({ fish: 0x66697368, school: 0x73636f6c, turtle: 0x73656c61, crab: 0x63726162, bubble: 0x62756262, seep: 0x73656570 });

// A whole number and a salt to a number from 0 to 1, by integer arithmetic only (the same on every device).
export function hash01(n, salt) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// 'high' | 'low' | 'lite' from the walk's quality tier (as the Moon reads it: the lite rung has no shadows; the low rungs are 3 and over).
export function reefTier(tier) {
  if (tier && tier.shadows === false) return 'lite';
  if (tier && (tier.name === 'low' || (tier.rung ?? 0) >= 3)) return 'low';
  return 'high';
}

// ---- the fish ---------------------------------------------------------------------------------------------------------
export const SMALL_SCHOOLS = Object.freeze([
  Object.freeze({ x: -22, z: 12, rx: 9, rz: 6, w: 0.11 }), // over the Kelp Garden
  Object.freeze({ x: 14, z: 2, rx: 8, rz: 8, w: -0.13 }), // over the Coral Garden
  Object.freeze({ x: -6, z: -14, rx: 10, rz: 7, w: 0.09 }), // over the Sandy Flats
]);
export const BIG_SCHOOL = Object.freeze({ x: 0, z: 0, rx: 30, rz: 22, w: 0.045 });
export const FISH_COUNT = Object.freeze({ high: { small: 12, big: 6 }, low: { small: 6, big: 6 }, lite: { small: 0, big: 4 } }); // small per school; big in all
export const fishCount = (rung) => {
  const c = FISH_COUNT[rung] ?? FISH_COUNT.high;
  return { small: c.small * SMALL_SCHOOLS.length, big: c.big, total: c.small * SMALL_SCHOOLS.length + c.big };
};

// The fish table (a pure function of its index): big fish come first (so the lite rung's four are the same four), then the small, school by school.
export function fishTable(rung) {
  const c = FISH_COUNT[rung] ?? FISH_COUNT.high;
  const out = [];
  for (let k = 0; k < c.big; k++) out.push({ big: true, school: BIG_SCHOOL, id: 100 + k });
  SMALL_SCHOOLS.forEach((school, s) => { for (let k = 0; k < c.small; k++) out.push({ big: false, school, id: s * 50 + k }); });
  return out;
}

// One fish's pose at time t: { x, y, z, yaw, size }. A pure function of (fish, t): its own phase, radius and height come from the hash.
export function fishPose(fish, t, out = {}) {
  const { school: s, id, big } = fish;
  const ph = hash01(id, SALTS.fish) * Math.PI * 2;
  const along = s.w * t + 0.05 * Math.sin(t * 0.21 + s.x * 0.9) + ph * 0.16 + (big ? hash01(id, SALTS.school) * 0.5 : 0); // the school's own turn plus a little spread along the loop
  const spread = (big ? 0.18 : 0.34) * (hash01(id + 7, SALTS.fish) - 0.5);
  const breathe = 1 + 0.1 * Math.sin(t * 0.17 + s.x * 0.7 + (big ? 0 : ph * 0.12)); // the school swells and narrows as it turns, each fish a little out of step
  const rx = s.rx * (1 + spread) * breathe;
  const rz = s.rz * (1 - spread * 0.5) * (2 - breathe);
  const a = along * Math.PI * 2;
  const wob = (big ? 0.6 : 1.1) * Math.sin(t * 0.7 + ph) * 0.5;
  out.x = s.x + Math.cos(a) * rx + Math.sin(t * 0.5 + ph * 2) * (big ? 0.5 : 0.8) + wob * 0.4;
  out.z = s.z + Math.sin(a) * rz + Math.cos(t * 0.45 + ph) * (big ? 0.5 : 0.8);
  const floor = P.reefY(out.x, out.z);
  out.y = Math.max(floor + 0.9, floor + 1.4 + hash01(id + 3, SALTS.fish) * (big ? 2.2 : 1.6) + 0.35 * Math.sin(t * 0.6 + ph));
  // heading: along the loop (the derivative of the angle), swung by the wobble
  const dx = -Math.sin(a) * rx * Math.sign(s.w) + Math.cos(t * 0.5 + ph * 2) * 0.25;
  const dz = Math.cos(a) * rz * Math.sign(s.w) - Math.sin(t * 0.45 + ph) * 0.2;
  out.yaw = Math.atan2(dx, dz);
  out.size = big ? 0.8 + hash01(id + 11, SALTS.fish) * 0.35 : 0.3 + hash01(id + 11, SALTS.fish) * 0.18;
  return out;
}

const FISH_COLOURS = Object.freeze([0xffb35c, 0xff8a7a, 0x8fe3ff, 0xffe27a, 0xb9a2ff, 0x9fe8b4, 0xff6f91, 0x5fe0c8, 0xffd0f0, 0x7fb6ff]); // beauty pass 1: four more
const BIG_COLOURS = Object.freeze([0x6fb7ff, 0xffa8c0, 0xffd47a]);

function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// Paint a geometry by a function of each vertex (x, y, z) -> grey (0..1) times a tint: the instance's own colour multiplies it, so a dark back, a pale belly,
// a stripe band and a tinted tail are all in the one vertex-coloured geometry (no new draw, no texture).
function shade(g, fn) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.set(fn(pos.getX(i), pos.getY(i), pos.getZ(i))); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// A fish, length 1 along +z (nose at +z): a spindle body that tapers to the tail (dark back, pale belly, one darker stripe band), a forked tail
// (two lobes) and a dorsal fin: 36 triangles.
export function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 6, 3).toNonIndexed(); body.rotateX(Math.PI / 2); body.scale(0.3, 0.46, 1);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) { const k = 0.5 + 0.5 * Math.min(1, Math.max(0, bp.getZ(i) + 0.5)); bp.setX(i, bp.getX(i) * k); bp.setY(i, bp.getY(i) * (0.7 + 0.3 * k)); }
  body.deleteAttribute('uv'); body.deleteAttribute('normal');
  shade(body, (x, y, z) => (Math.abs(z - 0.08) < 0.14 ? 0x8a8a8a : y > 0.05 ? 0xb4b4b4 : y < -0.06 ? 0xffffff : 0xdcdcdc));
  const lobe = (sy) => { const g = new THREE.TetrahedronGeometry(0.3, 0); g.scale(0.06, 0.5, 0.9); g.rotateX(sy * 0.45); g.translate(0, sy * 0.16, -0.64); g.deleteAttribute('uv'); g.deleteAttribute('normal'); return shade(g, () => 0xc8c8c8); };
  const fin = new THREE.TetrahedronGeometry(0.22, 0); fin.scale(0.08, 0.9, 1.3); fin.translate(0, 0.42, -0.05); fin.deleteAttribute('uv'); fin.deleteAttribute('normal');
  shade(fin, () => 0x9a9a9a);
  const g = mergeGeometries([body, lobe(1), lobe(-1), fin], false);
  g.computeVertexNormals();
  return g;
}

function createFish(scene, rung) {
  const table = fishTable(rung);
  const n = table.length;
  if (!n) return { mesh: null, count: 0, update() {}, dispose() {} };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(fishGeometry(), mat, n);
  mesh.name = 'reef:fish';
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  const color = new THREE.Color();
  table.forEach((f, i) => {
    const pal = f.big ? BIG_COLOURS : FISH_COLOURS;
    mesh.setColorAt(i, color.set(pal[Math.floor(hash01(f.id + 5, SALTS.fish) * pal.length) % pal.length]).offsetHSL((hash01(f.id + 21, SALTS.fish) - 0.5) * 0.05, 0, (hash01(f.id + 31, SALTS.fish) - 0.5) * 0.12));
  });
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const pose = {};
  return {
    mesh,
    count: n,
    update(t) {
      for (let i = 0; i < n; i++) {
        fishPose(table[i], t, pose);
        dummy.position.set(pose.x, pose.y, pose.z);
        // the tail beat: the whole body swings a little side to side at its own phase and speed (bigger fish beat slower), with a small roll
        const beat = t * (table[i].big ? 3.2 : 6) + hash01(table[i].id + 41, SALTS.fish) * 6.28;
        dummy.rotation.set(0, pose.yaw + 0.16 * Math.sin(beat), 0.1 * Math.sin(beat + 1.2));
        dummy.scale.set(pose.size, pose.size * (table[i].id % 5 === 3 ? 1.4 : 1), pose.size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); mesh.dispose(); },
  };
}

// ---- Sela the turtle ------------------------------------------------------------------------------------------------------
const FLATS = P.ZONES.find((z) => z.id === 'flats');
// Her loop: six waypoints inside the Sandy Flats (relative to its middle), a slow wide circuit.
export const SELA_WAYPOINTS = Object.freeze([[-6, -3], [-2, -8], [5, -5], [7, 2], [1, 6], [-5, 5]].map(([x, z]) => Object.freeze({ x: FLATS.x + x, z: FLATS.z + z })));
export const SELA_SPEED = 0.45; // metres a second along the loop's chord (a slow swimmer)
const crom = (p0, p1, p2, p3, u) => 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
const dcrom = (p0, p1, p2, p3, u) => 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * u + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * u * u);
const LOOP = SELA_WAYPOINTS.reduce((len, p, i) => len + Math.hypot(SELA_WAYPOINTS[(i + 1) % SELA_WAYPOINTS.length].x - p.x, SELA_WAYPOINTS[(i + 1) % SELA_WAYPOINTS.length].z - p.z), 0);
// Where Sela is at time t: { x, y, z, yaw }; a Catmull-Rom loop through the waypoints, her own start at a hashed point of it.
export function selaPose(t, out = {}) {
  const W = SELA_WAYPOINTS;
  const n = W.length;
  const s = (((t * SELA_SPEED + hash01(1, SALTS.turtle) * LOOP) / LOOP) % 1 + 1) % 1 * n; // 0 to n over the loop
  const i = Math.floor(s) % n;
  const u = s - Math.floor(s);
  const p0 = W[(i + n - 1) % n]; const p1 = W[i]; const p2 = W[(i + 1) % n]; const p3 = W[(i + 2) % n];
  out.x = crom(p0.x, p1.x, p2.x, p3.x, u);
  out.z = crom(p0.z, p1.z, p2.z, p3.z, u);
  const dx = dcrom(p0.x, p1.x, p2.x, p3.x, u);
  const dz = dcrom(p0.z, p1.z, p2.z, p3.z, u);
  out.yaw = Math.atan2(dx, dz);
  out.y = P.reefY(out.x, out.z) + 1.5 + 0.25 * Math.sin(t * 0.35 + hash01(2, SALTS.turtle) * 6) + 0.06 * Math.sin(t * 1.3 + 0.5);
  return out;
}

function sphere(w, h, d, r, x, y, z, hex, seg = 8, rings = 5) {
  const g = new THREE.SphereGeometry(r, seg, rings).scale(w, h, d).translate(x, y, z);
  g.deleteAttribute('uv');
  return paint(g, hex);
}
function createTurtle(scene) {
  const sela = buildSela();
  scene.add(sela.group);
  const pose = {}; const later = {};
  return {
    group: sela.group,
    update(t, still) {
      const tt = still ? 0 : t;
      selaPose(tt, pose);
      selaPose(tt + 0.6, later);
      sela.group.position.set(pose.x, pose.y, pose.z);
      sela.update(tt, still, pose.yaw, later.yaw);
    },
    dispose() { scene.remove(sela.group); sela.dispose(); },
  };
}

// ---- the crabs ----------------------------------------------------------------------------------------------------------
export const CRAB_HOMES = Object.freeze([[-14, 30], [-30, 24], [12, 22], [26, 14], [-4, -4], [-18, -20], [24, -20]].map(([x, z], i) => Object.freeze({ x, z, id: i })));
export const CRAB_COUNT = Object.freeze({ high: 7, low: 4, lite: 4 });
// A crab's pose at time t: it goes a metre one way along its own line, pauses, comes back. Returns { x, y, z, yaw }.
export function crabPose(home, t, out = {}) {
  const yaw = hash01(home.id, SALTS.crab) * Math.PI;
  const u = Math.sin(t * (0.3 + 0.12 * hash01(home.id + 9, SALTS.crab)) + hash01(home.id + 4, SALTS.crab) * 6.28);
  const off = 1.0 * Math.max(-1, Math.min(1, u * 2.2));
  out.x = home.x + Math.cos(yaw) * off;
  out.z = home.z - Math.sin(yaw) * off;
  out.y = P.reefY(out.x, out.z) + 0.06;
  out.yaw = yaw + Math.PI / 2; // a crab walks sideways: its front is across its line
  return out;
}
function createCrabs(scene, rung) {
  const homes = CRAB_HOMES.slice(0, CRAB_COUNT[rung] ?? CRAB_COUNT.high);
  const parts = [
    sphere(1.15, 0.45, 0.8, 0.14, 0, 0.1, 0, 0xd8573c, 6, 3), // the shell, wide
    sphere(0.8, 0.3, 0.5, 0.1, 0, 0.14, 0, 0xea7a55, 5, 2), // a paler crown on it
  ];
  for (const sx of [-1, 1]) {
    parts.push(sphere(0.5, 0.5, 2.2, 0.04, sx * 0.07, 0.19, 0.14, 0x6a3a2a, 3, 2)); // an eye stalk
    parts.push(sphere(1, 1, 1, 0.025, sx * 0.07, 0.235, 0.15, 0x101010, 3, 2)); // its eye
    parts.push(sphere(0.5, 0.4, 2.4, 0.05, sx * 0.17, 0.1, 0.12, 0xd8573c, 3, 2)); // the arm
    parts.push(sphere(1.2, 0.7, 1, 0.07, sx * 0.2, 0.12, 0.25, 0xf08a5d, 5, 3)); // the claw (two pincers' worth of bulk)
    for (const k of [0, 1, 2]) parts.push(sphere(2.2, 0.3, 0.3, 0.05, sx * 0.19, 0.04, -0.07 + k * 0.07, 0x9c3f2c, 3, 2)); // three legs a side
  }
  const geo = mergeGeometries(parts, false);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, homes.length);
  mesh.name = 'reef:crabs';
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  const tone = new THREE.Color();
  homes.forEach((h, i) => mesh.setColorAt(i, tone.setRGB(0.8 + 0.4 * hash01(h.id + 60, SALTS.crab), 0.85 + 0.3 * hash01(h.id + 70, SALTS.crab), 0.85 + 0.25 * hash01(h.id + 80, SALTS.crab)))); // each crab a little redder, browner or paler
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const pose = {};
  return {
    mesh,
    count: homes.length,
    update(t) {
      homes.forEach((h, i) => {
        crabPose(h, t, pose);
        dummy.position.set(pose.x, pose.y, pose.z);
        dummy.rotation.set(0, pose.yaw, 0);
        dummy.scale.setScalar(1.2);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
}

// ---- the bubbles ----------------------------------------------------------------------------------------------------------
export const BUBBLES = Object.freeze({ count: 60, reduced: 20, seeps: 6, rise: 6.5 });
// Six seeps on open sand, each hashed from a zone's middle (a metre of drift, never on a collider).
export const SEEPS = Object.freeze(Array.from({ length: BUBBLES.seeps }, (_, k) => {
  const z = P.ZONES[k % P.ZONES.length];
  const a = hash01(k, SALTS.seep) * Math.PI * 2;
  const r = z.r * (0.45 + 0.3 * hash01(k + 20, SALTS.seep));
  return Object.freeze({ x: z.x + Math.cos(a) * r + (k >= P.ZONES.length ? 9 : 0), z: z.z + Math.sin(a) * r });
}));
// Bubble i at time t: { x, y, z } (the rising path of the realistic bubbles, src/world/reefbubbles.js). A pure function of (i, t).
const bs = {};
export function bubblePos(i, t, out = {}) {
  bubbleState(i, t, SEEPS, false, bs);
  out.x = bs.x; out.y = bs.y; out.z = bs.z;
  return out;
}
function createBubbles(scene, reducedMotion, rung = 'high') {
  const n = reducedMotion ? BUB.reduced : BUB[rung] ?? BUB.high;
  const { geo, mat } = makeBubbles(n);
  const pts = new THREE.Points(geo, mat);
  pts.name = 'reef:bubbles';
  pts.frustumCulled = false;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);
  const s = {};
  return {
    pts,
    count: n,
    update(t) {
      for (let i = 0; i < n; i++) setBubble(geo, i, bubbleState(i, t, SEEPS, reducedMotion, s));
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aB.needsUpdate = true;
    },
    dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); },
  };
}

// createReefCritters({ scene, tier, reducedMotion }) -> { counts, update(dt), dispose() }
export function createReefCritters({ scene, tier, reducedMotion = false }) {
  const rung = reefTier(tier);
  const fish = createFish(scene, rung);
  const sela = createTurtle(scene);
  const crabs = createCrabs(scene, rung);
  const bubbles = createBubbles(scene, reducedMotion, rung);
  let clock = 0;
  let frozen = false; // reduced motion: posed once at time zero
  const counts = { rung, fish: fish.count, crabs: crabs.count, bubbles: bubbles.count, meshes: (fish.mesh ? 1 : 0) + 4 + 1 + 1 };
  const draw = () => { fish.update(clock); sela.update(clock, reducedMotion); crabs.update(clock); bubbles.update(clock); };
  return {
    counts,
    fish, sela, crabs, bubbles,
    update(dt) {
      if (reducedMotion) { if (!frozen) { frozen = true; draw(); } return; }
      clock += Math.max(0, Math.min(dt, 1)) || 0;
      draw();
    },
    dispose() { fish.dispose(); sela.dispose(); crabs.dispose(); bubbles.dispose(); },
  };
}
