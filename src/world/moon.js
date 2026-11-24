// =============================================================================
// THE MOON (milestone 0: the seams). A bare plain of grey dust under a black sky and a low white sun, 108 x 100 m, no
// rocks, no craters, no props yet (the ground, the sky, Earth and the landing site are milestone 1). It exists so
// ?moon=1 can start a walk, give the cat control and hop at the Moon's own gravity (src/placephysics.js). Behind
// ?moon=1 only: no catalog row, no map place, no gate. Draws no random number and reads no clock; builds in
// withLocalUuids. docs/superpowers/specs/2026-11-23-moon-design.md; the plan next to it.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import './moonwords.js';

export const MOON_NAME = 'The Moon';
export const MOON_BOUNDS = Object.freeze({ minX: -54, maxX: 54, minZ: -50, maxZ: 50 });
export const MOON_SPAWN = Object.freeze({ x: 0, z: 45 });

const DUST = 0x8d8c93;
// Always "earthrise": one hard white sun low in the east, a faint blue fill, a near-black navy sky (the walk's evening look).
const SKY = Object.freeze({ top: 0x03050d, horizon: 0x141b30 });
const DUSK_LIGHT = Object.freeze({
  sunColor: 0xfff6e8, sunIntensity: 1.5, hemiSky: 0x5878b0, hemiIntensity: 0.34, groundDim: 0.75,
  envScale: 0.35, fogNear: 90, fogFar: 260,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene) {
  return withLocalUuids('moon-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(b.ground(130, DUST, { surface: 'gravel' }));
    return {
      name: MOON_NAME,
      bounds: MOON_BOUNDS,
      spawn: MOON_SPAWN,
      colliders: [],
      waters: [],
      waterFx: [],
      perches: [],
      pois: [],
      collectibles: [],
      scenics: [],
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: DUST,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...DUSK_LIGHT },
      evening: true,
    };
  });
}
