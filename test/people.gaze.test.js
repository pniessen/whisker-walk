import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildSpot } from '../src/people/figure.js';
import { spotKind } from '../src/people/look.js';
import { pose, applyPose } from '../src/people/pose.js';
import { GAZE, createGaze, stepGaze, blinkAt } from '../src/people/gaze.js';

const material = new THREE.MeshStandardMaterial({ vertexColors: true });
const DT = 1 / 60;
const CAT_HEAD = 0.25; // her head's height above the ground

function spotOf(kind, want) {
  for (let x = 0; x < 400; x++) {
    const def = { x, z: 7 };
    if (spotKind(def) !== kind) continue;
    if (!want) return def;
    const { people } = buildSpot(def, { material });
    if (want(people[0].look)) return def;
  }
  throw new Error('no spot');
}

// An adult standing in a group that is moved and turned in the world, so
// the gaze has to work in the figure's own frame.
function rig(want) {
  const { people } = buildSpot(spotOf('adult', want), { material });
  const p = people[0];
  p.setDetail('near');
  const group = new THREE.Group();
  group.position.set(10, 0, 5);
  group.rotation.y = 0.7;
  group.add(p.figure);
  group.updateMatrixWorld(true);
  return { p, group, gaze: createGaze(p.look), t: 0 };
}

// A point on the ground `dist` metres from the figure, `yaw` radians round
// from ahead (+ = the figure's left), at her head's height, in the world.
function around(r, yaw, dist) {
  const v = new THREE.Vector3(-Math.sin(yaw) * dist, CAT_HEAD, -Math.cos(yaw) * dist);
  r.group.updateMatrixWorld(true);
  return r.p.figure.localToWorld(v);
}

// Frames of standing, the gaze added after the pose. `each(r)` runs after
// every frame; `target` may be a function of the time.
function run(r, seconds, target, { reducedMotion = false, each } = {}) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    r.t += DT;
    const tg = typeof target === 'function' ? target(r.t) : target;
    pose(r.p, { mode: 'stand', t: r.t, reducedMotion });
    applyPose(r.p, DT);
    stepGaze(r.p, r.gaze, DT, r.t, { target: tg, reducedMotion });
    if (each) each(r);
  }
}

const HEAD_Y = 4 * 3 + 1; // the head's yaw in target.rot (JOINTS order: root, pelvis, chest, neck, head)
// what the gaze added to the head joint's yaw on top of the pose
const headAdded = (p) => p.bones.head.rotation.y - p.target.rot[HEAD_Y];

// where the head faces, as a yaw in the figure's frame
const Q = new THREE.Quaternion();
const F = new THREE.Vector3();
function headFacing(r) {
  r.group.updateMatrixWorld(true);
  r.p.figure.getWorldQuaternion(Q).invert();
  F.set(0, 0, -1).transformDirection(r.p.bones.head.matrixWorld).applyQuaternion(Q);
  return Math.atan2(-F.x, -F.z);
}
// the yaw of a world point from the head, figure frame
function yawTo(r, point) {
  r.group.updateMatrixWorld(true);
  const h = r.p.bones.head.getWorldPosition(new THREE.Vector3());
  r.p.figure.getWorldQuaternion(Q).invert();
  F.copy(point).sub(h).applyQuaternion(Q);
  return Math.atan2(-F.x, -F.z);
}

