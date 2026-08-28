import { describe, it, expect } from 'vitest';
import { animateCat } from '../src/cat/animator.js';
import { buildCat } from '../src/cat/model.js';

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
