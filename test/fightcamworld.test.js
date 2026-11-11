import { fightCameraSuite, rest } from './helpers/fightcamworld.js';

// The fight camera against the REAL built territories: wherever along an
// intruder's route a fight can happen, the camera it picks sees both cats
// past every tree, on a phone held either way and on a desktop. The checks
// and each mode's pinned counts are in test/helpers/fightcamworld.js; this
// file runs every area that has no fightcamworld.<area>.test.js of its own
// (today: the Woods).
fightCameraSuite(rest());
