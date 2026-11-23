// The parts of a walk that start-up never needs: weather, the friends' ghosts, the yard dog, the kitten,
// the race and the strip tiles. They are one lazy chunk, fetched beside a place's own chunk (world/areas.js puts it in every
// pack's `life.walk`), so the first screen does not carry them. walk.js reads them from there when a walk
// starts; nothing else imports this file.
export { rollWeather, createWeather, rainPuddleSpots } from '../weather.js';
export { rollGhosts, createGhosts } from '../ghosts.js';
export { createYardDog } from '../yarddog.js';
export { kittenPlan, createKittenEncounter } from '../kitten.js';
export { raceCourse, createRace } from '../race.js';
export { createStripTiles } from '../render/striptiles.js';
