import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';
import { createCritters, villagerPos, questMarkerY } from '../src/critters.js';
import { createPeopleKit, pose, applyPose, spotKind, GAZE, REACH, headTopOffset, catVolumes } from '../src/people/index.js';
import { palmPoint } from '../src/people/reach.js';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { redressCat } from '../src/cat/redress.js';
import { createPlayer } from '../src/player.js';

vi.stubGlobal('document', canvasStub); // (the player listens on it)

// Villagers in town with the people switch on: createCritters is handed the
// kit factory (opts.people), as walk.js does from a place's pack.
const scene = { add() {}, remove() {} };
const DT = 1 / 60;

function spotOf(kind, z = 6) {
  for (let x = 0; x < 400; x++) if (spotKind({ x, z }) === kind) return { x, z };
  throw new Error('no spot');
}
const ADULT = spotOf('adult');
const CHILD = spotOf('child');

function countDraws(fn) {
  const real = Math.random;
  let n = 0;
  Math.random = () => { n++; return real(); };
  try { fn(); } finally { Math.random = real; }
  return n;
}

// A camera a few metres behind and above (x, z), looking at it.
function cameraAt(x, z) {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  cam.position.set(x, 2.5, z + 7);
  cam.lookAt(x, 1, z);
  cam.updateMatrixWorld(true);
  return cam;
}

// Her cat, as far as the villagers see her: a group with a head part.
function herCat(x, z, headY = 0.3) {
  const cat = new THREE.Group();
  cat.position.set(x, 0, z);
  const head = new THREE.Object3D();
  head.position.set(0, headY, -0.2);
  cat.add(head);
  cat.userData.parts = { head };
  cat.updateMatrixWorld(true);
  return cat;
}

function town(defs, extra = {}) {
  const d0 = defs[0];
  return createCritters(scene, defs, { people: createPeopleKit, camera: cameraAt(d0.x, d0.z), ...extra });
}

const run = (crit, frames, cat, t0 = 0) => {
  let t = t0;
  for (let i = 0; i < frames; i++) {
    t += DT;
    cat.updateMatrixWorld(true);
    crit.update(DT, t, cat.position, cat.position, cat);
  }
  return t;
};

const worldOf = (o) => o.getWorldPosition(new THREE.Vector3());
const AWAY = (c) => herCat(c.def.x + 30, c.def.z + 30);

