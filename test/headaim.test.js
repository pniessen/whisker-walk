import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat, refitNeck } from '../src/cat/animator.js';
import { setCatScars, fitScars } from '../src/cat/scarmesh.js';
import { PRESETS, STATES, r4, fingerprintCat } from './helpers/catfingerprint.js';

// =============================================================================
// Market step 3, Task 7 (ruling V10): she looks up at a stallholder cooing at
// her. src/cat/headaim.js's aimHead runs AFTER animateCat and only ever adds to
// the head's turn, and only while a target is set (or the look is still
// easing out). With no target, nothing is written at all, so every pose in
// every place is exactly animateCat's: the first test proves that across every
// preset, Hagrid and every pose, by the same dump and the same fingerprint the
// golden tests use.
// =============================================================================

const { aimHead, HEAD_AIM } = await import('../src/cat/headaim.js');

const CATS = [...PRESETS, 'hagrid'];
const TIMES = [0.4, 1.3, 2.9];
const DT = 1 / 60;

// every Object3D's position, quaternion and scale, rounded to 4 places
function dump(cat) {
  const out = [];
  cat.traverse((o) => {
    out.push([...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].map(r4).join(','));
  });
  return out;
}

// where one eye is in the world: a behaviour reading of where she looks
function eyeAt(cat) {
  cat.updateMatrixWorld(true);
  return cat.userData.parts.head.userData.eyes.eyes[0].getWorldPosition(new THREE.Vector3());
}

// a cat at (x, 0, z) facing yaw (forward is her group's -z, as player.js turns her)
function standing(breed = 'tabby', yaw = 0) {
  const cat = buildCat(breed);
  cat.position.set(2, 0, -3);
  cat.rotation.y = yaw;
  return cat;
}

// the head's world spot as aimHead reads it (head.position through the group)
function headWorld(cat) {
  cat.updateMatrixWorld(true);
  return cat.userData.parts.head.getWorldPosition(new THREE.Vector3());
}

afterEach(() => vi.restoreAllMocks());

