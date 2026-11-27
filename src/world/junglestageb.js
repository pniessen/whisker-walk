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
import { createWing } from './junglewinglive.js';
import { createJungleErrandLive } from './junglejoblive.js';

Object.assign(ST, {
  b: Object.freeze({
    finds: Object.freeze({ collectibles: jungleCollectibles, life: createJungleFindsLife }),
    critters: createJungleCritters,
    colliders: wingColliders,
    perches: wingPerches,
    story: wingStory(),
    draw: (kit, M) => { drawWing(kit, M); drawPolish(kit, M); }, // the wing, then the J8 beauty round (shrubs, tufts, logs, roots, bromeliads, lianas)
    fruitModel,
    wing: createWing,
    errand: createJungleErrandLive, // Mossy's errand of the day and its leaf album (milestone J7)
  }),
});
