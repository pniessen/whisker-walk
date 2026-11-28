// Stage "marketlife" of the Market Square (see marketstages.js): the square's life, made once a walk (world/marketlife.js, with the creatures, the sounds, the seasons, the errands and the musician only it uses).
// It moved out of the landing chunk (market.js) with no change of behaviour: market.js calls it through ST.life inside record.life, which runs after the area loader has awaited every stage with the base chunk.
import { ST } from './marketstages.js';
import { createMarketLife } from './marketlife.js';

ST.life = Object.freeze({ createMarketLife });
