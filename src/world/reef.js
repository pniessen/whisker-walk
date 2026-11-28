// =============================================================================
// THE REEF (milestone R1: the water world). A real seabed: gently rolled dunes of sand (one vertex-coloured heightfield with ripples), 96 x 84 m,
// the spawn arch with its ladder and ring buoy hanging from the shimmer ceiling, a Kelp Garden of swaying kelp (ONE InstancedMesh, the sway in its
// vertex shader), the coral clumps and a few rocks (merged by material), a warm blue-green fog, a shimmer ceiling at y 9 and light shafts (the walk's
// life, world/reeflife.js, which also holds the soft line). No `waters` (the surface is a quad, never a water body). Her cat wears the dive suit here
// (src/cat/suitkit.js, the registered kit's look of this place); the float and the camera's follow of it are the player's (src/player.js, the `reef` row of
// src/placephysics.js). Behind ?reef=1 only: no catalog row, no map place, no gate. Draws no random number and reads no clock; builds in withLocalUuids.
// docs/superpowers/plans/2026-11-26-reef.md.
// =============================================================================

import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, CircleGeometry, BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, MeshStandardMaterial, DoubleSide, Vector3 } from 'three';
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
import { drawTufts, drawDecor } from './reefdecorparts.js';
import { createReefDeepLife } from './reefdeeplife.js';
import { createReefGuideLive } from './reefguidelive.js';
import { createReefSealsLife } from './reefsealslive.js';
import { createReefMoreLife } from './reefmorelive.js';
import { lifeColliders } from './reefseals.js';
import { Soup, moreMesh } from './reefmoreparts.js';
import { tube, ellipsoid, paddle, bodyMatrix } from './reefsealsparts.js';
import './reefwords.js';
import './reefwingwords2.js';
import { ST, loadReefStages } from './reefstages.js';
import { createPromptArbiter } from './reefprompt.js';

// The few three.js classes the wreck stage uses, handed in (the stage imports nothing of three's: it would split three's core out of the start-up chunk).
const THREE = { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, CircleGeometry, BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, MeshStandardMaterial, DoubleSide, Vector3 };

// Under vitest the stages load here, so every test that imports this file gets the whole Reef; the game's own loader awaits them (areas.js).
// (The flag is undefined in a build, so this line and its top-level await are dropped.)
if (import.meta.env?.VITEST) await loadReefStages();

export { REEF_NAME, REEF_BOUNDS, REEF_SPAWN } from './reefplan.js';

