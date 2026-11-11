import { fightCameraSuite, SPLIT } from './helpers/fightcamworld.js';

// fightcamworld.test.js's fight-camera checks for moor, in their own file so the
// areas run in parallel (see test/helpers/fightcamworld.js).
fightCameraSuite(SPLIT.moor);