describe('villagers in town (people switch on)', () => {
  it('41 draws, switch on: a single and a pair spot cost what the old figure did', () => {
    expect(countDraws(() => createCritters(scene, [{ type: 'villager', ...ADULT }], { people: createPeopleKit }))).toBe(41);
    expect(countDraws(() => createCritters(scene, [{ type: 'villager', ...CHILD }], { people: createPeopleKit }))).toBe(41);
    expect(countDraws(() => createCritters(scene, [{ type: 'villager', ...ADULT, standOff: { x: 1, z: -1 } }], { people: createPeopleKit }))).toBe(41);
  });

  it('a single spot is one person, a child spot is a pair: the adult first, the figure is the adult', () => {
    const one = town([{ type: 'villager', ...ADULT }]).list[0];
    expect(one.people).toHaveLength(1);
    expect(one.figure).toBe(one.people[0].figure);
    expect(one.group.children).toEqual([one.people[0].figure]);
    const pair = town([{ type: 'villager', ...CHILD }]).list[0];
    expect(pair.people).toHaveLength(2);
    expect(pair.people[0].look.kind).not.toBe('child');
    expect(pair.people[1].look.kind).toBe('child');
    expect(pair.figure).toBe(pair.people[0].figure);
    expect(pair.group.children).toEqual([pair.people[0].figure, pair.people[1].figure]);
  });

  it('quest giver is the adult: ranges and the marker are the adult\'s', () => {
    const crit = town([{ type: 'villager', ...CHILD, standOff: { x: 1.2, z: -0.8 } }]);
    const c = crit.list[0];
    const adult = c.people[0];
    expect(c.figure).toBe(adult.figure);
    const at = villagerPos(c, new THREE.Vector3());
    expect(at.x).toBeCloseTo(CHILD.x + 1.2, 9);
    expect(at.z).toBeCloseTo(CHILD.z - 0.8, 9);
    expect(questMarkerY(c)).toBeCloseTo(adult.look.height + 0.35, 9);
    // the switch off: today's figure, today's 2.1 m
    const old = createCritters(scene, [{ type: 'villager', ...CHILD }]).list[0];
    expect(old.people).toBeUndefined();
    expect(questMarkerY(old)).toBe(2.1);
    // dismay is measured from the adult, not the child
    crit.dismayNear(at, 0.5);
    expect(c.dismayT).toBe(1.5);
  });

  it('a pair\'s child stands 0.65 m to the adult\'s side', () => {
    const c = town([{ type: 'villager', ...CHILD, standOff: { x: 0.5, z: 0.3 } }]).list[0];
    const kid = c.people[1].figure.position;
    const adult = c.people[0].figure.position;
    expect(Math.abs(kid.x - adult.x)).toBeCloseTo(0.65, 9);
    expect(kid.z).toBeCloseTo(adult.z, 9);
  });

  it('a pair\'s child beside, clear: one side blocked, the other; both blocked, behind', () => {
    const { x, z } = CHILD;
    const kidAt = (area) => {
      const c = town([{ type: 'villager', x, z }], { area }).list[0];
      return worldOf(c.people[1].figure);
    };
    const clear = (p, area) => {
      for (const k of area.colliders) expect(Math.hypot(p.x - k.x, p.z - k.z) - k.r).toBeGreaterThanOrEqual(0.28 - 1e-9);
      for (const w of area.waters) {
        const dx = Math.max(w.minX - p.x, p.x - w.maxX);
        const dz = Math.max(w.minZ - p.z, p.z - w.maxZ);
        expect(Math.hypot(Math.max(dx, 0), Math.max(dz, 0))).toBeGreaterThanOrEqual(0.28 - 1e-9);
      }
    };
    const post = (sx) => ({ x: x + sx * 0.65, z, r: 0.3 });
    const right = { colliders: [post(1)], waters: [] };
    const pr = kidAt(right);
    expect(pr.x).toBeCloseTo(x - 0.65, 9);
    clear(pr, right);
    const left = { colliders: [post(-1)], waters: [] };
    const pl = kidAt(left);
    expect(pl.x).toBeCloseTo(x + 0.65, 9);
    clear(pl, left);
    // a pond on one side, a post on the other: behind
    const both = {
      colliders: [post(1)],
      waters: [{ kind: 'rect', minX: x - 2, maxX: x - 0.5, minZ: z - 1, maxZ: z + 0.2 }],
    };
    const pb = kidAt(both);
    expect(pb.x).toBeCloseTo(x, 9);
    expect(pb.z).toBeCloseTo(z + 0.6, 9);
    clear(pb, both);
    // the same spot always picks the same side
    expect(kidAt({ colliders: [], waters: [] }).x).toBeCloseTo(kidAt({ colliders: [], waters: [] }).x, 12);
  });

  it('the group never moves: 100 frames of every pose', () => {
    for (const spot of [ADULT, CHILD]) {
      const crit = town([{ type: 'villager', ...spot, standOff: { x: 0.4, z: -0.6 } }]);
      const c = crit.list[0];
      const pos0 = c.group.position.toArray();
      const rot0 = c.group.rotation.toArray();
      const figs0 = c.people.map((p) => p.figure.position.toArray().concat(p.figure.rotation.toArray()));
      const at = villagerPos(c, new THREE.Vector3());
      const near = herCat(at.x - 1, at.z - 1.2);
      let t = run(crit, 100, AWAY(c)); // stand
      expect(c.poseMode).toBe('stand');
      t = run(crit, 100, near, t); // wave
      expect(c.poseMode).toBe('wave');
      for (let i = 0; i < 100; i++) { crit.dismayNear(at, 2); t = run(crit, 1, near, t); }
      expect(c.poseMode).toBe('dismay');
      crit.scratchHello(c);
      t = run(crit, 100, near, t); // kneel
      expect(c.poseMode).toBe('kneel');
      expect(c.group.position.toArray()).toEqual(pos0);
      expect(c.group.rotation.toArray()).toEqual(rot0);
      expect(c.people.map((p) => p.figure.position.toArray().concat(p.figure.rotation.toArray()))).toEqual(figs0);
    }
  });

  it('dismay pose: after dismayNear the dismay pose, and meowWaveT still 1.5', () => {
    const crit = town([{ type: 'villager', ...ADULT }]);
    const c = crit.list[0];
    const away = AWAY(c);
    let t = run(crit, 10, away);
    crit.dismayNear(villagerPos(c, new THREE.Vector3()), 2);
    expect(c.meowWaveT).toBe(1.5);
    expect(c.dismayT).toBe(1.5);
    t = run(crit, 1, away, t);
    expect(c.poseMode).toBe('dismay');
    // the very pose a fresh twin is given for 'dismay' at the same moment
    const twin = createPeopleKit({}).buildSpot({ ...ADULT }).people[0];
    pose(twin, { mode: 'dismay', t, walked: 0, reducedMotion: false });
    expect(Array.from(c.people[0].target.rot)).toEqual(Array.from(twin.target.rot));
    // it lasts its 1.5 s, then they stand again
    t = run(crit, 95, away, t);
    expect(c.poseMode).toBe('stand');
  });

  it('the pose priority: kneel over dismay over wave over stand', () => {
    const crit = town([{ type: 'villager', ...CHILD }]);
    const c = crit.list[0];
    const at = villagerPos(c, new THREE.Vector3());
    const near = herCat(at.x, at.z - 1.5);
    let t = run(crit, 5, near);
    expect(c.poseMode).toBe('wave');
    expect(c.childMode).toBe('wave'); // the child waves when the adult waves
    crit.dismayNear(at, 2);
    t = run(crit, 1, near, t);
    expect(c.poseMode).toBe('dismay');
    crit.scratchHello(c);
    crit.dismayNear(at, 2);
    t = run(crit, 1, near, t);
    expect(c.poseMode).toBe('kneel');
    expect(c.childMode).not.toBe('kneel'); // only the grown-up kneels
  });

  it('the kneel holds at least 2.5 s and while she is within 2.5 m; they stand 0.6 s after she leaves', () => {
    const crit = town([{ type: 'villager', ...ADULT }]);
    const c = crit.list[0];
    const at = villagerPos(c, new THREE.Vector3());
    const near = herCat(at.x, at.z - 1.5);
    const gone = herCat(at.x, at.z - 3.5); // past 2.5 m, still within the wave's 5 m
    let t = run(crit, 2, near);
    crit.scratchHello(c);
    t = run(crit, 30, near, t); // 0.5 s
    t = run(crit, 110, gone, t); // she left at 0.5 s: they still kneel until 2.5 s
    expect(c.poseMode).toBe('kneel');
    t = run(crit, 12, gone, t);
    expect(c.poseMode).toBe('wave');
    // a second hello: she stays 4 s, then goes
    crit.scratchHello(c);
    t = run(crit, 240, near, t);
    expect(c.poseMode).toBe('kneel');
    t = run(crit, 33, gone, t); // 0.55 s after she left
    expect(c.poseMode).toBe('kneel');
    t = run(crit, 4, gone, t); // 0.616 s
    expect(c.poseMode).toBe('wave');
    // a hello with the switch off does nothing
    const old = createCritters(scene, [{ type: 'villager', ...ADULT }]);
    expect(() => old.scratchHello(old.list[0])).not.toThrow();
    expect(old.list[0].scratch ?? null).toBe(null);
  });

  it('gaze goes to the local cat only: a remote cat closer than hers, the head turns to hers', () => {
    const crit = town([{ type: 'villager', ...ADULT }]);
    const c = crit.list[0];
    const at = villagerPos(c, new THREE.Vector3());
    const hers = herCat(at.x - 2, at.z - 1.5); // ahead, on the figure's left
    const remote = herCat(at.x + 1, at.z - 0.8); // ahead, on its right, nearer
    scene.add(remote);
    run(crit, 60, hers);
    expect(c.gazes[0].yaw).toBeGreaterThan(0.4); // + is the figure's left
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.people[0].bones.head.getWorldQuaternion(new THREE.Quaternion()));
    expect(fwd.x).toBeLessThan(-0.3);
    // with no cat, no target: the head eases back to ahead
    let t = 1;
    for (let i = 0; i < 120; i++) { t += DT; crit.update(DT, t, hers.position, hers.position); }
    expect(Math.abs(c.gazes[0].yaw)).toBeLessThan(0.02);
  });

  it('gaze at her head: a tall cat sitting up close, the nod is toward her head, not her feet', () => {
    const crit = town([{ type: 'villager', ...ADULT }]);
    const c = crit.list[0];
    const at = villagerPos(c, new THREE.Vector3());
    const cat = herCat(at.x, at.z - 2.2, 0.75);
    run(crit, 120, cat);
    const head = worldOf(c.people[0].bones.head);
    const target = worldOf(cat.userData.parts.head);
    const flat = Math.hypot(target.x - head.x, target.z - head.z);
    const toHead = Math.atan2(target.y - head.y, flat);
    const toFeet = Math.atan2(-head.y, Math.hypot(cat.position.x - head.x, cat.position.z - head.z));
    expect(Math.abs(c.gazes[0].pitch - toHead)).toBeLessThan(0.05);
    expect(Math.abs(c.gazes[0].pitch - toFeet)).toBeGreaterThan(0.15);
    expect(c.gazes[0].pitch).toBeLessThan(0); // a nod down toward her
  });

  it('the child looks at her when the adult does', () => {
    const crit = town([{ type: 'villager', ...CHILD }]);
    const c = crit.list[0];
    const at = villagerPos(c, new THREE.Vector3());
    run(crit, 60, herCat(at.x, at.z - 2));
    expect(c.gazes[0].near).toBe(true);
    expect(c.gazes[1].near).toBe(true);
    run(crit, 60, herCat(at.x, at.z - GAZE.FAR - 3), 1);
    expect(c.gazes[0].near).toBe(false);
    expect(c.gazes[1].near).toBe(false);
  });

  it('people out of view are not posed', () => {
    const def = { type: 'villager', ...ADULT };
    const cam = cameraAt(def.x, def.z);
    cam.lookAt(def.x, 1, def.z + 50); // facing away
    cam.updateMatrixWorld(true);
    const crit = createCritters(scene, [def], { people: createPeopleKit, camera: cam });
    const c = crit.list[0];
    run(crit, 30, herCat(def.x, def.z - 1.5));
    expect(c.people[0].inView).toBe(false);
    expect(c.poseMode).toBe('wave'); // the choice is made all the same
    expect(Array.from(c.people[0].target.rot).every((v) => v === 0)).toBe(true); // never posed
  });

  it('the kit gets the walk\'s camera, reduced motion and LOD switch', () => {
    const made = [];
    const factory = (o) => { made.push(o); return createPeopleKit(o); };
    const camera = cameraAt(0, 0);
    const lodNear = () => 7;
    createCritters(scene, [{ type: 'villager', ...ADULT }], { people: factory, camera, reducedMotion: true, lodNear });
    expect(made).toHaveLength(1);
    expect(made[0].camera).toBe(camera);
    expect(made[0].reducedMotion).toBe(true);
    expect(made[0].lodNear).toBe(lodNear);
  });

  it('dispose frees the kit: every person\'s geometries and the shared material', () => {
    const crit = town([{ type: 'villager', ...CHILD }, { type: 'villager', ...ADULT }]);
    const people = crit.list.flatMap((c) => c.people);
    expect(people).toHaveLength(3);
    const spies = people.map((p) => vi.spyOn(p, 'dispose'));
    const mat = people[0].mesh.material;
    const ms = vi.spyOn(mat, 'dispose');
    crit.dispose();
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    expect(ms).toHaveBeenCalledTimes(1);
    expect(crit.list).toHaveLength(0);
    crit.dispose(); // twice is harmless
    expect(ms).toHaveBeenCalledTimes(1);
  });

  it('posing villagers allocates nothing per frame', () => {
    const crit = town([{ type: 'villager', ...CHILD }]);
    const c = crit.list[0];
    const at = villagerPos(c, new THREE.Vector3());
    const cat = herCat(at.x - 1, at.z - 1.5);
    let t = run(crit, 2, cat);
    crit.scratchHello(c);
    const spies = [
      vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Matrix4.prototype, 'clone'),
      vi.spyOn(THREE.Quaternion.prototype, 'clone'),
    ];
    t = run(crit, 100, cat, t);
    crit.dismayNear(at, 2);
    run(crit, 100, cat, t);
    for (const s of spies) expect(s).toHaveBeenCalledTimes(0);
    for (const s of spies) s.mockRestore();
  });

  it('with no people, today\'s figure exactly as now', () => {
    const c = createCritters(scene, [{ type: 'villager', ...CHILD }], { camera: cameraAt(0, 0) }).list[0];
    expect(c.people).toBeUndefined();
    expect(c.figure.children).toHaveLength(3);
    expect(c.group.userData.arm).toBeTruthy();
  });
});

