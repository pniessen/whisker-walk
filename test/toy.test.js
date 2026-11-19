import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createToy, buildYarnBall, TOY_RADIUS } from '../src/toy.js';

const scene = { add() {}, remove() {} };
const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

describe('createToy', () => {
  it('starts inactive and hidden', () => {
    const toy = createToy(scene);
    expect(toy.active).toBe(false);
    expect(toy.mesh.visible).toBe(false);
  });

  it('throwFrom activates and flies forward under gravity', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0, 0, -1));
    expect(toy.active).toBe(true);
    const z0 = toy.mesh.position.z;
    toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.z).toBeLessThan(z0); // moved forward (-z)
    const yAfterOne = toy.mesh.position.y;
    for (let i = 0; i < 40; i++) toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.y).toBeLessThan(yAfterOne); // gravity pulled it down
  });

  it('lands, slows to rest, and accrues idleTime', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0, 0, -1));
    for (let i = 0; i < 200; i++) toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.y).toBeLessThanOrEqual(0.14);
    expect(toy.idleTime).toBeGreaterThan(0);
    expect(toy.mesh.position.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
  });

  it('bat pushes the ball away from the batter', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 0.13, 0), new THREE.Vector3(0, 0, 0), 0);
    for (let i = 0; i < 40; i++) toy.update(0.05, BOUNDS); // settle
    toy.bat(new THREE.Vector3(-1, 0, 0)); // cat to the west → ball flies east
    toy.update(0.05, BOUNDS);
    expect(toy.mesh.position.x).toBeGreaterThan(0);
    expect(toy.idleTime).toBe(0);
  });

  it('setPosition places the ball at rest without imparting velocity', () => {
    const toy = createToy(scene);
    toy.setPosition(new THREE.Vector3(3, 0, -4));
    expect(toy.active).toBe(true);
    expect(toy.mesh.visible).toBe(true);
    expect(toy.mesh.position.x).toBe(3);
    expect(toy.mesh.position.z).toBe(-4);
    const y0 = toy.mesh.position.y;
    toy.update(0.05, BOUNDS); // one tick — only gravity should move it, no throw arc
    expect(toy.mesh.position.y).toBeLessThanOrEqual(y0);
    expect(Math.abs(toy.mesh.position.x - 3)).toBeLessThan(0.01);
    expect(Math.abs(toy.mesh.position.z - (-4))).toBeLessThan(0.01);
  });

  it('retrieve deactivates and hides', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    toy.retrieve();
    expect(toy.active).toBe(false);
    expect(toy.mesh.visible).toBe(false);
  });
});

// Controls review, 2026-11-19: the ball lies around to find. It must never
// read as a treasure (those are glowing pink spheres), and it plays exactly
// as the thrown one did: the same physics ball inside.
describe('the found yarn ball', () => {
  const meshes = (root) => { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };

  it('looks like wool, not a treasure: matte blue, no glow, wound strands and a loose thread, about 0.15 m', () => {
    const ball = buildYarnBall();
    const all = meshes(ball);
    expect(all.length).toBeGreaterThanOrEqual(5); // the core, three strands, the thread
    for (const m of all) {
      const c = m.material.color;
      expect(m.material.emissive.getHex(), 'no glow').toBe(0);
      expect(m.material.roughness).toBeGreaterThanOrEqual(0.8);
      expect(c.b).toBeGreaterThan(c.r); // blue, never pink
    }
    ball.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(ball);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(0.26);
    expect(size.y).toBeLessThan(0.34);
    expect(TOY_RADIUS).toBe(0.13); // the physics ball, unchanged
  });

  it('placeAt lays it to rest, nobody\'s; a bat, a kick or a handoff makes it this device\'s', () => {
    const toy = createToy(scene);
    toy.placeAt({ x: 4, z: -2 });
    expect(toy.active).toBe(true);
    expect(toy.mesh.visible).toBe(true);
    expect(toy.claimed).toBe(false);
    expect([toy.mesh.position.x, toy.mesh.position.y, toy.mesh.position.z]).toEqual([4, TOY_RADIUS, -2]);
    toy.update(0.05, BOUNDS);
    expect(toy.idleTime).toBeGreaterThan(0); // resting: ready to be picked up
    toy.bat(new THREE.Vector3(3, 0, -2));
    expect(toy.claimed).toBe(true);
    toy.placeAt({ x: 0, z: 0 });
    expect(toy.claimed).toBe(false);
    toy.throwFrom(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1), 2.5);
    expect(toy.claimed).toBe(true);
    toy.retrieve();
    expect(toy.claimed).toBe(false);
    toy.setPosition(new THREE.Vector3(1, 0.13, 1));
    expect(toy.claimed).toBe(true);
  });

  it('held, it does not roll or fall and is drawn smaller; let go, it is full size again', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    toy.hold();
    expect(toy.held && toy.active && toy.claimed).toBe(true);
    toy.mesh.position.set(2, 0.4, 2);
    for (let i = 0; i < 10; i++) toy.update(0.05, BOUNDS);
    expect([toy.mesh.position.x, toy.mesh.position.y, toy.mesh.position.z]).toEqual([2, 0.4, 2]);
    expect(toy.mesh.scale.x).toBeLessThan(1);
    toy.throwFrom(new THREE.Vector3(2, 0.4, 2), new THREE.Vector3(0, 0, 1), 2.5);
    expect(toy.held).toBe(false);
    expect(toy.mesh.scale.x).toBe(1);
  });
});