describe('the look-up (Market step 3, Task 7): an opt-in head aim after the pose', () => {
  it('has the agreed limits', () => {
    expect(HEAD_AIM).toEqual({ maxYaw: 0.9, maxUp: 0.55, rate: 5, poses: ['follow', 'requestPet'] });
    expect(Object.isFrozen(HEAD_AIM)).toBe(true);
  });

  it("with no target ever set, every cat in every pose is exactly animateCat's", () => {
    for (const breed of CATS) {
      // one cat that sees aimHead after every pose, and its twin that never does
      const aimed = buildCat(breed);
      const plain = buildCat(breed);
      for (const state of STATES) {
        for (const t of TIMES) {
          animateCat(aimed, state, t, 0, false);
          const before = dump(aimed);
          const printBefore = fingerprintCat(aimed).lines;
          aimHead(aimed, null, DT, state);
          aimHead(aimed, undefined, DT, state, 1.5);
          expect(dump(aimed), `${breed} ${state} ${t}: written`).toEqual(before);
          animateCat(plain, state, t, 0, false);
          expect(dump(aimed), `${breed} ${state} ${t}: twin`).toEqual(dump(plain));
          expect(fingerprintCat(aimed).lines, `${breed} ${state} ${t}: fingerprint`).toEqual(printBefore);
          expect(fingerprintCat(plain).lines, `${breed} ${state} ${t}: twin fingerprint`).toEqual(printBefore);
        }
      }
      expect(aimed.userData.headAim, breed).toBeUndefined();
    }
  }, 90_000);

  it('a target above and to her left turns her head up and left, never past the limits', () => {
    // facing -z (yaw 0): her left is -x
    const cat = standing('tabby', 0);
    animateCat(cat, 'follow', 1.3, 0, false);
    const restEye = eyeAt(cat);
    const restRot = cat.userData.parts.head.rotation.clone();
    const h = headWorld(cat);
    const target = { x: h.x - 1.2, y: h.y + 1.0, z: h.z - 2.0 };
    for (let i = 0; i < 30; i++) { animateCat(cat, 'follow', 1.3, 0, false); aimHead(cat, target, DT, 'follow'); }
    const eye = eyeAt(cat);
    expect(eye.y, 'up').toBeGreaterThan(restEye.y + 0.02);
    expect(eye.x, 'left').toBeLessThan(restEye.x - 0.02);
    // the face points at the target: the eye-to-target line and the face's front agree
    const head = cat.userData.parts.head;
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const want = new THREE.Vector3(target.x - h.x, target.y - h.y, target.z - h.z).normalize();
    expect(front.angleTo(want), 'looking at it').toBeLessThan(0.05);
    // no roll: the face's own sideways axis stays level
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    expect(Math.abs(side.y), 'level').toBeLessThan(1e-6);
    expect(head.rotation.x).not.toBe(restRot.x);

    // 5 m straight up ahead: exactly maxUp, and no turn
    const up = standing('tabby', 0.7);
    animateCat(up, 'follow', 1.3, 0, false);
    const rx0 = up.userData.parts.head.rotation.x;
    const u = headWorld(up);
    const fwd = { x: -Math.sin(0.7), z: -Math.cos(0.7) };
    const high = { x: u.x + fwd.x * 0.5, y: u.y + 5, z: u.z + fwd.z * 0.5 };
    for (let i = 0; i < 30; i++) { animateCat(up, 'follow', 1.3, 0, false); aimHead(up, high, DT, 'follow'); }
    expect(up.userData.parts.head.rotation.x - rx0).toBeCloseTo(HEAD_AIM.maxUp, 9);
    expect(up.userData.parts.head.rotation.y).toBeCloseTo(0, 9);
    expect(up.userData.parts.head.rotation.z).toBeCloseTo(0, 9);

    // behind her at head height, a little to either side: exactly the most she turns, the short way round
    for (const side of [1, -1]) {
      const c = standing('tabby', -0.4);
      animateCat(c, 'follow', 1.3, 0, false);
      const b = headWorld(c);
      // behind = +z in her own frame; her left (-x in her frame) is side 1
      const lx = -side * 0.6, lz = 3;
      const yaw = -0.4;
      const behind = {
        x: b.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
        y: b.y,
        z: b.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
      };
      for (let i = 0; i < 60; i++) { animateCat(c, 'follow', 1.3, 0, false); aimHead(c, behind, DT, 'follow'); }
      const rot = c.userData.parts.head.rotation;
      expect(rot.y, `side ${side}`).toBeCloseTo(side * HEAD_AIM.maxYaw, 9);
      expect(rot.x, `side ${side}: no up`).toBeCloseTo(0, 9);
    }

    // sitting asking for a pet, it adds to the sit's own head tip
    const sit = standing('tabby', 0);
    animateCat(sit, 'requestPet', 1.3, 0, false);
    const sitRx = sit.userData.parts.head.rotation.x;
    const s = headWorld(sit);
    const above = { x: s.x, y: s.y + 5, z: s.z - 0.5 };
    for (let i = 0; i < 30; i++) { animateCat(sit, 'requestPet', 1.3, 0, false); aimHead(sit, above, DT, 'requestPet'); }
    expect(sit.userData.parts.head.rotation.x - sitRx).toBeCloseTo(HEAD_AIM.maxUp, 9);
  });

  it('it eases in over about a fifth of a second, and out the same', () => {
    const cat = standing('tabby', 0);
    animateCat(cat, 'follow', 1.3, 0, false);
    const h = headWorld(cat);
    const target = { x: h.x, y: h.y + 5, z: h.z - 0.5 };
    const pitch = () => cat.userData.parts.head.rotation.x; // follow's own is 0
    const frame = (tgt) => { animateCat(cat, 'follow', 1.3, 0, false); aimHead(cat, tgt, DT, 'follow'); return pitch(); };
    const most = HEAD_AIM.maxUp * 1.5 * HEAD_AIM.rate * DT + 1e-9; // the smoothstep's steepest
    // in
    let last = 0;
    const seen = [];
    for (let i = 1; i <= 30; i++) {
      const p = frame(target);
      expect(p - last, `in, frame ${i}: never a snap`).toBeLessThanOrEqual(most);
      expect(p, `in, frame ${i}: never back`).toBeGreaterThanOrEqual(last - 1e-12);
      seen.push(p);
      last = p;
    }
    expect(seen[0], 'the first frame is a small start').toBeLessThan(0.05 * HEAD_AIM.maxUp);
    expect(seen[5], 'a tenth of a second: part way').toBeGreaterThan(0.2 * HEAD_AIM.maxUp);
    expect(seen[5]).toBeLessThan(0.8 * HEAD_AIM.maxUp);
    expect(seen[12], 'a fifth of a second (and a frame): all the way').toBeCloseTo(HEAD_AIM.maxUp, 9);
    // out
    const out = [];
    for (let i = 1; i <= 30; i++) {
      const p = frame(null);
      expect(last - p, `out, frame ${i}: never a snap`).toBeLessThanOrEqual(most);
      expect(p, `out, frame ${i}: never back up`).toBeLessThanOrEqual(last + 1e-12);
      out.push(p);
      last = p;
    }
    expect(out[0]).toBeGreaterThan(0.95 * HEAD_AIM.maxUp);
    expect(out[5]).toBeGreaterThan(0.2 * HEAD_AIM.maxUp);
    expect(out[5]).toBeLessThan(0.8 * HEAD_AIM.maxUp);
    expect(out[12]).toBe(0);
    expect(cat.userData.headAim.w).toBe(0);
  });

  it('once it has eased out it writes nothing', () => {
    for (const breed of ['tabby', 'persian', 'hagrid']) {
      for (const state of HEAD_AIM.poses) {
        const cat = standing(breed, 0.3);
        const twin = standing(breed, 0.3);
        const h = (animateCat(cat, state, 0, 0, false), headWorld(cat));
        const target = { x: h.x + 1, y: h.y + 1.5, z: h.z - 1 };
        let t = 0;
        for (let i = 0; i < 60; i++) {
          t += DT;
          animateCat(cat, state, t, 0, false); aimHead(cat, target, DT, state);
          animateCat(twin, state, t, 0, false);
        }
        expect(dump(cat), `${breed} ${state}: aimed`).not.toEqual(dump(twin));
        for (let i = 0; i < 120; i++) {
          t += DT;
          animateCat(cat, state, t, 0, false); aimHead(cat, null, DT, state);
          animateCat(twin, state, t, 0, false);
        }
        expect(dump(cat), `${breed} ${state}`).toEqual(dump(twin));
        expect(fingerprintCat(cat).lines, `${breed} ${state}: fingerprint`).toEqual(fingerprintCat(twin).lines);
        // and from here on nothing is written at all
        const before = dump(cat);
        aimHead(cat, null, DT, state);
        expect(dump(cat)).toEqual(before);
      }
    }
  });

  it('the neck, the collar and a face scar go with the turned head', () => {
    const cat = buildCat('tabby', { collar: 'bell', neck: 'scarf' });
    setCatScars(cat, [{ site: 'face', stage: 'full', side: 'l' }]);
    animateCat(cat, 'follow', 1.3, 0, false);
    const ring = cat.userData.parts.head.userData.collar;
    expect(ring, 'the collar is on the head').toBeTruthy();
    const ringBefore = ring.position.clone();
    // the neck's skin is part of the underside's mesh (model.js, neck.js)
    const underside = cat.userData.parts.underside;
    expect(underside?.userData.neck, 'a full build has its neck skin').toBeTruthy();
    const neckBefore = Array.from(underside.geometry.attributes.position.array);
    const scar = cat.userData.parts.scars;
    const scarBefore = Array.from(scar.geometry.attributes.position.array);
    const h = headWorld(cat);
    const target = { x: h.x - 2, y: h.y + 1.5, z: h.z - 1 };
    for (let i = 0; i < 30; i++) { animateCat(cat, 'follow', 1.3, 0, false); aimHead(cat, target, DT, 'follow'); }
    // refitted to the turned head: the collar is carried, the neck's skin redrawn, the face scar moved
    expect(ring.position.distanceTo(ringBefore)).toBeGreaterThan(1e-4);
    expect(Array.from(underside.geometry.attributes.position.array)).not.toEqual(neckBefore);
    expect(Array.from(scar.geometry.attributes.position.array)).not.toEqual(scarBefore);
    // exactly as animateCat would fit them to a head already turned that way
    const twin = buildCat('tabby', { collar: 'bell', neck: 'scarf' });
    setCatScars(twin, [{ site: 'face', stage: 'full', side: 'l' }]);
    animateCat(twin, 'follow', 1.3, 0, false);
    twin.userData.parts.head.rotation.copy(cat.userData.parts.head.rotation);
    refitNeck(twin, 'follow');
    fitScars(twin);
    expect(fingerprintCat(cat).lines).toEqual(fingerprintCat(twin).lines);
  });

  it('walking, stalking, napping, grooming or perched, the target is ignored', () => {
    const cases = [['follow', 1.5, 'walking'], ['stalk', 0.8, 'stalking'], ['nap', 0, 'napping'], ['groom', 0, 'grooming'], ['perch', 0, 'perched']];
    for (const [state, speed, label] of cases) {
      const cat = standing('tabby', 0);
      const twin = standing('tabby', 0);
      animateCat(cat, state, 0, speed, false);
      const h = headWorld(cat);
      const target = { x: h.x - 1, y: h.y + 2, z: h.z - 1 };
      let t = 0;
      for (let i = 0; i < 60; i++) {
        t += DT;
        animateCat(cat, state, t, speed, false); aimHead(cat, target, DT, state, speed);
        animateCat(twin, state, t, speed, false);
        expect(dump(cat), `${label}, frame ${i}`).toEqual(dump(twin));
      }
      expect(cat.userData.headAim.w, label).toBe(0);
    }
  });

  it('nothing random and nothing allocated per frame', () => {
    // built first: a build may draw its own numbers; the look draws none
    const cat = standing('tabby', 0);
    const a = standing('calico', 0.2);
    const b = standing('calico', 0.2);
    const random = vi.spyOn(Math, 'random');
    const date = vi.spyOn(Date, 'now');
    const perf = vi.spyOn(performance, 'now');
    animateCat(cat, 'follow', 1.3, 0, false);
    const h = headWorld(cat);
    const target = Object.freeze({ x: h.x - 1, y: h.y + 1, z: h.z - 2 });
    aimHead(cat, target, DT, 'follow');
    const state = cat.userData.headAim;
    const rotation = cat.userData.parts.head.rotation;
    const keys = Object.keys(cat.userData).join(',');
    for (let i = 0; i < 90; i++) {
      animateCat(cat, 'follow', 1.3, 0, false);
      aimHead(cat, i < 45 ? target : null, DT, 'follow');
      expect(cat.userData.headAim).toBe(state); // one record, made on the first target, reused
      expect(cat.userData.parts.head.rotation).toBe(rotation);
    }
    expect(Object.keys(cat.userData).join(',')).toBe(keys);
    expect(Object.keys(state)).toContain('w');
    expect(random).not.toHaveBeenCalled();
    expect(date).not.toHaveBeenCalled();
    expect(perf).not.toHaveBeenCalled();
    // and two cats with the same frames pose byte-identically
    for (const c of [a, b]) {
      for (let i = 0; i < 20; i++) { animateCat(c, 'follow', i * DT, 0, false); aimHead(c, target, DT, 'follow'); }
    }
    expect(dump(a)).toEqual(dump(b));
  });

  it('a missing head or a bad dt never throws or writes junk', () => {
    expect(() => aimHead(new THREE.Group(), { x: 0, y: 1, z: 0 }, DT, 'follow')).not.toThrow();
    const cat = standing('tabby', 0);
    animateCat(cat, 'follow', 1.3, 0, false);
    const before = dump(cat);
    aimHead(cat, { x: 0, y: 5, z: -10 }, NaN, 'follow');
    aimHead(cat, { x: 0, y: 5, z: -10 }, -1, 'follow');
    expect(dump(cat)).toEqual(before);
    for (const v of dump(cat)) expect(v).not.toMatch(/NaN/);
  });
});
