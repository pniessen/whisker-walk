// The head scratch (spec "The head scratch", owner's decision 7): with the
// person kneeling (an older person bows), the right hand comes to her head
// when she is within arm's reach, slowly, from in front and above, by way of
// a point over her head; it rests there with its palm down, CLEAR above her
// head's top as it is on this frame, following it, with a slow stroke along
// her head's front-to-back line. Out of reach (or her head higher than the
// person's shoulder) the hand is held out, low, palm down, toward her, and she
// can come closer; losing reach, it withdraws, rising first. Only the hand
// comes to her: the chest leans at most LEAN_MAX (the pose's lean counted).
//
// Order each frame: pose(), applyPose(), stepGaze(), then stepScratch(). The
// scratch goes last because its two-joint solve has to see the chest as the
// gaze left it (the gaze turns the chest a little); it sets the right
// upper arm, forearm and hand outright and may lean the chest. If a frame
// comes without applyPose, the scratch takes its own lean back off before it
// works (as the gaze does), so nothing accumulates; the gaze's own undo then
// does not see its last turn (the lean changed the chest after it), so with
// the gaze running too, applyPose must run every frame, as the kit's loop does.
//
// "Never through her": given her volumes (catVolumes), a guard keeps every
// limb's surface clear of her head sphere and body capsule on every frame:
// the held hand draws back toward the person and then rises; on the way to
// her and back it rises. Nothing here allocates per frame (module-level
// scratch); a cat's head and body boxes are measured once and kept.
import * as THREE from 'three';

export const REACH = Object.freeze({
  LEAN_MAX: 0.5, // the chest's whole forward lean (rad), the pose's included
  APPROACH: 0.7, // s: held-out to resting on her head
  ABOVE: 0.12, // m: the way in passes this far over her head
  CLEAR: 0.01, // m: the palm rests this far above her head's top
  STROKE: 0.02, // m: the stroke, either way along her head's front-to-back line
  STROKE_HZ: 1.5, // strokes a second
  WITHDRAW: 0.4, // s: back to held-out
  HELD_MAX: 0.55, // m: the held hand is at most this far in front of the person's middle
  HOLD_R: 2.5, // m: the kneel lasts while she is within this (the walk's)
  MIN_TIME: 2.5, // s: and at least this long (the walk's)
  STAND_DELAY: 0.6, // s: they stand this long after she leaves (the walk's)
});

// ---- tuning (my calls, not the spec's) --------------------------------------------
const REACH_IN = 0.95; // a reach starts when the wrist is within this much of the arm's length
const REACH_OUT = 0.985; // and is kept to this (the elbow never quite locked)
const PERCH_GIVE = 0.02; // m: her head this far under the shoulder to start a touch
const HAND_TURN = 0.6; // rad: the hand turns this far at most from the reach to lie along her head
const HAND_RATE = 2.5; // rad/s: the hand's turn while held or resting
const HELD_FWD = 0.4; // the held palm, in front of the middle (x s, the height over 1.75 m)
const HELD_Y = 0.45; // its height (x s)
const HELD_X = 0.12; // to the right of the middle (x s)
const HELD_YAW = 0.5; // rad: it turns toward her up to this
const HELD_RATE = 1.5; // rad/s
const HELD_REACH = 0.92; // the held arm reaches at most this much of its length
const BACK_FWD = 0.12; // the guard's drawn-back hand: just in front of the person (x s)
const BACK_X = 0.3; // and out to the side of the hip (x s)
const LIFT_MAX = 0.6; // m: the guard lifts the hand at most this far
const RISE = 0.1; // m: a withdrawal rises this far first
const GAP = 0.004; // m: each limb's surface stays this clear of her volumes
const STROKE_IN = 0.5; // s: the stroke grows to its size over this
// the elbow's way (chest frame): out, down and back with the arm reaching
// far; out to the side, a little down, with it folded (a close head)
const POLE_FAR = Object.freeze([0.55, -1, 0.25]);
const POLE_NEAR = Object.freeze([1, -0.25, 0.3]);
const EAR_OFF = 0.03; // m (head frame): an ear wholly this far off her midline is left out of her head

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const smooth = (k) => k * k * (3 - 2 * k);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

