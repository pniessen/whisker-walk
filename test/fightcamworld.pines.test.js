import { fightCameraSuite, SPLIT } from './helpers/fightcamworld.js';

// fightcamworld.test.js's fight-camera checks for the Pines and the Gorge, in their own
// file so the areas run in parallel (see test/helpers/fightcamworld.js).
fightCameraSuite(SPLIT.pines);
