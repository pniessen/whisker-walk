import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The Old House step 4, Task 5 (plan ruling W7): the hall's front door opens
// for her. When she comes within FRONT_DOOR_NEAR of it, its two leaves swing
// out onto the lawn by FRONT_DOOR_OPEN over FRONT_DOOR_S (at once under
// reduced motion), and they shut once she is FRONT_DOOR_FAR away. Only a walk
// with the `house-town` end has a door that opens (house.parts.frontDoor).
// A local look: no collider, no stream, nothing sent.

// The headless document stub every world test uses (test/flattrace.test.js's).
vi.stubGlobal('document', canvasStub);

const { build } = await import('../src/world/house.js');
const { HOUSE_FRONT_DOOR, houseFloorGround } = await import('../src/world/houseplan.js');
const { FRONT_DOOR_NEAR, FRONT_DOOR_FAR, FRONT_DOOR_OPEN, FRONT_DOOR_S } = await import('../src/world/houselife.js');
const { endsFor } = await import('../src/gateways.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');

const DT = 1 / 60;
const D = HOUSE_FRONT_DOOR;
const floor = houseFloorGround();

// A built house and its life, with the cat a point moved frame by frame and the
// camera hung behind her (south of her, as a walk's start puts it).
function setup(o = {}) {
  const { reducedMotion = false } = o;
  const gateEnds = 'gateEnds' in o ? o.gateEnds : endsFor('house');
  const scene = new THREE.Scene();
  const record = build(scene, gateEnds === undefined ? {} : { gateEnds });
  const log = createDiscoveryLog({ addPoints() {}, recordFeat() {} });
  log.startWalk();
  const life = record.life({ scene, reducedMotion, log, audio: null, toy: null, dusk: false, now: () => new Date(2026, 10, 21, 15, 0) });
  const cat = new THREE.Vector3();
  const camera = new THREE.PerspectiveCamera();
  let t = 0;
  const place = (x, z) => {
    cat.set(x, floor.y(x, z), z);
    camera.position.set(x, cat.y + 2.2, z + 3.4);
    camera.lookAt(cat);
  };
  const stay = (x, z, seconds) => {
    place(x, z);
    for (let i = 0; i < Math.round(seconds / DT); i++) { t += DT; life.update(DT, t, cat, camera); }
  };
  const settleAt = (x, z) => { place(x, z); life.settle(cat, camera); };
  return { scene, record, life, stay, settleAt, door: record.house.parts.frontDoor };
}
// how far each leaf has turned from shut, as a share of FRONT_DOOR_OPEN's angle
const angles = (door) => [Math.abs(door.left.rotation.y), Math.abs(door.right.rotation.y)];
// a leaf's far edge (its meeting edge, at the door's middle), in the world
function farEdge(pivot) {
  pivot.updateWorldMatrix(true, false);
  const hingeX = pivot.position.x;
  return new THREE.Vector3(D.x - hingeX, 1.0, 0).applyMatrix4(pivot.matrixWorld);
}

