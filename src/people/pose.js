// Poses for the jointed person: pose() writes a mode's joint rotations into
// person.target (ruling R1), applyPose() eases the bones toward it and then
// grounds the figure (the hips come down until the lower sole or a knee is on
// y = 0, in the figure's own frame). Looking at the cat is not here (the
// gaze adds its turns after applyPose); the eyes and the mouth stay at rest.
// Nothing here allocates per frame: the scratch objects live at module level
// (the blend state is made once per person, on its first pose).
import * as THREE from 'three';
import { JOINTS, JOINT_INDEX, SEGMENTS } from './parts.js';

const TAU = Math.PI * 2;
const N = JOINTS.length;
const at = (name) => JOINT_INDEX[name] * 3; // offset of a joint's x in target.rot

const PELVIS = at('pelvis');
const CHEST = at('chest');
const NECK = at('neck');
const HEAD = at('head');
// per side, the figure's left (-x) then its right (+x)
const SIDES = [-1, 1].map((sd) => {
  const L = sd < 0 ? 'L' : 'R';
  return Object.freeze({
    sd,
    upperArm: at(`upperArm${L}`), forearm: at(`forearm${L}`), hand: at(`hand${L}`),
    thigh: at(`thigh${L}`), shin: at(`shin${L}`), foot: at(`foot${L}`),
  });
});
const [LEFT, RIGHT] = SIDES;

export const POSE_MODES = Object.freeze(['stand', 'walk', 'wave', 'dismay', 'kneel', 'bow', 'juggle']);

// ---- per-person blend state ----------------------------------------------------
// cur: what the bones were last given (before grounding); from: where a blend
// started. 60 rotations then the pelvis offset.
const STATE = new WeakMap();
function stateOf(person) {
  let st = STATE.get(person);
  if (!st) {
    st = { mode: null, applied: false, w: 1, wa: 1, armEase: 0, from: new Float32Array(N * 3 + 3), cur: new Float32Array(N * 3 + 3) };
    STATE.set(person, st);
  }
  return st;
}

// The stride phase (radians) for metres walked: one cycle is two steps, a step
// 0.8 of the hip height (shorter for older people, see stepOf).
export function strideFor(person, walked) {
  return (walked / (2 * stepOf(person.look))) * TAU;
}

// ---- the pieces of a pose (they write target rotations) -------------------------
function stoop(r, k) {
  if (!k) return;
  r[CHEST] -= 0.15 * k;
  r[NECK] += 0.1 * k;
  r[HEAD] += 0.06 * k;
}

// Arms hang a little out from the body and a little bent.
function relaxedArms(r, t, k, still) {
  for (let i = 0; i < 2; i++) {
    const S = SIDES[i];
    r[S.upperArm + 2] = S.sd * 0.1 * k;
    r[S.upperArm] = 0.04;
    r[S.forearm] = 0.18 + (still ? 0 : 0.03 * Math.sin(t * 0.7 + S.sd));
  }
}

// Each foot flat on the ground under its leg (pitch and roll undone).
function flatFeet(r) {
  for (let i = 0; i < 2; i++) {
    const S = SIDES[i];
    r[S.foot] = -(r[S.thigh] + r[S.shin]);
    r[S.foot + 2] = -(r[PELVIS + 2] + r[S.thigh + 2]);
  }
}

