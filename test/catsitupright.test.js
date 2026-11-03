import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat, refitNeck } from '../src/cat/animator.js';
import { SIT } from '../src/cat/torso.js';
import { PRESETS, poseMeasure, colourDistance } from './helpers/catfingerprint.js';

// polish-sit Task 1 (2026-11-02): the sit (requestPet, perch) reads as the
// classic Warrior Cats sit. The torso pitches NOSE-UP (three.js: + rotation.x
// lifts the nose, which faces -z), the rump is its low point on the ground,
// the shoulders and neck its high point in front, the head is held high over
// the chest, the forelegs stand as columns under the shoulders and the hind
// legs are tucked under the rump with the foot flat in front. Cats only:
// Hagrid (no folds) keeps his sit line for line (ruling R1).
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
const box = (obj) => new THREE.Box3().setFromObject(obj, true);

// The torso's own vertices (the body mesh and the underside on it: belly,
// chest, ruff), world, in the cat's frame.
function torsoExtremes(cat) {
  const { body, underside } = cat.userData.parts;
  const s = cat.scale.x, v = new THREE.Vector3();
  let low = null, high = null;
  for (const m of [body, underside]) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).divideScalar(s);
      if (!low || v.y < low.y) low = v.clone();
      if (!high || v.y > high.y) high = v.clone();
    }
  }
  return { low, high };
}
const world = (o, s) => o.getWorldPosition(new THREE.Vector3()).divideScalar(s);

describe('an upright sit: rump down, chest up, head high (polish-sit Task 1)', () => {
  it.each(CASES)('%s (simple %s) %s: the torso pitches nose-up, the rump its low point on the ground', (b, simple, state) => {
    const cat = posed(b, state, simple);
    const { body } = cat.userData.parts;
    expect(body.rotation.x, 'nose up').toBeGreaterThanOrEqual(0.5);
    const { low, high } = torsoExtremes(cat);
    const bz = world(body, cat.scale.x).z;
    expect(low.y, 'rump on the ground').toBeGreaterThanOrEqual(-0.01);
    expect(low.y, 'rump on the ground').toBeLessThanOrEqual(0.03);
    expect(low.z, 'the low point is the rump, behind the centre').toBeGreaterThan(bz);
    expect(high.z, 'the high point is the shoulders, in front of the centre').toBeLessThan(bz);
  });

  it.each(CASES)('%s (simple %s) %s: the head is held high over the chest', (b, simple, state) => {
    const cat = posed(b, state, simple);
    const { high } = torsoExtremes(cat);
    const h = world(cat.userData.parts.head, cat.scale.x);
    expect(h.y).toBeGreaterThanOrEqual(high.y - 0.05);
    expect(h.z).toBeLessThanOrEqual(high.z + 0.05);
  });

  it.each(CASES)('%s (simple %s) %s: the forelegs are columns from inside the chest to the ground', (b, simple, state) => {
    const cat = posed(b, state, simple);
    const stand = posed(b, 'follow', simple);
    const s = cat.scale.x;
    const { body, underside } = cat.userData.parts;
    const ray = new THREE.Raycaster();
    for (const i of [0, 1]) {
      const leg = cat.userData.parts.legs[i], paw = leg.userData.paw;
      const hip = leg.getWorldPosition(new THREE.Vector3()), pc = paw.getWorldPosition(new THREE.Vector3());
      const d = pc.clone().sub(hip);
      expect(Math.acos(-d.y / d.length()), `leg ${i}: a vertical column`).toBeLessThanOrEqual(0.12);
      const sole = box(paw).min.y, standSole = box(stand.userData.parts.legs[i].userData.paw).min.y;
      expect(Math.abs(sole - standSole) / s, `leg ${i}: sole on the ground`).toBeLessThanOrEqual(0.006);
      // The hip's top is inside the torso: straight up from 2 cm under the hip
      // the torso's underside is crossed below that point, its top above the hip.
      ray.set(new THREE.Vector3(hip.x, -5, hip.z), new THREE.Vector3(0, 1, 0));
      const under = ray.intersectObjects([body, underside], false)[0];
      ray.set(new THREE.Vector3(hip.x, 5, hip.z), new THREE.Vector3(0, -1, 0));
      const over = ray.intersectObjects([body, underside], false)[0];
      expect(under, `leg ${i}: torso over the hip`).toBeTruthy();
      expect(under.point.y / s, `leg ${i}: the torso's underside below 2 cm under the hip`).toBeLessThanOrEqual(hip.y / s - 0.02);
      expect(over.point.y / s, `leg ${i}: the torso's top above the hip`).toBeGreaterThanOrEqual(hip.y / s);
    }
  });

  it.each(CASES)('%s (simple %s) %s: the hind legs are tucked, the foot flat in front on the ground', (b, simple, state) => {
    const cat = posed(b, state, simple);
    const s = cat.scale.x;
    for (const i of [2, 3]) {
      const leg = cat.userData.parts.legs[i];
      const hip = world(leg, s), paw = world(leg.userData.paw, s);
      expect(paw.z, `leg ${i}: foot ahead of the hip`).toBeLessThan(hip.z);
      expect(box(leg.userData.paw).min.y / s, `leg ${i}: sole on the ground`).toBeLessThanOrEqual(0.02);
      expect(box(leg).min.y / s, `leg ${i}: nothing in the ground`).toBeGreaterThanOrEqual(-0.01);
    }
  });

  // R3: the name tag (nametag.js TAG_Y) keeps its margin without moving.
  it.each(CASES)('%s (simple %s) %s: no taller than the cat standing (+1 cm)', (b, simple, state) => {
    const sit = poseMeasure(buildCat(b, undefined, { simple }), state);
    const stand = poseMeasure(buildCat(b, undefined, { simple }), 'follow');
    expect(sit.max).toBeLessThanOrEqual(stand.max + 0.01);
  });

  // Ruling R1: Hagrid keeps his sit. Read from the tree before this change (2daf64e).
  it.each([['requestPet', -0.18], ['perch', 0.05]])('Hagrid keeps his %s', (state, headRotX) => {
    const cat = buildCat('hagrid');
    animateCat(cat, state, 1.3, 0, false);
    const { body, head } = cat.userData.parts;
    expect(body.rotation.x).toBe(-0.5);
    expect(body.position.toArray()).toEqual([0, 0.39999999999999997, 0]);
    expect(head.position.toArray()).toEqual([0, 0.8400000000000001, -0.18000000000000002]);
    expect(head.rotation.x).toBe(headRotX);
  });

  // Leaving the sit restores the cat exactly.
  it.each(BREEDS.flatMap((b) => [false, true].flatMap((simple) => SITS.map((s) => [b, simple, s]))))('%s (simple %s): leaving the %s restores the pose exactly', (b, simple, state) => {
    const cat = buildCat(b, undefined, { simple });
    animateCat(cat, state, 1.3, 0, false);
    animateCat(cat, 'follow', 2.1, 0, false);
    const fresh = buildCat(b, undefined, { simple });
    animateCat(fresh, 'follow', 2.1, 0, false);
    const P = cat.userData.parts, F = fresh.userData.parts;
    expect(P.body.position.toArray()).toEqual(F.body.position.toArray());
    expect(P.body.rotation.toArray()).toEqual(F.body.rotation.toArray());
    expect(P.head.position.toArray()).toEqual(F.head.position.toArray());
    expect(P.head.rotation.toArray()).toEqual(F.head.rotation.toArray());
    expect(P.tail.position.toArray()).toEqual(F.tail.position.toArray());
    P.legs.forEach((leg, i) => {
      expect(leg.position.toArray(), `leg ${i}`).toEqual(F.legs[i].position.toArray());
      expect(leg.rotation.toArray(), `leg ${i}`).toEqual(F.legs[i].rotation.toArray());
      expect(leg.scale.toArray(), `leg ${i}`).toEqual(F.legs[i].scale.toArray());
    });
  });
});

