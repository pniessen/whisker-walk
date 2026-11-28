// =============================================================================
// LIGHTHOUSE POINT (milestone 1: the ground and the shapes, nothing alive).
//
// A headland between two seas: a cove with six rock pools on the east, a cliff path up to a grassy
// plateau with the keeper's cottage and its garden, a sea cave in the cliff, a striped tower (its stair,
// lamp room and beam are milestone 2's), a sea stack off the west lip. It is always golden-hour evening
// (areaData.evening, a warm duskLight): the beam is the star, so the place has no day look of its own.
//
// Behind ?lighthouse=1 only: no catalog row, no map place, no gate, until milestone 4. Nothing here
// draws a person (the keeper is never shown), runs a clock or draws a random number: the area builds
// in withLocalUuids and every number comes from lighthouseplan.js and builder.js's hash01.
//
// docs/superpowers/specs/2026-11-22-lighthouse-design.md; the plan next to it.
// =============================================================================

import * as THREE from 'three';
import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import { createWater, WATER_TUNING } from '../render/water.js';
import * as P from './lighthouseplan.js';
import * as K from './lighthouseparts.js';
import { drawBeauty } from './lighthousebeauty.js';
import { drawDetail } from './lighthousedetail.js';
import { drawBeauty2 } from './lighthousebeauty2.js';
import { createLighthouseLife } from './lighthouselife.js';
import './lighthousewords.js';
import { phrase } from '../clanphrases.js';

export { LIGHTHOUSE_BOUNDS, LIGHTHOUSE_SPAWN } from './lighthouseplan.js';

// The day sky is never seen (the place is always evening) but applySky wants a pair; the evening's own is
// areaData.skyDusk: amber at the horizon, blue overhead.
const SKY_DAY = Object.freeze({ top: 0x6f8fc0, horizon: 0xf0cfa0 });
const SKY_EVENING = Object.freeze({ top: 0x8499cc, horizon: 0xf5b472 });
// A warm, low golden-hour sun over a softer dusk than the Rooftops' (render/dusk.js's keys).
const DUSK_LIGHT = Object.freeze({
  sunColor: 0xffb066, sunIntensity: 1.2, hemiSky: 0xaab4dc, hemiIntensity: 0.62, groundDim: 0.8,
  envScale: 0.55, fogNear: 45, fogFar: 160,
  lawnTint: Object.freeze({ desat: 0.1, dark: 0.9, cool: Object.freeze([1.0, 0.98, 0.95]) }),
});
export const SAND_DUSK_TINT = Object.freeze({ desat: 0.12, dark: 0.88, cool: Object.freeze([1.0, 0.98, 0.94]) });

