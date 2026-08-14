import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

const HALF_SPAN = 60;
const CLOUD_COUNT = 6;
const CLOUD_Y_BASE = 22;
const CLOUD_Y_RANGE = 6;
const BIRD_Y = 14;
const BIRD_COUNT = 3;
const BIRD_INTERVAL_MIN = 40;
const BIRD_INTERVAL_MAX = 40; // + rng()*40 → 40..80

// Pure helper: mutates plain {x, z, speed} objects in place. Kept free of
// THREE/rng so it's trivially testable and reusable for both cloud drift
// and (indirectly) reasoning about bird paths.
export function advanceClouds(clouds, dt, halfSpan) {
  for (const c of clouds) {
    c.x += c.speed * dt;
    if (c.x > halfSpan) c.x -= halfSpan * 2;
  }
}

function buildCloudMesh(rng) {
  const group = new THREE.Group();
  const puffCount = 2 + Math.floor(rng() * 2); // 2–3 puffs
  const material = litMaterial(0xffffff);
  for (let i = 0; i < puffCount; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), material);
    puff.position.set((rng() - 0.5) * 3, (rng() - 0.5) * 0.6, (rng() - 0.5) * 1.5);
    group.add(puff);
  }
  group.scale.y = 0.45;
  return group;
}

function buildBirdMesh() {
  return new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), litMaterial(0x2a2a30));
}

export function createSkyLife(scene, { rng, reducedMotion = false } = {}) {
  const clouds = [];
  const cloudMeshes = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = {
      x: (rng() - 0.5) * HALF_SPAN * 2,
      z: (rng() - 0.5) * HALF_SPAN * 2,
      speed: 0.4 + rng() * 0.5,
    };
    const mesh = buildCloudMesh(rng);
    mesh.position.set(cloud.x, CLOUD_Y_BASE + rng() * CLOUD_Y_RANGE, cloud.z);
    scene.add(mesh);
    clouds.push(cloud);
    cloudMeshes.push(mesh);
  }

  // reducedMotion note: birds (foreground darting motion across the view)
  // are skipped entirely, but clouds keep their slow ambient drift — same
  // category as weather mood, which reduced-motion also leaves running.
  let birdTimer = BIRD_INTERVAL_MIN + rng() * BIRD_INTERVAL_MAX;
  let activeFlock = null; // { meshes, x, z, vx, vz }

  function spawnFlock() {
    const angle = rng() * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const speed = 4 + rng() * 3;
    const startX = -dirX * HALF_SPAN * 1.2;
    const startZ = -dirZ * HALF_SPAN * 1.2;
    const meshes = [];
    for (let i = 0; i < BIRD_COUNT; i++) {
      const bird = buildBirdMesh();
      bird.position.set(startX - dirX * i * 1.5, BIRD_Y, startZ - dirZ * i * 1.5);
      bird.rotation.x = Math.PI / 2;
      bird.rotation.z = -angle;
      scene.add(bird);
      meshes.push(bird);
    }
    activeFlock = { meshes, vx: dirX * speed, vz: dirZ * speed };
  }

  function despawnFlock() {
    if (!activeFlock) return;
    for (const m of activeFlock.meshes) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    activeFlock = null;
  }

  function update(dt) {
    advanceClouds(clouds, dt, HALF_SPAN);
    for (let i = 0; i < clouds.length; i++) {
      cloudMeshes[i].position.x = clouds[i].x;
    }

    if (reducedMotion) return;

    if (activeFlock) {
      let allOut = true;
      for (const m of activeFlock.meshes) {
        m.position.x += activeFlock.vx * dt;
        m.position.z += activeFlock.vz * dt;
        if (Math.abs(m.position.x) <= HALF_SPAN * 1.2 && Math.abs(m.position.z) <= HALF_SPAN * 1.2) {
          allOut = false;
        }
      }
      if (allOut) despawnFlock();
    } else {
      birdTimer -= dt;
      if (birdTimer <= 0) {
        spawnFlock();
        birdTimer = BIRD_INTERVAL_MIN + rng() * BIRD_INTERVAL_MAX;
      }
    }
  }

  function dispose() {
    for (const mesh of cloudMeshes) {
      scene.remove(mesh);
      for (const puff of mesh.children) {
        puff.geometry.dispose();
      }
      if (mesh.children[0]?.material) mesh.children[0].material.dispose();
    }
    cloudMeshes.length = 0;
    despawnFlock();
  }

  return { update, dispose };
}
