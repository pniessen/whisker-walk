import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat, refitNeck } from '../src/cat/animator.js';
import { NECK, PROPORTION, HEAD } from '../src/cat/torso.js';
import { NECK_RINGS, torsoBox } from '../src/cat/neck.js';
import { PRESETS } from './helpers/catfingerprint.js';

// Cat realism round 1, B1 (2026-11-15): the neck is a skin from the torso to
// the skull, part of the underside's one mesh on a full build, re-laid every
// frame so it follows the head (neck.js, animator.js fitNeckSkin).
const STATES = ['follow', 'sniff', 'groom', 'stalk', 'nap', 'requestPet', 'perch', 'stretch', 'pounce', 'scared', 'cross', 'swim', 'wade', 'land', 'roll', 'pinned', 'flinch', 'arch'];
const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const v = new THREE.Vector3();

// Ring `ring` of the neck, cat frame (before the group's scale).
function ringOf(cat, ring) {
  const { body, underside } = cat.userData.parts;
  const neck = underside.userData.neck, N = neck.around, pos = underside.geometry.attributes.position;
  body.updateMatrix(); underside.updateMatrix();
  const out = [];
  for (let j = 0; j < N; j++) out.push(v.fromBufferAttribute(pos, neck.start + ring * N + j).applyMatrix4(underside.matrix).applyMatrix4(body.matrix).clone());
  return out;
}

describe('the neck (cat realism B1)', () => {
  it('a full build has one, in the underside mesh; a simple build has none; neither gains a mesh', () => {
    for (const b of PRESETS) {
      const full = buildCat(b), simple = buildCat(b, undefined, { simple: true });
      const neck = full.userData.parts.underside.userData.neck;
      expect(neck, b).toBeTruthy();
      expect(full.userData.parts.underside.geometry.userData.ranges.neck[1] - neck.start, b).toBe(NECK_RINGS * NECK.AROUND);
      expect(simple.userData.parts.underside.userData.neck, b).toBeUndefined();
      expect(simple.userData.parts.underside.geometry.userData.ranges.neck, b).toBeUndefined();
      expect(full.userData.parts.body.children.filter((c) => c.isMesh), b).toHaveLength(1); // the underside alone
    }
  });

  it('in every pose its ends stay on the body and on the head, and every point is finite', () => {
    for (const b of ['tabby', 'digit', 'persian', 'siamese']) {
      const cat = buildCat(b);
      const { body, head, underside } = cat.userData.parts;
      const { loops, around: N } = underside.userData.neck;
      for (const state of STATES) for (const [t, speed] of [[0, 0], [1.3, 0], [0.7, 1.5]]) {
        animateCat(cat, state, t, speed, false);
        body.updateMatrix(); head.updateMatrix();
        const B = ringOf(cat, 0), H = ringOf(cat, NECK_RINGS - 1);
        for (let j = 0; j < N; j++) {
          const where = `${b} ${state} t ${t} point ${j}`;
          expect(B[j].distanceTo(v.fromArray(loops.b, j * 3).applyMatrix4(body.matrix)), `${where}: on the body`).toBeLessThan(1e-5);
          expect(H[j].distanceTo(v.fromArray(loops.h, j * 3).applyMatrix4(head.matrix)), `${where}: on the head`).toBeLessThan(1e-5);
        }
        const p = underside.geometry.attributes.position.array, n = underside.geometry.attributes.normal.array;
        const at = underside.userData.neck.start * 3;
        for (let k = at; k < at + NECK_RINGS * N * 3; k++) { expect(Number.isFinite(p[k])).toBe(true); expect(Number.isFinite(n[k])).toBe(true); }
        for (let k = at; k < at + NECK_RINGS * N * 3; k += 3) expect(Math.hypot(n[k], n[k + 1], n[k + 2])).toBeCloseTo(1, 4);
      }
    }
  });

  it('follows a head turned after the pose (refitNeck)', () => {
    const cat = buildCat('tabby');
    animateCat(cat, 'follow', 0, 0, false);
    const before = ringOf(cat, NECK_RINGS - 1)[3].clone();
    cat.userData.parts.head.rotation.y += 0.6;
    refitNeck(cat, 'follow');
    const { head, underside } = cat.userData.parts;
    head.updateMatrix();
    const after = ringOf(cat, NECK_RINGS - 1)[3];
    expect(after.distanceTo(before)).toBeGreaterThan(0.03);
    expect(after.distanceTo(v.fromArray(underside.userData.neck.loops.h, 9).applyMatrix4(head.matrix))).toBeLessThan(1e-5);
  });

  it('a collar rests on it in every pose: the middle ring keeps its place inside the collar', () => {
    for (const b of ['tabby', 'digit', 'persian']) {
      const cat = buildCat(b, { ...BARE, collar: 'bell' });
      const { head } = cat.userData.parts;
      const ring = head.userData.collar.getObjectByName('collarRing');
      const inCollar = () => {
        cat.updateMatrixWorld(true);
        const inv = ring.matrixWorld.clone().invert(), s = cat.matrixWorld;
        return ringOf(cat, 2).map((p) => p.applyMatrix4(s).applyMatrix4(inv));
      };
      animateCat(cat, 'follow', 0, 0, false);
      const rest = inCollar();
      // inside the ring (radius 0.15, tube 0.028; the torus lies in its own xy
      // plane), at every side and at the throat (the nape is under the shoulders)
      const N = NECK.AROUND;
      for (let j = Math.ceil(N / 4); j <= N - Math.ceil(N / 4); j++) expect(Math.hypot(rest[j].x, rest[j].y), `${b} point ${j}`).toBeLessThan(0.15 - 0.028 + 0.012);
      for (const state of STATES) {
        animateCat(cat, state, 1.3, 0, false);
        const now = inCollar();
        // (the nape's points, the top third, are drawn in when the head drops: NECK.NAPE_REACH)
        const napeTo = cat.userData.parts.underside.userData.neck.napeTo;
        for (let j = napeTo + 1; j < N - napeTo; j++) expect(now[j].distanceTo(rest[j]), `${b} ${state} point ${j}`).toBeLessThan(1e-4);
      }
    }
  });

  it('a cat with a coat or a cape keeps its neck ahead of the cloth; a bare one bridges the nape', () => {
    const top = (cat) => { animateCat(cat, 'follow', 0, 0, false); return ringOf(cat, 0)[0]; };
    const bare = top(buildCat('tabby')), caped = top(buildCat('tabby', { ...BARE, body: 'cape' }));
    expect(bare.z).toBeGreaterThan(caped.z + 0.08); // back over the shoulders
    expect(caped.z).toBeLessThan(-0.8 * 0.32 * 1.12); // ahead of the cape's front edge (CAPE.zFront)
  });

  it('the torso is measured without it', () => {
    const cat = buildCat('tabby');
    animateCat(cat, 'follow', 0, 0, false);
    cat.updateMatrixWorld(true);
    const whole = new THREE.Box3().setFromObject(cat.userData.parts.body, true), torso = torsoBox(cat.userData.parts.body);
    expect(whole.max.y).toBeGreaterThan(torso.max.y + 0.01);
    expect(torso.max.y).toBeCloseTo(new THREE.Box3().setFromObject(buildCat('tabby', undefined, { simple: true }).userData.parts.body, true).max.y, 2);
  });

  it('the proportion options are off: 1 and 1', () => {
    expect(PROPORTION).toEqual({ head: 1, body: 1 });
    expect(buildCat('tabby').userData.parts.head.scale.x).toBe(HEAD.SCALE);
  });
});
