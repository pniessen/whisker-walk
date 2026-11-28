// Stage "housestory" of the Old House (see housestages.js): the window light and firelight shader (beauty pass 2), the day's tone, the seasons and the small surprises, the house's sound and the dust and sunbeams
// in the air. They moved out of the landing chunk (house.js, houselife.js) with no change of behaviour: both call them through ST.story, which is filled before build() or the life runs (the area loader awaits every stage with the base chunk).
import { ST } from './housestages.js';
import { createHouseGlow, FIRE, dayPart, rhythm, gustAt, HALL_LAMP } from './houseglow.js';
import { seasonOf, createSurprises } from './housestories.js';
import { createHouseSound } from './housesound.js';
import { createHouseAir } from './houseair.js';
import { createHouseCreatures } from './housealive.js';

ST.story = Object.freeze({ createHouseGlow, FIRE, dayPart, seasonOf, createSurprises, createHouseSound, createHouseAir, createHouseCreatures, rhythm, gustAt, HALL_LAMP });
