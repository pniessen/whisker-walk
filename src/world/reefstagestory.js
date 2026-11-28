// Stage "story" of the Reef (see reefstages.js): Marlo and chapter one, the housewarming, the errand, the light, the critters, the sound and the written guide, all the walk's
// LIFE side (made once a walk), plus Marlo's coral ledge (drawn once in build()). They moved out of the landing chunk (reef.js) with no change of behaviour: reef.js calls
// them through ST.story, which is filled before build() or the life runs (the area loader awaits every stage with the base chunk).
import { ST } from './reefstages.js';
import { createReefStoryLife } from './reefstorylife.js';
import { drawLedge } from './reefmarlo.js';
import { createReefGuideLive } from './reefguidelive.js';

Object.assign(ST, { story: Object.freeze({ createStoryLife: createReefStoryLife, drawLedge, createGuideLive: createReefGuideLive }) });
