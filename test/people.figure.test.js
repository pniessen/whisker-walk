import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { buildSpot, PERSON_REAL_DRAWS } from '../src/people/figure.js';
import { JOINTS } from '../src/people/parts.js';
import { spotKind } from '../src/people/look.js';

const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true });
// the spot's own hash decides what stands on it, so find one of each
function spotOf(kind) {
  for (let x = 0; x < 200; x++) if (spotKind({ x, z: 4 }) === kind) return { x, z: 4 };
  throw new Error('no spot');
}
const adultSpot = spotOf('adult');
const childSpot = spotOf('child');

function countDraws(fn) {
  const real = Math.random;
  let n = 0;
  Math.random = () => { n++; return real(); };
  try { fn(); } finally { Math.random = real; }
  return n;
}

describe('people figure', () => {
  it('takes exactly 36 real draws', () => {
    expect(PERSON_REAL_DRAWS).toBe(36);
    // the caller's shared material is made outside the count, as in the game
    const m = mat();
    expect(countDraws(() => buildSpot(adultSpot, { material: m }))).toBe(36);
    let r;
    expect(countDraws(() => { r = buildSpot(childSpot, { material: m }); })).toBe(36);
    expect(r.pair).toBe(true);
    expect(r.people).toHaveLength(2);
    expect(r.people[0].look.kind).toBe('adult');
    expect(r.people[1].look.kind).toBe('child');
  });

  it('no draw at first render: the bone texture exists', () => {
    const { people, pair } = buildSpot(adultSpot, { material: mat() });
    expect(pair).toBe(false);
    expect(people).toHaveLength(1);
    expect(people[0].skeleton.boneTexture).not.toBeNull();
    expect(people[0].bones.root.parent).toBe(people[0].figure);
  });

  it('built far, swaps near', () => {
    const [p] = buildSpot(adultSpot, { material: mat() }).people;
    expect(p.detail).toBe('far');
    expect(p.mesh.geometry).toBe(p.geometries.far);
    p.setDetail('near');
    expect(p.detail).toBe('near');
    expect(p.mesh.geometry).toBe(p.geometries.near);
    expect(p.stats.nearTris).toBeGreaterThan(p.stats.farTris);
    expect(p.stats.joints).toBe(20);
    expect(p.inView).toBe(false);
  });

  it('target buffers start at rest; bones carry rest and euler orders', () => {
    const [p] = buildSpot(adultSpot, { material: mat() }).people;
    expect(p.target.rot).toHaveLength(60);
    expect(p.target.pelvis).toHaveLength(3);
    expect(p.target.rot.every((v) => v === 0)).toBe(true);
    for (const n of ['pelvis', 'chest', 'neck', 'head']) expect(p.bones[n].rotation.order).toBe('YXZ');
    expect(p.skeleton.bones.map((b) => b.name)).toEqual([...JOINTS]);
    expect(p.rest.pelvis).toBeInstanceOf(THREE.Vector3);
    expect(p.bones.pelvis.position.y).toBeCloseTo(p.rest.pelvis.y, 6);
  });

  it('bounding sphere fixed', () => {
    const [p] = buildSpot(adultSpot, { material: mat() }).people;
    const H = p.look.height;
    const bs = p.mesh.boundingSphere;
    expect(bs.center.toArray()).toEqual([0, H / 2, 0]);
    expect(bs.radius).toBeCloseTo(0.75 * H, 6);
    const before = bs.clone();
    p.bones.upperArmR.rotation.set(0, 0, 2.5);
    p.bones.forearmR.rotation.set(1, 0, 0);
    p.figure.updateMatrixWorld(true);
    p.skeleton.update();
    expect(p.mesh.boundingSphere.center.equals(before.center)).toBe(true);
    expect(p.mesh.boundingSphere.radius).toBe(before.radius);
  });

  it('same spot, same vertices', () => {
    const a = buildSpot(adultSpot, { material: mat() }).people[0];
    const b = buildSpot(adultSpot, { material: mat() }).people[0];
    for (const d of ['near', 'far']) {
      expect(Array.from(a.geometries[d].getAttribute('position').array))
        .toEqual(Array.from(b.geometries[d].getAttribute('position').array));
    }
    expect(a.figure.uuid).toBe(b.figure.uuid);
  });

  it('dispose frees', () => {
    const [p] = buildSpot(adultSpot, { material: mat() }).people;
    const sn = vi.spyOn(p.geometries.near, 'dispose');
    const sf = vi.spyOn(p.geometries.far, 'dispose');
    const st = vi.spyOn(p.skeleton.boneTexture, 'dispose');
    const ss = vi.spyOn(p.skeleton, 'dispose');
    p.dispose();
    expect(sn).toHaveBeenCalledTimes(1);
    expect(sf).toHaveBeenCalledTimes(1);
    expect(ss).toHaveBeenCalledTimes(1);
    expect(st).toHaveBeenCalledTimes(1);
  });
});
