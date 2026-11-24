// How a teleport gate looks (milestone 0: the cheapest placeholder, the 'stonering' look; milestone 1 draws the three
// real looks). LAZY, with the rest of the gates' pieces (src/telehook.js), and called from walk.js beside the map's
// gates, never from an area builder: the same two reasons as world/gateway.js (what the area builders draw is pinned
// by the flat trace and by the places' budgets, and a gate is a walk's own business).
//
// Three meshes per gate, under 200 triangles, one of them transparent:
//   stones  five standing stones in one vertex-coloured geometry: two tall pillars and three leaning arch stones,
//           grey, each a little mossy and none quite alike;
//   disc    one soft, warm, additive disc in the ring (light, never a dark hole), seen from both sides;
//   glow    one flat additive ring on the grass round the foot, so she can see the spot from across the lawn.
// The group sits at the end's spot, its local -z pointing the way she walks through (`faces`). The two pillars are
// solid (r 0.35), so she walks round, not through, the stones; the disc is not, so she can stand in it. Reduced
// motion: nothing here turns, the disc and the glow just sit and shine.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { FLAT_GROUND } from '../ground.js';

export const LOOK_BUDGET = Object.freeze({ meshes: 6, triangles: 480, transparent: 1 });
const OUT_YAW = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };
const CENTRE_Y = 1.45; // m, the ring's middle above the grass
const RING_R = 1.3; // m, the arch stones' circle
const PILLAR_X = 1.3; // m, the two pillars' distance from the middle, along the gate's width
export const STONE_COLLIDER_R = 0.35;

function stone(w, h, d, x, y, rotZ, tint) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateZ(rotZ);
  g.translate(x, y, 0);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(tint);
  for (let i = 0; i < n; i++) {
    // Mossier at the foot: a little green creeps up the lower half.
    const low = Math.max(0, 1 - (g.attributes.position.getY(i) / 1.1));
    col[i * 3] = c.r * (1 - 0.25 * low);
    col[i * 3 + 1] = c.g * (1 + 0.1 * low);
    col[i * 3 + 2] = c.b * (1 - 0.3 * low);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function buildStones() {
  const parts = [
    stone(0.55, 2.0, 0.5, -PILLAR_X, 1.0, 0.04, 0x9a9c92),
    stone(0.5, 2.1, 0.45, PILLAR_X, 1.05, -0.05, 0x8f9189),
  ];
  // Three leaning stones across the top, each tangent to the ring.
  [[60, 0xa3a499], [90, 0x8c8e86], [120, 0x9b9d93]].forEach(([deg, tint]) => {
    const a = (deg * Math.PI) / 180;
    parts.push(stone(0.55, 0.5, 0.45, Math.cos(a) * RING_R, CENTRE_Y + Math.sin(a) * RING_R * 0.95, a - Math.PI / 2 + 0.06, tint));
  });
  return mergeGeometries(parts, false);
}

// One gate's group, at `end`'s spot.
export function buildTeleGate(end, { ground = FLAT_GROUND } = {}) {
  const g = new THREE.Group();
  g.name = 'telegate';
  g.userData.endId = end.id;
  g.position.set(end.x, ground.y(end.x, end.z), end.z);
  g.rotation.y = OUT_YAW[end.faces];

  const stones = new THREE.Mesh(buildStones(), litMaterial(0xffffff, { vertexColors: true, roughness: 0.95 }));
  stones.name = 'teleStones';
  g.add(stones);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 24),
    new THREE.MeshBasicMaterial({ color: 0xffeeb4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  disc.name = 'teleDisc';
  disc.position.set(0, CENTRE_Y, 0);
  disc.userData.noMerge = true;
  disc.userData.noCast = true;
  g.add(disc);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 2.0, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.name = 'teleGlow';
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  glow.userData.noMerge = true;
  glow.userData.noCast = true;
  g.add(glow);
  return g;
}

export const NO_TELE = Object.freeze({ colliders: Object.freeze([]) });

// Adds each end's gate to `scene`; returns { colliders } (the two pillars of each, for walk.js to push on the live
// collider list: never an area's own list).
export function addTeleGates(scene, ends, { ground = FLAT_GROUND } = {}) {
  const colliders = [];
  for (const end of ends) {
    scene.add(buildTeleGate(end, { ground }));
    // The pillars stand at +/- PILLAR_X along the gate's width (local x), which for a gate facing west or east runs along z.
    const along = end.faces === 'north' || end.faces === 'south' ? [1, 0] : [0, 1];
    for (const s of [-1, 1]) colliders.push({ x: end.x + s * PILLAR_X * along[0], z: end.z + s * PILLAR_X * along[1], r: STONE_COLLIDER_R });
  }
  return { colliders };
}