// ---- the head scratch in town (Task 12) ---------------------------------------------
// Her real cat (her head part's top and her volumes are what the touch
// needs), walked by the player as the walk does, the bumps passed in.
const UP = new THREE.Vector3(0, 1, 0);

function walker(x, z, breed = 'tabby', head = null) {
  const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
  const cat = buildCat(breed, head ? { head } : undefined);
  cat.position.set(x, 0, z);
  cat.rotation.y = Math.PI; // facing +z
  player.setAvatar(cat, 3);
  player.enable();
  return { player, cat, t: 0 };
}

// one frame as the walk runs it: the player, her pose, the villagers
function walkFrame(w, crit, anim = 'follow') {
  w.t += DT;
  w.player.update(DT, [], null, [], crit.bumps);
  animateCat(w.cat, anim, w.t, anim === 'follow' ? 1 : 0, false);
  w.cat.updateMatrixWorld(true);
  crit.update(DT, w.t, w.cat.position, w.cat.position, w.cat);
}

const TOP = new THREE.Vector3();
const headTopOf = (cat) => cat.userData.parts.head.getWorldPosition(TOP).addScaledVector(UP, headTopOffset(cat));

// the right arm's centre line, every 0.02 m (upper arm, forearm, hand),
// against her head sphere and body capsule: the least clearance
const A = new THREE.Vector3();
const Bv = new THREE.Vector3();
const P = new THREE.Vector3();
const D = new THREE.Vector3();
const PT = new THREE.Vector3();
const TIP = new THREE.Vector3();
function segPointDist(a, b, c) {
  D.subVectors(b, a);
  const L2 = D.lengthSq();
  const k = L2 > 0 ? Math.min(1, Math.max(0, P.copy(c).sub(a).dot(D) / L2)) : 0;
  return D.multiplyScalar(k).add(a).distanceTo(c);
}
function worstClearance(p, vol) {
  const B = p.bones;
  p.figure.updateMatrixWorld(true);
  const chain = [B.upperArmR, B.forearmR, B.handR];
  B.handR.localToWorld(TIP.set(0, -p.look.dims.hand * 0.96, 0));
  let worst = Infinity;
  for (let i = 0; i < 3; i++) {
    chain[i].getWorldPosition(A);
    if (i < 2) chain[i + 1].getWorldPosition(Bv); else Bv.copy(TIP);
    const n = Math.max(1, Math.ceil(A.distanceTo(Bv) / 0.02));
    for (let k = 0; k <= n; k++) {
      PT.lerpVectors(A, Bv, k / n);
      const head = PT.distanceTo(vol.head.center) - vol.head.radius;
      const body = segPointDist(vol.body.a, vol.body.b, PT) - vol.body.r;
      worst = Math.min(worst, head, body);
    }
  }
  return worst;
}

