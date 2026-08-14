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
