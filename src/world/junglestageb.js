// Stage "jungleb" of the Jungle lodge (see junglestages.js): the river's far bank, the canopy walk and the Rain Supper. J3 puts the six discoveries here (the finds and their
// collectibles), J4 the birds, frogs and sounds (critters); J5 the wing itself: the drawing of the banana plant, the low branch's tree, the canopy walk, the sloth's tree, the orchid and
// the supper's lanterns (draw), the second and third fruit with the places the meow's ring goes to (story), the colliders and the one hop, the fruit models, and the wing's live code
// (the table, the strings of lights, the Rain Supper and the sloth). J7 adds Mossy's errand of the day (junglejob.js, junglejoblive.js, junglejobwords.js). A slot nobody has filled answers null (read by jungle.js).
import { ST } from './junglestages.js';
import { createJungleCritters } from './junglecritters.js';
import { jungleCollectibles, createJungleFindsLife } from './junglefinds.js';
import { wingColliders, wingPerches, wingStory } from './junglewingplan.js';
import { drawWing, fruitModel } from './junglewingparts.js';
import { drawPolish } from './junglepolish.js';
import { drawFoliage } from './junglefoliage.js';
import { drawCarpet } from './junglecarpet.js';
import { drawSparkle, createJungleAir } from './junglesparkle.js';
import { drawBeauty2, createJungleBeauty2 } from './junglebeauty2.js';
import { drawBeauty4 } from './junglebeauty4.js';
import { drawHouse } from './junglehouse.js';
import { drawProps, propColliders } from './jungleprops.js';
import { createWing } from './junglewinglive.js';
import { createJungleErrandLive } from './junglejoblive.js';

// junglestrays.js reaches the walk's stray module, so it stays a file of its own, asked for when the life starts (the stage chunk itself never imports it).
function createStraysLazy(ctx) {
  let inner = null;
  let gone = false;
  const ready = import('./junglestrays.js').then((m) => { if (!gone) inner = m.createJungleStrays(ctx); return inner?.ready; }).catch(() => {});
  return {
    ready,
    promptAt: (p) => inner?.promptAt(p) ?? null,
    interact: () => inner?.interact() ?? null,
    update: (dt, t, p) => inner?.update(dt, t, p),
    dispose() { gone = true; inner?.dispose(); },
  };
}

Object.assign(ST, {
  b: Object.freeze({
    finds: Object.freeze({ collectibles: jungleCollectibles, life: createJungleFindsLife }),
    critters: createJungleCritters,
    air: (ctx) => { // beauty pass 1: butterflies and fireflies (junglesparkle.js); pass 2: the swaying vines, banners and flock, the sun shafts and the motes (junglebeauty2.js)
      const one = createJungleAir(ctx); const two = createJungleBeauty2(ctx);
      return { one, two, update(dt, t, catPos, rain, camera, session) { one.update(dt, t, catPos, rain); two.update(dt, t, catPos, rain, camera, session); }, dispose() { two.dispose(); one.dispose(); } };
    },
    strays: createStraysLazy, // four friendly jungle cats made by the walk's own stray system (round two; junglestrays.js is its own lazy file)
    colliders: () => [...wingColliders(), ...propColliders()], // the wing's, and the crates, barrels and drying rack beside the lodge
    perches: wingPerches,
    story: wingStory(),
    draw: (kit, M) => { drawWing(kit, M); drawPolish(kit, M); drawHouse(kit, M); drawFoliage(kit, M); drawProps(kit, M); drawCarpet(kit, M); drawSparkle(kit, M); drawBeauty2(kit, M); drawBeauty4(kit, M); }, // the wing, the J8 beauty round (shrubs, tufts, logs, roots, bromeliads, lianas), then round two: the lodge's detail, the foliage and the lived-in props
    fruitModel,
    wing: createWing,
    errand: createJungleErrandLive, // Mossy's errand of the day and its leaf album (milestone J7)
  }),
});
