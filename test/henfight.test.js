import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import { buildCat, catDims, catBackY } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { henBodyGeometry, henWingGeometry } from '../src/cat/hen.js';
import { HEN_FIGHT_STATES, henFightState, isHenFightState } from '../src/cat/henfight.js';
import { fingerprintCat, buildFor } from './helpers/catfingerprint.js';

// polish-hen Task 1: Hagrid's hen-flavoured fight poses and flappable fight
// wings (src/cat/henfight.js). The rig is lazy: a hen that never fights has
// exactly today's meshes (hagrid-golden.json pins them).

const HAGRID = JSON.parse(fs.readFileSync(new URL('./fixtures/hagrid-golden.json', import.meta.url), 'utf8'));
const HEN_STATES = Object.values(HEN_FIGHT_STATES);
const TIMES = [0, 0.37, 1.3, 2.9];
const OPEN_STATES = ['henArch', 'henFlinch', 'henPinned', 'henScared'];

const posed = (state, t = 1.3, reducedMotion = false, cat = buildCat('hagrid')) => {
  animateCat(cat, state, t, 0, reducedMotion);
  cat.updateMatrixWorld(true);
  return cat;
};

const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const weighted = (arr) => {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * (i % 7 + 1);
  return r4(sum);
};
// What shows: every visible mesh (an invisible object hides its subtree), by
// its geometry's positions and its world matrix.
function visibleFingerprint(cat) {
  cat.updateMatrixWorld(true);
  const lines = [];
  const walk = (o, path) => {
    if (!o.visible) return;
    if (o.isMesh) lines.push(`${path}|v${o.geometry.attributes.position.count}|p${weighted(o.geometry.attributes.position.array)}|${Array.from(o.matrixWorld.elements, r4).join(',')}`);
    o.children.forEach((k, i) => walk(k, `${path}.${i}`));
  };
  walk(cat, 'root');
  return lines;
}

afterEach(() => vi.restoreAllMocks());

describe('hen fight states', () => {
  it('maps each fight state to its hen state and passes the rest through', () => {
    expect(HEN_FIGHT_STATES).toEqual({
      cross: 'henCross', arch: 'henArch', land: 'henLand', pounce: 'henPounce', swipe: 'henSwipe', rearUp: 'henRearUp',
      flinch: 'henFlinch', pinning: 'henPinning', pinned: 'henPinned', roll: 'henRoll', scared: 'henScared',
    });
    expect(Object.isFrozen(HEN_FIGHT_STATES)).toBe(true);
    for (const [k, v] of Object.entries(HEN_FIGHT_STATES)) {
      expect(henFightState(k)).toBe(v);
      expect(isHenFightState(v)).toBe(true);
      expect(isHenFightState(k)).toBe(false);
    }
    for (const s of ['follow', 'stalk', 'backUp']) expect(henFightState(s)).toBe(s);
  });
});

describe('hen body geometry', () => {
  it('henBodyGeometry() is unchanged and splits into wingless body + two wings', () => {
    const today = henBodyGeometry();
    const explicit = henBodyGeometry({ wings: true });
    expect(Array.from(today.attributes.position.array)).toEqual(Array.from(explicit.attributes.position.array));
    expect(Array.from(today.attributes.color.array)).toEqual(Array.from(explicit.attributes.color.array));
    const wingless = henBodyGeometry({ wings: false });
    expect(wingless.attributes.position.count + 2 * henWingGeometry(1).attributes.position.count).toBe(today.attributes.position.count);
    expect(henWingGeometry(-1).attributes.position.count).toBe(henWingGeometry(1).attributes.position.count);
    // the golden body line still holds
    expect(fingerprintCat(buildFor('hagrid:follow'))).toEqual(HAGRID['hagrid:follow']);
  });
});

