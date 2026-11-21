import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createPeopleKit, LOD, lodNearFor, personFor, pose, createGaze } from '../src/people/index.js';
import { spotKind } from '../src/people/look.js';
import { LOW_RUNG } from '../src/render/quality.js';

function spotOf(kind) {
  for (let x = 0; x < 200; x++) if (spotKind({ x, z: 4 }) === kind) return { x, z: 4 };
  throw new Error('no spot');
}
const adultSpot = spotOf('adult');

function makeCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  cam.position.set(0, 0, 0);
  cam.lookAt(0, 0, -10); // looks down -z
  cam.updateMatrixWorld(true);
  return cam;
}
function place(p, x, z) {
  p.figure.position.set(x, 0, z);
  p.figure.updateMatrixWorld(true);
}
function countDraws(fn) {
  const real = Math.random;
  let n = 0;
  Math.random = () => { n++; return real(); };
  try { fn(); } finally { Math.random = real; }
  return n;
}

describe('people kit', () => {
  it('re-exports the public face', () => {
    expect(typeof personFor).toBe('function');
    expect(typeof pose).toBe('function');
    expect(typeof createGaze).toBe('function');
  });

  it('lodNearFor follows the rung', () => {
    expect(LOD).toEqual({ NEAR: 12, NEAR_LOW: 7, HYSTERESIS: 1 });
    expect(lodNearFor(0)).toBe(12);
    expect(lodNearFor(LOW_RUNG - 1)).toBe(12);
    expect(lodNearFor(LOW_RUNG)).toBe(7);
    expect(lodNearFor(LOW_RUNG + 1)).toBe(7);
  });

  it('switch with hysteresis', () => {
    const kit = createPeopleKit({ camera: makeCamera() });
    const [p] = kit.buildSpot(adultSpot).people;
    let d = 20;
    const step = (dist) => { place(p, 0, -dist); kit.update(); };
    step(d);
    expect(p.detail).toBe('far');
    let last = 'far';
    for (d = 20; d >= 0; d -= 0.25) {
      step(d);
      if (d <= 11) expect(p.detail).toBe('near');
      else if (d >= 13) expect(p.detail).toBe('far');
      else expect(p.detail).toBe(last);
      last = p.detail;
    }
    for (d = 0; d <= 20; d += 0.25) {
      step(d);
      if (d <= 11) expect(p.detail).toBe('near');
      else if (d >= 13) expect(p.detail).toBe('far');
      else expect(p.detail).toBe(last);
      last = p.detail;
    }
    kit.dispose();
  });

  it('live rung', () => {
    let near = 12;
    const kit = createPeopleKit({ camera: makeCamera(), lodNear: () => near });
    const [p] = kit.buildSpot(adultSpot).people;
    place(p, 0, -5);
    kit.update();
    place(p, 0, -9);
    kit.update();
    expect(p.detail).toBe('near');
    near = 7;
    kit.update();
    expect(p.detail).toBe('far');
    kit.dispose();
  });

  // (final review, finding 4) the walk moves people's groups and renders
  // after update(): inView must not wait for the render to refresh matrices
  it('in view from where the person is now, the caller not updating matrices', () => {
    const kit = createPeopleKit({ camera: makeCamera() });
    const [p] = kit.buildSpot(adultSpot).people;
    place(p, 0, -6);
    kit.update();
    expect(p.inView).toBe(true);
    p.figure.position.set(0, 0, 6); // behind the camera, no updateMatrixWorld
    kit.update();
    expect(p.inView).toBe(false);
    p.figure.position.set(0, 0, -6);
    kit.update();
    expect(p.inView).toBe(true);
    kit.dispose();
  });

  it('keeps reducedMotion for its callers (they pass it to pose and stepGaze)', () => {
    expect(createPeopleKit({ camera: makeCamera() }).reducedMotion).toBe(false);
    expect(createPeopleKit({ camera: makeCamera(), reducedMotion: true }).reducedMotion).toBe(true);
  });

  it('out of view', () => {
    const kit = createPeopleKit({ camera: makeCamera() });
    const [p] = kit.buildSpot(adultSpot).people;
    place(p, 0, -6);
    kit.update();
    expect(p.inView).toBe(true);
    place(p, 0, 6); // behind the camera
    kit.update();
    expect(p.inView).toBe(false);
    place(p, 80, -6); // far off to the side
    kit.update();
    expect(p.inView).toBe(false);
    kit.dispose();
  });

  it('kit material drawn locally', () => {
    let kit;
    const camera = makeCamera();
    const n = countDraws(() => { kit = createPeopleKit({ camera }); kit.buildSpot(adultSpot); });
    expect(n).toBe(36);
    expect(kit.material.isMeshStandardMaterial).toBe(true);
    expect(kit.material.vertexColors).toBe(true);
    expect(kit.material.roughness).toBeCloseTo(0.86, 6);
    expect(kit.material.flatShading).toBe(false);
    expect(kit.people.length).toBe(1);
    kit.dispose();
  });

  it('dispose', () => {
    const kit = createPeopleKit({ camera: makeCamera() });
    kit.buildSpot(adultSpot);
    kit.buildSpot(spotOf('child'));
    const spies = kit.people.map((p) => vi.spyOn(p, 'dispose'));
    const ms = vi.spyOn(kit.material, 'dispose');
    kit.dispose();
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    expect(ms).toHaveBeenCalledTimes(1);
  });

  it('update allocates nothing', () => {
    const kit = createPeopleKit({ camera: makeCamera() });
    const [p] = kit.buildSpot(adultSpot).people;
    place(p, 0, -8);
    kit.update();
    const spies = [
      vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Matrix4.prototype, 'clone'),
      vi.spyOn(THREE.Quaternion.prototype, 'clone'),
      vi.spyOn(THREE.Sphere.prototype, 'clone'),
    ];
    for (let i = 0; i < 100; i++) { place(p, 0, -8 - (i % 10)); kit.update(); }
    for (const s of spies) expect(s).toHaveBeenCalledTimes(0);
    kit.dispose();
  });
});
