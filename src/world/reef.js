// =============================================================================
// THE REEF (milestone R0: the seams). A stub seabed: a flat sandy floor under a blue-green sky, 96 x 84 m, no props, no kelp, no
// water body (the surface is a shimmer ceiling later, never a `waters` entry). It exists so ?reef=1 can start a walk, give the cat
// control and walk at the Reef's own pace (src/placephysics.js). Behind ?reef=1 only: no catalog row, no map place, no gate.
// Draws no random number and reads no clock; builds in withLocalUuids. docs/superpowers/plans/2026-11-26-reef.md.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import './reefwords.js';

export const REEF_NAME = 'The Reef';
export const REEF_BOUNDS = Object.freeze({ minX: -48, maxX: 48, minZ: -42, maxZ: 42 });
export const REEF_SPAWN = Object.freeze({ x: 0, z: 36 });

const SAND = 0xd8c690;
// Always the "evening" look (no weather rolls; the light and fog are milestone R1's): a deep blue-green water sky.
const SKY = Object.freeze({ top: 0x2a7fa0, horizon: 0x5fb9b4 });
const DUSK_LIGHT = Object.freeze({
  sunColor: 0xdff4ff, sunIntensity: 1.6, hemiSky: 0x7ec8d8, hemiIntensity: 0.55, groundDim: 0.85,
  envScale: 0.4, fogNear: 12, fogFar: 60,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene) {
  return withLocalUuids('reef-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(b.ground(130, SAND, { surface: 'gravel' }));
    return {
      name: REEF_NAME,
      bounds: REEF_BOUNDS,
      spawn: REEF_SPAWN,
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
      groundBounce: SAND,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...DUSK_LIGHT },
      // evening: true is the walk's one switch for "no weather" (no rain under the sea)
      evening: true,
      // no strays, and with them no ghosts, no wanderer, no rival, no clan cats (game/walk.js's one switch for "no cats at all")
      strays: false,
      // daily goals: only the kinds she can finish here (the walk always draws three of them)
      goalTypes: Object.freeze(['collectible', 'photo', 'scenic']),
    };
  });
}
