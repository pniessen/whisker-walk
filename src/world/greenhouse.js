// =============================================================================
// THE GREENHOUSE (milestones 0 and 1). One glass house (the Palm House) with its real plants (greenhouseplants.js),
// mist, sun shafts, floor and dapple; a pond with lily pads, reeds and koi; the Park's fountain; a potting bench,
// a kitchen bed and the two gardener's jobs (greenhouselife.js). Reached by the Park's archway gate (G4; ?greenhouse=1 is a
// shortcut), with its own return arch at the court. The glass kit is greenhouseglass.js; the data is
// greenhouseplan.js. Builds in withLocalUuids; draws no random number and reads no clock.
// docs/superpowers/specs/2026-11-22-greenhouse-design.md; the plan next to it.
// =============================================================================

import * as b from './builder.js';
import { withLocalUuids } from './localuuids.js';
import { seedFromCode } from '../rng.js';
import { createWater, PARK_POND_LOOK } from '../render/water.js';
import * as P from './greenhouseplan.js';
import * as G from './greenhouseglass.js';
import * as Plants from './greenhouseplants.js';
import * as Parts from './greenhouseparts.js';
import { createGreenhouseLife } from './greenhouselife.js';
import { phrase } from '../clanphrases.js';
import './greenhousewords.js';

export { GREENHOUSE_BOUNDS, GREENHOUSE_SPAWN } from './greenhouseplan.js';

const MOMENT_WORDS = { 'frog-plop': () => phrase('greenhouse.moment.frog'), 'sparrow-bath': () => phrase('greenhouse.moment.sparrow') };

const GRASS = 0x6fae5a;
const SKY = Object.freeze({ top: 0x8cc8ee, horizon: 0xe6f2e8 });
const SKY_DUSK = Object.freeze({ top: 0x35456a, horizon: 0xd8a688 });

export function build(scene, { water = {}, wind } = {}) {
  void wind;

  const area = P.greenhouseArea();
  return withLocalUuids('greenhouse-build', () => {
    b.applySky(scene, SKY.top, SKY.horizon);
    const lawn = b.ground(120, GRASS, { surface: 'grass' });
    scene.add(lawn);
    scene.add(b.horizonBand({ kind: 'hills', inner: 56, outer: 116, height: 7, wavelength: 36, color: 0x86b874, salt: 71, nearColor: GRASS }));

    const quality = water.quality ?? 'high';
    const pond = createWater(P.POND, { y: 0.02, ...PARK_POND_LOOK, quality, reducedMotion: water.reducedMotion ?? false, foamStrength: 0.25 });
    scene.add(pond.mesh);
    const pads = [[-28, 16, 0.4], [-27.2, 19.4, 0.34], [-24, 15.6, 0.36], [-23.4, 20.2, 0.3], [-29.6, 20, 0.32]].map(([x, z, r]) => ({ x, z, r }));
    const lilies = b.lilyPads(pads, seedFromCode('greenhouse-lilies'));
    lilies.name = 'lilyPads';
    scene.add(lilies);

    const H = P.PALM_HOUSE;
    scene.add(G.floorQuad(H));
    const house = G.glassHouse(H, P.PALM_DOORS, { name: 'palmHouse' });
    scene.add(house.group);
    scene.add(G.dappleQuad(H));
    // the low tier drops the mist and the shafts and keeps the frame, the one glass layer and the dapple
    const mist = quality === 'low' ? null : G.mistSheets();
    const shafts = quality === 'low' ? null : G.sunShafts(H);
    if (mist) scene.add(mist);
    if (shafts) scene.add(shafts);

    // the plants, the koi, the fountain court, the potting bench, the kitchen bed and the eight garden pots
    scene.add(Plants.palms(), Plants.foliage(), Plants.orchids());
    const koi = Plants.koiMesh();
    scene.add(koi);
    scene.add(Parts.fountainCourt({ reducedMotion: water.reducedMotion ?? false }));
    scene.add(Parts.pottingBench(), Parts.kitchenBed());
    const garden = Parts.gardenPots();
    scene.add(garden.pots, ...garden.leaves);

    // milestone G3: the court, paths, hedges, beds, benches, the shed and its kit, the trees, the box
    scene.add(Parts.groundDress(), Parts.streetKit(), Parts.shedKit(), Parts.trees(), Parts.returnArch());
    const boxes = area.boxes.map((bx) => ({ ...bx }));
    for (const bx of boxes) scene.add(b.cardboardBox(bx.x, bx.z));

    return {
      name: area.name,
      bounds: area.bounds,
      spawn: area.spawn,
      colliders: area.colliders,
      waters: area.waters,
      waterFx: [pond],
      perches: area.perches,
      pois: area.pois,
      collectibles: area.collectibles,
      scenics: area.scenics,
      tippables: area.tippables,
      boxes,
      critterSpawns: area.critterSpawns,
      moments: area.moments.map((m) => ({ ...m, label: MOMENT_WORDS[m.id]() })),
      puddles: [],
      groundBounce: 0xc9d8a8,
      skyDusk: { ...SKY_DUSK },
      // the mist, the shafts and the koi drift on the walk's clock (reduced motion freezes all three); the jobs and
      // their prompts are the life's (game/interactions.js asks it for promptAt and interact)
      life: (ctx = {}) => createGreenhouseLife({ ...ctx, scene: ctx.scene ?? scene, mist, shafts, koi }),
    };
  });
}
