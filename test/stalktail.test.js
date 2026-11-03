import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat, STALK_CARRIAGE } from '../src/cat/animator.js';
import { TAIL } from '../src/cat/torso.js';

// polish-tails (2026-11-03), Task 2: the stalking tail. It was a straight
// spike down-back from the rump, its tip the lowest point. A stalking cat
// holds its tail low in a soft curve, the end lifted and the tip twitching.

const BREEDS = ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon', 'zeetoo', 'robbie', 'd2', 'digit'];
const TS = Array.from({ length: 13 }, (_, i) => i * 0.25); // 0 .. 3
const SPEEDS = [0, 1.5];

const stalk = (breed, t, speed, reduced = false, opts = {}) => {
  const cat = buildCat(breed, undefined, opts);
  animateCat(cat, 'stalk', t, speed, reduced);
  cat.updateMatrixWorld(true);
  return cat;
};

// Cat frame: the cat stands at the origin on the ground (y 0); positions are
// divided by the cat's scale so every breed is measured alike.
const centreLine = (cat) => {
  const s = cat.scale.x;
  const ps = cat.userData.parts.tailPivots;
  const pts = ps.map((p) => p.getWorldPosition(new THREE.Vector3()));
  pts.push(new THREE.Vector3(0, 0, TAIL.LINK).applyMatrix4(ps[ps.length - 1].matrixWorld));
  return pts.map((p) => p.divideScalar(s));
};
const lowestVertex = (cat) => {
  const s = cat.scale.x, v = new THREE.Vector3();
  let low = Infinity;
  cat.userData.parts.tail.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) low = Math.min(low, v.fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld).y / s);
  });
  return low;
};

describe('the stalking tail: low, curved, the tip lifted and twitching (polish-tails Task 2)', () => {
  it('hangs low but clear of the ground, every breed, phase and speed', () => {
    for (const breed of BREEDS) for (const simple of [false, true]) for (const speed of SPEEDS) for (const t of TS) {
      const cat = stalk(breed, t, speed, false, { simple });
      const at = `${breed}${simple ? ' simple' : ''} t ${t} speed ${speed}`;
      const ys = centreLine(cat).map((p) => p.y);
      expect(Math.min(...ys), `${at}: lowest centre point`).toBeGreaterThanOrEqual(0.04);
      expect(lowestVertex(cat), `${at}: lowest tail vertex`).toBeGreaterThanOrEqual(0.01);
    }
  }, 180_000);

  it('is one curve, sagging in the middle with the end lifted', () => {
    for (const breed of BREEDS) for (const speed of SPEEDS) for (const t of TS) {
      const ys = centreLine(stalk(breed, t, speed)).map((p) => p.y);
      const low = Math.min(...ys), at = ys.indexOf(low);
      const where = `${breed} t ${t} speed ${speed}: centre heights ${ys.map((y) => y.toFixed(3))}`;
      expect(at, `${where}: the lowest point is neither root nor tip`).toBeGreaterThan(0);
      expect(at, where).toBeLessThan(ys.length - 1);
      expect(ys[ys.length - 1] - low, `${where}: the tip lifts`).toBeGreaterThanOrEqual(0.06);
    }
  }, 120_000);

  it('the tip twitches while the tail near the root holds still', () => {
    for (const breed of BREEDS) for (const speed of SPEEDS) {
      const lines = TS.map((t) => centreLine(stalk(breed, t, speed)));
      const span = (xs) => Math.max(...xs) - Math.min(...xs);
      expect(span(lines.map((L) => L[L.length - 1].x)), `${breed} speed ${speed}: tip`).toBeGreaterThanOrEqual(0.04);
      expect(span(lines.map((L) => L[1].x)), `${breed} speed ${speed}: link 1 origin`).toBeLessThanOrEqual(0.03);
    }
  }, 120_000);

  it('reduced motion keeps the curve and drops the fast twitch', () => {
    const tipX = (reduced) => TS.map((t) => { const L = centreLine(stalk('tabby', t, 0, reduced)); return L[L.length - 1].x; });
    const speedOf = (xs) => Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i])));
    expect(speedOf(tipX(true))).toBeLessThan(0.5 * speedOf(tipX(false)));
    for (const t of TS) {
      const ys = centreLine(stalk('tabby', t, 0, true)).map((p) => p.y);
      expect(ys[ys.length - 1] - Math.min(...ys), `t ${t}: still lifted`).toBeGreaterThanOrEqual(0.06);
    }
    // a pure function of t: the same frame twice is the same pose
    const a = centreLine(stalk('tabby', 1.3, 1.5)), b = centreLine(stalk('tabby', 1.3, 1.5));
    expect(a.map((p) => p.toArray())).toEqual(b.map((p) => p.toArray()));
  }, 120_000);

  it('Hagrid keeps the generic stalk tail (no carriage on a hen)', () => {
    expect(STALK_CARRIAGE.pivotX.length).toBe(5);
    for (const t of TS) {
      const { tailPivots } = stalk('hagrid', t, 1.5).userData.parts;
      for (const p of tailPivots) expect(p.rotation.x).toBe(0);
    }
  });
});
