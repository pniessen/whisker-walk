// Stage "jungleb" of the Jungle lodge (see junglestages.js): the river's far bank, the canopy walk and the Rain Supper. J3 puts the six discoveries here (the finds and their
// collectibles), J4 the birds, frogs and sounds (critters); J5 fills the rest (colliders, perches, the supper) and keeps `finds` in this slot. A slot nobody has filled answers null (read by jungle.js).
import { ST } from './junglestages.js';
import { createJungleCritters } from './junglecritters.js';
import { jungleCollectibles, createJungleFindsLife } from './junglefinds.js';

Object.assign(ST, { b: Object.freeze({ finds: Object.freeze({ collectibles: jungleCollectibles, life: createJungleFindsLife }), critters: createJungleCritters }) });
