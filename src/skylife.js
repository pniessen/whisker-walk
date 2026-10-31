import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

// Birds only. This module used to drift six clouds too (separate lit meshes,
// one draw call per puff, overhead at y 22-28); render/clouds.js replaced
// them with one InstancedMesh far out in the sky (Stream 4 round four).
const HALF_SPAN = 60;
const BIRD_Y = 14;
const BIRD_COUNT = 3;
const BIRD_INTERVAL_MIN = 40;
const BIRD_INTERVAL_MAX = 40; // + rng()*40 → 40..80

function buildBirdMesh() {
  return new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), litMaterial(0x2a2a30));
}

export function createSkyLife(scene, { rng, reducedMotion = false } = {}) {
  // reducedMotion note: birds (foreground darting motion across the view)
  // are skipped entirely.
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
    despawnFlock();
  }

  return { update, dispose };
}