function standing(r, p, look, t, still) {
  const child = look.kind === 'child';
  const older = look.kind === 'older';
  // a slow weight shift from one leg to the other (period about 12.6 s for
  // adults, quicker and bigger for children, smaller for older people)
  const s = still ? 0 : Math.sin(t * (child ? 0.8 : 0.5) + look.seed * TAU);
  const amp = child ? 1.4 : older ? 0.6 : 1;
  p[0] = 0.014 * look.dims.s * s * amp;
  r[PELVIS + 2] = 0.035 * s * amp;
  r[CHEST + 2] = -0.045 * s * amp;
  r[NECK + 2] = 0.02 * s * amp;
  r[CHEST] = -0.01 + (still ? 0 : 0.012 * Math.sin(t * 1.7)); // a breath
  for (let i = 0; i < 2; i++) {
    const S = SIDES[i];
    const relaxed = Math.max(0, -S.sd * s) * amp; // the leg the weight has left
    r[S.thigh] = 0.02 + 0.07 * relaxed;
    r[S.thigh + 2] = -r[PELVIS + 2] * 0.8;
    r[S.shin] = -(0.04 + 0.16 * relaxed + (older ? 0.08 : 0));
  }
  flatFeet(r);
  relaxedArms(r, t, older ? 0.8 : 1, still);
  stoop(r, look.dims.stoop);
}

// ---- the walk ------------------------------------------------------------------
// Driven by metres walked, so a planted foot does not skate: each foot's
// ground contact is fixed in the world through its stance (the heel as it
// lands, the flat sole, then the toe as the heel lifts: "heel to toe"), and the
// leg reaches it by a two-joint solve. In the swing the ankle travels from
// toe-off to the next heel strike (eased, lifted, so the knee folds). The
// thigh swings forward to the kind's amplitude at heel strike; that and the
// step set how low the hips ride, and they rise over the planted leg.
const STEP = 0.8; // a step, in hip heights (a cycle is two)
const HEEL_FLAT = 0.1; // stance phases, as fractions of the cycle: the heel rolls down,
const HEEL_OFF = 0.3; // the sole is flat, the heel lifts,
const TOE_OFF = 0.58; //  the toe leaves (the other foot lands at 0.5)
const STRIKE_PITCH = 0.2; // toe up as the heel lands (rad)
const TOE_PITCH = 0.45; // heel up as the toe leaves (rad)
const KNEE_STANCE = 0.1; // the planted knee, nearly straight (and the front knee as it lands)
const HIP_YAW = 0.08; // the hips turn with the leg that swings forward
const HIP_ROLL = 0.025;
const LIFT = 0.08; // the swing's lift, in leg lengths
const amplitudeOf = (look) => (look.kind === 'older' ? 0.3 : look.kind === 'child' ? 0.46 : 0.4);
// older people stride shorter: their step shrinks with their swing
const stepOf = (look) => STEP * look.dims.hipY * (look.kind === 'older' ? Math.sin(0.3) / Math.sin(0.4) : 1);

const Q_PEL = new THREE.Quaternion();
const Q_A = new THREE.Quaternion();
const Q_B = new THREE.Quaternion();
const EUL = new THREE.Euler();
const HIP = new THREE.Vector3();
const TGT = new THREE.Vector3();
const G = { // the gait's numbers for the person being posed (scratch, no allocation)
  Lt: 0, Ls: 0, Lmax: 0, C: 0, heelZ: 0, heelY: 0, toeZ: 0, toeY: 0,
  Lk: 0, zStrike: 0, flatY: 0, hipX: 0, yaw: 0, roll: 0,
  ax: 0, ay: 0, az: 0, pitch: 0, // one ankle's place and the foot's pitch (out)
};

