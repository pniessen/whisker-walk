// THE HEAD AIM (Market step 3, Task 7, ruling V10): she looks up at a
// stallholder cooing at her.
//
// OPT-IN, AND AFTER THE POSE. aimHead(cat, target, dt, pose, moveSpeed) runs
// right after animateCat (game/avatar.js for her cat, remotecats.js for a
// partner's) and only ever ADDS a turn to parts.head.rotation. animateCat
// writes head.rotation outright every frame (its base reset), so this later
// write is that frame's only and is gone again next frame unless made again.
// With no target, and no look still easing out (cat.userData.headAim.w is 0,
// or the record was never made), it returns at once and writes nothing: every
// pose of every cat, in every place, is exactly animateCat's. That is why
// src/cat/animator.js is not edited at all (test/headaim.test.js proves it
// over every preset, Hagrid and every pose; catpose/catgolden stay as they were).
//
// The look: the target's bearing from her head, relative to the way she faces
// (cat.rotation.y; forward is the group's -z), wrapped and held to ±maxYaw, and
// its elevation, held to 0..maxUp (she looks up, never down). They are put on
// as a turn then a lift (a head that turns and looks up, with no roll) and
// weighted by w, which eases toward 1 while there is a target and she stands
// or sits (HEAD_AIM.poses, and not walking), else toward 0, at `rate` a second
// (a fifth of a second either way), through a smoothstep so it starts and
// stops softly. The turn itself follows a moving target at most TURN rad/s, so
// a target passing behind her never flips her head from one shoulder to the
// other. The neck's skin, the collar, the neck pieces, the cape's clasp and a
// face scar are refitted to the turned head (animator.js refitNeck, the hook
// it keeps for callers that move the head after it; scarmesh.js fitScars).
//
// Nothing random, no clock, nothing sent, no THREE: one small record
// (cat.userData.headAim = { w, yaw, up }), made on the first target, reused.

import { refitNeck } from './animator.js';
import { fitScars } from './scarmesh.js';

export const HEAD_AIM = Object.freeze({ maxYaw: 0.9, maxUp: 0.55, rate: 5, poses: Object.freeze(['follow', 'requestPet']) });
// Walking (over WALKING m/s, as avatar.js's stalk test) she does not look;
// a coo ends when she moves anyway (marketlive.js). TURN rad/s: how fast the
// look follows a target that moves round her.
const WALKING = 0.3;
const TURN = 4;

const TAU = 2 * Math.PI;
const wrap = (a) => a - TAU * Math.round(a / TAU);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function aimHead(cat, target, dt, pose, moveSpeed = 0) {
  const ud = cat?.userData;
  const head = ud?.parts?.head;
  if (!head) return;
  let aim = ud.headAim;
  if (!target && !(aim?.w > 0)) return;
  const step = dt > 0 ? dt : 0;
  const on = !!target && HEAD_AIM.poses.includes(pose) && !(moveSpeed > WALKING);
  if (!aim) aim = ud.headAim = { w: 0, yaw: 0, up: 0 };
  if (target) {
    // the head's spot in the world: the group's own turn and scale on head.position
    const s = cat.scale;
    const ry = cat.rotation.y;
    const c = Math.cos(ry), n = Math.sin(ry);
    const px = head.position.x * s.x, pz = head.position.z * s.z;
    const dx = target.x - (cat.position.x + px * c + pz * n);
    const dy = target.y - (cat.position.y + head.position.y * s.y);
    const dz = target.z - (cat.position.z - px * n + pz * c);
    const yaw = clamp(wrap(Math.atan2(-dx, -dz) - ry), -HEAD_AIM.maxYaw, HEAD_AIM.maxYaw);
    const up = clamp(Math.atan2(dy, Math.hypot(dx, dz)), 0, HEAD_AIM.maxUp);
    if (Number.isFinite(yaw) && Number.isFinite(up)) {
      if (!(aim.w > 0)) { aim.yaw = yaw; aim.up = up; } // a fresh look starts where it points
      else {
        const most = TURN * step;
        aim.yaw += clamp(yaw - aim.yaw, -most, most);
        aim.up += clamp(up - aim.up, -most, most);
      }
    }
  }
  const k = HEAD_AIM.rate * step;
  aim.w = on ? Math.min(1, aim.w + k) : Math.max(0, aim.w - k);
  if (!(aim.w > 0)) return; // eased out (or not begun): animateCat's pose stands
  const e = aim.w * aim.w * (3 - 2 * aim.w);
  // turn by a, then lift by b (R = Ry(a)·Rx(b)), as the head's XYZ Euler order
  // has it: x = atan2(sin b, cos a cos b), y = asin(sin a cos b), z = atan2(-sin a sin b, cos a)
  const a = aim.yaw * e, b = aim.up * e;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  head.rotation.x += Math.atan2(sb, ca * cb);
  head.rotation.y += Math.asin(clamp(sa * cb, -1, 1));
  head.rotation.z += Math.atan2(-sa * sb, ca);
  refitNeck(cat, pose);
  if (ud.parts.scars) fitScars(cat);
}
