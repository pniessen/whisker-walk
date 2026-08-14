// Pure quality-tier resolver. No DOM/three imports — this stays a leaf
// module so it can be unit-tested without a WebGL context (see
// test/quality.test.js). Task 5 wires the resulting tier into the renderer
// (shadow map size, env intensity, post-fx composer, pixel ratio cap) at
// walk start; a settings change here only takes effect next walk.
const HIGH = Object.freeze({
  name: 'high',
  shadowMapSize: 2048,
  envIntensity: 0.45,
  postFx: true,
  pixelRatioCap: 2,
});

const LOW = Object.freeze({
  name: 'low',
  shadowMapSize: 1024,
  envIntensity: 0.32,
  postFx: false,
  pixelRatioCap: 1.5,
});

// coarse: matchMedia('(pointer: coarse)') — touch/mobile input.
// reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').
// override: the persisted 'quality' setting — 'auto' defers to device
// signals, 'high'/'low' force a tier regardless of device.
export function resolveQuality({ coarse, reducedMotion, override }) {
  if (override === 'high') return HIGH;
  if (override === 'low') return LOW;
  return coarse || reducedMotion ? LOW : HIGH;
}
