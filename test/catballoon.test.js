import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { PRESETS, STATES } from './helpers/catfingerprint.js';

// polish-pose Task 3 (2026-11-02, ruling P3): balloons float upright in every
// pose. Sitting, the single balloon and the bunch rode the tipped torso and
// leaned back ~45°; in the nap the tie floated over the lowered back. Now the
// tie rides the posed body in EVERY state, the balloons and the knot never
// turn, they keep their built height unless the tie rises (then they rise
// with it), and each string stretches from the carried tie to its knot end.
// Standing still (follow, no walk) every piece is exactly as built.
//
// Everything is measured in the cat's own frame (the group's local space), so
// Digit (scale 0.82) is judged by her own size.

const BREEDS = PRESETS.filter((b) => b !== 'hagrid');
const KITS = ['balloon', 'balloonbunch'];
const CASES = BREEDS.flatMap((b) => [false, true].flatMap((simple) => KITS.map((k) => [b, simple, k])));
const BARE = { collar: null, head: null, face: null, neck: null, feet: null, body: null };
const kitCat = (b, simple, back) => buildCat(b, { ...BARE, back }, { simple });
const pieces = (cat) => cat.children.filter((c) => c.userData.float);
const isBalloon = (m) => !m.userData.span && m.geometry.parameters.radius >= 0.05;
const isKnot = (m) => !m.userData.span && m.geometry.parameters.radius < 0.05;
const transforms = (cat) => pieces(cat).map((c) => [c.position.toArray(), c.quaternion.toArray(), c.scale.toArray()]);
const TIMES = [0.4, 1.3, 2.2];

// The tie carried by the posed torso: bodyPosed · bodyRest⁻¹ · tie, the
// body's rest being (0, base.bodyY, 0), unrotated, at base.bodyScale.
function carriedTie(cat, tie) {
  const { body } = cat.userData.parts;
  const { bodyY, bodyScale } = cat.userData.base;
  body.updateMatrix();
  const carry = body.matrix.clone().multiply(new THREE.Matrix4().compose(
    new THREE.Vector3(0, bodyY, 0), new THREE.Quaternion(), new THREE.Vector3(...bodyScale)).invert());
  return new THREE.Vector3(...tie).applyMatrix4(carry);
}

const v = new THREE.Vector3();
const localVerts = (m) => {
  m.updateMatrix();
  const out = [], p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrix));
  return out;
};

// How far a cat-frame point lies outside a part's surface, along the ray from
// the part's centre through it (negative: inside). Points outside the part's
// box (grown 1 cm) are outside without a ray.
const ray = new THREE.Raycaster();
function inside(cat, part, P) {
  const Pw = P.clone().applyMatrix4(cat.matrixWorld);
  const box = new THREE.Box3().setFromObject(part, true).expandByScalar(0.01 * cat.scale.x);
  if (!box.containsPoint(Pw)) return false;
  const C = part.getWorldPosition(new THREE.Vector3());
  const dir = Pw.clone().sub(C).normalize(), F = Pw.clone().addScaledVector(dir, 1);
  ray.set(F, dir.clone().negate());
  const hit = ray.intersectObject(part, true)[0];
  return hit ? hit.distance < F.distanceTo(Pw) : false;
}

