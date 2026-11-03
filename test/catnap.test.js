import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { PRESETS } from './helpers/catfingerprint.js';
import { closeDiffs } from './helpers/closeto.js';

// polish-pose Task 1 (2026-11-02): the napping tail lies flush and curls
// round. Before, the nap lowered the body 10 cm and squashed it, but the tail
// root stayed where the standing cat carries it (~12 cm over the lowered rump)
// and the chain stuck straight out sideways in the air. Now the root rides the
// posed torso at the rump (torso.js NAP_TAIL, as the sit's SIT_TAIL), the
// chain lies low on the ground and curls round the cat's side toward the head,
// nose to tail. Cats with folds only: Hagrid's fan rides his body already
// (rideTail) and keeps his nap tail. The nap breathes (body.scale.y) and the
// tip may sway, so every check sweeps t 0..3 by 0.25. Every measure is in the
// cat's own frame (world / cat.scale.x), so Digit (scale 0.82) is judged by
// her own size.

const BREEDS = PRESETS.filter((b) => b !== 'hagrid');
const CASES = BREEDS.flatMap((b) => [false, true].map((simple) => [b, simple]));
const TS = Array.from({ length: 13 }, (_, i) => i * 0.25);

const v = new THREE.Vector3();
const world = (o, s) => o.getWorldPosition(new THREE.Vector3()).divideScalar(s);
// Every vertex of tail link i, cat frame.
const linkVerts = (cat, i) => {
  const seg = cat.userData.parts.tailPivots[i].children[0], p = seg.geometry.attributes.position, out = [];
  for (let k = 0; k < p.count; k++) out.push(v.fromBufferAttribute(p, k).applyMatrix4(seg.matrixWorld).divideScalar(cat.scale.x).clone());
  return out;
};
// The torso's top (body + underside vertices), cat frame.
const torsoTop = (cat) => {
  const { body, underside } = cat.userData.parts, s = cat.scale.x;
  let top = -Infinity;
  for (const m of [body, underside]) {
    const p = m.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) top = Math.max(top, v.fromBufferAttribute(p, k).applyMatrix4(m.matrixWorld).y / s);
  }
  return top;
};
// How far a cat-frame point P lies outside (+) or inside (-) the torso
// (body + underside), along the line from the torso's centre through P
// (test/catsitupright.test.js): a ray cast from 1 m out back toward the
// centre meets the outer surface first (the faces are one-sided).
const ray = new THREE.Raycaster();
const outside = (cat, P) => {
  const { body, underside } = cat.userData.parts, s = cat.scale.x;
  const C = body.getWorldPosition(new THREE.Vector3());
  const Pw = P.clone().multiplyScalar(s), dir = Pw.clone().sub(C).normalize();
  const F = Pw.clone().addScaledVector(dir, 1);
  ray.set(F, dir.clone().negate());
  const hit = ray.intersectObjects([body, underside], false)[0];
  if (!hit) return Infinity;
  return (hit.distance - F.distanceTo(Pw)) / s; // + : the surface lies beyond P, so P is outside
};
const napAt = (cat, t) => {
  animateCat(cat, 'nap', t, 0, false);
  cat.updateMatrixWorld(true);
};

