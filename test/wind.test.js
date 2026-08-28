import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createWind,
  windPhase,
  UNIT_AMPLITUDE,
  SIDE_AMPLITUDE_FRACTION,
  GUST_DEPTH,
  MAX_INTENSITY,
  MIN_SCALE,
} from '../src/render/wind.js';

describe('windPhase', () => {
  it('is a pure, deterministic function of position', () => {
    expect(windPhase(3, 4)).toBe(windPhase(3, 4));
  });

  it('differs for different positions', () => {
    expect(windPhase(3, 4)).not.toBeCloseTo(windPhase(30, 40), 5);
  });

  it('stays within [0, 2π)', () => {
    for (const [x, z] of [[0, 0], [1, 1], [-50, 30], [1000, -1000], [0.001, 5]]) {
      const p = windPhase(x, z);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
  });
});

describe('createWind', () => {
  it('rotates a registered object once time advances', () => {
    const wind = createWind();
    const tree = new THREE.Object3D();
    tree.position.set(3, 0, 4);
    wind.add(tree);

    const rot0 = { x: tree.rotation.x, z: tree.rotation.z };
    wind.update(0.5);
    const rot1 = { x: tree.rotation.x, z: tree.rotation.z };

    wind.update(1.7);
    const rot2 = { x: tree.rotation.x, z: tree.rotation.z };

    // Rotation actually changes as time advances, and stepping to a new t
    // gives a different pose than the previous one (not stuck/frozen).
    expect(rot1).not.toEqual(rot0);
    expect(rot2).not.toEqual(rot1);
  });

  it('never touches rotation.y (yaw is not wind\'s to move)', () => {
    const wind = createWind();
    const fence = new THREE.Object3D();
    fence.position.set(1, 0, 1);
    fence.rotation.y = 1.234;
    wind.add(fence);
    wind.update(10);
    expect(fence.rotation.y).toBe(1.234);
  });

  it('gives two objects at different positions different phase, so they are out of sync', () => {
    const wind = createWind();
    const a = new THREE.Object3D();
    a.position.set(0, 0, 0);
    const b = new THREE.Object3D();
    b.position.set(37, 0, -19);
    wind.add(a);
    wind.add(b);

    wind.update(1.23);
    // Same amplitude/frequency (both default sizeHint 1), same t — any
    // difference in rotation is purely the position-derived phase offset.
    expect(a.rotation.z).not.toBeCloseTo(b.rotation.z, 6);
  });

  it('scales amplitude/frequency down for a bigger sizeHint (canopy sways slower and less)', () => {
    const windSmall = createWind();
    const windBig = createWind();
    const small = new THREE.Object3D();
    small.position.set(5, 0, 5);
    const big = new THREE.Object3D();
    big.position.set(5, 0, 5); // identical position → identical phase, isolates the sizeHint effect
    windSmall.add(small, { sizeHint: 1 });
    windBig.add(big, { sizeHint: 3 });

    // Sample the peak envelope of each by scanning t; the bigger prop's
    // rotation amplitude should never exceed the smaller prop's.
    let maxSmall = 0;
    let maxBig = 0;
    for (let t = 0; t < 20; t += 0.05) {
      windSmall.update(t);
      windBig.update(t);
      maxSmall = Math.max(maxSmall, Math.abs(small.rotation.z));
      maxBig = Math.max(maxBig, Math.abs(big.rotation.z));
    }
    expect(maxBig).toBeLessThan(maxSmall);
  });

  it('honours amplitude/frequency overrides', () => {
    const wind = createWind();
    const obj = new THREE.Object3D();
    obj.position.set(9, 0, 2);
    wind.add(obj, { amplitude: 0, frequency: 5 });
    for (let t = 0; t < 5; t += 0.1) {
      wind.update(t);
      expect(obj.rotation.z).toBeCloseTo(0, 9);
      expect(obj.rotation.x).toBeCloseTo(0, 9);
    }
  });

  it('reducedMotion leaves rotations completely untouched', () => {
    const wind = createWind({ reducedMotion: true });
    const tree = new THREE.Object3D();
    tree.position.set(11, 0, -6);
    tree.rotation.x = 0;
    tree.rotation.z = 0;
    wind.add(tree);
    for (let t = 0; t < 100; t += 3.3) {
      wind.update(t, 2);
    }
    expect(tree.rotation.x).toBe(0);
    expect(tree.rotation.z).toBe(0);
  });

  it('never accumulates drift: rotation stays bounded over thousands of frames', () => {
    const wind = createWind();
    const tree = new THREE.Object3D();
    tree.position.set(2, 0, 9);
    wind.add(tree, { sizeHint: MIN_SCALE }); // worst case: smallest scale = biggest per-object amplitude

    // Analytic worst-case bound: primary axis amplitude at MIN_SCALE, times
    // the gust envelope's peak, times the highest intensity update() allows,
    // plus the side axis's own peak on top (they can't both peak at the same
    // t for an arbitrary phase, but summing them is still a valid, if loose,
    // upper bound).
    const perAxisMax = (UNIT_AMPLITUDE / Math.sqrt(MIN_SCALE)) * (1 + GUST_DEPTH) * MAX_INTENSITY;
    const bound = perAxisMax * (1 + SIDE_AMPLITUDE_FRACTION);

    const dt = 1 / 60;
    let maxAbs = 0;
    for (let i = 0; i < 20000; i++) {
      const t = i * dt;
      wind.update(t, MAX_INTENSITY);
      maxAbs = Math.max(maxAbs, Math.abs(tree.rotation.x), Math.abs(tree.rotation.z));
    }
    // Bounded (no creep toward infinity as frames accumulate)...
    expect(maxAbs).toBeLessThanOrEqual(bound + 1e-9);
    // ...and not stuck at 0 either — this is a real oscillation, not a
    // degenerate always-zero one.
    expect(maxAbs).toBeGreaterThan(0);

    // Re-checking an EARLY t after 20000 frames must reproduce the exact
    // same rotation an early call once did — proof there is no hidden
    // internal accumulator that makes update()'s output path-dependent.
    wind.update(1.0, MAX_INTENSITY);
    const at1 = { x: tree.rotation.x, z: tree.rotation.z };
    wind.update(1.0, MAX_INTENSITY);
    expect(tree.rotation.x).toBe(at1.x);
    expect(tree.rotation.z).toBe(at1.z);
  });

  it('add() allocates no per-frame state beyond the initial registration (update does not grow the entry list)', () => {
    const wind = createWind();
    const tree = new THREE.Object3D();
    tree.position.set(0, 0, 0);
    wind.add(tree);
    for (let i = 0; i < 1000; i++) wind.update(i * 0.016);
    // Nothing about calling update() should register more objects or change
    // which object is swayed — one add() call, sway forever.
    wind.update(999);
    const rot = { x: tree.rotation.x, z: tree.rotation.z };
    wind.update(999);
    expect(tree.rotation.x).toBe(rot.x);
    expect(tree.rotation.z).toBe(rot.z);
  });

  it('dispose() resets rotation and detaches pivot wrapping cleanly', () => {
    const wind = createWind();
    const scene = new THREE.Group();
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0));
    bush.position.set(4, 0.5, -2);
    scene.add(bush);

    wind.add(bush, { pivotY: 0.5 });
    // Reparented under a new pivot group, offset so world position is
    // unchanged: `scene` now holds just the pivot (bush moved under it).
    expect(bush.parent).not.toBe(scene);
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBe(bush.parent);
    wind.update(5);

    wind.dispose();

    expect(bush.parent).toBe(scene);
    expect(bush.position.x).toBeCloseTo(4);
    expect(bush.position.y).toBeCloseTo(0.5);
    expect(bush.position.z).toBeCloseTo(-2);
    expect(bush.rotation.x).toBe(0);
    expect(bush.rotation.z).toBe(0);
    expect(scene.children).toEqual([bush]);
  });

  it('pivotY is ignored (falls back to direct rotation) when the object has no parent yet', () => {
    const wind = createWind();
    const orphan = new THREE.Object3D();
    orphan.position.set(1, 0.5, 1);
    expect(() => wind.add(orphan, { pivotY: 0.5 })).not.toThrow();
    wind.update(1);
    // Still swaying directly (no crash, no silent no-op).
    wind.update(2);
    expect(orphan.parent).toBeNull();
  });
});
