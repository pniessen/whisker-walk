import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { BOW } from '../src/cat/torso.js';
import { PRESETS } from './helpers/catfingerprint.js';
import { flankLumps } from './helpers/catflank.js';

// Cat realism, the pose fixes (A7 and the old blemishes, 2026-11-15). One
// describe per fix; each holds the measure that would have caught the blemish.

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const BUILDS = PRESETS.flatMap((breed) => [[breed, false], [breed, true]]);
const label = (breed, simple) => `${breed}${simple ? ' simple' : ''}`;

// A cat in its own frame (group scale 1 at the origin): rig units.
function make(breed, simple = false, acc = {}, opts = {}) {
  const cat = buildCat(breed, { ...BARE, ...acc }, { ...opts, simple });
  cat.scale.setScalar(1);
  return cat;
}
function pose(cat, state, t = 1.3, speed = 0) {
  animateCat(cat, state, t, speed, false);
  cat.updateMatrixWorld(true);
  return cat;
}
const _v = new THREE.Vector3();
// The lowest and highest point of everything under `obj`, cat frame.
function span(obj, from = 0, to = Infinity) {
  let min = Infinity, max = -Infinity;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = from; i < Math.min(to, p.count); i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (_v.y < min) min = _v.y;
      if (_v.y > max) max = _v.y;
    }
  });
  return { min, max };
}

describe('the stretch is a play bow (A7)', () => {
  it('the front paws press on the ground, and so do the hind paws', () => {
    for (const [breed, simple] of BUILDS) {
      for (const feet of [null, 'booties', 'rainboots', 'sneakers', 'socks']) {
        const cat = pose(make(breed, simple, { feet }), 'stretch');
        cat.userData.parts.legs.forEach((leg, i) => {
          const low = span(leg).min;
          const at = `${label(breed, simple)} ${feet ?? 'bare'} leg ${i}`;
          expect(low, at).toBeGreaterThanOrEqual(-0.005);
          expect(low, at).toBeLessThanOrEqual(0.005);
        });
      }
    }
  });

  it('the pale chest is down under the head, not a lump behind it', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = pose(make(breed, simple), 'stretch');
      const { body, head, underside } = cat.userData.parts;
      const [from, to] = underside.userData.ranges.chest;
      const chest = span(underside, from, to);
      const at = label(breed, simple);
      // The old stretch held the chest's top 34 cm over the head's centre, behind it
      // (0.80 against 0.46 on a tabby); the bow's is 4 cm under it (0.40 against 0.435).
      expect(chest.max, at).toBeLessThan(head.position.y - 0.02);
      // nose-down: the rump is up, the shoulders down
      expect(body.rotation.x, at).toBeLessThan(-0.3);
      // the chest is low over the ground, never in it
      expect(span(body).min, at).toBeGreaterThanOrEqual(0);
      expect(span(body).min, at).toBeLessThanOrEqual(0.06);
    }
  });

  it('the front hips come down to the same height on every cat; the hind hips stay where they stand', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = make(breed, simple);
      const { body, legs } = cat.userData.parts;
      const { hipY, bodyY, bodyScale } = cat.userData.base;
      pose(cat, 'stretch');
      const hip = (leg) => _v.set(0, (hipY - bodyY) / bodyScale[1], leg.userData.hipZ / bodyScale[2]).applyMatrix4(body.matrix).clone();
      const front = hip(legs[0]), hind = hip(legs[2]);
      const at = label(breed, simple);
      expect(front.y, at).toBeCloseTo(BOW.shoulder, 6);
      expect(front.z, at).toBeCloseTo(legs[0].position.z, 6);
      expect(hind.y, at).toBeCloseTo(hipY, 6);
      expect(hind.z, at).toBeCloseTo(legs[2].position.z, 6);
    }
  });

  it('the tail leaves the raised rump where it does standing', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = make(breed, simple);
      const { body, tail } = cat.userData.parts;
      const inBody = () => { body.updateMatrix(); return _v.copy(tail.position).applyMatrix4(body.matrix.clone().invert()).toArray(); };
      pose(cat, 'follow', 0);
      const rest = inBody();
      pose(cat, 'stretch');
      const bowed = inBody();
      for (let k = 0; k < 3; k++) expect(bowed[k], `${label(breed, simple)} ${k}`).toBeCloseTo(rest[k], 6);
    }
  });

  it('nothing worn is in the ground', () => {
    const worn = [{ collar: 'bell' }, { collar: 'heart' }, { neck: 'scarf' }, { neck: 'necktie' }, { neck: 'bowtie' }, { neck: 'bandana' }, { neck: 'streamerscarf' },
      { body: 'cape' }, { body: 'sweater' }, { body: 'hoodie' }, { back: 'backpack' }, { head: 'tophat' }];
    for (const breed of PRESETS) {
      for (const acc of worn) {
        const cat = pose(make(breed, false, acc), 'stretch');
        expect(span(cat).min, `${breed} ${JSON.stringify(acc)}`).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  it('going back to standing puts everything back', () => {
    const a = make('tabby'), b = make('tabby');
    pose(a, 'stretch'); pose(a, 'follow', 0);
    pose(b, 'follow', 0);
    const { legs: la, body: ba, tail: ta, head: ha } = a.userData.parts, { legs: lb, body: bb, tail: tb, head: hb } = b.userData.parts;
    la.forEach((leg, i) => {
      expect(leg.position.toArray()).toEqual(lb[i].position.toArray());
      expect(Array.from(leg.children[0].geometry.attributes.position.array)).toEqual(Array.from(lb[i].children[0].geometry.attributes.position.array));
    });
    expect(ba.position.toArray()).toEqual(bb.position.toArray());
    expect(ta.position.toArray()).toEqual(tb.position.toArray());
    expect(ha.position.toArray()).toEqual(hb.position.toArray());
  });
});

// The neck's length: the posed chest centre (read through the underside, as
// the collar's carry reads it) to the head's centre.
function neckLength(cat) {
  const { body, head, underside } = cat.userData.parts;
  body.updateMatrix(); underside.updateMatrix();
  return _v.fromArray(underside.userData.chestCentre).applyMatrix4(underside.matrix).applyMatrix4(body.matrix).distanceTo(head.position);
}

describe('landing, the head comes down with the body (A7)', () => {
  it('the neck is no longer than the standing cat\'s, and not crushed', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = make(breed, simple);
      const standing = neckLength(pose(cat, 'follow', 0));
      const landed = neckLength(pose(cat, 'land'));
      // The old landing left the head where it stood over a body squashed 6 cm
      // down: the neck was 5.7 cm longer than standing, the head floating.
      expect(landed, label(breed, simple)).toBeLessThanOrEqual(standing + 0.005);
      expect(landed, label(breed, simple)).toBeGreaterThanOrEqual(standing - 0.03);
    }
  });
  it('a collar stays on the neck and nothing goes into the ground', () => {
    for (const breed of PRESETS) {
      const cat = pose(make(breed, false, { collar: 'bell', neck: 'scarf', head: 'tophat', body: 'cape' }), 'land');
      expect(span(cat).min, breed).toBeGreaterThanOrEqual(-0.001);
    }
  });
});

