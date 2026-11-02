import * as THREE from 'three';
import { animateCat } from './animator.js';

// =============================================================================
// THE WATER LOOK (swimming, Task 5).
//
// The water is opaque, so a cat looks belly-deep or shoulder-deep simply by
// sinking its whole group: everything below WATERLINE (world y, the water's
// surface over ground at 0) is hidden. The poses (animator.js 'wade', 'swim',
// 'shake') only shape what shows above it.
//
// Boots and socks sit under the waterline while wading, so the sink hides them;
// nothing is toggled. The name tag and the chat bubble are children of the
// group, so they sink with the cat and keep their spacing above it.
//
// Reads a water state's `mode` and `shake` (src/waterstate.js); writes `sink`.
// =============================================================================

export const WATERLINE = 0.04;
// Where the waterline sits, as a fraction up the torso's height. A cat swims
// at 0.5 (tuned from 0.6): any deeper and a fluffy cat's floating tail, and
// Digit's head, dip under the water.
export const WATER_FIT = Object.freeze({
  cat: Object.freeze({ wade: 0.2, swim: 0.5 }),
  hagrid: Object.freeze({ wade: 0.25, swim: 0.5 }),
});
export const SINK_RATE = 8; // going down
export const RISE_RATE = 16; // coming up: a cat stepping onto a deck isn't left half-sunk in the boards
export const BOB = Object.freeze({ amp: 0.012, freq: 2.2 });
export const SHAKE_ROLL = 0.28;

const isHagrid = (cat) => cat.userData.breed === 'hagrid';

// waterFit(cat) -> { torsoMin, torsoH }: the torso's standing extent in the
// group's own frame (rig units), measured once the way poseMeasure does it and
// cached on cat.userData.waterFit. It leaves the cat exactly as it found it —
// its transform, its parent link and every part's pose — so it can be called
// mid-frame, after animateCat, without a one-frame glitch.
export function waterFit(cat) {
  if (cat.userData.waterFit) return cat.userData.waterFit;
  const saved = [];
  cat.traverse((o) => saved.push(o, o.position.clone(), o.rotation.clone(), o.scale.clone()));
  const parent = cat.parent;
  cat.parent = null; // measure in the group's own frame, whatever it hangs from
  cat.position.set(0, 0, 0);
  cat.quaternion.identity();
  cat.scale.set(1, 1, 1);
  animateCat(cat, 'follow', 0, 0);
  cat.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(cat.userData.parts.body, true);
  for (let i = 0; i < saved.length; i += 4) {
    saved[i].position.copy(saved[i + 1]);
    saved[i].rotation.copy(saved[i + 2]);
    saved[i].scale.copy(saved[i + 3]);
  }
  cat.parent = parent;
  cat.updateMatrixWorld(true);
  const fit = { torsoMin: box.min.y, torsoH: box.max.y - box.min.y };
  cat.userData.waterFit = fit;
  return fit;
}

// How far the group sinks for a mode: the waterline lands WATER_FIT up the torso.
export function sinkTarget(cat, mode) {
  if (mode !== 'wade' && mode !== 'swim') return 0;
  const { torsoMin, torsoH } = waterFit(cat);
  const k = WATER_FIT[isHagrid(cat) ? 'hagrid' : 'cat'][mode];
  return Math.max(0, cat.scale.y * (torsoMin + k * torsoH) - WATERLINE);
}

const SHAKES = new Set(['follow', 'stalk', 'land']);
const WATERED = new Set(['follow', 'stalk', 'groom', 'requestPet', 'nap']);
const HAGRID_RESTS = new Set(['groom', 'requestPet', 'nap']);

// The pose to draw, given the land pose and the water state. Every pose not
// named here (pounce, scared, fight poses, anything new) passes through.
export function waterPose(pose, st, { hagrid = false, reducedMotion = false } = {}) {
  if (st.shake > 0 && SHAKES.has(pose)) return reducedMotion ? 'follow' : 'shake';
  if (st.mode === 'dry') return pose;
  if (hagrid) return HAGRID_RESTS.has(pose) ? 'follow' : pose;
  return WATERED.has(pose) ? st.mode : pose;
}

// Call after animateCat each frame. baseY is the cat's height without water:
// the local cat passes player.perchY + player.hopY, a remote passes 0. y,
// rotation.x and rotation.z are SET, never added, so nothing can accumulate.
// This is the one place the game writes a walking cat group's rotation.x and
// rotation.z: the shake's roll, and (fight moves and scars, R20) the local
// cat's fight tilt. `fightTilt` is { pitch, roll } while her cat is in a fight
// (avatar.js passes s.fightPitch / s.fightRoll, which game/clanfight.js
// stages: it never writes the group's rotation itself); the order turns to
// 'YXZ' so the yaw stays outermost. With none, rotation.x is 0.
//
// slopeTilt (Gorge part 1, R7): { pitch, roll } to lean the cat into the slope
// under it, or null. A fight's tilt wins (fights stand on level ground). With
// only a slope tilt: order 'YXZ', rotation.x = pitch and rotation.z = roll +
// the shake's roll. With neither (every flat map) it is exactly the lines
// before it.
export function applyWaterLook(cat, st, t, dt, reducedMotion, baseY, amount = 1, fightTilt = null, slopeTilt = null) {
  const target = sinkTarget(cat, st.mode);
  const rate = target > st.sink ? SINK_RATE : RISE_RATE;
  st.sink += (target - st.sink) * (1 - Math.exp(-rate * dt));
  const bob = st.mode === 'swim' && !reducedMotion ? BOB.amp * Math.sin(t * BOB.freq) : 0;
  cat.position.y = baseY - st.sink + bob;
  const roll = st.shake > 0 && !reducedMotion && !isHagrid(cat);
  const shake = roll ? SHAKE_ROLL * Math.sin(t * 30) * amount : 0;
  if (fightTilt) {
    cat.rotation.order = 'YXZ';
    cat.rotation.x = fin(fightTilt.pitch);
    cat.rotation.z = fin(fightTilt.roll) + shake;
  } else if (slopeTilt) {
    cat.rotation.order = 'YXZ';
    cat.rotation.x = slopeTilt.pitch;
    cat.rotation.z = slopeTilt.roll + shake;
  } else {
    cat.rotation.x = 0;
    cat.rotation.z = shake;
  }
}

const fin = (v) => (Number.isFinite(v) ? v : 0);
