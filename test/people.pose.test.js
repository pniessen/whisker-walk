import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildSpot } from '../src/people/figure.js';
import { JOINT_INDEX } from '../src/people/parts.js';
import { spotKind } from '../src/people/look.js';
import { neckFrame } from '../src/people/shapes.js';
import { pose, applyPose, strideFor, POSE_MODES, POSE_TIMES, kneelSpots } from '../src/people/pose.js';
import * as peopleKit from '../src/people/index.js';
import { createGaze, stepGaze, GAZE } from '../src/people/gaze.js';

const material = new THREE.MeshStandardMaterial({ vertexColors: true });
function spotOf(kind) {
  for (let x = 0; x < 400; x++) if (spotKind({ x, z: 7 }) === kind) return { x, z: 7 };
  throw new Error('no spot');
}
// one person of each kind (a child spot is a pair: its second person)
function personOf(kind) {
  const { people } = buildSpot(spotOf(kind), { material });
  const p = kind === 'child' ? people[1] : people[0];
  expect(p.look.kind).toBe(kind);
  p.setDetail('near');
  return p;
}
const KINDS = ['adult', 'child', 'older'];

// ---- what the skinned mesh really shows (independent of pose.js) ----
const V = new THREE.Vector3();
function skinnedVerts(p, joints) {
  const idx = p.mesh.geometry.getAttribute('skinIndex');
  const want = joints ? new Set(joints.map((j) => JOINT_INDEX[j])) : null;
  const out = [];
  for (let i = 0; i < idx.count; i++) if (!want || want.has(idx.getX(i))) out.push(i);
  return out;
}
function refresh(p) {
  p.figure.updateMatrixWorld(true);
  p.skeleton.update();
}
// lowest y of the given vertices, in the figure's frame (the mesh sits at the
// figure's origin, unrotated)
function lowestY(p, verts) {
  let m = Infinity;
  for (const i of verts) m = Math.min(m, p.mesh.getVertexPosition(i, V).y);
  return m;
}
function minZ(p, verts) {
  let m = Infinity;
  for (const i of verts) m = Math.min(m, p.mesh.getVertexPosition(i, V).z);
  return m;
}
const world = (bone) => bone.getWorldPosition(new THREE.Vector3());
const axisWorld = (bone, x, y, z) => new THREE.Vector3(x, y, z).transformDirection(bone.matrixWorld);

function poseAt(p, spec, frames = 1, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) { pose(p, spec); applyPose(p, dt); }
  refresh(p);
}