function gaitFor(look) {
  const d = look.dims;
  const A = amplitudeOf(look);
  G.Lt = d.hipY - d.kneeY;
  G.Ls = d.kneeY - d.ankleY;
  G.Lmax = Math.sqrt(G.Lt * G.Lt + G.Ls * G.Ls + 2 * G.Lt * G.Ls * Math.cos(0.04)); // a knee never quite locked
  G.Lk = Math.sqrt(G.Lt * G.Lt + G.Ls * G.Ls + 2 * G.Lt * G.Ls * Math.cos(KNEE_STANCE));
  G.hipX = d.hipX;
  G.C = 2 * stepOf(look);
  // the flat sole's heel and toe ends (the lowest ring of soleOf), from the
  // ankle, foot frame (+z behind)
  soleOf(d);
  const last = SOLE.length - 4;
  G.heelZ = SOLE[last]; G.heelY = SOLE[last + 1];
  G.toeZ = SOLE[last + 2]; G.toeY = SOLE[last + 3];
  G.flatY = -G.heelY;
  // the heel strike: the thigh forward A, the knee nearly straight
  const f = G.Lt * Math.sin(A) + G.Ls * Math.sin(A - KNEE_STANCE);
  const c = Math.cos(STRIKE_PITCH), s = Math.sin(STRIKE_PITCH);
  // the ankle above the heel's contact, the foot pitched toe-up
  const ankleZoff = -(G.heelY * s + G.heelZ * c); // ankle z minus heel z
  // the heel's contact at strike, from the middle (that leg's hip is a little
  // ahead, the hips turned with it)
  G.zStrike = -f - ankleZoff - G.hipX * Math.sin(HIP_YAW);
}

// the hips' turn and tilt at the left leg's phase uL (into Q_PEL)
function pelvisAt(uL) {
  G.yaw = -HIP_YAW * Math.cos(TAU * uL); // the left hip forward as its heel lands
  G.roll = HIP_ROLL * Math.cos(2 * TAU * uL);
  Q_PEL.setFromEuler(EUL.set(0, G.yaw, G.roll, 'YXZ'));
}

// The pelvis height that leg S at phase u holds up with a nearly straight
// knee (the hips turned as Q_PEL has them).
function hipOver(S, u) {
  footAt(u);
  HIP.set(S.sd * G.hipX, 0, 0).applyQuaternion(Q_PEL);
  const dz = G.az - HIP.z;
  const dx = S.sd * G.hipX - HIP.x;
  return G.ay + Math.sqrt(Math.max(0, G.Lk * G.Lk - dz * dz - dx * dx)) - HIP.y;
}

// a foot pitched by `pitch` about a contact point (cz, cy in the foot frame)
// that sits at Z on the ground: where its ankle is
function pivot(Z, cz, cy, pitch) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  G.az = Z - (cy * s + cz * c);
  G.ay = -(cy * c - cz * s);
  G.pitch = pitch;
}

// one leg at its phase u (0 = heel strike), in the figure frame relative to a
// hip at z = 0: G.az, G.ay, G.pitch
function footAt(u) {
  if (u < TOE_OFF) {
    const heel = G.zStrike + u * G.C; // the planted heel's contact, moving back under her
    if (u < HEEL_FLAT) pivot(heel, G.heelZ, G.heelY, STRIKE_PITCH * (1 - smooth(u / HEEL_FLAT)));
    else if (u < HEEL_OFF) pivot(heel, G.heelZ, G.heelY, 0);
    else pivot(heel + G.toeZ - G.heelZ, G.toeZ, G.toeY, -TOE_PITCH * smooth((u - HEEL_OFF) / (TOE_OFF - HEEL_OFF)));
    return;
  }
  // the swing, in ground terms (Z from where the toe left to the next strike)
  pivot(G.zStrike + TOE_OFF * G.C + G.toeZ - G.heelZ, G.toeZ, G.toeY, -TOE_PITCH);
  const z0 = G.az - TOE_OFF * G.C, y0 = G.ay;
  pivot(G.zStrike, G.heelZ, G.heelY, STRIKE_PITCH);
  const z1 = G.az - G.C, y1 = G.ay;
  const k = (u - TOE_OFF) / (1 - TOE_OFF);
  const e = smooth(k);
  G.az = z0 + (z1 - z0) * e + u * G.C;
  // lifted most early in the swing (the knee folds), landing gently
  G.ay = y0 + (y1 - y0) * e + LIFT * (G.Lt + G.Ls) * 6.75 * k * (1 - k) * (1 - k);
  G.pitch = -TOE_PITCH + (TOE_PITCH + STRIKE_PITCH) * e;
}

