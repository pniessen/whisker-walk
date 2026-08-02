import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { rollGhosts, createGhosts } from '../src/ghosts.js';

// a fake rng that replays a fixed queue of values, then falls back to a
// constant — lets tests pin exactly which roll each friend gets without
// depending on Math.random.
function queueRng(values, fallback = 0) {
  const q = values.slice();
  return () => (q.length ? q.shift() : fallback);
}

function friend(playerId, greets) {
  return { playerId, greets, profile: { pet_name: `Cat-${playerId}`, breed: 'tabby' } };
}

describe('rollGhosts', () => {
  it('includes a friend whose roll lands just under the 1/3 threshold, excludes one just over it', () => {
    const friends = [friend('a', 3), friend('b', 3)];
    const rng = queueRng([0.32, 0.34]);
    const chosen = rollGhosts(rng, friends);
    expect(chosen.map((f) => f.playerId)).toEqual(['a']);
  });

  it('caps the result at 4 ghosts even with more eligible friends rolling success', () => {
    const friends = Array.from({ length: 10 }, (_, i) => friend(`p${i}`, 3));
    const rng = () => 0; // always succeeds
    const chosen = rollGhosts(rng, friends);
    expect(chosen).toHaveLength(4);
  });

  it('returns an empty array for an empty friends list', () => {
    const rng = () => 0;
    expect(rollGhosts(rng, [])).toEqual([]);
  });

  it('excludes friends with fewer than 1 greet even if their roll would succeed', () => {
    const friends = [friend('a', 0), friend('b', 1)];
    const rng = () => 0; // always succeeds
    const chosen = rollGhosts(rng, friends);
    expect(chosen.map((f) => f.playerId)).toEqual(['b']);
  });

  it('is deterministic: the same rng sequence and friends produce the same result', () => {
    const friends = [friend('a', 5), friend('b', 2), friend('c', 1), friend('d', 4)];
    const values = [0.1, 0.5, 0.2, 0.9];
    const first = rollGhosts(queueRng(values), friends);
    const second = rollGhosts(queueRng(values), friends);
    expect(first.map((f) => f.playerId)).toEqual(second.map((f) => f.playerId));
    expect(first.map((f) => f.playerId)).toEqual(['a', 'c']);
  });
});

function fakeScene() {
  const objects = new Set();
  return {
    objects,
    add: (o) => objects.add(o),
    remove: (o) => objects.delete(o),
  };
}

const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };

function profile(playerId, overrides = {}) {
  return {
    playerId,
    petName: `Ghost-${playerId}`,
    breed: 'tabby',
    accessories: { collar: null, outfit: null },
    greets: 3,
    ...overrides,
  };
}

describe('createGhosts', () => {
  it('spawns one translucent group per profile, inside the area bounds', () => {
    const scene = fakeScene();
    const ghosts = createGhosts(scene, AREA, [profile('a'), profile('b')], () => 0.5);
    expect(ghosts.list).toHaveLength(2);
    expect(scene.objects.size).toBe(2);
    for (const g of ghosts.list) {
      expect(g.group.position.x).toBeGreaterThanOrEqual(AREA.bounds.minX);
      expect(g.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
      let sawMaterial = false;
      g.group.traverse((obj) => {
        if (!obj.material) return;
        sawMaterial = true;
        expect(obj.material.transparent).toBe(true);
        expect(obj.material.opacity).toBe(0.5);
      });
      expect(sawMaterial).toBe(true);
    }
  });

  it('falls back to a safe breed and petName for untrusted/malformed profile data', () => {
    const scene = fakeScene();
    const ghosts = createGhosts(scene, AREA, [
      profile('a', { breed: 'not-a-real-breed', petName: '<script>evil()</script>', accessories: null }),
    ], () => 0.5);
    const g = ghosts.list[0];
    expect(g.breed).toBe('tabby');
    expect(g.petName).not.toContain('<script>');
  });

  it('nearest finds an ungreeted ghost within range and excludes one once greeted', () => {
    const scene = fakeScene();
    const ghosts = createGhosts(scene, AREA, [profile('a')], () => 0.5);
    const g = ghosts.list[0];
    const near = g.group.position.clone().add(new THREE.Vector3(1, 0, 0));
    expect(ghosts.nearest(near, 2.5)).toBe(g);
    ghosts.greet(g, near);
    expect(g.greeted).toBe(true);
    expect(ghosts.nearest(near, 2.5)).toBe(null);
  });

  it('update() wanders without leaving bounds or producing non-finite positions', () => {
    const scene = fakeScene();
    const ghosts = createGhosts(scene, AREA, [profile('a'), profile('b')], Math.random);
    for (let i = 0; i < 600; i++) ghosts.update(0.05, i * 0.05);
    for (const g of ghosts.list) {
      expect(g.group.position.x).toBeGreaterThanOrEqual(AREA.bounds.minX);
      expect(g.group.position.x).toBeLessThanOrEqual(AREA.bounds.maxX);
      expect(g.group.position.z).toBeGreaterThanOrEqual(AREA.bounds.minZ);
      expect(g.group.position.z).toBeLessThanOrEqual(AREA.bounds.maxZ);
      expect(Number.isFinite(g.group.position.x)).toBe(true);
      expect(Number.isFinite(g.group.position.z)).toBe(true);
    }
  });

  it('dispose removes every ghost group from the scene', () => {
    const scene = fakeScene();
    const ghosts = createGhosts(scene, AREA, [profile('a'), profile('b')], () => 0.5);
    expect(scene.objects.size).toBe(2);
    ghosts.dispose();
    expect(scene.objects.size).toBe(0);
  });

  it('only rolls a gift for best-friend (greets >= 6) profiles', () => {
    const scene = fakeScene();
    const ghosts = createGhosts(scene, AREA, [
      profile('a', { greets: 6 }),
      profile('b', { greets: 3 }),
    ], () => 0); // always-succeed rng — gift roll would hit if eligible
    const [a, b] = ghosts.list;
    expect(a.hasGift).toBe(true);
    expect(b.hasGift).toBe(false);
  });
});
