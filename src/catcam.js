import * as THREE from 'three';

// Third-person cat camera math. Yaw 0 puts the camera at +z of the cat,
// looking toward -z (matching the old first-person forward convention).

const UP = new THREE.Vector3(0, 1, 0);

// `out` lets the per-frame caller (player.update) reuse one vector.
export function cameraOffset(yaw, pitch, dist = 4.5, height = 2.2, out = new THREE.Vector3()) {
  const p = THREE.MathUtils.clamp(pitch, -0.3, 0.9);
  const back = dist * Math.cos(p);
  return out.set(
    Math.sin(yaw) * back,
    height + dist * Math.sin(p) * 0.9,
    Math.cos(yaw) * back
  );
}

export function viewForward(yaw) {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

// The keys that move the cat: the arrows, and W-A-S-D as well (the owner's
// answer 6, 2026-11-15). By key POSITION (event.code), so on a keyboard laid
// out differently it is still the same four keys under the left hand.
// No other key of the game is one of these (E, Q, V, M, T, C, the digits).
export const MOVE_KEYS = Object.freeze({
  up: Object.freeze(['ArrowUp', 'KeyW']),
  down: Object.freeze(['ArrowDown', 'KeyS']),
  left: Object.freeze(['ArrowLeft', 'KeyA']),
  right: Object.freeze(['ArrowRight', 'KeyD']),
});
const LETTER_MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
export const isLetterMoveKey = (code) => LETTER_MOVE_KEYS.has(code);
const held = (keys, list) => keys.has(list[0]) || keys.has(list[1]);

// Any move key held.
export function moveKeyHeld(keys) {
  return held(keys, MOVE_KEYS.up) || held(keys, MOVE_KEYS.down) || held(keys, MOVE_KEYS.left) || held(keys, MOVE_KEYS.right);
}

export function moveDirection(keys, yaw) {
  const dir = new THREE.Vector3();
  if (held(keys, MOVE_KEYS.up)) dir.z -= 1;
  if (held(keys, MOVE_KEYS.down)) dir.z += 1;
  if (held(keys, MOVE_KEYS.left)) dir.x -= 1;
  if (held(keys, MOVE_KEYS.right)) dir.x += 1;
  if (dir.lengthSq() === 0) return dir;
  return dir.normalize().applyAxisAngle(UP, yaw);
}
