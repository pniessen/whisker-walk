// =============================================================================
// THE MOON (milestone 1: the ground, the sky, Earth and the landing site). A real heightfield plain of grey dust in the
// game's own gravel tile: six craters, the Earthrise Ridge along the north edge, low hills round the far edge so the
// plain never ends in a wall; a black star sky with a big Earth over the ridge (world/moonsky.js); the landing site (the
// lander with its two steps and a 3.0 m deck, the flag, four landing lights, the return gate ring as a placeholder that
// does nothing yet) and, from milestone 2, the Moonbase Dome (world/moonbase.js), the Old Dish and Skip Ridge; from milestone 5 Star Hill
// (world/moonwing.js: the tower, its ramp, the observatory, the Star Table). Her cat wears the space suit here (src/suithook.js: LOOK_OF_PLACE.moon); the hop, the climb and the
// pace are the Moon's (src/placephysics.js); the camera's ease, the skip and the landing dust are world/moonlife.js.
//
// Behind ?moon=1 only: no catalog row, no map place, no gate. Draws no random number and reads no clock; builds in
// withLocalUuids. docs/superpowers/specs/2026-11-23-moon-design.md; the plan next to it.
// =============================================================================

import * as THREE from 'three';
import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import { installSuitKit } from '../cat/suitkit.js';
import * as P from './moonplan.js';
import * as K from './moonparts.js';
import { drawBase } from './moonbase.js';
import { drawRoverCourse } from './moonroverparts.js';
import { drawFinds } from './moonfindparts.js';
import { drawWing } from './moonwing.js';
import { drawLaunchStanding, drawLaunchWing } from './moonlaunchparts.js';
import { drawBeams, drawLane } from './moonjumpparts.js';
import { drawRifts, drawRingPosts } from './moonboundparts.js';
import { drawMassif, drawCave, drawFill, drawLavaKit } from './moonlavaparts.js';
import { createMoonLife } from './moonlife.js';
import { moonPebbles } from './moonfinds.js';
import './moonwords.js';

export { MOON_NAME, MOON_BOUNDS, MOON_SPAWN } from './moonplan.js';

// Always "earthrise": one hard white sun low (the game's own), a faint blue fill, a near-black navy sky (the walk's evening look).
const SKY = Object.freeze({ top: 0x010208, horizon: 0x03050b });
const DUSK_LIGHT = Object.freeze({
  sunColor: 0xfff4e6, sunIntensity: 2.1, hemiSky: 0x3a5aa0, hemiIntensity: 0.42, groundDim: 0.6,
  envScale: 0.28, fogNear: 380, fogFar: 900,
  lawnTint: Object.freeze({ desat: 0, dark: 1, cool: Object.freeze([1, 1, 1]) }),
});

export function build(scene, { water = {} } = {}) {
  installSuitKit(); // the suit pieces her cat is drawn with here (effectiveWear: src/suithook.js)
  const quality = water.quality;
  const lowTier = !!quality && (quality.name === 'low' || quality.shadows === false || (quality.rung ?? 0) >= 3);
  return withLocalUuids('moon-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    scene.add(K.drawGround(lowTier));

    const M = K.moonMaterials();
    const kit = K.createKit('moon');
    K.drawLander(kit, M);
    K.drawFlag(kit, M);
    K.drawLights(kit, M);
    K.drawGateRing(kit, M);
    const B = drawBase(kit, M);
    drawFinds(kit, M); // Earthrise Rock, the pit's rock, the cheese, the echo studs and the plain's posts (milestone 4)
    drawRoverCourse(kit, M, B); // the depot, the track's lit posts and the Far Beacon (milestone 3; Dot herself is the walk's)
    // Star Hill (milestone 5): the tower and its ramp go into the kit's stone (the stand-in: always drawn, no draw call of its own); the observatory, the
    // lamps, the table and the ceiling are the wing group, drawn only within 55 m (moonzones.js)
    const W = drawWing(kit, M);
    // Launch Complex (milestone 6): the pad, gantry tower, tanks, desks and the mound's benches go into the kit (no draw call of their own); the rocket, the gantry's arm,
    // the plume and the smoke are the wing C group below (world/moonlaunchlive.js moves them)
    drawLaunchStanding(kit, M);
    // Bounce Park (milestone 7a): the eight Beam Hops and the hop board's lane go into the kit too (the lamps and the board's screen are the life's)
    drawBeams(kit, M);
    drawLane(kit, M);
    // the bound's courses (milestone 7b, nothing when world/moonswitch.js is off): the three rifts and the ring gates' posts, also in the kit
    drawRifts(kit, M);
    drawRingPosts(kit, M);
    // the Lava Tube (milestone 8): the Old Dish's ledge and the Core's third socket go into the kit; the massif, the shell and the cave's floor and crystals are three meshes below
    drawLavaKit(kit, M, B);
    const place = new THREE.Group();
    place.name = 'moonPlace';
    for (const m of kit.meshes()) place.add(m);
    scene.add(place);
    scene.add(drawMassif(M), drawCave()); // the massif seen from outside, the tube and room seen from inside (always drawn: the wing's stand-in)
    const fill = drawFill(); // the cave's floor, crystals and pedestal: drawn only within the wing's reach (world/moondeeplive.js)
    fill.visible = false;
    scene.add(fill);
    W.wing.visible = false; // the spawn is 77 m away; the life shows it when she is near
    scene.add(W.wing);
    const C = drawLaunchWing(M, { lite: quality?.shadows === false, low: lowTier && quality?.shadows !== false });
    C.arm.visible = false; // the life shows the arm within 55 m of the pad or while a rocket is in flight; the rocket itself is only ever drawn when it is in view
    scene.add(C.group);
    for (const rocks of K.drawRocks(lowTier)) scene.add(rocks);

    const area = {
      name: P.MOON_NAME,
      bounds: P.MOON_BOUNDS,
      spawn: P.MOON_SPAWN,
      colliders: P.MOON_COLLIDERS.map((c) => ({ ...c })),
      waters: [],
      waterFx: [],
      perches: P.MOON_PERCHES.map((p) => ({ ...p })),
      pois: P.MOON_POIS.map((p) => ({ ...p })),
      collectibles: moonPebbles(), // eight glowing pebbles: the walk's own collectibles
      scenics: [],
      tippables: [],
      boxes: [],
      critterSpawns: [],
      moments: [],
      puddles: [],
      groundBounce: K.COL.dust,
      skyDusk: { ...SKY },
      skySunset: { ...SKY },
      duskLight: { ...DUSK_LIGHT },
      evening: true,
      // spec 5.3: no strays, no clan cats, no wanderer, no rival (walk.js's one switch for "no cats at all", the Rooftops' way)
      strays: false,
      ground: P.createMoonGround(),
      // the stars, Earth, the camera's ease, the skip and the landing dust (world/moonlife.js)
      life: (ctx) => createMoonLife({ ...ctx, colliders: area.colliders, perches: area.perches }),
    };
    return area;
  });
}
