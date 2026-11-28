// Stage "junglestory" of the Jungle lodge (see junglestages.js): the walk's life side, made once a walk. J4's macaws, toucan, frogs and the rain's patter (junglecritters.js) the beauty passes (junglesparkle.js, junglebeauty2.js and the files it gathers: their drawing and the air) and J7's Mossy errand of the day with its
// leaf album (junglejoblive.js). They moved out of stage b with no change of behaviour: jungle.js calls them through ST.story inside its life, which runs after the area loader has awaited every stage with the base chunk.
import { ST } from './junglestages.js';
import { createJungleCritters } from './junglecritters.js';
import { createJungleErrandLive } from './junglejoblive.js';
import { drawSparkle, createJungleAir } from './junglesparkle.js';
import { drawBeauty2, createJungleBeauty2 } from './junglebeauty2.js';
import { drawBeauty4 } from './junglebeauty4.js';

Object.assign(ST, {
  story: Object.freeze({
    critters: createJungleCritters,
    errand: createJungleErrandLive, // Mossy's errand of the day and its leaf album (milestone J7)
    drawBeauty: (kit, M) => { drawSparkle(kit, M); drawBeauty2(kit, M); drawBeauty4(kit, M); }, // the beauty passes' drawing, called from stage b's draw after the carpet (same order, same merged buckets)
    air: (ctx) => { // beauty pass 1: butterflies and fireflies (junglesparkle.js); pass 2 and on: the swaying vines, banners and flock, the sun shafts and the motes, the weather, the vistas and the voice (junglebeauty2.js)
      const one = createJungleAir(ctx); const two = createJungleBeauty2(ctx);
      return { one, two, update(dt, t, catPos, rain, camera, session) { one.update(dt, t, catPos, rain); two.update(dt, t, catPos, rain, camera, session); }, dispose() { two.dispose(); one.dispose(); } };
    },
  }),
});
