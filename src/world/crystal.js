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
import { createCrystalMood } from './crystalmood.js'; // beauty pass 6: moods, drafts and songs
import { createLumi } from './crystallife.js';
import { createWing } from './crystalwing.js';
import { drawWing } from './crystalwingparts.js';
import { wingPerches } from './crystalwingplan.js';
import './crystalwords.js';
import { createCrystalIntro } from './crystalintro.js';
import { createCrystalGuideLive } from './crystalguidelive.js'; // the written guide: goal line, chip, arrow
import './crystalwingwords.js';
import './crystalwingcwords.js'; // wing C's journal hints (X0)
import { createPromptArbiter } from './promptarbiter.js';
import { ST } from './crystalstages.js'; // the two wing C stages' slots (filled by their chunks, loaded with this one: areas.js)
import { crystalCollectibles, createCrystalFindsLife } from './crystalfinds.js';
import { drawFindMarks } from './crystalfindparts.js';
import { CRYSTAL_SCENICS } from './crystalfindsplan.js';
import { createCrystalAlive } from './crystalalive.js'; // beauty round 3: the cave reacts to the cat and lives
import { createCrystalDecor } from './crystaldecorparts.js'; // layer 3: mushrooms, gardens, moss, stalagmites, pools of light, pebbles (three draws)
import { createCaveLife } from './cavelifelive.js'; // layer 4: fish, bats, fireflies, moths, salamander, beetles, crab
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
    const area = {
      name: P.CRYSTAL_NAME,
      bounds: P.CRYSTAL_BOUNDS,
      spawn: P.CRYSTAL_SPAWN,
      colliders: [...P.crystalColliders(), ...(ST.wingc?.colliders?.() ?? []), ...(ST.grotto?.colliders() ?? []), ...(ST.deep?.colliders?.() ?? [])].map((c) => ({ ...c })), // the river's banks (C1) and the grotto and forge (C2), once their stages are in
      waters: [],
      waterFx: [],
      perches: [...wingPerches(P.crystalY), ...(ST.grotto?.perches() ?? []), ...(ST.deep?.perches?.() ?? [])], // the pool's stepping crystals: an optional climb, the floor goes round (milestone C5)
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
        const decor = createCrystalDecor(ctx);
        const alive = createCrystalAlive({ scene: ctx.scene, decor, tier: ctx.tier, reducedMotion: ctx.reducedMotion });
        const mood = createCrystalMood({ scene: ctx.scene, decor, audio: ctx.audio, tier: ctx.tier, reducedMotion: ctx.reducedMotion });
        const cave = createCaveLife(ctx);
        const lumi = createLumi({ scene: ctx.scene, progression: ctx.progression, audio: ctx.audio, reducedMotion: ctx.reducedMotion });
        const wingLife = createWing({ scene: ctx.scene, lumi, progression: ctx.progression, log: ctx.log, audio: ctx.audio, tier: ctx.tier, reducedMotion: ctx.reducedMotion, send: ctx.sendEvent });
        const finds = createCrystalFindsLife(ctx); // the six discoveries (milestone C3)
        const grotto = ST.grotto?.life(ctx) ?? null; // wing C's grotto and forge shell (C2)
        const deep = ST.deep?.life?.({ ...ctx, colliders: area.colliders }) ?? null; // the Echo Deep's hall shell (second story C2, behind ?deep=1)
        const song = ST.play?.createSong?.(ctx) ?? null; // wing C's singing chamber (C5): the pads, the tunes
        const critters = createCrystalCritters(ctx); // glow-bugs, dust, drips (milestone C4)
        const sound = createCrystalSound(ctx); // the hum, the plinks, the crystals' notes
        const errand = createCaveErrandLive({ scene: ctx.scene, reducedMotion: ctx.reducedMotion, progression: ctx.progression, log: ctx.log, audio: ctx.audio, roomSeed: ctx.roomSeed, visits: ctx.visits, lumi }); // C7
        const intro = createCrystalIntro(ctx); // the arrival card (step 0 only)
        let forgeJob = null; // the forge job (C3), made below: the guide reads its goal when Lumi's is 'rest'
        const guideLumi = Object.create(lumi, { goalNow: { value: () => { const g = forgeJob ? forgeJob.goalFor(lumi.goalNow()) : lumi.goalNow(); return ST.deep?.goalFor?.(g, errand.state) ?? g; } } });
        const guide = createCrystalGuideLive({ doc: ctx.doc ?? globalThis.document, win: ctx.win ?? globalThis.window, lumi: guideLumi, errand, progression: ctx.progression });
        // One arbiter picks the action button's line: Lumi, the errand's hand-in (it wins over the Heart's replay), wing B, then wing C's boat, cart, forge and pads
        // (stage slots that answer null until the stage fills them, so later milestones never edit this file).
        const slot = (get) => ({ promptAt: (p) => get()?.promptAt?.(p) ?? null, interact: () => get()?.interact?.() ?? null });
        // C1: the river boat (a live made here from the stage's factory); while she rides, its "Hop off" comes first, like the Moon's riding source
        const river = ST.wingc?.createRiverLive?.({ scene: ctx.scene, ground: area.ground, colliders: area.colliders, player: ctx.player, reducedMotion: ctx.reducedMotion, tier: ctx.tier, progression: ctx.progression }) ?? null;
        // C4: Lumi's cart (the play stage's factory); its "Hop off" comes first too while she rides it
        const cart = ST.play?.createCartLive?.({ scene: ctx.scene, ground: area.ground, player: ctx.player, reducedMotion: ctx.reducedMotion, tier: ctx.tier, progression: ctx.progression }) ?? null;
        forgeJob = ST.wingc?.createForgeJobLive?.({ scene: ctx.scene, progression: ctx.progression, audio: ctx.audio, reducedMotion: ctx.reducedMotion, log: ctx.log, send: ctx.sendEvent, isRiding: () => !!river?.riding || !!cart?.riding, errand }) ?? null; // C3: the forge job
        const riding = { promptAt: (p) => (river?.riding ? river.promptAt(p) : cart?.riding ? cart.promptAt(p) : null), interact: () => river?.interact() ?? cart?.interact() ?? null };
        const arbiter = createPromptArbiter([riding, lumi, errand, wingLife, slot(() => river), slot(() => cart), slot(() => forgeJob), slot(() => ST.deep), slot(() => ST.play?.pads)]);
        return {
          light,
          alive,
          mood,
          critters,
          sound,
          lumi,
          intro,
          guide,
          wing: wingLife,
          errand,
          spottable: [...cave.spottable, ...(grotto?.spottable ?? []), ...(cart?.spottable ?? [])], // the creatures: photo and journal subjects (cavelifelive.js)
          promptAt: (catPos) => arbiter.promptAt(catPos),
          interact: () => arbiter.interact(),
          // a show begun by anyone in the room starts ours (the shared T0); every other step is Lumi's, credited in order
          // kinds starting 'wc-' (wing C: a forge find, a finished tune) go to its stage slots, never to Lumi; a stage not yet loaded just drops them
          credit: (ev) => {
            if (ev?.kind === 'show') return wingLife.credit(ev);
            if (typeof ev?.kind === 'string' && ev.kind.startsWith('wc-')) return forgeJob?.credit(ev) ?? ST.wingc?.credit?.(ev) ?? ST.play?.credit?.(ev);
            if (typeof ev?.kind === 'string' && ev.kind.startsWith('wd-')) return ST.deep?.credit?.(ev); // the Echo Deep (second story): its steps, never Lumi's
            return lumi.credit(ev);
          },
          update(dt, t, catPos, camera, session) { light.update(dt, t); decor.update(dt); alive.update(dt, t, catPos, camera); mood.update(dt, t, catPos, camera); sound.cue?.(alive.cues); lumi.update(dt, t, catPos, camera, session); wingLife.update(dt, t, catPos, camera, session); finds.update(dt, t, catPos, camera, session); critters.update(dt); cave.update(dt, t); sound.update(dt, catPos); errand.update(dt, t, catPos, camera, session); river?.update(dt, t, catPos, camera, session); cart?.update(dt, t, catPos, camera, session); forgeJob?.update(dt, t, catPos, camera, session); grotto?.update(dt); deep?.update(dt, t, catPos); song?.update(dt, t, catPos); intro.update(dt); guide.update(dt, t, catPos, camera); },
          dispose() { deep?.dispose(); song?.dispose(); forgeJob?.dispose(); cart?.dispose(); grotto?.dispose(); river?.dispose(); cave.dispose(); mood.dispose(); alive.dispose(); decor.dispose(); guide.dispose(); intro.dispose(); errand.dispose(); sound.dispose(); critters.dispose(); finds.dispose(); wingLife.dispose(); lumi.dispose(); light.dispose(); },
        };
      },
    };
    return area;
  });
}