// She walks straight at the grown-up from 2.5 m in front until the bump
// stops her (she lets go as her way in slows to under a third), then sits.
function walkUp(crit, c, breed = 'tabby', head = null) {
  const at = villagerPos(c, new THREE.Vector3());
  const w = walker(at.x, at.z - 2.5, breed, head);
  w.player.setTouchMove({ x: 0, z: 1, mag: 1 });
  let most = 0;
  for (let i = 0; i < 300; i++) {
    const was = at.z - w.cat.position.z;
    walkFrame(w, crit);
    const inBy = was - (at.z - w.cat.position.z);
    most = Math.max(most, inBy);
    if (at.z - w.cat.position.z < 2 && inBy < most / 3) break;
  }
  w.player.setTouchMove(null);
  for (let i = 0; i < 60; i++) walkFrame(w, crit, 'requestPet');
  return w;
}

// frames until the hand rests on her head's top (or Infinity); the arm's
// least clearance from her, every frame, into worst.v
function untilResting(w, crit, c, frames, worst) {
  const palm = new THREE.Vector3();
  for (let i = 1; i <= frames; i++) {
    walkFrame(w, crit, 'requestPet');
    worst.v = Math.min(worst.v, worstClearance(c.people[0], catVolumes(w.cat)));
    palmPoint(c.people[0], palm);
    if (c.scratchState === 'resting' && palm.distanceTo(headTopOf(w.cat).addScaledVector(UP, REACH.CLEAR)) < 0.02) return i;
  }
  return Infinity;
}

