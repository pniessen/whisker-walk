import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCritters, villagerPos, questMarkerY } from '../src/critters.js';
import { createPeopleKit, pose, spotKind, GAZE } from '../src/people/index.js';

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
