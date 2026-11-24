// =============================================================================
// THE MOON (milestone 1: the ground, the sky, Earth and the landing site). A real heightfield plain of grey dust in the
// game's own gravel tile: six craters, the Earthrise Ridge along the north edge, low hills round the far edge so the
// plain never ends in a wall; a black star sky with a big Earth over the ridge (world/moonsky.js); the landing site (the
// lander with its two steps and a 3.0 m deck, the flag, four landing lights, the return gate ring as a placeholder that
// does nothing yet). Her cat wears the space suit here (src/suithook.js: LOOK_OF_PLACE.moon); the hop, the climb and the
// pace are the Moon's (src/placephysics.js); the camera's ease, the skip and the landing dust are world/moonlife.js.
//
// Behind ?moon=1 only: no catalog row, no map place, no gate. Draws no random number and reads no clock; builds in
// withLocalUuids. docs/superpowers/specs/2026-11-23-moon-design.md; the plan next to it.
// =============================================================================

import * as THREE from 'three';
import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import { installSuitKit } from '../cat/suitkit.js';
import * as P from './moonplan.js';
import * as K from './moonparts.js';
import { createMoonLife } from './moonlife.js';
import './moonwords.js';

export { MOON_NAME, MOON_BOUNDS, MOON_SPAWN } from './moonplan.js';

// Always "earthrise": one hard white sun low (the game's own), a faint blue fill, a near-black navy sky (the walk's evening look).
const SKY = Object.freeze({ top: 0x03050d, horizon: 0x0a0f1e });
const DUSK_LIGHT = Object.freeze({
  sunColor: 0xfff6e8, sunIntensity: 1.5, hemiSky: 0x5878b0, hemiIntensity: 0.55, groundDim: 0.75,
  envScale: 0.35, fogNear: 90, fogFar: 260,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene, { water = {} } = {}) {
  installSuitKit(); // the suit pieces her cat is drawn with here (effectiveWear: src/suithook.js)
  const quality = water.quality;
  const lowTier = !!quality && (quality.name === 'low' || quality.shadows === false || (quality.rung ?? 0) >= 3);
  return withLocalUuids('moon-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(K.drawGround());

    const M = K.moonMaterials();
    const kit = K.createKit('moon');
    K.drawLander(kit, M);
    K.drawFlag(kit, M);
    K.drawLights(kit, M);
    K.drawGateRing(kit, M);
    const place = new THREE.Group();
    place.name = 'moonPlace';
    for (const m of kit.meshes()) place.add(m);
    scene.add(place);
    for (const rocks of K.drawRocks(lowTier)) scene.add(rocks);

    return {
      name: P.MOON_NAME,
      bounds: P.MOON_BOUNDS,
      spawn: P.MOON_SPAWN,
      colliders: P.MOON_COLLIDERS.map((c) => ({ ...c })),
      waters: [],
      waterFx: [],
      perches: P.MOON_PERCHES.map((p) => ({ ...p })),
      pois: P.MOON_POIS.map((p) => ({ ...p })),
      collectibles: [],
      scenics: [],
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: K.COL.dust,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...DUSK_LIGHT },
      evening: true,
      ground: P.createMoonGround(),
      // the stars, Earth, the camera's ease, the skip and the landing dust (world/moonlife.js)
      life: (ctx) => createMoonLife(ctx),
    };
  });
}
