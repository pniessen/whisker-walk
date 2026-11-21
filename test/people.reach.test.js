import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { buildSpot } from '../src/people/figure.js';
import { spotKind } from '../src/people/look.js';
import { pose, applyPose } from '../src/people/pose.js';
import { createGaze, stepGaze } from '../src/people/gaze.js';
import { REACH, headTopOffset, catVolumes, createScratch, stepScratch, palmPoint } from '../src/people/reach.js';
import * as kit from '../src/people/index.js';

// The head scratch (spec "The head scratch"): the person kneels (an older
// person bows), and the right hand comes to her head, slowly, from in front
// and above, rests on it and follows it, and never goes through her.

const material = new THREE.MeshStandardMaterial({ vertexColors: true });
const DT = 1 / 60;
const UP = new THREE.Vector3(0, 1, 0);
const CATS = ['tabby', 'siamese', 'persian', 'mainecoon', 'hagrid'];
const REACH_FRAMES = 150; // 2.5 s: a touch rests by then (R13's eased 1.2 m/s hand)
const STEP_MAX = 0.025; // m: the palm's most in one 1/60 s frame (R13)

function spotOf(kind) {
  for (let x = 0; x < 400; x++) {
    const def = { x, z: 7 };
    if (spotKind(def) === kind) return def;
  }
  throw new Error('no spot');
}

// A person in a group moved and turned in the world, so everything has to
// work in the figure's own frame.
function rig(kind = 'adult', over = {}) {
  const { people } = buildSpot({ ...spotOf(kind), ...over }, { material });
  const p = people[0];
  const group = new THREE.Group();
  group.position.set(3, 0, -2);
  group.rotation.y = 0.4;
  group.add(p.figure);
  group.updateMatrixWorld(true);
  return { p, group, gaze: createGaze(p.look), sc: createScratch(), t: 0 };
}

// Her middle `dist` m in front of the figure; heading 0 = facing the person.
function place(r, cat, dist, heading = 0, side = 0) {
  r.group.updateMatrixWorld(true);
  const at = r.p.figure.localToWorld(new THREE.Vector3(side, 0, -dist));
  cat.position.copy(at);
  cat.rotation.y = r.group.rotation.y + Math.PI + heading;
  cat.updateMatrixWorld(true);
}

const HEAD_TOP = new THREE.Vector3();
function headTopOf(cat, out = HEAD_TOP) {
  cat.updateMatrixWorld(true);
  return cat.userData.parts.head.getWorldPosition(out).addScaledVector(UP, headTopOffset(cat));
}

// One frame as the walk will run it: pose, applyPose, the gaze, then the scratch.
function frame(r, cat, extra = {}) {
  r.t += DT;
  pose(r.p, { mode: 'kneel', t: r.t });
  applyPose(r.p, DT);
  const top = cat ? headTopOf(cat) : extra.headTop ?? null;
  stepGaze(r.p, r.gaze, DT, r.t, { target: top });
  const volumes = cat ? (r.vol = catVolumes(cat, r.vol)) : undefined;
  return stepScratch(r.p, r.sc, DT, { headTop: top, volumes });
}

