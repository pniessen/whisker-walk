// Stage "hill" of the Moon (see moonstages.js).
import { ST } from './moonstages.js';
import { drawWing } from './moonwing.js';
import { createStarLive } from './moonstarlive.js';
import { createRobotsLive } from './moonrobotslive.js';


Object.assign(ST, { drawWing, createStarLive, createRobotsLive });

const D = (a) => (a * Math.PI) / 180;

// Star Hill (the observatory at -38, -32): the Star Table's yard, a tool rack and solar panels for the dome, lamps along the way.
export const HILL_ROWS = Object.freeze([
  ['solar', -48, -26, D(80), 0], ['solar', -48, -22, D(80), 0], ['crate', -31.5, -22, 0.3, 0], ['crate', -30.4, -22.6, 1.1, 1], ['tank', -24, -20, 0, 0],
  ['antenna', -49, -37, 0, 0], ['dish', -47, -40, D(30), 0], ['rack', -26, -29.6, D(10), 0], ['lamp', -24.4, -26.4, 0, 0], ['lamp', -29.6, -26.4, 0, 0],
  ['sign', -29, -34, D(250), 0], ['beacon', -45, -30, 0, 0], ['flag', -33, -24, 0, 1], ['wreck', -50, -44, 1.2, 0], ['pod', -42, -46, D(20), 1],
  ['trail', -27, -27, -31.5, -29], ['trail', -31.5, -29, -35, -33.5], ['cable', -28.5, -23.5, -32, -22.6], ['cable', -48, -24, -46, -29],
]);
ST.decorRows = { ...ST.decorRows, hill: HILL_ROWS };