// ---- her head and body -------------------------------------------------------------
// Boxes in the parts' own frames, measured once per head and body part.
const HEAD_BOX = new WeakMap();
const BODY_BOX = new WeakMap();
const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _pt = new THREE.Vector3();
const _box = new THREE.Box3();

function boxIn(frame, obj, box, skip) {
  _inv.copy(frame.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || o.isSprite || (skip && skip(o))) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) box.expandByPoint(_pt.fromBufferAttribute(pos, i).applyMatrix4(_rel));
  });
  return box;
}

const within = (o, root) => { for (let q = o; q; q = q.parent) if (q === root) return true; return false; };

// Her head's box in the head part's frame: every mesh on it (hats too), but
// not ears that stand wholly off her midline (the hand rests between them; a
// hen's comb is on the midline and counts), nor whiskers (lines).
function headBox(cat) {
  const { head, earL, earR } = cat.userData.parts;
  let box = HEAD_BOX.get(head);
  if (box) return box;
  head.updateWorldMatrix(true, true);
  const off = [];
  for (const ear of [earL, earR]) {
    if (!ear || !within(ear, head)) continue;
    boxIn(head, ear, _box.makeEmpty());
    if (!_box.isEmpty() && (_box.min.x >= EAR_OFF || _box.max.x <= -EAR_OFF)) off.push(ear);
  }
  box = boxIn(head, head, new THREE.Box3(), (o) => off.some((ear) => within(o, ear)));
  HEAD_BOX.set(head, box);
  return box;
}

function bodyBox(cat) {
  const body = cat.userData.parts.body;
  let box = BODY_BOX.get(body);
  if (box) return box;
  const g = body.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  box = g.boundingBox.clone();
  BODY_BOX.set(body, box);
  return box;
}

const _ws = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Her head part's top above its origin (m, world scale): the walk's headTop
// is the head part's world position plus this, straight up.
export function headTopOffset(cat) {
  const head = cat.userData.parts.head;
  const box = headBox(cat);
  head.updateWorldMatrix(true, false);
  head.matrixWorld.decompose(_hp, _q, _ws);
  return box.max.y * _ws.y;
}

const _c = new THREE.Vector3();
const _ax = new THREE.Vector3();

// Her volumes, world space: a head sphere as wide as her head whose top is
// her head's top (where the walk's headTop is), and a body capsule along the
// body part's long axis. out (optional) is filled in place.
export function catVolumes(cat, out) {
  const v = out ?? { head: new THREE.Sphere(), body: { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 } };
  const { head, body } = cat.userData.parts;
  const hb = headBox(cat);
  head.updateWorldMatrix(true, false);
  head.matrixWorld.decompose(_hp, _q, _ws);
  const s = Math.max(_ws.x, _ws.y, _ws.z);
  const rLoc = Math.max(hb.max.x - hb.min.x, hb.max.y - hb.min.y, hb.max.z - hb.min.z) / 2;
  const r = rLoc * s;
  _c.set((hb.min.x + hb.max.x) / 2, hb.max.y - rLoc, (hb.min.z + hb.max.z) / 2).applyMatrix4(head.matrixWorld);
  v.head.center.set(_c.x, _hp.y + hb.max.y * _ws.y - r, _c.z);
  v.head.radius = r;

  const bb = bodyBox(cat);
  body.updateWorldMatrix(true, false);
  const m = body.matrixWorld.elements;
  // the world length of each local axis, and the box's half sizes in metres
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const hx = ((bb.max.x - bb.min.x) / 2) * sx, hy = ((bb.max.y - bb.min.y) / 2) * sy, hz = ((bb.max.z - bb.min.z) / 2) * sz;
  let half, rad, col;
  if (hz >= hx && hz >= hy) { half = hz; rad = Math.max(hx, hy); col = 8; }
  else if (hx >= hy) { half = hx; rad = Math.max(hy, hz); col = 0; }
  else { half = hy; rad = Math.max(hx, hz); col = 4; }
  _c.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2).applyMatrix4(body.matrixWorld);
  _ax.set(m[col], m[col + 1], m[col + 2]).normalize();
  const k = Math.max(0, half - rad);
  v.body.a.copy(_c).addScaledVector(_ax, k);
  v.body.b.copy(_c).addScaledVector(_ax, -k);
  v.body.r = rad;
  return v;
}

