// =============================================================================
// THE TREEHOUSE VILLAGE (milestone T1: the tree world). A little town in a giant, friendly oak: the leafy roots where a walk begins, the great trunk, the Bakery deck, the
// branch walk (a rope bridge) to the Bookshop deck, the far platform, the rope bridge on to the Crown deck with its Bell Tower, a forest rim and leaves overhead. The levels
// are PERCHES (the engine has no multi-storey ground): every hop gains at most 1.4 m and reaches at most 2.4 m across, so an ordinary cat reaches every deck with no skill,
// and there is always a railing. An ordinary map place of the Suburban and rural region, entered by the Farm's north signpost (no gate, no teleport pair). Milestone T2 adds Nutmeg and chapter one (world/treehousemission.js). T3 adds the six discoveries, their collectibles and the three golden mice (world/treehousefinds.js, in the branches stage). T4 adds the friendly life and the sound (world/treehousecritters.js, in the branches stage) and the music theme. Draws no random number and reads no clock; builds in withLocalUuids.
// HARD RULES (plan 2.6): camera zoom stops at step 2 here (src/camzoom.js ZOOM_CAPPED_AREAS); NO real `ground.ceil` (the ground is flat, the walk's FLAT_GROUND); the leaves
// stand above CANOPY_MIN_Y (11 m) so step 2 never clips them; at most ONE PointLight in the whole place, made at build with intensity 0.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import * as P from './treehouseplan.js';
import * as K from './treehouseparts.js';
import { createTreehouseLight } from './treehouselight.js';
import { createNutmeg, createTreehousePrompts } from './treehouselife.js';
import './treehousewords.js';
import { ST } from './treehousestages.js'; // the two later stages' slots (filled by their chunks, loaded with this one: areas.js)

export { TREEHOUSE_NAME, TREEHOUSE_BOUNDS, TREEHOUSE_SPAWN } from './treehouseplan.js';

export function build(scene) {
  return withLocalUuids('treehouse-build', () => {
    b.applySky(scene, P.TREE_LOOK.top, P.TREE_LOOK.horizon);
    scene.add(K.drawGround());
    const M = K.treehouseMaterials();
    const kit = K.createKit('treehouse');
    K.drawLitter(kit, M);
    K.drawOak(kit, M);
    K.drawDecks(kit, M);
    K.drawWalks(kit, M);
    K.drawPostBox(kit, M);
    K.drawFerns(kit, M);
    K.drawRim(kit, M);
    K.drawCanopy(kit, M);
    ST.branches?.draw?.(kit, M); // the baskets, the Bookshop's sign, the bell rope and the supper table (milestone T5, in the merged buckets)
    for (const m of kit.meshes()) scene.add(m);
    scene.add(K.drawLight()); // the village's one real light, at intensity 0
    return {
      name: P.TREEHOUSE_NAME,
      bounds: { ...P.TREEHOUSE_BOUNDS },
      spawn: { ...P.TREEHOUSE_SPAWN },
      colliders: [...P.treehouseColliders(), ...(ST.branches?.colliders?.() ?? [])].map((c) => ({ ...c })),
      waters: [],
      waterFx: [],
      perches: [...P.TREEHOUSE_PERCHES, ...(ST.branches?.perches?.() ?? [])].map((p) => ({ x: p.x, z: p.z, y: p.y, kind: p.kind })),
      pois: P.TREEHOUSE_POIS.map((p) => ({ ...p })),
      collectibles: ST.branches?.finds?.collectibles() ?? [], // six (milestone T3, the finds in the branches stage)
      scenics: P.TREEHOUSE_SCENICS.map((k) => ({ ...k })),
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: P.TREE_LOOK.floor,
      skyDusk: { top: 0x2b3a5c, horizon: 0x8a6a70 },
      // no strays, and with them no ghosts, no wanderer, no rival, no clan cats; the goals that fit a place with no animals yet
      strays: false,
      goalTypes: Object.freeze(['photo', 'scenic', 'play', 'treasure']),
      // the flat ground (the walk's FLAT_GROUND): no `ground` key, so no ceiling ever pulls the camera in
      life: (ctx) => {
        const light = createTreehouseLight(ctx);
        const nutmeg = createNutmeg({ scene: ctx.scene, progression: ctx.progression, audio: ctx.audio, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent, light, tier: ctx.tier });
        const wing = ST.branches?.wing?.({ scene: ctx.scene, nutmeg, light, progression: ctx.progression, log: ctx.log, audio: ctx.audio, tier: ctx.tier, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent }); // the bell, the strings of lights and the firefly supper (milestone T5)
        const errand = ST.branches?.errand?.({ scene: ctx.scene, reducedMotion: ctx.reducedMotion, progression: ctx.progression, log: ctx.log, audio: ctx.audio, roomSeed: ctx.roomSeed, visits: ctx.visits, send: ctx.sendEvent }); // Nutmeg's post round of the day (milestone T7, in the branches stage)
        const prompts = createTreehousePrompts(nutmeg, wing, errand);
        const finds = ST.branches?.finds?.life(ctx); // the six discoveries (milestone T3)
        const critters = ST.branches?.critters?.(ctx); // the songbirds, owl, fireflies, leaves, creak and chime (milestone T4)
        return {
          light,
          spottable: critters?.spottable ?? [],
          nutmeg,
          wing,
          promptAt: (catPos) => prompts.promptAt(catPos),
          interact: () => prompts.interact(),
          // a step done by anyone in the room (a `th-` event): a round done by a partner is credited to ours, a supper begun by a partner starts ours, any other step is Nutmeg's
          credit: (ev) => errand?.credit(ev) ?? wing?.credit(ev) ?? nutmeg.credit(ev),
          update(dt, t, catPos, camera, session) { light.update(dt, t); nutmeg.update(dt, t, catPos, camera, session); wing?.update(dt, t); errand?.update(dt, t, catPos, camera, session); finds?.update(dt, t, catPos); critters?.update(dt, t, catPos); },
          dispose() { errand?.dispose(); critters?.dispose(); finds?.dispose(); wing?.dispose(); nutmeg.dispose(); light.dispose(); },
        };
      },
    };
  });
}
