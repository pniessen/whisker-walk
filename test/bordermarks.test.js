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