// ---- distances ---------------------------------------------------------------------
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _rr = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();

// The closest point's place along a-b (0..1) is left in SEG_K by both.
let SEG_K = 0;
function pointSeg(c, a, b) {
  _d1.subVectors(b, a);
  const L2 = _d1.lengthSq();
  const k = L2 > 1e-12 ? clamp(_rr.subVectors(c, a).dot(_d1) / L2, 0, 1) : 0;
  SEG_K = k;
  return _p1.copy(a).addScaledVector(_d1, k).distanceTo(c);
}

// the closest distance between segments p1-q1 and p2-q2 (Ericson, 5.1.9)
function segSeg(p1, q1, p2, q2) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _rr.subVectors(p1, p2);
  const a = _d1.lengthSq(), e = _d2.lengthSq(), f = _d2.dot(_rr);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { SEG_K = 0; return p1.distanceTo(p2); }
  if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = _d1.dot(_rr);
    if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = _d1.dot(_d2);
      const den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  SEG_K = s;
  _p1.copy(p1).addScaledVector(_d1, s);
  _p2.copy(p2).addScaledVector(_d2, t);
  return _p1.distanceTo(_p2);
}

// ---- the person's arm --------------------------------------------------------------
// The numbers of the person being worked on (scratch, filled per call).
const ARM = {
  a: 0, b: 0, hr: 0, ua0: 0, ua1: 0, fa0: 0, fa1: 0, rHand: 0,
  avail: 0, // the lean the chest has left (rad)
  S: new THREE.Vector3(), E: new THREE.Vector3(), W: new THREE.Vector3(), tip: new THREE.Vector3(),
  reached: false,
};
let PERSON = null;
const _eul = new THREE.Euler(0, 0, 0, 'YXZ');
const _qc = new THREE.Quaternion();
const _qcw = new THREE.Quaternion();
const _qpw = new THREE.Quaternion();
const _mc = new THREE.Matrix4();
const _f = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _u1 = new THREE.Vector3();
const _u2 = new THREE.Vector3();

function armOf(person) {
  PERSON = person;
  const d = person.look.dims;
  ARM.a = d.upperArm;
  ARM.b = d.forearm;
  ARM.hr = d.hand * 0.5;
  ARM.ua0 = d.uaR[0] * 1.06; ARM.ua1 = d.uaR[1]; // the upper arm, shoulder (the deltoid) to elbow
  ARM.fa0 = d.faR[0]; ARM.fa1 = d.faR[1]; // the forearm, elbow to wrist
  ARM.rHand = 0.36 * ARM.hr; // the hand's half thickness (it lies palm down)
  person.bones.chest.parent.getWorldQuaternion(_qpw);
}

// The chest's world matrix and quaternion with `lean` more forward lean.
function chestAt(lean) {
  const chest = PERSON.bones.chest;
  _eul.set(chest.rotation.x - lean, chest.rotation.y, chest.rotation.z, chest.rotation.order);
  _qc.setFromEuler(_eul);
  _mc.compose(chest.position, _qc, chest.scale).premultiply(chest.parent.matrixWorld);
  _qcw.multiplyQuaternions(_qpw, _qc);
}

function shoulderAt(lean, out) {
  chestAt(lean);
  return out.copy(PERSON.bones.upperArmR.position).applyMatrix4(_mc);
}

// the hand's heading on the ground (world yaw, 0 = +z) as a unit vector
const dirOf = (yaw, out) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
const yawOf = (v) => Math.atan2(v.x, v.z);

