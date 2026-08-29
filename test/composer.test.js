import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  createComposerRig, nightEyesLighting,
  NIGHT_EYES_EXPOSURE_GAIN, NIGHT_EYES_ENV_GAIN,
} from '../src/game/composer.js';

// three's exported namespace is non-configurable in ESM (Vitest cannot
// vi.spyOn it directly), so the MSAA suite at the bottom of this file
// intercepts WebGLRenderTarget construction by mocking the module: every
// other export passes through untouched via importOriginal, and this one
// class just records its constructor args before delegating to the real
// thing. rtCalls is declared through vi.hoisted because vi.mock's factory
// runs before this file's own top-level code.
const { rtCalls } = vi.hoisted(() => ({ rtCalls: [] }));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  class RecordingRenderTarget extends actual.WebGLRenderTarget {
    constructor(...args) {
      super(...args);
      rtCalls.push(args);
    }
  }
  return { ...actual, WebGLRenderTarget: RecordingRenderTarget };
});

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

// v1.1: ensure() now builds an explicit render target and hands it to
// EffectComposer, instead of letting the composer allocate its own
// no-`samples` one (see the comment above ensure() and docs/VISUAL-PASS.md
// 1.1). Unlike the lighting suite above, this touches real THREE
// constructors (RenderPass/UnrealBloomPass/EffectComposer/OutputPass), none
// of which call into WebGL at construction time — only render() does — so
// they build fine against a minimal fake renderer. ensure() also reads
// window.innerWidth/innerHeight directly (unchanged, pre-existing
// behaviour), which is why this block — and only this block — stubs
// `window`; every other describe in this file constructs the rig without it
// on purpose, to prove the lighting half needs no DOM at all.
describe('createComposerRig MSAA target (v1.1)', () => {
  const fakeGlRenderer = () => ({ toneMappingExposure: 1.1, getPixelRatio: () => 1 });

  // EffectComposer.reset()/its internal renderTarget.clone() also constructs
  // WebGLRenderTargets (with no options at all), and UnrealBloomPass's own
  // constructor builds three more internally (each `{ type: HalfFloatType }`,
  // no `samples` key) — both land in rtCalls too since the mock above is
  // file-wide. Ours is the one call whose options object actually carries a
  // `samples` key, so that is what every assertion below filters for rather
  // than assuming a calls[0]/length shape.
  function oursCalls() {
    return rtCalls.filter(([, , options]) => options && 'samples' in options);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    rtCalls.length = 0;
  });

  function stubWindow() {
    vi.stubGlobal('window', { innerWidth: 800, innerHeight: 600 });
  }

  it('constructs the render target with the samples ensure() was handed', () => {
    stubWindow();
    const rig = createComposerRig(fakeGlRenderer(), {});
    rig.ensure(4); // tier.msaaSamples for the high tier (quality.js)
    const calls = oursCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({ type: THREE.HalfFloatType, samples: 4 });
  });

  it('defaults samples to 0 (the low tier’s own value) so an argument-less ensure() still works', () => {
    stubWindow();
    const rig = createComposerRig(fakeGlRenderer(), {});
    expect(() => rig.ensure()).not.toThrow();
    expect(oursCalls()[0][2].samples).toBe(0);
  });

  it('is memoised — the samples of the FIRST ensure() call win for the rest of the session', () => {
    stubWindow();
    const rig = createComposerRig(fakeGlRenderer(), {});
    rig.ensure(4);
    rig.ensure(0); // a later walk on a different tier — ignored, same as setTextureTier
    expect(oursCalls()).toHaveLength(1); // second call short-circuited on `if (composer) return`
  });
});
