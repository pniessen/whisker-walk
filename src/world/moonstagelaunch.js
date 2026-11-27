// Stage "launch" of the Moon (see moonstages.js).
import { ST } from './moonstages.js';
import { drawLaunchStanding, drawLaunchWing } from './moonlaunchparts.js';
import { drawBeams, drawLane } from './moonjumpparts.js';
import { drawRifts, drawRingPosts } from './moonboundparts.js';
import { createLaunchLive } from './moonlaunchlive.js';
import { createJumpLive } from './moonjumplive.js';
import { createBoundLive } from './moonboundlive.js';

Object.assign(ST, { drawLaunchStanding, drawLaunchWing, drawBeams, drawLane, drawRifts, drawRingPosts, createLaunchLive, createJumpLive, createBoundLive });