// The palm's place on the hand (hand frame): the mitten's middle (parts.js:
// 0.92 hr below the wrist, 0.004 out), on its palm side (-x, toward the thigh
// at rest), 0.36 hr from the middle.
const palmLocal = (hr, out) => out.set(0.004 - 0.36 * hr, -0.92 * hr, 0);

// The wrist for the palm at P, palm down, fingers along f: the hand's x is up,
// its -y is f.
function wristFor(P, f, out) {
  const hr = ARM.hr;
  return out.copy(P).addScaledVector(UP, 0.36 * hr - 0.004).addScaledVector(f, -0.92 * hr);
}

const _s = new THREE.Vector3();
// The least lean (0..avail) that brings the wrist W within `len` of the
// shoulder, or -1.
function leanFor(W, len) {
  if (shoulderAt(0, _s).distanceTo(W) <= len) return 0;
  if (ARM.avail <= 0 || shoulderAt(ARM.avail, _s).distanceTo(W) > len) return -1;
  let lo = 0, hi = ARM.avail;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (shoulderAt(mid, _s).distanceTo(W) <= len) hi = mid; else lo = mid;
  }
  return hi;
}

// How clear a limb (a tapered tube a-b, radii r0 to r1) is of her volumes.
function limbClear(a, b, r0, r1, vol) {
  const h = vol.head;
  let m = pointSeg(h.center, a, b) - h.radius - (r0 + (r1 - r0) * SEG_K);
  const by = vol.body;
  m = Math.min(m, segSeg(a, b, by.a, by.b) - by.r - (r0 + (r1 - r0) * SEG_K));
  return m;
}

const _q1 = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _ref = new THREE.Vector3();
// The elbow for pole direction p (unit, perpendicular to n): ARM.E.
function elbowAt(p, ca, sa) {
  ARM.E.copy(ARM.S).addScaledVector(_n, ARM.a * ca).addScaledVector(p, ARM.a * sa);
}
// the pole turned phi round the shoulder-wrist line, from _p0 toward _q1
function poleAt(phi, out) {
  return out.copy(_p0).multiplyScalar(Math.cos(phi)).addScaledVector(_q1, Math.sin(phi));
}
const elbowClear = (vol) => Math.min(limbClear(ARM.S, ARM.E, ARM.ua0, ARM.ua1, vol), limbClear(ARM.E, ARM.W, ARM.fa0, ARM.fa1, vol)) - GAP;

const PHI_MAX = 2.2; // rad: the elbow swings this far at most from its own way, up past out to the side
const PHI_N = 11;