describe('sitting, the chest is drawn into the chest line', () => {
  const ray = new THREE.Raycaster();
  // How far the chest ball's vertices stand out of the torso's own surface, along the ray from the torso's centre.
  function chestProud(cat) {
    const { body, underside } = cat.userData.parts;
    const C = body.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(), from = new THREE.Vector3();
    const [a, b] = underside.userData.ranges.chest, p = underside.geometry.attributes.position;
    let worst = -Infinity;
    for (let i = a; i < b; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(underside.matrixWorld);
      dir.subVectors(_v, C).normalize();
      ray.set(from.copy(C).addScaledVector(dir, 2), dir.clone().negate());
      const hit = ray.intersectObject(body, false)[0];
      worst = Math.max(worst, _v.distanceTo(C) - (2 - hit.distance));
    }
    return worst;
  }
  it('the chest ball stands no more than 3.5 cm out of the torso (it stood 7 cm out, a ball with a shelf under it)', () => {
    for (const [breed, simple] of BUILDS) {
      for (const state of ['perch', 'requestPet']) {
        expect(chestProud(pose(make(breed, simple), state)), `${label(breed, simple)} ${state}`).toBeLessThanOrEqual(0.035);
      }
    }
  });
  it('only the chest, its tufts and the ruff move; getting up puts every vertex back exactly', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = make(breed, simple);
      const { underside } = cat.userData.parts;
      const { belly, chest } = underside.userData.ranges;
      const pos = underside.geometry.attributes.position.array;
      pose(cat, 'follow', 0);
      const built = pos.slice();
      pose(cat, 'perch');
      expect(Array.from(pos.slice(belly[0] * 3, belly[1] * 3)), label(breed, simple)).toEqual(Array.from(built.slice(belly[0] * 3, belly[1] * 3)));
      expect(pos[chest[0] * 3 + 1]).not.toBe(built[chest[0] * 3 + 1]);
      pose(cat, 'perch', 2.0); pose(cat, 'requestPet');
      pose(cat, 'follow', 0);
      const [a, b] = [0, (underside.userData.ranges.neck?.[0] ?? pos.length / 3) * 3]; // the neck is re-laid every frame
      expect(Array.from(pos.slice(a, b)), label(breed, simple)).toEqual(Array.from(built.slice(a, b)));
    }
  });
});

