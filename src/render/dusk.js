import * as THREE from 'three';
import { skyBackground } from './sky.js';
import { litMaterial } from './materials.js';
import { DEFAULT_GROUND_BOUNCE } from './rig.js';

// =============================================================================
// DUSK — one look for every map. A dusk walk used to be the day lighting with
// a darker sky and a dimmer sun; this gives it a warm low sun, a cool sky
// fill, a dimmer ground bounce and image light, and a glow at the cat's
// collar. Areas may override any key with `areaData.duskLight`.
//
// RAIN SEAM: weather is only rolled when !duskActive (walk.js), so dusk and
// rain never meet today. Dusk is the base: if weather ever runs on a dusk
// walk it must write on top of these values (weather.js is not touched here).
//
// Nothing here mutates a module-level constant: the sun, fill and scene are
// created fresh per walk, and the cat's collar light goes with the cat.
// =============================================================================

export const DUSK = Object.freeze({
  sunColor: 0xffb27a,
  sunIntensity: 0.8,
  hemiSky: 0x7d8cc4,
  hemiIntensity: 0.5,
  groundDim: 0.55,
  envScale: 0.45,
  fogNear: 30,
  fogFar: 110,
  collarColor: 0x7ef2c0,
  collarIntensity: 1.6,
  collarDistance: 4,
  collarDecay: 2,
  collarLift: 0.45,
});

export function duskLook(areaData) {
  return Object.freeze({ ...DUSK, ...(areaData?.duskLight ?? {}) });
}

export function applyDusk({ scene, sun, fill, areaData }) {
  const look = duskLook(areaData);
  const { top, horizon } = areaData.skyDusk;
  scene.background = skyBackground(top, horizon);
  scene.fog = new THREE.Fog(horizon, look.fogNear, look.fogFar);
  sun.color.set(look.sunColor);
  sun.intensity = look.sunIntensity;
  fill.color.set(look.hemiSky);
  const bounce = new THREE.Color(areaData.groundBounce ?? DEFAULT_GROUND_BOUNCE);
  fill.groundColor.setRGB(
    bounce.r * look.groundDim,
    bounce.g * look.groundDim,
    bounce.b * look.groundDim,
  );
  fill.intensity = look.hemiIntensity;
  // dusk: house windows glow warm (bloom-friendly on the high tier; endWalk's
  // scene traversal disposes the swapped material like any other)
  scene.traverse((o) => {
    if (o.userData?.window) {
      const old = o.material;
      o.material = litMaterial(0xffe0a0, { emissive: 0x8a6a20 });
      old.dispose();
    }
  });
  return look;
}

export function duskEnv(envIntensity, look) {
  return envIntensity * look.envScale;
}

export function addCollarGlow(cat, look) {
  const light = new THREE.PointLight(
    look.collarColor, look.collarIntensity, look.collarDistance, look.collarDecay,
  );
  light.name = 'collarGlow';
  light.castShadow = false;
  light.position.set(0, look.collarLift, 0);
  cat.add(light);
  return light;
}