// polish-sit Task 2 (2026-11-02): the sitting tail lies round the paws, the
// Warrior Cats sit's other half. Its root rides the posed torso at the rump,
// it falls to the ground and curls round the cat's left haunch, low along the
// ground, the tip forward of the hind hips and beside (not under) the cat. The
// tip flicks (sin(t*2.2)), so every check sweeps t 0..3 by 0.25. Every
// measure is in the cat's own frame.
describe('the sitting tail lies round the paws (polish-sit Task 2)', () => {
  const TS = Array.from({ length: 13 }, (_, i) => i * 0.25);
  const TAIL_LINK = 0.14; // torso.js TAIL.LINK, one link along the pivot's +z
  const v = new THREE.Vector3();
  // Every vertex of tail link i, cat frame.
  const linkVerts = (cat, i) => {
    const seg = cat.userData.parts.tailPivots[i].children[0], p = seg.geometry.attributes.position, out = [];
    for (let k = 0; k < p.count; k++) out.push(v.fromBufferAttribute(p, k).applyMatrix4(seg.matrixWorld).divideScalar(cat.scale.x).clone());
    return out;
  };
  // How far a cat-frame point P lies outside (+) or inside (-) the torso
  // (body + underside), along the line from the torso's centre through P: a
  // ray cast from 1 m out back toward the centre meets the outer surface first
  // (the faces are one-sided, so a ray from inside would see none).
  const ray = new THREE.Raycaster();
  const outside = (cat, P) => {
    const { body, underside } = cat.userData.parts, s = cat.scale.x;
    const C = body.getWorldPosition(new THREE.Vector3());
    const Pw = P.clone().multiplyScalar(s), dir = Pw.clone().sub(C).normalize();
    const F = Pw.clone().addScaledVector(dir, 1);
    ray.set(F, dir.clone().negate());
    const hit = ray.intersectObjects([body, underside], false)[0];
    if (!hit) return Infinity;
    return (hit.distance - F.distanceTo(Pw)) / s; // + : the surface lies beyond P, so P is outside
  };

  it.each(CASES)('%s (simple %s) %s: the root sits in the rump, within 3 cm of its surface', (b, simple, state) => {
    const cat = posed(b, state, simple);
    const root = world(cat.userData.parts.tail, cat.scale.x);
    expect(root.z, 'at the rump, behind the torso centre').toBeGreaterThan(world(cat.userData.parts.body, cat.scale.x).z);
    const d = outside(cat, root);
    expect(d, 'not more than 3 cm out of the fur').toBeLessThanOrEqual(0.03);
    expect(d, 'not more than 3 cm under it').toBeGreaterThanOrEqual(-0.03);
  });

  it.each(CASES)('%s (simple %s) %s: the tail lies on the ground round the left haunch, the tip forward and beside the cat', (b, simple, state) => {
    const cat = buildCat(b, undefined, { simple });
    const s = cat.scale.x;
    for (const t of TS) {
      animateCat(cat, state, t, 0, false);
      cat.updateMatrixWorld(true);
      const { tailPivots, legs } = cat.userData.parts;
      let low = Infinity;
      for (let i = 0; i < 5; i++) for (const p of linkVerts(cat, i)) low = Math.min(low, p.y);
      expect(low, `t ${t}: no tail in the ground`).toBeGreaterThanOrEqual(-0.01);
      const tip = tailPivots[4].localToWorld(new THREE.Vector3(0, 0, TAIL_LINK)).divideScalar(s);
      expect(tip.y, `t ${t}: the tip lies low`).toBeLessThanOrEqual(0.12);
      const hipZ = Math.min(world(legs[2], s).z, world(legs[3], s).z);
      expect(tip.z, `t ${t}: the tip comes round ahead of the hind hips`).toBeLessThan(hipZ);
      expect(Math.abs(tip.x), `t ${t}: the tip beside the cat, not under it`).toBeGreaterThanOrEqual(0.08);
    }
  }, 120_000);

  it.each(CASES)('%s (simple %s) %s: past the root, no tail goes through the torso', (b, simple, state) => {
    const cat = buildCat(b, undefined, { simple });
    // Links 2 and 3 do not move with t; the tip link flicks, so it is swept.
    for (const t of TS) {
      animateCat(cat, state, t, 0, false);
      cat.updateMatrixWorld(true);
      for (const i of t === 0 ? [2, 3, 4] : [4]) {
        let worst = Infinity;
        for (const p of linkVerts(cat, i)) worst = Math.min(worst, outside(cat, p));
        expect(worst, `t ${t}: link ${i} outside the torso`).toBeGreaterThanOrEqual(0);
      }
    }
  }, 120_000);

  // Ruling R1: Hagrid's fan rides his body (rideTail) and keeps the old sit
  // tail. Read from the tree before this change (5a04fb3).
  it.each(SITS)('Hagrid keeps his %s tail', (state) => {
    const cat = buildCat('hagrid');
    animateCat(cat, state, 1.3, 0, false);
    const { tail, tailPivots } = cat.userData.parts;
    expect(tail.position.toArray()).toEqual([0, 0.6323986029234785, 0.237678121330541]);
    expect(tail.rotation.toArray().slice(0, 3)).toEqual([-0.1, 0, 0]);
    expect(tailPivots.map((p) => p.rotation.toArray().slice(0, 3))).toEqual([[0, 0.24168288887248796, 0], [0, 0.5, 0], [0, 0.5, 0], [0, 0.5, 0], [0, 0.5, 0]]);
  });
});

