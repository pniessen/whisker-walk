// =============================================================================
// THE REEF: ITS CREATURES (milestone R4, life). Drawing only, none of it a rule, none of it ever near enough to matter and none of it ever after her:
//   * the FISH SCHOOLS: ONE InstancedMesh (one draw). Every fish is a pure function of time and a hashed phase (fishPose), no state, no rng;
//     the small fish swim in three schools, a few larger slow fish circle the middle. Fewer on the low rung, none of the small fish on the lite rung;
//   * SELA the turtle: slow and friendly, a closed loop of waypoints on the Sandy Flats (three meshes: the body and the two front flippers that flap);
//   * the CRABS: one InstancedMesh, each scuttling a metre to and fro by its own hole, pausing at both ends (they never come toward her);
//   * the BUBBLES: one Points of 60 (20 in reduced motion), six seeps on open sand, each bubble rising on its own phase.
// Reduced motion freezes all of it at its pose for time zero (the fish, turtle, crabs and bubbles stand still; the count of bubbles drops).
// Made by the walk's life, after the sweeps (not in the build's count). Draws no random number and reads no clock: the walk's own dt adds up to `clock`.
// =============================================================================

import * as THREE from 'three';
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
  const along = s.w * t + ph * 0.16 + (big ? hash01(id, SALTS.school) * 0.5 : 0); // the school's own turn plus a little spread along the loop
  const spread = (big ? 0.18 : 0.34) * (hash01(id + 7, SALTS.fish) - 0.5);
  const rx = s.rx * (1 + spread);
  const rz = s.rz * (1 + spread);
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

const FISH_COLOURS = Object.freeze([0xffb35c, 0xff8a7a, 0x8fe3ff, 0xffe27a, 0xb9a2ff, 0x9fe8b4]);
const BIG_COLOURS = Object.freeze([0x6fb7ff, 0xffa8c0, 0xffd47a]);

function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// A body (a squashed eight-sided bead) and a tail (two thin triangles' worth): 16 triangles; length 1 along +z.
export function fishGeometry() {
  const body = new THREE.OctahedronGeometry(0.5, 0).scale(0.28, 0.4, 1);
  const tail = new THREE.OctahedronGeometry(0.5, 0).scale(0.08, 0.38, 0.4).translate(0, 0, -0.62);
  for (const g of [body, tail]) { g.deleteAttribute('uv'); }
  return mergeGeometries([paint(body, 0xffffff), paint(tail, 0xe8e8e8)], false);
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
    mesh.setColorAt(i, color.set(pal[Math.floor(hash01(f.id + 5, SALTS.fish) * pal.length) % pal.length]));
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
        dummy.rotation.set(0, pose.yaw, 0);
        // a flick of the whole body, its tail beat, as a little roll
        dummy.rotation.z = 0.12 * Math.sin(t * 5 + i * 1.7);
        dummy.scale.setScalar(pose.size);
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
  out.y = P.reefY(out.x, out.z) + 1.5 + 0.25 * Math.sin(t * 0.35 + hash01(2, SALTS.turtle) * 6);
  return out;
}