// Two-joint solve: thigh (x, z) and knee for the ankle at G.ax/ay/az, then
// the foot's local rotation so its sole has pitch G.pitch in the figure frame.
function legTo(r, S, pelvisY) {
  HIP.set(S.sd * G.hipX, 0, 0).applyQuaternion(Q_PEL);
  HIP.y += pelvisY;
  TGT.set(G.ax - HIP.x, G.ay - HIP.y, G.az - HIP.z).applyQuaternion(Q_A.copy(Q_PEL).invert());
  const { Lt, Ls } = G;
  const dist = Math.min(Math.max(TGT.length(), Math.abs(Lt - Ls) + 1e-4), G.Lmax);
  const ck = (dist * dist - Lt * Lt - Ls * Ls) / (2 * Lt * Ls);
  const knee = Math.acos(Math.min(1, Math.max(-1, ck)));
  const p = (Lt + Ls * Math.cos(knee)) / dist;
  const q = (Ls * Math.sin(knee)) / dist;
  TGT.normalize();
  const sb = Math.min(1, Math.max(-1, TGT.x / Math.max(1e-6, p)));
  const beta = Math.asin(sb);
  const m = p * Math.cos(beta);
  let th = Math.atan2(TGT.z, TGT.y) - Math.atan2(q, -m);
  if (th > Math.PI) th -= TAU; else if (th < -Math.PI) th += TAU;
  r[S.thigh] = th; r[S.thigh + 1] = 0; r[S.thigh + 2] = beta;
  r[S.shin] = -knee;
  // the foot: (pelvis . thigh . shin)^-1 . pitch
  Q_A.copy(Q_PEL).multiply(Q_B.setFromEuler(EUL.set(th, 0, beta, 'XYZ')));
  Q_A.multiply(Q_B.setFromEuler(EUL.set(-knee, 0, 0, 'XYZ'))).invert();
  Q_A.multiply(Q_B.setFromEuler(EUL.set(G.pitch, 0, 0, 'XYZ')));
  EUL.setFromQuaternion(Q_A, 'XYZ');
  r[S.foot] = EUL.x; r[S.foot + 1] = EUL.y; r[S.foot + 2] = EUL.z;
}

function walking(r, p, look, walked) {
  gaitFor(look);
  const A = amplitudeOf(look);
  const uL = ((walked / G.C) % 1 + 1) % 1; // strideFor's phase, as a fraction of the cycle
  // The hips ride on the leg that landed last, its knee nearly straight: low as
  // a heel lands, high over the planted foot. A ramp over the step closes the
  // small gap between the step's end and the next step's start, always
  // downward, so the planted leg always reaches.
  const second = uL >= 0.5;
  const lead = second ? RIGHT : LEFT;
  const ul = second ? uL - 0.5 : uL;
  const base = second ? 0.5 : 0;
  pelvisAt(base);
  const h0 = hipOver(lead, 0);
  pelvisAt(base + 0.5);
  const h1 = hipOver(lead, 0.5);
  pelvisAt(uL);
  const k = ul / 0.5;
  const gap = h0 - h1;
  const hip = hipOver(lead, ul) + (gap <= 0 ? k * gap : -(1 - k) * gap);
  p[1] = hip - look.dims.hipY;
  // the hips turn with the leg that swings forward, the chest against them,
  // the head stays ahead
  r[PELVIS + 1] = G.yaw;
  r[PELVIS + 2] = G.roll;
  r[CHEST + 1] = -1.5 * G.yaw;
  r[NECK + 1] = 0.5 * G.yaw;
  r[CHEST] = -0.05;
  stoop(r, look.dims.stoop);
  for (let i = 0; i < 2; i++) {
    const S = SIDES[i];
    const u = S.sd < 0 ? uL : (uL + 0.5) % 1;
    footAt(u);
    G.ax = S.sd * G.hipX;
    legTo(r, S, hip);
    // the arm swings against its own leg
    const ua = -A * 0.75 * Math.cos(TAU * u);
    r[S.upperArm] = ua;
    r[S.upperArm + 2] = S.sd * 0.07;
    r[S.forearm] = 0.22 + 0.32 * Math.max(0, ua / A);
  }
}

