import * as THREE from 'three';
import { bus } from './events.js';
import { cameraOffset, moveDirection, viewForward } from './catcam.js';
import { isStalkMag } from './touchinput.js';
import { hasSkill } from './skills.js';

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

// Zoomies tuning. Two knobs, both baselined at exactly today's behaviour:
//
//  - chargeTime — seconds of accumulated full-speed running before `zooming`
//    engages. 1.5s is the shipped number.
//  - holdTime  — seconds of NOT-running that the charge survives before it is
//    wiped. 0 is the shipped number, i.e. any stop, stalk or freeze resets
//    instantly (see the reset branch below: with holdTime 0 the very first
//    non-running frame resets, exactly as the old unconditional reset did).
export const ZOOM_CHARGE_TIME = 1.5;
export const ZOOM_HOLD_TIME = 0;

// v18 "Cat Skills" — Long Zoomies.
//
// SPEC DISCREPANCY, recorded rather than papered over. The spec's traversal
// table says "Zoomies charge runs 2.5s (from 1.5s)", which reads the 1.5
// constant as the DURATION of the zoomies burst. It is not: 1.5 is the
// charge-UP threshold, and a burst, once engaged, runs for as long as the
// player keeps running — there is no duration to lengthen. Taken literally,
// 1.5 → 2.5 would make the charge-up 67% slower, i.e. a straight nerf, which
// contradicts both the ability's own catalog text ("Your zoomies charge runs
// much longer and recharges faster", src/skills.js) and the spec's locked
// design decision that "abilities make things easier and faster".
//
// So the two halves of the ability are mapped onto the two knobs that
// actually exist, keeping the spec's 2.5 and making both halves a buff:
//
//  - "runs much longer" → the charge now survives 2.5s of not-running, so a
//    corner, a stumble into a collider, or a brief scare no longer throws the
//    whole run away; the zoom picks straight back up.
//  - "recharges faster"  → the charge-up threshold drops 1.5s → 0.9s.
export const LONG_ZOOM_CHARGE_TIME = 0.9;
export const LONG_ZOOM_HOLD_TIME = 2.5;

export const BASE_ZOOM_TUNING = Object.freeze({ chargeTime: ZOOM_CHARGE_TIME, holdTime: ZOOM_HOLD_TIME });
const LONG_ZOOM_TUNING = Object.freeze({ chargeTime: LONG_ZOOM_CHARGE_TIME, holdTime: LONG_ZOOM_HOLD_TIME });

// zoomTuning(state) → the tuning for one save. `state` is the raw save
// object and every read goes through hasSkill, which is total over any input
// (see src/skills.js's hostile-state preamble), so a null/garbage state
// yields the baseline tuning rather than throwing.
export function zoomTuning(state) {
  return hasSkill(state, 'long-zoomies') ? LONG_ZOOM_TUNING : BASE_ZOOM_TUNING;
}

// Per-field coercion with a baseline fallback, so a partially-built tuning
// object (or a NaN out of some future UI slider) degrades to today's number
// instead of poisoning every comparison — `time >= NaN` is false forever,
// which would silently delete the zoomies.
function tuningField(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

// Pure zoomies state machine. `active && !stalking && speedRatio > 0.85 &&
// speedFactor > 0` (full-speed running, not stalking, not frozen) charges
// for `chargeTime` of accumulated time, then flips to `zooming`. A stop,
// stalk or freeze starts draining a hold window; once `holdTime` of
// not-running has accumulated the charge is wiped, so no charge carries over
// and a jittery input can't "bank" partial charge beyond the window.
//
// With the baseline holdTime of 0 the first non-running frame resets — the
// behaviour this function shipped with — and callers that pass no tuning at
// all get exactly that.
//
// Two extra state fields, both absent from the plain
// `{ charging: false, zooming: false, time: 0 }` literals in createPlayer's
// reset paths (hence the ?? defaults below):
//
//  - `idle`   — seconds of not-running accumulated so far in the hold window.
//  - `banked` — "was zooming when the hold window opened". `zooming` itself
//    goes FALSE the instant the cat stops, even inside the hold window,
//    because main.js drives the 77° FOV widening and the sparkle trail
//    straight off player.zooming: leaving it true would leave a stationary
//    cat wearing a wide-angle lens and dribbling sparkles for 2.5s. `banked`
//    is what actually survives the pause, and it snaps the zoom back on the
//    first running frame instead of making the player re-charge.
//
// speedFactor gates the running condition directly (rather than leaving
// freeze-detection to speedRatio alone) because speedRatio's denominator is
// `pace * speedFactor || 1` — when speedFactor is 0 that denominator falls
// back to 1, so residual velocity from before a freeze can push speedRatio
// past 0.85 and falsely read as "still running". Requiring speedFactor > 0
// here makes the reset correct regardless of whether a given freeze call
// site (e.g. a puddle balk) remembers to also call player.halt().
export function zoomState(prev, dt, { active, stalking, speedRatio, speedFactor = 1, chargeTime, holdTime } = {}) {
  const charge = tuningField(chargeTime, ZOOM_CHARGE_TIME);
  const hold = tuningField(holdTime, ZOOM_HOLD_TIME);
  const running = active && !stalking && speedRatio > 0.85 && speedFactor > 0;
  if (!running) {
    const idle = (prev.idle ?? 0) + Math.max(dt, 0);
    if (idle >= hold) return { charging: false, zooming: false, time: 0, idle: 0, banked: false };
    return {
      charging: false,
      zooming: false,
      time: prev.time,
      idle,
      banked: !!(prev.zooming || prev.banked),
    };
  }
  const time = prev.time + dt;
  const zooming = prev.zooming || !!prev.banked || time >= charge;
  return { charging: !zooming, zooming, time, idle: 0, banked: false };
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
  // Long Zoomies tuning. Baseline until a walk-start call site hands us the
  // save (see setZoomTuning); NOT reset by setAvatar/disable, because the
  // ability is permanent and always-on — only the charge STATE resets.
  let zoomTune = BASE_ZOOM_TUNING;

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
    // v18 Long Zoomies. Call with the raw save state at walk start:
    //   player.setZoomTuning(zoomTuning(progression.state))
    // Passing nothing (or anything unusable) restores the baseline tuning, so
    // a caller that has not been threaded yet — and a save without the skill
    // — both get exactly today's 1.5s-charge / instant-reset zoomies.
    setZoomTuning(tuning) {
      zoomTune = tuning && typeof tuning === 'object' ? tuning : BASE_ZOOM_TUNING;
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
      zoom = zoomState(zoom, dt, {
        active: api.inputActive,
        stalking: api.stalking,
        speedRatio,
        speedFactor: api.speedFactor,
        chargeTime: zoomTune.chargeTime,
        holdTime: zoomTune.holdTime,
      });
      const zoomPace = zoom.zooming ? pace * 1.55 : pace;
      const lerpFactor = zoom.zooming ? 1 - Math.pow(0.03, dt) : 1 - Math.pow(0.001, dt);
      velocity.lerp(dir.multiplyScalar(zoomPace * api.speedFactor), lerpFactor);
      avatar.position.addScaledVector(velocity, dt);
      avatar.position.y = api.perchY;

      // Skip collider push while perched (perchY > 0): a perched cat is
      // standing ON the object (car roof, crate, rooftop…), often snapped to
      // that very collider's own center, so this push is exactly what would
      // fight the perch and shove the cat back off it. Grounded cats
      // (perchY === 0) still get pushed out of every collider as before.
      if (api.perchY === 0) {
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