// The arm's joints for the palm at P, fingers along f, the chest leaned by
// `lean`: ARM.S, E, W, tip (and _u1, _u2 for the rotations). The elbow goes
// its own way (out, down, a little back); if that puts the upper arm or the
// forearm in her, it swings round the shoulder-wrist line, up through out to
// the side, as little as clears her.
function solveArm(P, f, lean, vol) {
  shoulderAt(lean, ARM.S);
  wristFor(P, f, ARM.W);
  const { a, b } = ARM;
  _n.subVectors(ARM.W, ARM.S);
  let d = _n.length();
  if (d < 1e-6) { _n.set(0, -1, 0); d = 1e-6; } else _n.divideScalar(d);
  const dMax = REACH_OUT * (a + b);
  ARM.reached = d <= dMax + 1e-9;
  d = clamp(d, Math.abs(a - b) + 1e-3, dMax);
  ARM.W.copy(ARM.S).addScaledVector(_n, d);
  ARM.tip.copy(ARM.W).addScaledVector(f, 1.92 * ARM.hr);
  const k = smooth(clamp((d / (a + b) - 0.55) / 0.35, 0, 1));
  _p0.set(POLE_NEAR[0] + (POLE_FAR[0] - POLE_NEAR[0]) * k, POLE_NEAR[1] + (POLE_FAR[1] - POLE_NEAR[1]) * k,
    POLE_NEAR[2] + (POLE_FAR[2] - POLE_NEAR[2]) * k).applyQuaternion(_qcw);
  _p0.addScaledVector(_n, -_p0.dot(_n));
  if (_p0.lengthSq() < 1e-8) _p0.set(1, 0, 0).applyQuaternion(_qcw).addScaledVector(_n, -_n.x);
  _p0.normalize();
  const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sa = Math.sqrt(1 - ca * ca);
  elbowAt(_p0, ca, sa);
  if (vol && elbowClear(vol) < 0) {
    // the other way round the line: the one that goes up (out to the side first)
    _q1.crossVectors(_n, _p0);
    _ref.set(0.5, 1, 0).applyQuaternion(_qcw);
    if (_q1.dot(_ref) < 0) _q1.negate();
    let lo = 0, hi = -1, best = -Infinity, bestPhi = 0;
    for (let i = 1; i <= PHI_N; i++) {
      const phi = (i / PHI_N) * PHI_MAX;
      elbowAt(poleAt(phi, _pole), ca, sa);
      const m = elbowClear(vol);
      if (m >= 0) { hi = phi; break; }
      if (m > best) { best = m; bestPhi = phi; }
      lo = phi;
    }
    if (hi < 0) hi = bestPhi;
    else {
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2;
        elbowAt(poleAt(mid, _pole), ca, sa);
        if (elbowClear(vol) >= 0) hi = mid; else lo = mid;
      }
    }
    elbowAt(poleAt(hi, _pole), ca, sa);
  }
  _u1.subVectors(ARM.E, ARM.S).divideScalar(a);
  _u2.subVectors(ARM.W, ARM.E).divideScalar(b);
}

// How clear the solved arm is of her volumes (m; < 0 is too near).
function clearOf(vol) {
  if (!vol) return Infinity;
  return Math.min(elbowClear(vol), limbClear(ARM.W, ARM.tip, ARM.rHand, ARM.rHand, vol) - GAP);
}

const _wr = new THREE.Vector3();
// The arm solved for P (fingers f), the chest leaning as little as reaches it
// (all it has when it cannot): its clearance. Leaves the lean in LEAN.
let LEAN = 0;
function tryAt(P, f, vol) {
  wristFor(P, f, _wr);
  const lean = leanFor(_wr, REACH_OUT * (ARM.a + ARM.b));
  LEAN = lean < 0 ? ARM.avail : lean;
  solveArm(P, f, LEAN, vol);
  return clearOf(vol);
}

// ---- the guard ---------------------------------------------------------------------
// The first clear point along a way out from P: drawn back to `back` (when
// given) over the first half, then up by LIFT_MAX. Writes OUT.
const OUT = new THREE.Vector3();
const _back = new THREE.Vector3();
function wayOut(P, back, s, out) {
  if (!back) return out.copy(P).addScaledVector(UP, s * LIFT_MAX);
  if (s <= 0.5) return out.lerpVectors(P, back, s * 2);
  return out.copy(back).addScaledVector(UP, (s - 0.5) * 2 * LIFT_MAX);
}
function guard(P, f, vol, back) {
  OUT.copy(P);
  if (tryAt(OUT, f, vol) >= 0) return OUT; // (always, with no volumes)
  const N = 24;
  let lo = 0, hi = -1, best = -Infinity, bestS = 0;
  for (let i = 1; i <= N; i++) {
    const s = i / N;
    const m = tryAt(wayOut(P, back, s, OUT), f, vol);
    if (m >= 0) { hi = s; break; }
    if (m > best) { best = m; bestS = s; }
    lo = s;
  }
  if (hi < 0) hi = bestS; // nowhere clear (she is in the person): the least bad
  else {
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      if (tryAt(wayOut(P, back, mid, OUT), f, vol) >= 0) hi = mid; else lo = mid;
    }
  }
  tryAt(wayOut(P, back, hi, OUT), f, vol); // the arm (and LEAN) left solved for OUT
  return OUT;
}

