// Stage "snowvilleb" of Snowville (see snowvillestages.js): the pond, the sled hill and Lantern Night. V3 puts the six discoveries here (the finds, their collectibles and scenic
// spots), V4 the friendly life and the sound (critters); the pond, hill and Lantern Night come with V5. A slot nobody has filled answers null.
import { ST } from './snowvillestages.js';
import { createSnowvilleCritters } from './snowvillecritters.js';
import { snowvilleCollectibles, snowvilleScenics, createSnowvilleFindsLife } from './snowvillefinds.js';

Object.assign(ST, { b: Object.freeze({ finds: Object.freeze({ collectibles: snowvilleCollectibles, scenics: snowvilleScenics, life: createSnowvilleFindsLife }), critters: createSnowvilleCritters }) });
