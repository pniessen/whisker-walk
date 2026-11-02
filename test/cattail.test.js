import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { TAIL } from '../src/cat/torso.js';

// polish-catlooks (2026-11-02), Task 7: the walking tail reads from behind.
// The walk camera sits behind the cat ~90% of the time. A tail that only bends
// in its own vertical plane is foreshortened there into a short upright cone;
// walking, it now carries a question mark: up, the last links hooked over to
// the cat's own left (-x: the cat faces -z, its tail runs back along +z).

const BREEDS = ['tabby', 'd2', 'digit'];
const TS = Array.from({ length: 11 }, (_, i) => +(i * 0.3).toFixed(1)); // 0, 0.3, ... 3.0
const SPEED = 1.5;

const walk = (breed, t, speed = SPEED, state = 'follow') => {
  const cat = buildCat(breed);
  animateCat(cat, state, t, speed, false);
  cat.updateMatrixWorld(true);
  return cat;
};

// The tail's centre line in world space: each pivot's origin, then the tip's
// end. The mesh's own x-extent is no measure of the carriage: the root ball
// alone is ~0.1 m wide, so even today's foreshortened stub spans >= 0.10 m of
// vertices from behind (recorded 2026-11-02: min 0.104 m, Digit).
const centreLine = (cat) => {
  const ps = cat.userData.parts.tailPivots;
  const pts = ps.map((p) => p.getWorldPosition(new THREE.Vector3()));
  pts.push(new THREE.Vector3(0, 0, TAIL.LINK).applyMatrix4(ps[ps.length - 1].matrixWorld));
  return pts;
};

const tailTop = (cat) => {
  const v = new THREE.Vector3();
  let top = -Infinity;
  cat.userData.parts.tail.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) top = Math.max(top, v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld).y);
  });
  return top;
};

// Today's (2026-11-02, before Task 7) highest tail vertex walking (follow,
// speed 1.5) over t = 0, 0.3, ... 3.0. The gates' flap openings clear every
// walking cat by 1 cm (pushthrough.test.js) and the cross tag sits over the
// raised tail (nametag CROSS_TAG_Y): the hook must not lift the tail.
const TOP_BEFORE = { tabby: 0.96877, d2: 1.11409, digit: 0.89484 };

describe('the walking tail hooks over like a question mark (polish-catlooks Task 7)', () => {
  it('from behind, the walking tail spans a visible width and height', () => {
    for (const breed of BREEDS) {
      let lean = 0;
      for (const t of TS) {
        const L = centreLine(walk(breed, t));
        const xs = L.map((p) => p.x), ys = L.map((p) => p.y);
        const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
        expect(w, `${breed} t ${t}: width from behind`).toBeGreaterThanOrEqual(0.08);
        expect(h, `${breed} t ${t}: height from behind`).toBeGreaterThanOrEqual(0.18);
        lean += (L[L.length - 1].x - L[0].x) / TS.length;
      }
      // the hook is to the cat's own left (-x), over the whole stride
      expect(lean, `${breed}: mean tip offset`).toBeLessThanOrEqual(-0.08);
    }
  }, 120_000);

  it('the walking tail is no taller than before', () => {
    for (const breed of BREEDS) {
      const top = Math.max(...TS.map((t) => tailTop(walk(breed, t))));
      expect(top, breed).toBeLessThanOrEqual(TOP_BEFORE[breed] + 0.001);
    }
  }, 120_000);

  it('stopping lets the hook go', () => {
    // Standing 'follow' (speed 0): every pivot's yaw is the plain idle sway.
    for (const breed of BREEDS) for (const t of [0.3, 1.3, 2.1]) {
      const { tailPivots } = walk(breed, t, 0).userData.parts;
      tailPivots.forEach((p, i) => expect(p.rotation.y, `${breed} t ${t} pivot ${i}`).toBeCloseTo(Math.sin(t * 2.6 - i * 0.65) * 0.16, 9));
    }
  });

  it('Hagrid has no hook', () => {
    // No resting curl, no carriage: his tail feathers keep the plain sway.
    for (const t of [0.3, 1.3, 2.1]) {
      const { tailPivots } = walk('hagrid', t).userData.parts;
      const sway = 0.1 + SPEED * 0.03;
      tailPivots.forEach((p, i) => expect(p.rotation.y, `t ${t} pivot ${i}`).toBeCloseTo(Math.sin(t * 2.6 - i * 0.65) * sway, 9));
    }
  });

  it('only a walking follow hooks: the other states keep their own tails', () => {
    // Moving in these states, the tip's yaw averages out over a stride: no
    // constant offset to one side.
    for (const state of ['sniff', 'stalk', 'wade']) {
      const lean = TS.slice(0, 8).reduce((s, t) => s + walk('tabby', t, SPEED, state).userData.parts.tailPivots[4].rotation.y, 0) / 8;
      expect(Math.abs(lean), state).toBeLessThan(0.05);
    }
  });
});