function sphere(w, h, d, r, x, y, z, hex, seg = 8, rings = 5) {
  const g = new THREE.SphereGeometry(r, seg, rings).scale(w, h, d).translate(x, y, z);
  g.deleteAttribute('uv');
  return paint(g, hex);
}
function createTurtle(scene) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = mergeGeometries([
    sphere(1, 0.5, 1.25, 0.5, 0, 0.05, 0, 0x6f9a5a, 10, 6), // the shell
    sphere(1, 0.35, 1.15, 0.5, 0, -0.1, 0, 0xe8dca0, 8, 4), // the belly under it
    sphere(0.5, 0.5, 0.6, 0.3, 0, 0.0, 0.78, 0x9cc27a, 6, 4), // the head
    sphere(0.14, 0.05, 0.16, 0.3, -0.18, -0.02, -0.6, 0x7aa467, 5, 3), // hind flippers
    sphere(0.14, 0.05, 0.16, 0.3, 0.18, -0.02, -0.6, 0x7aa467, 5, 3),
  ], false);
  const flipGeo = sphere(0.9, 0.12, 0.4, 0.3, 0.27, 0, 0, 0x7aa467, 5, 3); // one front flipper (right), pivoting at the shoulder
  const group = new THREE.Group();
  group.name = 'reef:sela';
  const hull = new THREE.Mesh(body, mat);
  const right = new THREE.Mesh(flipGeo, mat);
  const left = new THREE.Mesh(flipGeo, mat);
  right.position.set(0.4, 0, 0.3);
  left.position.set(-0.4, 0, 0.3);
  left.scale.x = -1;
  group.add(hull, right, left);
  group.scale.setScalar(1.15);
  group.traverse((o) => { if (o.isMesh) Object.assign(o.userData, { noCast: true, noContactShadow: true, noMerge: true }); o.frustumCulled = false; });
  scene.add(group);
  const pose = {};
  return {
    group,
    update(t, still) {
      selaPose(still ? 0 : t, pose);
      group.position.set(pose.x, pose.y, pose.z);
      group.rotation.set(0, pose.yaw, 0.04 * Math.sin(t * 0.35));
      const flap = still ? 0 : 0.35 * Math.sin(t * 1.3);
      right.rotation.set(0, 0, flap);
      left.rotation.set(0, 0, -flap);
    },
    dispose() { scene.remove(group); body.dispose(); flipGeo.dispose(); mat.dispose(); },
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
  const geo = mergeGeometries([
    sphere(1, 0.45, 0.8, 0.14, 0, 0.1, 0, 0xe0674a, 6, 4),
    sphere(1, 0.8, 0.8, 0.06, -0.17, 0.12, 0.13, 0xf08a5d, 4, 3),
    sphere(1, 0.8, 0.8, 0.06, 0.17, 0.12, 0.13, 0xf08a5d, 4, 3),
  ], false);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geo, mat, homes.length);
  mesh.name = 'reef:crabs';
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
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
// Bubble i at time t: { x, y, z }. A pure function of (i, t): its own phase, speed and drift.
export function bubblePos(i, t, out = {}) {
  const seep = SEEPS[i % BUBBLES.seeps];
  const ph = hash01(i, SALTS.bubble);
  const speed = 0.45 + 0.4 * hash01(i + 100, SALTS.bubble);
  const rise = (((t * speed + ph * BUBBLES.rise) % BUBBLES.rise) + BUBBLES.rise) % BUBBLES.rise;
  const a = ph * 40 + t * 1.1;
  out.x = seep.x + (hash01(i + 200, SALTS.bubble) - 0.5) * 0.8 + Math.sin(a) * (0.1 + 0.02 * rise);
  out.z = seep.z + (hash01(i + 300, SALTS.bubble) - 0.5) * 0.8 + Math.cos(a * 0.9) * (0.1 + 0.02 * rise);
  out.y = P.reefY(seep.x, seep.z) + 0.15 + rise;
  return out;
}
function createBubbles(scene, reducedMotion) {
  const n = reducedMotion ? BUBBLES.reduced : BUBBLES.count;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 0.14, sizeAttenuation: true, color: 0xdffcff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'reef:bubbles';
  pts.frustumCulled = false;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(pts);
  const pos = geo.attributes.position;
  const p = {};
  return {
    pts,
    count: n,
    update(t) {
      for (let i = 0; i < n; i++) { bubblePos(i, t, p); pos.setXYZ(i, p.x, p.y, p.z); }
      pos.needsUpdate = true;
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
  const bubbles = createBubbles(scene, reducedMotion);
  let clock = 0;
  let frozen = false; // reduced motion: posed once at time zero
  const counts = { rung, fish: fish.count, crabs: crabs.count, bubbles: bubbles.count, meshes: (fish.mesh ? 1 : 0) + 3 + 1 + 1 };
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
