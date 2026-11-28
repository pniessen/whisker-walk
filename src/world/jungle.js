// =============================================================================
// THE JUNGLE LODGE (milestone J1: the jungle world). A warm, leafy rainforest, 88 x 76 m: the spawn ring of old mossy stones with its return gate, the stilted lodge with its
// roofed veranda and lantern, a slow brown river she wades across (shallows, a log bridge and stepping stones, NO swimming), giant leaves that shelter from the rain, trees, ferns,
// mossy stones, soft green mist, a warm rain shower on a seeded repeating schedule with a rainbow after it, and the lodge's one real light. The river's far bank, the canopy walk,
// the Rain Supper and the raft are the lazy stages (junglestages.js), filled by later milestones. Behind ?jungle=1 and the gates switch only. Always bright: no walk weather, no
// strays (the rain is this place's own, junglelight.js). Milestone J2 adds Mossy and chapter one; J3 the six discoveries, their collectibles and the three golden mice (world/junglefinds.js, in stage b). J4 adds the birds, frogs and sound (world/junglecritters.js, in stage b) and the music theme. Draws no random number and reads no clock; builds in withLocalUuids. docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md.
// HARD RULES (the Crystal's and Moon's, adapted): open sky above the leaves, so NO real `ceil`; not in INDOOR_AREAS; at most ONE PointLight in the whole place (the veranda lantern's),
// made at build with a steady intensity; reduced motion stands the mist still, draws no rain and holds the lantern; the low rungs draw half.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import * as P from './jungleplan.js';
import * as K from './jungleparts.js';
import { createJungleLight } from './junglelight.js';
import { createRainSchedule, RAIN_SEED } from './jungleplan.js';
import { createMossy, createJunglePrompts } from './junglelife.js';
import './junglewords.js';
import { ST } from './junglestages.js'; // the two stages' slots (filled by their chunks, loaded with this one: areas.js)

export { JUNGLE_NAME, JUNGLE_BOUNDS, JUNGLE_SPAWN } from './jungleplan.js';

const SKY = Object.freeze({ top: P.JUNGLE_LOOK.top, horizon: P.JUNGLE_LOOK.horizon });
// Always bright and green: the place's look is the walk's "evening" switch with daylight numbers (no weather rolls, one calm light).
const JUNGLE_LIGHT = Object.freeze({
  sunColor: P.JUNGLE_LOOK.sunColor, sunIntensity: P.JUNGLE_LOOK.sunIntensity, hemiSky: P.JUNGLE_LOOK.hemiSky, hemiIntensity: P.JUNGLE_LOOK.hemiIntensity, groundDim: 0.9,
  envScale: 0.8, fogNear: P.JUNGLE_LOOK.fogNear, fogFar: P.JUNGLE_LOOK.fogFar,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene) {
  return withLocalUuids('jungle-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(K.drawGround());
    scene.add(K.drawWater());
    const M = K.jungleMaterials();
    const kit = K.createKit('jungle');
    K.drawSpawn(kit, M);
    K.drawLodge(kit, M);
    K.drawCrossings(kit, M);
    K.drawLeaves(kit, M);
    K.drawTrees(kit, M);
    K.drawFerns(kit, M);
    K.drawStones(kit, M);
    ST.b?.draw?.(kit, M); // the banana plant, the low branch, the canopy walk, the sloth's tree, the orchid and the supper's lanterns (milestone J5, in the merged buckets)
    for (const m of kit.meshes()) scene.add(m);
    scene.add(K.drawLight()); // the place's one real light (the veranda lantern's)
    const area = {
      name: P.JUNGLE_NAME,
      bounds: P.JUNGLE_BOUNDS,
      spawn: P.JUNGLE_SPAWN,
      colliders: [...P.jungleColliders(), ...(ST.b?.colliders?.() ?? [])].map((c) => ({ ...c })),
      waters: [], // no swimming: the river is shallows
      waterFx: [],
      perches: [...(ST.b?.perches?.() ?? [])],
      pois: P.JUNGLE_POIS.map((p) => ({ ...p })),
      collectibles: ST.b?.finds?.collectibles() ?? [], // six (milestone J3, the finds in stage b)
      scenics: [],
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: P.JUNGLE_LOOK.bounce,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...JUNGLE_LIGHT },
      // evening: true is the walk's one switch for "no weather"
      evening: true,
      // no strays, and with them no ghosts, no wanderer, no rival, no clan cats
      strays: false,
      goalTypes: Object.freeze(['collectible', 'photo', 'scenic']),
      ground: P.createJungleGround(),
      // the mist, the rain and its rainbow, the lantern's glow, and Mossy with chapter one (junglemission.js)
      life: (ctx) => {
        const light = createJungleLight(ctx.roomSeed === undefined ? ctx : { ...ctx, schedule: createRainSchedule((ctx.roomSeed ^ RAIN_SEED) >>> 0) }); // in a room the showers are the room's (the same on every device)
        const mossy = createMossy({ scene: ctx.scene, progression: ctx.progression, audio: ctx.audio, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent });
        const wing = ST.b?.wing?.({ scene: ctx.scene, mossy, light, progression: ctx.progression, log: ctx.log, audio: ctx.audio, tier: ctx.tier, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent }); // the table, the strings of lights and the Rain Supper (milestone J5)
        const errand = ST.b?.errand?.({ scene: ctx.scene, reducedMotion: ctx.reducedMotion, progression: ctx.progression, log: ctx.log, audio: ctx.audio, roomSeed: ctx.roomSeed, visits: ctx.visits, send: ctx.sendEvent }); // Mossy's errand of the day (milestone J7, in stage b)
        const strays = ST.b?.strays?.({ scene: ctx.scene, ground: ctx.ground, tier: ctx.tier, roomSeed: ctx.roomSeed, reducedMotion: ctx.reducedMotion, colliders: area.colliders }); // the four jungle strays (round two, in stage b)
        const prompts = createJunglePrompts(mossy, wing, errand, strays);
        const finds = ST.b?.finds?.life(ctx); // the six discoveries (milestone J3)
        const critters = ST.b?.critters?.(ctx); // the macaws, toucan, frogs and the rain's patter (milestone J4)
        const air = ST.b?.air?.(ctx); // butterflies and fireflies (beauty pass 1)
        return {
          light,
          spottable: critters?.spottable ?? [],
          mossy,
          wing,
          promptAt: (catPos) => prompts.promptAt(catPos),
          interact: () => prompts.interact(),
          // a step done by anyone in the room (a `jl-` event): an errand done by a partner is credited to ours, a supper begun by a partner starts ours, any other step is Mossy's
          credit: (ev) => errand?.credit(ev) ?? wing?.credit(ev) ?? mossy.credit(ev),
          update(dt, t, catPos, camera, session) { light.update(dt, t, catPos, camera, session); mossy.update(dt, t, catPos, camera, session); wing?.update(dt, t); errand?.update(dt, t, catPos, camera, session); finds?.update(dt, t, catPos); critters?.update(dt, t, catPos, light.state); air?.update(dt, t, catPos, light.state.strength, camera, session); strays?.update(dt, t, catPos); },
          dispose() { air?.dispose(); strays?.dispose(); errand?.dispose(); critters?.dispose(); finds?.dispose(); wing?.dispose(); mossy.dispose(); light.dispose(); },
        };
      },
    };
    return area;
  });
}