// The stalk's thigh through the body. Rounds 1 and 2 (the rump drawn over the
// thigh tops, torso.js TORSO.SHAPE thigh) already brought it in: measured
// 2026-11-15, no upper-leg vertex stands more than 0.8 cm out of the flank on
// any preset (0.1-0.2 cm on a standard cat, 0.5-0.8 cm on the slim Siamese and
// Digit), still or creeping. folds.test.js holds the tabby and Digit to 1.2 cm;
// this holds every preset and the kitten to 1 cm.
describe('stalking, no thigh pokes through the body', () => {
  const period = (2 * Math.PI) / (4.5 + 1.5 * 1.4); // walkGait's stride at 1.5
  const poses = [[1.3, 0], ...Array.from({ length: 8 }, (_, k) => [0.2 + (k / 8) * period, 1.5])];
  it('no upper-leg vertex lies more than 1 cm outside the torso', () => {
    const builds = [...BUILDS.map(([b, simple]) => [b, simple, {}]), ['calico', false, { kitten: true }]];
    for (const [breed, simple, opts] of builds) {
      const cat = make(breed, simple, {}, opts);
      for (const [t, speed] of poses) {
        const r = flankLumps(pose(cat, 'stalk', t, speed));
        expect(r.checked, label(breed, simple)).toBeGreaterThan(100);
        expect(r.worst, `${label(breed, simple)} t ${t.toFixed(2)} speed ${speed}: ${r.at}`).toBeLessThanOrEqual(0.01);
      }
    }
  }, 240_000);
});

describe('napping, the head is down on the paws', () => {
  it('the chin rests just over the forepaws, the nose level or down, the face turned to the tail', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = pose(make(breed, simple), 'nap');
      const { head, legs } = cat.userData.parts;
      const at = label(breed, simple);
      const paws = Math.max(span(legs[0].userData.paw).max, span(legs[1].userData.paw).max);
      const chin = span(head.children[0]).min; // the skull's lowest point
      // It was held 12-13 cm over the paws, the face tipped 0.55 rad to the sky.
      expect(chin - paws, at).toBeLessThanOrEqual(0.04);
      expect(chin, at).toBeGreaterThanOrEqual(0.02);
      expect(head.rotation.x, at).toBeLessThanOrEqual(0);
      expect(head.rotation.y, at).toBeGreaterThan(0.5);
      // forward of the front hips, over the paws
      expect(head.position.z, at).toBeLessThan(legs[0].position.z - 0.1);
    }
  });
  it('nothing worn is in the ground, and the tail still lies wrapped round the cat\'s left', () => {
    const worn = [{}, { collar: 'bell' }, { collar: 'studded' }, { neck: 'scarf' }, { neck: 'necktie' }, { neck: 'bowtie' }, { neck: 'bandana' }, { neck: 'streamerscarf' },
      { body: 'cape' }, { body: 'hoodie' }, { back: 'backpack' }, { head: 'tophat', face: 'glasses' }];
    for (const breed of PRESETS) {
      for (const acc of worn) {
        const cat = pose(make(breed, false, acc), 'nap');
        expect(span(cat).min, `${breed} ${JSON.stringify(acc)}`).toBeGreaterThanOrEqual(-0.001);
      }
      const cat = pose(make(breed), 'nap');
      const tip = cat.userData.parts.tailPivots[4].getWorldPosition(new THREE.Vector3());
      expect(tip.x, breed).toBeLessThan(-0.15);
      expect(tip.z, breed).toBeLessThan(cat.userData.parts.tail.position.z - 0.1);
    }
  });
});

