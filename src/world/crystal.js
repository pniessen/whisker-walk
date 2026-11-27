// =============================================================================
// THE CRYSTAL CAVE (milestone C1: the cave world). A warm, glowing cave of smooth stone, 72 x 64 m: the spawn court with its return arch, the entry hall and the
// Rose hall with the great Rose crystal, small crystal clusters over the rest, a dome and its stalactites, a warm rose fog. Wing B (milestone C5): the Blue Pool with
// its stepping crystals, the Gold Gallery with its vein wall and nook, and the Heart Crystal. Behind ?crystal=1 and the gates switch only. Draws no random number and reads no clock; builds in
// withLocalUuids. docs/superpowers/plans/2026-11-26-crystal-cave.md.
// HARD RULES (the advisor's answers 2 and 4): the walls stand 9 m or more beyond the walkable edge and are inside-only; NO real `ceil` (it would trigger the den's
// caveView); not in INDOOR_AREAS; camera zoom stops at step 2 here (src/camzoom.js); at most ONE PointLight in the whole place, made at build with intensity 0.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import * as P from './crystalplan.js';
import * as K from './crystalparts.js';
import { createCrystalLight } from './crystallight.js';
import { createCrystalCritters } from './crystalcritters.js';
import { createCrystalSound } from './crystalsound.js';
import { createLumi } from './crystallife.js';
import { createWing } from './crystalwing.js';
import { drawWing } from './crystalwingparts.js';
import { wingPerches } from './crystalwingplan.js';
import './crystalwords.js';
import { createCrystalIntro } from './crystalintro.js';
import { createCrystalGuideLive } from './crystalguidelive.js'; // the written guide: goal line, chip, arrow
import './crystalwingwords.js';
import { crystalCollectibles, createCrystalFindsLife } from './crystalfinds.js';
import { drawFindMarks } from './crystalfindparts.js';
import { CRYSTAL_SCENICS } from './crystalfindsplan.js';
import { createCaveErrandLive } from './crystalerrandlive.js'; // C7: Lumi's errand of the day

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
    const wing = drawWing(kit, M); // the pool, the Heart and the passages' lamps (milestone C5)
    for (const m of kit.meshes()) scene.add(m);
    for (const o of wing) scene.add(o);
    scene.add(drawFindMarks()); // the Echo Wall, the Crystal Garden and the Gold Vein (milestone C3)
    scene.add(K.drawLight()); // the cave's one real light, at intensity 0
    return {
      name: P.CRYSTAL_NAME,
      bounds: P.CRYSTAL_BOUNDS,
      spawn: P.CRYSTAL_SPAWN,
      colliders: P.crystalColliders().map((c) => ({ ...c })),
      waters: [],
      waterFx: [],
      perches: wingPerches(P.crystalY), // the pool's stepping crystals: an optional climb, the floor goes round (milestone C5)
      pois: P.CRYSTAL_POIS.map((p) => ({ ...p })),
      collectibles: crystalCollectibles(), // six (milestone C3)
      scenics: CRYSTAL_SCENICS.map((k) => ({ ...k })),
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
      // the fog, the pulse and the glints, with Lumi and chapter one (milestone C2) on top
      life: (ctx) => {
        const light = createCrystalLight(ctx);
        const lumi = createLumi({ scene: ctx.scene, progression: ctx.progression, audio: ctx.audio, reducedMotion: ctx.reducedMotion });
        const wingLife = createWing({ scene: ctx.scene, lumi, progression: ctx.progression, log: ctx.log, audio: ctx.audio, tier: ctx.tier, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent });
        const finds = createCrystalFindsLife(ctx); // the six discoveries (milestone C3)
        const critters = createCrystalCritters(ctx); // glow-bugs, dust, drips (milestone C4)
        const sound = createCrystalSound(ctx); // the hum, the plinks, the crystals' notes
        const errand = createCaveErrandLive({ scene: ctx.scene, reducedMotion: ctx.reducedMotion, progression: ctx.progression, log: ctx.log, audio: ctx.audio, roomSeed: ctx.roomSeed, visits: ctx.visits, lumi }); // C7
        const intro = createCrystalIntro(ctx); // the arrival card (step 0 only)
        const guide = createCrystalGuideLive({ doc: ctx.doc ?? globalThis.document, win: ctx.win ?? globalThis.window, lumi, errand, progression: ctx.progression });
        let used = lumi; // whose prompt the action button is on now
        return {
          light,
          critters,
          sound,
          lumi,
          intro,
          guide,
          wing: wingLife,
          errand,
          promptAt(catPos) {
            const a = lumi.promptAt(catPos);
            if (a) { used = lumi; return a; }
            const job = errand.promptAt(catPos); // C7: the errand's hand-in wins over the Heart's replay
            if (job) { used = errand; return job; }
            used = wingLife;
            return wingLife.promptAt(catPos);
          },
          interact: () => used.interact(),
          // a show begun by anyone in the room starts ours (the shared T0); every other step is Lumi's, credited in order
          credit: (ev) => (ev?.kind === 'show' ? wingLife.credit(ev) : lumi.credit(ev)),
          update(dt, t, catPos, camera, session) { light.update(dt, t); lumi.update(dt, t, catPos, camera, session); wingLife.update(dt, t, catPos, camera, session); finds.update(dt, t, catPos, camera, session); critters.update(dt); sound.update(dt, catPos); errand.update(dt, t, catPos, camera, session); intro.update(dt); guide.update(dt, t, catPos, camera); },
          dispose() { guide.dispose(); intro.dispose(); errand.dispose(); sound.dispose(); critters.dispose(); finds.dispose(); wingLife.dispose(); lumi.dispose(); light.dispose(); },
        };
      },
    };
  });
}
