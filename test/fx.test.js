import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFx, FLOATER_MAX_SCREEN } from '../src/fx.js';
import { closeDiffs } from './helpers/closeto.js';

const fakeScene = () => ({ children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter((c) => c !== o); } });
const fakeText = () => new THREE.Object3D();
// What the fx spawned: the scene less the pooled slash mesh built with them.
const spawned = (scene) => scene.children.filter((c) => c.name !== 'fight-slash');

describe('createFx', () => {
  it('popup lives ~1.1s, rises, then is removed from the scene', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    fx.popup(new THREE.Vector3(1, 0, 2), '+5');
    expect(fx.active()).toBe(1);
    const before = spawned(scene)[0].position.y;
    fx.update(0.5);
    expect(spawned(scene)[0].position.y).toBeGreaterThan(before);
    fx.update(1.0);
    expect(fx.active()).toBe(0);
    expect(spawned(scene)).toHaveLength(0);
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
    const burstPts = spawned(scene)[0];
    const shimmerPts = spawned(scene)[1];
    fx.update(0.5);
    const burstY = burstPts.geometry.attributes.position.array[1];
    const shimmerY = shimmerPts.geometry.attributes.position.array[1];
    expect(shimmerY).toBeGreaterThan(burstY); // less gravity, still rising
    fx.update(0.3); // 0.8s total — past a burst's 0.7 ttl, inside shimmer's 1.6
    expect(fx.active()).toBe(1);
    fx.update(1.0);
    expect(fx.active()).toBe(0);
    expect(spawned(scene)).toHaveLength(0);
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

// Fight moves and scars (Task 6): the scratch's slash is one pooled mesh,
// built hidden with the fx so it never allocates mid-fight.
describe('createFx.slash', () => {
  const slashes = (scene) => scene.children.filter((c) => c.name === 'fight-slash');

  it('one mesh for every slash, built with the fx; a second slash restarts it', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    expect(slashes(scene)).toHaveLength(1);
    const mesh = slashes(scene)[0];
    fx.update(1 / 60);
    fx.update(1 / 60);
    expect(mesh.visible).toBe(false);
    fx.slash({ x: 1, y: 0.4, z: 2 }, 0.5);
    expect(mesh.visible).toBe(true);
    expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([1, 0.4, 2]);
    expect(mesh.rotation.y).toBe(0.5);
    fx.update(0.2);
    fx.slash({ x: -1, y: 0.3, z: 0 }, -0.5);
    expect(slashes(scene)).toHaveLength(1);
    expect(mesh.position.x).toBe(-1);
    expect(mesh.material.opacity).toBe(1);
    fx.update(0.2);
    expect(mesh.visible).toBe(true); // restarted: 0.2 s into its 0.3
    fx.update(0.11);
    expect(mesh.visible).toBe(false);
    expect(fx.active()).toBe(0);
    expect(mesh.castShadow).toBe(false);
  });

  it('draws over the cats it sits in: no depth test, drawn after them (final review 2)', () => {
    const scene = fakeScene();
    createFx(scene, { makeText: fakeText });
    const m = slashes(scene)[0];
    // It spawns inside the scratched cat's head and chest, so with a depth
    // test almost none of it showed (0-3 of 12 vertices live).
    expect(m.material.depthTest).toBe(false);
    expect(m.material.depthWrite).toBe(false);
    expect(m.material.transparent).toBe(true);
    // After the other transparent things (it is drawn in the transparent
    // pass, after every opaque cat), under the name tags and bubbles (10).
    expect(m.renderOrder).toBeGreaterThan(0);
    expect(m.renderOrder).toBeLessThan(10);
  });

  it('fades out over 0.3 s, three strokes in one draw', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: fakeText });
    const mesh = slashes(scene)[0];
    fx.slash({ x: 0, y: 0.4, z: 0 }, 0);
    const ops = [];
    for (let i = 0; i < 17; i++) { fx.update(1 / 60); ops.push(mesh.material.opacity); }
    for (let i = 1; i < ops.length; i++) expect(ops[i]).toBeLessThanOrEqual(ops[i - 1]);
    expect(mesh.visible).toBe(true);
    fx.update(0.03);
    expect(mesh.visible).toBe(false);
    expect(mesh.isMesh).toBe(true);
    expect(mesh.geometry.getAttribute('position').count).toBe(3 * 4);
  });

  it('nothing under reduced motion, and dispose frees it', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { reducedMotion: true, makeText: fakeText });
    fx.update(1 / 60);
    fx.update(1 / 60);
    fx.slash({ x: 0, y: 0.4, z: 0 }, 0);
    expect(slashes(scene).every((m) => !m.visible)).toBe(true);
    const calm = createFx(fakeScene(), { makeText: fakeText });
    expect(() => calm.dispose()).not.toThrow();
    const s2 = fakeScene();
    const fx2 = createFx(s2, { makeText: fakeText });
    fx2.dispose();
    expect(slashes(s2)).toHaveLength(0);
  });
});

