import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import {
  WATERLINE, WATER_FIT, SINK_RATE, BOB, waterFit, sinkTarget, waterPose, applyWaterLook,
} from '../src/cat/waterlook.js';
import { createWaterState, SHAKE_TIME } from '../src/waterstate.js';
import { PRESETS, fingerprintCat } from './helpers/catfingerprint.js';

// The water look (swimming, Task 5): the opaque water hides everything below
// WATERLINE, so these tests pose a cat, sink it as the game does, and measure
// what pokes out.

const box = (o) => new THREE.Box3().setFromObject(o, true);

// Pose the cat and sink it by its target, as applyWaterLook settles it.
function posed(breed, state, mode, { t = 1.3, speed = 0 } = {}) {
  const cat = buildCat(breed);
  animateCat(cat, state, t, speed);
  cat.position.y = -sinkTarget(cat, mode);
  cat.updateMatrixWorld(true);
  return cat;
}

describe('wading is belly-deep (sketch C)', () => {
  for (const b of PRESETS) {
    for (const speed of [0, 1.5]) {
      it(`${b}, speed ${speed}`, () => {
        const cat = posed(b, 'wade', 'wade', { speed });
        const { body, legs } = cat.userData.parts;
        for (const leg of legs) expect(box(leg.userData.paw).min.y).toBeLessThan(WATERLINE);
        const tb = box(body);
        expect(tb.min.y).toBeLessThan(WATERLINE);
        expect((tb.min.y + tb.max.y) / 2).toBeGreaterThan(WATERLINE);
      });
    }
  }
});

describe('swimming: shoulders under, head and back up (sketch A)', () => {
  for (const b of [...PRESETS, 'hagrid']) {
    for (const speed of [0, 1.5]) {
      it(`${b}, speed ${speed}`, () => {
        const state = b === 'hagrid' ? 'follow' : 'swim';
        const cat = posed(b, state, 'swim', { speed });
        const { body, head } = cat.userData.parts;
        expect(box(head).min.y).toBeGreaterThan(WATERLINE + 0.02);
        const tb = box(body);
        expect(tb.max.y).toBeGreaterThan(WATERLINE + 0.1);
        expect((tb.min.y + tb.max.y) / 2).toBeLessThan(WATERLINE + 0.12 * cat.scale.y);
      });
    }
  }
});

describe('Hagrid sits lower and floats', () => {
  it('his torso dips below the waterline in both modes, and his head stays up in deep water', () => {
    for (const mode of ['wade', 'swim']) {
      const cat = posed('hagrid', 'follow', mode);
      expect(box(cat.userData.parts.body).min.y).toBeLessThan(WATERLINE);
    }
    const deep = posed('hagrid', 'follow', 'swim');
    expect(box(deep.userData.parts.head).min.y).toBeGreaterThan(WATERLINE + 0.02);
  });
});

describe('the tail floats while swimming', () => {
  for (const b of PRESETS) {
    it(b, () => {
      for (const t of [0, 0.7, 1.3, 2.9]) {
        const cat = posed(b, 'swim', 'swim', { t });
        const y = box(cat.userData.parts.tail).min.y;
        expect(y).toBeGreaterThan(WATERLINE);
        expect(y).toBeLessThan(WATERLINE + 0.1 * cat.scale.y);
      }
    });
  }
});

describe('waterPose', () => {
  const wet = (mode, shake = 0) => ({ ...createWaterState(), mode, shake });
  it('leaves pounce, scared and an unknown pose alone in water', () => {
    for (const mode of ['wade', 'swim']) {
      for (const p of ['pounce', 'scared', 'swipe']) expect(waterPose(p, wet(mode), {})).toBe(p);
    }
  });
  it('maps the resting and walking poses to the mode', () => {
    for (const mode of ['wade', 'swim']) {
      for (const p of ['nap', 'follow', 'stalk', 'groom', 'requestPet']) expect(waterPose(p, wet(mode), {})).toBe(mode);
    }
  });
  it('is the identity when dry', () => {
    for (const p of ['follow', 'nap', 'pounce', 'land']) expect(waterPose(p, wet('dry'), {})).toBe(p);
  });
  it("gives 'shake' while shaking, and 'follow' under reduced motion", () => {
    for (const p of ['follow', 'stalk', 'land']) {
      expect(waterPose(p, wet('dry', SHAKE_TIME), {})).toBe('shake');
      expect(waterPose(p, wet('dry', SHAKE_TIME), { reducedMotion: true })).toBe('follow');
    }
    expect(waterPose('pounce', wet('dry', SHAKE_TIME), {})).toBe('pounce');
  });
  it("never gives Hagrid 'wade' or 'swim'", () => {
    for (const mode of ['dry', 'wade', 'swim']) {
      for (const p of ['follow', 'stalk', 'groom', 'requestPet', 'nap', 'land', 'pounce']) {
        const got = waterPose(p, wet(mode), { hagrid: true });
        expect(got).not.toBe('wade');
        expect(got).not.toBe('swim');
      }
    }
    expect(waterPose('nap', wet('swim'), { hagrid: true })).toBe('follow');
    expect(waterPose('stalk', wet('swim'), { hagrid: true })).toBe('stalk');
  });
});

