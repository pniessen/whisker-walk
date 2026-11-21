// Expression: the eyes and the head follow her when she is near, glance away
// now and then so they never stare, blink, and the smile widens while she is
// looked at. stepGaze runs each frame AFTER applyPose: applyPose rewrites
// every joint's rotation, then the gaze adds its turn on top of the chest,
// neck and head, and sets the eyes and the mouth outright (the poses leave
// them at rest). Everything comes from the spot and the clock, never a roll,
// and nothing here allocates per frame (module-level scratch).
import * as THREE from 'three';

const DEG = Math.PI / 180;

export const GAZE = Object.freeze({
  NEAR: 4, // she is near within this (m, on the ground) ...
  FAR: 5, // ... and stops being near beyond this
  EYE_LEAD: 0.15, // the eyes turn to her over this (s)
  EYE_MAX: 0.3, // the eyes' own turn in the head (rad)
  HEAD_IN: 0.6, // the head, neck and chest come round over this (s)
  HEAD_OUT: 0.8, // and ease back to ahead over this
  LOOK_MAX: 75 * DEG, // the turn stops here
  BEHIND: 110 * DEG, // further round than this, they do not turn
  GLANCE_AFTER: 4, // after looking this long (s) ...
  GLANCE_FOR: 1.2, // ... they glance away for this long
  GLANCE_YAW: 0.25, // and this far (rad), to the side the spot picks
  BLINK_MIN: 2.5, // the gap between blinks (s)
  BLINK_MAX: 5.5,
  BLINK_TIME: 0.12, // a blink, shut and open again (s)
  SMILE_X: 1.15, // the smile's widening while she is near
  SMILE_Y: 1.1,
  SMILE_TIME: 0.4,
});

// How the turn is shared down the body: [joint, its share, the shares above
// it so far]. They add to 1, so the head faces her.
const TURNED = Object.freeze([['chest', 0.18, 0], ['neck', 0.37, 0.18], ['head', 0.45, 0.55]]);
const NOD_MIN = -0.7; // the nod down toward her (rad, + is up)
const NOD_MAX = 0.4;
const BEHIND_GIVE = 0.05; // rad: once looking, she may go this much past BEHIND
const EYE_PITCH_MAX = 0.15; // the eyes look up and down a little
const SETTLE = 4.74; // a critically damped ease is 95% of the way at omega * T = 4.74
const TURN_SPEED = 3; // rad/s: the whole turn never goes faster (the head is 45% of it)
const BLINK_SHUT = 0.1; // the eye's y scale when shut
const BLINK_EVERY = (GAZE.BLINK_MIN + GAZE.BLINK_MAX) / 2;
const BLINK_JIT = (GAZE.BLINK_MAX - GAZE.BLINK_MIN) / 4; // each blink moves this far either way

