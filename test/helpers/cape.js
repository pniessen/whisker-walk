import { it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../../src/cat/model.js';
import { SKULL } from '../../src/cat/torso.js';
import { animateCat } from '../../src/cat/animator.js';
import { PRESETS, STATES } from './catfingerprint.js';

// Shared by test/catcape.test.js and its sweep files (catcape.<sweep>.<cape>.test.js).
//
// The four pose sweeps below each raycast every cloth or tail vertex against
// the fur in dozens of poses, for 40 cats: together they were ~330 s of one
// file, run serially, which alone set the length of the whole suite. Each is
// now defined here once and run per cape from its own small file, so vitest
// can run them side by side. The assertions are exactly as they were.
//
// Every measure is in the cat's own frame (world / cat.scale.x), so Digit
// (scale 0.82) is judged by her own size.

export const DESCRIBE = 'a cape is a cloak on the torso (polish-pose Task 2)';
export const BREEDS = PRESETS.filter((b) => b !== 'hagrid');
export const CAPES = ['cape', 'confetticape'];
export const CASES = BREEDS.flatMap((b) => CAPES.flatMap((id) => [false, true].map((simple) => [b, id, simple])));
// One cape's cases, in the order CASES lists them.
export const casesOf = (cape) => CASES.filter(([, id]) => id === cape);
export const BARE = { collar: null, head: null, face: null, neck: null, feet: null, back: null };
export const kitCat = (b, id, simple) => buildCat(b, { ...BARE, body: id }, { simple });
export const capeOf = (cat) => cat.userData.parts.body.children.find((c) => c.userData.cape);
export const claspOf = (cat) => cat.userData.parts.body.children.find((c) => c.userData.capeClasp);
export const verts = (m, s) => {
  const out = [], p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).divideScalar(s));
  return out;
};
export const meshVerts = (obj, s) => {
  const out = [];
  obj.traverse((m) => { if (m.isMesh) out.push(...verts(m, s)); });
  return out;
};
export const world = (o, s) => o.getWorldPosition(new THREE.Vector3()).divideScalar(s);

// How far a cat-frame point lies outside the torso's fur, along the ray from
// the body centre through it (negative: inside).
const ray = new THREE.Raycaster();
export const outside = (cat, P) => {
  const { body } = cat.userData.parts, s = cat.scale.x;
  const C = body.getWorldPosition(new THREE.Vector3());
  const Pw = P.clone().multiplyScalar(s);
  const dir = Pw.clone().sub(C).normalize(), F = Pw.clone().addScaledVector(dir, 1);
  ray.set(F, dir.clone().negate());
  const hit = ray.intersectObject(body, false)[0];
  return hit ? (hit.distance - F.distanceTo(Pw)) / s : Infinity;
};

// The same against the whole fur: the torso and the underside (the chest,
// which counter-yaws under the turned torso in the cross and drops in the sit).
export const outsideFur = (cat, P) => {
  const { body, underside } = cat.userData.parts, s = cat.scale.x;
  const C = body.getWorldPosition(new THREE.Vector3());
  const Pw = P.clone().multiplyScalar(s);
  const dir = Pw.clone().sub(C).normalize(), F = Pw.clone().addScaledVector(dir, 1);
  ray.set(F, dir.clone().negate());
  const hit = ray.intersectObjects([body, underside], false)[0];
  return hit ? (hit.distance - F.distanceTo(Pw)) / s : Infinity;
};

// The sweep: every state at three times, and the walking states at speed 1.5 too.
export const WALKING = ['follow', 'stalk'];
export const SWEEP = STATES.flatMap((st) => [0.4, 1.3, 2.2].flatMap((t) => [[st, t, 0], ...(WALKING.includes(st) ? [[st, t, 1.5]] : [])]));

// The clasp and its two front bands (see catcape.test.js): one mesh on the body.
export const tieOf = claspOf;
export const atOf = (cat) => cat.userData.parts.body.localToWorld(new THREE.Vector3(...tieOf(cat).userData.at)).divideScalar(cat.scale.x);
export const rangeVerts = (cat, [start, count]) => verts(tieOf(cat), cat.scale.x).slice(start, start + count);
// How far a cat-frame point lies outside the skull (an ellipsoid, torso.js
// SKULL, on the head), in units of the skull's size: > 1 outside.
export const skullOut = (cat, P) => {
  const { head } = cat.userData.parts;
  const L = head.worldToLocal(P.clone().multiplyScalar(cat.scale.x));
  return Math.hypot(L.x / (SKULL.R * SKULL.SCALE[0]), L.y / (SKULL.R * SKULL.SCALE[1]), L.z / (SKULL.R * SKULL.SCALE[2]));
};

// Every pose: all the cat's states, walking too.
export const ALL_STATES = [...STATES, 'arch', 'swipe', 'roll', 'pinning', 'pinned', 'flinch', 'rearUp', 'backUp', 'swim', 'wade', 'shake'];
export const TIE_SWEEP = ALL_STATES.flatMap((st) => [0.4, 1.3, 2.2].flatMap((t) => [[st, t, 0], ...(WALKING.includes(st) ? [[st, t, 1.5]] : [])]));

