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
import { bumpCircles } from '../src/people/bumps.js';

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
// Where the soft bump stops her walked straight at the person (R30), as
// player.update pushes her: her middle, her head's middle and her body's ends
// outside every one of the person's circles (figure frame), she walking up
// (follow). The distance, in 0.01 m steps from outside.
function bumpStop(r, breed, head = null) {
  const cat = buildCat(breed, head ? { head } : undefined);
  animateCat(cat, 'follow', 1, 1, false);
  const circles = bumpCircles(r.p.look);
  const vol = { head: new THREE.Sphere(), headFlat: 0, body: { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 } };
  const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const clear = (d) => {
    place(r, cat, d);
    catVolumes(cat, vol);
    pts[0].copy(local(r, cat.position)); pts[1].copy(local(r, vol.head.center));
    pts[2].copy(local(r, vol.body.a)); pts[3].copy(local(r, vol.body.b));
    const own = [0.35, vol.headFlat, vol.body.r, vol.body.r];
    return circles.every((c) => pts.every((p, i) => Math.hypot(p.x - c.x, p.z - c.z) >= c.r + own[i]));
  };
  let d = 2;
  while (d > 0.3 && clear(Math.round((d - 0.01) * 100) / 100)) d = Math.round((d - 0.01) * 100) / 100;
  return d;
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

// What she wears on her head (the tallest of the shop and prize hats, and
// the feather plume): her volumes hold, and the touch rests ON the hat, her
// head's top for the touch being the top of what she wears (fix round 1).
const HATS = ['tophat', 'wizard', 'candlehat', 'featherplume'];
describe('her head in a hat', () => {
  it('catVolumes and headTopOffset work for every tall hat on a tabby and a siamese: the head\'s top is the hat\'s', () => {
    for (const breed of ['tabby', 'siamese']) {
      const bare = buildCat(breed);
      animateCat(bare, 'requestPet', 1, 0, false);
      const bareTop = headTopOf(bare, new THREE.Vector3()).y;
      for (const head of HATS) {
        const cat = buildCat(breed, { head });
        animateCat(cat, 'requestPet', 1, 0, false);
        const v = catVolumes(cat);
        const top = headTopOf(cat, new THREE.Vector3()).y;
        expect(top, `${breed} ${head}`).toBeGreaterThan(bareTop + 0.01);
        // the top is the hat's own highest point
        let hatTop = -Infinity;
        cat.updateMatrixWorld(true);
        cat.userData.parts.head.traverse((o) => {
          if (!o.userData.hat) return;
          const pos = o.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) hatTop = Math.max(hatTop, new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y);
        });
        // (headTopOffset reads the top in the head's own frame, straight up:
        // within a few centimetres of the world's top when the head and a
        // slanting plume tip)
        expect(Math.abs(top - Math.max(hatTop, bareTop)), `${breed} ${head}`).toBeLessThan(0.03);
        expect(Math.abs(v.head.center.y + v.head.radius - top), `${breed} ${head}`).toBeLessThan(1e-6);
        // the ears still have their capsules
        expect(v.earN, `${breed} ${head}`).toBe(catVolumes(bare).earN);
        for (let i = 0; i < v.earN; i++) expect(v.ears[i].a.distanceTo(v.ears[i].b), `${breed} ${head} ear ${i}`).toBeGreaterThan(0.01);
      }
    }
  });

  it('the touch rests on the hat\'s top and never goes through her: every tall hat, a tabby and a siamese, a man and a woman, from where the bump stops her', () => {
    for (const [who, over] of [['man', { sex: 'm' }], ['woman', { sex: 'f' }]]) {
      for (const breed of ['tabby', 'siamese']) {
        for (const head of HATS) {
          const cat = buildCat(breed, { head });
          animateCat(cat, 'requestPet', 1, 0, false);
          const r = rig('adult', over);
          place(r, cat, bumpStop(r, breed, head));
          const at = `${who} ${breed} ${head}`;
          let state;
          // (5 s: the time from the word to kneel is the walked test's, in
          // test/bumps.test.js; here she stands exactly head-on, a little
          // further out than a walk leaves her)
          for (let i = 0; i < 300; i++) {
            state = frame(r, cat);
            expect(worstClearance(r.p, r.vol), `${at} frame ${i}`).toBeGreaterThan(0.005);
            expect(worstEar(r.p, r.vol), `${at} frame ${i}`).toBeGreaterThan(0);
          }
          expect(state, at).toBe('resting');
          const want = headTopOf(cat, new THREE.Vector3()).addScaledVector(UP, REACH.CLEAR);
          expect(palmPoint(r.p, new THREE.Vector3()).distanceTo(want), at).toBeLessThanOrEqual(0.02 + 1e-6);
        }
      }
    }
  }, 90000);
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
  it('touches every preset cat standing about 0.65 m in front: a 1.61 m adult (the Maine Coon a 1.70 m one, R14)', () => {
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
        // (on her head, the stroke's own size at most: 0.02 m)
        expect(palmPoint(r.p, new THREE.Vector3()).distanceTo(want), breed).toBeLessThanOrEqual(0.02 + 1e-6);
      }
      expect(state, breed).toBe('resting');
    }
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

  // Task 8a (the owner, 2026-11-21): the kneel takes 0.7 s now, and the hand
  // still rests on her head soon after the word to kneel, counted from the
  // frame the person is told to kneel (a fresh scratch then, R18), she
  // standing still in front. Since R30 she stands where the soft bump stops
  // her (bumpStop) and 0.03 m further out, and the touch takes about
  // 2 s: 2.4 s at the latest (R29; 2.2 s no longer holds there). WORST_TOUCH
  // pins the slowest it measures (s). Held out (R30, the fix 1c report): a
  // siamese exactly head-on to an older person (the bump stops her at
  // 0.84 m, the bow's hand reaches her only to about 0.82 m; walked up, she
  // slides a little round the circle and is touched, test/bumps.test.js).
  const TOUCH_BY = 2.4;
  const HELD_OUT = ['older siamese'];
  const WORST_TOUCH = 2.35;
  it('touch within 2.4 s of the word to kneel: men, women, older people, a tabby and a siamese, from where the bump stops her', () => {
    let worst = 0;
    let worstAt = '';
    for (const [who, kind, over] of [['man', 'adult', { sex: 'm' }], ['woman', 'adult', { sex: 'f' }], ['older', 'older', {}]]) {
      for (const breed of ['tabby', 'siamese']) {
        const cat = buildCat(breed);
        animateCat(cat, 'requestPet', 1, 0, false);
        const stop = bumpStop(rig(kind, over), breed);
        for (const d of [stop, stop + 0.03]) {
          const r = rig(kind, over);
          place(r, cat, d);
          const at = `${who} ${breed} ${d.toFixed(2)} m`;
          // standing a second, looking at her
          for (let i = 0; i < 60; i++) {
            r.t += DT;
            pose(r.p, { mode: 'stand', t: r.t });
            applyPose(r.p, DT);
            stepGaze(r.p, r.gaze, DT, r.t, { target: headTopOf(cat) });
          }
          // told to kneel: a fresh scratch from this frame
          r.sc = createScratch();
          let when = Infinity;
          const want = new THREE.Vector3();
          const palm = new THREE.Vector3();
          const last = palmPoint(r.p, new THREE.Vector3());
          for (let i = 1; i <= Math.ceil(TOUCH_BY * 60) + 6 && when === Infinity; i++) {
            const s = frame(r, cat);
            // never through her, and never a jump (R13), all the way down too
            expect(worstClearance(r.p, r.vol), `${at} frame ${i}`).toBeGreaterThan(0.005);
            expect(worstEar(r.p, r.vol), `${at} frame ${i}`).toBeGreaterThan(0);
            palmPoint(r.p, palm);
            expect(palm.distanceTo(last), `${at} frame ${i}: a step`).toBeLessThanOrEqual(STEP_MAX);
            last.copy(palm);
            want.copy(headTopOf(cat)).addScaledVector(UP, REACH.CLEAR);
            if (s === 'resting' && palm.distanceTo(want) < 0.02) when = i * DT;
          }
          if (HELD_OUT.includes(`${who} ${breed}`)) { expect(when, at).toBe(Infinity); continue; }
          if (when > worst) { worst = when; worstAt = at; }
        }
      }
    }
    expect(worst, worstAt).toBeLessThanOrEqual(TOUCH_BY);
    expect(worst, worstAt).toBeLessThanOrEqual(WORST_TOUCH);
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
    // (resting within R15's 2.5 s; the hand first turns palm down from the pose's)
    for (let i = 0; i < REACH_FRAMES; i++) s = frame(r2, null, { headTop: below });
    expect(s).toBe('resting');
  });

  // The scan (fix round 2): head-on, sitting up (requestPet) and still, after
  // he has knelt for 1 s, every adult height and every cat but the Maine Coon
  // (R14), at every 0.05 m from the nearest place she can stand to 1.0 m:
  // resting within 2.5 s (R15).
  it('touches in every cell of the scan: 1.61-1.90 m adults, four cats, head-on up to 1.0 m', () => {
    const missed = [];
    const cells = [];
    const far = [];
    const farFrom = {};
    for (const breed of ['tabby', 'siamese', 'persian', 'hagrid']) {
      const cat = buildCat(breed);
      animateCat(cat, 'requestPet', 1, 0, false);
      for (const tall of [1.61, 1.7, 1.8, 1.9]) {
        const first = standOff(rig('adult', { height: tall }), cat, 0.65);
        for (let d = first; d <= 1.0 + 1e-9; d = Math.round((d + 0.05) * 100) / 100) {
          const r = rig('adult', { height: tall });
          for (let i = 0; i < 60; i++) frame(r, null, { headTop: null });
          place(r, cat, d);
          // (she appears in front of him at once, maybe over his held-out
          // hand: clearance is the sweep's to pin, not this scan's)
          let rested = false;
          let inReach = false;
          for (let i = 0; i < REACH_FRAMES && !rested; i++) {
            rested = frame(r, cat) === 'resting';
            inReach ||= r.sc.inReach;
          }
          cells.push(`${breed} ${tall} ${d}`);
          // past the arm's reach (with the chest's lean) the hand is held out:
          // those cells are listed, and must be the far end of their row
          if (!inReach) { far.push(`${breed} ${tall} m at ${d} m`); farFrom[`${breed} ${tall}`] ??= d; continue; }
          if (farFrom[`${breed} ${tall}`] !== undefined) missed.push(`${breed} ${tall} m at ${d} m: in reach past a cell out of it`);
          if (!rested) missed.push(`${breed} ${tall} m at ${d} m (${r.sc.state}${r.sc.blocked ? ', blocked' : ''})`);
        }
      }
    }
    expect(missed, `${cells.length} cells`).toEqual([]);
    // out of reach (the arm and the chest's lean too short): the Hagrid's far
    // cells only, the shorter the adult the nearer
    expect(far).toEqual([
      'hagrid 1.61 m at 0.9 m', 'hagrid 1.61 m at 0.95 m', 'hagrid 1.61 m at 1 m',
      'hagrid 1.7 m at 0.95 m', 'hagrid 1.7 m at 1 m',
      'hagrid 1.8 m at 1 m',
    ]);
  }, 120000);

  it('no way in (a Maine Coon 1 m in front of a 1.61 m adult): the hand goes back to held out, not parked at the chest', () => {
    const r = rig('adult', { height: 1.61 });
    const cat = buildCat('mainecoon');
    animateCat(cat, 'follow', 1, 0, false);
    place(r, cat, 1.0);
    for (let i = 0; i < 180; i++) {
      expect(frame(r, cat)).toBe('held');
      expect(worstClearance(r.p, r.vol), `frame ${i}`).toBeGreaterThan(0.005);
    }
    expect(r.sc.blocked).toBe(true); // no way in: tried again every 0.25 s (PLAN_RETRY), none found
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

  // what follows the turn to his right over 4 s, she still: for the kneeling
  // adult her head is still in reach, so once held out the hand comes back
  // to her by a new way in; for the bowing older man it is out of his reach
  const RIGHT_AFTER = {
    'tabby adult': ['withdrawing', 'held', 'reaching', 'resting'],
    'tabby older': ['withdrawing', 'held'],
    'siamese adult': ['withdrawing', 'held', 'reaching', 'resting'],
    'siamese older': ['withdrawing', 'held'],
  };
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
          for (let i = 0; i < 240; i++) {
            const s = frame(r, cat);
            if (seen[seen.length - 1] !== s) seen.push(s);
            expect(worstClearance(r.p, r.vol), `${breed} ${kind} frame ${i}`).toBeGreaterThan(0.005);
            expect(worstEar(r.p, r.vol), `${breed} ${kind} frame ${i}`).toBeGreaterThan(0);
            const palm = palmPoint(r.p, new THREE.Vector3());
            expect(palm.distanceTo(last), `${breed} ${kind} frame ${i}: a step`).toBeLessThanOrEqual(STEP_MAX);
            last.copy(palm);
          }
          // her head whipped round (faster than a hand may follow): let go,
          // withdrawn, held out; and out of reach (left, 0.5 m away) it stays
          // held out for the rest of the 4 s. Turned to his right: RIGHT_AFTER.
          const want = /right/.test(what) ? RIGHT_AFTER[`${breed} ${kind}`] : ['withdrawing', 'held'];
          expect(seen, `${breed} ${kind}`).toEqual(want);
          // held out at the end only because she is out of reach
          expect(r.sc.inReach, `${breed} ${kind}`).toBe(seen[seen.length - 1] === 'resting');
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

// Finding 1 (final review): the hand-offs between the pose and the scratch.
// Standing, then kneeling (an older person bows) with the scratch from its
// first frame, then standing again without it. Up to the stand the palm
// never steps further than R13 allows in a frame; standing up, the body
// rises over POSE_TIMES.KNEEL (0.7 s, Task 8a), and the arm comes from where
// the scratch left it: no jump at the hand-off, and the palm's own way (in
// the chest's frame, and in the world) within R13 all along.
describe('the hand-offs between the pose and the scratch', () => {
  const palmInChest = (p, out) => {
    const c = p.bones.chest;
    c.updateWorldMatrix(true, false);
    palmPoint(p, out).sub(c.getWorldPosition(new THREE.Vector3()));
    return out.applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()).invert());
  };
  for (const kind of ['adult', 'older']) {
    for (const [what, dist] of [['in reach', 0.65], ['out of reach', 1.5]]) {
      it(`${kind}, the cat ${what}: stand 1 s, kneel with the scratch 3 s, stand 2 s: no jump, the hand within R13`, () => {
        const r = rig(kind);
        const cat = buildCat('tabby');
        animateCat(cat, 'requestPet', 1, 0, false);
        place(r, cat, dist);
        const palm = new THREE.Vector3(), last = new THREE.Vector3();
        const rel = new THREE.Vector3(), lastRel = new THREE.Vector3();
        const worst = { up: 0, upAt: -1, rel: 0, relAt: -1, first: 0, world: 0 };
        const seen = new Set();
        const step = (mode, scratch, i) => {
          r.t += DT;
          pose(r.p, { mode, t: r.t });
          applyPose(r.p, DT);
          const top = headTopOf(cat);
          stepGaze(r.p, r.gaze, DT, r.t, { target: top });
          if (scratch) seen.add(stepScratch(r.p, r.sc, DT, { headTop: top, volumes: (r.vol = catVolumes(cat, r.vol)) }));
          palmPoint(r.p, palm);
          palmInChest(r.p, rel);
          const d = palm.distanceTo(last), dr = rel.distanceTo(lastRel);
          if (i > 0 && i < 240 && d > worst.up) { worst.up = d; worst.upAt = i; }
          if (i === 240) worst.first = d;
          if (i >= 240) { worst.world = Math.max(worst.world, d); if (dr > worst.rel) { worst.rel = dr; worst.relAt = i; } }
          last.copy(palm); lastRel.copy(rel);
        };
        let n = 0;
        for (let i = 0; i < 60; i++) step('stand', false, n++);
        for (let i = 0; i < 180; i++) step('kneel', true, n++);
        for (let i = 0; i < 120; i++) step('stand', false, n++);
        // the pose's own stand-up from its own kneel (no scratch): the body's share
        const b = rig(kind);
        let plain = 0;
        for (let i = 0; i < 240; i++) {
          b.t += DT;
          pose(b.p, { mode: i < 120 ? 'kneel' : 'stand', t: b.t });
          applyPose(b.p, DT);
          palmPoint(b.p, palm);
          if (i > 120) plain = Math.max(plain, palm.distanceTo(last));
          last.copy(palm);
        }
        worst.plain = plain;
        const msg = `${kind} ${what}: ${JSON.stringify(worst)}`;
        expect(worst.up, msg).toBeLessThanOrEqual(STEP_MAX);
        expect(worst.first, msg).toBeLessThanOrEqual(STEP_MAX);
        expect(worst.rel, msg).toBeLessThanOrEqual(STEP_MAX);
        // in the world too (R17 allowed the body's own rise on top: with the
        // 0.7 s stand of Task 8a the palm keeps within R13's step all along)
        expect(worst.world, msg).toBeLessThanOrEqual(STEP_MAX);
        // the scratch did its work in between (a touch when in reach)
        expect([...seen], msg).toEqual(dist < 1 ? expect.arrayContaining(['resting']) : ['held']);
      });
    }
  }
});
