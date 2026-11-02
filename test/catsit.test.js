import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat, refitNeck } from '../src/cat/animator.js';

// polish-catlooks (2026-11-02), Task 2: the front sit (requestPet, perch) read
// as a snowman: a round chest ball with stub forelegs stuck on behind and
// under it. The chest is flattened in the sit and the forelegs stand forward
// as straight columns in front of it.

const BREEDS = ['tabby', 'persian', 'd2', 'digit', 'robbie'];
const SITS = ['requestPet', 'perch'];

// The chest's front-most world z (min z over the underside's chest range) in
// the sit at t = 1.3, recorded on the tree before this change (7a84873). The
// same in both sit states. [full, simple].
const CHEST_FRONT_BEFORE = {
  tabby: [-0.460522, -0.458095],
  persian: [-0.483548, -0.481000],
  d2: [-0.529600, -0.526810],
  digit: [-0.377628, -0.375638],
  robbie: [-0.483548, -0.481000],
};

const posed = (breed, state, acc, opts) => {
  const cat = buildCat(breed, acc, opts);
  animateCat(cat, state, 1.3, 0, false);
  cat.updateMatrixWorld(true);
  return cat;
};

const v = new THREE.Vector3();
function chestFront(cat) {
  const u = cat.userData.parts.underside, [a, z] = u.userData.ranges.chest, p = u.geometry.attributes.position;
  let m = Infinity;
  for (let i = a; i < z; i++) m = Math.min(m, v.fromBufferAttribute(p, i).applyMatrix4(u.matrixWorld).z);
  return m;
}

describe('the sit: a flatter chest with forelegs standing in front of it (polish-catlooks Task 2)', () => {
  const CASES = BREEDS.flatMap((b) => SITS.flatMap((s) => [false, true].map((simple) => [b, s, simple])));

  // 2 cm in the cat's own frame (world / cat.scale): Digit (scale 0.82) is
  // judged by her own size, as every other pose test here does.
  it.each(CASES)('%s %s (simple %s): the sit chest is flatter: its front is at least 2 cm nearer the torso than today', (b, s, simple) => {
    const cat = posed(b, s, undefined, { simple });
    const back = (chestFront(cat) - CHEST_FRONT_BEFORE[b][simple ? 1 : 0]) / cat.scale.x;
    expect(back).toBeGreaterThanOrEqual(0.02);
  });

  it.each(CASES)('%s %s (simple %s): the forelegs stand in front of the chest as straight columns', (b, s, simple) => {
    const cat = posed(b, s, undefined, { simple });
    const stand = posed(b, 'follow', undefined, { simple });
    const front = chestFront(cat);
    for (const i of [0, 1]) {
      const leg = cat.userData.parts.legs[i], paw = leg.userData.paw;
      const hip = leg.getWorldPosition(new THREE.Vector3()), pc = paw.getWorldPosition(new THREE.Vector3());
      expect(pc.z, `leg ${i}: paw at or ahead of the chest`).toBeLessThanOrEqual(front + 0.02);
      const d = pc.clone().sub(hip);
      expect(Math.acos(-d.y / d.length()), `leg ${i}: a vertical column`).toBeLessThanOrEqual(0.12);
      const sole = new THREE.Box3().setFromObject(paw).min.y;
      const standSole = new THREE.Box3().setFromObject(stand.userData.parts.legs[i].userData.paw).min.y;
      expect(Math.abs(sole - standSole), `leg ${i}: sole on the ground`).toBeLessThanOrEqual(0.006);
    }
  });

  it.each(BREEDS.flatMap((b) => SITS.map((s) => [b, s])))('%s: leaving the %s restores the underside and front legs exactly', (b, s) => {
    const cat = buildCat(b);
    animateCat(cat, s, 1.3, 0, false);
    animateCat(cat, 'follow', 2.1, 0, false);
    const fresh = buildCat(b);
    animateCat(fresh, 'follow', 2.1, 0, false);
    const u = cat.userData.parts.underside, fu = fresh.userData.parts.underside;
    expect(u.scale.toArray()).toEqual([1, 1, 1]);
    expect(u.position.toArray()).toEqual(fu.position.toArray());
    for (const i of [0, 1]) {
      const leg = cat.userData.parts.legs[i], f = fresh.userData.parts.legs[i];
      expect(leg.position.toArray()).toEqual(f.position.toArray());
      expect(leg.rotation.toArray()).toEqual(f.rotation.toArray());
      expect(leg.scale.toArray()).toEqual(f.scale.toArray());
    }
  });

  // keepChestUnderHead with a flattened underside: the chest centre lands
  // where the unscaled underside put it, with and without a yawed torso.
  it.each([['perch'], ['cross']])('a flattened underside keeps its chest centre put (%s)', (state) => {
    const cat = buildCat('tabby');
    animateCat(cat, state, 1.3, 0, false);
    const u = cat.userData.parts.underside;
    const centre = () => { cat.updateMatrixWorld(true); return new THREE.Vector3().fromArray(u.userData.chestCentre).applyMatrix4(u.matrixWorld); };
    u.scale.set(1, 1, 1); refitNeck(cat, state);
    const flat = centre();
    u.scale.set(1, 1, 0.75); refitNeck(cat, state);
    const flatK = centre();
    expect(flatK.distanceTo(flat)).toBeLessThan(1e-9);
  });

  // A dressed sit keeps neck items where they were on the chest. In the sit the
  // neck items ride the head (not COLLAR_ON_NECK), which is lifted over a torso
  // tipped nose-down: measured before this change, a bowtie in the perch already
  // sits 12-13 cm in front of the fur under the chin, and a necktie's nearest
  // point is 3.3-3.5 cm off it, so the brief's absolute "within 1.5 cm" does not
  // hold on the tree before the change. What this change must not do is make
  // either worse: per item, rays from the front at each vertex's (x, y) hit the
  // fur (body + underside) at h; `near` = min |h - z| (how far the closest
  // point is off the fur), `stand` = max (h - z) (how far the item stands out
  // of it). Recorded before the change (7a84873): no further off by more than
  // 5 mm, no deeper in by more than 5 mm.
  const NECK_BEFORE = {
    tabby: { necktie: { near: 0.0334, stand: 0.2437 }, bowtie: { near: 0.1252, stand: 0.3291 } },
    persian: { necktie: { near: 0.0351, stand: 0.2559 }, bowtie: { near: 0.1314, stand: 0.3455 } },
  };
  function neckFit(cat) {
    const { body, head } = cat.userData.parts, rc = new THREE.Raycaster(), p0 = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, 1);
    let near = Infinity, stand = -Infinity;
    for (const item of head.userData.neckwear) item.traverse((m) => {
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        rc.set(p0.set(v.x, v.y, -2), dir);
        const h = rc.intersectObject(body, true)[0];
        if (!h) continue;
        const g = h.point.z - v.z;
        near = Math.min(near, Math.abs(g));
        stand = Math.max(stand, g);
      }
    });
    return { near, stand };
  }
  it.each(['tabby', 'persian'].flatMap((b) => ['necktie', 'bowtie'].map((id) => [b, id])))('%s: a dressed sit keeps the %s on the chest', (b, id) => {
    const fit = neckFit(posed(b, 'perch', { neck: id }));
    const was = NECK_BEFORE[b][id];
    expect(fit.near, 'floats further off the fur').toBeLessThanOrEqual(was.near + 0.005);
    expect(fit.stand, 'sinks deeper into the fur').toBeGreaterThanOrEqual(was.stand - 0.005);
  }, 120_000);
});
