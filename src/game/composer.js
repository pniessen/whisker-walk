// The post-processing rig and the per-frame draw, lifted out of main.js's
// init() closure. Keeping composer/renderPass/bloomPass private here is what
// lets the lazy allocation rule hold: nothing outside can reach them except
// through ensure()/attachScene()/renderFrame()/resize().

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// v18 Night Eyes ('night-eyes') — dusk walks brighten.
//
// The two levers are renderer.toneMappingExposure and
// scene.environmentIntensity, both calibrated in v12 (exposure 1.1;
// envIntensity 0.45 high-tier / 0.32 low-tier) and both owned by this module,
// which is why the ability lives here rather than in the walk builder.
//
// weather.js is explicitly NOT the lever. It is the wrong one twice over: it
// is skipped entirely on a dusk walk (startWalk only builds weather when
// !duskActive), and it drives fog/particles/sun colour, so "brightening" via
// it would mean editing what the weather IS rather than how the frame is
// exposed. The dusk sky, fog and sun.intensity stay exactly as authored —
// Night Eyes changes how well the cat's eyes cope with that scene, not what
// the scene is. That is what keeps dusk atmospheric instead of flattening it
// into daylight.
//
// Gains are multiplicative on whatever base the tier supplies, so the low
// tier's dimmer envIntensity stays proportionally dimmer, and a future
// re-calibration of the base numbers carries through without touching these.
export const NIGHT_EYES_EXPOSURE_GAIN = 1.35;
export const NIGHT_EYES_ENV_GAIN = 1.6;

// Pure: the exposure/envIntensity a walk should render at. Night Eyes only
// applies on a walk that is ACTUALLY dusk (duskActive, i.e. the glow collar
// check has already passed for a solo walk) — a daytime walk renders
// identically with or without the ability, which is the spec's "dusk walks
// brighten", not "everything brightens".
export function nightEyesLighting({ dusk = false, nightEyes = false, baseExposure, baseEnvIntensity }) {
  const on = !!dusk && !!nightEyes;
  return {
    exposure: on ? baseExposure * NIGHT_EYES_EXPOSURE_GAIN : baseExposure,
    envIntensity: on ? baseEnvIntensity * NIGHT_EYES_ENV_GAIN : baseEnvIntensity,
  };
}

export function createComposerRig(renderer, camera) {
  // The app's calibrated base exposure, read off the renderer main.js already
  // configured (main.js sets toneMappingExposure before constructing the rig)
  // rather than re-declared here — one number, one owner, no way for the two
  // to drift apart.
  const baseExposure = Number.isFinite(renderer.toneMappingExposure) ? renderer.toneMappingExposure : 1;

  // Post-processing: EffectComposer with a subtle bloom pass, built lazily —
  // only high-tier walks (see resolveQuality) ever call ensure(), so
  // a device that only ever runs low tier never allocates the composer or
  // its render targets.
  let composer = null, renderPass = null, bloomPass = null;
  function ensure() {
    if (composer) return;
    renderPass = new RenderPass(new THREE.Scene(), camera); // scene swapped per walk in startWalk
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35,  // strength — gentle
      0.6,   // radius
      // threshold sits above 1.0 so plain whites (fur, whiskers, clouds —
      // which top out at ~1.0 in the HDR buffer) never bloom; only surfaces
      // pushed past 1.0 by an emissive term (dusk windows, glow collar,
      // fireflies) glow. At 0.85 white cats read as light sources.
      1.1
    );
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass()); // applies renderer.toneMapping + sRGB at the end
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  // The render loop's per-frame draw. `session` is passed in rather than
  // closed over; the expression is otherwise exactly what main.js's
  // renderFrame always evaluated, including the deliberate asymmetry (the
  // fallback dereferences session.scene, so it is only ever reached with a
  // live session — the render loop returns early without one).
  function renderFrame(session) {
    if (session?.useComposer && composer) composer.render();
    else renderer.render(session.scene, camera);
  }

  // startWalk points the composer's RenderPass at the new walk's scene.
  function attachScene(scene) {
    renderPass.scene = scene;
    renderPass.camera = camera;
  }

  // window resize: only meaningful once the composer actually exists, which
  // is the same `if (composer)` guard main.js's resize handler applied.
  function resize(width, height) {
    if (composer) {
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
    }
  }

  // applyLighting(scene, …) — called once per walk from startWalk, after
  // duskActive is known. Sets BOTH levers unconditionally (not only when the
  // ability is on), because toneMappingExposure is renderer-global state that
  // outlives the walk that raised it: a Night Eyes dusk walk followed by an
  // ordinary daytime walk has to be handed the base exposure back, or the
  // second walk renders blown out. Returns the applied values for the caller
  // (and tests) to assert on.
  function applyLighting(scene, { dusk = false, nightEyes = false, envIntensity } = {}) {
    const lighting = nightEyesLighting({
      dusk, nightEyes, baseExposure, baseEnvIntensity: envIntensity,
    });
    renderer.toneMappingExposure = lighting.exposure;
    scene.environmentIntensity = lighting.envIntensity;
    return lighting;
  }

  // endWalk hygiene: put the renderer back on its calibrated base exposure so
  // nothing rendered outside a walk inherits a walk's Night Eyes boost.
  function resetLighting() {
    renderer.toneMappingExposure = baseExposure;
  }

  return { ensure, attachScene, renderFrame, resize, applyLighting, resetLighting, baseExposure };
}
