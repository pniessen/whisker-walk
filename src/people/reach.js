// The head scratch (spec "The head scratch", owner's decision 7): with the
// person kneeling (an older person bows), the right hand comes to her head
// when she is within arm's reach, slowly, from in front and above, by way of
// a point over her head; it rests there with its palm down, CLEAR above her
// head's top as it is on this frame, following it, with a slow stroke along
// her head's front-to-back line. Out of reach (or perched: her head's top
// more than PERCHED_ABOVE over the person's shoulder, as on a wall) the hand
// is held out, low, palm down, toward her, and she can come closer; losing
// reach, it withdraws, rising first. Only the hand
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
  PERCHED_ABOVE: 0.3, // m: her head's top more than this over the person's shoulder (as posed) is perched: held out (ruling R10)
});

// ---- tuning (my calls, not the spec's) --------------------------------------------
const REACH_IN = 0.95; // a reach starts when the wrist is within this much of the arm's length
const REACH_OUT = 0.985; // and is kept to this (the elbow never quite locked)
const FOLD_MIN = 0.03; // m: the wrist stays this much further from the shoulder than the tightest fold
const PERCH_GIVE = 0.02; // m: her head this far under the perched line to start a touch
const HAND_TURN = 1.2; // rad: the hand turns this far at most from the reach to lie along her head (between her ears)
const HAND_RATE = 2.5; // rad/s: the hand's turn while held or resting
const HELD_FWD = 0.4; // the held palm, in front of the middle (x s, the height over 1.75 m)
const HELD_Y = 0.45; // its height (x s)
const HELD_X = 0.12; // to the right of the middle (x s)
const HELD_YAW = 0.5; // rad: it turns toward her up to this
const HELD_RATE = 1.5; // rad/s
const HELD_REACH = 0.92; // the held arm reaches at most this much of its length
const READY_YAW = 1.0; // rad: the ready hand's fingers point this far round to the right
const READY_X = 0.16; // the ready place: to the right of the middle (x s),
const READY_FWD = 0.06; // just in front of the chest (x s),
const READY_DROP = 0.15; // m: this far under the shoulder
const BACK_FWD = 0.12; // the guard's drawn-back hand: just in front of the person (x s)
const BACK_X = 0.3; // and out to the side of the hip (x s)
const VMAX = 1.2; // m/s: the palm never moves faster than this (ruling R13)
const HOLD_TAU = 0.15; // s: the held hand follows its place this closely
const HOLD_ACC = 6; // m/s2: and its speed changes no faster than this
const PLAN_RETRY = 0.25;
const BLOCK_MOVE = 0.1; // m: she moves this far and a blocked way in is tried again
const CUSHION = 0.015; // m: the held hand's place keeps this much more room, so it can move off it
const HEAD_LET_GO = 3; // m/s: her head faster than this and the hand lets go
const SETTLED = 0.05; // m/s: the held hand is settled under this // s: a way in that could not be planned is tried again after this
const DRAW_IN = 0.3; // the way in draws in toward the shoulder this much as it rises
const RISE_FIRST = 0.75; // and rises this much of the way to over her head first
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
  OFF_EARS.set(head, off);
  return box;
}

