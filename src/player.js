import * as THREE from 'three';
import { bus } from './events.js';
import { cameraOffset, moveDirection, viewForward } from './catcam.js';

// You ARE the cat: arrows move the cat avatar at its breed's pace, the camera
// follows behind/above with mouse-orbit, and the cat stays centered on screen.

const CAT_RADIUS = 0.35;

export function createPlayer(camera, canvas) {
  let yaw = 0;
  let pitch = 0.18;
  let enabled = false;
  let avatar = null;
  let pace = 3.5;
  const keys = new Set();
  const velocity = new THREE.Vector3();

  const api = {
    locked: false,
    speedFactor: 1, // 0 while frozen by a scare; 1 normally
    perchY: 0,
    setAvatar(cat, catPace) {
      avatar = cat;
      pace = catPace;
      yaw = 0;
      pitch = 0.18;
      velocity.set(0, 0, 0);
      api.perchY = 0;
    },
    forward() {
      return viewForward(yaw);
    },
    get position() {
      return avatar ? avatar.position : camera.position;
    },
    get speed() {
      return velocity.length();
    },
    get inputActive() {
      return keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight');
    },
    get stalking() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    halt() {
      velocity.set(0, 0, 0);
    },
    pounce() {
      const dir = velocity.length() > 0.5 ? velocity.clone().setY(0).normalize() : viewForward(yaw);
      velocity.copy(dir.multiplyScalar(9));
    },
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      keys.clear();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    update(dt, colliders = [], bounds = null) {
      if (!enabled || !avatar) return;
      const dir = moveDirection(keys, yaw);
      velocity.lerp(dir.multiplyScalar(pace * api.speedFactor), 1 - Math.pow(0.001, dt));
      avatar.position.addScaledVector(velocity, dt);
      avatar.position.y = api.perchY;

      for (const c of colliders) {
        const dx = avatar.position.x - c.x;
        const dz = avatar.position.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + CAT_RADIUS;
        if (d < min && d > 0.0001) {
          avatar.position.x = c.x + (dx / d) * min;
          avatar.position.z = c.z + (dz / d) * min;
        }
      }
      if (bounds) {
        avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, bounds.minX, bounds.maxX);
        avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, bounds.minZ, bounds.maxZ);
      }
      if (velocity.length() > 0.15) {
        avatar.rotation.y = Math.atan2(velocity.x, velocity.z) + Math.PI;
      }

      camera.position.copy(avatar.position).add(cameraOffset(yaw, pitch));
      camera.lookAt(avatar.position.x, avatar.position.y + 0.6, avatar.position.z);
    },
  };

  canvas.addEventListener('click', () => {
    if (enabled && !api.locked) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    api.locked = document.pointerLockElement === canvas;
    if (!api.locked) keys.clear();
    bus.emit('player:lockchange', { locked: api.locked });
  });
  document.addEventListener('mousemove', (e) => {
    if (!api.locked || !enabled) return;
    yaw -= e.movementX * 0.0024;
    pitch += e.movementY * 0.002;
    pitch = THREE.MathUtils.clamp(pitch, -0.25, 0.85);
  });
  document.addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));

  return api;
}