// The sit (see catcape.test.js for the why): both sitting states at seven
// times, seen from the walk camera's distance and height behind the cat and
// behind-left (the side the tail curls to).
export const SITS = ['requestPet', 'perch'].flatMap((st) => [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => [st, t]));
export const EYES = { behind: [0, 1.3, 2.0], behindLeft: [-0.8, 1.3, 2.0] };
export const capePieces = (cat) => cat.userData.parts.body.children.filter((c) => c.userData.cape || c.userData.capeClasp || c.userData.capeDots);

// In every pose (all the cat's states, walking too), every vertex of the
// clasp and the bands is out of the fur (body and underside, along the ray
// from the body centre), out of the skull, and off the ground.
export function tieSweep(capeId) {
  it.each(casesOf(capeId))('%s %s (simple %s): in every pose the clasp and the front edges stay out of the chest and the head', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    for (const [state, t, speed] of TIE_SWEEP) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x, label = `${state} t ${t} speed ${speed}`;
      let fur = Infinity, skull = Infinity, low = Infinity;
      for (const P of verts(tieOf(cat), s)) {
        fur = Math.min(fur, outsideFur(cat, P));
        skull = Math.min(skull, skullOut(cat, P));
        low = Math.min(low, P.y);
      }
      expect(fur, `${label}: out of the fur`).toBeGreaterThanOrEqual(0.002);
      expect(skull, `${label}: out of the head`).toBeGreaterThanOrEqual(1);
      expect(low, `${label}: off the ground`).toBeGreaterThanOrEqual(0);
      // and the clasp still at the throat: under the head's centre, near it
      const c = atOf(cat), hc = world(cat.userData.parts.head, s);
      expect(c.distanceTo(hc), `${label}: clasp near the head`).toBeLessThanOrEqual(0.32);
    }
  }, 180_000);
}

export function furSweep(capeId) {
  it.each(casesOf(capeId))('%s %s (simple %s): in every state it stays out of the fur and the ground', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const cape = capeOf(cat);
    for (const [state, t, speed] of SWEEP) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x;
      let worst = Infinity, low = Infinity;
      for (const P of verts(cape, s)) {
        worst = Math.min(worst, outside(cat, P));
        low = Math.min(low, P.y);
      }
      const label = `${state} t ${t} speed ${speed}`;
      expect(worst, `${label}: out of the fur`).toBeGreaterThanOrEqual(0.002);
      expect(low, `${label}: out of the ground`).toBeGreaterThanOrEqual(-0.005);
    }
  }, 180_000);
}

export function tailSweep(capeId) {
  it.each(casesOf(capeId))('%s %s (simple %s): in every state the tail is never covered', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const cape = capeOf(cat);
    const cast = new THREE.Raycaster();
    for (const [state, t, speed] of SWEEP) {
      animateCat(cat, state, t, speed, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x, { body, tail } = cat.userData.parts;
      const C = body.getWorldPosition(new THREE.Vector3());
      const label = `${state} t ${t} speed ${speed}`;
      // a tail vertex near the fur with the cape between it and the body
      // centre; in the sit every tail vertex, near the fur or not (the curl
      // lies more than 2 cm out, beside the haunch; the sit's own checks
      // below look from the camera)
      const sit = state === 'requestPet' || state === 'perch';
      let covered = 0;
      for (const P of meshVerts(tail, s)) {
        if (!sit && outside(cat, P) > 0.02) continue;
        const Pw = P.clone().multiplyScalar(s), d = Pw.distanceTo(C);
        cast.set(C, Pw.clone().sub(C).normalize());
        cast.far = d;
        if (cast.intersectObject(cape, false).length) covered++;
      }
      expect(covered, `${label}: tail vertices under the cape`).toBe(0);
      // and the root comes out behind the hem
      const root = world(tail, s);
      let near = Infinity;
      for (const P of verts(cape, s)) near = Math.min(near, P.distanceTo(root));
      expect(near, `${label}: the tail root clear of the cape`).toBeGreaterThanOrEqual(0.04);
    }
  }, 180_000);
}

// Of the tail vertices that the body, chest and legs do not hide, at most 3%
// may be behind a cape piece (see catcape.test.js for the sit cloth).
export function sitSweep(capeId) {
  it.each(casesOf(capeId))('%s %s (simple %s): sitting, the whole tail curl shows from behind', (b, id, simple) => {
    const cat = kitCat(b, id, simple);
    const cast = new THREE.Raycaster(), d = new THREE.Vector3(), E = new THREE.Vector3();
    for (const [state, t] of SITS) {
      animateCat(cat, state, t, 0, false);
      cat.updateMatrixWorld(true);
      const s = cat.scale.x, { body, underside, legs, tail } = cat.userData.parts;
      const fur = [body, underside], cloth = capePieces(cat);
      for (const [eye, at] of Object.entries(EYES)) {
        E.fromArray(at).multiplyScalar(s);
        let seen = 0, under = 0;
        for (const P of meshVerts(tail, s)) {
          const Pw = P.multiplyScalar(s), far = d.subVectors(Pw, E).length();
          cast.set(E, d.normalize());
          cast.far = far - 1e-4;
          if (cast.intersectObjects(fur, false).length || cast.intersectObjects(legs, true).length) continue;
          seen++;
          if (cast.intersectObjects(cloth, false).length) under++;
        }
        expect(seen, `${state} t ${t} ${eye}: tail seen`).toBeGreaterThan(0);
        expect(under / seen, `${state} t ${t} ${eye}: ${under}/${seen} under the cape`).toBeLessThanOrEqual(0.03);
      }
    }
  }, 180_000);
}