describe('the napping tail lies flush and curls round (polish-pose Task 1)', () => {
  it.each(CASES)('%s (simple %s): the root sits in the rump, within 3 cm of its surface', (b, simple) => {
    const cat = buildCat(b, undefined, { simple });
    for (const t of TS) {
      napAt(cat, t);
      const root = world(cat.userData.parts.tail, cat.scale.x);
      expect(root.z, `t ${t}: at the rump, behind the torso centre`).toBeGreaterThan(world(cat.userData.parts.body, cat.scale.x).z);
      const d = outside(cat, root);
      expect(d, `t ${t}: not more than 3 cm out of the fur`).toBeLessThanOrEqual(0.03);
      expect(d, `t ${t}: not more than 3 cm under it`).toBeGreaterThanOrEqual(-0.03);
    }
  }, 120_000);

  it.each(CASES)('%s (simple %s): the tail lies low, on the ground and never over the back', (b, simple) => {
    const cat = buildCat(b, undefined, { simple });
    for (const t of TS) {
      napAt(cat, t);
      const top = torsoTop(cat);
      let low = Infinity, high = -Infinity;
      for (let i = 0; i < 5; i++) for (const p of linkVerts(cat, i)) { low = Math.min(low, p.y); high = Math.max(high, p.y); }
      expect(low, `t ${t}: no tail in the ground`).toBeGreaterThanOrEqual(-0.005);
      expect(high, `t ${t}: no tail over the torso's top`).toBeLessThanOrEqual(top);
      const tip = world(cat.userData.parts.tailPivots[4], cat.scale.x);
      expect(tip.y, `t ${t}: the tip lies low`).toBeLessThanOrEqual(0.10);
    }
  }, 120_000);

  it.each(CASES)('%s (simple %s): the tip curls round the side toward the head', (b, simple) => {
    const cat = buildCat(b, undefined, { simple });
    for (const t of TS) {
      napAt(cat, t);
      const { tail, tailPivots } = cat.userData.parts;
      const root = world(tail, cat.scale.x), tip = world(tailPivots[4], cat.scale.x);
      expect(tip.z, `t ${t}: the tip forward of the root`).toBeLessThan(root.z - 0.15);
      expect(Math.abs(tip.x), `t ${t}: the tip beside the cat`).toBeGreaterThanOrEqual(0.12);
    }
  }, 120_000);

  it.each(CASES)('%s (simple %s): past the root, the tail stays 1.5 cm clear of the torso', (b, simple) => {
    const cat = buildCat(b, undefined, { simple });
    for (const t of TS) {
      napAt(cat, t);
      for (let i = 1; i < 5; i++) {
        let worst = Infinity;
        for (const p of linkVerts(cat, i)) worst = Math.min(worst, outside(cat, p));
        expect(worst, `t ${t}: link ${i} outside the torso`).toBeGreaterThanOrEqual(0.015);
      }
    }
  }, 120_000);

  it.each(CASES)('%s (simple %s): nap → follow puts the tail back exactly', (b, simple) => {
    const cat = buildCat(b, undefined, { simple });
    animateCat(cat, 'nap', 1.0, 0, false);
    animateCat(cat, 'follow', 2.1, 0, false);
    const fresh = buildCat(b, undefined, { simple });
    animateCat(fresh, 'follow', 2.1, 0, false);
    const P = cat.userData.parts, F = fresh.userData.parts;
    expect(P.tail.position.toArray()).toEqual(F.tail.position.toArray());
    expect(P.tail.rotation.toArray()).toEqual(F.tail.rotation.toArray());
    P.tailPivots.forEach((p, i) => expect(p.rotation.toArray(), `pivot ${i}`).toEqual(F.tailPivots[i].rotation.toArray()));
  });

  // Ruling P1: Hagrid's fan rides his body (rideTail) and keeps his nap tail.
  // Read from the tree before this change (a6f7971). The root's y comes
  // through sin() and the body's matrix, so it is compared within 1e-9
  // (closeDiffs): Linux CI can round its last digit differently.
  it('Hagrid keeps his nap tail', () => {
    const cat = buildCat('hagrid');
    animateCat(cat, 'nap', 1.3, 0, false);
    const { tail, tailPivots } = cat.userData.parts;
    expect(closeDiffs(tail.position.toArray(), [0, 0.3872391733223395, 0.2848])).toEqual([]);
    expect(tail.rotation.toArray().slice(0, 3)).toEqual([-0.12, 0, 0]);
    expect(tailPivots.map((p) => p.rotation.toArray().slice(0, 3))).toEqual([[0, 0.55, 0], [0, 0.55, 0], [0, 0.55, 0], [0, 0.55, 0], [0, 0.55, 0]]);
  });
});
