import * as THREE from 'three';
import { bus } from './events.js';
import { cameraOffset, moveDirection, viewForward } from './catcam.js';
import { isStalkMag } from './touchinput.js';

// You ARE the cat: arrows move the cat avatar at its breed's pace, the camera
// follows behind/above with mouse-orbit, and the cat stays centered on screen.

const CAT_RADIUS = 0.35;
const UP = new THREE.Vector3(0, 1, 0);

// Screen-space touch vector {x, z, mag} -> camera-relative world direction,
// rotated by yaw exactly like moveDirection does for keys. Because
// joystickVector already clamps magnitude into x/z, the rotated vector's
// length stays equal to mag, so target speed scales with it for free.
function touchDirection(vec, yaw) {
  return new THREE.Vector3(vec.x, 0, vec.z).applyAxisAngle(UP, yaw);
}

// Pure zoomies state machine. `active && !stalking && speedRatio > 0.85`
// (full-speed running, not stalking) charges for 1.5s of accumulated time,
// then flips to `zooming`. Any stop or stalk resets instantly — no charge
// carries over, so a jittery input can't "bank" partial charge.
export function zoomState(prev, dt, { active, stalking, speedRatio }) {
  const running = active && !stalking && speedRatio > 0.85;
  if (!running) return { charging: false, zooming: false, time: 0 };
  const time = prev.time + dt;
  const zooming = prev.zooming || time >= 1.5;
  return { charging: !zooming, zooming, time };
}

export function createPlayer(camera, canvas) {
  let yaw = 0;
  let pitch = 0.18;
  let enabled = false;
  let avatar = null;
  let pace = 3.5;
  const keys = new Set();
  const velocity = new THREE.Vector3();
  let touchMove = null; // {x, z, mag} | null — overrides keys when set
  let touchEngaged = false;
  let touchMode = false; // set by main when a touch UI is active — gates click-to-lock
  let invertY = false; // settings.invertY — negates the pitch delta in both orbit paths below
  let zoom = { charging: false, zooming: false, time: 0 };

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
      touchMove = null;
      touchEngaged = false;
      zoom = { charging: false, zooming: false, time: 0 };
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
      return keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight') ||
        (!!touchMove && touchMove.mag > 0);
    },
    get stalking() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight') ||
        (!!touchMove && isStalkMag(touchMove.mag));
    },
    get engaged() {
      return api.locked || touchEngaged;
    },
    get zooming() {
      return zoom.zooming;
    },
    setTouchMove(vec) {
      touchMove = vec || null;
    },
    addOrbit(dx, dy) {
      yaw -= dx * 0.0045;
      pitch += (invertY ? -dy : dy) * 0.004;
      pitch = THREE.MathUtils.clamp(pitch, -0.25, 0.85);
    },
    setInvertY(v) {
      invertY = !!v;
    },
    setTouchEngaged(engaged) {
      const next = !!engaged;
      if (touchEngaged === next) return;
      touchEngaged = next;
      bus.emit('player:lockchange', { locked: api.engaged });
    },
    setTouchMode(mode) {
      touchMode = !!mode;
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
      touchMove = null;
      api.setTouchEngaged(false);
      zoom = { charging: false, zooming: false, time: 0 };
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    update(dt, colliders = [], bounds = null) {
      if (!enabled || !avatar) return;
      const dir = touchMove ? touchDirection(touchMove, yaw) : moveDirection(keys, yaw);
      // speedRatio must be read from velocity BEFORE the lerp below moves it
      // toward this frame's target — it reflects how close last frame's
      // actual speed already is to full pace, which is what "full-speed
      // running" (the zoomies charge condition) means.
      const targetSpeedDenom = pace * api.speedFactor || 1; // clamp away from 0 (speedFactor can be 0 while frozen)
      const speedRatio = velocity.length() / Math.max(Math.abs(targetSpeedDenom), 0.0001);
      zoom = zoomState(zoom, dt, { active: api.inputActive, stalking: api.stalking, speedRatio });
      const zoomPace = zoom.zooming ? pace * 1.55 : pace;
      const lerpFactor = zoom.zooming ? 1 - Math.pow(0.03, dt) : 1 - Math.pow(0.001, dt);
      velocity.lerp(dir.multiplyScalar(zoomPace * api.speedFactor), lerpFactor);
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
    if (touchMode) return; // a touch UI handles engagement itself — don't fight it for pointer lock
    if (enabled && !api.locked) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    api.locked = document.pointerLockElement === canvas;
    if (!api.locked) keys.clear();
    // emit engaged (locked || touchEngaged), not raw locked: on desktop
    // touchEngaged is always false so this is identical, but it prevents a
    // stray pointer-lock event on a hybrid/touch device from contradicting
    // touch engagement (e.g. a lock loss while touch controls are active).
    bus.emit('player:lockchange', { locked: api.engaged });
  });
  document.addEventListener('mousemove', (e) => {
    if (!api.locked || !enabled) return;
    yaw -= e.movementX * 0.0024;
    pitch += (invertY ? -e.movementY : e.movementY) * 0.002;
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
