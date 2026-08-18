import { describe, it, expect } from 'vitest';
import {
  createComposerRig, nightEyesLighting,
  NIGHT_EYES_EXPOSURE_GAIN, NIGHT_EYES_ENV_GAIN,
} from '../src/game/composer.js';

// src/game/composer.js imports the three postprocessing passes but does not
// touch WebGL until ensure() is called, so the rig itself constructs fine
// against a stub renderer — which is all the Night Eyes path needs. The
// composer/bloom half is untouched here and stays browser-verified, as it
// always was.
const fakeRenderer = (exposure = 1.1) => ({ toneMappingExposure: exposure });
const fakeScene = () => ({ environmentIntensity: null });

// v12's calibrated numbers: exposure 1.1, envIntensity 0.45 high tier /
// 0.32 low tier (src/render/quality.js).
const HIGH_ENV = 0.45;
const LOW_ENV = 0.32;

describe('nightEyesLighting (v18 Night Eyes)', () => {
  it('is the identity on a daytime walk, with or without the ability', () => {
    for (const nightEyes of [false, true]) {
      const l = nightEyesLighting({
        dusk: false, nightEyes, baseExposure: 1.1, baseEnvIntensity: HIGH_ENV,
      });
      expect(l.exposure).toBe(1.1);
      expect(l.envIntensity).toBe(HIGH_ENV);
    }
  });

  it('is the identity on a dusk walk WITHOUT the ability — dusk plays as today', () => {
    const l = nightEyesLighting({
      dusk: true, nightEyes: false, baseExposure: 1.1, baseEnvIntensity: HIGH_ENV,
    });
    expect(l.exposure).toBe(1.1);
    expect(l.envIntensity).toBe(HIGH_ENV);
  });

  it('raises both levers on a dusk walk WITH the ability', () => {
    const l = nightEyesLighting({
      dusk: true, nightEyes: true, baseExposure: 1.1, baseEnvIntensity: HIGH_ENV,
    });
    expect(l.exposure).toBeCloseTo(1.1 * NIGHT_EYES_EXPOSURE_GAIN, 10);
    expect(l.envIntensity).toBeCloseTo(HIGH_ENV * NIGHT_EYES_ENV_GAIN, 10);
    expect(l.exposure).toBeGreaterThan(1.1);
    expect(l.envIntensity).toBeGreaterThan(HIGH_ENV);
  });

  it('scales multiplicatively, so the low tier stays proportionally dimmer', () => {
    const high = nightEyesLighting({ dusk: true, nightEyes: true, baseExposure: 1.1, baseEnvIntensity: HIGH_ENV });
    const low = nightEyesLighting({ dusk: true, nightEyes: true, baseExposure: 1.1, baseEnvIntensity: LOW_ENV });
    expect(low.envIntensity).toBeLessThan(high.envIntensity);
    expect(low.envIntensity / high.envIntensity).toBeCloseTo(LOW_ENV / HIGH_ENV, 10);
  });

  it('brightens noticeably but does not wash dusk out into daylight', () => {
    const l = nightEyesLighting({ dusk: true, nightEyes: true, baseExposure: 1.1, baseEnvIntensity: HIGH_ENV });
    // enough to read as a real change...
    expect(l.exposure / 1.1).toBeGreaterThan(1.2);
    // ...and not so much that the dusk palette stops being dusk.
    expect(l.exposure / 1.1).toBeLessThan(2);
    expect(l.envIntensity / HIGH_ENV).toBeLessThan(2);
  });
});

describe('createComposerRig lighting', () => {
  it('takes its base exposure from the renderer main.js already configured', () => {
    expect(createComposerRig(fakeRenderer(1.1), {}).baseExposure).toBe(1.1);
    expect(createComposerRig(fakeRenderer(0.9), {}).baseExposure).toBe(0.9);
  });

  it('applyLighting writes both levers onto the renderer and the scene', () => {
    const renderer = fakeRenderer(1.1);
    const rig = createComposerRig(renderer, {});
    const scene = fakeScene();
    rig.applyLighting(scene, { dusk: true, nightEyes: true, envIntensity: HIGH_ENV });
    expect(renderer.toneMappingExposure).toBeCloseTo(1.1 * NIGHT_EYES_EXPOSURE_GAIN, 10);
    expect(scene.environmentIntensity).toBeCloseTo(HIGH_ENV * NIGHT_EYES_ENV_GAIN, 10);
  });

  it('hands the base exposure back on the NEXT walk, so a dusk boost cannot leak', () => {
    const renderer = fakeRenderer(1.1);
    const rig = createComposerRig(renderer, {});
    rig.applyLighting(fakeScene(), { dusk: true, nightEyes: true, envIntensity: HIGH_ENV });
    expect(renderer.toneMappingExposure).toBeGreaterThan(1.1);
    // a plain daytime walk follows
    const day = fakeScene();
    rig.applyLighting(day, { dusk: false, nightEyes: true, envIntensity: HIGH_ENV });
    expect(renderer.toneMappingExposure).toBe(1.1);
    expect(day.environmentIntensity).toBe(HIGH_ENV);
  });

  it('resetLighting restores the base exposure at endWalk', () => {
    const renderer = fakeRenderer(1.1);
    const rig = createComposerRig(renderer, {});
    rig.applyLighting(fakeScene(), { dusk: true, nightEyes: true, envIntensity: HIGH_ENV });
    rig.resetLighting();
    expect(renderer.toneMappingExposure).toBe(1.1);
  });

  it('a no-skills walk gets exactly the values the pre-v18 code assigned', () => {
    const renderer = fakeRenderer(1.1);
    const rig = createComposerRig(renderer, {});
    for (const dusk of [false, true]) {
      const scene = fakeScene();
      rig.applyLighting(scene, { dusk, nightEyes: false, envIntensity: HIGH_ENV });
      expect(renderer.toneMappingExposure).toBe(1.1);      // main.js:96
      expect(scene.environmentIntensity).toBe(HIGH_ENV);   // tier.envIntensity
    }
  });
});
