// v17 Cozy Den — the walkable interior. Turns DEN_SPOTS' fixed positions
// (src/den.js — single source of truth for where furniture anchors, shared
// with progression.js's placeDenItem validation) into THREE furniture per
// the player's `placed` record. No THREE import in den.js itself; that
// pure data module stays renderer-free, this one is the renderer.
import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';
import { DEN_SPOTS } from '../den.js';

const mat = (color, extra) => litMaterial(color, extra);
const box = (w, h, d, color, extra) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));

// Same palette structure as neighborhood.build's return — a warm interior
// gets a cozier top/horizon pair than the outdoor blue-sky one, but the
// SHAPE must match (top/horizon keys) since main.js's dusk branch destructures
// areaData.skyDusk unconditionally when duskActive is true.
const SKY_DUSK = { top: 0x2a3a5e, horizon: 0x6a5a7e };

function buildRug(spot) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.04, 20), mat(0xd8834e));
  m.position.set(spot.x, 0.02, spot.z);
  return { mesh: m };
}

function buildCatTree(spot) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 1.6, 8), mat(0x9a7048));
  trunk.position.y = 0.8;
  g.add(trunk);
  const midPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), mat(0xc8a678));
  midPlatform.position.y = 0.7;
  g.add(midPlatform);
  const topPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), mat(0xc8a678));
  topPlatform.position.y = 1.6;
  g.add(topPlatform);
  const topPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 6), mat(0x9a7048));
  topPost.position.y = 1.1;
  g.add(topPost);
  g.position.set(spot.x, 0, spot.z);
  return {
    mesh: g,
    collider: { x: spot.x, z: spot.z, r: 0.5 },
    perch: { x: spot.x, z: spot.z, y: 1.6, label: 'top of the cat tree', vantage: true },
  };
}

function buildFishTank(spot) {
  const g = new THREE.Group();
  const tank = box(0.9, 0.7, 0.5, 0x8ac8e0, { transparent: true, opacity: 0.4 });
  tank.position.y = 0.55;
  g.add(tank);
  const stand = box(0.9, 0.4, 0.5, 0x7a5230);
  stand.position.y = 0.2;
  g.add(stand);
  for (const [fx, fz, rot] of [[-0.15, 0.05, 0.4], [0.18, -0.08, -0.6]]) {
    const fish = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), mat(0xf2924e));
    fish.position.set(fx, 0.55, fz);
    fish.rotation.z = Math.PI / 2 + rot;
    g.add(fish);
  }
  g.position.set(spot.x, 0, spot.z);
  return { mesh: g, collider: { x: spot.x, z: spot.z, r: 0.5 } };
}

function buildBed(spot) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 10, 20), mat(0xe0a0b0));
  m.rotation.x = Math.PI / 2;
  m.position.set(spot.x, 0.14, spot.z);
  return { mesh: m };
}

function buildLamp(spot) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), mat(0x3a3a42));
  pole.position.y = 0.75;
  g.add(pole);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.4, 10, 1, true),
    mat(0xf2e0a0, { emissive: 0x8a6a20, side: THREE.DoubleSide })
  );
  shade.position.y = 1.55;
  g.add(shade);
  g.position.set(spot.x, 0, spot.z);
  return { mesh: g };
}

function buildScratcher(spot) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.1, 10), mat(0xc8a678));
  post.position.y = 0.55;
  g.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12), mat(0x9a7048));
  base.position.y = 0.04;
  g.add(base);
  g.position.set(spot.x, 0, spot.z);
  return { mesh: g, collider: { x: spot.x, z: spot.z, r: 0.3 } };
}

const BUILDERS = {
  rug: buildRug,
  cattree: buildCatTree,
  fishtank: buildFishTank,
  bed: buildBed,
  lamp: buildLamp,
  scratcher: buildScratcher,
};

export function build(scene, { placed = {} } = {}) {
  b.applySky(scene, 0x9fd4e8, 0xcfe8f0);

  const floor = b.ground(18, 0x9a7048);
  scene.add(floor);

  // Three solid walls + a window wall (north) that shows sky instead of a
  // solid panel — a plane tinted the same as the outdoor sky palette above.
  //
  // The south wall (+z) is the CAMERA-side wall: the third-person follow
  // camera sits behind the cat (cameraOffset's `back` term adds to +z at
  // yaw 0 — see src/catcam.js), so a full-height south wall here would sit
  // directly between the camera and the cat, filling the frame with its
  // own flat outward-facing surface (MeshStandardMaterial only renders its
  // front/outward side by default) the instant a den walk starts — the
  // "flat uniform beige frame, no cat visible" bug. This is the standard
  // "open fourth wall" trick interior/dollhouse scenes use: keep the
  // camera-side wall low (a knee-high rail) instead of full height, so the
  // room still reads as bounded from every other angle but never blocks
  // the one camera that's guaranteed to be looking through it. `bounds`
  // (returned below, ±8) is what actually stops the cat from walking out
  // through the open top of this wall — well short of the rail's z=9
  // footprint — not the rail's (nonexistent) collider.
  const wallH = 3.2;
  const railH = 0.4;
  const north = box(18, wallH, 0.2, 0x9fd4e8);
  north.position.set(0, wallH / 2, -9);
  scene.add(north);
  const south = box(18, railH, 0.2, 0xe8d8c0);
  south.position.set(0, railH / 2, 9);
  scene.add(south);
  const east = box(0.2, wallH, 18, 0xe0d0b8);
  east.position.set(9, wallH / 2, 0);
  scene.add(east);
  const west = box(0.2, wallH, 18, 0xe0d0b8);
  west.position.set(-9, wallH / 2, 0);
  scene.add(west);

  // fireplace: a warm box hearth against the south wall, with an emissive
  // ember mesh glowing inside it.
  const hearth = box(2.2, 1.4, 0.4, 0x6a4a3a);
  hearth.position.set(-6, 0.7, 8.7);
  scene.add(hearth);
  const embers = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    mat(0xf2803a, { emissive: 0xd8501a })
  );
  embers.position.set(-6, 0.35, 8.55);
  scene.add(embers);

  const colliders = [];
  const perches = [];
  for (const spot of DEN_SPOTS) {
    const itemId = placed[spot.id];
    const builder = itemId && BUILDERS[itemId];
    if (!builder) continue;
    const built = builder(spot);
    scene.add(built.mesh);
    if (built.collider) colliders.push(built.collider);
    if (built.perch) perches.push(built.perch);
  }

  const cardboardBox = b.cardboardBox(-5, -5, 0.6);
  scene.add(cardboardBox);

  return {
    name: 'Your Den',
    colliders,
    bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
    // z: 4, not 6 — cat.rotation.y = 0 faces -z (main.js), and the
    // third-person camera sits ~4.4 units further +z than the cat
    // (cameraOffset(0, 0.18), see src/catcam.js). At the old z: 6 spawn the
    // camera landed at z ≈ 10.4 — past the south wall's z: 9 footprint
    // entirely. At z: 4 it lands at z ≈ 8.4, comfortably inside the open
    // south rail (see the wall comment above) with room to spare.
    spawn: { x: 0, z: 4 },
    boxes: [{ x: -5, z: -5 }],
    pois: [],
    collectibles: [],
    scenics: [],
    critterSpawns: [],
    moments: [],
    puddles: [],
    skyDusk: SKY_DUSK,
    tippables: [],
    perches,
  };
}
