// Stage "crystalstory" of the Crystal Cave (see crystalstages.js): the cave's life side, made once a walk. Beauty round 3's alive creatures (crystalalive.js), pass 6's moods, drafts and songs (crystalmood.js), layer 4's cave life
// (cavelifelive.js: fish, bats, fireflies, moths, salamander, beetles, crab) and C7's errand of the day (crystalerrandlive.js). They moved out of the landing chunk (crystal.js)
// with no change of behaviour: crystal.js calls them through ST.story inside its life, which runs after the area loader has awaited every stage with the base chunk.
import { ST } from './crystalstages.js';
import { createCrystalAlive } from './crystalalive.js';
import { createCaveLife } from './cavelifelive.js';
import { createCrystalMood } from './crystalmood.js';
import { createCaveErrandLive } from './crystalerrandlive.js';
import { createCrystalVoice } from './crystalvoice.js'; // beauty pass 9: the cave answers her voice and moves

Object.assign(ST, { story: Object.freeze({ createCrystalAlive, createCaveLife, createCrystalMood, createCaveErrandLive, createCrystalVoice }) });
