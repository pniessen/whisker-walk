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
import { createSnowvilleLight } from './snowvillelight.js';
import { createTilly, createSnowvillePrompts } from './snowvillelife.js';
import './snowvillewords.js';
import { ST } from './snowvillestages.js'; // the two stages' slots (filled by their chunks, loaded with this one: areas.js)

export { SNOWVILLE_NAME, SNOWVILLE_BOUNDS, SNOWVILLE_SPAWN } from './snowvilleplan.js';

const SKY = Object.freeze({ top: P.SNOW_LOOK.top, horizon: P.SNOW_LOOK.horizon });
// Always bright, always snowy: the place's look is the walk's "evening" switch with daylight numbers (no weather rolls, one calm light).
const SNOW_LIGHT = Object.freeze({
  sunColor: P.SNOW_LOOK.sunColor, sunIntensity: P.SNOW_LOOK.sunIntensity, hemiSky: P.SNOW_LOOK.hemiSky, hemiIntensity: P.SNOW_LOOK.hemiIntensity, groundDim: 0.9,
  envScale: 0.8, fogNear: P.SNOW_LOOK.fogNear, fogFar: P.SNOW_LOOK.fogFar,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene) {
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
      collectibles: [],
      scenics: [],
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
      // no strays, and with them no ghosts, no wanderer, no rival, no clan cats
      strays: false,
      goalTypes: Object.freeze(['collectible', 'photo', 'scenic']),
      ground: P.createSnowvilleGround(),
      // the flakes, the glints, the brazier's glow and her cheeks, with Tilly and chapter one (milestone V2) on top
      life: (ctx) => {
        const light = createSnowvilleLight(ctx);
        const tilly = createTilly({ scene: ctx.scene, progression: ctx.progression, audio: ctx.audio, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent });
        const prompts = createSnowvillePrompts(tilly);
        return {
          light,
          tilly,
          promptAt: (catPos) => prompts.promptAt(catPos),
          interact: () => prompts.interact(),
          // a step done by anyone in the room (an `sv-` event); a stage's own steps join this line with their stage
          credit: (ev) => tilly.credit(ev),
          update(dt, t, catPos, camera, session) { light.update(dt, t, catPos, camera, session); tilly.update(dt, t, catPos, camera, session); },
          dispose() { tilly.dispose(); light.dispose(); },
        };
      },
    };
    return area;
  });
}