// ---- pose() ------------------------------------------------------------------
// spec: { mode, t (seconds), walked (metres, for the walk), reducedMotion }
export function pose(person, spec) {
  const look = person.look;
  const r = person.target.rot;
  const p = person.target.pelvis;
  r.fill(0);
  p.fill(0);
  const t = spec.t ?? 0;
  const still = !!spec.reducedMotion;
  let mode = spec.mode ?? 'stand';
  if (mode === 'kneel' && look.kind === 'older') mode = 'bow'; // older people never kneel

  const st = stateOf(person);
  let changed = false;
  if (st.mode !== mode) {
    if (st.applied) { st.from.set(st.cur); st.w = 0; st.wa = 0; st.armEase = 0; changed = true; }
    st.mode = mode;
  }

  if (mode === 'walk') walking(r, p, look, spec.walked ?? 0);
  else if (mode === 'kneel') kneeling(r, p, look);
  else if (mode === 'bow') bowing(r, look);
  else {
    standing(r, p, look, t, still);
    if (mode === 'wave') waving(r, t, still);
    else if (mode === 'dismay') dismayed(r, look);
    else if (mode === 'juggle') juggling(r, t);
  }
  if (changed && armFromBones(person, st.from, st.cur, r)) st.armEase = ARM_PEAK * armPath(person, st.from, r) / ARM_VMAX;
}

// A blend starts from the right arm as the bones have it, not as the last
// pose had it: the head scratch sets that arm outright after applyPose (the
// gaze never touches the arms), so standing up from a scratch eases the arm
// from where it was seen. Each joint's Euler is taken in the form nearest
// the new pose's (an Euler has two forms, and each angle its turns of 2 pi),
// so the blend goes the short way. True when the bones were not as the pose
// had them (cur): then the arm's own blend takes long enough that the palm,
// in the chest's frame, goes no faster than the scratch's hand may
// (ARM_VMAX, eased: ARM_PEAK), and longer than the body's when it must.
const ARM_R = [RIGHT.upperArm, RIGHT.forearm, RIGHT.hand];
const ARM_R_BONES = ['upperArmR', 'forearmR', 'handR'];
const ARM_MASK = new Uint8Array(N * 3);
for (const j of ARM_R) ARM_MASK[j] = ARM_MASK[j + 1] = ARM_MASK[j + 2] = 1;
const ARM_VMAX = 1.2; // m/s: the scratch's hand's most (reach.js VMAX, ruling R13)
const ARM_PEAK = 1.5 * 1.05; // a smoothstep blend's top speed is 1.5 times its mean (and some to spare)
const wrapNear = (a, to) => a + TAU * Math.round((to - a) / TAU);
function armFromBones(person, from, cur, r) {
  // (the bones as applyPose left them: the blend is the pose's own, as ever)
  let moved = false;
  for (let i = 0; i < 3 && !moved; i++) {
    const e = person.bones[ARM_R_BONES[i]].rotation, j = ARM_R[i];
    moved = Math.abs(e.x - cur[j]) > 1e-6 || Math.abs(e.y - cur[j + 1]) > 1e-6 || Math.abs(e.z - cur[j + 2]) > 1e-6;
  }
  if (!moved) return false;
  for (let i = 0; i < 3; i++) {
    const e = person.bones[ARM_R_BONES[i]].rotation;
    const j = ARM_R[i];
    const tx = r[j], ty = r[j + 1], tz = r[j + 2];
    // the two forms of an XYZ Euler: (x, y, z) and (x + pi, pi - y, z + pi)
    const ax = wrapNear(e.x, tx), ay = wrapNear(e.y, ty), az = wrapNear(e.z, tz);
    const bx = wrapNear(e.x + Math.PI, tx), by = wrapNear(Math.PI - e.y, ty), bz = wrapNear(e.z + Math.PI, tz);
    const da = Math.abs(ax - tx) + Math.abs(ay - ty) + Math.abs(az - tz);
    const db = Math.abs(bx - tx) + Math.abs(by - ty) + Math.abs(bz - tz);
    if (da <= db) { from[j] = ax; from[j + 1] = ay; from[j + 2] = az; }
    else { from[j] = bx; from[j + 1] = by; from[j + 2] = bz; }
  }
  return true;
}

