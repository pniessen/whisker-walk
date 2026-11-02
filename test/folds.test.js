import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildCat, catDims } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { FOLDS, FOLD_BY_STATE, applyFold } from '../src/cat/limbs.js';
import { POSE_FIT } from '../src/cat/torso.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { PRESETS, fingerprintCat } from './helpers/catfingerprint.js';
import { pokes as pokesOf, T1 } from './helpers/catpoke.js';

// Legs fold at the joints (body refinement Task 5, R1-R3): sitting tucks the
// hind legs under the haunch with the foot flat in front, napping and being
// pinned fold all four under the body, stalking bends them, a roll balls them
// up. Baked fold shapes are written into each limb's one geometry; the paw
// (and any boot part hung after it) moves to the fold's foot spot. The body
// rests exactly where the old squash left it.

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const LOOKS = {
  tabby: ['tabby', {}],
  persian: ['persian', {}],
  robbie: ['robbie', {}],
  d2: ['d2', {}],
  digit: ['digit', {}],
  fluffy: ['tabby', { look: { ...DEFAULT_LOOK, fur: 'fluffy', size: 1.15 } }],
  socks: ['tabby', { look: { ...DEFAULT_LOOK, pattern: 'socks' } }],
};
const FEET = [null, 'booties', 'goldbooties', 'sneakers', 'rainboots', 'socks'];
const SIMPLE = [false, true];

// Every cat in its own frame (group scale 1 at the origin): rig units.
function make(name, simple, feet = null) {
  const [breed, opts] = LOOKS[name] ?? [name, {}];
  const cat = buildCat(breed, { ...BARE, feet }, { ...opts, simple });
  cat.scale.setScalar(1);
  return cat;
}
const VARIANTS = Object.keys(LOOKS).flatMap((name) => SIMPLE.flatMap((simple) => FEET.map((feet) => ({ name, simple, feet }))));
const BARE_VARIANTS = VARIANTS.filter((v) => !v.feet);
const label = ({ name, simple, feet }) => `${name}${simple ? ' simple' : ''}${feet ? ` in ${feet}` : ''}`;

const CAT_STATES = ['follow', 'nap', 'stretch', 'groom', 'requestPet', 'perch', 'sniff', 'stalk', 'pounce', 'scared', 'cross', 'land', 'wade', 'swim', 'shake'];
const FIGHT_STATES = ['swipe', 'backUp', 'rearUp', 'flinch', 'pinned', 'pinning', 'roll', 'arch'];
const ALL_STATES = [...CAT_STATES, ...FIGHT_STATES];
const FOLD_STATES = ['nap', 'requestPet', 'perch', 'stalk', 'pinned', 'roll'];
const kindOf = (state, i) => FOLD_BY_STATE[state]?.[i < 2 ? 0 : 1] ?? 'stand';

const pose = (cat, state, t = 1.3, speed = 0) => {
  animateCat(cat, state, t, speed, false);
  cat.updateMatrixWorld(true);
  return cat;
};
const box = (obj) => new THREE.Box3().setFromObject(obj, true);
const limbOf = (leg) => leg.children[0];

// The body drop each fold state's pose() gives (PINNED.bodyDrop for pinned),
// and its head offset; every state but the roll is a crouch (the body comes
// down by legLift with it, as the old squash did).
const DROP = { nap: 0.1, stalk: 0.1, pinned: 0.1, requestPet: 0.02, perch: 0.02, roll: 0 };
const HEAD_DY = { nap: -0.24, stalk: -0.16, pinned: -0.22, requestPet: 0.06, perch: 0.06, roll: -0.1 };

