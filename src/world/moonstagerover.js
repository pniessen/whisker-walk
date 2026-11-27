// Stage "rover" of the Moon (see moonstages.js).
import { ST } from './moonstages.js';
import { drawRoverCourse } from './moonroverparts.js';
import { drawMassif, drawCave, drawFill, drawLavaKit } from './moonlavaparts.js';
import { createRoverLive } from './moonroverlive.js';
import { createJobLive } from './moonjoblive.js';

Object.assign(ST, { drawRoverCourse, drawMassif, drawCave, drawFill, drawLavaKit, createRoverLive, createJobLive });