// The palm's way (the hand's middle, in the chest's frame) as the right arm
// blends from `from` to `r`: its length, from 8 steps.
const ARM_P = new THREE.Vector3();
const ARM_Q = new THREE.Vector3();
const Q_C = new THREE.Quaternion();
function armPath(person, from, r) {
  const B = person.bones;
  const hr = person.look.dims.hand * 0.5;
  let L = 0;
  for (let s = 0; s <= 8; s++) {
    const k = s / 8;
    // from the hand in, each joint's turn and its offset from its parent
    ARM_P.set(0, -0.92 * hr, 0);
    for (let i = 2; i >= 0; i--) {
      const j = ARM_R[i];
      EUL.set(from[j] + (r[j] - from[j]) * k, from[j + 1] + (r[j + 1] - from[j + 1]) * k, from[j + 2] + (r[j + 2] - from[j + 2]) * k, 'XYZ');
      ARM_P.applyQuaternion(Q_C.setFromEuler(EUL));
      if (i > 0) ARM_P.add(B[ARM_R_BONES[i]].position);
    }
    if (s > 0) L += ARM_P.distanceTo(ARM_Q);
    ARM_Q.copy(ARM_P);
  }
  return L;
}

function waving(r, t, still) {
  // the right arm up and out, the elbow bent so the forearm stands up, the
  // palm to her, the forearm swinging from the elbow; the head tips a little
  const w = still ? 0 : Math.sin(t * 7);
  const tilt = r[PELVIS + 2] + r[CHEST + 2]; // the weight shift's lean, undone in the arm
  r[RIGHT.upperArm + 2] = 2.1 + 0.04 * w - tilt;
  r[RIGHT.upperArm] = 0.12;
  r[RIGHT.forearm] = 0;
  r[RIGHT.forearm + 2] = Math.PI - 2.1 + 0.26 * w;
  r[RIGHT.hand + 1] = -Math.PI / 2;
  r[RIGHT.hand + 2] = still ? 0 : 0.15 * Math.sin(t * 7 + 0.6);
  r[HEAD + 2] = -0.08;
}

function dismayed(r, look) {
  // a surprised "oh!": both hands come up by the shoulders and out to the
  // sides, palms forward, the chest back a little. The upper arms go out
  // (and a little forward), the forearms stand up and out from the elbows,
  // so the hands stay well clear of the face whichever way the head turns
  // (ruling R8: at least 0.3 m from the head's middle)
  for (let i = 0; i < 2; i++) {
    const S = SIDES[i];
    r[S.upperArm] = 0.3;
    r[S.upperArm + 2] = S.sd * 0.85;
    r[S.forearm] = 0;
    r[S.forearm + 2] = S.sd * 1.9;
    r[S.hand] = 0;
    r[S.hand + 1] = -S.sd * Math.PI / 2; // the palm, which faces in at rest, to the front
    r[S.hand + 2] = S.sd * 0.3; // the fingers a little nearer upright
  }
  // the chest 0.1 rad back from the person's own stoop (ruling R16): an older
  // person's stoop is 0.15 forward, so they stay a little forward of upright
  // (0.1 back from upright would throw the body back 0.25 rad at once)
  r[CHEST] = 0.1 - 0.15 * look.dims.stoop;
}