// ---- the state ---------------------------------------------------------------------
export function createScratch() {
  return {
    state: 'held',
    t: 0, // seconds in this state
    started: false,
    from: new THREE.Vector3(), // the palm where this move began (world)
    yawFrom: 0, // the hand's heading where it began
    palm: new THREE.Vector3(), // the palm last frame (world)
    yaw: 0, // the hand's heading (world yaw of the fingers)
    heldYaw: 0, // the held hand's turn toward her (figure frame, + to the figure's right)
    lean: 0,
    wrote: new Float64Array(3).fill(NaN), // the chest's rotation after the lean, and before it
    before: new Float64Array(3),
  };
}

// The palm's place in the world (for tests and the picture sheet).
const _pl = new THREE.Vector3();
export function palmPoint(person, out) {
  person.bones.handR.updateWorldMatrix(true, false);
  return person.bones.handR.localToWorld(palmLocal(person.look.dims.hand * 0.5, out ?? _pl));
}

const NO_OPTS = Object.freeze({});
const _top = new THREE.Vector3();
const _T = new THREE.Vector3();
const _A = new THREE.Vector3();
const _held = new THREE.Vector3();
const _P = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const _line = new THREE.Vector3();
const _loc = new THREE.Vector3();
const _fq = new THREE.Quaternion();
const _ft = new THREE.Vector3();
const _s0 = new THREE.Vector3();
const _hd = new THREE.Vector3();

function cubic(p0, p1, p2, p3, u, out) {
  const v = 1 - u;
  const k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
  return out.set(
    k0 * p0.x + k1 * p1.x + k2 * p2.x + k3 * p3.x,
    k0 * p0.y + k1 * p1.y + k2 * p2.y + k3 * p3.y,
    k0 * p0.z + k1 * p1.z + k2 * p2.z + k3 * p3.z,
  );
}

// The way in: up from where the hand was, over and down through the point
// ABOVE her head (seg 1, 70% of the time), then straight down to the touch.
const SEG1 = 0.7;
function approachAt(from, A, T, u, out) {
  if (u >= SEG1) return out.lerpVectors(A, T, (u - SEG1) / (1 - SEG1));
  _c1.copy(from); _c1.y = Math.max(from.y, A.y); // up first
  // arrive at A moving down at the speed the second part goes on with
  _c2.copy(A).addScaledVector(UP, ((A.y - T.y) * SEG1) / (3 * (1 - SEG1)));
  return cubic(from, _c1, _c2, A, u / SEG1, out);
}

// The way back: up first, then over and down to the held hand.
function withdrawAt(from, held, u, out) {
  _c1.copy(from).addScaledVector(UP, RISE * 1.5);
  _c2.copy(held); _c2.y = Math.max(held.y, from.y + RISE);
  return cubic(from, _c1, _c2, held, u, out);
}

function begin(sc, state) {
  sc.state = state;
  sc.t = 0;
  sc.from.copy(sc.palm);
  sc.yawFrom = sc.yaw;
}

function towardYaw(cur, to, most) {
  const dlt = wrapPi(to - cur);
  return cur + clamp(dlt, -most, most);
}