describe('people gaze', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the numbers', () => {
    expect(Object.isFrozen(GAZE)).toBe(true);
    expect(GAZE).toMatchObject({
      NEAR: 4, FAR: 5, EYE_LEAD: 0.15, EYE_MAX: 0.3, HEAD_IN: 0.6, HEAD_OUT: 0.8,
      GLANCE_AFTER: 4, GLANCE_FOR: 1.2, GLANCE_YAW: 0.25, BLINK_MIN: 2.5, BLINK_MAX: 5.5,
      BLINK_TIME: 0.12, SMILE_X: 1.15, SMILE_Y: 1.1, SMILE_TIME: 0.4,
    });
    expect(GAZE.LOOK_MAX).toBeCloseTo((75 * Math.PI) / 180, 12);
    expect(GAZE.BEHIND).toBeCloseTo((110 * Math.PI) / 180, 12);
  });

  it('blinks from the spot and the clock', () => {
    const rnd = vi.spyOn(Math, 'random');
    const startsOf = (seed) => {
      const starts = [];
      let prev = 0, peak = 0;
      const step = 1 / 480;
      for (let i = 0; i <= 60 * 480; i++) {
        const b = blinkAt(seed, i * step);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
        if (b > 0 && prev === 0) starts.push(i * step);
        peak = Math.max(peak, b);
        prev = b;
      }
      expect(peak).toBeGreaterThan(0.99); // shut at the middle of a blink
      return starts;
    };
    for (const seed of [0, 0.2, 0.5, 0.7, 0.999]) {
      const s = startsOf(seed);
      expect(s.length).toBeGreaterThanOrEqual(10);
      for (let i = 1; i < s.length; i++) {
        const gap = s[i] - s[i - 1];
        expect(gap).toBeGreaterThanOrEqual(GAZE.BLINK_MIN - 0.005);
        expect(gap).toBeLessThanOrEqual(GAZE.BLINK_MAX + 0.005);
      }
    }
    // pure: the same spot and clock, the same blink
    for (const t of [0.3, 7.77, 123.4, 3601.05]) expect(blinkAt(0.4, t)).toBe(blinkAt(0.4, t));
    // two spots blink at different times
    expect(startsOf(0.2)).not.toEqual(startsOf(0.7));
    // a blink lasts BLINK_TIME
    const s = startsOf(0.2)[2];
    expect(blinkAt(0.2, s + GAZE.BLINK_TIME / 2)).toBeGreaterThan(0.9);
    expect(blinkAt(0.2, s + GAZE.BLINK_TIME + 0.003)).toBe(0);
    expect(rnd).not.toHaveBeenCalled();
  });

  it('eyes lead: the eyes turn first, the head follows', () => {
    const r = rig();
    run(r, 0.5, null);
    const look = Math.PI / 4;
    const target = around(r, look, 2); // 2 m ahead-left
    run(r, GAZE.EYE_LEAD, target);
    const eyeWay = Math.min(GAZE.EYE_MAX, look);
    for (const e of ['eyeL', 'eyeR']) expect(r.p.bones[e].rotation.y).toBeGreaterThanOrEqual(0.8 * eyeWay);
    const headWay = 0.45 * look;
    expect(headAdded(r.p)).toBeGreaterThan(0);
    expect(headAdded(r.p)).toBeLessThan(0.4 * headWay);
    // the head comes round to her and the eyes settle back in it
    run(r, 1.5, target);
    expect(headFacing(r)).toBeCloseTo(yawTo(r, target), 1);
    expect(headAdded(r.p)).toBeCloseTo(headWay, 1);
    for (const e of ['eyeL', 'eyeR']) expect(Math.abs(r.p.bones[e].rotation.y)).toBeLessThan(0.05);
    // and nods down to her (she is below the head)
    expect(r.p.bones.head.rotation.x - r.p.target.rot[HEAD_Y - 1]).toBeLessThan(-0.05);
  });

  it('turns are never fast', () => {
    const r = rig();
    // she darts from one side to the other (settled, then the whole way
    // across: the worst case) and in and out, and back and forth quickly
    const L = around(r, 1.25, 2), R = around(r, -1.25, 2), FAR = around(r, 1.25, 9);
    const slow = [L, R, L, FAR, R, null, L];
    const quick = [L, R, FAR, R, L, null, R];
    const at = (t) => (t < 8.4 ? slow[Math.floor(t / 1.2) % 7] : quick[Math.floor(t / 0.35) % 7]);
    const ys = [];
    run(r, 14, at, { each: (rr) => ys.push(headAdded(rr.p)) });
    const per = Math.round(0.5 / DT);
    let maxStep = 0, moved = 0;
    for (let i = per; i < ys.length; i++) maxStep = Math.max(maxStep, Math.abs(ys[i] - ys[i - per]));
    for (let i = 1; i < ys.length; i++) moved = Math.max(moved, Math.abs(ys[i] - ys[i - 1]) / DT);
    expect(Math.max(...ys.map(Math.abs))).toBeGreaterThan(0.1); // it did turn
    expect(maxStep).toBeLessThanOrEqual((75 * Math.PI) / 180);
    expect(moved).toBeLessThanOrEqual(2.618);
  });

  it('near and far: in within 4 m, out beyond 5 m', () => {
    const r = rig();
    const yaw = 0.6;
    run(r, 1, around(r, yaw, 6));
    expect(Math.abs(headAdded(r.p))).toBeLessThan(1e-9);
    run(r, 1, around(r, yaw, 4.5)); // approaching from far: not yet near
    expect(Math.abs(headAdded(r.p))).toBeLessThan(1e-9);
    // she comes within 4 m: the gaze shift starts with a blink, the turn starts
    let shut = 1;
    run(r, GAZE.BLINK_TIME + DT, around(r, yaw, 3.9), { each: (rr) => { shut = Math.min(shut, rr.p.bones.eyeL.scale.y); } });
    expect(shut).toBeLessThan(0.2);
    run(r, 1, around(r, yaw, 3.9));
    const full = headAdded(r.p);
    expect(full).toBeGreaterThan(0.45 * yaw * 0.8);
    run(r, 1, around(r, yaw, 4.6)); // a little out: still looking
    expect(headAdded(r.p)).toBeGreaterThan(0.45 * yaw * 0.8);
    // beyond 5 m: easing back, ahead again after HEAD_OUT
    run(r, 0.2, around(r, yaw, 5.1));
    const easing = headAdded(r.p);
    expect(easing).toBeLessThan(full);
    expect(easing).toBeGreaterThan(0.1 * full); // eased, not snapped
    run(r, 1, around(r, yaw, 5.1));
    expect(Math.abs(headAdded(r.p))).toBeLessThan(0.01);
    // no target at all: ahead
    run(r, 1, around(r, yaw, 2));
    run(r, 1.5, null);
    expect(Math.abs(headAdded(r.p))).toBeLessThan(0.01);
  });

  it('glances away after looking a while, then back', () => {
    for (const side of [1, -1]) {
      const r = rig((look) => (side > 0 ? look.seed < 0.5 : look.seed >= 0.5));
      const target = around(r, 0.5, 2.5);
      const off = [];
      run(r, 8, target, { each: (rr) => off.push([rr.t, headFacing(rr) - yawTo(rr, target)]) });
      const during = (a, b) => off.filter(([t]) => t >= a && t < b).map(([, d]) => d);
      // settled on her, not yet glancing
      for (const d of during(1.2, 3.95)) expect(Math.abs(d)).toBeLessThan(0.05);
      // the glance: at least 0.2 rad off her, to the hash's side, for a while
      const g = during(4, 4 + GAZE.GLANCE_FOR);
      const most = g.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0);
      expect(Math.abs(most)).toBeGreaterThanOrEqual(0.2);
      expect(Math.sign(most)).toBe(side);
      // and back on her
      for (const d of during(6.4, 8)) expect(Math.abs(d)).toBeLessThan(0.05);
    }
  });

  it('not behind: she is 120 degrees round, no turn; past 75 the turn stops at 75', () => {
    const r = rig();
    run(r, 3, around(r, (120 * Math.PI) / 180, 2));
    expect(Math.abs(headAdded(r.p))).toBeLessThan(1e-9);
    for (const e of ['eyeL', 'eyeR']) expect(Math.abs(r.p.bones[e].rotation.y)).toBeLessThan(1e-9);
    expect(r.p.bones.mouth.scale.x).toBe(1);
    const r2 = rig();
    run(r2, 3, around(r2, (95 * Math.PI) / 180, 2));
    expect(headFacing(r2)).toBeLessThan(GAZE.LOOK_MAX + 0.05);
    expect(headFacing(r2)).toBeGreaterThan(GAZE.LOOK_MAX - 0.05);
    // the eyes take the rest
    expect(r2.p.bones.eyeL.rotation.y).toBeGreaterThan(0.2);
  });

  it('reduced motion: no glance, turns twice as slow, blinks remain', () => {
    const a = rig(), b = rig();
    const ta = around(a, 0.6, 2.5), tb = around(b, 0.6, 2.5);
    const ya = [], yb = [];
    run(a, 0.6, ta, { each: (rr) => ya.push(headAdded(rr.p)) });
    run(b, 1.2, tb, { reducedMotion: true, each: (rr) => yb.push(headAdded(rr.p)) });
    // as far at 2T as the normal turn at T
    for (const i of [6, 12, 24, 35]) expect(yb[2 * i + 1]).toBeCloseTo(ya[i], 2);
    let shut = 1;
    const off = [];
    run(b, 10, tb, {
      reducedMotion: true,
      each: (rr) => { shut = Math.min(shut, rr.p.bones.eyeL.scale.y); if (rr.t > 3) off.push(headFacing(rr) - yawTo(rr, tb)); },
    });
    for (const d of off) expect(Math.abs(d)).toBeLessThan(0.05);
    expect(shut).toBeLessThan(0.2);
  });

  it('the smile widens while she is near and looked at', () => {
    const r = rig();
    const m = r.p.bones.mouth;
    run(r, 1, around(r, 0.3, 7));
    expect(m.scale.x).toBe(1);
    run(r, 0.5, around(r, 0.3, 2));
    expect(m.scale.x).toBeCloseTo(GAZE.SMILE_X, 9);
    expect(m.scale.y).toBeCloseTo(GAZE.SMILE_Y, 9);
    run(r, 0.1, around(r, 0.3, 7));
    expect(m.scale.x).toBeLessThan(GAZE.SMILE_X); // eases back
    expect(m.scale.x).toBeGreaterThan(1);
    run(r, 0.5, around(r, 0.3, 7));
    expect(m.scale.x).toBeCloseTo(1, 9);
    expect(m.scale.y).toBeCloseTo(1, 9);
  });

  it('the local cat only: the gaze takes one target, nothing else is read', () => {
    // The game passes the local cat's head (never a co-walker's cat). The
    // options carry one `target`; another cat near by, passed alongside, is
    // not looked at.
    const a = rig(), b = rig();
    const mine = around(a, 0.5, 2.5), other = around(b, -0.8, 1.5);
    run(a, 2, mine);
    for (let i = 0; i < 120; i++) {
      b.t += DT;
      pose(b.p, { mode: 'stand', t: b.t });
      applyPose(b.p, DT);
      stepGaze(b.p, b.gaze, DT, b.t, { target: mine, others: [other], coWalker: other });
    }
    expect(headAdded(b.p)).toBe(headAdded(a.p));
    expect(b.p.bones.eyeL.rotation.y).toBe(a.p.bones.eyeL.rotation.y);
  });

  it('adds on top of the pose and never piles up', () => {
    const r = rig();
    const target = around(r, 0.6, 2);
    run(r, 2, target);
    const y = r.p.bones.head.rotation.y;
    const added = headAdded(r.p);
    // a frame where the pose was not re-applied: the turn is not added twice
    stepGaze(r.p, r.gaze, DT, r.t + DT, { target });
    expect(r.p.bones.head.rotation.y).toBeCloseTo(y, 3);
    // the pose rewrites the bones, the gaze adds its turn again on top
    run(r, 0.1, target);
    expect(headAdded(r.p)).toBeCloseTo(added, 3);
  });

  it('allocates nothing per frame', () => {
    const r = rig();
    const target = around(r, 0.6, 2);
    run(r, 0.2, target);
    const spies = [
      vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Matrix4.prototype, 'clone'),
      vi.spyOn(THREE.Quaternion.prototype, 'clone'),
    ];
    for (let f = 0; f < 100; f++) stepGaze(r.p, r.gaze, DT, r.t + f * DT, { target: f % 50 < 25 ? target : null });
    for (const s of spies) expect(s).toHaveBeenCalledTimes(0);
  });
});
