import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createBorderMarks } from '../src/render/bordermarks.js';
import { borderMarks } from '../src/rivalclans.js';

describe('createBorderMarks', () => {
  it('one decal per border mark, added to the scene', () => {
    const scene = new THREE.Scene();
    const api = createBorderMarks(scene, 'park');
    expect(api.list).toHaveLength(borderMarks('park').length);
    expect(scene.children).toHaveLength(api.list.length);
    for (const m of api.list) expect(m.contested).toBe(false);
  });

  it('lays each decal flat just above the ground', () => {
    const api = createBorderMarks(new THREE.Scene(), 'park');
    const m = api.list[0];
    expect(m.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(m.mesh.position.y).toBeGreaterThan(0);
    expect(m.mesh.position.y).toBeLessThan(0.1);
    expect(m.mesh.position.x).toBe(m.x);
    expect(m.mesh.position.z).toBe(m.z);
  });

  it('an unknown area makes nothing and every method is a safe no-op', () => {
    const scene = new THREE.Scene();
    const api = createBorderMarks(scene, 'den');
    expect(api.list).toHaveLength(0);
    expect(() => {
      api.update(1);
      api.setContested(0);
      api.dispose();
      api.dispose();
    }).not.toThrow();
  });

  it('contesting a mark changes it and never removes it', () => {
    const scene = new THREE.Scene();
    const api = createBorderMarks(scene, 'park');
    const before = api.list.length;
    const mat0 = api.list[1].mesh.material;
    api.setContested(0);
    expect(api.list).toHaveLength(before);
    expect(scene.children).toHaveLength(before);
    expect(api.list[0].contested).toBe(true);
    expect(api.list[0].mesh.material).not.toBe(mat0);
    expect(api.list[1].contested).toBe(false);
    expect(api.list[1].mesh.material).toBe(mat0);
  });

  it('the contested option pre-contests those indices', () => {
    const api = createBorderMarks(new THREE.Scene(), 'park', { contested: [2, 5] });
    expect(api.list.filter((m) => m.contested)).toHaveLength(2);
    expect(api.list[2].contested).toBe(true);
    expect(api.list[5].contested).toBe(true);
  });

  it('setContested ignores out-of-range and non-integer indices', () => {
    const api = createBorderMarks(new THREE.Scene(), 'park');
    for (const bad of [-1, 999, 1.5, NaN, undefined, null, '2']) {
      expect(() => api.setContested(bad)).not.toThrow();
    }
    expect(api.list.every((m) => !m.contested)).toBe(true);
  });

  it('maxMarks takes every k-th mark', () => {
    const full = createBorderMarks(new THREE.Scene(), 'park').list.length;
    const api = createBorderMarks(new THREE.Scene(), 'park', { maxMarks: 8 });
    expect(api.list.length).toBeLessThanOrEqual(8);
    expect(api.list.length).toBeGreaterThan(0);
    expect(api.list.length).toBeLessThan(full);
  });

  // The marks are a closed ring, so an evenly spaced subset has a count that
  // divides the full count. maxMarks must give the LARGEST such count that
  // fits: for 12 marks and maxMarks 8 that is 6 (12's divisors <= 8 are 6, 4,
  // 3, 2, 1), not 8. Checked for every maxMarks, against the real ring.
  it.each(Array.from({ length: 14 }, (_, i) => i + 1))('maxMarks %i keeps the largest evenly spaced subset that fits', (max) => {
    const full = createBorderMarks(new THREE.Scene(), 'park').list;
    const n = full.length;
    const best = Math.max(...Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0 && d <= max));
    const kept = createBorderMarks(new THREE.Scene(), 'park', { maxMarks: max }).list;
    expect(kept.length).toBe(best);
    const idx = kept.map((m) => full.findIndex((f) => f.x === m.x && f.z === m.z));
    const step = n / best;
    idx.forEach((v, i) => expect(v).toBe(i * step));
  });

  // Task 12: a saved border mark names its ring index, so the decal it
  // contested is found again on either quality tier.
  it('each decal knows its ring index, on the low tier too', () => {
    const ring = borderMarks('park');
    const full = createBorderMarks(new THREE.Scene(), 'park').list;
    expect(full.map((m) => m.ring)).toEqual(ring.map((_, i) => i));
    const low = createBorderMarks(new THREE.Scene(), 'park', { maxMarks: 8 }).list;
    expect(low).toHaveLength(6);
    expect(low.map((m) => m.ring)).toEqual([0, 2, 4, 6, 8, 10]);
    for (const m of low) {
      expect(m.x).toBe(ring[m.ring].x);
      expect(m.z).toBe(ring[m.ring].z);
    }
  });

  it('update does not throw', () => {
    const api = createBorderMarks(new THREE.Scene(), 'park');
    expect(() => api.update(3.2)).not.toThrow();
  });

  it('dispose empties the scene and disposes every geometry and both materials once', () => {
    const scene = new THREE.Scene();
    const api = createBorderMarks(scene, 'park', { contested: [0] });
    const geoSpies = api.list.map((m) => vi.spyOn(m.mesh.geometry, 'dispose'));
    const normal = api.list[1].mesh.material;
    const contested = api.list[0].mesh.material;
    expect(normal).not.toBe(contested);
    const nSpy = vi.spyOn(normal, 'dispose');
    const cSpy = vi.spyOn(contested, 'dispose');
    api.dispose();
    for (const sp of geoSpies) expect(sp).toHaveBeenCalledTimes(1);
    expect(nSpy).toHaveBeenCalledTimes(1);
    expect(cSpy).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
    api.dispose();
    for (const sp of geoSpies) expect(sp).toHaveBeenCalledTimes(1);
    expect(nSpy).toHaveBeenCalledTimes(1);
    expect(cSpy).toHaveBeenCalledTimes(1);
  });
});

describe("createBorderMarks contested guard", () => {
  it("a null or non-array contested list is treated as none", () => {
    for (const bad of [null, undefined, 3, "x", {}]) {
      const api = createBorderMarks(new THREE.Scene(), "park", { contested: bad });
      expect(api.list.every((m) => !m.contested)).toBe(true);
      api.dispose();
    }
  });
});