// stepScratch(person, sc, dt, { headTop, volumes }): headTop is her head's
// top this frame (world; the head part's position plus headTopOffset, up), or
// null when she is not there; volumes (catVolumes) keep the arm clear of her.
// Returns the state: 'held' | 'reaching' | 'resting' | 'withdrawing'.
export function stepScratch(person, sc, dt, opts = NO_OPTS) {
  const headTop = opts.headTop ?? null;
  const vol = opts.volumes ?? null;
  const B = person.bones;
  const chest = B.chest;
  const r = chest.rotation;

  // our lean off again if applyPose did not run since
  const w = sc.wrote;
  if (r.x === w[0] && r.y === w[1] && r.z === w[2]) r.set(sc.before[0], sc.before[1], sc.before[2]);
  chest.updateWorldMatrix(true, false);
  armOf(person);
  ARM.avail = Math.max(0, REACH.LEAN_MAX + r.x + B.pelvis.rotation.x);
  const s = person.look.dims.s;
  const fig = person.figure;
  fig.getWorldQuaternion(_fq);
  shoulderAt(0, _s0);

  // her line on the ground (her body's long axis), for the hand and the stroke
  let hasLine = false;
  if (vol) {
    _line.subVectors(vol.body.a, vol.body.b);
    _line.y = 0;
    if (_line.lengthSq() > 1e-6) { _line.normalize(); hasLine = true; }
  }

  // ---- can the hand rest on her head? ----
  let canStay = false, canStart = false;
  let touchYaw = sc.yaw;
  if (headTop) {
    _top.copy(headTop);
    _T.copy(_top).addScaledVector(UP, REACH.CLEAR);
    _ft.subVectors(_T, _s0); _ft.y = 0;
    const base = _ft.lengthSq() > 1e-8 ? yawOf(_ft) : yawOf(dirOf(0, _ft).set(0, 0, -1).applyQuaternion(_fq));
    touchYaw = base;
    if (hasLine) {
      let ly = yawOf(_line);
      if (Math.abs(wrapPi(ly - base)) > Math.PI / 2) ly = wrapPi(ly + Math.PI);
      touchYaw = base + clamp(wrapPi(ly - base), -HAND_TURN, HAND_TURN);
    }
    if (_top.y <= _s0.y) {
      dirOf(touchYaw, _f);
      wristFor(_T, _f, _wr);
      const len = ARM.a + ARM.b;
      if (leanFor(_wr, REACH_OUT * len) >= 0 && tryAt(_T, _f, vol) >= 0 && ARM.reached) {
        canStay = true;
        canStart = _top.y <= _s0.y - PERCH_GIVE && leanFor(_wr, REACH_IN * len) >= 0;
      }
    }
  }

  // ---- the held hand, toward her ----
  let psiTo = 0;
  if (headTop) {
    fig.worldToLocal(_loc.copy(headTop));
    if (_loc.x * _loc.x + _loc.z * _loc.z > 1e-6) psiTo = clamp(Math.atan2(_loc.x, -_loc.z), -HELD_YAW, HELD_YAW);
  }
  if (!sc.started) sc.heldYaw = psiTo;
  else sc.heldYaw = towardYaw(sc.heldYaw, psiTo, HELD_RATE * dt);
  const psi = sc.heldYaw;
  _held.set(HELD_X * s + Math.sin(psi) * HELD_FWD * s, HELD_Y * s, -Math.cos(psi) * HELD_FWD * s);
  // as low as the arm comfortably goes (a bow keeps the shoulder high)
  fig.worldToLocal(_loc.copy(_s0));
  const hx = _held.x - Math.sin(psi) * 0.92 * ARM.hr - _loc.x, hz = _held.z + Math.cos(psi) * 0.92 * ARM.hr - _loc.z;
  const drop = Math.sqrt(Math.max(0, (HELD_REACH * (ARM.a + ARM.b)) ** 2 - hx * hx - hz * hz));
  _held.y = Math.max(_held.y, _loc.y - drop - (0.36 * ARM.hr - 0.004));
  fig.localToWorld(_held);
  _back.set(BACK_X * s, HELD_Y * s, -BACK_FWD * s);
  fig.localToWorld(_back);
  const heldYaw = yawOf(_ft.set(Math.sin(psi), 0, -Math.cos(psi)).applyQuaternion(_fq));

  if (!sc.started) {
    sc.started = true;
    sc.yaw = heldYaw;
    dirOf(sc.yaw, _f);
    sc.palm.copy(guard(_held, _f, vol, _back));
    sc.from.copy(sc.palm);
  }

  // ---- what happens ----
  sc.t += dt;
  if (sc.state === 'held') { if (canStart) begin(sc, 'reaching'); }
  else if (sc.state === 'reaching') { if (!canStay) begin(sc, 'withdrawing'); else if (sc.t >= REACH.APPROACH) begin(sc, 'resting'); }
  else if (sc.state === 'resting') { if (!canStay) begin(sc, 'withdrawing'); }
  else if (sc.state === 'withdrawing' && sc.t >= REACH.WITHDRAW) begin(sc, 'held');

  // ---- where the palm goes ----
  let back = null;
  if (sc.state === 'held') {
    sc.yaw = towardYaw(sc.yaw, heldYaw, HAND_RATE * dt);
    _P.copy(_held);
    back = _back;
  } else if (sc.state === 'reaching') {
    const u = smooth(Math.min(1, sc.t / REACH.APPROACH));
    sc.yaw = sc.yawFrom + wrapPi(touchYaw - sc.yawFrom) * u;
    _A.copy(_top).addScaledVector(UP, REACH.ABOVE);
    approachAt(sc.from, _A, _T, u, _P);
  } else if (sc.state === 'resting') {
    sc.yaw = towardYaw(sc.yaw, touchYaw, HAND_RATE * dt);
    const grow = smooth(Math.min(1, sc.t / STROKE_IN));
    const k = REACH.STROKE * grow * Math.sin(TAU * REACH.STROKE_HZ * sc.t);
    _P.copy(_T).addScaledVector(hasLine ? _line : dirOf(sc.yaw, _ft), k);
  } else {
    const u = smooth(Math.min(1, sc.t / REACH.WITHDRAW));
    sc.yaw = sc.yawFrom + wrapPi(heldYaw - sc.yawFrom) * u;
    // the held hand's own clear place is where the way back ends
    dirOf(heldYaw, _f);
    _hd.copy(guard(_held, _f, vol, _back));
    withdrawAt(sc.from, _hd, u, _P);
  }
  dirOf(sc.yaw, _f);
  guard(_P, _f, vol, back);
  // guard() leaves the arm solved for OUT, with its lean in LEAN

  // ---- pose the arm ----
  sc.before[0] = r.x; sc.before[1] = r.y; sc.before[2] = r.z;
  r.x -= LEAN;
  sc.lean = LEAN;
  w[0] = r.x; w[1] = r.y; w[2] = r.z;
  setArm(person, _f);
  chest.updateMatrixWorld(true);
  palmPoint(person, sc.palm);
  return sc.state;
}