describe('applyWaterLook', () => {
  const settled = (breed, mode) => {
    const cat = buildCat(breed);
    animateCat(cat, mode === 'swim' ? 'swim' : 'follow', 0, 0);
    const st = { ...createWaterState(), mode };
    st.sink = sinkTarget(cat, mode);
    return { cat, st };
  };

  it('the bob is off under reduced motion, and on while swimming otherwise', () => {
    const { cat, st } = settled('tabby', 'swim');
    const ys = new Set();
    for (let i = 0; i < 60; i++) {
      applyWaterLook(cat, st, i / 60, 1 / 60, true, 0.5, 1);
      expect(cat.position.y).toBe(0.5 - st.sink);
    }
    for (let i = 0; i < 60; i++) {
      applyWaterLook(cat, st, i / 60, 1 / 60, false, 0.5, 1);
      expect(Math.abs(cat.position.y - (0.5 - st.sink))).toBeLessThanOrEqual(BOB.amp + 1e-12);
      ys.add(cat.position.y);
    }
    expect(ys.size).toBeGreaterThan(10);
    // ...and no bob while wading
    const w = settled('tabby', 'wade');
    applyWaterLook(w.cat, w.st, 0.4, 1 / 60, false, 0, 1);
    expect(w.cat.position.y).toBe(-w.st.sink);
  });

  it('y is set, never added', () => {
    const { cat, st } = settled('tabby', 'swim');
    applyWaterLook(cat, st, 1.1, 1 / 60, false, 0.3, 1);
    const y = cat.position.y;
    applyWaterLook(cat, st, 1.1, 1 / 60, false, 0.3, 1);
    expect(cat.position.y).toBe(y);
  });

  it('the shake rolls the whole group, then rolls it back', () => {
    for (const reducedMotion of [false, true]) {
      const cat = buildCat('tabby');
      const st = { ...createWaterState(), shake: SHAKE_TIME };
      let rolled = false;
      for (let i = 0; i < 48; i++) {
        st.shake = Math.max(0, SHAKE_TIME - i / 60);
        animateCat(cat, 'shake', i / 60, 0, reducedMotion, 1);
        applyWaterLook(cat, st, i / 60, 1 / 60, reducedMotion, 0, 1);
        if (cat.rotation.z !== 0) rolled = true;
        if (reducedMotion) expect(cat.rotation.z).toBe(0);
      }
      expect(rolled).toBe(!reducedMotion);
      st.shake = 0;
      applyWaterLook(cat, st, 2, 1 / 60, reducedMotion, 0, 1);
      expect(cat.rotation.z).toBe(0);
    }
  });

  it('Hagrid fluffs instead of rolling', () => {
    const cat = buildCat('hagrid');
    const st = { ...createWaterState(), shake: SHAKE_TIME };
    for (let i = 0; i < 30; i++) {
      applyWaterLook(cat, st, i / 60, 1 / 60, false, 0, 1);
      expect(cat.rotation.z).toBe(0);
    }
  });

  it('sink eases in, never pops', () => {
    const cat = buildCat('tabby');
    const st = { ...createWaterState(), mode: 'swim' };
    const target = sinkTarget(cat, 'swim');
    expect(target).toBeGreaterThan(0);
    let prev = st.sink;
    for (let i = 0; i < 120; i++) {
      applyWaterLook(cat, st, i / 60, 1 / 60, true, 0, 1);
      expect(Math.abs(st.sink - prev)).toBeLessThanOrEqual(target * (1 - Math.exp(-SINK_RATE / 60)) + 1e-9);
      prev = st.sink;
    }
    expect(st.sink).toBeCloseTo(target, 3);
    // ...and comes back up to dry
    st.mode = 'dry';
    for (let i = 0; i < 120; i++) applyWaterLook(cat, st, i / 60, 1 / 60, true, 0, 1);
    expect(st.sink).toBeCloseTo(0, 6);
  });
});

