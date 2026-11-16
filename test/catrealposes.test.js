import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { BOW } from '../src/cat/torso.js';
import { PRESETS } from './helpers/catfingerprint.js';

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
