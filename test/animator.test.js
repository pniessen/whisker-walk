import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { animateCat, refitNeck, STALK_CARRIAGE } from '../src/cat/animator.js';
import { buildCat } from '../src/cat/model.js';
import { SIT_TAIL, NAP_TAIL } from '../src/cat/torso.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { closeDiffs } from './helpers/closeto.js';

// The real rig, built exactly the way strays are ({ simple: true }, which
// skips whiskers) — poses are only meaningful against the model's declared
// base pose, so faking the parts would test nothing.
const stray = () => buildCat('tabby', undefined, { simple: true });

const pose = (state, { t = 1.3, speed = 0, reducedMotion = false } = {}) => {
  const cat = stray();
  animateCat(cat, state, t, speed, reducedMotion);
  return cat.userData.parts;
};


// polish-tails Task 2 (2026-11-03): a stalking cat's pivots bend as
// STALK_CARRIAGE says, the tip's lift twitch on top (never more than lift).
function expectStalkCarriage(t, speed) {
  const cat = buildCat('tabby'); animateCat(cat, 'stalk', t, speed, false);
  const ps = cat.userData.parts.tailPivots;
  ps.slice(0, -1).forEach((p, i) => expect(p.rotation.x).toBeCloseTo(STALK_CARRIAGE.pivotX[i], 9));
  const tip = ps[ps.length - 1].rotation.x - STALK_CARRIAGE.pivotX[ps.length - 1];
  expect(tip).toBeLessThanOrEqual(0);
  expect(tip).toBeGreaterThanOrEqual(-STALK_CARRIAGE.twitch.lift);
}

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
    for (const s of ['cross', 'scared', 'pounce', 'stretch']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 1.3, 0, false);
      for (const p of cat.userData.parts.tailPivots) expect(p.rotation.x).toBe(0);
    }
    // polish-tails Task 2 (2026-11-03): the stalk no longer holds the straight
    // tail; it writes its own low curve (STALK_CARRIAGE, test/stalktail.test.js).
    expectStalkCarriage(1.3, 0);
    const cross = buildCat('tabby'); animateCat(cross, 'cross', 0, 0, false);
    expect(cross.userData.parts.tail.rotation.x).toBeCloseTo(-1.5, 6);
  });
  it('lying down and sitting write the tail outright (no curl)', () => {
    // polish-sit Task 2 (2026-11-02): the sit (perch, requestPet) no longer
    // takes the curl: its tail lies round the paws, every pivot written from
    // torso.js SIT_TAIL (test/catsitupright.test.js). polish-pose Task 1: nor
    // does the nap (it took a fifth of the curl before): its tail lies flush
    // and curls round the body, every pivot written from torso.js NAP_TAIL
    // (test/catnap.test.js).
    for (const s of ['nap']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 1, 0, false);
      cat.userData.parts.tailPivots.forEach((p, i) => expect(p.rotation.x).toBe(NAP_TAIL.pivotX[i]));
    }
    for (const s of ['perch', 'requestPet']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 1, 0, false);
      cat.userData.parts.tailPivots.forEach((p, i) => expect(p.rotation.x).toBe(SIT_TAIL.pivotX[i]));
    }
  });
  it('the curl survives reducedMotion and the gait', () => {
    // (Polish 1a, Task 5: a WALKING 'follow' now carries the tail in an S —
    // see the carriage test below — so only the sniff keeps the plain curl at a walk.)
    for (const s of ['follow', 'sniff']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 2.7, 2.0, true);
      if (s === 'sniff') for (const p of cat.userData.parts.tailPivots) expect(p.rotation.x).toBeCloseTo(-0.28, 6);
      cat.updateMatrixWorld(true);
      expect(new THREE.Box3().setFromObject(cat, true).min.y / cat.scale.x).toBeGreaterThanOrEqual(-0.01); // precise box
    }
  });
});