// ---- blinks ----------------------------------------------------------------------
// A small integer hash of the spot's seed and a blink's number, in [0, 1).
function hash01(seed, k) {
  let h = Math.imul(((seed * 4294967296) >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Blink k starts near (k + seed) * BLINK_EVERY, moved up to BLINK_JIT either
// way by the hash, so two blinks are always BLINK_MIN to BLINK_MAX apart.
const blinkStart = (seed, k) => (k + seed) * BLINK_EVERY + (hash01(seed, k) * 2 - 1) * BLINK_JIT;
const lid = (u) => (u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0);

// How shut the eyes are (1 = shut) for a spot's seed at the walk clock t.
export function blinkAt(seed, t) {
  const k0 = Math.floor(t / BLINK_EVERY - seed);
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const b = lid((t - blinkStart(seed, k)) / GAZE.BLINK_TIME);
    if (b > 0) return b;
  }
  return 0;
}

// ---- the state ---------------------------------------------------------------------
export function createGaze(look) {
  return {
    seed: look.seed,
    side: look.seed < 0.5 ? 1 : -1, // the glance's side: + is the figure's left
    glanceSide: 1, // the side of the glance under way (chosen as it starts)
    near: false,
    looking: false,
    lookT: 0, // seconds of looking since the last glance
    glanceT: -1, // seconds into a glance, < 0 when none
    shiftT: Infinity, // seconds since a gaze shift's blink began
    yaw: 0, yawV: 0, pitch: 0, pitchV: 0, // the whole turn, figure frame
    eyeYaw: 0, eyeYawV: 0, eyePitch: 0, eyePitchV: 0, // the eyes in the head
    smile: 0, // 0..1, linear in time
    // what the gaze last wrote to chest, neck and head (x, y, z each) and
    // what it added, so a frame without applyPose does not add the turn twice
    wrote: new Float64Array(9).fill(NaN),
    added: new Float64Array(9),
  };
}

// ---- easing ------------------------------------------------------------------------
// One step of a critically damped ease toward `to` (exact for any dt), its
// speed held to vmax. Writes EASED.
const EASED = { x: 0, v: 0 };
function ease(x, v, to, omega, dt, vmax) {
  const d = x - to;
  const e = Math.exp(-omega * dt);
  const k = (v + omega * d) * dt;
  let nv = (v - omega * k) * e;
  let nx = to + (d + k) * e;
  const most = vmax * dt;
  if (nx - x > most) nx = x + most;
  else if (x - nx > most) nx = x - most;
  if (nv > vmax) nv = vmax;
  else if (nv < -vmax) nv = -vmax;
  EASED.x = nx;
  EASED.v = nv;
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (k) => k * k * (3 - 2 * k);

// ---- stepGaze ----------------------------------------------------------------------
const Q = new THREE.Quaternion();
const QA = new THREE.Quaternion();
const QB = new THREE.Quaternion();
const EUL = new THREE.Euler();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FIG = new THREE.Vector3();
const HEAD = new THREE.Vector3();
const D = new THREE.Vector3();
const NO_OPTS = Object.freeze({});

// target: her head's world position (the local cat only), or null.
export function stepGaze(person, gaze, dt, t, opts = NO_OPTS) {
  const target = opts.target ?? null;
  const reduced = !!opts.reducedMotion;
  const B = person.bones;
  const g = gaze;

  // the pose's own rotations: if a bone still holds what the gaze wrote last
  // frame (applyPose did not run), take the gaze's turn back off first
  for (let i = 0; i < 3; i++) {
    const r = B[TURNED[i][0]].rotation;
    const w = g.wrote, a = g.added, j = i * 3;
    r.set(r.x === w[j] ? r.x - a[j] : r.x, r.y === w[j + 1] ? r.y - a[j + 1] : r.y, r.z === w[j + 2] ? r.z - a[j + 2] : r.z);
  }

  // where she is, in the figure's frame, from the head
  let looking = false;
  let lookYaw = 0, lookPitch = 0;
  if (target) {
    person.figure.getWorldPosition(FIG);
    const gx = target.x - FIG.x, gz = target.z - FIG.z;
    const ground = Math.sqrt(gx * gx + gz * gz);
    g.near = g.near ? ground <= GAZE.FAR : ground < GAZE.NEAR;
    if (g.near) {
      person.figure.getWorldQuaternion(Q).invert();
      B.head.getWorldPosition(HEAD);
      D.copy(target).sub(HEAD).applyQuaternion(Q);
      lookYaw = Math.atan2(-D.x, -D.z); // forward is -z, + turns to the figure's left
      lookPitch = Math.atan2(D.y, Math.sqrt(D.x * D.x + D.z * D.z));
      // a little give at the edge, so she sitting right at it does not
      // start and stop the look (and its blink) frame after frame
      looking = Math.abs(lookYaw) <= GAZE.BEHIND + (g.looking ? BEHIND_GIVE : 0);
    }
  } else {
    g.near = false;
  }

  // gaze shifts (she is looked at, she is let go, a glance, its end) start
  // with a blink; the glance comes after GLANCE_AFTER of looking, to the
  // spot's side unless there is no room that side, chosen as it starts and
  // kept to its end
  const turn = looking ? clamp(lookYaw, -GAZE.LOOK_MAX, GAZE.LOOK_MAX) : 0;
  if (looking !== g.looking) {
    g.looking = looking;
    g.lookT = 0;
    g.glanceT = -1;
    g.shiftT = 0;
  } else if (looking) {
    if (g.glanceT >= 0) {
      g.glanceT += dt;
      if (g.glanceT >= GAZE.GLANCE_FOR || reduced) { g.glanceT = -1; g.lookT = 0; g.shiftT = 0; }
    } else {
      g.lookT += dt;
      if (g.lookT >= GAZE.GLANCE_AFTER && !reduced) {
        g.glanceT = 0;
        g.shiftT = 0;
        g.glanceSide = Math.abs(turn + g.side * GAZE.GLANCE_YAW) > GAZE.LOOK_MAX ? -g.side : g.side;
      }
    }
  }

  // what the turn and the eyes go to
  let yawTo = 0, pitchTo = 0, gazeYaw = 0;
  if (looking) {
    const glance = g.glanceT >= 0 ? g.glanceSide * GAZE.GLANCE_YAW : 0;
    yawTo = clamp(turn + glance, -GAZE.LOOK_MAX, GAZE.LOOK_MAX); // (she may have moved on since)
    gazeYaw = lookYaw + glance;
    pitchTo = clamp(lookPitch, NOD_MIN, NOD_MAX);
  }

  // ease: in over HEAD_IN, back over HEAD_OUT; reduced motion twice as slow
  const slow = reduced ? 2 : 1;
  const omega = SETTLE / ((looking ? GAZE.HEAD_IN : GAZE.HEAD_OUT) * slow);
  const vmax = TURN_SPEED / slow;
  ease(g.yaw, g.yawV, yawTo, omega, dt, vmax); g.yaw = EASED.x; g.yawV = EASED.v;
  ease(g.pitch, g.pitchV, pitchTo, omega, dt, vmax); g.pitch = EASED.x; g.pitchV = EASED.v;
  // the eyes lead: they take what the head has not turned yet, and settle
  // back in it as the head comes round; going, they ease back with the head
  const eyeOmega = SETTLE / ((looking ? GAZE.EYE_LEAD : GAZE.HEAD_OUT) * slow);
  const eyeYawTo = looking ? clamp(gazeYaw - g.yaw, -GAZE.EYE_MAX, GAZE.EYE_MAX) : 0;
  const eyePitchTo = looking ? clamp(lookPitch - g.pitch, -EYE_PITCH_MAX, EYE_PITCH_MAX) : 0;
  ease(g.eyeYaw, g.eyeYawV, eyeYawTo, eyeOmega, dt, Infinity); g.eyeYaw = EASED.x; g.eyeYawV = EASED.v;
  ease(g.eyePitch, g.eyePitchV, eyePitchTo, eyeOmega, dt, Infinity); g.eyePitch = EASED.x; g.eyePitchV = EASED.v;

  // the turn, shared down the body, on top of the pose. Each joint takes its
  // share of the yaw about the upright and of the nod, so that after joint i
  // the body has turned Ry(yaw * S) Rx(pitch * S), S the shares so far: its
  // own part is Rx(-pitch * before) Ry(yaw * share) Rx(pitch * S). (Adding
  // plain angles would turn each yaw about an axis the nods below have
  // tipped, and the head would overshoot her by a few degrees.)
  for (let i = 0; i < 3; i++) {
    const T = TURNED[i];
    const share = T[1], before = T[2];
    const upTo = before + share;
    QA.setFromAxisAngle(X_AXIS, -g.pitch * before);
    QA.multiply(QB.setFromAxisAngle(Y_AXIS, g.yaw * share));
    QA.multiply(QB.setFromAxisAngle(X_AXIS, g.pitch * upTo));
    EUL.setFromQuaternion(QA, 'YXZ');
    const r = B[T[0]].rotation;
    r.set(r.x + EUL.x, r.y + EUL.y, r.z + EUL.z);
    const j = i * 3;
    g.wrote[j] = r.x; g.wrote[j + 1] = r.y; g.wrote[j + 2] = r.z;
    g.added[j] = EUL.x; g.added[j + 1] = EUL.y; g.added[j + 2] = EUL.z;
  }

  // the eyes: turned, and blinking (both together)
  const blink = Math.max(blinkAt(g.seed, t), lid(g.shiftT / GAZE.BLINK_TIME));
  g.shiftT += dt;
  const sy = 1 - (1 - BLINK_SHUT) * blink;
  B.eyeL.rotation.set(g.eyePitch, g.eyeYaw, 0);
  B.eyeR.rotation.set(g.eyePitch, g.eyeYaw, 0);
  B.eyeL.scale.set(1, sy, 1);
  B.eyeR.scale.set(1, sy, 1);

  // the smile widens while she is looked at, and back as she goes
  g.smile = clamp(g.smile + (looking ? dt : -dt) / GAZE.SMILE_TIME, 0, 1);
  const w = smooth(g.smile);
  B.mouth.scale.set(1 + (GAZE.SMILE_X - 1) * w, 1 + (GAZE.SMILE_Y - 1) * w, 1);
}