export function build(scene, { water = {}, wind } = {}) {
  const plan = P.lighthouseArea();
  return withLocalUuids('lighthouse-build', () => {
    b.applySky(scene, SKY_DAY.top, SKY_DAY.horizon);

    // the sand under everything (the cove, the lower shore, the cave's floor)
    const sand = b.ground(140, K.COL.sand, { surface: 'sand' });
    sand.userData.duskLawnTint = SAND_DUSK_TINT;
    scene.add(sand);

    // the seas: drawn from the declared footprints, straight into the scene
    const seaOpts = { y: 0.05, color: 0x4a90c0, style: 'sea', glare: WATER_TUNING.GLARE_SEA * 0.55, quality: water.quality ?? 'high', reducedMotion: water.reducedMotion ?? false };
    const seaEast = createWater(P.SEA_EAST, { ...seaOpts, shores: ['minX'] });
    const seaWest = createWater(P.SEA_WEST, { ...seaOpts, shores: ['maxX'] });
    scene.add(seaEast.mesh, seaWest.mesh);

    // the place itself: merged, vertex-coloured, by material
    const M = K.lighthouseMaterials();
    const kit = K.createKit('lighthouse');
    K.drawHeadland(kit, M);
    K.drawCliffPath(kit, M);
    K.drawTower(kit, M);
    K.drawStair(kit, M);
    K.drawGallery(kit, M);
    const lamp = K.drawLampRoom(kit, M);
    K.drawCottage(kit, M);
    K.drawGarden(kit, M);
    K.drawBell(kit, M);
    K.drawFlagpole(kit, M);
    K.drawPlateauPaths(kit, M);
    K.drawPools(kit, M);
    K.drawBeach(kit, M);
    K.drawBoat(kit, M);
    K.drawCoveDressing(kit, M);
    K.drawCaveFittings(kit, M);
    K.drawGullRock(kit, M);
    K.drawMarks(kit, M, plan.ground);
    drawBeauty(kit, M);
    drawDetail(kit, M);
    drawBeauty2(kit, M);
    const place = new THREE.Group();
    place.name = 'lighthousePlace';
    for (const m of kit.meshes()) place.add(m);
    place.add(lamp.glass, lamp.roof);
    scene.add(place);
    scene.add(K.createBell());

    // the bench on the plateau (a perch), and the beach plants (marram and sea holly)
    const bench = b.bench(P.BENCH.x, P.BENCH.z, P.BENCH.yaw);
    bench.position.y += P.PLATEAU_Y;
    scene.add(bench);
    for (const [x, z] of [[-6, 38], [26, -12], [24, 38], [-26, 36], [-2, 26], [34, 24]]) scene.add(b.bush(x, z, { wind, style: 'beach' }));
    for (const box of plan.boxes) scene.add(b.cardboardBox(box.x, box.z));

    // the record
    const PROMPTS = { lever: () => phrase('lighthouse.lever.prompt'), bellrope: () => phrase('lighthouse.bell.prompt') };
    const lookBuild = (spot) => (spot.look ? { ...spot, build: () => K.tippableLook(spot.look), ...(PROMPTS[spot.look] ? { prompt: PROMPTS[spot.look]() } : {}) } : spot);
    // the names the game shows go through the phrase table (the same in both word sets; test/lighthousewords.test.js)
    const named = (list, words, keyOf) => list.map((o) => (words[keyOf(o)] ? { ...o, label: words[keyOf(o)]() } : o));
    const SCENIC_WORDS = {
      'lighthouse-gallery': () => phrase('lighthouse.scenic.gallery'), 'lighthouse-cave': () => phrase('lighthouse.scenic.cave'), 'lighthouse-pools': () => phrase('lighthouse.scenic.pools'),
      'lighthouse-cottage': () => phrase('lighthouse.scenic.cottage'), 'lighthouse-gullrock': () => phrase('lighthouse.scenic.gullrock'),
    };
    const COLLECT_WORDS = {
      'light-1': () => phrase('lighthouse.collect.shell'), 'light-2': () => phrase('lighthouse.collect.glass'), 'light-3': () => phrase('lighthouse.collect.starfish'),
      'light-4': () => phrase('lighthouse.collect.button'), 'light-5': () => phrase('lighthouse.collect.cork'),
    };
    const PERCH_WORDS = { 'the upturned boat': () => phrase('lighthouse.perch.boat'), 'the high pool ledge': () => phrase('lighthouse.perch.pool') };
    const MOMENT_WORDS = { 'crab-pool': () => phrase('lighthouse.moment.crab'), 'gull-chip': () => phrase('lighthouse.moment.chip') };

    // the record
    return {
      name: plan.name,
      bounds: plan.bounds,
      spawn: plan.spawn,
      colliders: plan.colliders,
      waters: plan.waters,
      waterFx: [seaEast, seaWest],
      perches: named(plan.perches, PERCH_WORDS, (o) => o.label),
      pois: plan.pois,
      collectibles: named(plan.collectibles, COLLECT_WORDS, (o) => o.id),
      scenics: named(plan.scenics, SCENIC_WORDS, (o) => o.id),
      tippables: plan.tippables.map(lookBuild),
      boxes: plan.boxes,
      critterSpawns: P.LIGHTHOUSE_CRITTERS.map((c) => ({ ...c })), // the game's own gulls and crabs
      moments: P.LIGHTHOUSE_MOMENTS.map((m) => ({ ...m, label: MOMENT_WORDS[m.id]() })),
      puddles: [],
      groundBounce: K.COL.sand,
      skyDusk: { ...SKY_EVENING, warm: 0xff9a4a },
      skySunset: { ...SKY_EVENING },
      duskLight: { ...DUSK_LIGHT },
      evening: true,
      ground: plan.ground,
      traversal: plan.traversal,
      // the lamp: lit by the lever, a beam that turns, the ship's horn (world/lighthouselife.js)
      life: (ctx) => createLighthouseLife({ ...ctx, colliders: plan.colliders, waters: plan.waters }),
    };
  });
}
