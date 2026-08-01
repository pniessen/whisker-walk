import * as THREE from 'three';

// Third-person cat camera math. Yaw 0 puts the camera at +z of the cat,
// looking toward -z (matching the old first-person forward convention).

const UP = new THREE.Vector3(0, 1, 0);

export function cameraOffset(yaw, pitch, dist = 4.5, height = 2.2) {
  const p = THREE.MathUtils.clamp(pitch, -0.3, 0.9);
  const back = dist * Math.cos(p);
  return new THREE.Vector3(
    Math.sin(yaw) * back,
    height + dist * Math.sin(p) * 0.9,
    Math.cos(yaw) * back
  );
}

export function viewForward(yaw) {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

export function moveDirection(keys, yaw) {
  const dir = new THREE.Vector3();
  if (keys.has('ArrowUp')) dir.z -= 1;
  if (keys.has('ArrowDown')) dir.z += 1;
  if (keys.has('ArrowLeft')) dir.x -= 1;
  if (keys.has('ArrowRight')) dir.x += 1;
  if (dir.lengthSq() === 0) return dir;
  return dir.normalize().applyAxisAngle(UP, yaw);
}