// Always the "evening" look (no weather rolls): a deep blue-green water sky; the fog is the life's (the same horizon colour).
const SKY = Object.freeze({ top: P.WATER_LOOK.top, horizon: P.WATER_LOOK.horizon });
const DUSK_LIGHT = Object.freeze({
  sunColor: P.WATER_LOOK.sunColor, sunIntensity: P.WATER_LOOK.sunIntensity, hemiSky: P.WATER_LOOK.hemiSky, hemiIntensity: 0.55, groundDim: 0.85,
  envScale: 0.4, fogNear: P.WATER_LOOK.fogNear, fogFar: P.WATER_LOOK.fogFar,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene, opts) {
  ST.wreck.install?.({ reefY: P.reefY, reefBaseY: P.reefBaseY, raise: P.REEF_RAISE_REGIONS, ceil: P.REEF_CEIL_REGIONS }); // the galleon's deck and cabin join the ground (R16)
  installSuitKit(); // the dive suit her cat is drawn with here (game/walk.js asks the registered kit)
  return withLocalUuids('reef-build', () => {
    ST.lab.register(P, { THREE: K.T3, mergeGeometries: K.mergeGeometries }); // the Sealab's footprint (R13): the flat floor, the plants taken away, the finite ceiling; before anything is drawn
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(K.drawGround());
    const M = K.reefMaterials();
    const kit = K.createKit('reef');
    K.drawSpawn(kit, M);
    K.drawCoral(kit, M);
    K.drawPebbles(kit, M);
    K.drawSeabedLife(kit, M); // round 6: seagrass, starfish and sea urchins
    drawLedge(kit, M); // the coral ledge that holds shell two (R2)
    drawCave(kit, M); // wing B (R5): the shallow cave that holds shell three, the lantern corals' stalks and the clumps at three heights
    drawLanternStalks(kit, M);
    drawWingClumps(kit, M);
    drawDeep(kit, M); // wing C (R8): the Sunken Boat, the Old Anchor and the Glow Cave, into the same two buckets
    ST.lab.buildLab(scene, P.reefY, opts?.water?.quality); // the Sealab (R13, stage 'lab'): the station inside, its hull outside, the hatch beside the Boat and the ONE light
    ST.wreck.draw?.(kit, M, { paint: K.paint, COL: K.COL, THREE }); // the galleon (R16, the wreck stage): hull, deck, cabin, mast, cannons and the brass suit, into the same buckets
    const rideKit = { THREE: K.T3, mergeGeometries: K.mergeGeometries };
    ST.ride.buildRacks(scene, rideKit, P.reefY, opts?.water?.quality); // the two mounts' racks and the mounts on them (R12, stage 'ride')
    for (const m of kit.meshes()) scene.add(m);
    const kelp = K.drawKelp();
    scene.add(kelp);
    scene.add(drawTufts(kelp.material.userData.kelpTime)); // seabed decor: seagrass and anemone tufts, one InstancedMesh on the kelp's own sway
    scene.add(drawDecor(M)); // seabed decor: fans, heads, sponges, arches, urchins, stars, shells, pebbles, rock piles, driftwood and ripples, one merged mesh
    scene.add(drawSpires()); // the tall coral spires: one InstancedMesh (R5)
    for (const m of drawFindMarks()) scene.add(m); // the oyster, the seahorse and the chest (milestone R3)
    scene.add(drawBubbleColumns()); // the two floating golden mice's columns
    const area = {
      name: P.REEF_NAME,
      bounds: P.REEF_BOUNDS,
      spawn: P.REEF_SPAWN,
      colliders: [...P.reefColliders(), ...storyColliders(), ...lifeColliders(), ...ST.lab.colliders(), ...(ST.wreck.colliders?.() ?? []), ...ST.ride.colliders()].map((c) => ({ ...c })),
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
      // the light, the kelp's sway, Marlo and chapter one (world/reefstorylife.js), with the finds on top
      life: (ctx) => {
        const base = createReefStoryLife(ctx); // the light, the kelp, Marlo and chapter one (milestone R2)
        const finds = createReefFindsLife(ctx); // the six discoveries (milestone R3)
        const deep = createReefDeepLife({ ...ctx, say: base.say }); // the plankton and the Deep's three soft lines (R8)
        const sea = createReefSealsLife(ctx); // the seals, octopuses and dolphin family (photo and journal subjects through `spottable`)
        const more = createReefMoreLife(ctx); // jellyfish, clownfish, seahorses, mantas, a whale, moray eels and squid
        const lab = ST.lab.createLabLive({ scene: ctx.scene, reefY: P.reefY, look: P.WATER_LOOK, player: ctx.player, reducedMotion: ctx.reducedMotion, tier: ctx.tier, say: base.say, doc: ctx.doc ?? globalThis.document }); // the hatch and the inside (R13)
        const pr = ctx.progression;
        const story = ST.lab.createLabStory({ // the fuses, the aquarium's fish and the shy shark (R14); the save and the walk reach it only through `io`
          scene: ctx.scene, reefY: P.reefY, lab, player: ctx.player, reducedMotion: ctx.reducedMotion, tier: ctx.tier, say: base.say, audio: ctx.audio, Vec3: K.T3.Vector3,
          io: {
            reef: () => pr?.state?.reef,
            commit(next) { if (!pr?.state) return; pr.state.reef = { ...(pr.state.reef ?? {}), lab: next.lab }; pr.addPoints?.(0); },
            sight(id) { pr?.recordSighting?.(id); },
            award: (kind, key, text) => ctx.log?.awardOnce(kind, key, text),
            send: (ev) => ctx.sendEvent?.(ev),
            mouthFree: () => base.marlo.state.carrying == null,
          },
        });
        const guide = createReefGuideLive({ doc: ctx.doc ?? globalThis.document, win: ctx.win ?? globalThis.window, marlo: base.marlo, errand: base.errand, progression: ctx.progression, lab: story }); // the written guide: goal line, arrow, chip, arrival card
        const ride = ST.ride.createRideLive(rideKit, ctx, area, base, P); // the two mounts (R12)
        const prompt = createPromptArbiter([ride, base, story, lab]); // "Hop off" (and "Hop on" at a rack) come first; // Marlo's and the errand's offers win, then a fuse's, and the hatch is the lowest
        const divers = ST.ride.createDiversLive([Soup, moreMesh, tube, ellipsoid, paddle, bodyMatrix, P.reefY], { scene: ctx.scene, Vec3: K.T3.Vector3, reducedMotion: ctx.reducedMotion, tier: ctx.tier, say: base.say }); // the divers, the research ship and the big spotted shark (R18)
        const wreck = ST.wreck.life?.({ ...ctx, say: base.say, THREE }); // the galleon's flag, journal spot and soft lines (R16)
        return {
          ...base,
          promptAt: prompt.promptAt,
          interact: prompt.interact,
          lab,
          story,
          ride,
          guide,
          credit: (ev) => (ev?.kind === 'fuse' || ev?.kind === 'labshow' ? story.credit(ev) : ev?.kind === 'map' || ev?.kind === 'clue' || ev?.kind === 'chest' ? wreck?.credit(ev) : base.credit(ev)), // a fuse (R14) or a hunt step (R17) done by anyone in the room; every other step is Marlo's
          spottable: [...sea.spottable, ...more.spottable, ...story.spottable, ...(wreck?.spottable ?? []), ...divers.spottable],
          update(...a) { base.update(...a); finds.update(...a); deep.update(...a); sea.update(...a); more.update(...a); wreck?.update(...a); divers.update(...a); ride.update(...a); lab.update(...a); story.update(...a); guide.update(...a); },
          dispose() { guide.dispose(); ride.dispose(); divers.dispose(); wreck?.dispose(); story.dispose(); lab.dispose(); more.dispose(); sea.dispose(); deep.dispose(); finds.dispose(); base.dispose(); },
        };
      },
    };
    return area;
  });
}
