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
  // 2026-11-16 (cat realism B11): the belly's points near the torso's surface
  // are now drawn onto it too when the cat sits (animator.js sinkChest: the
  // sit's flattened, lowered underside left its rim as a ragged pale edge), so
  // the belly no longer stays exactly as built: no point of it moves more
  // than 1.5 cm. The chest still moves, and getting up still puts every
  // vertex, normal and colour back exactly.
  it('only the chest, its tufts, the ruff and the belly\'s rim move; getting up puts every vertex back exactly', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = make(breed, simple);
      const { underside } = cat.userData.parts;
      const { belly, chest } = underside.userData.ranges;
      const pos = underside.geometry.attributes.position.array;
      const nor = underside.geometry.attributes.normal.array, col = underside.geometry.attributes.color.array;
      pose(cat, 'follow', 0);
      const built = pos.slice(), builtNor = nor.slice(), builtCol = col.slice();
      pose(cat, 'perch');
      const [sx, sy, sz] = cat.userData.base.bodyScale;
      for (let i = belly[0] * 3; i < belly[1] * 3; i += 3) {
        const d = Math.hypot((pos[i] - built[i]) * sx, (pos[i + 1] - built[i + 1]) * sy, (pos[i + 2] - built[i + 2]) * sz);
        expect(d, `${label(breed, simple)} belly point ${i / 3}`).toBeLessThanOrEqual(0.015);
      }
      expect(pos[chest[0] * 3 + 1]).not.toBe(built[chest[0] * 3 + 1]);
      pose(cat, 'perch', 2.0); pose(cat, 'requestPet');
      pose(cat, 'follow', 0);
      const [a, b] = [0, (underside.userData.ranges.neck?.[0] ?? pos.length / 3) * 3]; // the neck is re-laid every frame
      expect(Array.from(pos.slice(a, b)), label(breed, simple)).toEqual(Array.from(built.slice(a, b)));
      expect(Array.from(nor.slice(a, b)), label(breed, simple)).toEqual(Array.from(builtNor.slice(a, b)));
      expect(Array.from(col.slice(a, b)), label(breed, simple)).toEqual(Array.from(builtCol.slice(a, b)));
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

// Leftovers (2026-11-17). Every cat here is posed STANDING first, as a cat in
// play is, then laid down, then got up again.
describe('napping, the cat curls toward its tail and no lump stands behind the head (leftovers)', () => {
  const chestTop = (cat) => {
    const { underside } = cat.userData.parts, [c0, c1] = underside.userData.ranges.chest, p = underside.geometry.attributes.position;
    let top = -Infinity;
    for (let i = c0; i < c1; i++) top = Math.max(top, _v.fromBufferAttribute(p, i).applyMatrix4(underside.matrixWorld).y);
    return top;
  };
  const shoulders = (cat) => {
    const { body } = cat.userData.parts, p = body.geometry.attributes.position;
    let top = -Infinity;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i).applyMatrix4(body.matrixWorld); if (_v.z < -0.2 && _v.z > -0.3) top = Math.max(top, _v.y); }
    return top;
  };
  it('the chest ball lies at least 5 cm under the shoulders (it stood 3.7 cm over them, as high as the back)', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = pose(pose(make(breed, simple), 'follow', 0.5), 'nap');
      const at = label(breed, simple);
      expect(shoulders(cat) - chestTop(cat), at).toBeGreaterThanOrEqual(0.05);
      // and it is behind the head seen from the front: no wider than the skull on the side the head left
      const { head, underside } = cat.userData.parts, [c0, c1] = underside.userData.ranges.chest, p = underside.geometry.attributes.position;
      let right = -Infinity;
      for (let i = c0; i < c1; i++) right = Math.max(right, _v.fromBufferAttribute(p, i).applyMatrix4(underside.matrixWorld).x);
      expect(right, at).toBeLessThanOrEqual(head.position.x + 0.21);
    }
  });
  it('the face is turned more than 60 degrees to the tail and the nose is 10 cm nearer the tail\'s tip than it was', () => {
    for (const [breed, simple] of BUILDS) {
      const cat = pose(pose(make(breed, simple), 'follow', 0.5), 'nap');
      const { head, tailPivots } = cat.userData.parts, at = label(breed, simple);
      expect(head.rotation.y, at).toBeGreaterThan(1.05);
      expect(head.position.x, at).toBeLessThanOrEqual(-0.1); // tucked to the cat's left, the tail's side
      const nose = new THREE.Vector3(0, 0, -0.2).applyMatrix4(head.matrixWorld);
      const tip = new THREE.Vector3(0, 0, 0.14).applyMatrix4(tailPivots[4].matrixWorld);
      expect(tip.x, at).toBeLessThan(0);
      // the old pose, the same cat: head [-0.02, -0.32, -0.08] from standing, turned 0.75
      const was = new THREE.Vector3(0, 0, -0.2).applyEuler(new THREE.Euler(-0.05, 0.75, 0.18)).multiplyScalar(head.scale.x)
        .add(new THREE.Vector3(head.position.x + 0.1, head.position.y, head.position.z - 0.05));
      expect(was.distanceTo(tip) - nose.distanceTo(tip), at).toBeGreaterThanOrEqual(0.10);
    }
  });
  it('the torso is not bent or turned: what lies on the back lies as it did', () => {
    const cat = pose(pose(make('tabby', false, { body: 'cape', back: 'backpack' }), 'follow', 0.5), 'nap');
    const { body } = cat.userData.parts;
    expect(body.rotation.y).toBe(0);
    expect(body.rotation.z).toBe(0);
  });
  it('nothing is uploaded for it: the chest\'s own points are the standing ones, lying down and getting up', () => {
    for (const [breed, simple] of [['tabby', false], ['digit', false], ['persian', false], ['tabby', true]]) {
      const cat = pose(make(breed, simple), 'follow', 0.5);
      const { underside } = cat.userData.parts, [c0, c1] = underside.userData.ranges.chest;
      const cut = () => Array.from(underside.geometry.attributes.position.array.slice(c0 * 3, c1 * 3));
      const stood = cut();
      pose(cat, 'nap');
      expect(cut(), label(breed, simple)).toEqual(stood);
      expect(underside.scale.y).toBeLessThan(1);
      pose(cat, 'follow', 0.5);
      expect(cut(), label(breed, simple)).toEqual(stood);
    }
  });
  it('getting up puts the head, the chest and the neck back exactly, also by way of the sit', () => {
    for (const [breed, simple] of BUILDS) {
      const a = make(breed, simple, { collar: 'bell' }), b = make(breed, simple, { collar: 'bell' });
      pose(a, 'follow', 0.5); pose(a, 'nap'); pose(a, 'perch'); pose(a, 'nap', 2.1); pose(a, 'follow', 0.5);
      pose(b, 'follow', 0.5);
      const at = label(breed, simple);
      for (const part of ['head', 'body', 'underside', 'tail']) {
        const pa = a.userData.parts[part], pb = b.userData.parts[part];
        expect(pa.position.toArray(), `${at} ${part}`).toEqual(pb.position.toArray());
        expect(pa.rotation.toArray(), `${at} ${part}`).toEqual(pb.rotation.toArray());
        expect(pa.scale.toArray(), `${at} ${part}`).toEqual(pb.scale.toArray());
      }
      expect(Array.from(a.userData.parts.underside.geometry.attributes.position.array), at).toEqual(Array.from(b.userData.parts.underside.geometry.attributes.position.array));
      const ca = a.userData.parts.head.userData.collar, cb = b.userData.parts.head.userData.collar;
      expect(ca.position.toArray(), at).toEqual(cb.position.toArray());
      expect(ca.quaternion.toArray(), at).toEqual(cb.quaternion.toArray());
    }
  });
});