// An ear left out of her head is a tapered capsule of its own, base to tip
// (radius r0 at the base, r1 at the tip), so the arm keeps clear of it too.
// Measured once per ear, in the ear's own frame (it twitches).
const OFF_EARS = new WeakMap();
const EAR_SINK = 0.05; // (head frame) the ear from this far under her head's top
const EAR_CAP = new WeakMap();
const _hm = new THREE.Matrix4();
function earCapsule(head, ear) {
  let cap = EAR_CAP.get(ear);
  if (cap) return cap;
  head.updateWorldMatrix(true, true);
  _inv.copy(head.matrixWorld).invert();
  const pts = [];
  ear.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(_rel);
      // only what stands out of her head (below that, her head's sphere holds it)
      if (p.y >= HEAD_BOX.get(head).max.y - EAR_SINK) pts.push(p);
    }
  });
  // in the head's frame: the tip is the highest point, the base the middle
  // of the lowest third
  let lo = Infinity, hi = -Infinity, tip = pts[0];
  for (const p of pts) { if (p.y < lo) lo = p.y; if (p.y > hi) { hi = p.y; tip = p; } }
  const base = new THREE.Vector3();
  let n = 0;
  for (const p of pts) if (p.y <= lo + (hi - lo) / 3) { base.add(p); n++; }
  base.divideScalar(Math.max(1, n));
  const ax = new THREE.Vector3().subVectors(tip, base);
  const L2 = Math.max(1e-9, ax.lengthSq());
  // radii, linear from r0 at the base to r1 at the tip: r1 holds every point
  // in the top third, r0 then every point below it
  const ts = pts.map((p) => clamp(new THREE.Vector3().subVectors(p, base).dot(ax) / L2, 0, 1));
  const ds = pts.map((p, i) => new THREE.Vector3().copy(base).addScaledVector(ax, ts[i]).distanceTo(p));
  let r1 = 0.004;
  pts.forEach((p, i) => { if (ts[i] >= 2 / 3) r1 = Math.max(r1, ds[i]); });
  let r0 = r1;
  pts.forEach((p, i) => { if (ts[i] < 2 / 3) r0 = Math.max(r0, (ds[i] - r1 * ts[i]) / (1 - ts[i])); });
  // into the ear's own frame (and its units)
  _hm.copy(ear.matrixWorld).invert().multiply(head.matrixWorld);
  const unit = Math.hypot(_hm.elements[0], _hm.elements[1], _hm.elements[2]); // head lengths to ear lengths
  cap = { a: base.applyMatrix4(_hm), b: tip.clone().applyMatrix4(_hm), r0: r0 * unit, r1: r1 * unit };
  EAR_CAP.set(ear, cap);
  return cap;
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
const newEar = () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), r0: 0, r1: 0 });
export function catVolumes(cat, out) {
  const v = out ?? { head: new THREE.Sphere(), body: { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }, ears: [newEar(), newEar()], earN: 0 };
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

  // the ears left out of her head (a hen's comb is in it)
  const off = OFF_EARS.get(head);
  if (!v.ears) v.ears = [newEar(), newEar()]; // an `out` made by hand
  v.earN = 0;
  for (let i = 0; i < off.length && i < 2; i++) {
    const ear = off[i];
    const cap = earCapsule(head, ear);
    ear.updateWorldMatrix(true, false);
    ear.matrixWorld.decompose(_hp, _q, _ws);
    const es = Math.max(_ws.x, _ws.y, _ws.z);
    const e = v.ears[v.earN++];
    e.a.copy(cap.a).applyMatrix4(ear.matrixWorld);
    e.b.copy(cap.b).applyMatrix4(ear.matrixWorld);
    e.r0 = cap.r0 * es;
    e.r1 = cap.r1 * es;
  }
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
let SEG_T = 0; // and segSeg's place along the second segment
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
  if (a <= 1e-12 && e <= 1e-12) { SEG_K = 0; SEG_T = 0; return p1.distanceTo(p2); }
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
  SEG_T = t;
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

// The palm where the solved arm puts it (ARM.W), palm down along f.
function palmOfArm(f, out) {
  const hr = ARM.hr;
  return out.copy(ARM.W).addScaledVector(UP, -(0.36 * hr - 0.004)).addScaledVector(f, 0.92 * hr);
}

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

const EAR_T = 12;
const HAND_SIDE = 0.36; // the hand's half width with the thumb, over its length (parts.js: 0.62 hr and the thumb)
const _ep = new THREE.Vector3();
// How clear a limb (a tapered tube a-b, radii r0 to r1) is of her volumes
// (rSide: its radius toward her ears, if more).
function limbClear(a, b, r0, r1, vol, rSide = 0) {
  const h = vol.head;
  let m = pointSeg(h.center, a, b) - h.radius - (r0 + (r1 - r0) * SEG_K);
  const by = vol.body;
  m = Math.min(m, segSeg(a, b, by.a, by.b) - by.r - (r0 + (r1 - r0) * SEG_K));
  // an ear: a tapered capsule, so its nearest place is not always the
  // nearest pair of lines: along it at EAR_T places
  for (let i = 0; i < (vol.earN ?? 0); i++) {
    const e = vol.ears[i];
    for (let j = 0; j <= EAR_T; j++) {
      const t = j / EAR_T;
      _ep.lerpVectors(e.a, e.b, t);
      const d = pointSeg(_ep, a, b);
      let rl = r0 + (r1 - r0) * SEG_K;
      if (rSide > rl && d > 1e-6) {
        // a flat limb (the palm-down hand): an ellipse across, rl up and
        // down, rSide to the sides; its radius toward the ear's place
        const sn = Math.abs(_ep.y - _p1.y) / d;
        const cs2 = 1 - sn * sn;
        rl = 1 / Math.sqrt(cs2 / (rSide * rSide) + (sn * sn) / (rl * rl));
      }
      m = Math.min(m, d - rl - (e.r0 + (e.r1 - e.r0) * t));
    }
  }
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
  // reached: neither past the arm's length nor folded tighter than it goes
  // (the wrist at least FOLD_MIN past the forearm's tuck against the upper arm)
  const dMin = Math.abs(a - b) + FOLD_MIN;
  ARM.reached = d <= dMax + 1e-9 && d >= dMin - 1e-9;
  d = clamp(d, dMin, dMax);
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
  // the hand is wider than it is thick (and has a thumb): to the side, where
  // her ears are, it is HAND_SIDE of its length across
  return Math.min(elbowClear(vol), limbClear(ARM.W, ARM.tip, ARM.rHand, ARM.rHand, vol, HAND_SIDE * 2 * ARM.hr) - GAP);
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
// given: beside the hip, for the held hand) over the first half, then up by
// LIFT_MAX. It keeps its place from frame to frame (s0, what it chose last
// frame; the chosen one is left in GUARD_S): while clear it eases back toward
// P at RELAX a second, and when she comes in the way it goes out only as far
// as clears her (by `need` more than the GAP). Writes OUT, and leaves the arm
// solved for it (LEAN too).
const OUT = new THREE.Vector3();
const _back = new THREE.Vector3();
const RELAX = 0.8;
let GUARD_S = 0;
function wayOut(P, back, s, out) {
  if (!back) return out.copy(P).addScaledVector(UP, s * LIFT_MAX);
  if (s <= 0.5) return out.lerpVectors(P, back, s * 2);
  return out.copy(back).addScaledVector(UP, (s - 0.5) * 2 * LIFT_MAX);
}
function guard(P, f, vol, back, s0, dt, need = 0) {
  let s = clamp(s0, 0, 1);
  if (tryAt(wayOut(P, back, s, OUT), f, vol) >= need) {
    const lo = Math.max(0, s - RELAX * dt);
    if (lo < s) {
      if (tryAt(wayOut(P, back, lo, OUT), f, vol) >= need) s = lo;
      else {
        let bad = lo;
        for (let i = 0; i < 5; i++) {
          const mid = (bad + s) / 2;
          if (tryAt(wayOut(P, back, mid, OUT), f, vol) >= need) s = mid; else bad = mid;
        }
      }
    }
  } else {
    const N = 24;
    let lo = s, hi = -1;
    for (let i = Math.floor(s * N) + 1; i <= N; i++) {
      const si = i / N;
      if (tryAt(wayOut(P, back, si, OUT), f, vol) >= need) { hi = si; break; }
      lo = si;
    }
    if (hi < 0) {
      // nowhere clear out from here (she is in the person): the least bad
      let best = -Infinity;
      for (let i = 0; i <= N; i++) {
        const m = tryAt(wayOut(P, back, i / N, OUT), f, vol);
        if (m > best) { best = m; s = i / N; }
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        if (tryAt(wayOut(P, back, mid, OUT), f, vol) >= need) hi = mid; else lo = mid;
      }
      s = hi;
    }
  }
  tryAt(wayOut(P, back, s, OUT), f, vol);
  GUARD_S = s;
  return OUT;
}

// ---- timing --------------------------------------------------------------------------
// Every move of the gesture is eased (ruling R13): its speed rises over the
// first RAMP of its time, holds, and falls over the last RAMP (cosine
// ramps), so it starts and stops gently; its time is long enough that the
// palm never goes faster than VMAX.
const RAMP = 0.25;
const PEAK = 1 / (1 - RAMP); // the top speed, in lengths per duration
function ease(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x < RAMP) return PEAK * (x / 2 - (RAMP / TAU) * Math.sin((Math.PI * x) / RAMP));
  if (x > 1 - RAMP) return 1 - ease(1 - x);
  return PEAK * (RAMP / 2 + (x - RAMP));
}
// how long a move of length L takes (at least `least`)
const timeFor = (L, least) => Math.max(least, (PEAK * L * 1.05) / VMAX);

// ---- the way in ----------------------------------------------------------------------
// Through key places, as a Catmull-Rom curve walked by its length: from where
// the hand is, (by way of the ready place in front of the chest, when the
// straight way would pass her face), up and drawn in toward the shoulder,
// over to the point ABOVE her head, and straight down to the touch. Plus the
// rise the plan gives it to clear her (sc.plan, at WAY_N + 1 places along it).
const KEYS = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
let KEY_N = 0;
const WAY_S = 48;
const WAY_LEN = new Float64Array(WAY_S + 1);
const _wp = new THREE.Vector3();
const _wq = new THREE.Vector3();
const _ready = new THREE.Vector3();

// The way's key places for this frame (module state: _top, _T, _s0, _ready).
function keysFor(from, viaReady) {
  KEY_N = 0;
  KEYS[KEY_N++].copy(from);
  if (viaReady) KEYS[KEY_N++].copy(_ready);
  const last = KEYS[KEY_N - 1];
  _A.copy(_top).addScaledVector(UP, REACH.ABOVE);
  const up = KEYS[KEY_N++].copy(last).lerp(_s0, DRAW_IN);
  up.y = last.y + Math.max(0, _A.y - last.y) * RISE_FIRST;
  KEYS[KEY_N++].copy(_A);
  KEYS[KEY_N++].copy(_T);
}
// the curve at v in 0..1 (uniform Catmull-Rom through KEYS, ends doubled)
function curveAt(v, out) {
  const segs = KEY_N - 1;
  const x = clamp(v, 0, 1) * segs;
  const i = Math.min(segs - 1, Math.floor(x));
  const t = x - i;
  const p0 = KEYS[Math.max(0, i - 1)], p1 = KEYS[i], p2 = KEYS[i + 1], p3 = KEYS[Math.min(KEY_N - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const a = -0.5 * t3 + t2 - 0.5 * t, b = 1.5 * t3 - 2.5 * t2 + 1, c = -1.5 * t3 + 2 * t2 + 0.5 * t, d = 0.5 * t3 - 0.5 * t2;
  return out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  );
}
// the way at v (0..1 along the curve), risen by the plan there
function riseAt(plan, v, out) {
  curveAt(v, out);
  out.y += planAt(plan, v);
  return out;
}
// the risen way's length table (by the curve's v)
function measureWay(plan) {
  riseAt(plan, 0, _wq);
  WAY_LEN[0] = 0;
  for (let i = 1; i <= WAY_S; i++) {
    riseAt(plan, i / WAY_S, _wp);
    WAY_LEN[i] = WAY_LEN[i - 1] + _wp.distanceTo(_wq);
    _wq.copy(_wp);
  }
  return WAY_LEN[WAY_S];
}
// the planned rise at v (smoothly between the WAY_N + 1 places)
function planAt(plan, v) {
  const x = clamp(v, 0, 1) * WAY_N;
  const i = Math.min(WAY_N - 1, Math.floor(x));
  const k = smooth(x - i);
  return plan[i] + (plan[i + 1] - plan[i]) * k;
}
// the way's v at a, the fraction of its (risen) length (after measureWay)
function vAt(a) {
  const want = clamp(a, 0, 1) * WAY_LEN[WAY_S];
  let i = 1;
  while (i < WAY_S && WAY_LEN[i] < want) i++;
  const seg = WAY_LEN[i] - WAY_LEN[i - 1];
  const k = seg > 1e-9 ? (want - WAY_LEN[i - 1]) / seg : 0;
  return (i - 1 + k) / WAY_S;
}
// the risen way's point at a (after measureWay)
const wayAt = (plan, a, out) => riseAt(plan, vAt(a), out);

// planWay(sc, touchYaw, vol) reads this frame's module state: _top (her
// head's top), _T (the touch), _s0 (the unleaned shoulder) and _ready (the
// ready place), and sc.palm / sc.yaw. It plans the way in as it would be
// walked, frame by frame at 1/60 s with her still: the rise each stretch
// needs to clear her (at most PLAN_RISE), then the time that keeps the palm
// under VMAX, then every frame checked. The straight way first, then by way
// of the ready place. False when neither is clear (no touch starts; it is
// tried again after PLAN_RETRY).
const WAY_N = 12;
const PLAN_RISE = 0.35;
const PLAN_ROUNDS = 6;
const _plan = new Float64Array(WAY_N + 1);
function planWay(sc, touchYaw, vol) {
  for (let via = 0; via < 2; via++) {
    keysFor(sc.palm, via === 1);
    sc.plan.fill(0);
    measureWay(sc.plan);
    let ok = true;
    if (vol) {
      for (let i = 1; i < WAY_N && ok; i++) {
        const v = i / WAY_N;
        riseAt(sc.plan, v, _P);
        const a = WAY_LEN[Math.round(v * WAY_S)] / WAY_LEN[WAY_S];
        dirOf(sc.yaw + wrapPi(touchYaw - sc.yaw) * a, _f);
        guard(_P, _f, vol, null, 0, 0);
        if (clearOf(vol) < 0 || GUARD_S * LIFT_MAX > PLAN_RISE) ok = false;
        _plan[i] = GUARD_S * LIFT_MAX;
      }
      if (!ok) continue;
      _plan[0] = 0; _plan[WAY_N] = 0;
      for (let i = 1; i < WAY_N; i++) sc.plan[i] = Math.max(_plan[i - 1], _plan[i], _plan[i + 1]);
    }
    // walk it frame by frame; a frame in her raises its stretch, and again;
    // a frame that would step further than VMAX allows slows the whole way
    for (let round = 0; round < PLAN_ROUNDS && ok; round++) {
      sc.dur = timeFor(measureWay(sc.plan), REACH.APPROACH);
      let fixed = false;
      for (let slow = 0; slow < 4 && ok; slow++) {
        const n = Math.ceil(sc.dur * 60);
        let most = 0;
        _wq.copy(sc.palm);
        for (let f = 1; f <= n && ok; f++) {
          const a = ease(f / n);
          wayAt(sc.plan, a, _P);
          dirOf(sc.yaw + wrapPi(touchYaw - sc.yaw) * a, _f);
          const m = tryAt(_P, _f, vol);
          if (!ARM.reached) { ok = false; break; } // the arm cannot follow it there
          // the step the palm itself takes (where the arm puts it)
          palmOfArm(_f, _wp);
          most = Math.max(most, _wp.distanceTo(_wq));
          _wq.copy(_wp);
          if (!vol) continue;
          if (m >= 0) continue;
          guard(_P, _f, vol, null, 0, 0);
          const need = GUARD_S * LIFT_MAX + 0.01;
          // the stretch's far end (the first stretch starts at the hand, unrisen)
          const i = Math.max(1, Math.min(WAY_N - 1, Math.round(vAt(a) * WAY_N)));
          if (clearOf(vol) < 0 || sc.plan[i] + need > PLAN_RISE) { ok = false; break; }
          sc.plan[i] += need;
          if (i + 1 < WAY_N) sc.plan[i + 1] = Math.max(sc.plan[i + 1], sc.plan[i] * 0.5);
          fixed = true;
          break;
        }
        if (!ok || fixed) break;
        const limit = VMAX / 60;
        if (most <= limit) { sc.via = via; return true; }
        sc.dur *= (most / limit) * 1.02;
        measureWay(sc.plan);
      }
      if (round === PLAN_ROUNDS - 1) ok = false;
    }
    if (ok && !vol) { sc.via = via; return true; }
  }
  return false;
}

// The way back's time: its length (to where the held hand is now) at VMAX,
// eased, with room for the held place moving meanwhile.
function withdrawTime(sc) {
  let L = 0;
  withdrawAt(sc.from, _held, 0, _wq);
  for (let i = 1; i <= 16; i++) {
    withdrawAt(sc.from, _held, i / 16, _wp);
    L += _wp.distanceTo(_wq);
    _wq.copy(_wp);
  }
  return timeFor(L * 1.15, REACH.WITHDRAW);
}

// The way back: up first, then over and down to the held hand.
function withdrawAt(from, held, u, out) {
  _c1.copy(from).addScaledVector(UP, RISE * 1.5);
  _c2.copy(held); _c2.y = Math.max(held.y, from.y + RISE);
  return cubic(from, _c1, _c2, held, u, out);
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
    vel: new THREE.Vector3(), // its velocity (m/s)
    yaw: 0, // the hand's heading (world yaw of the fingers)
    heldYaw: 0, // the held hand's turn toward her (figure frame, + to the figure's right)
    lean: 0,
    plan: new Float64Array(WAY_N + 1), // the way in's planned rise (see planWay)
    via: 0, // 1: the way in goes by way of the ready place
    dur: 0, // the move's time (s)
    planWait: 0, // s until the way in may be planned again
    readyTried: false, // the way in from the held hand failed: try it from the ready place
    toReady: false, // the held hand is going to the ready place
    blocked: false, // no way in from the ready place either, while she stays where she was
    blockedAt: new THREE.Vector3(),
    target: new THREE.Vector3(), // where the held hand is going (guarded)
    lastTop: new THREE.Vector3(), // her head's top last frame
    hadTop: false,
    gs: 0, // the guard's place on its way out (see guard), and the held hand's on the way back
    gh: 0,
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
const _vt = new THREE.Vector3();
const _best = new THREE.Vector3();
const _pa = new THREE.Vector3();
const STEP_GIVE = 1.15; // a palm step may be this much over VMAX * dt (the arm's own give)

function cubic(p0, p1, p2, p3, u, out) {
  const v = 1 - u;
  const k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
  return out.set(
    k0 * p0.x + k1 * p1.x + k2 * p2.x + k3 * p3.x,
    k0 * p0.y + k1 * p1.y + k2 * p2.y + k3 * p3.y,
    k0 * p0.z + k1 * p1.z + k2 * p2.z + k3 * p3.z,
  );
}

function begin(sc, state) {
  sc.gs = state === 'held' ? sc.gh : 0;
  sc.gh = 0;
  sc.state = state;
  sc.t = 0;
  sc.from.copy(sc.palm);
  sc.yawFrom = sc.yaw;
  sc.vel.set(0, 0, 0);
}

function towardYaw(cur, to, most) {
  const dlt = wrapPi(to - cur);
  return cur + clamp(dlt, -most, most);
}

// The palm's place this frame when its planned one is in her: the place, of
// a few within one frame's reach (VMAX * dt) of where it was, that is clear
// (the planned one cut to that reach, straight up, back toward the person,
// where it was), else the least bad. Leaves the arm solved for it (in OUT).
function stepClear(sc, P, f, vol, dt) {
  const most = VMAX * dt;
  let best = -Infinity;
  for (let i = 0; i < 4; i++) {
    if (i === 0) { _vt.subVectors(P, sc.palm); const L = _vt.length(); OUT.copy(sc.palm).addScaledVector(_vt, L > most ? most / L : 1); }
    else if (i === 1) OUT.copy(sc.palm).addScaledVector(UP, most);
    else if (i === 2) { // back toward the person, level (out from under her chin)
      _vt.set(_s0.x - sc.palm.x, 0, _s0.z - sc.palm.z);
      const L = _vt.length();
      OUT.copy(sc.palm).addScaledVector(_vt, L > most ? most / L : 1);
    } else OUT.copy(sc.palm);
    const m = tryAt(OUT, f, vol);
    if (m >= 0 && palmOfArm(f, _pa).distanceTo(sc.palm) <= most * STEP_GIVE) return OUT;
    if (m > best) { best = m; _best.copy(OUT); }
  }
  tryAt(OUT.copy(_best), f, vol);
  return OUT;
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
    const perch = _s0.y + REACH.PERCHED_ABOVE; // the unleaned shoulder, kneeling or bowing
    if (_top.y <= perch) {
      dirOf(touchYaw, _f);
      wristFor(_T, _f, _wr);
      const len = ARM.a + ARM.b;
      if (leanFor(_wr, REACH_OUT * len) >= 0 && tryAt(_T, _f, vol) >= 0 && ARM.reached) {
        canStay = true;
        canStart = _top.y <= perch - PERCH_GIVE && leanFor(_wr, REACH_IN * len) >= 0;
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
  _back.set(BACK_X * s, Math.max(HELD_Y * s, _loc.y - 0.85 * (ARM.a + ARM.b)), -BACK_FWD * s);
  fig.localToWorld(_back);
  // the ready place in front of the chest (a way in may go by it)
  _ready.set(READY_X * s, _loc.y - READY_DROP, -READY_FWD * s);
  fig.localToWorld(_ready);
  const heldYaw = yawOf(_ft.set(Math.sin(psi), 0, -Math.cos(psi)).applyQuaternion(_fq));

  if (!sc.started) {
    sc.started = true;
    sc.yaw = heldYaw;
    dirOf(sc.yaw, _f);
    sc.palm.copy(guard(_held, _f, vol, _back, 0, 0, CUSHION));
    sc.gs = GUARD_S;
    sc.from.copy(sc.palm);
  }

  // ---- what happens ----
  // the hand rides on her head while touching; a head that moves faster than
  // a hand may (she whips round) is let go of instead
  const headJumped = !!headTop && sc.hadTop && dt > 0 && sc.lastTop.distanceTo(headTop) > HEAD_LET_GO * dt;
  sc.hadTop = !!headTop;
  if (headTop) sc.lastTop.copy(headTop);
  sc.t += dt;
  sc.planWait = Math.max(0, sc.planWait - dt);
  // a way in that could not be planned from the ready place is not tried
  // again till she moves (or goes out of reach and comes back)
  if (sc.blocked && (!canStart || !headTop || sc.blockedAt.distanceTo(headTop) > BLOCK_MOVE)) sc.blocked = false;
  sc.toReady = false;
  if (sc.state === 'held' && canStart && !sc.blocked) {
    // a reach starts with the held hand settled, on a planned way: from where
    // it is held out if that way is clear, else from the ready place in front
    // of the chest (the hand goes there first)
    sc.toReady = sc.readyTried;
    const settled = sc.vel.lengthSq() < SETTLED * SETTLED;
    const atReady = sc.palm.distanceTo(sc.target) < 0.03; // (its guarded place)
    if (settled && sc.planWait <= 0 && (!sc.readyTried || atReady)) {
      if (planWay(sc, touchYaw, vol)) { begin(sc, 'reaching'); sc.readyTried = false; }
      else if (!sc.readyTried) { sc.readyTried = true; sc.toReady = true; }
      else { sc.blocked = true; sc.blockedAt.copy(headTop); sc.readyTried = false; sc.toReady = false; sc.planWait = PLAN_RETRY; }
    }
  } else if (sc.state === 'held') sc.readyTried = false;
  else if (sc.state === 'reaching') { if (!canStay || headJumped) begin(sc, 'withdrawing'); else if (sc.t >= sc.dur) begin(sc, 'resting'); }
  else if (sc.state === 'resting') { if (!canStay || headJumped) begin(sc, 'withdrawing'); }
  else if (sc.state === 'withdrawing' && sc.t >= sc.dur) begin(sc, 'held');
  if (sc.state === 'withdrawing' && sc.t === 0) sc.dur = withdrawTime(sc);

  // ---- where the palm goes ----
  if (sc.state === 'held') {
    // at the ready place the fingers point out to the side, off her face
    const readyYaw = yawOf(_ft.set(Math.sin(READY_YAW), 0, -Math.cos(READY_YAW)).applyQuaternion(_fq));
    sc.yaw = towardYaw(sc.yaw, sc.toReady ? readyYaw : heldYaw, HAND_RATE * dt);
    dirOf(sc.yaw, _f);
    _hd.copy(guard(sc.toReady ? _ready : _held, _f, vol, _back, sc.gs, dt, CUSHION));
    sc.gs = GUARD_S;
    sc.target.copy(_hd);
    // follow it, eased: toward it at up to VMAX, the speed changing gently
    _vt.subVectors(_hd, sc.palm).divideScalar(HOLD_TAU);
    if (_vt.length() > VMAX) _vt.setLength(VMAX);
    _vt.sub(sc.vel);
    const most = HOLD_ACC * dt;
    if (_vt.length() > most) _vt.setLength(most);
    sc.vel.add(_vt);
    _P.copy(sc.palm).addScaledVector(sc.vel, dt);
  } else if (sc.state === 'reaching') {
    const a = ease(sc.t / sc.dur);
    sc.yaw = sc.yawFrom + wrapPi(touchYaw - sc.yawFrom) * a;
    keysFor(sc.from, sc.via === 1);
    measureWay(sc.plan);
    wayAt(sc.plan, a, _P);
  } else if (sc.state === 'resting') {
    sc.yaw = towardYaw(sc.yaw, touchYaw, HAND_RATE * dt);
    const grow = smooth(Math.min(1, sc.t / STROKE_IN));
    const k = REACH.STROKE * grow * Math.sin(TAU * REACH.STROKE_HZ * sc.t);
    _P.copy(_T).addScaledVector(hasLine ? _line : dirOf(sc.yaw, _ft), k);
  } else {
    const a = ease(sc.t / sc.dur);
    sc.yaw = sc.yawFrom + wrapPi(heldYaw - sc.yawFrom) * a;
    // the held hand's own clear place is where the way back ends
    dirOf(heldYaw, _f);
    _hd.copy(guard(_held, _f, vol, _back, sc.gh, dt, CUSHION));
    sc.gh = GUARD_S;
    withdrawAt(sc.from, _hd, a, _P);
  }
  dirOf(sc.yaw, _f);
  if ((sc.state === 'held' || sc.state === 'withdrawing') && dt > 0) {
    // never faster than VMAX (the held place or the way back's end may move)
    const step = _P.distanceTo(sc.palm);
    if (step > VMAX * dt) _P.lerpVectors(sc.palm, _P, (VMAX * dt) / step);
  }
  const clear = tryAt(_P, _f, vol) >= 0;
  // (touching, the hand rides on her head; else the palm itself never steps
  // further than VMAX allows: the arm may not follow its place exactly)
  const steady = sc.state === 'resting' || dt <= 0 || palmOfArm(_f, _pa).distanceTo(sc.palm) <= VMAX * dt * STEP_GIVE;
  if ((!clear || !steady) && dt > 0) {
    // in her, or the arm would jump: never a jump. Touching or on the way in,
    // the hand leaves for the way back from where it is; else it takes the
    // clearest place within one frame's reach.
    if (sc.state === 'reaching' || sc.state === 'resting') {
      begin(sc, 'withdrawing');
      sc.dur = withdrawTime(sc);
    }
    stepClear(sc, _P, _f, vol, dt);
    if (sc.state === 'held') sc.vel.subVectors(OUT, sc.palm).divideScalar(dt);
  }
  // the arm is solved for the palm's place (in tryAt), its lean in LEAN

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