function juggling(r, t) {
  for (let i = 0; i < 2; i++) {
    const S = SIDES[i];
    r[S.upperArm] = 0.35 + 0.12 * Math.sin(t * 4.6 + (S.sd > 0 ? 0 : Math.PI));
    r[S.upperArm + 2] = S.sd * 0.12;
    r[S.forearm] = 1.25;
    r[S.hand + 1] = S.sd * 0.6;
  }
}

function kneeling(r, p, look) {
  // down on one knee at their own spot: the right knee on the ground, the
  // right foot pointed behind, the left foot flat in front, a hand held out
  // low and still, palm down
  const d = look.dims;
  gaitFor(look);
  const thR = -0.05; // the right thigh about upright
  const shin = -(Math.PI / 2 + 0.12); // the right shin back along the ground, its ankle a little up
  r[RIGHT.thigh] = thR; r[RIGHT.thigh + 2] = 0.06;
  r[RIGHT.shin] = shin - thR;
  r[RIGHT.foot] = -2.6 - shin; // the foot pointed, its top toward the ground
  // the hips sit a thigh above the knee, the knee its own radius above the ground
  const hip = G.Lt * Math.cos(thR) + Math.max(d.thR[1] * 1.05, d.shR[0]);
  p[1] = hip - d.hipY;
  Q_PEL.identity();
  G.ax = -d.hipX; G.ay = G.flatY; G.az = -0.95 * G.Lt; G.pitch = 0;
  legTo(r, LEFT, hip);
  r[CHEST] = -0.22;
  r[NECK] = 0.12;
  r[RIGHT.upperArm] = 0.72; r[RIGHT.upperArm + 2] = 0.08; r[RIGHT.forearm] = 0.3; r[RIGHT.hand + 1] = -1.3;
  r[LEFT.upperArm] = 0.5; r[LEFT.upperArm + 2] = -0.1; r[LEFT.forearm] = 1.0;
}

function bowing(r, look) {
  // an older person's hello: a bend at the waist, knees soft, both feet flat,
  // the right hand held out low, palm down
  const lean = 0.42; // the chest's whole lean, the stoop included (at most 0.5)
  for (let i = 0; i < 2; i++) {
    const S = SIDES[i];
    r[S.thigh] = 0.1;
    r[S.shin] = -0.16;
  }
  flatFeet(r);
  stoop(r, look.dims.stoop); // its neck and head; the chest's lean is set whole
  r[CHEST] = -lean;
  r[NECK] += 0.2; // the head comes up to see her
  r[RIGHT.upperArm] = 0.55; r[RIGHT.upperArm + 2] = 0.08; r[RIGHT.forearm] = 0.35; r[RIGHT.hand + 1] = -1.3;
  r[LEFT.upperArm] = lean * 0.8; r[LEFT.upperArm + 2] = -0.08; r[LEFT.forearm] = 0.2;
}

// ---- applyPose() ----------------------------------------------------------------
const smooth = (k) => k * k * (3 - 2 * k);

export function applyPose(person, dt, ease = 0.3) {
  const st = stateOf(person);
  const { rot, pelvis } = person.target;
  const cur = st.cur;
  if (!st.applied) { st.applied = true; st.w = 1; st.wa = 1; }
  if (st.w < 1) st.w = ease > 0 ? Math.min(1, st.w + dt / ease) : 1;
  if (st.wa < 1) st.wa = ease > 0 ? Math.min(1, st.wa + dt / Math.max(ease, st.armEase)) : 1;
  const k = smooth(st.w);
  const ka = smooth(st.wa);
  const from = st.from;
  const R = N * 3;
  for (let i = 0; i < R; i++) {
    const w = ARM_MASK[i] ? ka : k;
    cur[i] = w >= 1 ? rot[i] : from[i] + (rot[i] - from[i]) * w;
  }
  for (let i = 0; i < 3; i++) cur[R + i] = k >= 1 ? pelvis[i] : from[R + i] + (pelvis[i] - from[R + i]) * k;

  const B = person.bones;
  for (let j = 0; j < N; j++) B[JOINTS[j]].rotation.set(cur[j * 3], cur[j * 3 + 1], cur[j * 3 + 2]);
  const rp = person.rest.pelvis;
  B.pelvis.position.set(rp.x + cur[R], rp.y + cur[R + 1], rp.z + cur[R + 2]);
  ground(person);
}

