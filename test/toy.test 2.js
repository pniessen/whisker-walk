import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createToy } from '../src/toy.js';

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

  it('retrieve deactivates and hides', () => {
    const toy = createToy(scene);
    toy.throwFrom(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    toy.retrieve();
    expect(toy.active).toBe(false);
    expect(toy.mesh.visible).toBe(false);
  });
});