// The poke measure and Task 1's baseline table (T1) live in helpers/catpoke.js.
const pokes = (cat, state) => pokesOf(cat, (i) => kindOf(state, i) !== 'stand');
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
// Standing legs: no worse than Task 1 (the old legs) + 0.002.
const allowed = (name, state) => Math.max(0.005, T1[name === 'digit' ? 'digit' : 'tabby'][state] + 0.002);
// Folded legs get their own, tight ceiling: measured + 0.002, floor 0.005. The
// Task 1 allowance (0.15 to 0.31 for nap, stalk and pinned) is the old squash's
// poke and is far too loose here: the folds reach 0.0084 at most standing still
// (Digit nap: 0.0070 full, 0.0084 simple) and every other still folded state is
// negative (-0.014 to -0.17), so a tucked thigh pushed 15 cm through the back
// must fail. Moving, Digit's walking stalk is the one other positive case: the
// walk gait still swings the crouched legs, measured 0.0359 full, 0.0290 simple.
const foldedAllowed = (name, state, moving = false) => {
  if (name === 'digit' && state === 'nap') return 0.0105;
  if (name === 'digit' && state === 'stalk' && moving) return 0.038;
  return 0.005;
};

// A face folds over when its winding faces against the surface's own normals.
function invertedFaces(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, idx = geo.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3(), w = new THREE.Vector3();
  let bad = 0;
  for (let f = 0; f < idx.length; f += 3) {
    a.fromBufferAttribute(p, idx[f]); b.fromBufferAttribute(p, idx[f + 1]); c.fromBufferAttribute(p, idx[f + 2]);
    w.subVectors(b, a).cross(c.sub(a));
    m.set(0, 0, 0);
    for (let k = 0; k < 3; k++) m.add(a.fromBufferAttribute(n, idx[f + k]));
    if (w.dot(m) < 0) bad++;
  }
  return bad;
}
// Measured, [full, simple] (see the task report): the standing hind limb's
// 4 / 6 behind the knee are the approved shape's (Task 3); every fold has
// none (its tube presses the inside of a tight bend in, FOLD_BEND, and no
// fold doubles back on itself). More than these is a regression.
const INVERTED_MAX = {
  stand: { front: [0, 0], hind: [4, 6] },
  sit: { front: [0, 0], hind: [0, 0] },
  tuck: { front: [0, 0], hind: [0, 0] },
  crouch: { front: [0, 0], hind: [0, 0] },
  ball: { front: [0, 0], hind: [0, 0] },
};