// polish-floaters: score floaters that land together stay readable.
describe('createFx.popup — merging and stacking', () => {
  const textOf = () => {
    const made = [];
    const mk = (t) => { const o = new THREE.Object3D(); o.userData.text = t; o.material = { opacity: 1, dispose() { o.disposed = true; } }; made.push(o); return o; };
    return { made, mk };
  };
  const critter = (fx, at, v = 5) => fx.popup(at, `+${v} 🐾`, { merge: 'critter', value: v, mergeText: (n) => `+${n} 🐾` });

  it('folds back-to-back critters into one floater with their total', () => {
    const scene = fakeScene();
    const { made, mk } = textOf();
    const fx = createFx(scene, { makeText: mk });
    const at = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 4; i++) { critter(fx, at); fx.update(0.35); }
    expect(fx.active()).toBe(1);
    expect(spawned(scene)).toHaveLength(1);
    expect(spawned(scene)[0].userData.text).toBe('+20 🐾');
    // the swapped-out sprites were disposed
    expect(made.slice(0, 3).every((o) => o.disposed)).toBe(true);
  });

  it('a merge restarts the floater\'s clock and pops it from the head again', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: textOf().mk });
    const at = new THREE.Vector3(0, 0, 0);
    critter(fx, at);
    fx.update(1.0); // nearly gone
    critter(fx, at);
    expect(spawned(scene)[0].position.y).toBeCloseTo(1.03, 5);
    fx.update(1.0);
    expect(fx.active()).toBe(1); // still alive: the clock restarted
  });

  it('does not merge across a different floater, or without a key', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: textOf().mk });
    const at = new THREE.Vector3();
    critter(fx, at);
    fx.popup(at, '+12 🐾', { value: 12 });
    critter(fx, at);
    expect(fx.active()).toBe(3);
    fx.popup(at, '+12 🐾', { value: 12 });
    fx.popup(at, '+12 🐾', { value: 12 });
    expect(fx.active()).toBe(5);
  });

  it('floaters spawned in the same instant stack with clear air between them', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: textOf().mk });
    const at = new THREE.Vector3(2, 0, 3);
    fx.popup(at, '+5 🐾', { value: 5 });
    fx.popup(at, '+12 🐾', { value: 12 });
    fx.popup(at, '+8 🐾', { value: 8 });
    const ys = spawned(scene).map((o) => o.position.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(1.03, 5); // the newest sits over the head
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(0.32 - 1e-9);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(0.32 - 1e-9);
  });

  it('leaves a floater alone once it has risen clear', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: textOf().mk });
    const at = new THREE.Vector3();
    fx.popup(at, '+5 🐾', { value: 5 });
    fx.update(0.5); // risen 0.6 m
    const first = spawned(scene)[0];
    const y = first.position.y;
    fx.popup(at, '+12 🐾', { value: 12 });
    expect(first.position.y).toBe(y);
  });
});

