import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFx } from '../src/fx.js';

const fakeScene = () => ({ children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter((c) => c !== o); } });
const fakeText = () => new THREE.Object3D();

describe('createFx', () => {
  it('popup lives ~1.1s, rises, then is removed from the scene', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    fx.popup(new THREE.Vector3(1, 0, 2), '+5');
    expect(fx.active()).toBe(1);
    const before = scene.children[0].position.y;
    fx.update(0.5);
    expect(scene.children[0].position.y).toBeGreaterThan(before);
    fx.update(1.0);
    expect(fx.active()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
  it('burst spawns count particles that die within a second', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    fx.burst(new THREE.Vector3(0, 0, 0), 0xffffff, 8);
    expect(fx.active()).toBe(1); // one Points object
    fx.update(1.0);
    expect(fx.active()).toBe(0);
  });
  it('reducedMotion drops bursts but keeps popups', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { reducedMotion: true, makeText: fakeText });
    fx.burst(new THREE.Vector3(), 0xffffff);
    expect(fx.active()).toBe(0);
    fx.popup(new THREE.Vector3(), '+5');
    expect(fx.active()).toBe(1);
  });
});

// v18 Whisker Sense — shimmer is burst's particle machinery retuned to hang
// in the air instead of exploding and dropping.
describe('createFx.shimmer (v18 Whisker Sense)', () => {
  it('lives longer than a burst and falls far more slowly', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    fx.burst(new THREE.Vector3(), 0xf2c14e, 8);
    fx.shimmer(new THREE.Vector3(), 0xf2c14e, 8);
    expect(fx.active()).toBe(2);
    const burstPts = scene.children[0];
    const shimmerPts = scene.children[1];
    fx.update(0.5);
    const burstY = burstPts.geometry.attributes.position.array[1];
    const shimmerY = shimmerPts.geometry.attributes.position.array[1];
    expect(shimmerY).toBeGreaterThan(burstY); // less gravity, still rising
    fx.update(0.3); // 0.8s total — past a burst's 0.7 ttl, inside shimmer's 1.6
    expect(fx.active()).toBe(1);
    fx.update(1.0);
    expect(fx.active()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it('shares burst\'s reducedMotion gate — no particles, so the ping carries it', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { reducedMotion: true, makeText: fakeText });
    fx.shimmer(new THREE.Vector3(), 0xf2c14e, 8);
    expect(fx.active()).toBe(0);
  });

  it('leaves burst behaving exactly as before (0.7s ttl, gravity 3)', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    fx.burst(new THREE.Vector3(), 0xffffff, 6);
    fx.update(0.69);
    expect(fx.active()).toBe(1);
    fx.update(0.02);
    expect(fx.active()).toBe(0);
  });
});
