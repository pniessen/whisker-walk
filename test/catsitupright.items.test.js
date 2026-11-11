import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat, refitNeck } from '../src/cat/animator.js';
import { SIT } from '../src/cat/torso.js';
import { PRESETS, colourDistance } from './helpers/catfingerprint.js';

// The upright sit's back items, chest drop and bib (polish-sit Task 3), split
// out of catsitupright.test.js so the two halves run in parallel; the cases
// and the posed helper are the same as there.
//
// Every measure is in the cat's own frame (world / cat.scale.x), so Digit
// (scale 0.82) is judged by her own size.

const BREEDS = PRESETS.filter((b) => b !== 'hagrid');
const SITS = ['requestPet', 'perch'];
const CASES = BREEDS.flatMap((b) => [false, true].flatMap((simple) => SITS.map((s) => [b, simple, s])));

const posed = (breed, state, simple, t = 1.3) => {
  const cat = buildCat(breed, undefined, { simple });
  animateCat(cat, state, t, 0, false);
  cat.updateMatrixWorld(true);
  return cat;
};

// polish-sit Task 3 carried the group-hung back items on the posed torso in
// the sit (ruling R4). Since accessories polish Task 2 the backpack, wings and
// jetpack hang on the body itself (backitems.js), so the sit carries them
// like the coats: they ride the posed torso, stay above the ground and out of
// the fur, over a cape too, and leaving the sit puts them back as built.
describe('the back items ride the upright sit (polish-sit Task 3, accessories polish Task 2)', () => {
  const KITS = [{ back: 'backpack', body: 'cape' }, { back: 'wings', body: 'confetticape' }, { back: 'jetpack', body: 'cape' }, { back: 'backpack' }, { back: 'wings' }, { back: 'jetpack' }];
  const kitCat = (b, kit, simple) => buildCat(b, { collar: null, head: null, face: null, neck: null, feet: null, body: null, ...kit }, { simple });
  const items = (cat) => { const out = []; cat.userData.parts.body.traverse((c) => { if (c.isMesh && c.userData.backItem) out.push(c); }); return out; };
  const v = new THREE.Vector3();
  const lowest = (obj, s) => {
    let low = Infinity;
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) low = Math.min(low, v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).y / s);
    });
    return low;
  };

  it.each(CASES)('%s (simple %s) %s: every item rides the posed torso, none in the ground', (b, simple, state) => {
    for (const kit of KITS) {
      const cat = kitCat(b, kit, simple);
      const its = items(cat);
      expect(its.length, `${kit.back}: on the body`).toBe(kit.back === 'wings' ? 2 : 1);
      animateCat(cat, state, 1.3, 0, false);
      cat.updateMatrixWorld(true);
      for (const item of its) {
        expect(kit.back === 'wings' ? item.parent.parent : item.parent).toBe(cat.userData.parts.body);
        expect(lowest(item, cat.scale.x), `${kit.back}+${kit.body}: above the ground`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // Out of the fur in the sit (swept over the flutter), over a cape too.
  const ray = new THREE.Raycaster();
  const outside = (cat, Pw) => {
    const { body, underside } = cat.userData.parts;
    const C = body.getWorldPosition(new THREE.Vector3());
    const dir = Pw.clone().sub(C).normalize(), F = Pw.clone().addScaledVector(dir, 1);
    ray.set(F, dir.clone().negate());
    const hit = ray.intersectObjects([body, underside], false)[0];
    return hit ? (hit.distance - F.distanceTo(Pw)) / cat.scale.x : Infinity;
  };
  const meshVerts = (obj) => {
    const out = [];
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
    });
    return out;
  };
  it.each(CASES)('%s (simple %s) %s: the items stay out of the fur, over a cape too', (b, simple, state) => {
    for (const kit of KITS.slice(0, 3)) {
      const cat = kitCat(b, kit, simple);
      for (const t of [0, 0.7, 1.3, 2.1, 2.9]) {
        animateCat(cat, state, t, 0, false);
        cat.updateMatrixWorld(true);
        for (const item of items(cat)) {
          let worst = Infinity;
          for (const P of meshVerts(item)) worst = Math.min(worst, outside(cat, P));
          expect(worst, `${kit.back}+${kit.body} t ${t}: out of the fur`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  }, 120_000);

  it.each(CASES)('%s (simple %s) %s: the backpack sits on the fur, within 3 cm of it', (b, simple, state) => {
    const cat = kitCat(b, { back: 'backpack' }, simple);
    animateCat(cat, state, 1.3, 0, false);
    cat.updateMatrixWorld(true);
    const [pack] = items(cat);
    const p = pack.geometry.attributes.position;
    let nearest = Infinity, farthest = -Infinity;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(pack.matrixWorld);
      const out = outside(cat, v.clone());
      nearest = Math.min(nearest, out); farthest = Math.max(farthest, out);
    }
    expect(nearest, 'the pack touches the fur').toBeLessThanOrEqual(0.03);
    expect(nearest, 'and is not in it').toBeGreaterThanOrEqual(0);
    expect(farthest, 'it stands on the back').toBeGreaterThan(0.05);
  });

  it.each(BREEDS.flatMap((b) => [false, true].map((simple) => [b, simple])))('%s (simple %s): sit → follow puts every item back as built; a follow never moves the pack or jetpack', (b, simple) => {
    const pose = (cat) => items(cat).map((c) => [c.position.toArray(), c.quaternion.toArray(), c.scale.toArray()]);
    for (const kit of KITS) {
      const built = pose(kitCat(b, kit, simple));
      // a follow never moves the pack or the jetpack (the wings flutter)
      if (kit.back !== 'wings') {
        const fresh = kitCat(b, kit, simple);
        for (const t of [0.4, 2.1]) {
          animateCat(fresh, 'follow', t, 0, false);
          expect(pose(fresh), `${kit.back} follow t ${t}`).toEqual(built);
        }
      }
      for (const state of SITS) {
        const cat = kitCat(b, kit, simple);
        animateCat(cat, state, 1.3, 0, false);
        animateCat(cat, 'follow', 0, 0, false);   // sin 0: the wings' flutter at rest
        expect(pose(cat), `${kit.back} ${state} → follow`).toEqual(built);
      }
    }
  });
  // The sit lowers the chest (torso.js SIT.chestDrop) so it reads as a bib,
  // not a collar under the chin; leaving the sit puts the underside back.
  it.each(CASES)('%s (simple %s) %s: the chest sits SIT.chestDrop lower, and is put back after', (b, simple, state) => {
    const cat = posed(b, state, simple);
    const u = cat.userData.parts.underside, s = cat.scale.x;
    const centre = () => { cat.updateMatrixWorld(true); return new THREE.Vector3().fromArray(u.userData.chestCentre).applyMatrix4(u.matrixWorld).divideScalar(s); };
    const dropped = centre();
    u.userData.drop = 0; refitNeck(cat, state);
    const held = centre();
    expect(held.y - dropped.y).toBeCloseTo(SIT.chestDrop, 9);
    expect(Math.abs(held.x - dropped.x) + Math.abs(held.z - dropped.z)).toBeLessThan(1e-9);
    animateCat(cat, state, 1.3, 0, false);
    animateCat(cat, 'follow', 2.1, 0, false);
    const fresh = buildCat(b, undefined, { simple });
    animateCat(fresh, 'follow', 2.1, 0, false);
    const fu = fresh.userData.parts.underside;
    expect([u.position.toArray(), u.scale.toArray(), u.userData.drop]).toEqual([fu.position.toArray(), fu.scale.toArray(), fu.userData.drop]);
  });

  // The chest bib faces the front camera standing and sitting: the chest
  // vertices painted (within 0.05) the pale chest colour have a mean world
  // normal pointing forward (z < -0.5; the cat faces -z). catcoat.test.js
  // 'the bib faces the front camera' holds the same bib to 30° of the front.
  // Not Robbie: his torso is painted white under the chest too (the cow
  // flanks and bib), so his "pale" vertices are the whole chest ball, the
  // underside included, and say nothing about where the bib looks.
  it.each(BREEDS.filter((b) => b !== 'robbie').flatMap((b) => ['follow', ...SITS].map((s) => [b, s])))('%s %s: the bib faces forward', (b, state) => {
    const cat = posed(b, state, false);
    const { underside: u, body } = cat.userData.parts;
    const pos = u.geometry.attributes.position, nor = u.geometry.attributes.normal, col = u.geometry.attributes.color;
    const [a, z] = u.userData.ranges.chest;
    const pale = new THREE.Color(body.userData.coat.chest), c = new THREE.Color();
    const nm = new THREE.Matrix3().getNormalMatrix(u.matrixWorld), sum = new THREE.Vector3();
    let n = 0;
    for (let i = a; i < z; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      if (colourDistance(c, pale) >= 0.05) continue;
      sum.add(v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize());
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(sum.divideScalar(n).z).toBeLessThan(-0.5);
  });
});