describe('in the bow a tall boot or sock lies back along the forearm (leftovers)', () => {
  const TALL = ['rainboots', 'socks'];
  it('standing first, then bowing: each front shell is as low as it is wide, its sole and toe where they were, its shaft back over the wrist; the hind ones stand as built', () => {
    for (const [breed, simple] of BUILDS) for (const feet of TALL) {
      const cat = pose(make(breed, simple, { feet }), 'follow', 0.5);
      const { legs } = cat.userData.parts, at = `${label(breed, simple)} ${feet}`;
      const built = legs.map((leg) => ({ scale: leg.userData.paw.scale.clone(), box: new THREE.Box3().setFromObject(leg.userData.paw) }));
      pose(cat, 'stretch');
      for (let i = 0; i < 4; i++) {
        const paw = legs[i].userData.paw, box = new THREE.Box3().setFromObject(paw);
        if (i >= 2) { expect(paw.scale.toArray(), at).toEqual(built[i].scale.toArray()); continue; }
        expect(paw.scale.y, at).toBe(built[i].scale.x);
        expect(paw.scale.x, at).toBe(built[i].scale.x);
        expect(paw.scale.z, at).toBeCloseTo(built[i].scale.z * built[i].scale.y / built[i].scale.x, 12);
        const tall = box.max.y - box.min.y, was = built[i].box.max.y - built[i].box.min.y;
        expect(tall, at).toBeLessThan(was - 0.015);          // it stood up off the end of the forearm
        expect(box.min.y, at).toBeGreaterThanOrEqual(-0.005); // the sole on the ground
        expect(box.min.y, at).toBeLessThanOrEqual(0.005);
        // the same shell un-laid would end at the same toe: only its heel end goes back
        const long = box.max.z - box.min.z, wasLong = built[i].box.max.z - built[i].box.min.z;
        expect(long, at).toBeGreaterThan(wasLong + 0.02);
        // (the shell's centre went back by the plain paw's half length, 0.062 x 1.42, times the scale it gained)
        const centreUnlaid = paw.getWorldPosition(new THREE.Vector3()).z - 0.062 * 1.42 * (paw.scale.z - built[i].scale.z);
        expect(Math.abs(box.min.z - (centreUnlaid - wasLong / 2)), at).toBeLessThan(0.001); // the toe within 1 mm of where it was
        // the forearm's end is inside it: the top of the shell is over the limb's last ring
        expect(box.max.y, at).toBeGreaterThan(0.076);
      }
    }
  });
  it('a low shell (booties, sneakers, gold booties) and a bare paw are left alone', () => {
    for (const feet of [null, 'booties', 'sneakers', 'goldbooties']) {
      const cat = pose(make('tabby', false, { feet }), 'follow', 0.5);
      const built = cat.userData.parts.legs.map((leg) => leg.userData.paw.scale.toArray());
      pose(cat, 'stretch');
      cat.userData.parts.legs.forEach((leg, i) => expect(leg.userData.paw.scale.toArray(), `${feet}`).toEqual(built[i]));
    }
  });
  it('getting up, and going on into any other fold, puts the shell back exactly', () => {
    for (const feet of TALL) {
      const a = make('tabby', false, { feet }), b = make('tabby', false, { feet });
      pose(a, 'follow', 0.5); pose(a, 'stretch'); pose(a, 'follow', 0.5);
      pose(b, 'follow', 0.5);
      const same = (why) => a.userData.parts.legs.forEach((leg, i) => {
        const pa = leg.userData.paw, pb = b.userData.parts.legs[i].userData.paw;
        expect(pa.scale.toArray(), `${feet} ${why}`).toEqual(pb.scale.toArray());
        expect(pa.position.toArray(), `${feet} ${why}`).toEqual(pb.position.toArray());
        expect(pa.rotation.x, `${feet} ${why}`).toBe(pb.rotation.x);
      });
      same('standing');
      for (const state of ['nap', 'perch', 'stalk', 'groom']) { pose(a, 'stretch'); pose(a, state); pose(b, state); same(state); }
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
    // 2026-11-16 (cat realism B11): crowd cats (the simple tabby and calico) wear it too; they were left plain.
    // 2026-11-17 (leftovers): so do the family cats and the pointed cats, full and simple (they kept a plain root, a disc from behind).
    for (const [breed, simple] of [['tabby'], ['calico'], ['black'], ['persian'], ['mainecoon'], ['tabby', true], ['calico', true],
      ['digit'], ['d2'], ['robbie'], ['zeetoo'], ['siamese'], ['digit', true], ['robbie', true], ['siamese', true]]) {
      const cat = make(breed, !!simple);
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
      // by its far end the link is the tail's own colour: the coat's, a pointed cat's point colour
      // (read off the start of the next link, which is that colour on every cat)
      const next = tailPivots[1].children[0], own = next.material.color.clone();
      if (next.material.vertexColors) {
        const np = next.geometry.attributes.position, nc = next.geometry.attributes.color;
        let k0 = 0; for (let i = 0; i < np.count; i++) if (Math.abs(np.getZ(i)) < Math.abs(np.getZ(k0))) k0 = i;
        own.multiply(new THREE.Color().fromBufferAttribute(nc, k0));
      }
      let far = 0;
      for (let i = 0; i < n; i++) {
        if (p.getZ(i) < TAIL.LINK - 1e-6) continue;
        far++;
        got.fromBufferAttribute(col, i);
        expect(Math.hypot(got.r - own.r, got.g - own.g, got.b - own.b), `${breed} far end`).toBeLessThan(1e-6);
      }
      expect(far, breed).toBeGreaterThan(8);
      // no triangle, no mesh more than the plain root had: the link is still one mesh
      expect(tailPivots[0].children.filter((o) => o.isMesh).length, breed).toBe(1);
    }
  });
});

describe('coat detail (A5): barred legs, a necklace, a darker back line, a paler underside', () => {
  const colourOf = (attr, i) => new THREE.Color(attr.getX(i), attr.getY(i), attr.getZ(i));
  const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  it('the four family cats are exactly as they were: no detail on the coat, no bars on the legs', async () => {
    const { coatFromStyle, coatColourAt } = await import('../src/cat/coat.js');
    const { catStyle } = await import('../src/cat/model.js');
    for (const breed of ['zeetoo', 'robbie', 'd2', 'digit']) {
      for (const simple of [false, true]) {
        const cat = make(breed, simple);
        const { body, legs } = cat.userData.parts;
        expect(body.userData.coat.detail, breed).toBe(false);
        const plain = coatFromStyle(catStyle(breed));
        const unit = body.geometry.userData.unit, col = body.geometry.attributes.color, c = new THREE.Color();
        for (let i = 0; i < unit.length / 3; i++) {
          coatColourAt(plain, [unit[i * 3], unit[i * 3 + 1], unit[i * 3 + 2]], c);
          expect(dist(colourOf(col, i), c), `${breed} torso ${i}`).toBeLessThan(1e-6);
        }
        const s = catStyle(breed), legHex = new THREE.Color(s.whiteLegs ? s.belly : s.base);
        for (const leg of legs) {
          const g = leg.children[0].geometry;
          g.userData.t.forEach((t, i) => { if (t >= 0.18) expect(dist(colourOf(g.attributes.color, i), legHex), `${breed} leg`).toBeLessThan(1e-6); });
        }
      }
    }
  });
  it('a striped coat has barred legs and a necklace; an unstriped one has neither', async () => {
    const { catStyle } = await import('../src/cat/model.js');
    const looks = [['tabby', {}], ['tabby', { look: { coat: 'ginger', marks: 'chocolate', pattern: 'stripes', fur: 'long', eyes: 'green', size: 1 } }], ['tabby', { look: { coat: 'grey', marks: 'black', pattern: 'stripes', fur: 'short', eyes: 'green', size: 1 } }]];
    for (const [breed, opts] of looks) {
      for (const simple of [false, true]) {
        const cat = make(breed, simple, {}, opts);
        const { body, legs, underside } = cat.userData.parts;
        const coat = body.userData.coat, accent = new THREE.Color(coat.accent), base = new THREE.Color(coat.base);
        expect(coat.detail && coat.stripes).toBe(true);
        for (const leg of legs) {
          const g = leg.children[0].geometry, col = g.attributes.color;
          const near = (i) => dist(colourOf(col, i), accent) / dist(base, accent); // 1 plain .. 0 stripe colour
          const rings = {};
          g.userData.t.forEach((t, i) => { if (t > 0.2 && t < 0.99) (rings[t.toFixed(3)] ??= []).push(near(i)); });
          const share = Object.values(rings).map((r) => r[0]);
          expect(share.filter((k) => k < 0.6).length, 'bars').toBeGreaterThanOrEqual(3);
          expect(share.filter((k) => k > 0.99).length, 'plain between').toBeGreaterThanOrEqual(3);
          expect(Math.min(...share)).toBeGreaterThan(0.4); // soft: never the full stripe colour
        }
        // the necklace: chest vertices on the ball's front pulled toward the stripe colour, and pale ones left between
        const [a, b] = underside.userData.ranges.chest, col = underside.geometry.attributes.color, pale = new THREE.Color(coat.chest);
        let barred = 0, clean = 0;
        for (let i = a; i < b; i++) {
          const c = colourOf(col, i);
          if (dist(c, pale) < 0.02) clean++;
          else if (dist(c, pale.clone().lerp(accent, 0.45)) < 0.05) barred++;
        }
        expect(barred, `${simple} necklace`).toBeGreaterThanOrEqual(2);
        expect(clean, `${simple} bib`).toBeGreaterThanOrEqual(1);
      }
    }
    for (const breed of ['black', 'persian', 'siamese', 'calico', 'mainecoon']) {
      const cat = make(breed);
      const s = catStyle(breed), legHex = new THREE.Color(s.points ? s.accent : s.base);
      for (const leg of cat.userData.parts.legs) {
        const g = leg.children[0].geometry;
        g.userData.t.forEach((t, i) => { if (t >= 0.18) expect(dist(colourOf(g.attributes.color, i), legHex), `${breed} leg`).toBeLessThan(1e-6); });
      }
    }
  });
  it('the back line and the underside are slight, and a patch keeps its own colour', async () => {
    const { coatFromStyle, coatColourAt } = await import('../src/cat/coat.js');
    const { catStyle } = await import('../src/cat/model.js');
    const a = new THREE.Color(), b = new THREE.Color();
    for (const breed of ['tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon']) {
      const plain = coatFromStyle(catStyle(breed)), detail = coatFromStyle(catStyle(breed), { detail: true });
      let worst = 0, sum = 0, n = 0;
      for (let i = 0; i < 4000; i++) {
        const y = 1 - 2 * ((i + 0.5) / 4000), r = Math.sqrt(1 - y * y), th = i * 2.399963;
        const u = [r * Math.cos(th), y, r * Math.sin(th)];
        coatColourAt(plain, u, a); coatColourAt(detail, u, b);
        const d = dist(a, b);
        worst = Math.max(worst, d);
        if (y > -0.4) { sum += (b.r + b.g + b.b) - (a.r + a.g + a.b); n += a.r + a.g + a.b; } // the back and flanks, what a camera sees (the belly ball covers the rest)
      }
      expect(worst, breed).toBeLessThan(0.16);          // slight everywhere (the tabby's underside, right under the belly, moves most)
      expect(Math.abs(sum / n), breed).toBeLessThan(0.03); // and the whole coat is the same cat
      expect(worst, breed).toBeGreaterThan(breed === 'black' ? 0.005 : 0.02); // but it is there
    }
    // the calico's patch centres are untouched
    const plain = coatFromStyle(catStyle('calico')), detail = coatFromStyle(catStyle('calico'), { detail: true });
    for (const u of [[0.33, 0.72, -0.2], [-0.3, 0.75, 0.3], [0.1, 0.8, 0.7]]) {
      const L = Math.hypot(...u), v = u.map((x) => x / L);
      const p = coatColourAt(plain, v, a), d = coatColourAt(detail, v, b);
      if (dist(p, new THREE.Color(0xf0ead8)) > 0.3) expect(dist(p, d), JSON.stringify(u)).toBeLessThan(1e-6);
    }
  });
  it('the fur tufts wear the new colours: each torso tuft is the coat painted under it', () => {
    const cat = make('tabby', false, {}, { look: { coat: 'ginger', marks: 'chocolate', pattern: 'stripes', fur: 'long', eyes: 'green', size: 1 } });
    const g = cat.userData.parts.body.geometry, fur = g.userData.tufts;
    expect(fur).toBeTruthy();
    const col = g.attributes.color, body = g.userData.unit.length / 3;
    // a tuft's root colours come from coatColourAt on this very coat, so some tuft vertex matches a torso vertex's detailed colour closely
    let matched = 0;
    for (let i = fur.start; i < fur.start + Math.min(fur.count, 60); i++) {
      const c = colourOf(col, i);
      let best = Infinity;
      for (let k = 0; k < body; k += 3) best = Math.min(best, dist(c, colourOf(col, k)));
      if (best < 0.06) matched++;
    }
    expect(matched).toBeGreaterThan(40);
  });
});

describe('the new poses draw no random numbers', () => {
  it('posing through every changed state calls Math.random not once', () => {
    const cats = [make('tabby'), make('persian', true), make('digit', false, { collar: 'bell', body: 'cape', back: 'backpack', feet: 'rainboots' })];
    const real = Math.random;
    let n = 0;
    Math.random = () => { n++; return real(); };
    try {
      for (const cat of cats) for (const state of ['follow', 'stretch', 'groom', 'perch', 'requestPet', 'nap', 'land', 'stalk', 'follow']) pose(cat, state, 1.3, state === 'stalk' ? 1.5 : 0);
    } finally { Math.random = real; }
    expect(n).toBe(0);
  });
});