// ---- grounding -----------------------------------------------------------------
const PT = new THREE.Vector3();
const INV = new THREE.Matrix4();
const REL = new THREE.Matrix4();
const FEET = ['footL', 'footR'];
const SHINS = ['shinL', 'shinR'];

// The shoe's underside (parts.js: an ellipsoid of half-length 0.5 footLen and
// half-height 0.8 ankleY, centred 0.62 ankleY up and 0.24 footLen forward, cut
// flat at 0.004), as the near build's rings make it: down the middle (z, y
// from the ankle, foot frame, +z behind), heel and toe side of each ring. A
// turning foot rests on one of these corners, so the lowest of them is the
// lowest of the shoe. The last ring is the flat sole's heel and toe ends.
const SOLE_RINGS = (() => {
  const hs = SEGMENTS.near.foot[1];
  const out = [];
  for (let k = 1; k < hs; k++) {
    const th = (k * Math.PI) / hs;
    out.push(Math.sin(th), Math.cos(th)); // every ring: a pointed foot can turn its top down
  }
  return Float64Array.from(out);
})();
const SOLE = new Float64Array(SOLE_RINGS.length * 2); // z, y pairs, filled per person

function soleOf(d) {
  const a = d.ankleY;
  const rz = d.footLen * 0.5;
  const z0 = -d.footLen * 0.24;
  let n = 0;
  for (let i = 0; i < SOLE_RINGS.length; i += 2) {
    const y = Math.max(0.004, a * 0.62 + a * 0.8 * SOLE_RINGS[i + 1]) - a;
    SOLE[n++] = z0 + rz * SOLE_RINGS[i]; SOLE[n++] = y; // the heel's side
    SOLE[n++] = z0 - rz * SOLE_RINGS[i]; SOLE[n++] = y; // the toe's
  }
  return n;
}

function yIn(m, x, y, z) {
  PT.set(x, y, z).applyMatrix4(m);
  return PT.y;
}

// The lowest sole or knee point, figure frame (y up from the figure's floor).
function lowestPoint(person) {
  const d = person.look.dims;
  const B = person.bones;
  person.figure.updateMatrixWorld(true);
  INV.copy(person.figure.matrixWorld).invert();
  let minY = Infinity;
  const n = soleOf(d);
  for (let f = 0; f < 2; f++) {
    REL.multiplyMatrices(INV, B[FEET[f]].matrixWorld);
    for (let i = 0; i < n; i += 2) minY = Math.min(minY, yIn(REL, 0, SOLE[i + 1], SOLE[i]));
  }
  // and the knees, so a kneel rests on its knee: the thigh's and the shin's
  // round ends meet at the knee joint, so its lowest is the joint less the
  // larger radius, whichever way the leg turns
  const knee = Math.max(d.thR[1] * 1.05, d.shR[0]);
  for (let f = 0; f < 2; f++) {
    REL.multiplyMatrices(INV, B[SHINS[f]].matrixWorld);
    minY = Math.min(minY, yIn(REL, 0, 0, 0) - knee);
  }
  return minY;
}

function ground(person) {
  const minY = lowestPoint(person);
  const pel = person.bones.pelvis;
  pel.position.y -= minY;
  pel.updateMatrixWorld(true);
}
