import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createAvatarUpdater } from '../src/game/avatar.js';
import { createWaterState } from '../src/waterstate.js';
import { createToy } from '../src/toy.js';

// The found yarn ball is never lost (controls review, 2026-11-19): left
// anywhere it stays; only after 25 s where no cat can reach it does it roll
// back to its spot, with a line saying where. Bats count for the whole walk.
const part = () => new THREE.Object3D();
function harness() {
  const cat = new THREE.Object3D();
  cat.userData = {
    breed: 'tabby',
    parts: { body: part(), head: part(), tail: part(), tailPivots: [part(), part()], legs: [part(), part(), part(), part()], earL: part(), earR: part() },
  };
  cat.position.set(-20, 0, -20);
  const player = {
    perchY: 0, speedFactor: 1, speed: 0, inputActive: false, stalking: false,
    forward: () => new THREE.Vector3(0, 0, -1),
    hopY: 0, inWater: false, wading: false, swimming: false, waterState: createWaterState(),
  };
  const toy = createToy({ add() {}, remove() {} });
  toy.spot = { x: 5, z: 5 };
  toy.placeAt(toy.spot);
  const toasts = [];
  const awards = [];
  const s = {
    cat, perched: null,
    freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0,
    idleTime: 0, stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0,
    pose: 'follow', net: null, balkedPuddles: new Set(),
    // a house-sized footprint at (20, 20)
    areaData: { puddles: [], boxes: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, colliders: [{ x: 20, z: 20, r: 4 }], waters: [] },
    fx: { burst() {} },
    critters: { setFleeModifier() {}, markStalked() {}, catchAt: () => null, pounceCatch: () => null },
    toy, batReady: true, batCount: 0,
    yarnSpot: { x: 5, z: 5, where: 'by the playground bench' },
    toyGhost: { visible: false, position: new THREE.Vector3() },
    remotes: { list: [] }, groomTimers: new Map(),
  };
  const { updateAvatar } = createAvatarUpdater({
    player,
    progression: { state: { equipped: { collar: 'none', feet: 'none' } }, recordSighting() {} },
    settings: { get: () => false },
    log: { award() {}, awardOnce: (type, key, label) => { awards.push([type, key, label]); return 1; } },
    hud: { toast: (t) => toasts.push(t) },
    audio: { landThump() {}, step() {}, purr() {}, fanfare() {}, waterSplash() {} },
    petNameFor: () => 'x', completeTag() {}, noteBat() {},
  });
  const run = (seconds, dt = 0.25) => { for (let t = 0; t < seconds; t += dt) updateAvatar(s, dt, t); };
  return { s, toy, cat, toasts, awards, run };
}

describe('the found yarn ball stays found', () => {
  it('left on open ground, it stays there however long', () => {
    const h = harness();
    h.toy.mesh.position.set(-3, 0.13, 8);
    h.run(60);
    expect([h.toy.mesh.position.x, h.toy.mesh.position.z]).toEqual([-3, 8]);
    expect(h.toy.active).toBe(true);
    expect(h.toasts).toEqual([]);
  });

  it('somewhere no cat can reach, it rolls home after 25 s, and says where', () => {
    const h = harness();
    h.toy.bat(new THREE.Vector3(0, 0, 0)); // hers now
    h.toy.mesh.position.set(20, 0.13, 20); // inside the footprint
    h.run(24);
    expect(h.toy.mesh.position.x).toBe(20);
    h.run(1.5);
    expect([h.toy.mesh.position.x, h.toy.mesh.position.z]).toEqual([5, 5]);
    expect(h.toy.claimed).toBe(true); // still hers: a co-walker keeps seeing it as the ghost
    expect(h.toasts).toEqual(['The yarn ball rolled back by the playground bench 🧶']);
  });

  it('just inside a footprint\'s edge is still within batting reach', () => {
    const h = harness();
    h.toy.mesh.position.set(20, 0.13, 20 - 4.3); // 0.35 + 4 is the cat's limit; the ball is 0.05 inside it
    h.run(30);
    expect(h.toy.mesh.position.z).toBeCloseTo(15.7, 6);
  });

  it('four bats over the walk, not in a row, are a good play session; never one in her own mouth', () => {
    const h = harness();
    h.toy.hold();
    h.cat.position.set(h.toy.mesh.position.x, 0, h.toy.mesh.position.z);
    h.run(1);
    expect(h.s.batCount).toBe(0);
    h.toy.placeAt({ x: 0, z: 0 });
    for (let i = 0; i < 4; i++) {
      h.cat.position.set(0, 0, 3); h.run(0.5); // away: ready again
      h.toy.placeAt({ x: 0, z: 0 });
      h.cat.position.set(0, 0, 0.2); h.run(0.25);
    }
    expect(h.s.batCount).toBe(4);
    expect(h.awards).toContainEqual(['play', 'play', 'a very good play session']);
  });
});