describe('grooming, the raised paw shows under the chin', () => {
  it('the front right paw is lifted clear of the ground, ahead of the chest and under the lowered head; the other three stand', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = make(breed, simple);
      const { legs, head, body } = cat.userData.parts;
      pose(cat, 'follow', 0);
      const standing = head.position.y;
      pose(cat, 'groom');
      const at = label(breed, simple);
      const paw = new THREE.Box3().setFromObject(legs[1].userData.paw, true);
      const lift = cat.userData.base.hipY - 0.30; // the hip over the reference rig's
      // It was swung back under the belly: its paw behind the front hips, hidden by the torso from the side and from above.
      expect(paw.min.y, at).toBeGreaterThan(0.15 + lift);
      expect(paw.max.z, at).toBeLessThan(legs[1].position.z - 0.05); // ahead of its own hip
      expect(paw.max.y, at).toBeLessThan(head.position.y);            // under the head's centre
      expect(paw.min.z, at).toBeGreaterThan(head.position.z - 0.25);  // not out past the nose
      expect(head.position.y, at).toBeLessThan(standing - 0.05);      // the head comes down to it
      expect(head.rotation.x, at).toBeLessThan(0);                    // nose down
      // not buried: the paw's front is ahead of the torso's own front there
      const front = new THREE.Box3().setFromObject(body, true).min.z;
      expect(paw.min.z, at).toBeLessThan(front + 0.02);
      for (const i of [0, 2, 3]) {
        const low = span(legs[i]).min;
        expect(Math.abs(low), `${at} leg ${i}`).toBeLessThanOrEqual(0.005);
        expect(legs[i].userData.fold, `${at} leg ${i}`).toBe('stand');
      }
      expect(legs[1].userData.fold, at).toBe('lick');
      pose(cat, 'follow', 0);
      expect(legs[1].userData.fold, at).toBe('stand');
    }
  });
  it('a boot goes up with the paw', () => {
    for (const feet of ['booties', 'rainboots', 'sneakers', 'socks']) {
      const cat = pose(make('tabby', false, { feet }), 'groom');
      const leg = cat.userData.parts.legs[1];
      expect(span(leg).min, feet).toBeGreaterThan(0.1);
    }
  });
});

describe('the tail root wears the rump\'s colour (round 1\'s leftover)', () => {
  it('at the root ball the link is the coat painted on the rump under it; by its far end it is the tail\'s own colour', async () => {
    const { coatColourAt } = await import('../src/cat/coat.js');
    const { torsoUnitAt, TAIL } = await import('../src/cat/torso.js');
    for (const breed of ['tabby', 'calico', 'black', 'persian', 'mainecoon']) {
      const cat = make(breed);
      const { body, tail, tailPivots } = cat.userData.parts;
      // the tail carried as the root was painted for: TAIL.SEAM_LIFT above level
      tail.rotation.set(-TAIL.SEAM_LIFT, 0, 0); tailPivots[0].rotation.set(0, 0, 0);
      cat.updateMatrixWorld(true);
      const link = tailPivots[0].children[0], col = link.geometry.attributes.color, p = link.geometry.attributes.position;
      expect(col, breed).toBeTruthy();
      const want = new THREE.Color(), got = new THREE.Color(), inv = body.matrixWorld.clone().invert();
      let ball = 0, worst = 0;
      const n = link.geometry.userData.tufts?.start ?? p.count; // the link's own surface (its fur follows)
      for (let i = 0; i < n; i++) {
        if (p.getZ(i) > 1e-6) continue;
        ball++;
        // the rump under this vertex
        _v.fromBufferAttribute(p, i).applyMatrix4(link.matrixWorld).applyMatrix4(inv);
        coatColourAt(body.userData.coat, torsoUnitAt([_v.x, _v.y, _v.z]), want);
        got.fromBufferAttribute(col, i);
        worst = Math.max(worst, Math.hypot(got.r - want.r, got.g - want.g, got.b - want.b));
      }
      expect(ball, breed).toBeGreaterThan(20);
      expect(worst, breed).toBeLessThan(0.02);
    }
    // family cats, pointed cats and crowd cats keep the plain root
    for (const [breed, simple] of [['digit', false], ['d2', false], ['robbie', false], ['zeetoo', false], ['siamese', false], ['tabby', true]]) {
      expect(make(breed, simple).userData.parts.tailPivots[0].children[0].geometry.attributes.color, breed).toBeUndefined();
    }
  });
});
