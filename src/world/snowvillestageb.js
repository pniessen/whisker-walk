// Stage "snowvilleb" of Snowville (see snowvillestages.js): the pond, the sled hill and Lantern Night. V3 puts the six discoveries here (the finds, their collectibles and scenic
// spots), V4 the friendly life and the sound (critters); V5 the wing itself: the drawing of the pond, ice, hill, hearth, Great Fir and burrow (draw), the second and third candles with their
// lanterns and the places the meow's ring goes to (story), the colliders and hops, and the wing's live code (hearth, strings of lights, Lantern Night). V7 adds Tilly's errand of the day (snowvillejob.js, snowvillejoblive.js, snowvillejobwords.js). A slot nobody has filled answers null.
import { ST } from './snowvillestages.js';
import { createSnowvilleCritters } from './snowvillecritters.js';
import { snowvilleCollectibles, snowvilleScenics, createSnowvilleFindsLife } from './snowvillefinds.js';
import { wingColliders, wingPerches, wingStory } from './snowvillewingplan.js';
import { drawWing } from './snowvillewingparts.js';
import { drawDetail } from './snowvilledetail.js';
import { detailColliders } from './snowvilledetailplan.js';
import { skiColliders } from './snowvilleskisplan.js';
import { createWing } from './snowvillewinglive.js';
import { createSnowErrandLive } from './snowvillejoblive.js';
import { strayHomes, createStrayNotes } from './snowvillestrays.js';
import { createSledLive } from './snowvillesledlive.js';
import { drawRun } from './snowvillesledparts.js';
import { drawSkis } from './snowvilleskisparts.js';
import { createSkisLive } from './snowvilleskislive.js';

Object.assign(ST, {
  b: Object.freeze({
    finds: Object.freeze({ collectibles: snowvilleCollectibles, scenics: snowvilleScenics, life: createSnowvilleFindsLife }),
    critters: createSnowvilleCritters,
    colliders: () => [...wingColliders(), ...detailColliders(), ...skiColliders()],
    perches: wingPerches,
    story: wingStory(),
    draw: (kit, M, opts) => { drawWing(kit, M); drawDetail(kit, M, opts); drawRun(kit, M); drawSkis(kit, M); }, // the wing's drawing and the round-two detail (houses, trees, notices, village)
    wing: createWing,
    strayHomes, // four friendly cats at their own homes (round two)
    strayNotes: createStrayNotes,
    sled: createSledLive, // the sled run down the hill (round two)
    skis: createSkisLive, // the ski slope on the hill's west flank (round three)
    errand: createSnowErrandLive, // Tilly's errand of the day and its album (milestone V7)
  }),
});
