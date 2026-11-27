// Stage "rover" of the Moon (see moonstages.js).
import { ST } from './moonstages.js';
import './moondecorbase.js';
import { drawRoverCourse } from './moonroverparts.js';
import { drawMassif, drawCave, drawFill, drawLavaKit } from './moonlavaparts.js';
import { createRoverLive } from './moonroverlive.js';
import { createJobLive } from './moonjoblive.js';


Object.assign(ST, { drawRoverCourse, drawMassif, drawCave, drawFill, drawLavaKit, createRoverLive, createJobLive });

const D = (a) => (a * Math.PI) / 180;

// The Rover course (the depot at 22, 40; the track; the Far Beacon at 46, 0): the shed's yard, charging kit, and the beacon's field.
export const ROVER_ROWS = Object.freeze([
  ['crate', 26.4, 44.4, 0.3, 0], ['crate', 27.6, 45.2, 0.9, 1], ['tank', 20, 46.6, 0, 0], ['rack', 24.6, 45.4, D(180), 0], ['solar', 20.5, 33, D(10), 0], ['solar', 24, 31.2, D(10), 0],
  ['antenna', 18.6, 38.6, 0, 0], ['lamp', 26.8, 36.2, 0, 0], ['lamp', 33.6, 40.6, 0, 0], ['sign', 25.6, 34.4, D(300), 1], ['beacon', 36, 35, 0, 0], ['flag', 33, 31, 0, 1],
  ['pod', 36.4, 42.4, D(80), 0], ['wreck', 34.4, 49, 0.8, 0],
  ['tank', 49.6, 5.6, 0, 0], ['crate', 49.4, -4.6, 0.4, 1], ['solar', 50, 9.6, D(90), 0], ['lamp', 49.6, -1.4, 0, 0], ['sign', 42.6, 4.6, D(120), 0], ['antenna', 51, -8, 0, 0],
  ['trail', 31, 38, 26.5, 40.2], ['trail', 28, 36, 26, 33.6], ['trail', 41, 19, 42, 12], ['trail', 42.3, 10, 42.5, 3.6],
  ['cable', 25.8, 36.4, 27, 39.6], ['cable', 20.6, 34.5, 20.6, 39.4], ['cable', 49.6, 7, 49.6, 4], ['cable', 47.4, 1.4, 49.2, -0.6],
]);
ST.decorRows = { ...ST.decorRows, rover: ROVER_ROWS };