describe("the hall's front door", () => {
  it('the numbers', () => {
    expect([FRONT_DOOR_NEAR, FRONT_DOOR_FAR, FRONT_DOOR_OPEN, FRONT_DOOR_S]).toEqual([2.4, 2.9, 1.2, 0.4]);
  });

  it('a walk with the door home has two leaves, each a pivot at its hinge in the hall\'s south wall', () => {
    const { door } = setup();
    expect(door).toBeTruthy();
    for (const [pivot, side] of [[door.left, -1], [door.right, 1]]) {
      expect(pivot).toBeInstanceOf(THREE.Object3D);
      pivot.updateWorldMatrix(true, false);
      const at = new THREE.Vector3().setFromMatrixPosition(pivot.matrixWorld);
      expect(Math.sign(at.x - D.x)).toBe(side);
      expect(Math.abs(at.z - D.z)).toBeLessThan(0.01);
      // a leaf in it, the section's own child (so it sinks with the wall)
      let leaf = null;
      pivot.traverse((o) => { if (o.isMesh) leaf = o; });
      expect(leaf).toBeTruthy();
      expect(pivot.parent.userData.houseSection).toBeTruthy();
    }
    // shut at the start, the far edges meeting at the door's middle
    expect(angles(door)).toEqual([0, 0]);
    for (const p of [door.left, door.right]) expect(farEdge(p).x).toBeCloseTo(D.x, 6);
  });

  it('the hall\'s door opens as she comes to it and shuts once she has gone', () => {
    const { life, stay, door } = setup();
    stay(0, 5, 0.5);
    expect(life.frontDoorOpen).toBe(false);
    expect(angles(door)).toEqual([0, 0]);
    // up to the door (10.0 is 2.0 m from it: she reaches the gate from there)
    stay(0, 10.0, FRONT_DOOR_S);
    expect(life.frontDoorOpen).toBe(true);
    for (const a of angles(door)) expect(a).toBeCloseTo(FRONT_DOOR_OPEN, 2);
    // between NEAR and FAR it stays as it is: open
    const between = D.z - (FRONT_DOOR_NEAR + FRONT_DOOR_FAR) / 2;
    stay(0, between, 1);
    expect(life.frontDoorOpen).toBe(true);
    for (const a of angles(door)) expect(a).toBeCloseTo(FRONT_DOOR_OPEN, 2);
    // gone: shut again
    stay(0, 5, FRONT_DOOR_S);
    expect(life.frontDoorOpen).toBe(false);
    for (const a of angles(door)) expect(a).toBeCloseTo(0, 2);
    // between NEAR and FAR it stays as it is: shut
    stay(0, between, 1);
    expect(life.frontDoorOpen).toBe(false);
    expect(angles(door)).toEqual([0, 0]);
    // and halfway through its swing it is halfway open, no more
    stay(0, 10.0, FRONT_DOOR_S / 2);
    for (const a of angles(door)) {
      expect(a).toBeGreaterThan(0.1);
      expect(a).toBeLessThan(FRONT_DOOR_OPEN - 0.1);
    }
  });

  it('it opens outward, never through her', () => {
    const { record, stay, door } = setup();
    // the same steps on a walk whose door never opens: the live colliders (the
    // ledges' guards come and go as she moves) end the same
    const shut = setup({ gateEnds: [] });
    stay(0, 5, 0.1);
    shut.stay(0, 5, 0.1);
    const edges = [];
    for (let i = 0; i < Math.round(FRONT_DOOR_S / DT) + 2; i++) {
      stay(0, 10.0, DT);
      shut.stay(0, 10.0, DT);
      for (const p of [door.left, door.right]) edges.push(farEdge(p).z);
    }
    expect(Math.max(...[door.left, door.right].map((p) => Math.abs(p.rotation.y)))).toBeCloseTo(FRONT_DOOR_OPEN, 2);
    for (const z of edges) expect(z).toBeGreaterThanOrEqual(D.z - 1e-9);
    // fully open, each far edge stands out on the lawn
    for (const p of [door.left, door.right]) expect(farEdge(p).z).toBeGreaterThan(D.z + 0.5);
    // no collider added or removed, none moved
    expect(record.colliders).toEqual(shut.record.colliders);
  });

  it('under reduced motion it opens at once', () => {
    const { life, stay, door } = setup({ reducedMotion: true });
    stay(0, 5, DT);
    stay(0, 10.0, DT);
    expect(life.frontDoorOpen).toBe(true);
    for (const a of angles(door)) expect(a).toBeCloseTo(FRONT_DOOR_OPEN, 9);
    stay(0, 5, DT);
    expect(angles(door)).toEqual([0, 0]);
  });

  it('a walk starting by the door finds it as she stands: open at once, never swinging', () => {
    const near = setup();
    near.settleAt(0, 10.0);
    for (const a of angles(near.door)) expect(a).toBeCloseTo(FRONT_DOOR_OPEN, 9);
    const far = setup();
    far.settleAt(0, 7.95); // the door's arrival
    expect(angles(far.door)).toEqual([0, 0]);
    expect(far.life.frontDoorOpen).toBe(false);
  });

  it('without a house-town end it stays shut', () => {
    for (const gateEnds of [undefined, [], endsFor('neighborhood')]) {
      const { record, life, stay } = setup({ gateEnds });
      expect(record.house.parts.frontDoor).toBeNull();
      stay(0, 10.0, 1);
      expect(life.frontDoorOpen).toBe(false);
    }
    // and the bare build's door is the one drawn in the wall, as before
    const scene = new THREE.Scene();
    const bare = build(scene);
    let pivots = 0;
    scene.traverse((o) => { if (o.name === 'houseFrontLeaf') pivots++; });
    expect(pivots).toBe(0);
    for (const m of bare.house.sectionMeshes.values()) expect(m.children).toEqual([]);
  });

  it('it draws on no stream', () => {
    const { stay } = setup();
    const spy = vi.spyOn(Math, 'random');
    try {
      for (let i = 0; i < 5; i++) { stay(0, 10.0, 0.5); stay(0, 5, 0.5); }
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('dispose puts the door back shut', () => {
    const { life, stay, door } = setup();
    stay(0, 10.0, 1);
    life.dispose();
    expect(angles(door)).toEqual([0, 0]);
  });
});
