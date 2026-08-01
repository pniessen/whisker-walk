import * as THREE from 'three';
import { bus } from './events.js';

const WALK_SPEED = 4.2;

export function createPlayer(camera, canvas) {
  let yaw = 0;
  let pitch = 0;
  let enabled = false;
  const keys = new Set();
  const velocity = new THREE.Vector3();

  const api = {
    position: camera.position,
    speedFactor: 1,
    locked: false,
    forward() {
      return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
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
      if (!enabled) return;
      const dir = new THREE.Vector3();
      if (keys.has('KeyW')) dir.z -= 1;
      if (keys.has('KeyS')) dir.z += 1;
      if (keys.has('KeyA')) dir.x -= 1;
      if (keys.has('KeyD')) dir.x += 1;
      dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const speed = WALK_SPEED * api.speedFactor;
      velocity.lerp(dir.multiplyScalar(speed), 1 - Math.pow(0.001, dt));
      camera.position.addScaledVector(velocity, dt);
      camera.position.y = 1.6;

      for (const c of colliders) {
        const dx = camera.position.x - c.x;
        const dz = camera.position.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + 0.4;
        if (d < min && d > 0.0001) {
          camera.position.x = c.x + (dx / d) * min;
          camera.position.z = c.z + (dz / d) * min;
        }
      }
      if (bounds) {
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, bounds.minX, bounds.maxX);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, bounds.minZ, bounds.maxZ);
      }
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
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  });
  document.addEventListener('keydown', (e) => {
    if (enabled) keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));

  return api;
}
