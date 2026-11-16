import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { DRAPE } from '../src/cat/drape.js';
import { SIT, NAP } from '../src/cat/torso.js';
import { CATALOG } from '../src/progression.js';

// Clothes over the haunch (2026-11-16, src/cat/drape.js). A cat dressed on its
// body sits with haunches and naps as a loaf like any other cat, and its coat
// or cape is laid over the haunch: written when it sits down, lies down or
// gets up, and put back exactly.

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const GARMENTS = ['hoodie', 'raincoat', 'sweater', 'cape', 'confetticape'];
const SHELLS = ['hoodie', 'raincoat', 'sweater'];
const BREEDS = ['tabby', 'siamese', 'persian', 'mainecoon', 'robbie', 'digit'];
const OTHER_STATES = ['follow', 'idle', 'stalk', 'stretch', 'groom', 'sniff', 'pounce', 'land', 'scared', 'roll', 'pinned', 'swim', 'wade', 'cross'];

function make(breed, body, simple = false, more = {}) {
  const cat = buildCat(breed, { ...BARE, body, ...more }, { simple });
  cat.scale.setScalar(1);
  return cat;
}
function pose(cat, state, t = 1.3, speed = 0) {
  animateCat(cat, state, t, speed, false);
  cat.updateMatrixWorld(true);
  return cat;
}
const cloths = (cat) => cat.userData.parts.body.children.filter((k) => k.userData.drape);
// every geometry a piece can wear (a cape has two), with its buffers
const buffers = (cat) => cloths(cat).flatMap((k) => (k.userData.capeGeo ? [k.userData.capeGeo.stand, k.userData.capeGeo.sit] : [k.geometry]))
  .map((g) => ({ g, pos: g.attributes.position, nor: g.attributes.normal }));
const snap = (cat) => buffers(cat).map(({ pos, nor }) => ({ pos: pos.array.slice(), nor: nor.array.slice() }));
const versions = (cat) => buffers(cat).map(({ pos, nor }) => [pos.version, nor.version]);
const same = (cat, was, what) => buffers(cat).forEach(({ pos, nor }, k) => {
  expect(Array.from(pos.array), `${what}: positions of piece ${k}`).toEqual(Array.from(was[k].pos));
  expect(Array.from(nor.array), `${what}: normals of piece ${k}`).toEqual(Array.from(was[k].nor));
});

// How far the hind thighs (the limb's upper half, where the cloth lies in
// full) stand OUT of the cloth: metres, the worst point; negative is under
// it. A thigh point with no cloth on its line from the torso's centre (below
// a cape's hem) is not counted.
const _c = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3();
const ray = new THREE.Raycaster();
function thighOut(cat) {
  const { body, legs } = cat.userData.parts;
  const meshes = cloths(cat).filter((k) => !k.userData.cloth.pieces);
  const sides = meshes.map((m) => m.material.side);
  meshes.forEach((m) => { m.material.side = THREE.DoubleSide; });
  _c.setFromMatrixPosition(body.matrixWorld);
  let worst = -Infinity, under = 0;
  for (const leg of legs.slice(2)) {
    const limb = leg.children[0], p = limb.geometry.attributes.position, t = limb.geometry.userData.t;
    for (let i = 0; i < p.count; i++) {
      if (t[i] > DRAPE.upTo[0]) continue;
      _h.fromBufferAttribute(p, i).applyMatrix4(limb.matrixWorld);
      const L = _d.subVectors(_h, _c).length();
      ray.set(_c, _d.normalize());
      const hits = ray.intersectObjects(meshes, false);
      if (!hits.length) continue;
      under++;
      worst = Math.max(worst, L - hits[hits.length - 1].distance);
    }
  }
  meshes.forEach((m, k) => { m.material.side = sides[k]; });
  return { worst, under };
}

