// Stage "lighthousestory" of Lighthouse Point (see lighthousestages.js): the headland's life side, made once a walk. The sound (lighthousesound.js), pass 6's weather as events (lighthouseweather.js), pass 7's vistas
// (lighthousebeauty7.js), the alive creatures and wonders (lighthousealive.js with its critters and wonders), the find looks (lighthousemoments.js) and the keeper's cats (lighthousecats.js). They moved out of the landing
// chunk with no change of behaviour: lighthouselife.js calls them through ST.story when the life is made, which runs after the area loader has awaited the stage with the base chunk.
import { ST } from './lighthousestages.js';
import { createLighthouseSound } from './lighthousesound.js';
import { createLighthouseWeather } from './lighthouseweather.js';
import { createLighthouseVistas } from './lighthousebeauty7.js';
import { createLighthouseAlive } from './lighthousealive.js';
import { createFindLooks } from './lighthousemoments.js';
import { createKeeperCats } from './lighthousecats.js';

Object.assign(ST, { story: Object.freeze({ createLighthouseSound, createLighthouseWeather, createLighthouseVistas, createLighthouseAlive, createFindLooks, createKeeperCats }) });
