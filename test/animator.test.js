import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { animateCat } from '../src/cat/animator.js';
import { buildCat } from '../src/cat/model.js';
import { DEFAULT_LOOK } from '../src/customcats.js';

// The real rig, built exactly the way strays are ({ simple: true }, which
// skips whiskers) — poses are only meaningful against the model's declared
// base pose, so faking the parts would test nothing.
const stray = () => buildCat('tabby', undefined, { simple: true });

const pose = (state, { t = 1.3, speed = 0, reducedMotion = false } = {}) => {
  const cat = stray();
  animateCat(cat, state, t, speed, reducedMotion);
  return cat.userData.parts;
};

describe("animateCat 'cross'", () => {
  it('accepts the state without throwing on the simple (whiskerless) stray rig', () => {
    expect(() => pose('cross')).not.toThrow();
  });

  it('holds its ground where scared shrinks: higher body, turned side-on', () => {
    const base = stray().userData.base;
    const scared = pose('scared');
    const cross = pose('cross');
    // scared drops; cross lifts.
    expect(scared.body.position.y).toBeLessThan(base.bodyY);
    expect(cross.body.position.y).toBeGreaterThan(base.bodyY);
    // The angry-cat silhouette: the torso presents its flank while the head,
    // which is parented to the group rather than to the body, keeps facing
    // the player.
    expect(Math.abs(cross.body.rotation.y)).toBeGreaterThan(0.1);
    expect(scared.body.rotation.y).toBe(0);
  });

  it('puffs up rather than flattening', () => {
    const [, bsy] = stray().userData.base.bodyScale;
    const cross = pose('cross');
    expect(cross.body.scale.y).toBeGreaterThan(bsy);
    // ...and gathers rather than stretching out.
    expect(cross.body.scale.z).toBeLessThan(stray().userData.base.bodyScale[2]);
  });

  it('pins the ears harder than scared does', () => {
    const scared = pose('scared');
    const cross = pose('cross');
    expect(cross.earL.rotation.z).toBeGreaterThan(scared.earL.rotation.z);
    expect(cross.earR.rotation.z).toBeLessThan(scared.earR.rotation.z);
    expect(cross.earL.rotation.z).toBeCloseTo(-cross.earR.rotation.z, 6);
  });

  it('raises the tail higher than scared and leaves it straight, not tucked', () => {
    const scared = pose('scared');
    const cross = pose('cross');
    // rotation.x is negative-up here, and both states add the same small
    // idle wobble, so compare the raised bases with room for it.
    expect(cross.tail.rotation.x).toBeLessThan(scared.tail.rotation.x);
    // scared curls the live segments round the body (yaw 0.35 before sway);
    // cross leaves them at zero, so the chain lashes about centre instead —
    // a rigid bottlebrush rather than a tail wrapped round the flank.
    // Averaged over time, since both states add an oscillating sway on top.
    const meanYaw = (state) => {
      let sum = 0;
      const n = 200;
      for (let i = 0; i < n; i++) sum += pose(state, { t: i * 0.05 }).tailPivots[0].rotation.y;
      return sum / n;
    };
    expect(meanYaw('scared')).toBeGreaterThan(0.25);
    expect(Math.abs(meanYaw('cross'))).toBeLessThan(0.05);
    expect(cross.tailPivots[0].rotation.y).not.toBe(0); // still moving
  });

  it('braces its legs when standing, and still walks when walking', () => {
    const standing = pose('cross');
    expect(standing.legs[0].rotation.x).toBeGreaterThan(0);
    expect(standing.legs[2].rotation.x).toBeLessThan(0);
    // The gait must win: a cross cat that wanders off still moves its legs.
    const walkingA = pose('cross', { t: 0.4, speed: 2 });
    const walkingB = pose('cross', { t: 0.9, speed: 2 });
    expect(walkingA.legs[0].rotation.x).not.toBeCloseTo(walkingB.legs[0].rotation.x, 3);
  });

  it('lashes the tail faster and wider than an idle cat', () => {
    // Sampled across a stretch of time rather than at one instant, since any
    // single sample of a sine can land anywhere.
    const spread = (state, opts = {}) => {
      const ys = [];
      for (let i = 0; i < 40; i++) ys.push(pose(state, { t: i * 0.05, ...opts }).tailPivots[0].rotation.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread('cross')).toBeGreaterThan(spread('follow'));
  });

  it('respects reducedMotion the way the walk cycle does: the exaggeration goes, the pose stays', () => {
    const calm = pose('cross', { reducedMotion: true });
    const lively = pose('cross');
    // Same posture...
    expect(calm.body.rotation.y).toBeCloseTo(lively.body.rotation.y, 6);
    expect(calm.earL.rotation.z).toBeCloseTo(lively.earL.rotation.z, 6);
    expect(calm.body.position.y).toBeCloseTo(lively.body.position.y, 6);
    // ...but the whipping tail is calmed to the ordinary idle sway.
    const spread = (reducedMotion) => {
      const ys = [];
      for (let i = 0; i < 40; i++) {
        ys.push(pose('cross', { t: i * 0.05, reducedMotion }).tailPivots[0].rotation.y);
      }
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread(true)).toBeLessThan(spread(false));
  });
});

describe('animateCat: states other than cross are untouched', () => {
  // The tail chain is shared by every state, so this pins that adding the
  // cross lash did not perturb anyone else's tail.
  const snapshot = (state) => {
    const p = pose(state, { t: 2.4, speed: 1.5 });
    return {
      bodyY: p.body.position.y,
      bodyRotY: p.body.rotation.y,
      tailX: p.tail.rotation.x,
      pivots: p.tailPivots.map((q) => q.rotation.y),
      ears: [p.earL.rotation.z, p.earR.rotation.z],
    };
  };
  for (const state of ['follow', 'scared', 'stalk', 'sniff', 'nap', 'groom', 'perch', 'pounce', 'land']) {
    it(`'${state}' still poses and never yaws the torso`, () => {
      const s = snapshot(state);
      expect(Number.isFinite(s.bodyY)).toBe(true);
      expect(s.bodyRotY).toBe(0);
      for (const y of s.pivots) expect(Number.isFinite(y)).toBe(true);
    });
  }
});

describe('animateCat: the resting tail curl (Task 5, R3)', () => {
  it('at rest the tail leaves level and curls up 0.28 per link to 1.12 rad at the tip', () => {
    const cat = buildCat('tabby'); animateCat(cat, 'follow', 0, 0, false);
    const { tail, tailPivots } = cat.userData.parts;
    expect(tail.rotation.x).toBeCloseTo(0.28, 6);
    for (const p of tailPivots) expect(p.rotation.x).toBeCloseTo(-0.28, 6);
    const elev = (i) => -tail.rotation.x - tailPivots.slice(0, i + 1).reduce((a, p) => a + p.rotation.x, 0);
    expect(elev(0)).toBeCloseTo(0, 6);
    expect(elev(4)).toBeCloseTo(1.12, 6);
  });
  it('cross and scared keep today\'s straight tail (R3)', () => {
    for (const s of ['cross', 'scared', 'stalk', 'pounce', 'stretch']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 1.3, 0, false);
      for (const p of cat.userData.parts.tailPivots) expect(p.rotation.x).toBe(0);
    }
    const cross = buildCat('tabby'); animateCat(cross, 'cross', 0, 0, false);
    expect(cross.userData.parts.tail.rotation.x).toBeCloseTo(-1.5, 6);
  });
  it('lying down softens the curl to a fifth', () => {
    for (const s of ['nap', 'perch', 'requestPet']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 1, 0, false);
      for (const p of cat.userData.parts.tailPivots) expect(p.rotation.x).toBeCloseTo(-0.28 * 0.2, 6);
    }
  });
  it('the curl survives reducedMotion and the gait', () => {
    for (const s of ['follow', 'sniff']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 2.7, 2.0, true);
      for (const p of cat.userData.parts.tailPivots) expect(p.rotation.x).toBeCloseTo(-0.28, 6);
      cat.updateMatrixWorld(true);
      expect(new THREE.Box3().setFromObject(cat, true).min.y / cat.scale.x).toBeGreaterThanOrEqual(-0.01); // precise box
    }
  });
});

