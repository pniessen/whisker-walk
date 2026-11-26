// =============================================================================
// THE REEF (milestone R1: the water world). A real seabed: gently rolled dunes of sand (one vertex-coloured heightfield with ripples), 96 x 84 m,
// the spawn arch with its ladder and ring buoy hanging from the shimmer ceiling, a Kelp Garden of swaying kelp (ONE InstancedMesh, the sway in its
// vertex shader), the coral clumps and a few rocks (merged by material), a warm blue-green fog, a shimmer ceiling at y 9 and light shafts (the walk's
// life, world/reeflife.js, which also holds the air gauge). No `waters` (the surface is a quad, never a water body). Her cat wears the dive suit here
// (src/cat/suitkit.js, the registered kit's look of this place); the float and the camera's follow of it are the player's (src/player.js, the `reef` row of
// src/placephysics.js). Behind ?reef=1 only: no catalog row, no map place, no gate. Draws no random number and reads no clock; builds in withLocalUuids.
// docs/superpowers/plans/2026-11-26-reef.md.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import { installSuitKit } from '../cat/suitkit.js';
import * as P from './reefplan.js';
import * as K from './reefparts.js';
import { createReefStoryLife } from './reefstorylife.js';
import { drawLedge } from './reefmarlo.js';
import { storyColliders } from './reefstory.js';
import { reefCollectibles, createReefFindsLife } from './reeffinds.js';
import { drawFindMarks, drawBubbleColumns } from './reeffindparts.js';
import { drawCave, drawLanternStalks, drawWingClumps, drawSpires } from './reefwingparts.js';
import { REEF_SCENICS } from './reeffindsplan.js';
import { drawDeep } from './reefdeepparts.js';
import { createReefDeepLife } from './reefdeeplife.js';
import './reefwords.js';

export { REEF_NAME, REEF_BOUNDS, REEF_SPAWN } from './reefplan.js';

// Always the "evening" look (no weather rolls): a deep blue-green water sky; the fog is the life's (the same horizon colour).
const SKY = Object.freeze({ top: P.WATER_LOOK.top, horizon: P.WATER_LOOK.horizon });
const DUSK_LIGHT = Object.freeze({
  sunColor: P.WATER_LOOK.sunColor, sunIntensity: P.WATER_LOOK.sunIntensity, hemiSky: P.WATER_LOOK.hemiSky, hemiIntensity: 0.55, groundDim: 0.85,
  envScale: 0.4, fogNear: P.WATER_LOOK.fogNear, fogFar: P.WATER_LOOK.fogFar,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene) {
  installSuitKit(); // the dive suit her cat is drawn with here (game/walk.js asks the registered kit)
  return withLocalUuids('reef-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(K.drawGround());
    const M = K.reefMaterials();
    const kit = K.createKit('reef');
    K.drawSpawn(kit, M);
    K.drawCoral(kit, M);
    K.drawPebbles(kit, M);
    drawLedge(kit, M); // the coral ledge that holds shell two (R2)
    drawCave(kit, M); // wing B (R5): the shallow cave that holds shell three, the lantern corals' stalks and the clumps at three heights
    drawLanternStalks(kit, M);
    drawWingClumps(kit, M);
    drawDeep(kit, M); // wing C (R8): the Sunken Boat, the Old Anchor and the Glow Cave, into the same two buckets
    for (const m of kit.meshes()) scene.add(m);
    scene.add(K.drawKelp());
    scene.add(drawSpires()); // the tall coral spires: one InstancedMesh (R5)
    for (const m of drawFindMarks()) scene.add(m); // the oyster, the seahorse and the chest (milestone R3)
    scene.add(drawBubbleColumns()); // the two floating golden mice's columns
    const area = {
      name: P.REEF_NAME,
      bounds: P.REEF_BOUNDS,
      spawn: P.REEF_SPAWN,
      colliders: [...P.reefColliders(), ...storyColliders()].map((c) => ({ ...c })),
      waters: [],
      waterFx: [],
      perches: [],
      pois: P.REEF_POIS.map((p) => ({ ...p })),
      collectibles: reefCollectibles(), // five shells and three pieces of sea-glass (milestone R3)
      scenics: REEF_SCENICS.map((k) => ({ ...k })),
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: P.WATER_LOOK.sand,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...DUSK_LIGHT },
      // evening: true is the walk's one switch for "no weather" (no rain under the sea)
      evening: true,
      // no strays, and with them no ghosts, no wanderer, no rival, no clan cats (game/walk.js's one switch for "no cats at all")
      strays: false,
      // daily goals: only the kinds she can finish here (the walk always draws three of them)
      goalTypes: Object.freeze(['collectible', 'photo', 'scenic']),
      ground: P.createReefGround(),
      // the light, the kelp's sway, the air gauge, Marlo and chapter one (world/reefstorylife.js), with the finds on top
      life: (ctx) => {
        const base = createReefStoryLife(ctx); // the light, the kelp, the gauge, Marlo and chapter one (milestone R2)
        const finds = createReefFindsLife(ctx); // the six discoveries (milestone R3)
        const deep = createReefDeepLife({ ...ctx, say: base.say }); // the plankton and the Deep's three soft lines (R8)
        return {
          ...base,
          update(...a) { base.update(...a); finds.update(...a); deep.update(...a); },
          dispose() { deep.dispose(); finds.dispose(); base.dispose(); },
        };
      },
    };
    return area;
  });
}
