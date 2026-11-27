// Stage "hill" of the Moon (see moonstages.js).
import { ST } from './moonstages.js';
import { drawWing } from './moonwing.js';
import { createStarLive } from './moonstarlive.js';

Object.assign(ST, { drawWing, createStarLive });