describe('balloons float upright in every pose (polish-pose Task 3)', () => {
  it.each(CASES)('%s (simple %s) %s: tagged to float, not to ride', (b, simple, back) => {
    const cat = kitCat(b, simple, back);
    const bare = buildCat(b, { ...BARE, back: null }, { simple });
    const ps = pieces(cat);
    expect(ps.length, 'every piece the back slot added floats').toBe(cat.children.length - bare.children.length);
    expect(ps.length).toBe(back === 'balloon' ? 3 : 6);
    for (const p of ps) {
      expect(p.userData.ridesBody, 'no balloon piece rides the body').toBeUndefined();
      expect(p.userData.float.tie).toHaveLength(3);
    }
    expect(ps.filter((p) => p.userData.span)).toHaveLength(back === 'balloon' ? 1 : 3);
  });

  it.each(CASES)('%s (simple %s) %s: standing still, every piece is exactly as built', (b, simple, back) => {
    const built = transforms(kitCat(b, simple, back));
    const cat = kitCat(b, simple, back);
    for (const t of TIMES) {
      animateCat(cat, 'follow', t, 0, false);
      expect(transforms(cat), `follow t ${t}`).toEqual(built);
    }
  });

  it.each(CASES)('%s (simple %s) %s: in every pose the balloons stand upright over the carried tie, the strings rising from it', (b, simple, back) => {
    const builtCat = kitCat(b, simple, back);
    const builtPieces = pieces(builtCat);
    const cat = kitCat(b, simple, back);
    const head = cat.userData.parts.head, { body, underside } = cat.userData.parts;
    for (const state of STATES) {
      for (const t of TIMES) {
        animateCat(cat, state, t, 0, false);
        cat.updateMatrixWorld(true);
        const at = `${state} t ${t}`;
        pieces(cat).forEach((p, i) => {
          const tie = carriedTie(cat, p.userData.float.tie);
          if (p.userData.span) {
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);
            const foot = p.position.clone().addScaledVector(up, -0.5 * p.userData.span.len * p.scale.y);
            expect(foot.distanceTo(tie), `${at}: string ${i} tied at the carried tie`).toBeLessThanOrEqual(0.01);
            expect(up.y, `${at}: string ${i} rises`).toBeGreaterThanOrEqual(0.6);
            return;
          }
          expect(p.quaternion.angleTo(builtPieces[i].quaternion), `${at}: piece ${i} upright`).toBeLessThan(1e-9);
          if (!isBalloon(p)) return;
          const verts = localVerts(p);
          const low = Math.min(...verts.map((q) => q.y));
          // The bunch's third balloon hangs 6.95 cm over its tie as built
          // (the others 10 cm and more): each balloon keeps at least the
          // clearance it was built with, never less than 6.9 cm, less the
          // string's 5 mm of play (animator.js FLOAT_SLACK: the breathing
          // lifts the tie up to 4.3 mm and the balloons stay put).
          const built = Math.min(...localVerts(builtPieces[i]).map((q) => q.y)) - builtPieces[i].userData.float.tie[1];
          expect(built, `balloon ${i}: built clearance`).toBeGreaterThanOrEqual(0.069);
          expect(low - tie.y, `${at}: balloon ${i} over its tie`).toBeGreaterThanOrEqual(Math.min(0.1, built) - 0.005);
          for (const q of verts) {
            expect(inside(cat, body, q) || inside(cat, underside, q), `${at}: balloon ${i} out of the torso`).toBe(false);
            expect(inside(cat, head, q), `${at}: balloon ${i} out of the head`).toBe(false);
          }
        });
        expect(pieces(cat).filter(isKnot).length).toBe(back === 'balloon' ? 1 : 0);
      }
    }
  }, 120_000);

  it.each(CASES)('%s (simple %s) %s: leaving a sit or a nap puts every piece back as a fresh follow has it', (b, simple, back) => {
    for (const state of ['requestPet', 'perch', 'nap']) {
      const cat = kitCat(b, simple, back);
      animateCat(cat, state, 1.3, 0, false);
      animateCat(cat, 'follow', 2.2, 0, false);
      const fresh = kitCat(b, simple, back);
      animateCat(fresh, 'follow', 2.2, 0, false);
      expect(transforms(cat), `${state} → follow`).toEqual(transforms(fresh));
    }
  });

  it('Hagrid shows no balloon', () => {
    for (const back of KITS) {
      const hen = buildCat('hagrid', { ...BARE, back });
      expect(pieces(hen)).toHaveLength(0);
    }
  });
});