// Clan Life Part 2, Task 4: the fight's two new poses.
describe('animateCat: the fight poses (swipe, backUp)', () => {
  const lowest = (obj) => new THREE.Box3().setFromObject(obj, true).min.y;
  const posed = (breed, state, simple = false, extra = {}) => {
    const cat = buildCat(breed, undefined, simple || Object.keys(extra).length ? { ...(simple ? { simple: true } : {}), ...extra } : undefined);
    animateCat(cat, state, 1.3, 0, false);
    cat.updateMatrixWorld(true);
    return cat;
  };

  it('swipe raises one front paw well above the other, and no paw goes below the ground', () => {
    for (const breed of ['tabby', 'digit']) {
      for (const simple of [false, true]) {
        const cat = posed(breed, 'swipe', simple);
        const { legs } = cat.userData.parts;
        const s = cat.scale.x;
        const fl = lowest(legs[0].userData.paw) / s;
        const fr = lowest(legs[1].userData.paw) / s;
        expect(fl - fr).toBeGreaterThan(0.08);
        expect(legs[0].rotation.x).toBeCloseTo(-1.2, 1);
        expect(lowest(cat) / s).toBeGreaterThanOrEqual(-0.01);
        // leaning back a little, head up
        expect(cat.userData.parts.body.rotation.x).toBeLessThan(0);
        expect(cat.userData.parts.head.position.y).toBeGreaterThan(cat.userData.base.headPos[1]);
      }
    }
    expect(() => animateCat(buildCat('hagrid'), 'swipe', 1.3, 0, false)).not.toThrow();
  });

  it('backUp shifts the body back and down and differs from cross, stalk and swipe', () => {
    for (const breed of ['tabby', 'digit']) {
      const cat = posed(breed, 'backUp');
      const { body, head, legs } = cat.userData.parts;
      const base = cat.userData.base;
      expect(body.position.z).toBeGreaterThan(0.05);
      expect(body.position.y).toBeLessThan(base.bodyY);
      // rear lowered: the torso tips nose-up
      expect(body.rotation.x).toBeLessThan(0);
      // front legs braced forward, head low and level
      expect(legs[0].rotation.x).toBeLessThan(0);
      expect(legs[1].rotation.x).toBeLessThan(0);
      expect(head.position.y).toBeLessThan(base.headPos[1]);
      expect(head.rotation.x).toBe(0);
      expect(lowest(cat) / cat.scale.x).toBeGreaterThanOrEqual(-0.01);
      const sig = (c) => {
        const p = c.userData.parts;
        return [p.body.position.y, p.body.position.z, p.body.rotation.x, p.head.position.y, ...p.legs.map((l) => l.rotation.x)]
          .map((v) => Math.round(v * 1e4)).join(',');
      };
      for (const other of ['cross', 'stalk', 'swipe']) expect(sig(posed(breed, other))).not.toBe(sig(cat));
      // held still: the same at any moment of the clue
      const later = buildCat(breed);
      animateCat(later, 'backUp', 4.1, 0, false);
      expect(sig(later)).toBe(sig(cat));
    }
    expect(() => animateCat(buildCat('hagrid'), 'backUp', 1.3, 0, false)).not.toThrow();
  });

  it('a long-haired, patched custom cat runs swipe and backUp with its paws above the ground', () => {
    const look = { ...DEFAULT_LOOK, pattern: 'patches', fur: 'long' };
    // a fingerprint of the build: mesh count plus every material colour
    const count = (o) => {
      const cols = [];
      let n = 0;
      o.traverse((m) => { n++; if (m.material && m.material.color) cols.push(m.material.color.getHexString()); });
      return `${n}:${cols.join(',')}`;
    };
    for (const simple of [false, true]) {
      // prove the look really is applied: the custom build is not the plain calico
      const plain = buildCat('calico', undefined, simple ? { simple: true } : undefined);
      const custom = buildCat('calico', undefined, { ...(simple ? { simple: true } : {}), look });
      expect(count(custom)).not.toBe(count(plain));
      for (const state of ['swipe', 'backUp']) {
        const cat = posed('calico', state, simple, { look });
        expect(count(cat)).toBe(count(custom));
        expect(lowest(cat) / cat.scale.x).toBeGreaterThanOrEqual(-0.01);
        for (const leg of cat.userData.parts.legs) expect(lowest(leg.userData.paw) / cat.scale.x).toBeGreaterThanOrEqual(-0.01);
        if (state === 'swipe') {
          const [fl, fr] = cat.userData.parts.legs;
          expect(lowest(fl.userData.paw) - lowest(fr.userData.paw)).toBeGreaterThan(0.08 * cat.scale.x);
        }
      }
    }
  });

  it('no other pose keeps the body moved back after a backUp', () => {
    const cat = buildCat('tabby');
    animateCat(cat, 'backUp', 1.3, 0, false);
    animateCat(cat, 'follow', 1.3, 0, false);
    expect(cat.userData.parts.body.position.z).toBe(0);
  });
});