// polish-sit Task 3 carried the group-hung back items on the posed torso in
// the sit (ruling R4). Since accessories polish Task 2 the backpack, wings and
// jetpack hang on the body itself (backitems.js), so the sit carries them
// like the coats: they ride the posed torso, stay above the ground and out of
// the fur, over a cape too, and leaving the sit puts them back as built.
describe('the back items ride the upright sit (polish-sit Task 3, accessories polish Task 2)', () => {
  const KITS = [{ back: 'backpack', body: 'cape' }, { back: 'wings', body: 'confetticape' }, { back: 'jetpack', body: 'cape' }, { back: 'backpack' }, { back: 'wings' }, { back: 'jetpack' }];
  const kitCat = (b, kit, simple) => buildCat(b, { collar: null, head: null, face: null, neck: null, feet: null, body: null, ...kit }, { simple });
  const items = (cat) => cat.userData.parts.body.children.filter((c) => c.userData.backItem);
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
      cat.traverse((o) => expect(o.userData.ridesBody).toBeUndefined());
      animateCat(cat, state, 1.3, 0, false);
      cat.updateMatrixWorld(true);
      for (const item of its) {
        expect(item.parent).toBe(cat.userData.parts.body);
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

  it.each(BREEDS.flatMap((b) => [false, true].map((simple) => [b, simple])))('%s (simple %s): sit → follow puts every item back as built', (b, simple) => {
    const pose = (cat) => items(cat).map((c) => [c.position.toArray(), c.quaternion.toArray(), c.scale.toArray()]);
    for (const kit of KITS) {
      const built = pose(kitCat(b, kit, simple));
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

  it('nothing outside the cat builder rides: Hagrid has no riders', () => {
    const hen = buildCat('hagrid', { collar: null, head: null, face: null, neck: null, feet: null, back: 'backpack', body: 'cape' });
    hen.traverse((o) => expect(o.userData.ridesBody).toBeUndefined());
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
