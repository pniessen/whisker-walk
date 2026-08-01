import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTippables } from '../src/tippables.js';

const scene = { add() {}, remove() {} };
const SPOTS = [
  { x: 0, z: 0, kind: 'pot' },
  { x: 5, z: 0, kind: 'can' },
  { x: 0, z: 5, kind: 'bin' },
];

describe('createTippables', () => {
  it('builds one entry per spot, untipped', () => {
    const tp = createTippables(scene, SPOTS);
    expect(tp.list).toHaveLength(3);
    expect(tp.list.every((e) => !e.tipped)).toBe(true);
  });

  it('nearest finds only untipped entries in range', () => {
    const tp = createTippables(scene, SPOTS);
    const near = new THREE.Vector3(0.5, 0, 0);
    expect(tp.nearest(near, 1.5)).toBe(tp.list[0]);
    tp.tip(tp.list[0]);
    expect(tp.nearest(near, 1.5)).toBe(null);
  });

  it('tip returns true once then false, and topples over time', () => {
    const tp = createTippables(scene, SPOTS);
    const e = tp.list[0];
    expect(tp.tip(e)).toBe(true);
    expect(tp.tip(e)).toBe(false);
    for (let i = 0; i < 40; i++) tp.update(0.05);
    expect(Math.abs(e.group.rotation.z) + Math.abs(e.group.rotation.x)).toBeGreaterThan(1.2);
  });
});
