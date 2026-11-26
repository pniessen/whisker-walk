// =============================================================================
// THE CRYSTAL CAVE (milestone C1: the cave world). A warm, glowing cave of smooth stone, 72 x 64 m: the spawn court with its return arch, the entry hall and the
// Rose hall with the great Rose crystal, small crystal clusters over the rest, a dome and its stalactites, a warm rose fog. The Blue Pool, the Gold Gallery and the
// Heart are on the floor but not yet drawn (milestone C5). Behind ?crystal=1 and the gates switch only. Draws no random number and reads no clock; builds in
// withLocalUuids. docs/superpowers/plans/2026-11-26-crystal-cave.md.
// HARD RULES (the advisor's answers 2 and 4): the walls stand 9 m or more beyond the walkable edge and are inside-only; NO real `ceil` (it would trigger the den's
// caveView); not in INDOOR_AREAS; camera zoom stops at step 2 here (src/camzoom.js); at most ONE PointLight in the whole place, made at build with intensity 0.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import * as P from './crystalplan.js';
import * as K from './crystalparts.js';
import { createCrystalLight } from './crystallight.js';
import './crystalwords.js';

export { CRYSTAL_NAME, CRYSTAL_BOUNDS, CRYSTAL_SPAWN } from './crystalplan.js';

const SKY = Object.freeze({ top: P.CAVE_LOOK.top, horizon: P.CAVE_LOOK.horizon });
const DUSK_LIGHT = Object.freeze({
  sunColor: P.CAVE_LOOK.sunColor, sunIntensity: P.CAVE_LOOK.sunIntensity, hemiSky: P.CAVE_LOOK.hemiSky, hemiIntensity: 0.7, groundDim: 0.85,
  envScale: 0.4, fogNear: P.CAVE_LOOK.fogNear, fogFar: P.CAVE_LOOK.fogFar,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene) {
  return withLocalUuids('crystal-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(K.drawGround());
    scene.add(K.drawDome());
    scene.add(K.drawStalactites());
    const M = K.crystalMaterials();
    const kit = K.createKit('crystal');
    K.drawSpawn(kit, M);
    K.drawClusters(kit, M);
    K.drawRim(kit, M);
    K.drawPebbles(kit, M);
    for (const m of kit.meshes()) scene.add(m);
    scene.add(K.drawLight()); // the cave's one real light, at intensity 0
    return {
      name: P.CRYSTAL_NAME,
      bounds: P.CRYSTAL_BOUNDS,
      spawn: P.CRYSTAL_SPAWN,
      colliders: P.crystalColliders().map((c) => ({ ...c })),
      waters: [],
      waterFx: [],
      perches: [],
      pois: P.CRYSTAL_POIS.map((p) => ({ ...p })),
      collectibles: [],
      scenics: [],
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: P.CAVE_LOOK.stone,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...DUSK_LIGHT },
      // evening: true is the walk's one switch for "no weather"
      evening: true,
      // no strays, and with them no ghosts, no wanderer, no rival, no clan cats
      strays: false,
      goalTypes: Object.freeze(['collectible', 'photo', 'scenic']),
      ground: P.createCrystalGround(),
      // the fog, the pulse and the glints
      life: (ctx) => {
        const light = createCrystalLight(ctx);
        return { light, update: (dt, t) => light.update(dt, t), dispose: () => light.dispose() };
      },
    };
  });
}
