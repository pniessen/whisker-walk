// =============================================================================
// THE CRYSTAL CAVE (milestone C0: the seams). A stub cave floor: smooth warm stone under a dusky violet sky, 72 x 64 m, no props, no
// ceiling mesh. It exists so ?crystal=1 can start a walk and give the cat control. Behind ?crystal=1 and the gates switch only.
// Draws no random number and reads no clock; builds in withLocalUuids. docs/superpowers/plans/2026-11-26-crystal-cave.md.
// Not in INDOOR_AREAS and no ground.ceil (the advisor's answer 2: a ceiling would trigger the den's caveView).
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import './crystalwords.js';

export const CRYSTAL_NAME = 'The Crystal Cave';
export const CRYSTAL_BOUNDS = Object.freeze({ minX: -36, maxX: 36, minZ: -32, maxZ: 32 });
export const CRYSTAL_SPAWN = Object.freeze({ x: 0, z: 28 });

const STONE = 0x8a7a8c;
const SKY = Object.freeze({ top: 0x2c2040, horizon: 0x5a4470 });
const DUSK_LIGHT = Object.freeze({
  sunColor: 0xffe2d0, sunIntensity: 1.0, hemiSky: 0xb89ad0, hemiIntensity: 0.7, groundDim: 0.85,
  envScale: 0.4, fogNear: 5, fogFar: 38,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene) {
  return withLocalUuids('crystal-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(b.ground(100, STONE, { surface: 'gravel' }));
    return {
      name: CRYSTAL_NAME,
      bounds: CRYSTAL_BOUNDS,
      spawn: CRYSTAL_SPAWN,
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
      groundBounce: STONE,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...DUSK_LIGHT },
      // evening: true is the walk's one switch for "no weather"
      evening: true,
      // no strays, and with them no ghosts, no wanderer, no rival, no clan cats
      strays: false,
      goalTypes: Object.freeze(['collectible', 'photo', 'scenic']),
    };
  });
}
