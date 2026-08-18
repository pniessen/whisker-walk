// The post-processing rig and the per-frame draw, lifted out of main.js's
// init() closure. Keeping composer/renderPass/bloomPass private here is what
// lets the lazy allocation rule hold: nothing outside can reach them except
// through ensure()/attachScene()/renderFrame()/resize().

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function createComposerRig(renderer, camera) {
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

  return { ensure, attachScene, renderFrame, resize };
}