describe('clothes over the haunch', () => {
  it('covers every body-slot item in the shop', () => {
    const bodySlot = Object.entries(CATALOG.accessories).filter(([, a]) => a.slot === 'body').map(([id]) => id).sort();
    expect(bodySlot).toEqual([...GARMENTS].sort());
    for (const g of GARMENTS) expect(cloths(make('tabby', g)).length, g).toBe(g === 'confetticape' ? 2 : 1);
  });

  it('a dressed cat takes the haunch folds, its hips as far apart as a bare cat\'s', () => {
    for (const g of GARMENTS) for (const simple of [false, true]) {
      const cat = make('tabby', g, simple), bare = make('tabby', null, simple);
      for (const [state, fold, out] of [['perch', 'sit', SIT.hindOut], ['requestPet', 'sit', SIT.hindOut], ['nap', 'loaf', NAP.hindOut]]) {
        pose(cat, 'follow'); pose(cat, state); pose(bare, state);
        const legs = cat.userData.parts.legs, bareLegs = bare.userData.parts.legs;
        for (const i of [2, 3]) {
          expect(legs[i].userData.fold, `${g} ${state}`).toBe(fold);
          expect(legs[i].position.x, `${g} ${state}`).toBe(bareLegs[i].position.x);
          expect(Math.abs(legs[i].position.x) - Math.abs(legs[i].userData.hipX), `${g} ${state}`).toBeGreaterThan(out * 0.5);
          expect(Array.from(legs[i].children[0].geometry.attributes.position.array)).toEqual(Array.from(bareLegs[i].children[0].geometry.attributes.position.array));
        }
      }
    }
  });

  it('sitting and napping, no thigh comes through the cloth (a cat posed standing first)', () => {
    for (const g of GARMENTS) for (const breed of BREEDS) for (const simple of [false, true]) {
      const cat = make(breed, g, simple);
      pose(cat, 'follow', 0.5);
      for (const [state, ts] of [['perch', [0, 1.3, 2.2]], ['requestPet', [0.7]], ['nap', [0, 1.1, 3.4]]]) for (const t of ts) {
        pose(cat, state, t);
        const { worst, under } = thighOut(cat);
        const what = `${g} ${breed}${simple ? ' simple' : ''} ${state} t ${t}`;
        // a coat covers the thigh; a cape's hem lies over its top (the sit's shorter cloth may leave the whole thigh bare)
        if (SHELLS.includes(g)) expect(under, what).toBeGreaterThan(40);
        if (under) expect(worst, what).toBeLessThan(-0.002); // 2 mm under the cloth at the least
        pose(cat, 'follow', 0.5);
      }
    }
  });

  it('the cloth moves only over the haunch, outward, never into the ground, and by no more than the haunch stands out', () => {
    const v = new THREE.Vector3();
    for (const g of GARMENTS) for (const breed of BREEDS) for (const simple of [false, true]) {
      const cat = make(breed, g, simple);
      pose(cat, 'follow');
      const built = snap(cat);
      for (const state of ['perch', 'nap']) {
        pose(cat, state);
        const [sx, sy, sz] = cat.userData.parts.body.scale.toArray();
        let moved = 0, total = 0;
        buffers(cat).forEach(({ g: geo, pos }, k) => {
          const piece = cloths(cat).find((m) => m.geometry === geo);
          for (let i = 0; i < pos.count; i++) {
            total++;
            const a = built[k].pos, j = i * 3;
            const d = Math.hypot((pos.array[j] - a[j]) * sx, (pos.array[j + 1] - a[j + 1]) * sy, (pos.array[j + 2] - a[j + 2]) * sz);
            if (d === 0) continue;
            moved++;
            expect(d, `${g} ${breed} ${state} point ${i}`).toBeLessThan(0.16);
            // outward: further from the torso's centre than it was
            expect(Math.hypot(pos.array[j] * sx, pos.array[j + 1] * sy, pos.array[j + 2] * sz)).toBeGreaterThan(Math.hypot(a[j] * sx, a[j + 1] * sy, a[j + 2] * sz));
            if (piece) {
              const y = v.fromBufferAttribute(pos, i).applyMatrix4(piece.matrixWorld).y;
              expect(y, `${g} ${breed} ${state} point ${i} over the ground`).toBeGreaterThan(0); // laid DRAPE.floor over it; the nap's breathing takes a few mm of that
            }
          }
        });
        if (SHELLS.includes(g)) expect(moved, `${g} ${breed} ${state}`).toBeGreaterThan(20);
        expect(moved, `${g} ${breed} ${state}`).toBeLessThan(total * 0.45);
        pose(cat, 'follow');
      }
    }
  });

  it('getting up puts every point and normal back exactly, from the sit, the nap and one straight into the other', () => {
    for (const g of GARMENTS) for (const [breed, simple] of [['tabby', false], ['tabby', true], ['digit', false], ['mainecoon', false], ['robbie', true]]) {
      const cat = make(breed, g, simple);
      pose(cat, 'follow');
      const built = snap(cat);
      const what = `${g} ${breed}${simple ? ' simple' : ''}`;
      for (const route of [['perch'], ['nap'], ['perch', 'nap'], ['nap', 'requestPet', 'perch'], ['nap', 'stalk', 'perch']]) {
        for (const state of route) pose(cat, state);
        pose(cat, 'follow');
        same(cat, built, `${what} after ${route.join(' > ')}`);
      }
      // the same shape every time it sits
      pose(cat, 'perch'); const sat = snap(cat);
      pose(cat, 'follow'); pose(cat, 'nap'); pose(cat, 'perch');
      same(cat, sat, `${what} sitting again`);
    }
  });

  it('a cat already drawn: sitting down, lying down and getting up each flag the worn buffers for upload once, and no later frame writes them', () => {
    for (const g of GARMENTS) for (const simple of [false, true]) {
      const cat = make('tabby', g, simple);
      for (let k = 0; k < 3; k++) pose(cat, 'follow', k / 60); // drawn standing
      const worn = () => cloths(cat).map((m) => m.geometry.attributes.position);
      let before = versions(cat);
      for (const state of ['perch', 'follow', 'nap', 'follow']) {
        pose(cat, state, 0.5);
        const now = versions(cat);
        if (state !== 'follow') {
          // the buffer the piece wears now was written this frame
          const pieces = cloths(cat).filter((m) => m.userData.drape.fit(state === 'nap' ? 'loaf' : 'sit'));
          if (SHELLS.includes(g)) expect(pieces.length, `${g} ${state}`).toBe(1);
          for (const m of pieces) {
            const k = buffers(cat).findIndex((b) => b.g === m.geometry);
            expect(now[k][0], `${g} ${state} position`).toBeGreaterThan(before[k][0]);
            expect(now[k][1], `${g} ${state} normal`).toBeGreaterThan(before[k][1]);
          }
        } else if (worn().length) {
          expect(now.flat().reduce((a, b) => a + b, 0), `${g} getting up`).toBeGreaterThanOrEqual(before.flat().reduce((a, b) => a + b, 0));
        }
        for (let k = 1; k < 5; k++) pose(cat, state, 0.5 + k / 60);
        expect(versions(cat), `${g} ${state}: later frames`).toEqual(now);
        before = now;
      }
    }
  });

  it('standing, walking and every other pose leave the cloth as built', () => {
    for (const g of GARMENTS) for (const simple of [false, true]) {
      const cat = make('tabby', g, simple);
      const built = snap(cat), v0 = versions(cat);
      for (const state of OTHER_STATES) { pose(cat, state, 0.4); pose(cat, state, 1.3, 1.5); }
      same(cat, built, g);
      expect(versions(cat), g).toEqual(v0);
    }
  });

  it('adds no triangle, no vertex and no mesh: the same counts sitting as standing, and as a cat built before it ever sat', () => {
    const count = (cat) => { let m = 0, tri = 0, vert = 0; cat.traverse((o) => { if (!o.isMesh) return; m++; vert += o.geometry.attributes.position.count; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return { m, tri, vert }; };
    for (const g of GARMENTS) for (const simple of [false, true]) {
      const cat = make('tabby', g, simple);
      const built = count(cat);
      pose(cat, 'follow'); pose(cat, 'perch');
      expect(count(cat), `${g} sitting`).toEqual(built);
      pose(cat, 'nap');
      expect(count(cat), `${g} napping`).toEqual(built);
    }
  });

  it('the confetti cape\'s dots stay on the cloth: each moves as one piece, with the cloth under it', () => {
    for (const simple of [false, true]) {
      const cat = make('tabby', 'confetticape', simple);
      pose(cat, 'follow');
      const dots = cloths(cat).find((m) => m.userData.cloth.pieces), n = dots.userData.cloth.pieces;
      for (const [state, fold] of [['perch', 'sit'], ['nap', 'loaf']]) {
        pose(cat, state);
        const fit = dots.userData.drape.fit(fold);
        if (!fit) continue;
        for (let a = 0; a < fit.pos.length / 3; a += n) {
          const d = [0, 1, 2].map((c) => fit.pos[a * 3 + c] - fit.rest.pos[a * 3 + c]);
          for (let i = a; i < a + n; i++) for (const c of [0, 1, 2]) expect(fit.pos[i * 3 + c] - fit.rest.pos[i * 3 + c]).toBeCloseTo(d[c], 6);
        }
        pose(cat, 'follow');
      }
    }
  });

  it('two cats of one shape share the fit and do not disturb each other', () => {
    const a = make('tabby', 'hoodie'), b = make('tabby', 'hoodie');
    pose(a, 'follow'); pose(b, 'follow');
    const built = snap(b);
    pose(a, 'perch');
    same(b, built, 'the standing cat');
    pose(b, 'nap'); pose(a, 'follow');
    same(a, built, 'the cat that got up');
    expect(cloths(a)[0].userData.drape.fit('sit').pos).toBe(cloths(b)[0].userData.drape.fit('sit').pos);
  });
});
