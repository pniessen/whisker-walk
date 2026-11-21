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

function spotOf(kind) {
  for (let x = 0; x < 400; x++) {
    const def = { x, z: 7 };
    if (spotKind(def) === kind) return def;
  }
  throw new Error('no spot');
}

// A person in a group moved and turned in the world, so everything has to
// work in the figure's own frame.
function rig(kind = 'adult') {
  const { people } = buildSpot(spotOf(kind), { material });
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
    for (let k = 0; k <= n; k++) each(P.lerpVectors(A, Bv, k / n), radii[i][0] + (radii[i][1] - radii[i][0]) * (k / n));
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
function clearance(point, vol) {
  const head = point.distanceTo(vol.head.center) - vol.head.radius;
  Q.copy(point);
  const body = segPointDist(vol.body.a, vol.body.b, Q) - vol.body.r;
  return Math.min(head, body);
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
    expect(REACH).toEqual({ LEAN_MAX: 0.5, APPROACH: 0.7, ABOVE: 0.12, CLEAR: 0.01, STROKE: 0.02, STROKE_HZ: 1.5, WITHDRAW: 0.4, HELD_MAX: 0.55, HOLD_R: 2.5, MIN_TIME: 2.5, STAND_DELAY: 0.6 });
    expect(Object.isFrozen(REACH)).toBe(true);
    for (const k of ['REACH', 'headTopOffset', 'catVolumes', 'createScratch', 'stepScratch']) expect(kit[k]).toBeDefined();
  });

  it('touches when in reach: resting within 1 s, the palm CLEAR above her head', () => {
    for (const kind of ['adult', 'older']) {
      const r = rig(kind);
      const cat = buildCat('tabby');
      animateCat(cat, 'requestPet', 1, 0, false);
      place(r, cat, 0.65);
      let state;
      for (let i = 0; i < 60; i++) state = frame(r, cat);
      expect(state, kind).toBe('resting');
      const want = headTopOf(cat, new THREE.Vector3()).addScaledVector(UP, REACH.CLEAR);
      expect(palmPoint(r.p, new THREE.Vector3()).distanceTo(want), kind).toBeLessThan(0.02);
    }
  });

  it('the palm faces down and the hand comes from in front and above', () => {
    const r = rig('adult');
    const cat = buildCat('tabby');
    animateCat(cat, 'requestPet', 1, 0, false);
    place(r, cat, 0.75);
    const top = headTopOf(cat, new THREE.Vector3());
    const n = new THREE.Vector3();
    let wentAbove = false;
    for (let i = 0; i < 60; i++) {
      frame(r, cat);
      const palm = palmPoint(r.p, new THREE.Vector3());
      const flat = Math.hypot(palm.x - top.x, palm.z - top.z);
      // over her head (within 0.1 m of it on the ground), the hand is never lower than its rest
      if (flat < 0.1) expect(palm.y).toBeGreaterThan(top.y + REACH.CLEAR - 1e-6);
      if (flat < 0.03 && palm.y > top.y + REACH.ABOVE - 0.01) wentAbove = true;
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
    for (let i = 0; i < 90; i++) frame(r, cat);
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
    for (let i = 0; i < 60; i++) frame(r, cat);
    const want = headTopOf(cat, new THREE.Vector3()).addScaledVector(UP, REACH.CLEAR);
    let most = 0;
    for (let i = 0; i < 120; i++) {
      frame(r, cat);
      most = Math.max(most, palmPoint(r.p, new THREE.Vector3()).distanceTo(want));
      expect(worstClearance(r.p, r.vol)).toBeGreaterThan(0.005);
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

  it('perched above (her head 1.3 m up, 0.7 m away): held, never reaching up', () => {
    // (a kneeling adult; an older person's bow keeps the shoulder at about
    // 1.35 m, so for them her head has to be higher than that)
    const r = rig('adult');
    const top = r.p.figure.localToWorld(new THREE.Vector3(0, 1.3, -0.7));
    for (let i = 0; i < 120; i++) expect(frame(r, null, { headTop: top })).toBe('held');
    const o = rig('older');
    o.p.figure.updateMatrixWorld(true);
    const high = o.p.figure.localToWorld(new THREE.Vector3(0, 1.5, -0.6));
    for (let i = 0; i < 120; i++) expect(frame(o, null, { headTop: high }), 'older').toBe('held');
  });

  it('her head just above the shoulder is perched; just below it is touched', () => {
    const r = rig('adult');
    pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT, 0);
    const sh = r.p.figure.worldToLocal(r.p.bones.upperArmR.getWorldPosition(new THREE.Vector3()));
    const above = r.p.figure.localToWorld(new THREE.Vector3(0.05, sh.y + 0.01, -0.5));
    for (let i = 0; i < 90; i++) expect(frame(r, null, { headTop: above })).toBe('held');
    const r2 = rig('adult');
    const below = r2.p.figure.localToWorld(new THREE.Vector3(0.05, sh.y - 0.05, -0.5));
    let s;
    for (let i = 0; i < 90; i++) s = frame(r2, null, { headTop: below });
    expect(s).toBe('resting');
  });

  it('with no cat (headTop null) the hand is held out ahead', () => {
    const r = rig('adult');
    for (let i = 0; i < 30; i++) expect(frame(r, null, { headTop: null })).toBe('held');
    const l = local(r, palmPoint(r.p, new THREE.Vector3()));
    expect(-l.z).toBeGreaterThan(0.2);
    expect(Math.abs(l.x)).toBeLessThan(0.25);
  });

  for (const [what, move] of [
    // (to the person's left: her head goes out of the right hand's reach; turned
    // the other way it stays in reach, and the hand stays on it)
    ['she turns 90 degrees in one frame', (r, cat) => { cat.rotation.y -= Math.PI / 2; }],
    ['she moves her head 0.5 m away in one frame', (r, cat) => { cat.position.add(new THREE.Vector3(0, 0, -0.5).applyAxisAngle(UP, r.group.rotation.y)); }],
  ]) {
    it(`${what} mid-touch: it withdraws, then holds out, never through her`, () => {
      for (const breed of ['tabby', 'siamese']) {
        for (const kind of ['adult', 'older']) {
          const r = rig(kind);
          const cat = buildCat(breed);
          animateCat(cat, 'requestPet', 1, 0, false);
          place(r, cat, 0.65);
          for (let i = 0; i < 90; i++) frame(r, cat);
          expect(r.sc.state, `${breed} ${kind}`).toBe('resting');
          move(r, cat);
          cat.updateMatrixWorld(true);
          const seen = [];
          for (let i = 0; i < 90; i++) {
            const s = frame(r, cat);
            if (seen[seen.length - 1] !== s) seen.push(s);
            expect(worstClearance(r.p, r.vol), `${breed} ${kind} frame ${i}`).toBeGreaterThan(0.005);
          }
          expect(seen, `${breed} ${kind}`).toEqual(['withdrawing', 'held']);
        }
      }
    });
  }

  it('never through her: every cat, a grid of places and headings, an adult and an older person', () => {
    const vol = { head: new THREE.Sphere(), body: { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 } };
    let worst = Infinity;
    let worstAt = '';
    let surface = Infinity;
    let surfaceAt = '';
    let touched = 0;
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
              // she inside the person (her head in the shoulder, or her head
              // or body in the chest): no arm can be clear of her there, and
              // she cannot be there (the person's soft bump and body)
              pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT, 0);
              const dm = r.p.look.dims;
              const sh = r.p.bones.upperArmR.getWorldPosition(new THREE.Vector3());
              const pel = r.p.bones.pelvis.getWorldPosition(new THREE.Vector3());
              const nk = r.p.bones.neck.getWorldPosition(new THREE.Vector3());
              const inChest = segPointDist(pel, nk, vol.head.center) < vol.head.radius + dm.chestR * dm.torsoZ
                || segSeg(pel, nk, vol.body.a, vol.body.b) < vol.body.r + dm.chestR * dm.torsoZ;
              if (inChest || clearance(sh, vol) < dm.uaR[0]) { skipped++; continue; }
              configs++;
              r.vol = vol;
              let rested = false;
              for (let i = 0; i < 180; i++) {
                const s = frame(r, cat);
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
    console.info(`never through her: ${configs} places (${skipped} skipped: she inside the person), ${touched} touched; worst clearance ${worst.toFixed(4)} m at ${worstAt}; worst surface ${surface.toFixed(4)} m at ${surfaceAt}`);
    expect(worst, worstAt).toBeGreaterThan(0.005); // the arm's middle line, as the spec words it
    expect(surface, surfaceAt).toBeGreaterThan(0); // and its skin
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
    for (let i = 0; i < 80; i++) { pose(r.p, { mode: 'kneel', t: 0 }); applyPose(r.p, DT); stepScratch(r.p, r.sc, DT, { headTop: top, volumes: vol }); }
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