describe('the head scratch in town', () => {
  // (in the walk she asks within the wave's 5 m, so the kneel starts from
  // the wave: the hand comes down from it first, at the gesture's 1.2 m/s,
  // and the touch comes about 0.25 s later than from standing: 2.38-2.45 s
  // for a grown-up, 1.75-1.85 s for an older person who bows)
  const OLDER = spotOf('older');
  it('she walks up, asks, and the hand rests on her head within 2.5 s; she walks away, it withdraws, they stand 0.6 s after she is past 2.5 m', () => {
    for (const [sex, spot] of [['m', ADULT], ['f', ADULT], ['f', OLDER]]) {
      const crit = town([{ type: 'villager', ...spot, sex }]);
      const c = crit.list[0];
      const w = walkUp(crit, c);
      expect(c.poseMode).toBe('wave');
      expect(c.scratchState).toBe(null); // no touch without the hello
      crit.scratchHello(c);
      const worst = { v: Infinity };
      const n = untilResting(w, crit, c, 150, worst);
      expect(n * DT, sex).toBeLessThanOrEqual(spot === OLDER ? 1.9 : 2.5);
      // it stays while she does (and strokes)
      for (let i = 0; i < 60; i++) {
        walkFrame(w, crit, 'requestPet');
        worst.v = Math.min(worst.v, worstClearance(c.people[0], catVolumes(w.cat)));
      }
      expect(c.scratchState).toBe('resting');
      // she walks away: the hand withdraws, never through her
      const at = villagerPos(c, new THREE.Vector3());
      w.player.setTouchMove({ x: 0, z: -1, mag: 1 });
      const seen = new Set();
      let past = null;
      for (let i = 0; i < 240 && c.poseMode === 'kneel'; i++) {
        walkFrame(w, crit);
        if (c.scratchState) seen.add(c.scratchState);
        if (c.poseMode === 'kneel') worst.v = Math.min(worst.v, worstClearance(c.people[0], catVolumes(w.cat)));
        if (past === null && w.cat.position.distanceTo(at) > REACH.HOLD_R) past = w.t;
      }
      expect(seen.has('withdrawing')).toBe(true);
      expect(c.poseMode).toBe('wave');
      // (counting the first frame she is past it)
      expect(w.t - past + DT).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(w.t - past + DT).toBeLessThan(0.6 + DT);
      expect(worst.v, sex).toBeGreaterThan(0.005);
    }
  }, 90000);

  it('the free hand rests on the raised knee, out of her way: while the touch rests, his left arm keeps 2 cm clear of her (every preset cat, a man and a woman)', () => {
    const P2 = new THREE.Vector3();
    for (const breed of ['tabby', 'siamese', 'persian', 'mainecoon']) {
      for (const sex of ['m', 'f']) {
        const crit = town([{ type: 'villager', ...ADULT, sex }]);
        const c = crit.list[0];
        const w = walkUp(crit, c, breed);
        crit.scratchHello(c);
        const p = c.people[0];
        const B = p.bones;
        const d = p.look.dims;
        let worst = Infinity;
        for (let i = 0; i < 240; i++) {
          walkFrame(w, crit, 'requestPet');
          const vol = catVolumes(w.cat);
          const chain = [B.upperArmL, B.forearmL, B.handL];
          const radii = [d.uaR[0], d.faR[0], 0.18 * d.hand];
          B.handL.localToWorld(TIP.set(0, -d.hand * 0.96, 0));
          for (let k = 0; k < 3; k++) {
            chain[k].getWorldPosition(A);
            if (k < 2) chain[k + 1].getWorldPosition(Bv); else Bv.copy(TIP);
            for (let j = 0; j <= 10; j++) {
              P2.lerpVectors(A, Bv, j / 10);
              worst = Math.min(worst, P2.distanceTo(vol.head.center) - vol.head.radius - radii[k], segPointDist(vol.body.a, vol.body.b, P2) - vol.body.r - radii[k]);
            }
          }
        }
        expect(worst, `${breed} ${sex}`).toBeGreaterThan(0.02);
        // and the hand is on the knee: the palm within 0.06 m of the top of it
        const knee = B.shinL.getWorldPosition(new THREE.Vector3());
        const palm = B.handL.localToWorld(new THREE.Vector3(0, -d.hand * 0.5, 0));
        expect(palm.distanceTo(knee.addScaledVector(UP, d.thR[1])), `${breed} ${sex}`).toBeLessThan(0.06);
      }
    }
  }, 90000);

  it('stepScratch is given her volumes: with her standing where the held hand would be, the arm keeps clear of her (and without them it would not)', () => {
    // her head about where the held-out hand goes (0.4 m in front of the
    // middle, a little to the right, low): placed by hand, past the bumps
    const run = (strip) => {
      const factory = (o) => {
        const k = createPeopleKit(o);
        if (strip) { const real = k.stepScratch; k.stepScratch = (p, sc, dt, opts) => real(p, sc, dt, { ...opts, volumes: null }); }
        return k;
      };
      let worst = Infinity;
      for (const [side, fwd] of [[0.12, 0.75], [0.2, 0.7], [0.05, 0.8], [0.15, 0.85]]) {
        const crit = createCritters(scene, [{ type: 'villager', ...ADULT, sex: 'm' }], { people: factory });
        const c = crit.list[0];
        const at = villagerPos(c, new THREE.Vector3());
        const cat = buildCat('tabby');
        cat.position.set(at.x + side, 0, at.z - fwd);
        cat.rotation.y = Math.PI;
        let t = 0;
        crit.scratchHello(c);
        for (let i = 0; i < 150; i++) {
          t += DT;
          animateCat(cat, 'requestPet', t, 0, false);
          cat.updateMatrixWorld(true);
          crit.update(DT, t, cat.position, cat.position, cat);
          if (i > 45) worst = Math.min(worst, worstClearance(c.people[0], catVolumes(cat)));
        }
      }
      return worst;
    };
    expect(run(false)).toBeGreaterThan(0.005);
    expect(run(true)).toBeLessThan(0);
  }, 90000);

  it('a hat put on mid-walk (a find she wears): a new head, measured afresh; the hand works out of the new hat at once and comes to rest on it', () => {
    const crit = town([{ type: 'villager', ...ADULT, sex: 'f' }]);
    const c = crit.list[0];
    const w = walkUp(crit, c);
    crit.scratchHello(c);
    const worst = { v: Infinity };
    expect(untilResting(w, crit, c, 150, worst)).toBeLessThan(Infinity);
    expect(worst.v).toBeGreaterThan(0.005);
    const bare = headTopOf(w.cat).y;
    const oldHead = w.cat.userData.parts.head;
    // the find card's Wear it (game/findcard.js): her cat redressed inside
    // the same object, while the hand rests on her head
    redressCat(w.cat, 'tabby', { head: 'tophat' });
    animateCat(w.cat, 'requestPet', w.t, 0, false);
    w.cat.updateMatrixWorld(true);
    expect(w.cat.userData.parts.head).not.toBe(oldHead); // a new head part
    expect(headTopOf(w.cat).y).toBeGreaterThan(bare + 0.1); // its top is the hat's
    // the hat appears round the resting hand: it comes out within 0.25 s,
    // and from then on keeps clear, and comes to rest on the hat's top
    let out = Infinity;
    const palm = new THREE.Vector3();
    let rest = Infinity;
    const after = { v: Infinity };
    for (let i = 1; i <= 240 && rest === Infinity; i++) {
      walkFrame(w, crit, 'requestPet');
      const g = worstClearance(c.people[0], catVolumes(w.cat));
      if (out === Infinity && g > 0.005) out = i;
      if (out < i) after.v = Math.min(after.v, g);
      palmPoint(c.people[0], palm);
      if (c.scratchState === 'resting' && palm.distanceTo(headTopOf(w.cat).addScaledVector(UP, REACH.CLEAR)) < 0.02) rest = i;
    }
    expect(out * DT).toBeLessThanOrEqual(0.25);
    expect(after.v).toBeGreaterThan(0.005);
    expect(rest).toBeLessThan(Infinity);
    expect(c.poseMode).toBe('kneel');
  }, 90000);

  it('kneeling, the grown-up turns to her above the hips only: the chest takes more of the turn, eased; the hips and legs stay as built', () => {
    const crit = town([{ type: 'villager', ...ADULT, sex: 'm' }]);
    const c = crit.list[0];
    const p = c.people[0];
    const at = villagerPos(c, new THREE.Vector3());
    const cat = herCat(at.x + 1.4, at.z - 1.4); // 45 degrees to his right
    let t = run(crit, 90, cat);
    const standChest = p.bones.chest.rotation.y;
    crit.scratchHello(c);
    let most = 0;
    let last = p.bones.chest.rotation.y;
    for (let i = 0; i < 90; i++) {
      t = run(crit, 1, cat, t);
      most = Math.max(most, Math.abs(p.bones.chest.rotation.y - last));
      last = p.bones.chest.rotation.y;
    }
    expect(c.poseMode).toBe('kneel');
    // turned to his right (- yaw), more than standing, and eased (no jump)
    expect(p.bones.chest.rotation.y).toBeLessThan(standChest - 0.1);
    expect(most).toBeLessThan(0.02);
    // the head still faces her
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.bones.head.getWorldQuaternion(new THREE.Quaternion()));
    const to = new THREE.Vector3().subVectors(worldOf(cat.userData.parts.head), worldOf(p.bones.head));
    expect(Math.abs(Math.atan2(-fwd.x, -fwd.z) - Math.atan2(-to.x, -to.z))).toBeLessThan(0.08);
    // the hips and the legs: the kneel's own, as a fresh twin is given it
    const twin = createPeopleKit({}).buildSpot({ ...ADULT, sex: 'm' }).people[0];
    pose(twin, { mode: 'kneel', t, walked: 0, reducedMotion: false });
    applyPose(twin, DT, 0);
    for (const b of ['pelvis', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']) {
      for (let k = 0; k < 3; k++) expect(p.bones[b].rotation.toArray()[k], `${b} ${k}`).toBeCloseTo(twin.bones[b].rotation.toArray()[k], 9);
      for (let k = 0; k < 3; k++) expect(p.bones[b].position.getComponent(k), `${b} ${k}`).toBeCloseTo(twin.bones[b].position.getComponent(k), 9);
    }
    // the group and the figure never turn
    expect(c.group.rotation.y).toBe(0);
    expect(p.figure.rotation.y).toBe(0);
  });

  it('a pair\'s child is near her exactly when the grown-up is: at the 4 m edge, on the far side from the child', () => {
    const crit = town([{ type: 'villager', ...CHILD }]);
    const c = crit.list[0];
    const adult = worldOf(c.people[0].figure);
    const kid = worldOf(c.people[1].figure);
    const away = Math.sign(adult.x - kid.x); // the side away from the child
    const flat = (cat, o) => { const h = worldOf(cat.userData.parts.head); return Math.hypot(h.x - o.x, h.z - o.z); };
    // within 4 m of the grown-up, past 4 m from the child
    const cat = herCat(adult.x + away * 3.6, adult.z - 1.3);
    expect(flat(cat, adult)).toBeLessThan(GAZE.NEAR);
    expect(flat(cat, kid)).toBeGreaterThan(GAZE.NEAR);
    let t = run(crit, 60, cat);
    expect(c.gazes[0].near).toBe(true);
    expect(c.gazes[1].near).toBe(true);
    expect(Math.abs(c.gazes[1].yaw)).toBeGreaterThan(0.5); // the child looks round at her
    // past 5 m from the child, under 5 from the grown-up (still near): still near
    const on = herCat(adult.x + away * 4.5, adult.z - 1.3);
    expect(flat(on, adult)).toBeLessThan(GAZE.FAR);
    expect(flat(on, kid)).toBeGreaterThan(GAZE.FAR);
    t = run(crit, 30, on, t);
    expect(c.gazes[0].near).toBe(true);
    expect(c.gazes[1].near).toBe(true);
    // the grown-up lets her go: so does the child
    run(crit, 30, herCat(adult.x + away * 5.6, adult.z - 1.3), t);
    expect(c.gazes[0].near).toBe(false);
    expect(c.gazes[1].near).toBe(false);
    // on the child's side, within 4 m of the child but not the grown-up: neither
    const crit2 = town([{ type: 'villager', ...CHILD }]);
    const c2 = crit2.list[0];
    const there = herCat(kid.x - away * 3.6, kid.z - 1.3);
    expect(flat(there, kid)).toBeLessThan(GAZE.NEAR);
    expect(flat(there, adult)).toBeGreaterThan(GAZE.NEAR);
    run(crit2, 60, there);
    expect(c2.gazes[0].near).toBe(false);
    expect(c2.gazes[1].near).toBe(false);
  });

  it('one way in is planned a frame across all villagers, the one that has waited longest first', () => {
    // a touch that always wants to plan
    const plans = [];
    let frame = 0;
    const factory = (o) => {
      const k = createPeopleKit(o);
      k.stepScratch = (p, sc, dt, opts) => {
        sc.planned = opts.mayPlan !== false;
        sc.wantPlan = !sc.planned;
        if (sc.planned) plans.push([frame, p]);
        return 'held';
      };
      return k;
    };
    const defs = [0, 3, 6].map((dx) => ({ type: 'villager', ...ADULT, x: ADULT.x + dx }));
    const crit = createCritters(scene, defs, { people: factory });
    for (const c of crit.list) crit.scratchHello(c);
    const cat = herCat(ADULT.x + 3, ADULT.z - 1.5);
    let t = 0;
    for (frame = 0; frame < 30; frame++) { t += DT; crit.update(DT, t, cat.position, cat.position, cat); }
    const perFrame = new Map();
    for (const [f] of plans) perFrame.set(f, (perFrame.get(f) ?? 0) + 1);
    expect(Math.max(...perFrame.values())).toBe(1);
    expect(plans).toHaveLength(30); // one every frame
    // round and round: each of the three every third frame
    const who = plans.map(([, p]) => crit.list.findIndex((c) => c.people[0] === p));
    expect(new Set(who.slice(0, 3)).size).toBe(3);
    for (let i = 3; i < who.length; i++) expect(who[i]).toBe(who[i - 3]);
  });

  it('posing and touching with her real cat allocates nothing per frame', () => {
    const crit = town([{ type: 'villager', ...ADULT, sex: 'm' }]);
    const c = crit.list[0];
    const w = walkUp(crit, c);
    crit.scratchHello(c);
    for (let i = 0; i < 5; i++) walkFrame(w, crit, 'requestPet');
    const spies = [
      vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Matrix4.prototype, 'clone'),
      vi.spyOn(THREE.Quaternion.prototype, 'clone'),
    ];
    // (the villagers' update and the touch, not her own walk)
    let t = w.t;
    for (let i = 0; i < 150; i++) { t += DT; crit.update(DT, t, w.cat.position, w.cat.position, w.cat); }
    for (const s of spies) expect(s).toHaveBeenCalledTimes(0);
    for (const s of spies) s.mockRestore();
    expect(c.scratchState).toBe('resting');
  }, 60000);
});