// ---- the arm's samples and her volumes ------------------------------------------
const A = new THREE.Vector3();
const Bv = new THREE.Vector3();
const P = new THREE.Vector3();
const TIP = new THREE.Vector3();
const D = new THREE.Vector3();
function segPointDist(a, b, c) {
  D.subVectors(b, a);
  const L2 = D.lengthSq();
  const k = L2 > 0 ? Math.min(1, Math.max(0, P.subVectors(c, a).dot(D) / L2)) : 0;
  return P.copy(a).addScaledVector(D, k).distanceTo(c);
}
// the right arm, every 0.02 m along the upper arm, the forearm and the hand
// (each(point, the limb's radius there: parts.js's tubes, the hand's half
// thickness as it lies palm down))
function armSamples(p, each) {
  const B = p.bones;
  const d = p.look.dims;
  p.figure.updateMatrixWorld(true);
  B.handR.localToWorld(TIP.set(0, -d.hand * 0.96, 0));
  const chain = [B.upperArmR, B.forearmR, B.handR];
  const radii = [[d.uaR[0], d.uaR[1]], [d.faR[0], d.faR[1]], [0.18 * d.hand, 0.18 * d.hand]];
  for (let i = 0; i < 3; i++) {
    chain[i].getWorldPosition(A);
    if (i < 2) chain[i + 1].getWorldPosition(Bv); else Bv.copy(TIP);
    const n = Math.max(1, Math.ceil(A.distanceTo(Bv) / 0.02));
    for (let k = 0; k <= n; k++) each(P.lerpVectors(A, Bv, k / n), radii[i][0] + (radii[i][1] - radii[i][0]) * (k / n), i);
  }
}
// the closest distance between segments p1-q1 and p2-q2, by sampling (a test's check)
function segSeg(p1, q1, p2, q2) {
  let best = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i <= 40; i++) best = Math.min(best, segPointDist(p2, q2, v.lerpVectors(p1, q1, i / 40)));
  return best;
}
const Q = new THREE.Vector3();
const EA = new THREE.Vector3();
const EQ = new THREE.Vector3();
// her ear's tapered capsule (radius r0 at its base a, r1 at its tip b); a
// flat limb (rSide: the palm-down hand, an ellipse across, rThick up and down)
function earClearance(point, e, rThick = 0, rSide = 0) {
  EA.subVectors(e.b, e.a);
  const t = Math.min(1, Math.max(0, EQ.subVectors(point, e.a).dot(EA) / EA.lengthSq()));
  EQ.copy(e.a).addScaledVector(EA, t);
  const d = EQ.distanceTo(point);
  let r = rThick;
  if (rSide > rThick && d > 1e-6) {
    const sn = Math.abs(EQ.y - point.y) / d;
    r = 1 / Math.sqrt((1 - sn * sn) / (rSide * rSide) + (sn * sn) / (rThick * rThick));
  }
  return d - r - (e.r0 + (e.r1 - e.r0) * t);
}
function clearance(point, vol) {
  const head = point.distanceTo(vol.head.center) - vol.head.radius;
  Q.copy(point);
  const body = segPointDist(vol.body.a, vol.body.b, Q) - vol.body.r;
  let ears = Infinity;
  for (let i = 0; i < (vol.earN ?? 0); i++) ears = Math.min(ears, earClearance(point, vol.ears[i]));
  return Math.min(head, body, ears);
}
// the ears alone (the hand as wide as it is, with its thumb: 0.36 of its
// length to the sides, its thickness up and down)
function worstEar(p, vol) {
  let worst = Infinity;
  armSamples(p, (pt, rad, limb) => {
    const side = limb === 2 ? 0.36 * p.look.dims.hand : 0;
    for (let i = 0; i < vol.earN; i++) worst = Math.min(worst, earClearance(pt, vol.ears[i], rad, side));
  });
  return worst;
}
function worstClearance(p, vol) {
  let worst = Infinity;
  armSamples(p, (pt) => { worst = Math.min(worst, clearance(Q.copy(pt), vol)); });
  return worst;
}
// the same, the limbs' surfaces (the samples' clearance less the limb's radius)
function worstSurface(p, vol) {
  let worst = Infinity;
  armSamples(p, (pt, rad) => { worst = Math.min(worst, clearance(Q.copy(pt), vol) - rad); });
  return worst;
}
// She stands facing the person, her middle `want` m in front, or as near as
// that as she can (0.05 m steps): her head clear of the shoulder by the upper
// arm's radius, the person's middle line outside her head and body. Returns the distance.
function standOff(r, cat, want) {
  const vol = { head: new THREE.Sphere(), body: { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 } };
  pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT, 0);
  const dm = r.p.look.dims;
  for (let d = want; ; d = Math.round((d + 0.05) * 100) / 100) {
    place(r, cat, d);
    catVolumes(cat, vol);
    if (!insidePerson(r, vol, 0) && clearance(r.p.bones.upperArmR.getWorldPosition(new THREE.Vector3()), vol) > dm.uaR[0] * 1.06) return d;
  }
}
// her head or body in the person's chest (the pelvis-neck line, give the chest's depth)
function insidePerson(r, vol, give = r.p.look.dims.chestR * r.p.look.dims.torsoZ) {
  const pel = r.p.bones.pelvis.getWorldPosition(new THREE.Vector3());
  const nk = r.p.bones.neck.getWorldPosition(new THREE.Vector3());
  return segPointDist(pel, nk, vol.head.center) < vol.head.radius + give
    || segSeg(pel, nk, vol.body.a, vol.body.b) < vol.body.r + give;
}