// Clan Life Part 2, Task 4: the fight's two new poses.
describe('animateCat: the fight poses (swipe, backUp)', () => {
  const lowest = (obj) => new THREE.Box3().setFromObject(obj, true).min.y;
  const posed = (breed, state, simple = false, extra = {}) => {
    const opts = { ...(simple && { simple: true }), ...extra };
    const cat = buildCat(breed, undefined, Object.keys(opts).length ? opts : undefined);
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
    // a fingerprint of the build: meshes, total vertices (long fur and patches
    // each change the geometry, in opposite directions) and every material colour
    const fingerprint = (o) => {
      const cols = [];
      let n = 0, verts = 0;
      o.traverse((m) => {
        n++;
        if (m.geometry) verts += m.geometry.attributes.position.count;
        if (m.material && m.material.color) cols.push(m.material.color.getHexString());
      });
      return `${n}:${verts}:${cols.join(',')}`;
    };
    for (const simple of [false, true]) {
      const build = (l) => buildCat('calico', undefined, { ...(simple ? { simple: true } : {}), look: l });
      const custom = build(look);
      // each of long fur and patches really took effect: dropping either one, or both, changes the build
      for (const l of [DEFAULT_LOOK, { ...look, fur: DEFAULT_LOOK.fur }, { ...look, pattern: DEFAULT_LOOK.pattern }]) {
        expect(fingerprint(custom)).not.toBe(fingerprint(build(l)));
      }
      for (const state of ['swipe', 'backUp']) {
        const cat = posed('calico', state, simple, { look });
        expect(fingerprint(cat)).toBe(fingerprint(custom));
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

// Fight actions (Task 2): the six new fight states.
describe('animateCat: the fight action states', () => {
  const NEW = ['arch', 'rearUp', 'flinch', 'pinned', 'pinning', 'roll'];
  const look = { ...DEFAULT_LOOK, pattern: 'patches', fur: 'long' };
  const builds = {
    full: () => buildCat('tabby'),
    simple: () => buildCat('tabby', undefined, { simple: true }),
    custom: () => buildCat('calico', undefined, { look }),
    digit: () => buildCat('digit'),
  };
  const finite = (o) => [...o.position.toArray(), ...o.rotation.toArray().slice(0, 3), ...o.scale.toArray()].every(Number.isFinite);

  for (const [name, build] of Object.entries(builds)) {
    it(`${name}: every new state poses with finite transforms and never moves a leg`, () => {
      for (const state of NEW) {
        for (const reducedMotion of [false, true]) {
          const cat = build();
          const legPos = cat.userData.parts.legs.map((l) => l.position.toArray());
          for (const t of [0, 0.37, 1.3, 4.1]) {
            animateCat(cat, state, t, 0, reducedMotion);
            cat.traverse((o) => expect(finite(o)).toBe(true));
            expect(cat.userData.parts.legs.map((l) => l.position.toArray())).toEqual(legPos);
          }
          cat.updateMatrixWorld(true);
          // unlifted and unrotated, nothing goes into the ground
          expect(new THREE.Box3().setFromObject(cat, true).min.y / cat.scale.x).toBeGreaterThanOrEqual(-0.01);
        }
      }
    });
  }

  it('Hagrid animated in each new state does not throw', () => {
    for (const state of NEW) expect(() => animateCat(buildCat('hagrid'), state, 1.3, 0, false)).not.toThrow();
  });

  it('a state after a fight state is exactly as if the fight state never ran', () => {
    const sig = (c) => {
      const out = [];
      c.traverse((o) => out.push(...o.position.toArray(), ...o.rotation.toArray().slice(0, 3), ...o.scale.toArray()));
      return out.map((v) => Math.round(v * 1e9)).join(',');
    };
    for (const after of ['follow', 'cross', 'scared', 'stalk', 'swipe', 'backUp', 'nap', 'pounce']) {
      const clean = buildCat('tabby');
      animateCat(clean, after, 2.2, 0, false);
      for (const state of NEW) {
        const cat = buildCat('tabby');
        animateCat(cat, state, 1.1, 0, false);
        animateCat(cat, after, 2.2, 0, false);
        expect(sig(cat)).toBe(sig(clean));
      }
    }
  });

  it('rearUp swats with the front paws in turn; roll tucks all four legs; pinned is flatter than standing', () => {
    const at = (state, t) => { const c = buildCat('tabby'); animateCat(c, state, t, 0, false); return c.userData.parts; };
    const a = at('rearUp', 0.1), b = at('rearUp', 0.1 + Math.PI / 9);
    expect(a.legs[0].rotation.x).not.toBeCloseTo(b.legs[0].rotation.x, 2);
    expect(a.legs[0].rotation.x - a.legs[1].rotation.x).toBeCloseTo(-(b.legs[0].rotation.x - b.legs[1].rotation.x), 6);
    // Body refinement Task 5: the roll balls the legs up by folding them (the
    // 'ball' fold baked into each limb), no longer by swinging them ±ROLL.tuck.
    for (const leg of at('roll', 1).legs) {
      expect(leg.userData.fold).toBe('ball');
      expect(leg.rotation.x).toBe(0);
    }
    const base = buildCat('tabby').userData.base;
    const pinned = at('pinned', 1);
    expect(pinned.body.position.y).toBeLessThan(base.bodyY - 0.1);
    expect(pinned.body.scale.y).toBeLessThan(base.bodyScale[1]);
    // Task 5: pinned folds all four legs ('tuck') instead of squashing them to 0.3.
    for (const leg of pinned.legs) {
      expect(leg.userData.fold).toBe('tuck');
      expect(leg.scale.y).toBe(1);
    }
    expect(pinned.earL.rotation.z).toBeGreaterThan(0.78);
    const flinch = at('flinch', 1);
    expect(flinch.earL.rotation.z).toBeGreaterThan(0.78);
  });

  it('arch lashes like cross, and reducedMotion calms it', () => {
    const spread = (reducedMotion) => {
      const ys = [];
      for (let i = 0; i < 40; i++) {
        const c = buildCat('tabby', undefined, { simple: true });
        animateCat(c, 'arch', i * 0.05, 0, reducedMotion);
        ys.push(c.userData.parts.tailPivots[0].rotation.y);
      }
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread(true)).toBeLessThan(spread(false));
  });
});

// Polish pass 1a, Task 5 (2026-11-02): from the walk camera, behind the cat.
describe('animateCat: the walking tail is carried in a soft S (polish 1a, Task 5)', () => {
  // Each link's elevation above level-backward, in radians (+ = up): the root
  // frame's tilt (+ tips it down) and every pivot's bend (- bends up) add up.
  const elevations = (parts) => {
    const out = []; let a = -parts.tail.rotation.x;
    for (const p of parts.tailPivots) { a -= p.rotation.x; out.push(a); }
    return out;
  };
  it('walking: the base rises, the middle stands highest, the tip curls back', () => {
    for (const breed of ['tabby', 'digit']) for (const t of [0.4, 1.3, 2.7]) {
      const cat = buildCat(breed); animateCat(cat, 'follow', t, 1.5, false);
      const e = elevations(cat.userData.parts);
      const top = Math.max(...e);
      expect(e[0], `${breed} t ${t}: ${e}`).toBeGreaterThanOrEqual(0.4);          // the base up, not straight back at the camera
      expect(e.indexOf(top), `${breed} t ${t}: ${e}`).toBeGreaterThan(0);
      expect(e.indexOf(top), `${breed} t ${t}: ${e}`).toBeLessThan(4);
      expect(top - e[4], `${breed} t ${t}: ${e}`).toBeGreaterThanOrEqual(0.2);     // the tip curls back
      expect(top, `${breed} t ${t}: ${e}`).toBeLessThan(Math.PI / 2);              // never leaning forward over the back
    }
  });
  it('standing still keeps the resting curl; the carriage eases in with speed', () => {
    const stand = buildCat('tabby'); animateCat(stand, 'follow', 0, 0, false);
    for (const p of stand.userData.parts.tailPivots) expect(p.rotation.x).toBeCloseTo(-0.28, 6);
    const base0 = (speed) => { const c = buildCat('tabby'); animateCat(c, 'follow', 0, speed, false); return elevations(c.userData.parts)[0]; };
    expect(base0(0.3)).toBeGreaterThan(base0(0));
    expect(base0(1.5)).toBeGreaterThan(base0(0.3));
  });
  it('the stalk and the fight poses keep their own tails; the sniff keeps the resting curl, not the carriage', () => {
    for (const s of ['cross', 'scared']) {
      const cat = buildCat('tabby'); animateCat(cat, s, 1.3, 1.5, false);
      for (const p of cat.userData.parts.tailPivots) expect(p.rotation.x).toBe(0);
    }
    expectStalkCarriage(1.3, 1.5); // polish-tails Task 2: the stalk's own curve
    // the carriage is a walking 'follow' only: a sniffing cat on the move keeps its curl
    const sniff = buildCat('tabby'); animateCat(sniff, 'sniff', 1.3, 1.5, false);
    for (const p of sniff.userData.parts.tailPivots) expect(p.rotation.x).toBeCloseTo(-0.28, 6);
  });
});

describe("animateCat: Digit's tag collar follows the neck in the stalk (polish 1a, Task 5)", () => {
  // The neck: midway between the head's centre and the chest's (the underside's
  // chestCentre), the two things it joins. A head-locked collar kept its place
  // on the head while the stalk drops the head forward of the chest, so its
  // front stuck out under the chin as a black rod with the tag dangling off it.
  const posed = (state, t, speed) => { const c = buildCat('digit'); animateCat(c, state, t, speed, false); c.updateMatrixWorld(true); return c; };
  const parts = (cat) => {
    const { head, underside, legs } = cat.userData.parts;
    const collar = head.getObjectByName('collar');
    const [ring, tag] = collar.children;
    const chest = new THREE.Vector3(...underside.userData.chestCentre).applyMatrix4(underside.matrixWorld);
    const headW = head.getWorldPosition(new THREE.Vector3());
    const neck = headW.clone().add(chest).multiplyScalar(0.5);
    const axis = headW.clone().sub(chest).normalize();
    return { head, collar, ring, tag, neck, axis, legs, body: cat.userData.parts.body, k: cat.scale.x };
  };
  // The ring's centre relative to the neck, in the neck's own frame: turned
  // back by however far the neck (chest to head) turned from standing.
  const restAxis = parts(posed('follow', 1.3, 0)).axis;
  const ringOffset = (cat) => {
    const p = parts(cat);
    const back = new THREE.Quaternion().setFromUnitVectors(p.axis, restAxis);
    return p.ring.getWorldPosition(new THREE.Vector3()).sub(p.neck).divideScalar(p.k).applyQuaternion(back);
  };
  // inside the ellipsoid of a sphere mesh of radius r
  const inside = (mesh, r, w) => { const l = mesh.worldToLocal(w.clone()); return l.length() <= r; };
  const lowest = (mesh) => new THREE.Box3().setFromObject(mesh, true).min.y;
  const restOffset = ringOffset(posed('follow', 1.3, 0));

  for (const [t, speed] of [[1.3, 0], [0.7, 0], [0.4, 1.5], [0.9, 1.5]]) {
    it(`stalk t ${t} speed ${speed}: the ring keeps its place on the neck; the tag hangs at the throat`, () => {
      const cat = posed('stalk', t, speed), p = parts(cat);
      expect(ringOffset(cat).distanceTo(restOffset), 'ring on the neck').toBeLessThanOrEqual(0.01);
      const skull = p.head.children[0], muzzle = p.head.children[1];
      const tagBox = new THREE.Box3().setFromObject(p.tag, true), tagC = tagBox.getCenter(new THREE.Vector3());
      expect(tagC.y, 'below the chin').toBeLessThan(lowest(muzzle));
      expect(tagBox.min.y, 'above the paws').toBeGreaterThan(Math.max(...p.legs.map((l) => new THREE.Box3().setFromObject(l.userData.paw, true).max.y)));
      expect(inside(skull, 0.21, tagC) || inside(muzzle, 0.09, tagC), 'the tag shows').toBe(false);
      // at the throat: against the chest fur as when standing (~6 cm), not 15 cm out in front of it
      const hit = new THREE.Raycaster(new THREE.Vector3(tagC.x, tagC.y, -3), new THREE.Vector3(0, 0, 1)).intersectObject(p.body, true)[0];
      expect(hit).toBeTruthy();
      expect((hit.point.z - tagBox.max.z) / p.k, 'tag to chest').toBeLessThanOrEqual(0.07);
    });
  }

  // Fix wave I1: the sniff and the pinned pose carry the collar on the neck too.
  // (Lower and flatter than the stalk, so only the ring's place on the neck and
  // the tag showing are pinned here, not the stalk's tag-to-chest distances.)
  for (const state of ['sniff', 'pinned']) for (const t of [0.7, 1.3]) {
    it(`${state} t ${t}: the ring keeps its place on the neck; the tag shows`, () => {
      const cat = posed(state, t, 0), p = parts(cat);
      expect(ringOffset(cat).distanceTo(restOffset), 'ring on the neck').toBeLessThanOrEqual(0.01);
      const skull = p.head.children[0], muzzle = p.head.children[1];
      const tagC = new THREE.Box3().setFromObject(p.tag, true).getCenter(new THREE.Vector3());
      expect(inside(skull, 0.21, tagC) || inside(muzzle, 0.09, tagC), 'the tag shows').toBe(false);
    });
  }
  // keepChestUnderHead holds the chest at the UNYAWED point (T + S·c) when the
  // torso yaws, so the posed chest must be read through the underside: a body
  // turned side-on under a neck pose still keeps the ring on the neck.
  it('a yawed torso (pinned, turned 0.3 rad): the ring still keeps its place on the neck', () => {
    for (const yaw of [0.3, -0.34]) {
      const cat = posed('pinned', 1.3, 0);
      cat.userData.parts.body.rotation.y = yaw;
      refitNeck(cat, 'pinned');
      cat.updateMatrixWorld(true);
      expect(ringOffset(cat).distanceTo(restOffset), `yaw ${yaw}`).toBeLessThanOrEqual(0.01);
    }
  });

  // Accessories polish Task 4: the collar rides the neck in every pose, and
  // standing at rest (breathing at 0) the carry is the identity.
  it('standing at rest, the collar sits where it was built (within 1e-9); leaving the stalk puts it back', () => {
    const fresh = buildCat('digit').userData.parts.head.getObjectByName('collar');
    const cat = posed('stalk', 1.3, 0); animateCat(cat, 'follow', 0, 0, false);
    const c = cat.userData.parts.head.getObjectByName('collar');
    expect(closeDiffs(c.position.toArray(), fresh.position.toArray(), 1e-9)).toEqual([]);
    expect(closeDiffs(c.quaternion.toArray(), fresh.quaternion.toArray(), 1e-9)).toEqual([]);
  });
});

// Fix wave I3: the neck-slot pieces (bandana, necktie, bowtie, scarf, the
// streamer scarf) hang on the head at the collar's seam. They ride the neck
// with the collar (the same rigid move), so a scarf's ring never sticks out
// under the chin. Accessories polish Task 4: in every pose now (the stretch
// excepted, where they are worn on the head as built), not only the stalk,
// the sniff and the pinned pose; standing at rest they are exactly as built.
describe('animateCat: neckwear rides the neck with the collar (fix wave I3)', () => {
  const PIECES = { bandana: 1, necktie: 2, bowtie: 3, scarf: 2, streamerscarf: 6 };
  // an item's move from where it was built, in the head's frame: posed · built⁻¹
  const moveOf = (item, built) => {
    item.updateMatrix(); built.updateMatrix();
    return item.matrix.clone().multiply(built.matrix.clone().invert()).toArray();
  };
  it('the head records its neck pieces at build time, and only those', () => {
    for (const [neck, n] of Object.entries(PIECES)) {
      const head = buildCat('tabby', { collar: 'bell', neck }).userData.parts.head;
      expect(head.userData.neckwear, neck).toHaveLength(n);
      for (const item of head.userData.neckwear) expect(item.parent, neck).toBe(head);
      expect(head.userData.neckwear.includes(head.userData.collar), neck).toBe(false);
    }
    expect(buildCat('tabby').userData.parts.head.userData.neckwear ?? []).toEqual([]);
    expect(buildCat('tabby', { neck: 'scarf' }, { simple: true }).userData.parts.head.userData.neckwear).toHaveLength(2);
  });
  for (const state of ['stalk', 'sniff', 'pinned', 'requestPet', 'groom', 'cross', 'nap']) for (const neck of ['scarf', 'bowtie']) {
    it(`${state}, ${neck}: every piece makes the collar's move; standing at rest puts them back`, () => {
      const fresh = buildCat('tabby', { collar: 'bell', neck }).userData.parts.head;
      const cat = buildCat('tabby', { collar: 'bell', neck });
      const head = cat.userData.parts.head;
      animateCat(cat, state, 1.3, 0, false);
      const collarMove = moveOf(head.userData.collar, fresh.userData.collar);
      // the collar did move: otherwise "same move" would be vacuous
      expect(head.userData.collar.position.distanceTo(fresh.userData.collar.position)).toBeGreaterThan(0.005);
      head.userData.neckwear.forEach((item, i) => {
        expect(closeDiffs(moveOf(item, fresh.userData.neckwear[i]), collarMove, 1e-6), `${neck} piece ${i}`).toEqual([]);
      });
      animateCat(cat, 'follow', 0, 0, false);
      head.userData.neckwear.forEach((item, i) => {
        expect(closeDiffs(item.position.toArray(), fresh.userData.neckwear[i].position.toArray(), 1e-9)).toEqual([]);
        expect(closeDiffs(item.quaternion.toArray(), fresh.userData.neckwear[i].quaternion.toArray(), 1e-9)).toEqual([]);
      });
    });
  }
  it('with no collar, a scarf makes the move a collar would have made', () => {
    const withCollar = buildCat('tabby', { collar: 'bell', neck: 'scarf' });
    const bare = buildCat('tabby', { neck: 'scarf' });
    const fresh = buildCat('tabby', { neck: 'scarf' }).userData.parts.head;
    animateCat(withCollar, 'stalk', 1.3, 0, false); animateCat(bare, 'stalk', 1.3, 0, false);
    const wHead = withCollar.userData.parts.head, bHead = bare.userData.parts.head;
    bHead.userData.neckwear.forEach((item, i) => {
      expect(closeDiffs(moveOf(item, fresh.userData.neckwear[i]), moveOf(wHead.userData.neckwear[i], fresh.userData.neckwear[i]), 1e-6)).toEqual([]);
    });
    expect(bHead.userData.neckwear[0].position.distanceTo(fresh.userData.neckwear[0].position)).toBeGreaterThan(0.005);
  });
  // Task 4: standing at rest (follow, breathing at 0) the neck carry is the
  // identity, for every breed; walking they ride the neck (the collar's move,
  // and they did move); in the stretch they are worn on the head as built.
  it('standing at rest the neck pieces are exactly as built (within 1e-9); walking they ride the neck; the stretch wears them as built', () => {
    for (const breed of ['tabby', 'digit', 'persian', 'mainecoon', 'd2', 'robbie']) {
      const fresh = buildCat(breed, { collar: 'bell', neck: 'streamerscarf' }).userData.parts.head;
      const built = [fresh.userData.collar, ...fresh.userData.neckwear];
      const items = (h) => [h.userData.collar, ...h.userData.neckwear];
      for (const [state, t, speed] of [['follow', 0, 0], ['stretch', 1.3, 0]]) {
        const cat = buildCat(breed, { collar: 'bell', neck: 'streamerscarf' });
        animateCat(cat, 'stalk', 1.3, 0, false); animateCat(cat, state, t, speed, false);
        items(cat.userData.parts.head).forEach((item, i) => {
          expect(closeDiffs(item.position.toArray(), built[i].position.toArray(), 1e-9), `${breed} ${state} ${i}`).toEqual([]);
          expect(closeDiffs(item.quaternion.toArray(), built[i].quaternion.toArray(), 1e-9), `${breed} ${state} ${i}`).toEqual([]);
        });
      }
      for (const t of [0.4, 1.3, 2.2]) {
        const head = buildCat(breed, { collar: 'bell', neck: 'streamerscarf' }).userData.parts.head;
        animateCat(head.parent, 'follow', t, 1.5, false);
        const collarMove = moveOf(head.userData.collar, built[0]);
        expect(head.userData.collar.position.distanceTo(built[0].position), `${breed} walk t ${t}`).toBeGreaterThan(1e-4);
        head.userData.neckwear.forEach((item, i) => {
          expect(closeDiffs(moveOf(item, built[i + 1]), collarMove, 1e-6), `${breed} walk t ${t} piece ${i}`).toEqual([]);
        });
      }
    }
  });
});
