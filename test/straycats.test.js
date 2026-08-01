import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createStrayCats } from '../src/straycats.js';

function fakeScene() {
  const objects = new Set();
  return {
    objects,
    add: (o) => objects.add(o),
    remove: (o) => objects.delete(o),
  };
}

const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };

describe('createStrayCats', () => {
  it('spawns the requested number of strays inside the area bounds', () => {
    const scene = fakeScene();
    const strays = createStrayCats(scene, AREA, 3);
    expect(strays.strays).toHaveLength(3);
    expect(scene.objects.size).toBe(3);
    for (const s of strays.strays) {
      expect(s.group.position.x).toBeGreaterThanOrEqual(AREA.bounds.minX);
      expect(s.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
    }
  });

  it('wanders without leaving bounds or crashing over many frames', () => {
    const strays = createStrayCats(fakeScene(), AREA, 3);
    for (let i = 0; i < 600; i++) strays.update(0.05, i * 0.05);
    for (const s of strays.strays) {
      expect(s.group.position.x).toBeGreaterThanOrEqual(AREA.bounds.minX);
      expect(s.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
      expect(s.group.position.z).toBeGreaterThanOrEqual(AREA.bounds.minZ);
      expect(s.group.position.z).toBeLessThanOrEqual(AREA.bounds.maxZ);
      expect(Number.isFinite(s.group.position.x)).toBe(true);
    }
  });

  it('nearest finds a stray within range and ignores ones beyond it', () => {
    const strays = createStrayCats(fakeScene(), AREA, 1);
    const s = strays.strays[0];
    const near = s.group.position.clone().add(new THREE.Vector3(1, 0, 0));
    expect(strays.nearest(near, 2.5)).toBe(s);
    const far = s.group.position.clone().add(new THREE.Vector3(30, 0, 0));
    expect(strays.nearest(far, 2.5)).toBe(null);
  });

  it('nearest with ungreetedOnly skips a closer greeted stray in favor of an ungreeted one', () => {
    const strays = createStrayCats(fakeScene(), AREA, 2);
    const [a, b] = strays.strays;
    a.group.position.set(0, 0, 0);
    b.group.position.set(0, 0, 1);
    const playerPos = new THREE.Vector3(0, 0, -0.5); // a is closer than b
    strays.greet(a, playerPos);
    expect(strays.nearest(playerPos, 2.5)).toBe(a);
    expect(strays.nearest(playerPos, 2.5, { ungreetedOnly: true })).toBe(b);
  });

  it('greet turns the stray toward the greeter, marks it greeted, and later resumes wandering', () => {
    const strays = createStrayCats(fakeScene(), AREA, 1);
    const s = strays.strays[0];
    strays.greet(s, s.group.position.clone().add(new THREE.Vector3(0, 0, 5)));
    expect(s.state).toBe('greet');
    expect(s.greeted).toBe(true);
    for (let i = 0; i < 100; i++) strays.update(0.05, i * 0.05);
    expect(s.state).not.toBe('greet');
    expect(s.greeted).toBe(true); // stays greeted for the rest of the walk
  });

  it('dispose removes all strays from the scene', () => {
    const scene = fakeScene();
    const strays = createStrayCats(scene, AREA, 3);
    strays.dispose();
    expect(scene.objects.size).toBe(0);
  });
});