describe('hen fight poses', () => {
  it.each(HEN_STATES)('%s: finite transforms, feet on or above the ground', (state) => {
    for (const t of TIMES) {
      const cat = posed(state, t);
      cat.traverse((o) => {
        for (const v of [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()]) expect(Number.isFinite(v)).toBe(true);
      });
      for (const leg of cat.userData.parts.legs.slice(0, 2)) {
        const box = new THREE.Box3().setFromObject(leg.userData.paw, true);
        expect(box.min.y, `${state} t=${t}`).toBeGreaterThanOrEqual(-0.02);
      }
    }
  });

  it('wings open in the arch, flinch, pinned, scared and some of the flap; folded in the roll', () => {
    const open = (cat) => cat.userData.henRig.wings.map((w, i) => w.rotation.z * (i === 0 ? -1 : 1));
    for (const state of OPEN_STATES) {
      for (const o of open(posed(state))) expect(o, state).toBeGreaterThanOrEqual(0.5);
    }
    const flaps = TIMES.concat([0.1, 0.2, 0.5, 0.7]).map((t) => Math.min(...open(posed('henPounce', t))));
    expect(Math.max(...flaps)).toBeGreaterThanOrEqual(0.5);
    for (const o of open(posed('henRoll'))) expect(o).toBe(0);
  });

  it('the swipe swings the right wing\'s tip forward', () => {
    const tipZ = (cat) => {
      const mesh = cat.userData.henRig.wings[1].children[0];
      const p = mesh.geometry.attributes.position;
      let best = 0, far = -1;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        if (v.length() > far) { far = v.length(); best = i; }
      }
      return v.fromBufferAttribute(p, best).applyMatrix4(mesh.matrixWorld).z;
    };
    const cat = posed('henSwipe');
    const swung = tipZ(cat);
    for (const w of cat.userData.henRig.wings) w.rotation.set(0, 0, 0);
    cat.updateMatrixWorld(true);
    expect(swung).toBeLessThan(tipZ(cat) - 0.05);
  });

  it('every hen state looks different from the follow', () => {
    const follow = fingerprintCat(posed('follow'));
    for (const state of HEN_STATES) expect(fingerprintCat(posed(state)), state).not.toEqual(follow);
  });

  it('back to the follow, he is exactly today\'s hen', () => {
    const cat = buildCat('hagrid');
    animateCat(cat, 'henArch', 0.8, 0);
    animateCat(cat, 'henPounce', 0.9, 0);
    animateCat(cat, 'follow', 1.3, 0);
    const fresh = posed('follow');
    expect(visibleFingerprint(cat)).toEqual(visibleFingerprint(fresh));
    expect(cat.userData.henRig.wings.every((w) => !w.visible && w.rotation.x === 0 && w.rotation.y === 0 && w.rotation.z === 0)).toBe(true);
    const a = new THREE.Box3().setFromObject(cat), b = new THREE.Box3().setFromObject(fresh);
    for (const [u, v] of [[a.min, b.min], [a.max, b.max]]) {
      for (const k of ['x', 'y', 'z']) expect(Math.abs(u[k] - v[k])).toBeLessThan(1e-4);
    }
  });

  it('a follow never builds the rig; a hen state builds it once, without Math.random', () => {
    const cat = buildCat('hagrid');
    animateCat(cat, 'follow', 1.3, 0);
    animateCat(cat, 'cross', 1.3, 0);
    expect(cat.userData.henRig).toBeUndefined();
    const spy = vi.spyOn(Math, 'random');
    animateCat(cat, 'henArch', 1.3, 0);
    expect(spy).toHaveBeenCalledTimes(0);
    const { wings, winglessGeo } = cat.userData.henRig;
    expect(wings).toHaveLength(2);
    expect(cat.userData.parts.body.geometry).toBe(winglessGeo);
    expect(wings.every((w) => w.visible && w.parent === cat.userData.parts.body)).toBe(true);
    animateCat(cat, 'follow', 1.3, 0);
    animateCat(cat, 'henSwipe', 1.3, 0);
    expect(cat.userData.henRig.wings[0]).toBe(wings[0]);
    expect(cat.userData.henRig.wings[1]).toBe(wings[1]);
  });

  it('the fight wings carry the body\'s shadow flags and material', () => {
    const cat = buildCat('hagrid');
    cat.userData.parts.body.castShadow = true;
    cat.userData.parts.body.receiveShadow = true;
    animateCat(cat, 'henCross', 1.3, 0);
    for (const w of cat.userData.henRig.wings) {
      const mesh = w.children[0];
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.material).toBe(cat.userData.parts.body.material);
    }
  });

  it.each(HEN_STATES)('%s holds still under reducedMotion', (state) => {
    expect(fingerprintCat(posed(state, 0.4, true))).toEqual(fingerprintCat(posed(state, 2.2, true)));
  });

  it('a cat is never touched by the hen rig', () => {
    const tabby = buildCat('tabby');
    expect(() => animateCat(tabby, 'henArch', 1.3, 0)).not.toThrow();
    expect(tabby.userData.henRig).toBeUndefined();
  });
});

// polish-hen Task 2: Hagrid's fight dims are measured from his hen poses.
describe('catDims for Hagrid', () => {
  it('has a real heel and a hen-pinned back, and leaves him a fresh follow', () => {
    const hen = buildCat('hagrid');
    const d = catDims(hen);
    for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true);
    expect(d.hindZ).toBeGreaterThan(0);
    expect(d.pinnedBackY).toBeCloseTo(catBackY(buildCat('hagrid'), 'henPinned'), 9);
    const fresh = buildCat('hagrid');
    animateCat(fresh, 'follow', 0, 0);
    expect(visibleFingerprint(hen)).toEqual(visibleFingerprint(fresh));
  });

  it('leaves a tabby\'s numbers exactly as they were', () => {
    expect(catDims(buildCat('tabby'))).toEqual({
      top: 0.9683838503046882, backY: 0.6722790867090225, pinnedBackY: 0.4144409424304961,
      hindZ: 0.2949736685231328, pivotY: 0.43,
    });
  });
});