describe('people poses', () => {
  afterEach(() => vi.restoreAllMocks());

  it('feet on the ground: every mode, every kind, 20 times', () => {
    for (const kind of KINDS) {
      const p = personOf(kind);
      const all = skinnedVerts(p);
      for (const mode of POSE_MODES) {
        for (let i = 0; i < 20; i++) {
          const t = i * 0.37;
          pose(p, { mode, t, walked: t * 1.1 });
          applyPose(p, 1, 0); // no blend: the pose itself
          refresh(p);
          const low = lowestY(p, all);
          expect(Math.abs(low), `${kind} ${mode} t=${t}`).toBeLessThan(0.002);
        }
      }
    }
  });

  it('no skating: the planted foot stays put while it is the lower one', () => {
    // The feet roll heel to toe, so a planted foot pivots on its heel, rests
    // flat, then pivots on its toe: what touches the ground must not slide,
    // and while the sole is flat the whole foot (its ankle) stays put.
    const W = new THREE.Vector3();
    for (const kind of KINDS) {
      const p = personOf(kind);
      const scene = new THREE.Group();
      scene.add(p.figure);
      const feet = { footL: skinnedVerts(p, ['footL']), footR: skinnedVerts(p, ['footR']) };
      const lowestOf = (verts) => {
        let best = -1, y = Infinity;
        for (const i of verts) {
          const vy = p.mesh.getVertexPosition(i, V).y;
          if (vy < y) { y = vy; best = i; }
        }
        return { i: best, y };
      };
      // a vertex's world z (the mesh is at the figure's origin)
      const zOf = (i) => p.mesh.getVertexPosition(i, W).applyMatrix4(p.figure.matrixWorld).z;
      let walked = 0;
      let run = null;
      let runs = 0;
      let flatFrames = 0;
      const close = (r) => {
        expect(r.slip, `${kind} ${r.foot} run ${runs} slides`).toBeLessThan(0.02);
        if (r.flatN > 0) expect(r.flatMax - r.flatMin, `${kind} ${r.foot} run ${runs} flat`).toBeLessThan(0.005);
        runs++;
      };
      for (let f = 0; f < 400; f++) {
        walked += 0.01;
        p.figure.position.z -= 0.01; // she walks forward (-z) as far as she strides
        pose(p, { mode: 'walk', t: f / 60, walked });
        applyPose(p, 1 / 60);
        refresh(p);
        const l = lowestOf(feet.footL);
        const r = lowestOf(feet.footR);
        expect(Math.abs(Math.min(l.y, r.y))).toBeLessThan(0.002);
        const lower = l.y < r.y ? 'footL' : 'footR';
        const low = lower === 'footL' ? l : r;
        if (!run || run.foot !== lower) {
          if (run) close(run);
          run = { foot: lower, slip: 0, flatN: 0, flatMin: Infinity, flatMax: -Infinity, prev: low.i, prevZ: zOf(low.i) };
        } else {
          // the vertex that touched last frame: how far it slid since
          run.slip += Math.abs(zOf(run.prev) - run.prevZ);
          run.prev = low.i;
          run.prevZ = zOf(low.i);
        }
        const bone = p.bones[lower];
        if (Math.abs(axisWorld(bone, 0, 0, 1).y) < 1e-3) { // the sole is flat
          const z = world(bone).z;
          run.flatN++; flatFrames++;
          run.flatMin = Math.min(run.flatMin, z);
          run.flatMax = Math.max(run.flatMax, z);
        }
      }
      expect(runs).toBeGreaterThan(3); // the feet do take turns
      expect(flatFrames).toBeGreaterThan(60); // and rest flat for a good part of each step
    }
  });

  it('strideFor: a cycle is two steps of 0.8 hip heights', () => {
    const p = personOf('adult');
    expect(strideFor(p, p.look.dims.hipY * 1.6)).toBeCloseTo(Math.PI * 2, 9);
    expect(strideFor(p, 0)).toBe(0);
  });

  it('a real wave: the hand above the head, the forearm upright', () => {
    for (const kind of KINDS) {
      const p = personOf(kind);
      const d = p.look.dims;
      const nk = neckFrame(d);
      const top = new THREE.Vector3(0, nk.headCY + d.headYr - nk.topY, nk.headCZ - nk.topZ);
      for (let i = 0; i < 30; i++) {
        poseAt(p, { mode: 'wave', t: i * 0.07 });
        const headTop = top.clone().applyMatrix4(p.bones.head.matrixWorld);
        const hand = world(p.bones.handR);
        expect(hand.y, `${kind} t=${i * 0.07}`).toBeGreaterThan(headTop.y);
        const fore = hand.clone().sub(world(p.bones.forearmR)).normalize();
        expect(fore.angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(0.35);
      }
    }
  });

  it('kneel stays home, the hand held out at most 0.55 m in front', () => {
    for (const kind of ['adult', 'child']) {
      const p = personOf(kind);
      const hand = skinnedVerts(p, ['handR']);
      poseAt(p, { mode: 'kneel', t: 1 });
      const pel = world(p.bones.pelvis);
      expect(Math.abs(pel.x - p.rest.pelvis.x)).toBeLessThan(0.05);
      expect(Math.abs(pel.z - p.rest.pelvis.z)).toBeLessThan(0.05);
      expect(pel.y).toBeLessThan(p.rest.pelvis.y - 0.15); // down for real
      const front = -minZ(p, hand);
      expect(front).toBeLessThanOrEqual(0.55);
      expect(front).toBeGreaterThan(0.2); // held out
      // on the right knee
      expect(world(p.bones.shinR).y).toBeLessThan(0.08);
    }
  });

  it('kneelSpots: where the kneel puts the raised knee (out to the front-left) and the back foot\'s middle', () => {
    for (const over of [{ sex: 'm', height: 1.85, girth: 1.08 }, { sex: 'f', height: 1.6, girth: 0.94 }]) {
      const { people } = buildSpot({ ...spotOf('adult'), ...over }, { material });
      const p = people[0];
      poseAt(p, { mode: 'kneel', t: 1 }, 120);
      const knee = world(p.bones.shinL);
      const foot = p.bones.footR.localToWorld(new THREE.Vector3(0, 0, -0.24 * p.look.dims.footLen));
      const k = kneelSpots(p.look);
      expect(k.kneeX).toBeCloseTo(knee.x, 5);
      expect(k.kneeZ).toBeCloseTo(knee.z, 5);
      expect(k.footX).toBeCloseTo(foot.x, 5);
      expect(k.footZ).toBeCloseTo(foot.z, 5);
      // R29: the knee about 50 degrees round to the left, nothing straight in front
      const round = Math.atan2(-knee.x, -knee.z);
      expect(round).toBeGreaterThan(0.6);
      expect(round).toBeLessThan(1.05);
    }
  });

  it('older people bow, never kneel', () => {
    const p = personOf('older');
    const hand = skinnedVerts(p, ['handR']);
    poseAt(p, { mode: 'kneel', t: 1 });
    expect(world(p.bones.shinR).y).toBeGreaterThan(0.3);
    const up = axisWorld(p.bones.chest, 0, 1, 0);
    const lean = up.angleTo(new THREE.Vector3(0, 1, 0));
    expect(lean).toBeGreaterThan(0.3);
    expect(lean).toBeLessThanOrEqual(0.5);
    expect(up.z).toBeLessThan(0); // forward
    // both feet flat on the ground
    for (const f of ['footL', 'footR']) {
      expect(Math.abs(axisWorld(p.bones[f], 0, 0, 1).y), f).toBeLessThan(0.03);
      expect(lowestY(p, skinnedVerts(p, [f])), f).toBeLessThan(0.002);
    }
    const front = -minZ(p, hand);
    expect(front).toBeGreaterThan(0.2);
    expect(front).toBeLessThanOrEqual(0.55);
    // the same as asking for a bow
    const q = personOf('older');
    poseAt(q, { mode: 'bow', t: 1 });
    expect(q.bones.chest.rotation.x).toBeCloseTo(p.bones.chest.rotation.x, 9);
  });

  it('dismay: both hands up, palms out, the chest back 0.1 rad', () => {
    for (const kind of ['adult', 'child']) {
      const p = personOf(kind);
      poseAt(p, { mode: 'dismay', t: 2 });
      for (const [sd, L] of [[-1, 'L'], [1, 'R']]) {
        expect(world(p.bones[`hand${L}`]).y).toBeGreaterThan(world(p.bones[`upperArm${L}`]).y);
        const palm = axisWorld(p.bones[`hand${L}`], -sd, 0, 0); // the palm faces in at rest
        expect(palm.z, L).toBeLessThan(-0.6); // now out, toward her
      }
      const up = axisWorld(p.bones.chest, 0, 1, 0);
      expect(Math.atan2(up.z, up.y)).toBeGreaterThan(0.06); // back
      expect(Math.atan2(up.z, up.y)).toBeLessThan(0.14);
    }
  });

  // ruling R16: an older person's dismay leans the chest 0.1 rad back from
  // their own stoop, not 0.1 back from upright (that would throw the body
  // back 0.25 rad at once)
  it('dismay, an older person: the chest 0.1 rad back from the stoop, not from upright', () => {
    const p = personOf('older');
    const tilt = () => { const up = axisWorld(p.bones.chest, 0, 1, 0); return Math.atan2(up.z, up.y); };
    poseAt(p, { mode: 'stand', t: 2, reducedMotion: true }, 30);
    const stoop = tilt();
    expect(stoop).toBeLessThan(-0.12); // stooped forward
    poseAt(p, { mode: 'dismay', t: 2, reducedMotion: true }, 30);
    const back = tilt() - stoop;
    expect(back).toBeGreaterThan(0.07);
    expect(back).toBeLessThan(0.14);
    expect(tilt()).toBeLessThan(0); // still a little forward of upright
  });

  it('dismay: the hands stay out at the sides, 0.3 m from the head, whichever way it turns', () => {
    // ruling R8: a surprised "oh!" with the hands up by the shoulders and out
    // to the sides, never over the face, even with the head turned as far
    // round as the gaze takes it, toward her on either side
    for (const kind of KINDS) {
      const p = personOf(kind);
      const d = p.look.dims;
      const nk = neckFrame(d);
      const centre = new THREE.Vector3(0, nk.headCY - nk.topY, nk.headCZ - nk.topZ); // in the head's frame
      const hands = { L: skinnedVerts(p, ['handL']), R: skinnedVerts(p, ['handR']) };
      for (const side of [-1, 1]) {
        const a = side * GAZE.LOOK_MAX; // + is the figure's left
        // her head on the ground ahead and to that side, near enough to be looked at
        const target = new THREE.Vector3(-Math.sin(a) * 1.5, 0.25, -Math.cos(a) * 1.5);
        const gaze = createGaze(p.look);
        for (let f = 0; f < 150; f++) {
          pose(p, { mode: 'dismay', t: 2 + f / 60 });
          applyPose(p, 1 / 60);
          stepGaze(p, gaze, 1 / 60, 2 + f / 60, { target });
        }
        refresh(p);
        expect(Math.abs(gaze.yaw), `${kind} turned`).toBeGreaterThan(GAZE.LOOK_MAX - 0.1);
        const head = centre.clone().applyMatrix4(p.bones.head.matrixWorld);
        for (const L of ['L', 'R']) {
          const c = new THREE.Vector3();
          for (const i of hands[L]) c.add(p.mesh.getVertexPosition(i, V));
          c.divideScalar(hands[L].length);
          expect(c.distanceTo(head), `${kind} hand${L}, head turned ${side > 0 ? 'left' : 'right'}`).toBeGreaterThanOrEqual(0.3);
          // up about the shoulders, and out to the side of them
          const sh = world(p.bones[`upperArm${L}`]);
          expect(Math.abs(c.y - sh.y), `${kind} hand${L} height`).toBeLessThan(0.15 * d.s + 0.05);
          expect(Math.abs(c.x), `${kind} hand${L} out`).toBeGreaterThan(Math.abs(sh.x));
        }
      }
    }
  });

  it('eases: wave to stand blends over 0.3 s; the first frame snaps', () => {
    const p = personOf('adult');
    const spec = { t: 1, reducedMotion: true };
    pose(p, { ...spec, mode: 'wave' });
    applyPose(p, 1 / 60);
    const wave = p.bones.upperArmR.rotation.z;
    expect(wave).toBe(p.target.rot[JOINT_INDEX.upperArmR * 3 + 2]); // snapped on its first frame
    for (let i = 0; i < 10; i++) { pose(p, { ...spec, mode: 'wave' }); applyPose(p, 1 / 60); }
    pose(p, { ...spec, mode: 'stand' });
    const stand = p.target.rot[JOINT_INDEX.upperArmR * 3 + 2];
    for (let i = 0; i < 9; i++) { pose(p, { ...spec, mode: 'stand' }); applyPose(p, 1 / 60); } // 0.15 s
    const mid = p.bones.upperArmR.rotation.z;
    expect(mid).toBeGreaterThan(stand + 0.3);
    expect(mid).toBeLessThan(wave - 0.3);
    for (let i = 0; i < 12; i++) { pose(p, { ...spec, mode: 'stand' }); applyPose(p, 1 / 60); } // past 0.3 s
    expect(p.bones.upperArmR.rotation.z).toBeCloseTo(stand, 6);
  });

  // Task 8a (the owner, 2026-11-21): kneeling and standing up take about
  // 0.7 s (POSE_TIMES.KNEEL), whatever ease the caller passes, so the kneel
  // is gentle; an older person's bow too.
  it('POSE_TIMES: the kneel takes 0.7 s, frozen, from the kit too', () => {
    expect(POSE_TIMES).toEqual({ KNEEL: 0.7 });
    expect(Object.isFrozen(POSE_TIMES)).toBe(true);
    expect(peopleKit.POSE_TIMES).toBe(POSE_TIMES);
  });

  it('kneels gently: down and up over 0.7 s (an older person bows as gently)', () => {
    const spec = (mode) => ({ mode, t: 1, reducedMotion: true });
    const chestLean = (p) => axisWorld(p.bones.chest, 0, 1, 0).angleTo(new THREE.Vector3(0, 1, 0));
    const pelvisY = (p) => world(p.bones.pelvis).y;
    for (const [kind, measure] of [['adult', pelvisY], ['older', chestLean]]) {
      // where each pose settles (posed alone, no blend)
      const settled = (mode) => { const q = personOf(kind); poseAt(q, spec(mode)); return measure(q); };
      const at = { stand: settled('stand'), kneel: settled('kneel') };
      expect(Math.abs(at.kneel - at.stand), kind).toBeGreaterThan(kind === 'adult' ? 0.15 : 0.2);
      const p = personOf(kind);
      poseAt(p, spec('stand'), 30);
      for (const [from, to] of [['stand', 'kneel'], ['kneel', 'stand']]) {
        const way = at[to] - at[from];
        poseAt(p, spec(to), 21); // 0.35 s
        const half = (measure(p) - at[from]) / way;
        expect(half, `${kind} ${from} -> ${to} at 0.35 s`).toBeGreaterThan(0.3);
        expect(half, `${kind} ${from} -> ${to} at 0.35 s`).toBeLessThan(0.7);
        poseAt(p, spec(to), 21 + 2); // 0.7 s and two frames
        expect(Math.abs(measure(p) - at[to]), `${kind} ${from} -> ${to} by 0.7 s`).toBeLessThan(0.005);
      }
    }
    // whatever ease the caller passes (0 alone snaps: no blend at all)
    const down = personOf('adult');
    poseAt(down, spec('kneel'));
    const q = personOf('adult');
    poseAt(q, spec('stand'), 30);
    const y0 = pelvisY(q);
    for (let i = 0; i < 21; i++) { pose(q, spec('kneel')); applyPose(q, 1 / 60, 0.1); }
    refresh(q);
    const half = (y0 - pelvisY(q)) / (y0 - pelvisY(down));
    expect(half, 'ease 0.1').toBeGreaterThan(0.3);
    expect(half, 'ease 0.1').toBeLessThan(0.7);
  });

  it('other changes keep their ease: wave to stand still blends over 0.3 s', () => {
    const p = personOf('adult');
    const spec = (mode) => ({ mode, t: 1, reducedMotion: true });
    poseAt(p, spec('wave'), 30);
    const wave = p.bones.upperArmR.rotation.z;
    pose(p, spec('stand'));
    const stand = p.target.rot[JOINT_INDEX.upperArmR * 3 + 2];
    poseAt(p, spec('stand'), 9); // 0.15 s: half way
    const half = (p.bones.upperArmR.rotation.z - wave) / (stand - wave);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    poseAt(p, spec('stand'), 10); // 0.316 s
    expect(p.bones.upperArmR.rotation.z).toBeCloseTo(stand, 6);
  });

  it('reduced motion stills the standing and the wave', () => {
    for (const mode of ['stand', 'wave']) {
      const p = personOf('child');
      poseAt(p, { mode, t: 0, reducedMotion: true });
      const a = p.bones.pelvis.position.clone();
      const arm = p.bones.forearmR.rotation.z;
      poseAt(p, { mode, t: 5, reducedMotion: true });
      expect(p.bones.pelvis.position.distanceTo(a)).toBeLessThan(1e-9);
      expect(p.bones.forearmR.rotation.z).toBe(arm);
      // and without it, they do move
      poseAt(p, { mode, t: 0 });
      const b = p.bones.pelvis.position.clone();
      poseAt(p, { mode, t: 5 });
      expect(p.bones.pelvis.position.distanceTo(b)).toBeGreaterThan(1e-4);
    }
  });

  it('allocates nothing: no clone over 100 frames of every mode', () => {
    const people = KINDS.map(personOf);
    for (const p of people) poseAt(p, { mode: 'stand', t: 0 }); // the blend state exists
    const spies = [
      vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Matrix4.prototype, 'clone'),
      vi.spyOn(THREE.Quaternion.prototype, 'clone'),
    ];
    const spec = { mode: 'stand', t: 0, walked: 0, reducedMotion: false };
    for (const mode of POSE_MODES) {
      for (let f = 0; f < 100; f++) {
        spec.mode = mode; spec.t = f / 60; spec.walked = f * 0.01;
        for (const p of people) { pose(p, spec); applyPose(p, 1 / 60); }
      }
    }
    for (const s of spies) expect(s).toHaveBeenCalledTimes(0);
  });
});