describe('createFx.popup — review follow-ups', () => {
  const mk = (t) => { const o = new THREE.Object3D(); o.userData.text = t; return o; };
  it('a merge without mergeText still shows the running total', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: mk });
    fx.popup(new THREE.Vector3(), '+5', { merge: 'k', value: 5 });
    fx.popup(new THREE.Vector3(), '+5', { merge: 'k', value: 5 });
    expect(spawned(scene)[0].userData.text).toBe('+10');
  });
  it('a floater left far behind is not pushed by a new one', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: mk });
    fx.popup(new THREE.Vector3(10, 0, 0), '+5', { value: 5 });
    const far = spawned(scene)[0];
    fx.popup(new THREE.Vector3(0, 0, 0), '+12', { value: 12 });
    expect(far.position.y).toBeCloseTo(1.03, 5);
  });
});

describe('createFx.popup — on-screen size (viewclear2)', () => {
  const sprite = (t) => { const o = new THREE.Sprite(new THREE.SpriteMaterial()); o.scale.set(1.4, 0.35, 1); o.userData.text = t; return o; };
  const camAt = (d) => {
    const c = new THREE.PerspectiveCamera(70, 1.5, 0.1, 300);
    c.position.set(0, 1.03, d); // level with a fresh floater, d metres off
    c.updateMatrixWorld(true);
    return c;
  };
  const sizeOf = (o) => [o.scale.x, o.scale.y, o.scale.z];
  const clampH = (d) => FLOATER_MAX_SCREEN * 2 * Math.tan((35 * Math.PI) / 180) * d;

  it('a camera 5 m away leaves the sprite at 1.4 x 0.35', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: sprite });
    fx.popup(new THREE.Vector3(), '+5', { value: 5 });
    fx.update(0, camAt(5));
    expect(closeDiffs(sizeOf(spawned(scene)[0]), [1.4, 0.35, 1])).toEqual([]);
  });

  it('a camera 1 m away clamps the height, width in proportion', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: sprite });
    fx.popup(new THREE.Vector3(), '+5', { value: 5 });
    fx.update(0, camAt(1));
    const h = clampH(1);
    expect(closeDiffs(sizeOf(spawned(scene)[0]), [h * 4, h, 1])).toEqual([]);
  });

  it('without a camera there is no change', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: sprite });
    fx.popup(new THREE.Vector3(), '+5', { value: 5 });
    fx.update(0.1);
    expect(closeDiffs(sizeOf(spawned(scene)[0]), [1.4, 0.35, 1])).toEqual([]);
  });

  it('a merged popup is clamped too', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: sprite });
    const cam = camAt(1);
    fx.popup(new THREE.Vector3(), '+5', { merge: 'k', value: 5 });
    fx.update(0.05, cam);
    fx.popup(new THREE.Vector3(), '+5', { merge: 'k', value: 5 });
    fx.update(0.05, cam);
    expect(fx.active()).toBe(1);
    const o = spawned(scene)[0];
    const h = clampH(o.position.distanceTo(cam.position)); // it has risen a little since the merge
    expect(closeDiffs(sizeOf(o), [h * 4, h, 1])).toEqual([]);
  });

  it('popup() after a clamped update starts clamped', () => {
    const scene = fakeScene();
    const fx = createFx(scene, { makeText: sprite });
    fx.popup(new THREE.Vector3(), '+5', { value: 5 });
    fx.update(0.01, camAt(1));
    fx.popup(new THREE.Vector3(), '+7', { value: 7 });
    const fresh = spawned(scene)[1];
    const h = clampH(fresh.position.distanceTo(new THREE.Vector3(0, 1.03, 1)));
    expect(fresh.scale.y).toBeLessThan(0.35);
    expect(closeDiffs(sizeOf(fresh), [h * 4, h, 1])).toEqual([]);
  });
});
