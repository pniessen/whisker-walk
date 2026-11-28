// Stage "snowvillestory" of Snowville (see snowvillestages.js): the village's life side, made once a walk. Beauty pass 4's season and rare surprises (snowvillewonder.js), pass 5's creatures, arrival and
// shared breath (snowvilleliving.js), pass 6's hour weather (snowvilleweather.js), pass 7's photo spots (snowvillevista.js), pass 8's answers to her voice and moves (snowvillebeauty8.js), round one's alive
// creatures (snowvillealive.js), V4's friendly life (snowvillecritters.js, which shares the alive module's breath) and the sound beds (snowvillesound.js). They moved out of the landing chunk (snowville.js, snowvillelight.js) with no change of behaviour: those call them through ST.story
// inside the life, which runs after the area loader has awaited every stage with the base chunk.
import { ST } from './snowvillestages.js';
import { createWonder } from './snowvillewonder.js';
import { createLiving } from './snowvilleliving.js';
import { createWeather } from './snowvilleweather.js';
import { createVista } from './snowvillevista.js';
import { createReactions } from './snowvillebeauty8.js';
import { createAlive, waveAt, chase, glowNear, SHARED } from './snowvillealive.js';
import { createSnowvilleCritters } from './snowvillecritters.js';
import { createFestival } from './snowvillefestival.js';
import { createCoherence } from './snowvillecoherence.js';
import { createSoundBed, createZoneBed } from './snowvillesound.js';

Object.assign(ST, { story: Object.freeze({ createWonder, createLiving, createWeather, createVista, createReactions, createFestival, createCoherence, createAlive, waveAt, chase, glowNear, SHARED, createSoundBed, createZoneBed, critters: createSnowvilleCritters }) });