describe('legs fold at the joints (Task 5)', () => {
  it('folds, not squash', () => {
    for (const v of VARIANTS) {
      const cat = make(v.name, v.simple, v.feet);
      for (const state of FOLD_STATES) {
        pose(cat, state);
        cat.userData.parts.legs.forEach((leg, i) => {
          const kind = kindOf(state, i);
          expect(leg.userData.fold, `${label(v)} ${state} leg ${i}`).toBe(kind);
          expect(leg.scale.y, `${label(v)} ${state} leg ${i}`).toBe(1);
          if (kind !== 'stand') expect(leg.rotation.x, `${label(v)} ${state} leg ${i}`).toBe(0);
        });
      }
    }
  });

  it('the body rests exactly where it did', () => {
    for (const v of VARIANTS) {
      const cat = make(v.name, v.simple, v.feet);
      const base = cat.userData.base;
      for (const state of FOLD_STATES) {
        pose(cat, state);
        const crouch = state !== 'roll';
        const fit = POSE_FIT[state] ?? {};
        const lift = crouch ? base.legLift : 0;
        const { body, head } = cat.userData.parts;
        expect(body.position.y, `${label(v)} ${state}`).toBeCloseTo(base.bodyY - DROP[state] - lift + (fit.body ?? 0), 9);
        expect(head.position.y, `${label(v)} ${state}`).toBeCloseTo(base.headPos[1] + HEAD_DY[state] - lift + (fit.head ?? fit.body ?? 0), 9);
      }
    }
    // As measured on main.
    const tabby = make('tabby', false);
    expect(pose(tabby, 'nap').userData.parts.body.position.y).toBeCloseTo(0.24, 9);
    expect(pose(tabby, 'requestPet').userData.parts.body.position.y).toBeCloseTo(0.324, 9);
    expect(pose(tabby, 'stalk').userData.parts.body.position.y).toBeCloseTo(0.24, 9);
  });

  it('feet on the ground, nothing in it', () => {
    for (const v of VARIANTS) {
      const cat = make(v.name, v.simple, v.feet);
      for (const state of ALL_STATES) {
        pose(cat, state);
        cat.userData.parts.legs.forEach((leg, i) => {
          expect(box(leg).min.y, `${label(v)} ${state} leg ${i}`).toBeGreaterThanOrEqual(-0.01);
          if (FOLD_STATES.includes(state) && state !== 'roll' && kindOf(state, i) !== 'stand') {
            expect(box(leg.userData.paw).min.y, `${label(v)} ${state} leg ${i} sole`).toBeLessThanOrEqual(0.02);
          }
        });
      }
      for (const speed of [1.5, 2.0]) for (let t = 0.1; t < 2.85; t += 0.3) {
        pose(cat, 'stalk', t, speed);
        for (const leg of cat.userData.parts.legs) expect(box(leg).min.y, `${label(v)} walking stalk speed ${speed} t ${t}`).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  it('nothing pokes out of the back', () => {
    // Still (t 1.3), every state.
    for (const v of BARE_VARIANTS) {
      const cat = make(v.name, v.simple);
      for (const state of ALL_STATES) {
        const p = pokes(pose(cat, state), state);
        expect(p.folded, `${label(v)} ${state} folded`).toBeLessThanOrEqual(foldedAllowed(v.name, state));
        expect(p.standing, `${label(v)} ${state} standing`).toBeLessThanOrEqual(allowed(v.name, state));
      }
    }
  });

  it('nothing pokes out of the back, moving', () => {
    // The walk, the stalk at a walk, and the fight's swept states.
    for (const name of ['tabby', 'digit']) for (const simple of SIMPLE) {
      const cat = make(name, simple);
      for (let t = 0; t <= 3; t += 0.3) {
        for (const [state, speed, key] of [['follow', 1.5, 'walk'], ['stalk', 1.5, 'stalk']]) {
          const p = pokes(pose(cat, state, t, speed), state);
          expect(p.folded, `${name} ${key} t ${t} folded`).toBeLessThanOrEqual(foldedAllowed(name, state, true));
          expect(p.standing, `${name} ${key} t ${t} standing`).toBeLessThanOrEqual(allowed(name, key));
        }
        for (const state of ['swipe', 'backUp', 'pinning', 'pounce', 'flinch', 'rearUp', 'cross', 'pinned', 'roll']) {
          const p = pokes(pose(cat, state, t), state);
          expect(p.folded, `${name} ${state} t ${t} folded`).toBeLessThanOrEqual(foldedAllowed(name, state, true));
          expect(p.standing, `${name} ${state} t ${t} standing`).toBeLessThanOrEqual(allowed(name, state));
        }
      }
    }
  });

  it('a folded leg stays attached', () => {
    const names = [...PRESETS, 'fluffy', 'socks'];
    for (const name of names) for (const simple of SIMPLE) {
      const cat = make(name, simple);
      const { body, legs } = cat.userData.parts;
      for (const state of FOLD_STATES) {
        pose(cat, state);
        legs.forEach((leg, i) => {
          if (kindOf(state, i) === 'stand') return;
          const limb = limbOf(leg);
          const { sides } = limb.geometry.userData;
          const pos = limb.geometry.attributes.position;
          const c = new THREE.Vector3();
          for (let j = 0; j < sides; j++) c.add(_v.fromBufferAttribute(pos, j));
          c.divideScalar(sides).applyMatrix4(limb.matrixWorld);
          ray.set(_o.set(c.x, 5, c.z), DOWN);
          const top = ray.intersectObject(body, false)[0];
          ray.set(_o.set(c.x, -5, c.z), UP);
          const bottom = ray.intersectObject(body, false)[0];
          const at = `${name}${simple ? ' simple' : ''} ${state} leg ${i}`;
          expect(top, at).toBeTruthy();
          expect(bottom, at).toBeTruthy();
          expect(c.y, at).toBeLessThanOrEqual(top.point.y);
          expect(c.y, at).toBeGreaterThanOrEqual(bottom.point.y);
        });
      }
    }
  });

  it('nap folds all four under the body; sit tucks the hind legs under the haunch with the foot flat in front', () => {
    for (const v of BARE_VARIANTS) {
      const cat = make(v.name, v.simple);
      const { body, legs } = cat.userData.parts;
      pose(cat, 'nap');
      const torso = box(body).expandByScalar(0.05);
      legs.forEach((leg, i) => {
        const p = leg.userData.paw.getWorldPosition(new THREE.Vector3());
        expect(p.x, `${label(v)} nap paw ${i} x`).toBeGreaterThanOrEqual(torso.min.x);
        expect(p.x, `${label(v)} nap paw ${i} x`).toBeLessThanOrEqual(torso.max.x);
        expect(p.z, `${label(v)} nap paw ${i} z`).toBeGreaterThanOrEqual(torso.min.z);
        expect(p.z, `${label(v)} nap paw ${i} z`).toBeLessThanOrEqual(torso.max.z);
      });
      for (const state of ['requestPet', 'perch']) {
        pose(cat, state);
        for (const leg of legs.slice(2)) {
          const p = leg.userData.paw.getWorldPosition(new THREE.Vector3());
          expect(p.z, `${label(v)} ${state} hind paw ahead of the hip`).toBeLessThan(leg.position.z);
          expect(leg.userData.paw.rotation.x).toBe(0);
        }
      }
    }
  });

  it('boots go with the foot', () => {
    for (const v of VARIANTS.filter((x) => x.feet)) {
      const cat = make(v.name, v.simple, v.feet);
      const { legs } = cat.userData.parts;
      // Standing offsets of every part hung after the paw, and the paw's own shape.
      const rest = legs.map((leg) => {
        const paw = leg.userData.paw;
        const hung = leg.children.slice(leg.children.indexOf(paw) + 1);
        return { box: new THREE.Box3().setFromBufferAttribute(paw.geometry.attributes.position), scale: paw.scale.clone(), hung: hung.map((h) => h.position.clone().sub(paw.position)) };
      });
      for (const state of FOLD_STATES) {
        pose(cat, state);
        legs.forEach((leg, i) => {
          const paw = leg.userData.paw;
          const at = `${label(v)} ${state} leg ${i}`;
          expect(new THREE.Box3().setFromBufferAttribute(paw.geometry.attributes.position).equals(rest[i].box), at).toBe(true);
          expect(paw.scale.equals(rest[i].scale), at).toBe(true);
          const hung = leg.children.slice(leg.children.indexOf(paw) + 1);
          expect(hung.length, at).toBe(rest[i].hung.length);
          hung.forEach((h, k) => {
            const off = h.position.clone().sub(paw.position).applyAxisAngle(new THREE.Vector3(1, 0, 0), -paw.rotation.x);
            expect(off.distanceTo(rest[i].hung[k]), `${at} part ${k}`).toBeLessThanOrEqual(1e-6);
            expect(h.rotation.x, `${at} part ${k} turns with the paw`).toBeCloseTo(paw.rotation.x, 9);
            expect(box(h).min.y, `${at} part ${k}`).toBeGreaterThanOrEqual(-0.01);
          });
          expect(box(paw).min.y, at).toBeGreaterThanOrEqual(-0.01);
        });
      }
    }
  });

  it('simple folds to the same shape', () => {
    for (const name of Object.keys(LOOKS)) {
      const full = make(name, false), simple = make(name, true);
      for (const kind of Object.keys(FOLDS)) {
        for (let i = 0; i < 4; i++) {
          const a = full.userData.parts.legs[i], b = simple.userData.parts.legs[i];
          applyFold(a, kind); applyFold(b, kind);
          const ba = new THREE.Box3().setFromBufferAttribute(limbOf(a).geometry.attributes.position);
          const bb = new THREE.Box3().setFromBufferAttribute(limbOf(b).geometry.attributes.position);
          // The geometry's own box is the one applyFold copied in.
          expect(limbOf(a).geometry.boundingBox.equals(ba), `${name} ${kind} leg ${i} box`).toBe(true);
          for (const k of ['min', 'max']) for (const ax of ['x', 'y', 'z']) {
            expect(Math.abs(ba[k][ax] - bb[k][ax]), `${name} ${kind} leg ${i} ${k}.${ax}`).toBeLessThanOrEqual(0.005);
          }
          expect(a.userData.paw.position.distanceTo(b.userData.paw.position), `${name} ${kind} leg ${i} paw`).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });

  it('back to standing is exact, and the geometry never changes identity', () => {
    for (const v of [{ name: 'tabby', simple: false }, { name: 'digit', simple: true }, { name: 'tabby', simple: false, feet: 'goldbooties' }, { name: 'd2', simple: false, feet: 'sneakers' }]) {
      const fresh = make(v.name, v.simple, v.feet);
      pose(fresh, 'follow', 2.2);
      const cat = make(v.name, v.simple, v.feet);
      const limbs = cat.userData.parts.legs.map(limbOf);
      const ids = limbs.map((l) => [l.geometry, l.geometry.attributes.position.array, l.geometry.attributes.normal.array, l.geometry.attributes.position]);
      const spheres = limbs.map((l) => l.geometry.boundingSphere);
      for (const state of ['follow', 'nap', 'roll', 'requestPet', 'stalk', 'pinned', 'follow']) {
        pose(cat, state, 2.2);
        limbs.forEach((l, i) => {
          expect(l.geometry).toBe(ids[i][0]);
          expect(l.geometry.attributes.position).toBe(ids[i][3]);
          expect(l.geometry.attributes.position.array).toBe(ids[i][1]);
          expect(l.geometry.attributes.normal.array).toBe(ids[i][2]);
          // One bounding sphere, set once, holding every fold.
          expect(l.geometry.boundingSphere).toBe(spheres[i]);
          const pos = l.geometry.attributes.position;
          for (let k = 0; k < pos.count; k++) expect(spheres[i].distanceToPoint(_v.fromBufferAttribute(pos, k))).toBeLessThanOrEqual(1e-6);
        });
      }
      expect(fingerprintCat(cat)).toEqual(fingerprintCat(fresh));
      const a = cat.userData.parts.legs.map((l) => Array.from(limbOf(l).geometry.attributes.normal.array));
      const b = fresh.userData.parts.legs.map((l) => Array.from(limbOf(l).geometry.attributes.normal.array));
      expect(a).toEqual(b);
    }
  });

  it("every fold's limb ends inside its foot, as standing does", () => {
    // Each vertex of the limb's last ring (t > 0.97) lies inside the paw:
    // under it the foot's sole and over it the foot's top (a ray each way,
    // both sides of the surface counted), and inside its outline.
    const inside = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const p = new THREE.Vector3(), NUDGE = new THREE.Vector3(1e-5, 0, 1e-5);
    for (const name of [...PRESETS, 'fluffy', 'socks']) for (const simple of SIMPLE) {
      const cat = make(name, simple);
      cat.userData.parts.legs.forEach((leg, i) => {
        for (const kind of Object.keys(FOLDS)) {
          applyFold(leg, kind);
          cat.updateMatrixWorld(true);
          const limb = limbOf(leg), paw = leg.userData.paw;
          inside.geometry = paw.geometry;
          inside.matrixWorld.copy(paw.matrixWorld);
          const { t } = limb.geometry.userData;
          const pos = limb.geometry.attributes.position;
          let out = 0, n = 0;
          for (let k = 0; k < pos.count; k++) {
            if (t[k] <= 0.97) continue;
            n++;
            // Nudged 0.01 mm off the leg's centre plane: a ray straight down
            // the foot's own centre line runs along its seam and counts twice.
            p.fromBufferAttribute(pos, k).applyMatrix4(limb.matrixWorld).add(NUDGE);
            ray.set(_o.copy(p), UP);
            const above = ray.intersectObject(inside, false).length;
            ray.set(_o.copy(p), DOWN);
            const below = ray.intersectObject(inside, false).length;
            if (above % 2 !== 1 || below % 2 !== 1) out++;
          }
          expect(n, `${name} ${kind} leg ${i}`).toBeGreaterThan(0);
          expect(out, `${name}${simple ? ' simple' : ''} ${kind} leg ${i}: end-ring vertices outside the foot`).toBe(0);
        }
        applyFold(leg, 'stand');
      });
    }
  });

  it('applyFold allocates nothing', () => {
    const src = fs.readFileSync(new URL('../src/cat/limbs.js', import.meta.url), 'utf8');
    const start = src.indexOf('export function applyFold');
    expect(start).toBeGreaterThan(-1);
    let depth = 0, end = src.indexOf('{', start);
    for (let i = end; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) { end = i; break; }
    }
    const fn = src.slice(start, end + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(fn).not.toMatch(/\bnew\s/);
    expect(fn).not.toMatch(/\.clone\(|\[\.\.\.|\.slice\(|\.map\(/);
  });

  it('Hagrid keeps his squash', () => {
    const hen = buildCat('hagrid');
    animateCat(hen, 'nap', 1.3, 0, false);
    const { legs } = hen.userData.parts;
    expect(legs[0].scale.y).toBe(0.25);
    for (const leg of legs) {
      const before = JSON.stringify(leg.children.map((c) => [c.position.toArray(), c.rotation.toArray(), Array.from(c.geometry?.attributes.position.array ?? [])]));
      applyFold(leg, 'tuck');
      expect(leg.userData.folds).toBeUndefined();
      expect(leg.userData.fold).toBeUndefined();
      expect(JSON.stringify(leg.children.map((c) => [c.position.toArray(), c.rotation.toArray(), Array.from(c.geometry?.attributes.position.array ?? [])]))).toBe(before);
    }
  });

  it('few faces fold over, even in the tightest bends; normals stay the shape\'s own', () => {
    for (const simple of SIMPLE) {
      const cat = make('tabby', simple);
      const legs = cat.userData.parts.legs;
      for (const kind of Object.keys(FOLDS)) {
        for (const [i, which] of [[0, 'front'], [2, 'hind']]) {
          applyFold(legs[i], kind);
          const geo = limbOf(legs[i]).geometry;
          expect(invertedFaces(geo), `${kind} ${which}${simple ? ' simple' : ''}`).toBeLessThanOrEqual(INVERTED_MAX[kind][which][simple ? 1 : 0]);
          // Unit analytic normals (tubeGeometry's), never face-averaged.
          const n = geo.attributes.normal;
          for (let k = 0; k < n.count; k++) expect(_v.fromBufferAttribute(n, k).length()).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it("the fight's measurements are Task 1's", () => {
    for (const [name, pinnedBackY, pivotY] of [['tabby', 0.4144, 0.4300], ['digit', 0.3398, 0.4530]]) {
      const dims = catDims(buildCat(name)); // at the cat's own scale, as Task 1 measured
      expect(dims.pinnedBackY, name).toBeCloseTo(pinnedBackY, 4);
      expect(dims.pivotY, name).toBeCloseTo(pivotY, 4);
    }
  });
});
