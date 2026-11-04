import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCritters } from '../src/critters.js';
import { mulberry32 } from '../src/rng.js';

const MATH_RANDOM_CALLS = 332; // measured on main before the change

const fireflyGroup = () => {
  const c = createCritters(new THREE.Scene(), [], { spawnFireflies: true, rng: mulberry32(1) });
  return c.list.find((x) => x.type === 'firefly').group;
};

describe('fireflies glow', () => {
  it('keeps three meshes: two dark wings and a glow', () => {
    const g = fireflyGroup();
    expect(g.children).toHaveLength(3);
    expect(g.children[0].material.color.getHex()).toBe(0x4a3a26);
    expect(g.children[1].material.color.getHex()).toBe(0x4a3a26);
  });
  it('the glow is an unlit, untonemapped, over-bright sphere', () => {
    const glow = fireflyGroup().children[2];
    expect(glow.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(glow.material.toneMapped).toBe(false);
    expect(glow.material.fog).toBe(true);
    expect(glow.material.color.r).toBeCloseTo(2.2, 5);
    expect(glow.material.color.g).toBeCloseTo(2.4, 5);
    expect(glow.material.color.b).toBeCloseTo(0.9, 5);
    expect(glow.geometry.parameters.radius).toBe(0.05);
    expect(glow.geometry.parameters.widthSegments).toBe(6);
    expect(glow.geometry.parameters.heightSegments).toBe(5);
  });
  it('butterflies are unchanged', () => {
    const c = createCritters(new THREE.Scene(), [], { rng: mulberry32(1) });
    const b = c.list.find((x) => x.type === 'butterfly');
    if (b) {
      expect(b.group.children).toHaveLength(2);
      expect(b.group.children[0].material.color.getHex()).toBe(0xe070b0);
    }
  });
  it('draws the same number of Math.random values as before', () => {
    const spy = vi.spyOn(Math, 'random');
    createCritters(new THREE.Scene(), [], { spawnFireflies: true, rng: mulberry32(1) });
    const n = spy.mock.calls.length;
    spy.mockRestore();
    expect(n).toBe(MATH_RANDOM_CALLS);
  });
});