// how far in front of the person's middle, and how high, a world point is
const LOC = new THREE.Vector3();
function local(r, v) { r.group.updateMatrixWorld(true); return r.p.figure.worldToLocal(LOC.copy(v)); }

describe('her head and her volumes', () => {
  it('headTopOffset is her head\'s top above the head part, scaled with her', () => {
    for (const breed of CATS) {
      const cat = buildCat(breed);
      animateCat(cat, 'follow', 0.5, 0, false);
      const off = headTopOffset(cat);
      expect(off).toBeGreaterThan(0.1);
      expect(off).toBeLessThan(0.4);
    }
    const small = buildCat('siamese');
    const big = buildCat('mainecoon');
    expect(headTopOffset(big)).toBeGreaterThan(headTopOffset(small) * 1.2); // the coon is 1.3 x, the siamese 0.95 x
  });

  it('catVolumes: the head sphere tops out at her head\'s top, the body capsule lies along her', () => {
    for (const breed of CATS) {
      const cat = buildCat(breed);
      cat.position.set(2, 0, 1);
      cat.rotation.y = 0.8;
      animateCat(cat, 'follow', 0.5, 0, false);
      const v = catVolumes(cat);
      const top = headTopOf(cat, new THREE.Vector3());
      expect(Math.abs(v.head.center.y + v.head.radius - top.y)).toBeLessThan(1e-6);
      expect(v.head.radius).toBeGreaterThan(0.1);
      // the body's axis runs front to back (her heading), level when she stands
      const ax = new THREE.Vector3().subVectors(v.body.a, v.body.b);
      const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, cat.rotation.y);
      expect(Math.abs(ax.normalize().dot(fwd))).toBeGreaterThan(0.95);
      expect(v.body.r).toBeGreaterThan(0.1);
      // the head is in front of the body's middle
      const mid = new THREE.Vector3().addVectors(v.body.a, v.body.b).multiplyScalar(0.5);
      expect(new THREE.Vector3().subVectors(v.head.center, mid).dot(fwd)).toBeGreaterThan(0.2);
    }
  });

  it('catVolumes fills `out` in place', () => {
    const cat = buildCat('tabby');
    const out = catVolumes(cat);
    const again = catVolumes(cat, out);
    expect(again).toBe(out);
    expect(again.head).toBe(out.head);
  });
});

