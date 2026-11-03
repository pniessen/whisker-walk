import * as THREE from 'three';

// RUSTLE: low plants a cat pushes through (the Moor's heather) lean away from
// the cat and shiver while it moves, so walking through them looks right.
//
// It is all in the vertex shader. Each vertex carries `aLean`, 0 at the root
// of a stem and 1 at its tip, so roots stay put and tips bend. The walk sets
// the cat's position once a frame (createRustle(...).update). Purely visual:
// no random numbers, no colliders, nothing a co-walk partner could see differ
// in gameplay.

export const RUSTLE_RADIUS = 0.9; // metres from the cat where stems start to lean
export const RUSTLE_PUSH = 0.22; // how far a tip moves at the cat's feet
const SHAKE_SPEED = 3; // cat speed (m/s) for a full shiver
const EASE = 6; // per second

// Patch a material so its stems lean away from uniforms.uCat. Returns the
// uniforms; the mesh keeps them on userData.rustle for createRustle to find.
export function makeRustleMaterial(material) {
  const uniforms = {
    uCat: { value: new THREE.Vector3(0, -100, 0) },
    uPush: { value: 0 },
    uShake: { value: 0 },
    uTime: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aLean;
uniform vec3 uCat;
uniform float uPush;
uniform float uShake;
uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec2 rd = transformed.xz - uCat.xz;
  float rdist = length(rd);
  float rf = (1.0 - smoothstep(0.2, ${RUSTLE_RADIUS.toFixed(2)}, rdist)) * aLean;
  vec2 away = rdist > 1e-4 ? rd / rdist : vec2(1.0, 0.0);
  float wob = sin(uTime * 17.0 + transformed.x * 9.0 + transformed.z * 7.0);
  transformed.xz += away * rf * uPush + vec2(wob, -wob) * rf * uShake * 0.05;
  transformed.y -= rf * uPush * 0.35;
}`);
  };
  material.customProgramCacheKey = () => 'rustle-v1';
  return uniforms;
}

// Finds every rustling mesh in the scene and drives it from the cat.
export function createRustle(scene, { reducedMotion = false } = {}) {
  const sets = [];
  scene.traverse((o) => { if (o.isMesh && o.userData.rustle) sets.push(o.userData.rustle); });
  const last = new THREE.Vector3();
  let have = false;
  let push = 0;
  let shake = 0;
  let time = 0;
  return {
    count: sets.length,
    update(dt, catPos) {
      if (sets.length === 0 || !catPos || !(dt > 0)) return;
      const speed = have ? Math.hypot(catPos.x - last.x, catPos.z - last.z) / dt : 0;
      last.set(catPos.x, catPos.y, catPos.z);
      have = true;
      // A cat up on a rock or a log is not in the heather.
      const pushTarget = catPos.y < 0.5 ? RUSTLE_PUSH : 0;
      const shakeTarget = reducedMotion || catPos.y >= 0.5 ? 0 : Math.min(1, speed / SHAKE_SPEED);
      const k = Math.min(1, dt * EASE);
      push += (pushTarget - push) * k;
      shake += (shakeTarget - shake) * k;
      time += dt;
      for (const u of sets) {
        u.uCat.value.set(catPos.x, catPos.y, catPos.z);
        u.uPush.value = push;
        u.uShake.value = shake;
        u.uTime.value = time;
      }
    },
  };
}