describe('waterFit', () => {
  it('is the same wherever the cat stands', () => {
    const here = waterFit(buildCat('tabby'));
    const cat = buildCat('tabby');
    cat.position.set(10, 0, -5);
    cat.rotation.y = 1.2;
    const there = waterFit(cat);
    expect(there.torsoMin).toBeCloseTo(here.torsoMin, 9);
    expect(there.torsoH).toBeCloseTo(here.torsoH, 9);
    expect(cat.position.toArray()).toEqual([10, 0, -5]);
    expect(cat.rotation.y).toBe(1.2);
    expect(cat.userData.waterFit).toBe(there);
  });

  it('leaves the pose it found', () => {
    const a = buildCat('calico');
    const b = buildCat('calico');
    animateCat(a, 'swim', 0.9, 1.2);
    animateCat(b, 'swim', 0.9, 1.2);
    waterFit(a);
    expect(fingerprintCat(a)).toEqual(fingerprintCat(b));
  });

  it('is measured in rig units, so the sink scales with the cat', () => {
    for (const b of ['tabby', 'mainecoon', 'hagrid']) {
      const cat = buildCat(b);
      const fit = waterFit(cat);
      const k = WATER_FIT[b === 'hagrid' ? 'hagrid' : 'cat'];
      expect(sinkTarget(cat, 'dry')).toBe(0);
      for (const mode of ['wade', 'swim']) {
        expect(sinkTarget(cat, mode)).toBeCloseTo(Math.max(0, cat.scale.y * (fit.torsoMin + k[mode] * fit.torsoH) - WATERLINE), 12);
      }
    }
  });
});

describe('the new poses', () => {
  it('a cat shaking as it walks keeps its gait', () => {
    for (const b of ['tabby', 'digit']) {
      const shake = buildCat(b);
      const walk = buildCat(b);
      for (const t of [0.2, 1.3, 2.7]) {
        animateCat(shake, 'shake', t, 2, false, 1);
        animateCat(walk, 'follow', t, 2, false);
        const ls = shake.userData.parts.legs, lw = walk.userData.parts.legs;
        for (let i = 0; i < 4; i++) {
          expect(ls[i].rotation.x).toBe(lw[i].rotation.x);
          expect(ls[i].scale.y).toBe(lw[i].scale.y);
        }
      }
    }
  });

  it('the shake reads amount; zero amount is a still head and ears', () => {
    const cat = buildCat('tabby');
    animateCat(cat, 'shake', 0.3, 0, false, 0);
    const { head, earL, earR } = cat.userData.parts;
    expect(head.rotation.z).toBe(0);
    expect(earL.rotation.z).toBe(0.22);
    expect(earR.rotation.z).toBe(-0.22);
    animateCat(cat, 'shake', 0.3, 0, false, 1);
    expect(head.rotation.z).not.toBe(0);
  });

  it('Hagrid fluffs his feathers', () => {
    const cat = buildCat('hagrid');
    const [bsx, bsy] = cat.userData.base.bodyScale;
    animateCat(cat, 'shake', 0.1, 0, false, 1);
    const { body, head } = cat.userData.parts;
    expect(body.scale.x).toBeGreaterThan(bsx);
    expect(body.scale.y).toBeGreaterThan(bsy);
    expect(head.rotation.x).toBeCloseTo(0.1, 9);
  });

  it('the wading tail is held up out of the water', () => {
    const cat = buildCat('tabby');
    animateCat(cat, 'wade', 1.3, 1.5);
    expect(cat.userData.parts.tail.rotation.x).toBe(-1.0);
  });

  it('wading and swimming have no body bob under reduced motion', () => {
    for (const s of ['wade', 'swim']) {
      const cat = buildCat('tabby');
      const ys = new Set();
      for (let i = 0; i < 30; i++) {
        animateCat(cat, s, i / 30, 1.5, true);
        ys.add(cat.userData.parts.body.position.y);
      }
      expect(ys.size).toBe(1);
    }
  });

  it('the new states are deterministic', () => {
    for (const b of ['tabby', 'persian', 'hagrid']) {
      for (const s of ['wade', 'swim', 'shake']) {
        for (const speed of [0, 1.5]) {
          const a = buildCat(b), c = buildCat(b);
          animateCat(a, s, 1.7, speed, false, 0.6);
          animateCat(c, s, 1.7, speed, false, 0.6);
          expect(fingerprintCat(a)).toEqual(fingerprintCat(c));
        }
      }
    }
  });
});