describe('the head scratch', () => {
  it('REACH holds the spec\'s numbers', () => {
    expect(REACH).toEqual({ LEAN_MAX: 0.5, APPROACH: 0.7, ABOVE: 0.12, CLEAR: 0.01, STROKE: 0.02, STROKE_HZ: 1.5, WITHDRAW: 0.4, HELD_MAX: 0.55, HOLD_R: 2.5, MIN_TIME: 2.5, STAND_DELAY: 0.6, PERCHED_ABOVE: 0.3 });
    expect(Object.isFrozen(REACH)).toBe(true);
    for (const k of ['REACH', 'headTopOffset', 'catVolumes', 'createScratch', 'stepScratch']) expect(kit[k]).toBeDefined();
  });

  // R13: the palm never goes faster than 1.2 m/s, eased; the held hand
  // settles, may go to the ready place, and the way in takes its time, so a
  // touch is resting within about 2 s (REACH_TIME)
  it('touches when in reach: resting within REACH_TIME, the palm CLEAR above her head', () => {
    for (const kind of ['adult', 'older']) {
      const r = rig(kind);
      const cat = buildCat('tabby');
      animateCat(cat, 'requestPet', 1, 0, false);
      place(r, cat, 0.65);
      let state;
      for (let i = 0; i < REACH_FRAMES; i++) {
        state = frame(r, cat);
        expect(worstClearance(r.p, r.vol), `${kind} frame ${i}`).toBeGreaterThan(0.005);
        expect(worstEar(r.p, r.vol), `${kind} frame ${i}`).toBeGreaterThan(0);
      }
      expect(state, kind).toBe('resting');
      const want = headTopOf(cat, new THREE.Vector3()).addScaledVector(UP, REACH.CLEAR);
      expect(palmPoint(r.p, new THREE.Vector3()).distanceTo(want), kind).toBeLessThan(0.02);
    }
  });

  // ruling R10: a kneeling adult touches every preset cat standing on the same
  // ground, the tallest by way of the point over her head. About 0.65 m: her
  // middle at 0.65 m, or the nearest place (0.05 m steps) where her head is
  // out of the person and the hand has room to rise in front of her face (a
  // Maine Coon's head, 0.62 m across and 0.52 m in front of her middle, is in
  // the person's chest at 0.65 m).
  // (the Maine Coon by a 1.70 m adult: a shorter kneeling adult's arm cannot
  // go over her head's sphere, 1.17 m up and 0.62 m across, clear of it)
  it('touches every preset cat standing about 0.65 m in front of a 1.61 m adult', () => {
    const at = {};
    for (const breed of CATS) {
      const cat = buildCat(breed);
      animateCat(cat, 'follow', 1, 0, false);
      const tall = breed === 'mainecoon' ? 1.7 : 1.61;
      let state;
      for (let d = 0.65; d <= 1.1 + 1e-9 && state !== 'resting'; d = Math.round((d + 0.05) * 100) / 100) {
        const r = rig('adult', { height: tall });
        expect(r.p.look.height).toBeCloseTo(tall, 5);
        if (standOff(r, cat, d) !== d) continue;
        at[breed] = d;
        for (let i = 0; i < REACH_FRAMES; i++) {
          state = frame(r, cat);
          expect(worstClearance(r.p, r.vol), `${breed} ${d} m frame ${i}`).toBeGreaterThan(0.005);
          expect(worstEar(r.p, r.vol), `${breed} ${d} m frame ${i}`).toBeGreaterThan(0);
        }
        if (state !== 'resting') continue;
        const want = headTopOf(cat, new THREE.Vector3()).addScaledVector(UP, REACH.CLEAR);
        expect(palmPoint(r.p, new THREE.Vector3()).distanceTo(want), breed).toBeLessThan(0.02);
      }
      expect(state, breed).toBe('resting');
    }
    console.info(`every preset cat touched within 2.5 s, her middle this far in front: ${JSON.stringify(at)}`);
    for (const breed of CATS) expect(at[breed], breed).toBeLessThanOrEqual(breed === 'mainecoon' ? 1.1 : 0.8);
  });

  it('the palm faces down and the hand comes from in front and above', () => {
    const r = rig('adult');
    const cat = buildCat('tabby');
    animateCat(cat, 'requestPet', 1, 0, false);
    place(r, cat, 0.75);
    const top = headTopOf(cat, new THREE.Vector3());
    const n = new THREE.Vector3();
    let wentAbove = false;
    for (let i = 0; i < REACH_FRAMES; i++) {
      frame(r, cat);
      const palm = palmPoint(r.p, new THREE.Vector3());
      const flat = Math.hypot(palm.x - top.x, palm.z - top.z);
      // over her head (within 0.1 m of it on the ground), the hand is never lower than its rest
      if (flat < 0.1) expect(palm.y).toBeGreaterThan(top.y + REACH.CLEAR - 1e-6);
      if (flat < 0.05 && palm.y > top.y + REACH.ABOVE - 0.01) wentAbove = true;
    }
    expect(wentAbove).toBe(true);
    // the palm's normal (the hand's -x, the palm faces the thigh at rest) is down
    n.set(-1, 0, 0).transformDirection(r.p.bones.handR.matrixWorld);
    expect(n.y).toBeLessThan(-0.99);
  });

  it('follows her head: moved 0.03 m a frame for 10 frames, the palm stays on it', () => {
    const r = rig('adult');
    const cat = buildCat('tabby');
    animateCat(cat, 'requestPet', 1, 0, false);
    place(r, cat, 0.65);
    for (let i = 0; i < REACH_FRAMES + 30; i++) frame(r, cat);
    expect(r.sc.state).toBe('resting');
    const step = new THREE.Vector3(0.03, 0, 0).applyAxisAngle(UP, r.group.rotation.y); // to the person's right
    for (let i = 0; i < 10; i++) {
      cat.position.add(step);
      expect(frame(r, cat)).toBe('resting');
      const want = headTopOf(cat, new THREE.Vector3()).addScaledVector(UP, REACH.CLEAR);
      expect(palmPoint(r.p, new THREE.Vector3()).distanceTo(want)).toBeLessThan(0.02 + 1e-6);
    }
  });

  it('strokes slowly along her head and keeps clear of it', () => {
    const r = rig('adult');
    const cat = buildCat('tabby');
    animateCat(cat, 'requestPet', 1, 0, false);
    place(r, cat, 0.65);
    for (let i = 0; i < REACH_FRAMES; i++) frame(r, cat);
    const want = headTopOf(cat, new THREE.Vector3()).addScaledVector(UP, REACH.CLEAR);
    let most = 0;
    for (let i = 0; i < 120; i++) {
      frame(r, cat);
      most = Math.max(most, palmPoint(r.p, new THREE.Vector3()).distanceTo(want));
      expect(worstClearance(r.p, r.vol)).toBeGreaterThan(0.005);
      expect(worstEar(r.p, r.vol)).toBeGreaterThan(0);
    }
    expect(most).toBeGreaterThan(0.015);
    expect(most).toBeLessThan(0.02 + 1e-6);
  });

  it('holds the hand out when she is out of reach (1.5 m): low, at most 0.55 m in front', () => {
    for (const kind of ['adult', 'older']) {
      const r = rig(kind);
      const cat = buildCat('tabby');
      animateCat(cat, 'requestPet', 1, 0, false);
      place(r, cat, 1.5);
      let state;
      for (let i = 0; i < 120; i++) state = frame(r, cat);
      expect(state, kind).toBe('held');
      armSamples(r.p, () => {}); // the matrices
      const B = r.p.bones;
      const pts = [B.handR.getWorldPosition(new THREE.Vector3()), B.handR.localToWorld(new THREE.Vector3(0, -r.p.look.dims.hand * 0.96, 0)), palmPoint(r.p, new THREE.Vector3())];
      const shoulder = B.upperArmR.getWorldPosition(new THREE.Vector3()).y;
      for (const v of pts) {
        const l = local(r, v);
        expect(-l.z, kind).toBeLessThanOrEqual(REACH.HELD_MAX);
        expect(-l.z, kind).toBeGreaterThan(0.2); // out in front, toward her
        // low: a kneeling adult's below 0.6 m; an older person bows, the
        // shoulder stays high (about 1.35 m), and the hand is held as low as
        // the arm goes, well under the shoulder
        if (kind === 'adult') expect(v.y, kind).toBeLessThan(0.6);
        else expect(v.y, kind).toBeLessThan(shoulder - 0.4);
      }
      const n = new THREE.Vector3(-1, 0, 0).transformDirection(B.handR.matrixWorld);
      expect(n.y, kind).toBeLessThan(-0.95); // palm down
    }
  });

  // the kneeling (or bowing) shoulder, figure frame
  function shoulderOf(r) {
    pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT, 0);
    return r.p.figure.worldToLocal(r.p.bones.upperArmR.getWorldPosition(new THREE.Vector3()));
  }

  it('perched (raised so her head top is 0.35 m over the shoulder): held, never reaching up', () => {
    for (const kind of ['adult', 'older']) {
      for (const breed of ['tabby', 'mainecoon']) {
        const r = rig(kind);
        const sh = shoulderOf(r);
        const cat = buildCat(breed);
        animateCat(cat, 'requestPet', 1, 0, false);
        standOff(r, cat, 0.9);
        // up on a wall: her head's top 0.35 m over the shoulder
        cat.position.y += sh.y + 0.35 - headTopOf(cat, new THREE.Vector3()).y;
        cat.updateMatrixWorld(true);
        for (let i = 0; i < 120; i++) {
          expect(frame(r, cat), `${kind} ${breed}`).toBe('held');
          expect(worstClearance(r.p, r.vol), `${kind} ${breed}`).toBeGreaterThan(0.005);
        }
      }
    }
  });

  it('her head just over PERCHED_ABOVE is perched; just under it is touched', () => {
    const r = rig('adult');
    const sh = shoulderOf(r);
    const above = r.p.figure.localToWorld(new THREE.Vector3(0.05, sh.y + REACH.PERCHED_ABOVE + 0.01, -0.45));
    for (let i = 0; i < 90; i++) expect(frame(r, null, { headTop: above })).toBe('held');
    const r2 = rig('adult');
    const below = r2.p.figure.localToWorld(new THREE.Vector3(0.05, sh.y + REACH.PERCHED_ABOVE - 0.05, -0.45));
    let s;
    for (let i = 0; i < 90; i++) s = frame(r2, null, { headTop: below });
    expect(s).toBe('resting');
  });

  it('no way in (a Maine Coon 1 m in front of a 1.61 m adult): the hand goes back to held out, not parked at the chest', () => {
    const r = rig('adult', { height: 1.61 });
    const cat = buildCat('mainecoon');
    animateCat(cat, 'follow', 1, 0, false);
    place(r, cat, 1.0);
    for (let i = 0; i < 180; i++) {
      expect(frame(r, cat)).toBe('held');
      expect(worstClearance(r.p, r.vol), `frame ${i}`).toBeGreaterThan(0.005);
    }
    expect(r.sc.blocked).toBe(true); // not planned again till she moves
    const l = local(r, palmPoint(r.p, new THREE.Vector3()));
    expect(-l.z).toBeGreaterThan(0.2); // held out toward her
    expect(-l.z).toBeLessThanOrEqual(REACH.HELD_MAX);
  });

  it('with no cat (headTop null) the hand is held out ahead', () => {
    const r = rig('adult');
    for (let i = 0; i < 30; i++) expect(frame(r, null, { headTop: null })).toBe('held');
    const l = local(r, palmPoint(r.p, new THREE.Vector3()));
    expect(-l.z).toBeGreaterThan(0.2);
    expect(Math.abs(l.x)).toBeLessThan(0.25);
  });

  for (const [what, move] of [
    // to the person's left her head goes out of the right hand's reach; to the
    // right it swings toward the arm (and may stay in reach, the hand on it)
    ['she turns 90 degrees to his left in one frame', (r, cat) => { cat.rotation.y -= Math.PI / 2; }],
    ['she turns 90 degrees to his right in one frame', (r, cat) => { cat.rotation.y += Math.PI / 2; }],
    ['she moves her head 0.5 m away in one frame', (r, cat) => { cat.position.add(new THREE.Vector3(0, 0, -0.5).applyAxisAngle(UP, r.group.rotation.y)); }],
  ]) {
    it(`${what} mid-touch: it withdraws, then holds out, never through her`, () => {
      for (const breed of ['tabby', 'siamese']) {
        for (const kind of ['adult', 'older']) {
          const r = rig(kind);
          const cat = buildCat(breed);
          animateCat(cat, 'requestPet', 1, 0, false);
          place(r, cat, 0.65);
          for (let i = 0; i < REACH_FRAMES; i++) frame(r, cat);
          expect(r.sc.state, `${breed} ${kind}`).toBe('resting');
          move(r, cat);
          cat.updateMatrixWorld(true);
          const seen = [];
          const last = palmPoint(r.p, new THREE.Vector3());
          for (let i = 0; i < 120; i++) {
            const s = frame(r, cat);
            if (seen[seen.length - 1] !== s) seen.push(s);
            expect(worstClearance(r.p, r.vol), `${breed} ${kind} frame ${i}`).toBeGreaterThan(0.005);
            expect(worstEar(r.p, r.vol), `${breed} ${kind} frame ${i}`).toBeGreaterThan(0);
            const palm = palmPoint(r.p, new THREE.Vector3());
            expect(palm.distanceTo(last), `${breed} ${kind} frame ${i}: a step`).toBeLessThanOrEqual(STEP_MAX);
            last.copy(palm);
          }
          // she went out of reach: withdrawn and held out; or (turned to his
          // right) still in reach: the hand stays on her, or comes back
          if (seen.includes('withdrawing')) expect(seen.slice(0, 2), `${breed} ${kind}`).toEqual(['withdrawing', 'held']);
          else expect(seen, `${breed} ${kind}`).toEqual(['resting']);
          if (/0\.5 m/.test(what) || /left/.test(what)) expect(seen.slice(0, 2), `${breed} ${kind}`).toEqual(['withdrawing', 'held']);
        }
      }
    });
  }

  it('never through her: every cat, a grid of places and headings, an adult and an older person', () => {
    const vol = catVolumes(buildCat('tabby'));
    let worst = Infinity;
    let ear = Infinity;
    let earAt = '';
    let worstAt = '';
    let surface = Infinity;
    let surfaceAt = '';
    let touched = 0;
    let jump = 0;
    let jumpAt = '';
    let configs = 0;
    let skipped = 0;
    for (const breed of CATS) {
      const cat = buildCat(breed);
      for (const catPose of ['requestPet', 'follow']) {
        for (const kind of ['adult', 'older']) {
          for (let d10 = 4; d10 <= 12; d10++) {
            for (let h = 0; h < 8; h++) {
              const r = rig(kind);
              place(r, cat, d10 / 10, (h * Math.PI) / 4);
              animateCat(cat, catPose, 1, 0, false);
              cat.updateMatrixWorld(true);
              catVolumes(cat, vol);
              // she inside the person (ruling R12: her head or an ear at the
              // shoulder, within two upper arms' thickness of it, or her head
              // or body in the chest): no arm can be clear of her there, and
              // she cannot be there (the person's soft bump and body)
              pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT, 0);
              const sh = r.p.bones.upperArmR.getWorldPosition(new THREE.Vector3());
              if (insidePerson(r, vol) || clearance(sh, vol) < 2 * r.p.look.dims.uaR[0]) { skipped++; continue; }
              configs++;
              r.vol = vol;
              let rested = false;
              const last = new THREE.Vector3();
              for (let i = 0; i < 180; i++) {
                const s = frame(r, cat);
                const palm = palmPoint(r.p, new THREE.Vector3());
                if (i > 0) { const j = palm.distanceTo(last); if (j > jump) { jump = j; jumpAt = `${breed} ${catPose} ${kind} ${d10 / 10} m ${h * 45} deg frame ${i} ${s}`; } }
                const ec = worstEar(r.p, vol);
                if (ec < ear) { ear = ec; earAt = `${breed} ${catPose} ${kind} ${d10 / 10} m ${h * 45} deg frame ${i} ${s}`; }
                last.copy(palm);
                if (s === 'resting') rested = true;
                const c = worstClearance(r.p, vol);
                if (c < worst) { worst = c; worstAt = `${breed} ${catPose} ${kind} ${d10 / 10} m ${h * 45} deg frame ${i} ${s}`; }
                const sf = worstSurface(r.p, vol);
                if (sf < surface) { surface = sf; surfaceAt = `${breed} ${catPose} ${kind} ${d10 / 10} m ${h * 45} deg frame ${i} ${s}`; }
              }
              if (rested) touched++;
            }
          }
        }
      }
    }
    console.info(`never through her: ${configs} places (${skipped} skipped: she inside the person), ${touched} touched; worst clearance ${worst.toFixed(4)} m at ${worstAt}; worst surface ${surface.toFixed(4)} m at ${surfaceAt}; worst ear (skin) ${ear.toFixed(4)} m at ${earAt}; biggest palm step ${jump.toFixed(4)} m at ${jumpAt}`);
    expect(worst, worstAt).toBeGreaterThan(0.005); // the arm's middle line, as the spec words it
    expect(surface, surfaceAt).toBeGreaterThan(0); // and its skin
    expect(ear, earAt).toBeGreaterThan(0); // her ears too
    expect(jump, jumpAt).toBeLessThanOrEqual(STEP_MAX); // never a jump (R13)
    expect(touched).toBeGreaterThan(configs * 0.15); // the sweep covers real touches
    expect(skipped).toBeLessThan(configs * 0.25);
  }, 240000);

  it('allocates nothing per frame', () => {
    const r = rig('adult');
    const cat = buildCat('tabby');
    animateCat(cat, 'requestPet', 1, 0, false);
    place(r, cat, 0.9);
    const vol = catVolumes(cat);
    const top = headTopOf(cat, new THREE.Vector3());
    for (let i = 0; i < 5; i++) { pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT); stepScratch(r.p, r.sc, DT, { headTop: top, volumes: vol }); }
    const spies = [
      vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Matrix4.prototype, 'clone'),
      vi.spyOn(THREE.Quaternion.prototype, 'clone'),
    ];
    for (let i = 0; i < 100; i++) {
      pose(r.p, { mode: 'kneel', t: i * DT }); applyPose(r.p, DT);
      catVolumes(cat, vol);
      stepScratch(r.p, r.sc, DT, { headTop: top, volumes: vol });
    }
    for (const s of spies) { expect(s).toHaveBeenCalledTimes(0); s.mockRestore(); }
  });

  it('does not add its lean twice when applyPose does not run', () => {
    const r = rig('adult');
    const cat = buildCat('tabby');
    animateCat(cat, 'requestPet', 1, 0, false);
    place(r, cat, 1.05); // far enough that the chest leans to reach
    const top = headTopOf(cat, new THREE.Vector3());
    const vol = catVolumes(cat);
    for (let i = 0; i < 200; i++) { pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT); stepScratch(r.p, r.sc, DT, { headTop: top, volumes: vol }); }
    expect(r.sc.lean).toBeGreaterThan(0.01);
    const posed = r.p.target.rot[2 * 3]; // the chest's x as the pose has it (JOINTS: root, pelvis, chest)
    expect(r.p.bones.chest.rotation.x).toBeCloseTo(posed - r.sc.lean, 9);
    for (let i = 0; i < 5; i++) {
      stepScratch(r.p, r.sc, DT, { headTop: top, volumes: vol });
      expect(r.p.bones.chest.rotation.x).toBeCloseTo(posed - r.sc.lean, 9);
    }
    // and the chest's whole lean stays within LEAN_MAX
    expect(-r.p.bones.chest.rotation.x).toBeLessThanOrEqual(REACH.LEAN_MAX + 1e-9);
  });
});
