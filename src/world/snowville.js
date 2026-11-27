// =============================================================================
// SNOWVILLE (milestone V1: the snow world). A small, cosy mountain village in the snow, 80 x 72 m: the spawn court with its return arch, lantern post and brazier, the
// lane up to the village square (cottages with warm windows, the village fir, a cocoa stall, the postcard board, a snowman, lamp posts), drifts, rocks and a fir wood,
// soft snow haze, falling flakes, glints, footprints that stay a while (src/render/pawprints.js) and cheeks that go pink in the cold. The pond, the sled hill, Lantern Night
// and the sled run are the lazy stages (snowvillestages.js), filled by later milestones. Behind ?snowville=1 and the gates switch only. Always snowy, always daytime-bright:
// no weather, no strays. Draws no random number and reads no clock; builds in withLocalUuids. docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md.
// HARD RULES (the Crystal's and Moon's, adapted): open sky, so NO real `ceil`; not in INDOOR_AREAS; at most ONE PointLight in the whole place (the brazier's), made at build
// with a steady intensity; reduced motion stands the flakes and the glints still; the low rungs draw half.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import * as P from './snowvilleplan.js';
import * as K from './snowvilleparts.js';
import { drawBeauty } from './snowvillebeauty.js';
import { createSnowvilleLight, isLowTier } from './snowvillelight.js';
import { createTilly, createSnowvillePrompts } from './snowvillelife.js';
import './snowvillewords.js';
import { ST } from './snowvillestages.js'; // the two stages' slots (filled by their chunks, loaded with this one: areas.js)

export { SNOWVILLE_NAME, SNOWVILLE_BOUNDS, SNOWVILLE_SPAWN } from './snowvilleplan.js';

const SKY = Object.freeze({ top: P.SNOW_LOOK.top, horizon: P.SNOW_LOOK.horizon });
// Always bright, always snowy: the place's look is the walk's "evening" switch with daylight numbers (no weather rolls, one calm light).
const SNOW_LIGHT = Object.freeze({
  sunColor: P.SNOW_LOOK.sunColor, sunIntensity: P.SNOW_LOOK.sunIntensity, hemiSky: P.SNOW_LOOK.hemiSky, hemiIntensity: P.SNOW_LOOK.hemiIntensity, groundDim: 0.9,
  envScale: P.SNOW_LOOK.envScale, fogNear: P.SNOW_LOOK.fogNear, fogFar: P.SNOW_LOOK.fogFar,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene, opts = {}) {
  const low = isLowTier(opts?.water?.quality ?? null);
  return withLocalUuids('snowville-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(K.drawGround());
    const M = K.snowvilleMaterials();
    const kit = K.createKit('snowville');
    K.drawSpawn(kit, M);
    K.drawBrazier(kit, M);
    K.drawCottages(kit, M);
    K.drawSquare(kit, M);
    K.drawFirs(kit, M);
    K.drawDrifts(kit, M);
    K.drawRocks(kit, M);
    drawBeauty(kit, M); // V8: shrubs, woodpiles, crates, icicles, wreaths, pennants and the far ridge
    ST.b?.draw?.(kit, M, { low }); // the pond and its ice, the sled hill, the hearth, the Great Fir and the burrow (milestone V5, in the merged buckets)
    for (const m of kit.meshes()) scene.add(m);
    scene.add(K.drawLight()); // the place's one real light (the brazier's)
    const area = {
      name: P.SNOWVILLE_NAME,
      bounds: P.SNOWVILLE_BOUNDS,
      spawn: P.SNOWVILLE_SPAWN,
      colliders: [...P.snowvilleColliders(), ...(ST.b?.colliders?.() ?? [])].map((c) => ({ ...c })),
      waters: [],
      waterFx: [],
      perches: [...(ST.b?.perches?.() ?? [])],
      pois: P.SNOWVILLE_POIS.map((p) => ({ ...p })),
      collectibles: ST.b?.finds?.collectibles() ?? [], // six (milestone V3, the finds in stage b)
      scenics: ST.b?.finds?.scenics() ?? [],
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: P.SNOW_LOOK.bounce,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...SNOW_LIGHT },
      // evening: true is the walk's one switch for "no weather"
      evening: true,
      // a few friendly cats at their own homes (round two): strayCap caps the walk's stray count, strayHomes puts each at its place with its name and coat (stage b). No ghosts, no wanderer, no rival, no clan cats.
      strayCap: 4,
      strayHomes: ST.b?.strayHomes?.() ?? [],
      goalTypes: Object.freeze(['collectible', 'photo', 'scenic']),
      ground: P.createSnowvilleGround(),
      // the flakes, the glints, the brazier's glow and her cheeks, with Tilly and chapter one (milestone V2) on top
      life: (ctx) => {
        const light = createSnowvilleLight(ctx);
        const tilly = createTilly({ scene: ctx.scene, progression: ctx.progression, audio: ctx.audio, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent });
        const wing = ST.b?.wing?.({ scene: ctx.scene, tilly, progression: ctx.progression, log: ctx.log, audio: ctx.audio, tier: ctx.tier, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent }); // the hearth, the strings of lights and Lantern Night (milestone V5)
        const errand = ST.b?.errand?.({ scene: ctx.scene, reducedMotion: ctx.reducedMotion, progression: ctx.progression, log: ctx.log, audio: ctx.audio, roomSeed: ctx.roomSeed, visits: ctx.visits, tilly, send: ctx.sendEvent }); // Tilly's errand of the day (milestone V7, in stage b)
        const prompts = createSnowvillePrompts(tilly, wing, errand);
        const finds = ST.b?.finds?.life(ctx); // the six discoveries (milestone V3)
        const strayNotes = ST.b?.strayNotes?.(); // a line the first time she meets each of the four friendly strays (round two)
        const critters = ST.b?.critters?.(ctx); // the otters, hare, robin, fox kit, smoke, bells and crunch (milestone V4)
        return {
          light,
          spottable: critters?.spottable ?? [],
          tilly,
          promptAt: (catPos) => prompts.promptAt(catPos),
          interact: () => prompts.interact(),
          wing,
          // a step done by anyone in the room (an `sv-` event): an errand done by a partner is credited to ours, a show begun by a partner starts ours, any other step is Tilly's
          credit: (ev) => errand?.credit(ev) ?? wing?.credit(ev) ?? tilly.credit(ev),
          update(dt, t, catPos, camera, session) { light.update(dt, t, catPos, camera, session); tilly.update(dt, t, catPos, camera, session); wing?.update(dt, t, catPos); errand?.update(dt, t, catPos, camera, session); finds?.update(dt, t, catPos); critters?.update(dt, t, catPos); strayNotes?.update(catPos, session); },
          dispose() { errand?.dispose(); critters?.dispose(); finds?.dispose(); wing?.dispose(); tilly.dispose(); light.dispose(); },
        };
      },
    };
    return area;
  });
}