const _mb = new THREE.Matrix4();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _ex = new THREE.Vector3();
const _ey = new THREE.Vector3();
const _ez = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0);

// The solved arm (ARM, _u1, _u2) into the bones: the upper arm so its -y runs
// to the elbow and its -z toward the bend, the elbow a hinge about its x, and
// the hand palm down along f, all in the chest's frame (_qcw, as leaned).
function setArm(person, f) {
  const B = person.bones;
  _qa.copy(_qcw).invert();
  const u1 = _ey.copy(_u1).applyQuaternion(_qa);
  const u2 = _ez.copy(_u2).applyQuaternion(_qa);
  const beta = Math.acos(clamp(u1.dot(u2), -1, 1));
  _w.copy(u2).addScaledVector(u1, -u1.dot(u2));
  if (_w.lengthSq() < 1e-10) _w.copy(_p0).applyQuaternion(_qa).negate(); // a straight arm: bend away from the elbow's side
  _w.addScaledVector(u1, -_w.dot(u1)).normalize();
  _ex.crossVectors(u1, _w);
  _mb.makeBasis(_ex, u1.negate(), _w.negate());
  B.upperArmR.quaternion.setFromRotationMatrix(_mb);
  B.forearmR.rotation.set(beta, 0, 0);
  // the hand: its x up, its y along -f, its z = x cross y
  _ex.copy(UP);
  _ey.copy(f).negate();
  _ez.crossVectors(_ex, _ey);
  _mb.makeBasis(_ex, _ey, _ez);
  _qh.setFromRotationMatrix(_mb);
  // local = (chest . upper arm . forearm)^-1 . hand
  _qb.copy(_qcw).multiply(B.upperArmR.quaternion).multiply(_qa.setFromAxisAngle(_X, beta)).invert();
  B.handR.quaternion.multiplyQuaternions(_qb, _qh);
}
